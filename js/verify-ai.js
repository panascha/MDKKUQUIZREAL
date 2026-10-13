// verify-ai.js — นักเรียนกด "ตรวจเฉลยด้วย AI" (2 โมเดล + ผู้ตัดสิน) → GAS action 'verifyQuestionStudent'
// ส่งแค่ qid; backend โหลดโจทย์เองและแคชผลไว้ (ผลที่แคชไม่นับโควต้า)
// แสดงเฉพาะหลังตอบข้อนี้แล้ว (spoiler guard) และเฉพาะข้อที่ไม่มีรูป; ต้องล็อกอิน

window._aiVerifyMemo = window._aiVerifyMemo || {};
window._aiVerifyBlocked = window._aiVerifyBlocked || {}; // qid ที่ backend ตอบ not_verifiable
window._aiVerifyBusy = false;

window._aivEsc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

window._aivLetter = function (i) {
    return String.fromCharCode(65 + Number(i));
};

window.renderAiVerifyPanel = function () {
    const q = window.APP.current_question;
    const $panel = $('#ai-verify-panel');
    const revealed = q && q.questionId !== undefined && (q.state || window.APP.isShowingAllAnswers);
    const hasImg = q && q.img && String(q.img).trim();
    if (!revealed || hasImg || window._aiVerifyBlocked[q.questionId]) {
        $panel.hide().empty();
        return;
    }
    const memo = window._aiVerifyMemo[q.questionId];
    if (memo) {
        $panel.html('<div class="aiv-result"></div>').show();
        window.renderAiVerifyResult(memo);
        return;
    }
    $panel.html(
        '<button type="button" id="ai-verify-btn" class="aiv-btn">🤖 ตรวจเฉลยด้วย AI (2 โมเดล + ผู้ตัดสิน)</button>' +
        '<div class="aiv-hint">ใช้โควต้า AI ร่วมกัน · 5 ครั้ง/ชม.</div>' +
        '<div class="aiv-result"></div>'
    ).show();
};

window.runAiVerify = async function () {
    const q = window.APP.current_question;
    if (!q || window._aiVerifyBusy) return;
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อตรวจเฉลยด้วย AI');
        return;
    }
    window.logFeature && window.logFeature('ai_verify');
    const reqQid = q.questionId;
    const $btn = $('#ai-verify-btn');
    const $out = $('#ai-verify-panel .aiv-result');
    window._aiVerifyBusy = true;
    $btn.prop('disabled', true);
    $out.html('<div class="aiv-status"><i class="fas fa-spinner fa-spin"></i> AI กำลังถกเถียง… (อาจใช้ 30-90 วินาที)</div>');

    const stale = () => !window.APP.current_question || window.APP.current_question.questionId !== reqQid;
    const showErr = (msg) => { if (!stale()) { $out.html('<div class="aiv-status aiv-err">' + window._aivEsc(msg) + '</div>'); $btn.prop('disabled', false); } };

    try {
        const token = (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) || localStorage.getItem('mdkku_session_token');
        let res = null;
        for (let i = 0; i < 10; i++) {
            res = await window.sendWithRetry({ action: 'verifyQuestionStudent', sessionToken: token, qid: String(reqQid) }, 2);
            if (!res || res.result !== 'pending') break;
            await new Promise(r => setTimeout(r, (res.retryAfterSec || 8) * 1000));
        }
        if (!res || res.result === 'pending') { showErr('AI ยังประมวลผลอยู่ ลองกดใหม่อีกครั้งในอีกสักครู่'); return; }
        if (res.result === 'success') {
            window._aiVerifyMemo[reqQid] = res;
            if (!stale()) window.renderAiVerifyResult(res);
            return;
        }
        const m = res.message;
        if (m === 'session_expired') { if (!stale()) { $out.empty(); $btn.prop('disabled', false); window.showGoogleSignInModal('เข้าสู่ระบบเพื่อตรวจเฉลยด้วย AI'); } }
        else if (m === 'rate_limited') showErr('ใช้ครบ 5 ครั้ง/ชม. แล้ว (ผลที่มีในแคชยังเปิดได้)');
        else if (m === 'budget_exhausted') showErr('โควต้า AI รวมของวันนี้หมดแล้ว ลองใหม่พรุ่งนี้');
        else if (m === 'not_verifiable') {
            window._aiVerifyBlocked[reqQid] = true;
            if (!stale()) $('#ai-verify-panel').html('<div class="aiv-status">ข้อนี้มีรูปภาพ ตรวจด้วย AI ไม่ได้</div>');
        }
        else if (m === 'ai_failed') showErr(res.detail || 'AI ตรวจไม่สำเร็จ');
        else showErr('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } catch (e) {
        showErr('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
        window._aiVerifyBusy = false;
    }
};

// หมายเหตุ: ใช้ res.choices จาก server เสมอ — ลำดับตัวเลือกฝั่ง client อาจถูกสุ่ม
window.renderAiVerifyResult = function (res) {
    const esc = window._aivEsc, L = window._aivLetter;
    const v = res.verified || {};
    const choices = res.choices || [];
    const md = (t) => window.renderMarkdownSafe(t || '');
    const chTxt = (i) => esc(L(i) + '. ' + (choices[i] != null ? choices[i] : ''));

    let badge;
    if (res.verdictTag === 'matches_db') {
        badge = '<div class="aiv-badge aiv-badge-ok">✅ AI ยืนยันว่าตรงกับเฉลย (' + chTxt(res.dbAnswerIndex) + ')</div>';
    } else if (res.verdictTag === 'disagrees_db') {
        badge = '<div class="aiv-badge aiv-badge-warn">⚠️ AI เห็นต่างจากเฉลยในระบบ — ตรวจสอบกับอาจารย์/ตำรา<br>' +
            'เฉลยในระบบ: ' + chTxt(res.dbAnswerIndex) + '<br>AI เห็นว่า: ' + chTxt(v.verifiedAnswer) + '</div>';
    } else {
        badge = '<div class="aiv-badge aiv-badge-grey">❔ ตรวจไม่สำเร็จ ยังสรุปไม่ได้</div>';
    }

    const solverTints = ['aiv-card-a', 'aiv-card-b'];
    let cards = (v.solvers || []).map(function (s, i) {
        return '<div class="aiv-card ' + solverTints[i % 2] + '"><b>โมเดล ' + (i % 2 ? 'B' : 'A') + ' · ' + esc(s.model) + '</b>' +
            '<div>เลือก: ' + chTxt(s.choice) + '</div><div class="aiv-md">' + md(s.rationale) + '</div></div>';
    }).join('');
    cards += (v.solverErrors || []).map(function (e) {
        return '<div class="aiv-card aiv-card-fail"><b>' + esc(e.model) + '</b> ล้มเหลว: ' + esc(e.error) + '</div>';
    }).join('');

    if (v.judgeUsed && v.confidence === 'debate-resolved') {
        const dist = Object.keys(v.distractors || {}).map(function (k) {
            return '<li>' + esc(L(k)) + ': ' + esc(v.distractors[k]) + '</li>';
        }).join('');
        cards += '<div class="aiv-card aiv-card-arb"><b>ผู้ตัดสิน · ' + esc(v.judgeModel || '') + '</b>' +
            (v.judgeConfidence ? ' <span class="aiv-conf">ความมั่นใจ: ' + esc(v.judgeConfidence) + '</span>' : '') +
            '<div>ตัดสิน: ' + chTxt(v.verifiedAnswer) + '</div><div class="aiv-md">' + md(v.rationale) + '</div>' +
            (dist ? '<ul class="aiv-dist">' + dist + '</ul>' : '') + '</div>';
    } else if (res.verdictTag !== 'inconclusive' && v.confidence === 'solver-consensus-unjudged') {
        cards += '<div class="aiv-card aiv-card-fail">Arbiter ล่ม — ตัดสินจากโมเดลทั้งสองที่เห็นตรงกันเท่านั้น</div>';
    }

    const foot = (res.cached ? '<div class="aiv-foot">ผลจากแคช · ตรวจเมื่อ ' + esc(new Date(res.verifiedAt).toLocaleString('th-TH')) + '</div>' : '') +
        '<div class="aiv-foot">AI อาจผิด — ใช้ประกอบการตัดสินใจ ไม่ใช่เฉลยทางการ</div>';
    const reportBtn = res.verdictTag === 'disagrees_db'
        ? '<button type="button" id="ai-verify-report-btn" class="aiv-btn aiv-btn-sm">แจ้งเฉลยผิด</button>' : '';

    $('#ai-verify-panel .aiv-result').html(
        '<details open><summary>ผลตรวจด้วย AI</summary>' + badge + cards + reportBtn + foot + '</details>'
    );
    $('#ai-verify-btn').prop('disabled', false);
    if (typeof window.renderAllMath === 'function') window.renderAllMath();
};

(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[AiVerify] window.showQuestion not found at hook time — panel will not render');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        window.renderAiVerifyPanel();
    };
})();

$(function () {
    $('#ai-verify-panel').on('click', '#ai-verify-btn', window.runAiVerify);
    // ปุ่มแจ้งเฉลยผิด: เปิด modal รายงานเดิม + เติมข้อความให้ (นักเรียนกดส่งเอง ไม่ auto-report)
    $('#ai-verify-panel').on('click', '#ai-verify-report-btn', function () {
        const q = window.APP.current_question;
        const res = q && window._aiVerifyMemo[q.questionId];
        if (!res) return;
        window.openReportModal(q);
        const v = res.verified || {};
        const ch = res.choices || [];
        $('#report_text').val('AI ตรวจแล้วเห็นต่างจากเฉลย: เฉลยในระบบ = ' + (ch[res.dbAnswerIndex] || '') + ' / AI เห็นว่า = ' + (ch[v.verifiedAnswer] || ''));
    });
});
