// js/discussion.js — Feature 5: Peer Discussion Thread (per-question)
// แผงพับได้ใต้คำถาม: (1) ประวัติรายงาน (2) ประวัติการแก้ไข (3) กระทู้พูดคุย + ฟอร์มโพสต์
// อ่าน = getDiscussion (public, lazy ตอนกางแผง); เขียน = postComment/deleteComment (ต้องล็อกอิน KKU)
// backend ไม่คืนอีเมลกลับมา — ปุ่มลบของตัวเองตัดสินจาก tag 4 ตัว (SHA-256 อีเมลของเรา ตรงกับ tag ของ comment)
// server บังคับสิทธิ์จริงด้วยอีเมลอยู่แล้ว → tag ชนกัน (1/65536) ลบไม่ผ่านฝั่ง server อยู่ดี

// state ต่อ 1 คำถาม — reset ทุกครั้งที่เปลี่ยนข้อ (showQuestion hook)
window._discState = { qid: null, loaded: false, loading: false };
window._discMyTag = null; // tag 4 ตัวของผู้ใช้ปัจจุบัน (null = คำนวณไม่ได้/ยังไม่ล็อกอิน → ไม่โชว์ปุ่มลบของตัวเอง)

window.DISC_MAX_CHARS = 500;

// Item 2: ป้ายกำกับ (chip) เลือกได้ 1 อัน + ช่องอ้างอิง — encode ลงใน text (backend ไม่แตะ, Tag column = email-hash ห้ามใช้)
// ⚠️ append-only: ห้ามเปลี่ยน/ลบ label เดิม ไม่งั้น comment เก่าที่โพสต์ด้วย label นั้นจะ render เป็น "[label] " ดิบ
window.DISC_CHIPS = ['🔬 กลไก', '📚 แนวทาง', '❓ สงสัยเฉลย', '📝 โจทย์พิมพ์ผิด'];
window.DISC_CHIP_SET = new Set(window.DISC_CHIPS); // gate การ parse ให้ render pill เฉพาะ label ที่รู้จัก
// regex assemble/parse ต้องตรงกันเป๊ะ (Commit C summarizer ก็ reuse ตัวนี้ strip marker ก่อนส่ง AI)
window.DISC_CHIP_RE = /^\[(.+?)\]\s/;              // prefix chip:  "[🔬 กลไก] "
window.DISC_REF_RE = /\n📖 อ้างอิง: (.+)$/;       // suffix อ้างอิง (บรรทัดเดียว, ต่อท้ายสุด): "\n📖 อ้างอิง: ..."

// ประกอบข้อความสุดท้ายที่จะส่ง (chip prefix + ข้อความ + ref suffix). ใช้ทั้งตอนนับตัวอักษรและตอนส่ง
window.discAssembleText = function () {
    const chip = ($('.disc-chip.active').attr('data-label') || '').trim();
    const text = ($('#disc-textarea').val() || '').trim();
    const ref = ($('#disc-ref').val() || '').trim();
    return (chip ? `[${chip}] ` : '') + text + (ref ? `\n📖 อ้างอิง: ${ref}` : '');
};

// นับความยาว "สตริงที่ประกอบแล้ว" เทียบ 500 (chip+ref กินโควตาด้วย) — เกินให้ counter แดง
window.discUpdateCounter = function () {
    const len = window.discAssembleText().length;
    const $c = $('#disc-counter');
    $c.text(`${len}/${window.DISC_MAX_CHARS}`);
    $c.toggleClass('over', len > window.DISC_MAX_CHARS);
};

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

    // Item 1: badge ประวัติการแก้ไขบน header (ปรากฏหลังกางแผงครั้งแรกที่โหลด revisions มา) — reset ล้างตอนเปลี่ยนข้อ
    const revCount = (data.revisions || []).length;
    const $revBadge = $('#disc-rev-badge');
    if (revCount) $revBadge.html('<i class="fas fa-pen"></i> เคยแก้เฉลย').show();
    else $revBadge.hide().empty();

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
            // Item 4: ปุ่มตอบกลับ — prefill textarea ด้วย @nick #tag (1 ระดับ ไม่มี thread)
            const replyBtn = `<button class="disc-reply-btn" data-nick="${window.discEscape(c.nickname)}" data-tag="${window.discEscape(c.tag)}" title="ตอบกลับ"><i class="fas fa-reply"></i></button>`;
            // Item 2: แกะ chip prefix (เฉพาะ label ที่รู้จัก) + ref suffix ออกจาก text; ที่เหลือ = ข้อความปกติ (fallback = ทั้งก้อน)
            let body = String(c.text == null ? '' : c.text);
            let chipHtml = '', refHtml = '';
            const cm = body.match(window.DISC_CHIP_RE);
            if (cm && window.DISC_CHIP_SET.has(cm[1])) {
                chipHtml = `<span class="disc-chip-pill">${window.discEscape(cm[1])}</span>`;
                body = body.slice(cm[0].length);
            }
            const rm = body.match(window.DISC_REF_RE);
            if (rm) {
                refHtml = `<div class="disc-ref-line"><i class="fas fa-book"></i> อ้างอิง: ${window.discEscape(rm[1].trim())}</div>`;
                body = body.slice(0, rm.index);
            }
            return `
            <div class="disc-comment">
                <div class="disc-comment-head">
                    <span class="disc-nick">${window.discEscape(c.nickname)} <span class="disc-tag">#${window.discEscape(c.tag)}</span></span>
                    <span class="disc-time">${window.discFormatTime(c.timestamp)}</span>
                    ${replyBtn}
                    ${delBtn}
                </div>
                ${chipHtml ? `<div class="disc-chip-row-view">${chipHtml}</div>` : ''}
                <div class="disc-comment-text">${window.discEscapeMultiline(body)}</div>
                ${refHtml}
            </div>`;
        }).join('');
    } else {
        commentsInner = '<div class="disc-empty">ยังไม่มีความคิดเห็น เป็นคนแรกที่พูดคุยเกี่ยวกับข้อนี้</div>';
    }

    // Item 3: ปุ่มสรุป AI — โผล่เมื่อมี comment ≥ 3 (login-gate ตอนคลิก); กล่องสรุปเรนเดอร์ตอนคลิก
    const summaryInner = (data.comments && data.comments.length >= 3)
        ? `<div class="disc-summary-wrap">
                <button type="button" id="disc-summary-btn" class="disc-summary-btn">✨ สรุปประเด็นด้วย AI</button>
                <div id="disc-summary-box" class="disc-summary-box" style="display:none;"></div>
            </div>`
        : '';

    // ฟอร์มโพสต์ — ล็อกอินแล้วเห็น nickname+textarea; ยังไม่ล็อกอินเห็นปุ่มเข้าสู่ระบบ
    const loggedIn = !!(window.EDIT_SESSION && window.EDIT_SESSION.isLoggedIn);
    let formInner;
    if (loggedIn) {
        const nick = window.discEscape(window.discGetNickname());
        const chipsHtml = window.DISC_CHIPS.map(lbl =>
            `<button type="button" class="disc-chip" data-label="${window.discEscape(lbl)}">${window.discEscape(lbl)}</button>`).join('');
        formInner = `
            <div class="disc-form">
                <input type="text" id="disc-nickname" class="disc-nickname-input" maxlength="40" placeholder="ชื่อที่จะแสดง" value="${nick}">
                <div class="disc-chip-row">${chipsHtml}</div>
                <textarea id="disc-textarea" class="disc-textarea" maxlength="${window.DISC_MAX_CHARS}" placeholder="พิมพ์ความคิดเห็น... (เช่น อาจารย์ใช้เฉลยปีเก่าหรือเปล่า)"></textarea>
                <input type="text" id="disc-ref" class="disc-ref-input" maxlength="200" placeholder="อ้างอิง (ไม่บังคับ) เช่น Costanzo p.120">
                <div class="disc-form-foot">
                    <span id="disc-counter" class="disc-counter">0/${window.DISC_MAX_CHARS}</span>
                    <button id="disc-submit" class="quiz-button"><i class="fas fa-paper-plane"></i> ส่งความคิดเห็น</button>
                </div>
            </div>`;
    } else {
        formInner = `
            <div class="disc-login-prompt">
                <div class="disc-login-text"><i class="fas fa-comments"></i> เข้าสู่ระบบด้วยบัญชี KKU เพื่อร่วมพูดคุยและแสดงความคิดเห็น</div>
                <button id="disc-login-btn" class="disc-login-btn"><i class="fas fa-sign-in-alt me-1"></i> เข้าสู่ระบบ</button>
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
        <div class="disc-comments">${summaryInner}${commentsInner}</div>
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
    const rawText = ($('#disc-textarea').val() || '').trim();
    if (!rawText) { window.bgToast.fire({ icon: 'warning', title: 'พิมพ์ความคิดเห็นก่อนส่ง' }); return; }
    // Item 2: cap นับสตริงที่ประกอบแล้ว (chip+ref กินโควตา) — ต้องตรงกับที่ backend เช็ค (pcText.trim().length)
    const text = window.discAssembleText();
    if (text.length > window.DISC_MAX_CHARS) { window.bgToast.fire({ icon: 'warning', title: `ยาวเกิน ${window.DISC_MAX_CHARS} ตัวอักษร (รวมป้ายกำกับและอ้างอิง)` }); return; }
    if (nickname) { try { localStorage.setItem('mdkku_disc_nickname', nickname); } catch (e) { } }

    const $btn = $('#disc-submit').prop('disabled', true);
    try {
        const res = await window.sendWithRetry({
            action: 'postComment', sessionToken: window.EDIT_SESSION.sessionToken,
            qid: qid, nickname: nickname, text: text
        });
        if (res && res.result === 'success') {
            $('#disc-textarea').val('');
            $('#disc-ref').val('');
            $('.disc-chip.active').removeClass('active');
            window.discUpdateCounter();
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

// Item 4: ตอบกลับ 1 ระดับ — prefill textarea + focus + scroll. ยังไม่ล็อกอิน → เด้ง sign-in (textarea ยังไม่มี)
window.discReplyPrefill = function (nick, tag) {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อตอบกลับ');
        return;
    }
    const $ta = $('#disc-textarea');
    if (!$ta.length) return;
    const mention = '@' + (nick || '') + ' #' + (tag || '') + ' ';
    const cur = $ta.val() || '';
    $ta.val(cur.indexOf(mention) === 0 ? cur : mention + cur);
    window.discUpdateCounter();
    $ta[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    $ta.trigger('focus');
};

// ── Item 3: สรุปประเด็นด้วย AI (IntelSphere flash, memo ต่อข้อ) ──────────────
window._discSummaryCache = window._discSummaryCache || {};

// เลือกโมเดล flash ราคาถูกจาก catalog เท่านั้น — ห้าม fallback ไป pickAutoModel (deepseek-v4-pro = แพง)
// null = โหลด catalog ไม่ทัน/ไม่มี flash → caller ปิดปุ่ม (ไม่ยิง network)
window.discResolveFlashModel = async function () {
    const FLASH = [/gemini-.*flash-lite/, /gemini-.*flash/, /claude-haiku/, /deepseek-.*flash/];
    function pick() {
        const cat = window._chatbotCatalog;
        if (!cat) return null;
        const ids = [];
        Object.keys(cat).forEach(p => (cat[p] || []).forEach(id => ids.push(id)));
        for (let i = 0; i < FLASH.length; i++) {          // pattern-major → flash-lite ชนะ flash
            for (let j = 0; j < ids.length; j++) {
                if (FLASH[i].test(ids[j])) return ids[j];
            }
        }
        return null;
    }
    let m = pick();
    if (m) return m;
    // catalog ยังไม่มา → โหลดครั้งเดียว (catalog มาแล้วแต่ไม่มี flash → refetch ก็ไม่ช่วย)
    if (!window._chatbotCatalog && typeof window.loadChatbotModelCatalog === 'function') {
        await window.loadChatbotModelCatalog();
        m = pick();
    }
    return m;
};

// ประกอบ prompt: strip marker item-2 (chip/ref) + URL + <svg> ออกจากแต่ละ comment; เอา ~40 อันล่าสุด
window.discBuildSummaryPrompt = function (comments) {
    const lines = comments.slice(-40).map(function (c) {
        let t = String(c.text == null ? '' : c.text);
        t = t.replace(window.DISC_CHIP_RE, '');               // chip prefix
        t = t.replace(window.DISC_REF_RE, '');                // ref suffix
        t = t.replace(/https?:\/\/\S+/g, '');                 // URL
        t = t.replace(/<svg[\s\S]*?<\/svg>/gi, '[รูปภาพ]');   // inline svg
        t = t.replace(/\s+/g, ' ').trim();
        return t ? ('- ' + t) : '';
    }).filter(Boolean);
    return 'ต่อไปนี้คือความคิดเห็นของนิสิตแพทย์ในกระทู้พูดคุยเกี่ยวกับข้อสอบข้อหนึ่ง:\n\n' +
        lines.join('\n') + '\n\n' +
        'ช่วยสรุปประเด็นสำคัญของการพูดคุยนี้เป็นภาษาไทย เป็น 3 หัวข้อ (bullet ขึ้นต้นด้วย -) สั้นกระชับ ' +
        'เน้นข้อถกเถียง ข้อสงสัยเรื่องเฉลย และข้อสรุปที่หลายคนเห็นตรงกัน (ถ้ามี). ' +
        'ตอบเฉพาะ 3 bullet เท่านั้น ไม่ต้องมีคำนำหรือคำท้าย';
};

window.discRenderSummaryBox = function (innerHtml) {
    $('#disc-summary-box').html(
        '<div class="disc-summary-head">' +
        '<span class="disc-summary-title"><i class="fas fa-wand-magic-sparkles"></i> สรุปโดย AI</span>' +
        '<button type="button" class="disc-summary-close" title="ปิด"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="disc-summary-body">' + innerHtml + '</div>'
    ).show();
};

window.discSummarizeAI = async function () {
    // login-gate: guest ยิงจะไปกอง rate-limit bucket "guest_user" เดียวกันทั้งเว็บ (15/ชม.) → เด้ง sign-in
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn || !window.EDIT_SESSION.sessionToken) {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อสรุปประเด็นด้วย AI');
        return;
    }
    const qid = window._discState.qid;
    const data = window._discData || { comments: [] };
    const comments = data.comments || [];
    if (comments.length < 3) return;

    // cache key monotonic: length เปลี่ยนตอน add/delete; timestamp ตัวสุดท้ายกัน delete+repost (length เท่าเดิม)
    const last = comments[comments.length - 1];
    const cacheKey = comments.length + '|' + (last && last.timestamp);
    const cached = window._discSummaryCache[qid];
    if (cached && cached.key === cacheKey) { window.discRenderSummaryBox(cached.html); return; }

    const $btn = $('#disc-summary-btn');
    const model = await window.discResolveFlashModel();
    if (!model) {   // ไม่มี flash → ปิดปุ่ม ไม่ยิง (กัน deepseek-v4-pro cost bug)
        $btn.prop('disabled', true).attr('title', 'ยังโหลดโมเดลไม่เสร็จ');
        window.bgToast.fire({ icon: 'warning', title: 'ยังโหลดโมเดลไม่เสร็จ ลองใหม่ภายหลัง' });
        return;
    }

    $btn.prop('disabled', true);
    $('#disc-summary-box').show().html('<div class="disc-summary-loading"><i class="fas fa-spinner fa-spin"></i> กำลังสรุป…</div>');
    try {
        const res = await window.sendWithRetry({
            action: 'askAIExpert', provider: 'IntelSphere',
            prompt: window.discBuildSummaryPrompt(comments),
            model: model, sessionToken: window.EDIT_SESSION.sessionToken
        });
        // ข้อเปลี่ยนระหว่างรอ network → ทิ้งผล (กัน summary ข้อเก่า render ทับ panel ข้อใหม่ — เหมือน loadDiscussion)
        if (window._discState.qid !== qid) return;
        if (res && res.result === 'success') {
            const html = window.renderMarkdownSafe(res.answer);   // - ... → <ul><li>, escaped-by-construction
            window._discSummaryCache[qid] = { key: cacheKey, html: html };
            window.discRenderSummaryBox(html);
        } else {
            $('#disc-summary-box').html('<div class="disc-summary-err">สรุปไม่สำเร็จ ลองใหม่อีกครั้ง</div>');
        }
    } catch (e) {
        if (window._discState.qid === qid) $('#disc-summary-box').html('<div class="disc-summary-err">สรุปไม่สำเร็จ ลองใหม่อีกครั้ง</div>');
    } finally {
        $btn.prop('disabled', false);   // ปุ่มอาจถูก re-render ไปแล้ว → jQuery no-op
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
    $('#disc-rev-badge').hide().empty();
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

    // char counter — นับสตริงที่ประกอบแล้ว (textarea + chip + ref). delegated เพราะ form ถูกสร้างใหม่ทุก render
    $(document).on('input', '#disc-textarea, #disc-ref', window.discUpdateCounter);

    // Item 2: chip เลือกได้ทีละ 1 (คลิกซ้ำ = ยกเลิก) → อัปเดต counter
    $(document).on('click', '.disc-chip', function () {
        const wasActive = $(this).hasClass('active');
        $('.disc-chip').removeClass('active');
        if (!wasActive) $(this).addClass('active');
        window.discUpdateCounter();
    });

    $(document).on('click', '#disc-submit', window.discPostComment);
    $(document).on('click', '#disc-login-btn', function () {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อแสดงความคิดเห็น');
    });
    $(document).on('click', '.disc-del-btn', function () {
        window.discDeleteComment($(this).attr('data-timestamp'));
    });
    $(document).on('click', '.disc-reply-btn', function () {
        window.discReplyPrefill($(this).attr('data-nick'), $(this).attr('data-tag'));
    });

    // Item 3: สรุป AI + ปิด/พับกล่องสรุป (delegated — comments section สร้างใหม่ทุก render)
    $(document).on('click', '#disc-summary-btn', window.discSummarizeAI);
    $(document).on('click', '.disc-summary-close', function () {
        $('#disc-summary-box').hide().empty();
    });
    $(document).on('click', '.disc-summary-head', function (e) {
        if ($(e.target).closest('.disc-summary-close').length) return; // ปุ่มปิดจัดการเอง
        $(this).next('.disc-summary-body').slideToggle(120);
    });
});
