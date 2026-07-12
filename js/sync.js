// js/sync.js — ซิงค์ความคืบหน้าข้ามอุปกรณ์ (ต้องล็อกอินด้วยบัญชี KKU — Admin หรือ Student)
// Flow: saveProgressToCache (db.js) → markProgressDirty → flushProgressSync (debounced POST saveProgress)
// ตอนเปิดวิชา: checkCloudProgress ถูกเรียกจาก checkAndPromptRestoreProgress (app.js) — ถ้า cloud ใหม่กว่า local จะถามผู้ใช้

window._progressPending = null;   // { subject, state } ล่าสุดที่ยังไม่ได้อัปโหลด
window._lastProgressSync = 0;
window.PROGRESS_SYNC_INTERVAL_MS = 120000; // อัปโหลดไม่ถี่กว่า 2 นาที (ยกเว้น force)

window.markProgressDirty = function (subjectParam, state) {
    window._progressPending = { subject: subjectParam || 'default', state: state };
};

window.flushProgressSync = async function (force) {
    if (!window._progressPending) return;
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.sessionToken) return;
    if (!force && Date.now() - window._lastProgressSync < window.PROGRESS_SYNC_INTERVAL_MS) return;

    const pending = window._progressPending;
    window._progressPending = null;
    window._lastProgressSync = Date.now();
    try {
        const res = await window.sendWithRetry({
            action: 'saveProgress',
            sessionToken: window.EDIT_SESSION.sessionToken,
            subject: pending.subject,
            state: pending.state
        });
        if (res && res.result === 'stale') {
            // cloud มี state ที่ใหม่กว่า (เครื่องนี้ค้างจอไว้นาน) — ไม่ทับ ปล่อยให้ prompt ตอนเปิดวิชารอบหน้าจัดการ
            console.log('[sync] Cloud state newer — upload skipped');
        }
    } catch (err) {
        // ส่งไม่สำเร็จ → คืน pending ไว้รอรอบหน้า (ถ้ายังไม่มีอันใหม่กว่ามาแทน)
        window._progressPending = window._progressPending || pending;
        console.warn('[sync] saveProgress failed:', err);
    }
};

// รอให้ session resume (setupGoogleSSO ดีเลย์ 1.2s + roundtrip verifySession) เสร็จก่อนเช็ค cloud
// คืน true เมื่อมี sessionToken พร้อมใช้, false เมื่อไม่ได้ล็อกอิน/รอเกิน maxMs
window.waitForSyncSession = function (maxMs) {
    return new Promise(function (resolve) {
        if (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) return resolve(true);
        if (!localStorage.getItem('mdkku_session_token')) return resolve(false);
        let waited = 0;
        const iv = setInterval(function () {
            if (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) {
                clearInterval(iv);
                resolve(true);
            } else if ((waited += 200) >= maxMs) {
                clearInterval(iv);
                resolve(false);
            }
        }, 200);
    });
};

// เช็ค state บน cloud เทียบกับ local — คืน 'restored' เมื่อผู้ใช้เลือกใช้ของ cloud (เขียนลง IndexedDB ให้แล้ว)
window.checkCloudProgress = async function (subjectParam, sessionKey) {
    const hasSession = await window.waitForSyncSession(5000);
    if (!hasSession) return null;

    let res;
    try {
        res = await window.sendWithRetry({
            action: 'getProgress',
            sessionToken: window.EDIT_SESSION.sessionToken,
            subject: subjectParam || 'default'
        });
    } catch (err) {
        console.warn('[sync] getProgress failed:', err);
        return null;
    }
    if (!res || res.result !== 'success' || !res.state) return null;

    const local = await window.getCacheDB(sessionKey);
    const localTs = (local && local.timestamp) || 0;
    if ((res.timestamp || 0) <= localTs) return null; // local ใหม่กว่าหรือเท่ากัน → เงียบ

    const qStates = res.state.currentQuestionsState || [];
    const doneCount = qStates.filter(s => s.state).length;
    const agoMin = Math.max(1, Math.round((Date.now() - res.timestamp) / 60000));

    $('#loading-overlay').hide();
    const result = await Swal.fire({
        title: 'พบความคืบหน้าจากอุปกรณ์อื่น',
        html: `บันทึกล่าสุดเมื่อประมาณ ${agoMin} นาทีที่แล้ว (ทำไปแล้ว ${doneCount}/${qStates.length} ข้อ)<br>ต้องการทำต่อจากจุดนั้นหรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ทำต่อจากอุปกรณ์อื่น',
        cancelButtonText: 'ใช้ของเครื่องนี้',
        confirmButtonColor: '#1a73e8',
        allowOutsideClick: false
    });

    if (result.isConfirmed) {
        await window.setCacheDB(sessionKey, res.state);
        return 'restored';
    }

    // ผู้ใช้เลือกเครื่องนี้ → ดัน local ขึ้น cloud ทันทีด้วย timestamp ใหม่ (จะได้ไม่ถามซ้ำทุกครั้ง)
    if (local) {
        local.timestamp = Date.now();
        await window.setCacheDB(sessionKey, local);
        window.markProgressDirty(subjectParam || 'default', local);
        window.flushProgressSync(true);
    }
    return null;
};

// คู่มือการใช้งานซิงค์ข้ามอุปกรณ์ (เปิดจากลิงก์ในหน้าล็อกอิน และปุ่ม ? บนป้ายสถานะ)
window.showSyncHelpModal = function () {
    Swal.fire({
        title: '<i class="fas fa-cloud" style="color:#38bdf8;"></i> วิธีใช้การซิงค์ข้ามอุปกรณ์',
        html: `
            <div style="text-align: left; font-size: 1rem; line-height: 1.8;">
                <p><strong>ทำข้อสอบต่อจากที่ค้างไว้ ไม่ว่าจะเปิดจากมือถือหรือคอม</strong></p>
                <ol style="padding-left: 20px; margin: 10px 0;">
                    <li>กดปุ่มโลโก้ <strong>KKU</strong> (มุมขวาล่าง) แล้วล็อกอินด้วยบัญชี
                        <strong>@kkumail.com</strong> หรือ <strong>@kku.ac.th</strong></li>
                    <li>ทำข้อสอบตามปกติ — ระบบบันทึกความคืบหน้าให้อัตโนมัติ
                        (อัปโหลดทุก ~2 นาที และตอนสลับแอป/ปิดแท็บ)</li>
                    <li>ที่เครื่องอีกเครื่อง ล็อกอิน<strong>บัญชีเดียวกัน</strong>แล้วเปิดวิชาเดิม</li>
                    <li>ระบบจะถาม "พบความคืบหน้าจากอุปกรณ์อื่น" —
                        กด <strong>ทำต่อจากอุปกรณ์อื่น</strong> เพื่อทำต่อจากข้อที่ค้างไว้
                        หรือ <strong>ใช้ของเครื่องนี้</strong> เพื่อใช้ข้อมูลในเครื่องแทน</li>
                </ol>
                <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-top: 10px;">
                    <i class="fas fa-info-circle"></i> ความคืบหน้าแยกเก็บรายวิชา ·
                    ล็อกอินค้างไว้ได้สูงสุด 5 เครื่อง (เครื่องเก่าสุดจะหลุดเอง) ·
                    ถ้าไม่ล็อกอิน ข้อมูลยังบันทึกในเครื่องตามปกติ แต่จะไม่ซิงค์ข้ามอุปกรณ์
                </p>
            </div>
        `,
        confirmButtonText: 'เข้าใจแล้ว',
        width: 600
    }).then(function () {
        // เปิดจากหน้าล็อกอิน (Swal เปิดซ้อนไม่ได้ — หน้าล็อกอินถูกแทนที่) → พากลับไปล็อกอินต่อ
        if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) window.showGoogleSignInModal();
    });
};

// เรียกจาก auth-edit.js หลังล็อกอิน/กู้ session สำเร็จ — ดัน state ที่ค้างอยู่ขึ้นทันที
window.onSyncSessionReady = function () {
    window.flushProgressSync(true);
};

// Triggers (แบบเดียวกับ flushActivityLog ใน api.js): เช็คทุก 30s (throttle จริงใน flush),
// อัปโหลดทันทีเมื่อซ่อนแท็บ/ปิดหน้า
setInterval(function () { window.flushProgressSync(false); }, 30000);
window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') window.flushProgressSync(true);
});
window.addEventListener('beforeunload', function () { window.flushProgressSync(true); });
