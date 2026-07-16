// app-feedback.js — แจ้งปัญหา/เสนอฟีเจอร์ "ของตัวแอป" (คนละระบบกับ report.js ที่รายงานข้อสอบผิด)
// ส่งเข้า GAS action:'submitFeedback' (ชีต Feedback) — แผน: Idea/active/user-feedback-reporting.md
// anonymous ได้; ถ้า login อยู่ (EDIT_SESSION) ระบบแนบอีเมลให้ฝั่ง server เอง

// รูปที่แนบไว้ (base64 หลัง compress แล้ว, สูงสุด 2)
window._appFeedbackImages = [];

// UUID ประจำเครื่อง (persist ใน localStorage) — ใช้เป็น key rate-limit ตอนไม่ได้ login
window.getFeedbackClientId = function () {
    try {
        let cid = localStorage.getItem('mdkku_client_id');
        if (!cid) {
            cid = (crypto.randomUUID && crypto.randomUUID()) ||
                (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
            localStorage.setItem('mdkku_client_id', cid);
        }
        return cid;
    } catch (e) {
        return 'no-storage';
    }
};

// เปิด modal — fromQuiz = true (ปุ่มในหน้าทำข้อสอบ) จะแนบ questionId ปัจจุบันให้อัตโนมัติ
window.openAppFeedbackModal = function (fromQuiz) {
    window._appFeedbackFromQuiz = !!fromQuiz;
    const qidNote = document.getElementById('app-feedback-qid-note');
    if (qidNote) {
        const qid = fromQuiz && window.APP.current_question && window.APP.current_question.questionId;
        qidNote.style.display = qid ? 'block' : 'none';
        if (qid) qidNote.textContent = 'แนบรหัสข้อสอบปัจจุบันให้อัตโนมัติ: ' + qid;
    }
    $('#app-feedback-modal-card').fadeIn(150);
};

window.closeAppFeedbackModal = function () {
    $('#app-feedback-modal-card').fadeOut(150);
};

// เพิ่มรูป: compress ก่อน (≤1280px ด้านยาวสุด, JPEG q0.8 — เกณฑ์ตามแผน) แล้วเก็บเข้าลิสต์
window.addAppFeedbackImage = async function (base64) {
    if (window._appFeedbackImages.length >= 2) {
        window.bgToast.fire({ icon: 'warning', title: 'แนบรูปได้สูงสุด 2 รูป' });
        return;
    }
    const compressed = await window.compressImage(base64, 1280, 1280, 0.8);
    window._appFeedbackImages.push(compressed);
    window.renderAppFeedbackPreviews();
};

window.removeAppFeedbackImage = function (idx) {
    window._appFeedbackImages.splice(idx, 1);
    window.renderAppFeedbackPreviews();
};

window.renderAppFeedbackPreviews = function () {
    const wrap = document.getElementById('app-feedback-previews');
    if (!wrap) return;
    wrap.innerHTML = window._appFeedbackImages.map((img, i) =>
        `<div style="position: relative; display: inline-block;">
            <img src="${img}" alt="แนบรูป ${i + 1}" style="width: 90px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-border);">
            <button type="button" onclick="window.removeAppFeedbackImage(${i})" title="ลบรูปนี้"
                style="position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; border-radius: 50%; border: none; background: #DC2626; color: #fff; cursor: pointer; font-size: 0.8rem; line-height: 1;">&times;</button>
        </div>`
    ).join('');
};

// อ่านไฟล์รูปจาก input/paste → data URI
window._appFeedbackReadFile = function (file) {
    if (!file || file.type.indexOf('image/') !== 0) return;
    const reader = new FileReader();
    reader.onload = (ev) => window.addAppFeedbackImage(ev.target.result);
    reader.readAsDataURL(file);
};

window.submitAppFeedback = async function () {
    const type = document.getElementById('app-feedback-type').value;
    const desc = document.getElementById('app-feedback-desc').value.trim();
    if (!desc) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกรายละเอียด', confirmButtonText: 'ตกลง' });
        return;
    }

    const qid = window._appFeedbackFromQuiz && window.APP.current_question && window.APP.current_question.questionId;
    const subjectSel = document.getElementById('subject-select');
    const context = {
        subject: (subjectSel && subjectSel.value) || '',
        questionId: qid || '',
        userAgent: navigator.userAgent,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        appVersion: (await window.getAppVersion()) || 'unknown',
        online: navigator.onLine
    };

    const payload = {
        action: 'submitFeedback',
        type: type,
        description: desc,
        context: JSON.stringify(context),
        images: window._appFeedbackImages,
        clientId: window.getFeedbackClientId(),
        sessionToken: (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) || ''
    };

    // เกณฑ์เดียวกับ server (1.5MB) — กันส่งไปโดนปัดตกเสียเวลา retry
    if (JSON.stringify(payload).length > 1572864) {
        Swal.fire({ icon: 'error', title: 'ข้อมูลใหญ่เกิน 1.5MB', text: 'กรุณาลบรูปภาพออกบางรูปแล้วลองใหม่', confirmButtonText: 'ตกลง' });
        return;
    }

    const btn = document.getElementById('app-feedback-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังส่ง...';
    try {
        const res = await window.sendWithRetry(payload);
        if (res && res.result === 'success') {
            window.closeAppFeedbackModal();
            document.getElementById('app-feedback-desc').value = '';
            window._appFeedbackImages = [];
            window.renderAppFeedbackPreviews();
            window.bgToast.fire({ icon: 'success', title: 'ส่งฟีดแบ็กแล้ว ขอบคุณครับ 💖' });
        } else {
            Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: (res && res.message) || 'กรุณาลองใหม่ภายหลัง', confirmButtonText: 'ตกลง' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่ภายหลัง', confirmButtonText: 'ตกลง' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งฟีดแบ็ก';
    }
};

// wiring ปุ่ม/อีเวนต์ทั้งหมดของ modal
$(document).ready(function () {
    $('#app-feedback-open-btn-home').on('click', () => window.openAppFeedbackModal(false));
    $('#app-feedback-close').on('click', window.closeAppFeedbackModal);
    $('#app-feedback-submit').on('click', window.submitAppFeedback);

    $('#app-feedback-attach-btn').on('click', () => $('#app-feedback-file-input').trigger('click'));
    $('#app-feedback-file-input').on('change', function () {
        Array.from(this.files || []).forEach(window._appFeedbackReadFile);
        this.value = '';
    });

    // วางรูปจาก clipboard ขณะ modal เปิดอยู่ (pattern เดียวกับ paste handler ของ DATABASE app.js)
    document.addEventListener('paste', function (e) {
        if (!$('#app-feedback-modal-card').is(':visible')) return;
        const items = (e.clipboardData || {}).items || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) {
                window._appFeedbackReadFile(items[i].getAsFile());
                e.preventDefault();
                break;
            }
        }
    });
});
