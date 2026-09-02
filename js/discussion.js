// js/discussion.js — Feature 5: Peer Discussion Thread (per-question)
// แผงพับได้ใต้คำถาม: (1) ประวัติรายงาน (2) ประวัติการแก้ไข (3) กระทู้พูดคุย + ฟอร์มโพสต์
// อ่าน = getDiscussion (public, lazy ตอนกางแผง); เขียน = postComment/deleteComment (ต้องล็อกอิน KKU)
// backend ไม่คืนอีเมลกลับมา — ปุ่มลบของตัวเองตัดสินจาก tag 4 ตัว (SHA-256 อีเมลของเรา ตรงกับ tag ของ comment)
// server บังคับสิทธิ์จริงด้วยอีเมลอยู่แล้ว → tag ชนกัน (1/65536) ลบไม่ผ่านฝั่ง server อยู่ดี

// state ต่อ 1 คำถาม — reset ทุกครั้งที่เปลี่ยนข้อ (showQuestion hook)
window._discState = { qid: null, loaded: false, loading: false };
window._discMyTag = null; // tag 4 ตัวของผู้ใช้ปัจจุบัน (null = คำนวณไม่ได้/ยังไม่ล็อกอิน → ไม่โชว์ปุ่มลบของตัวเอง)

window.DISC_MAX_CHARS = 500;

// escape ข้อความที่ผู้ใช้คนอื่นเขียน (nickname/text/report free-text) ก่อนใส่ .html() — plain text + \n→<br>
window.discEscape = function (s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
window.discEscapeMultiline = function (s) {
    return window.discEscape(s).replace(/\n/g, '<br>');
};

window.discFormatTime = function (ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};

// tag ของเรา: SHA-256(email แบบ trim/lowercase) → hex 4 ตัวแรก (mirror computeEmailTag_ ฝั่ง GAS)
// crypto.subtle มีเฉพาะ secure origin (ไม่มีบน file://) — degrade เป็น null = ไม่โชว์ปุ่มลบของตัวเอง (server ยังลบให้ผ่าน UI อื่นได้)
window.discComputeMyTag = async function () {
    try {
        const email = window.EDIT_SESSION && window.EDIT_SESSION.email;
        if (!email || !window.crypto || !window.crypto.subtle) return null;
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email).trim().toLowerCase()));
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        return hex.slice(0, 4);
    } catch (e) {
        return null;
    }
};

window.discGetNickname = function () {
    let nick = '';
    try { nick = localStorage.getItem('mdkku_disc_nickname') || ''; } catch (e) { }
    if (!nick && window.EDIT_SESSION) nick = window.EDIT_SESSION.displayName || '';
    return nick;
};

// ── โหลด/เรนเดอร์ ──────────────────────────────────────────

window.loadDiscussion = async function (qid) {
    // อ่าน/เขียน flag บน window._discState สด ๆ เสมอ — resetDiscussionPanel "แทนที่" object ทั้งก้อน
    // ถ้า capture reference ไว้ guard จะเช็ค object เก่าที่กำพร้า (qid ยังเป็นข้อเดิม) → render ข้อเก่าทับข้อใหม่
    if (window._discState.loading) return;
    window._discState.loading = true;
    $('#discussion-loading').show();
    $('#discussion-content').hide();
    try {
        window._discMyTag = await window.discComputeMyTag();
        const res = await window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getDiscussion&qid=${encodeURIComponent(qid)}&_=${Date.now()}`);
        // กันข้อเปลี่ยนไปแล้วระหว่างรอ network — ทิ้งผลถ้า qid ไม่ตรงข้อปัจจุบันแล้ว
        if (window._discState.qid !== qid) return;
        window._discData = (res && res.result === 'success') ? res : { comments: [], reports: [], revisions: [] };
        window._discState.loaded = true;
        window.renderDiscussion();
    } catch (e) {
        console.warn('[Discussion] load failed', e);
        $('#discussion-content').html('<div style="text-align:center; color:#dc2626; padding:12px;">โหลดไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</div>').show();
    } finally {
        $('#discussion-loading').hide();
        if (window._discState.qid === qid) window._discState.loading = false;
    }
};

window.renderDiscussion = function () {
    const data = window._discData || { comments: [], reports: [], revisions: [] };
    const isAdmin = !!(window.EDIT_SESSION && window.EDIT_SESSION.isLoggedIn && window.EDIT_SESSION.role && window.EDIT_SESSION.role !== 'Student');
    const myTag = window._discMyTag;

    // (1) ประวัติรายงาน (พับได้)
    let reportsInner = '';
    if (data.reports && data.reports.length) {
        reportsInner = data.reports.map(r => `
            <div class="disc-report-item">
                <div class="disc-report-meta">
                    <span class="disc-badge">โหวต ${parseInt(r.voteCount) || 0}</span>
                    <span class="disc-status">${window.discEscape(r.status)}</span>
                    <span class="disc-time">${window.discFormatTime(r.time)}</span>
                </div>
                ${r.reportDetail ? `<div class="disc-report-detail">${window.discEscapeMultiline(r.reportDetail)}</div>` : ''}
                ${r.suggestedAnswer ? `<div class="disc-report-suggest"><b>เฉลยที่เสนอ:</b> ${window.discEscape(r.suggestedAnswer)}</div>` : ''}
            </div>`).join('');
    } else {
        reportsInner = '<div class="disc-empty">ยังไม่มีรายงานสำหรับข้อนี้</div>';
    }

    // (2) ประวัติการแก้ไข (พับได้) — diff ประกอบฝั่ง server จากชุด label คงที่ → ปลอดภัย ไม่ต้อง escape
    let revsInner = '';
    if (data.revisions && data.revisions.length) {
        revsInner = data.revisions.map(v => `
            <div class="disc-rev-item">
                <span class="disc-time">${window.discFormatTime(v.time)}</span>
                <span class="disc-rev-diff">${window.discEscape(v.diff)}</span>
                <span class="disc-rev-admin">โดยผู้ดูแล</span>
            </div>`).join('');
    } else {
        revsInner = '<div class="disc-empty">ยังไม่มีการแก้ไขข้อนี้</div>';
    }

    // (3) กระทู้พูดคุย
    let commentsInner = '';
    if (data.comments && data.comments.length) {
        commentsInner = data.comments.map(c => {
            const canDelete = isAdmin || (myTag && c.tag === myTag);
            const delBtn = canDelete
                ? `<button class="disc-del-btn" data-timestamp="${window.discEscape(c.timestamp)}" title="ลบความคิดเห็น"><i class="fas fa-trash"></i></button>`
                : '';
            return `
            <div class="disc-comment">
                <div class="disc-comment-head">
                    <span class="disc-nick">${window.discEscape(c.nickname)} <span class="disc-tag">#${window.discEscape(c.tag)}</span></span>
                    <span class="disc-time">${window.discFormatTime(c.timestamp)}</span>
                    ${delBtn}
                </div>
                <div class="disc-comment-text">${window.discEscapeMultiline(c.text)}</div>
            </div>`;
        }).join('');
    } else {
        commentsInner = '<div class="disc-empty">ยังไม่มีความคิดเห็น เป็นคนแรกที่พูดคุยเกี่ยวกับข้อนี้</div>';
    }

    // ฟอร์มโพสต์ — ล็อกอินแล้วเห็น nickname+textarea; ยังไม่ล็อกอินเห็นปุ่มเข้าสู่ระบบ
    const loggedIn = !!(window.EDIT_SESSION && window.EDIT_SESSION.isLoggedIn);
    let formInner;
    if (loggedIn) {
        const nick = window.discEscape(window.discGetNickname());
        formInner = `
            <div class="disc-form">
                <input type="text" id="disc-nickname" class="disc-nickname-input" maxlength="40" placeholder="ชื่อที่จะแสดง" value="${nick}">
                <textarea id="disc-textarea" class="disc-textarea" maxlength="${window.DISC_MAX_CHARS}" placeholder="พิมพ์ความคิดเห็น... (เช่น อาจารย์ใช้เฉลยปีเก่าหรือเปล่า)"></textarea>
                <div class="disc-form-foot">
                    <span id="disc-counter" class="disc-counter">0/${window.DISC_MAX_CHARS}</span>
                    <button id="disc-submit" class="quiz-button"><i class="fas fa-paper-plane"></i> ส่งความคิดเห็น</button>
                </div>
            </div>`;
    } else {
        formInner = `
            <div class="disc-form">
                <button id="disc-login-btn" class="quiz-button" style="width:100%;"><i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบเพื่อแสดงความคิดเห็น</button>
            </div>`;
    }

    const html = `
        <div class="disc-sub">
            <div class="disc-sub-head"><i class="fas fa-chevron-right disc-sub-chev"></i> <i class="fas fa-flag"></i> ประวัติรายงาน <span class="disc-sub-count">${(data.reports || []).length}</span></div>
            <div class="disc-sub-body" style="display:none;">${reportsInner}</div>
        </div>
        <div class="disc-sub">
            <div class="disc-sub-head"><i class="fas fa-chevron-right disc-sub-chev"></i> <i class="fas fa-history"></i> ประวัติการแก้ไข <span class="disc-sub-count">${(data.revisions || []).length}</span></div>
            <div class="disc-sub-body" style="display:none;">${revsInner}</div>
        </div>
        <div class="disc-comments">${commentsInner}</div>
        ${formInner}`;

    $('#discussion-content').html(html).show();
};

// ── โพสต์ / ลบ ─────────────────────────────────────────────

window.discPostComment = async function () {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn || !window.EDIT_SESSION.sessionToken) {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อแสดงความคิดเห็น');
        return;
    }
    const qid = window._discState.qid;
    const nickname = ($('#disc-nickname').val() || '').trim();
    const text = ($('#disc-textarea').val() || '').trim();
    if (!text) { window.bgToast.fire({ icon: 'warning', title: 'พิมพ์ความคิดเห็นก่อนส่ง' }); return; }
    if (text.length > window.DISC_MAX_CHARS) { window.bgToast.fire({ icon: 'warning', title: `ยาวเกิน ${window.DISC_MAX_CHARS} ตัวอักษร` }); return; }
    if (nickname) { try { localStorage.setItem('mdkku_disc_nickname', nickname); } catch (e) { } }

    const $btn = $('#disc-submit').prop('disabled', true);
    try {
        const res = await window.sendWithRetry({
            action: 'postComment', sessionToken: window.EDIT_SESSION.sessionToken,
            qid: qid, nickname: nickname, text: text
        });
        if (res && res.result === 'success') {
            $('#disc-textarea').val('');
            window.bgToast.fire({ icon: 'success', title: 'ส่งความคิดเห็นแล้ว' });
            await window.loadDiscussion(qid); // reload กระทู้ (backend purge cache แล้ว)
        } else {
            Swal.fire('ส่งไม่สำเร็จ', (res && res.message) || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (e) {
        Swal.fire('ส่งไม่สำเร็จ', String((e && e.message) || e), 'error');
    } finally {
        $btn.prop('disabled', false);
    }
};

window.discDeleteComment = async function (timestamp) {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn || !window.EDIT_SESSION.sessionToken) {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อลบความคิดเห็น');
        return;
    }
    const confirm = await Swal.fire({
        title: 'ลบความคิดเห็นนี้?', icon: 'warning',
        showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#dc2626'
    });
    if (!confirm.isConfirmed) return;
    const qid = window._discState.qid;
    try {
        const res = await window.sendWithRetry({
            action: 'deleteComment', sessionToken: window.EDIT_SESSION.sessionToken,
            qid: qid, timestamp: timestamp
        });
        if (res && res.result === 'success') {
            window.bgToast.fire({ icon: 'success', title: 'ลบแล้ว' });
            await window.loadDiscussion(qid);
        } else {
            Swal.fire('ลบไม่สำเร็จ', (res && res.message) || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (e) {
        Swal.fire('ลบไม่สำเร็จ', String((e && e.message) || e), 'error');
    }
};

// ── Hook showQuestion: reset แผงทุกครั้งที่เปลี่ยนข้อ (decorator เดียวกับ similar.js/meq.js) ──
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[Discussion] window.showQuestion not found at hook time — discussion panel will not reset');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        window.resetDiscussionPanel();
    };
})();

window.resetDiscussionPanel = function () {
    const q = window.APP.current_question;
    const $panel = $('#discussion-panel');
    if (!q || q.questionId === undefined) { $panel.hide(); return; }
    // เรนเดอร์ซ้ำข้อเดิม (เช่น หลังโหวต/ตอบ) → คงแผงที่กางไว้ + draft ที่พิมพ์ + payload ที่โหลดแล้ว
    if (window._discState.qid === q.questionId) { $panel.show(); return; }
    // เปลี่ยนข้อจริง → reset: พับ + ล้าง + mark ยังไม่โหลด (lazy โหลดตอนกางเท่านั้น)
    window._discState = { qid: q.questionId, loaded: false, loading: false };
    $('#discussion-panel-body').hide();
    $('#discussion-panel-toggle-icon').removeClass('open');
    $('#discussion-content').hide().empty();
    $panel.show();
};

// ── Wiring ─────────────────────────────────────────────────
$(function () {
    // กาง/พับแผงหลัก → lazy โหลดครั้งแรก
    $('#discussion-panel-header').on('click', function () {
        const $body = $('#discussion-panel-body');
        if ($body.is(':visible')) {
            $body.slideUp(150);
            $('#discussion-panel-toggle-icon').removeClass('open');
        } else {
            $body.slideDown(150);
            $('#discussion-panel-toggle-icon').addClass('open');
            if (!window._discState.loaded && !window._discState.loading && window._discState.qid !== null) {
                window.loadDiscussion(window._discState.qid);
            }
        }
    });

    // กาง/พับ sub-section (รายงาน / การแก้ไข)
    $(document).on('click', '.disc-sub-head', function () {
        $(this).find('.disc-sub-chev').toggleClass('open');
        $(this).next('.disc-sub-body').slideToggle(150);
    });

    // char counter
    $(document).on('input', '#disc-textarea', function () {
        $('#disc-counter').text(`${this.value.length}/${window.DISC_MAX_CHARS}`);
    });

    $(document).on('click', '#disc-submit', window.discPostComment);
    $(document).on('click', '#disc-login-btn', function () {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อแสดงความคิดเห็น');
    });
    $(document).on('click', '.disc-del-btn', function () {
        window.discDeleteComment($(this).attr('data-timestamp'));
    });
});
