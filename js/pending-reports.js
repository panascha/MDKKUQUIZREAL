// js/pending-reports.js — ชุด "ข้อที่รอตรวจสอบ" (Pending Reported Questions review/vote set)
// โหมดตรวจ+โหวตเท่านั้น ไม่ให้คะแนน ไม่แตะ study-sets/wrong_history — เป็น community/crowdsource
// ข้อมูลใช้ window.APP.pendingReportsCache (เติมโดย window.fetchAllPendingVotesReports) — ไม่มี read endpoint ใหม่
// การ์ดใช้ renderer จาก similar.js (buildSimilarPreviewHtml/wireSimilarCard) + บล็อกโต้แย้งจาก vote.js
// การโหวตยิง wire เดียวกับในควิซเป๊ะ (voteOnReport, REPORT_VOTE_THRESHOLD, processReports) ผ่าน buildReportVotePayload
//
// โหลดหลัง similar.js + vote.js (พึ่งทั้งคู่) — ดู index.html script order

// เก็บ timestamp ของ report ที่ "โหวตในรอบนี้แล้ว" (client-only) เพื่อโชว์ ✓ + กันกดซ้ำ
// ไม่ persist — เป็นแค่สถานะภายใน overlay รอบเปิดปัจจุบัน; refetch ครั้งถัดไปเซิร์ฟเวอร์คือความจริง
window._pendingReportVoted = window._pendingReportVoted || new Set();

// ── รวบรวมรายการที่รอตรวจ: [{ q, data }] เฉพาะ qid ที่ยังมีข้อในวิชานี้ + มี report voteCount>0 ─────
// (mirror surfaces เดิมที่กรอง voteCount>0 — report ที่โดนโหวตค้านจนเหลือ 0 ถือว่าไม่มีใครหนุน)
window.getPendingReportEntries = function () {
    var cache = (window.APP && window.APP.pendingReportsCache) || {};
    var all = (window.APP && window.APP.allQuestions) || [];
    var byQid = {};
    all.forEach(function (q) { byQid[q.questionId] = q; });

    var entries = [];
    Object.keys(cache).forEach(function (qid) {
        var data = cache[qid];
        if (!data || !Array.isArray(data.reports)) return;
        var live = data.reports.filter(function (r) { return r.voteCount > 0; });
        if (!live.length) return;
        var q = byQid[qid];
        if (!q) return; // report ของข้อที่ไม่อยู่ในวิชานี้ (ไม่ควรเกิดเพราะ bulk กรองตามวิชาแล้ว) — ข้าม
        entries.push({ q: q, data: data });
    });
    return entries;
};

// ── Entry points: ปุ่ม #pending-reports-btn + banner #report-notification-container ────────────
// เรียกจาก .then() ของ fetchAllPendingVotesReports ใน app.js (แทน checkPendingReports/setTimeout เดิม)
window.renderPendingReportsEntryPoints = function () {
    var entries = window.getPendingReportEntries();
    var count = entries.length;

    // ปุ่มในแถบ action grid
    var $btn = $('#pending-reports-btn');
    if ($btn.length) {
        $('#pending-reports-count').text(count);
        $btn.prop('disabled', count === 0);
    }

    // banner หน้าแรก — โชว์เฉพาะเมื่อมีของรอตรวจ
    var $container = $('#report-notification-container');
    if ($container.length) {
        if (count > 0) {
            $('#report-details-content').html(
                '<p style="font-size: 1.3rem; margin-bottom: 5px;">มี <strong>' + count +
                '</strong> ข้อที่ถูกแจ้งเฉลยผิดและกำลังรอการตรวจสอบในวิชานี้ — กดเพื่อช่วยรีวิว</p>'
            );
            $container.css('cursor', 'pointer').off('click.pendingreports').on('click.pendingreports', function (e) {
                // ปุ่มสมัคร (ลิงก์ออกนอก) ในแบนเนอร์ต้องคลิกได้ตามปกติ ไม่เด้ง overlay
                if ($(e.target).closest('a').length) return;
                window.openPendingReportsOverlay();
            });
            $container.stop(true, true).fadeIn();
        } else {
            $container.off('click.pendingreports').hide();
        }
    }
};

// ── สร้างโครง overlay ครั้งเดียว (lazy) ───────────────────────────────────────────────
window._ensurePendingReportsOverlay = function () {
    if (document.getElementById('pending-reports-overlay')) return;
    var html =
        '<div id="pending-reports-overlay" style="display:none; position:fixed; inset:0; z-index:12000; background:rgba(17,24,39,0.55); padding:0; box-sizing:border-box;">' +
          '<div style="background:var(--color-surface,#fff); max-width:820px; margin:0 auto; height:100%; display:flex; flex-direction:column; box-shadow:0 0 40px rgba(0,0,0,0.3);">' +
            '<div style="flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--color-border-soft,#e5e7eb); background:#fee2e2; color:#7f1d1d;">' +
              '<i class="fas fa-clipboard-check" style="font-size:1.3rem;"></i>' +
              '<b style="font-size:1.25rem; flex:1;">ข้อที่รอตรวจสอบ (เฉลยผิด)</b>' +
              '<button id="pending-reports-close" aria-label="ปิด" style="background:none; border:none; color:#7f1d1d; font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>' +
            '</div>' +
            '<div id="pending-reports-body" style="flex:1 1 auto; overflow-y:auto; padding:14px 16px; box-sizing:border-box;"></div>' +
            '<div style="flex:0 0 auto; padding:12px 16px; border-top:1px solid var(--color-border-soft,#e5e7eb); background:var(--color-surface-2,#f9fafb); font-size:1.05rem; color:#533f03; text-align:center;">' +
              'ผลโหวตยึดตามเซิร์ฟเวอร์ — การ์ดจะหายไปเมื่อเปิดใหม่แล้วรายงานถูกปิด<br>' +
              'กดสมัครมาแก้กันเองได้เลยเด้อถ้าเรียนวิชานี้อยู่ ' +
              '<a href="https://sites.google.com/kkumail.com/mdkkuquiz/database" target="_blank" style="background-color:#991B1B; color:white; padding:4px 12px; border-radius:20px; text-decoration:none; font-weight:bold; display:inline-block; margin-top:4px;"><i class="fas fa-user-shield"></i> สมัครเพื่อแก้ไขข้อสอบ</a>' +
            '</div>' +
          '</div>' +
        '</div>';
    $('body').append(html);

    $('#pending-reports-close').on('click', window.closePendingReportsOverlay);
    // คลิกฉากหลัง (นอกกล่อง) = ปิด
    $('#pending-reports-overlay').on('click', function (e) {
        if (e.target === this) window.closePendingReportsOverlay();
    });
    // ESC ปิด
    $(document).on('keydown.pendingreports', function (e) {
        if (e.key === 'Escape' && $('#pending-reports-overlay').is(':visible')) window.closePendingReportsOverlay();
    });
};

window.closePendingReportsOverlay = function () {
    $('#pending-reports-overlay').fadeOut(150);
};

// ── เปิด overlay: refetch สด → เรนเดอร์การ์ด ──────────────────────────────────────────
window.openPendingReportsOverlay = async function () {
    window._ensurePendingReportsOverlay();
    var $overlay = $('#pending-reports-overlay');
    var $body = $('#pending-reports-body');
    $body.html('<div style="text-align:center; padding:40px 0; color:var(--color-text-muted,#6b7280);"><div class="loading-spinner"></div><p>กำลังโหลดรายการล่าสุด...</p></div>');
    $overlay.fadeIn(150);

    // refetch สดทุกครั้งที่เปิด (backend cache 5 นาทีอยู่แล้ว → ถูก) เพื่อไม่ให้เห็นของที่ปิดไปแล้ว
    var subjectParam = new URLSearchParams(window.location.search).get('subject') || '';
    if (subjectParam) {
        // เคลียร์ cache ก่อน refetch: fetchAllPendingVotesReports เป็น merge ไม่ใช่ replace —
        // ไม่เคลียร์เอง qid ที่ถูกปิด/แก้แล้ว (เซิร์ฟเวอร์ไม่คืนมาอีก) จะค้างเป็น stale ตลอด การ์ดไม่มีวันหลุด
        var snapshot = window.APP.pendingReportsCache;
        window.APP.pendingReportsCache = {};
        var ok = await window.fetchAllPendingVotesReports(subjectParam);
        if (!ok) {
            // refetch ล้ม → คืน cache เดิม กัน badge ในควิซหาย + ไม่โชว์ว่างหลอกๆ
            window.APP.pendingReportsCache = snapshot;
            console.warn('[PendingReports] refetch ไม่สำเร็จ — ใช้ cache เดิม');
        }
    }
    // อัปเดต count ปุ่ม/banner ด้วยข้อมูลใหม่
    window.renderPendingReportsEntryPoints();
    window.renderPendingReportsList();
};

window.renderPendingReportsList = function () {
    var $body = $('#pending-reports-body');
    var entries = window.getPendingReportEntries();

    if (!entries.length) {
        $body.html('<div style="text-align:center; padding:50px 16px; color:var(--color-text-muted,#6b7280);"><i class="fas fa-check-circle" style="font-size:2.5rem; color:#22c55e;"></i><p style="font-size:1.2rem; margin-top:10px;">ไม่มีข้อสอบที่รอการตรวจสอบในวิชานี้ 🎉</p></div>');
        return;
    }

    $body.empty();
    entries.forEach(function (entry) {
        var q = entry.q;
        var $card = $(
            '<div class="pending-report-card" data-qid="' + q.questionId + '" style="margin-bottom:20px; border:1px solid var(--color-border-soft,#e5e7eb); border-radius:12px; overflow:hidden; background:var(--color-surface,#fff);"></div>'
        );
        // ตัวข้อสอบเต็ม (โจทย์/รูป/ตัวเลือก/เฉลย/คำอธิบาย) จาก renderer ของ similar.js
        $card.html(window.buildSimilarPreviewHtml(q));
        // บล็อกโต้แย้งเฉลย + ปุ่มโหวต
        $card.append(window.buildPendingDisputeBlock(q.questionId, entry.data));
        $body.append($card);
        // wiring แกลเลอรี/ปุ่มในการ์ด similar (report/vote ปกติ) — scope ต่อการ์ด
        window.wireSimilarCard($card.find('.search-card'), q);
    });

    // เดินสายปุ่มโหวตโต้แย้ง (delegate ระดับ body ครั้งเดียว)
    $body.off('click.reportvote').on('click.reportvote', '.btn-pending-report-vote', function () {
        var $b = $(this);
        if ($b.prop('disabled')) return;
        window.submitPendingReportVote($b.data('timestamp'), parseInt($b.data('delta')), $b.data('qid'), $b.closest('.pending-report-card'));
    });

    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 50);
};

// ── บล็อกโต้แย้งเฉลยต่อ 1 ข้อ (adapt จาก vote.js openReportVoteModal + renderReportNotificationUI) ──
window.buildPendingDisputeBlock = function (questionId, data) {
    var threshold = data.threshold || 5;
    var reports = (data.reports || []).filter(function (r) { return r.voteCount > 0; });
    var rowsHtml = reports.map(function (r) {
        var isUrl = r.suggestedChoice && (String(r.suggestedChoice).startsWith('http') || String(r.suggestedChoice).startsWith('<svg'));
        var display = isUrl ? '[รูปภาพ]' : (r.suggestedChoice || '-');
        var remaining = threshold - r.voteCount;
        var statusText = remaining > 0
            ? 'ขาดอีก <b style="color:#9b1c1c;">' + remaining + '</b> โหวตจะส่งให้ระบบแก้อัตโนมัติ'
            : '<b style="color:#9b1c1c;">ครบเกณฑ์แล้ว — รอระบบ/Admin ตรวจสอบ</b>';
        var voted = window._pendingReportVoted.has(String(r.timestamp));
        var votedTag = voted ? '<span style="margin-left:8px; color:#16a34a; font-weight:700;"><i class="fas fa-check"></i> โหวตแล้ว</span>' : '';
        return '' +
            '<div class="pending-dispute-row" data-timestamp="' + r.timestamp + '" style="margin:10px 0 0; padding:12px; background:#fff8f8; border-radius:8px; border-left:4px solid #e74a3b;">' +
              '<div style="font-size:1.1rem; margin-bottom:6px;">เสนอเฉลย: <b>' + display + '</b>' +
                '<span class="pending-vote-count" style="margin-left:8px; padding:2px 8px; background:#6b7280; color:white; border-radius:10px; font-size:0.85rem;"><i class="fas fa-users"></i> ' + r.voteCount + ' โหวต</span>' +
                votedTag +
              '</div>' +
              (r.reportDetail ? '<div style="font-size:0.9rem; color:#555; margin-bottom:8px;">เหตุผล: ' + r.reportDetail + '</div>' : '') +
              '<div class="pending-vote-status" style="font-size:0.95rem; margin-bottom:8px;">' + statusText + '</div>' +
              '<div style="display:flex; gap:8px;">' +
                '<button class="btn-pending-report-vote" data-timestamp="' + r.timestamp + '" data-delta="1" data-qid="' + questionId + '"' + (voted ? ' disabled' : '') + ' style="padding:6px 16px; border-radius:20px; border:none; background:#22c55e; color:white; cursor:pointer; font-weight:700;' + (voted ? ' opacity:0.5; cursor:default;' : '') + '">เห็นด้วย (+1)</button>' +
                '<button class="btn-pending-report-vote" data-timestamp="' + r.timestamp + '" data-delta="-1" data-qid="' + questionId + '"' + (voted ? ' disabled' : '') + ' style="padding:6px 16px; border-radius:20px; border:none; background:#dc3545; color:white; cursor:pointer; font-weight:700;' + (voted ? ' opacity:0.5; cursor:default;' : '') + '">ไม่เห็นด้วย (-1)</button>' +
              '</div>' +
            '</div>';
    }).join('');

    return '<div class="pending-dispute-wrap" style="padding:12px 14px 14px; border-top:1px dashed #fca5a5;">' +
             '<div style="font-weight:700; color:#9b1c1c; font-size:1.05rem;"><i class="fas fa-exclamation-circle"></i> มีการรายงานว่าเฉลยผิด</div>' +
             rowsHtml +
           '</div>';
};

// ── โหวต: wire เดียวกับในควิซ แต่ไม่ลบ cache/ไม่ toast กลางจอ — อัปเดตนับในการ์ดแทน ────────────
window.submitPendingReportVote = async function (reportTimestamp, delta, questionId, $card) {
    // backend บังคับ session — anon เด้ง sign-in แทนโดนเตะออก
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        window.showGoogleSignInModal('เข้าสู่ระบบด้วยบัญชี KKU เพื่อโหวตรายงานข้อสอบ');
        return;
    }
    var tsKey = String(reportTimestamp);
    var payload = window.buildReportVotePayload(reportTimestamp, delta, questionId);

    // ปิดปุ่มระหว่างรอ กันกดรัว
    var $row = $card.find('.pending-dispute-row[data-timestamp="' + reportTimestamp + '"]');
    $row.find('.btn-pending-report-vote').prop('disabled', true);

    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success') {
            window._pendingReportVoted.add(tsKey);
            // อัปเดต voteCount ใน cache (ไม่ลบ qid — เซิร์ฟเวอร์คือความจริงเรื่องการนำออก ตอน refetch ครั้งหน้า)
            var newCount = (typeof res.newVoteCount === 'number') ? res.newVoteCount : null;
            var data = window.APP.pendingReportsCache[questionId];
            if (data && Array.isArray(data.reports)) {
                var rep = data.reports.find(function (r) { return String(r.timestamp) === tsKey; });
                if (rep) rep.voteCount = (newCount !== null) ? newCount : Math.max(0, rep.voteCount + delta);
                // เรนเดอร์บล็อกโต้แย้งใหม่จากข้อมูลอัปเดต (โชว์ ✓ + นับใหม่ + status ใหม่)
                $card.find('.pending-dispute-wrap').replaceWith(window.buildPendingDisputeBlock(questionId, data));
            }
            Swal.fire({ icon: 'success', title: 'บันทึกการโหวตแล้ว', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        } else {
            $row.find('.btn-pending-report-vote').prop('disabled', false);
            throw new Error(res ? (res.message || 'เซิร์ฟเวอร์ปฏิเสธการลงคะแนน') : 'ไม่มีการตอบกลับ');
        }
    } catch (err) {
        // session_expired → interceptor ใน sendWithRetry เตะออกให้แล้ว; ที่นี่แค่แจ้ง
        var msg = String(err && err.message || err);
        if (msg === 'session_expired' || msg === 'token_expired') {
            window.showGoogleSignInModal('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่เพื่อโหวต');
        } else if (msg === 'rate_limited') {
            Swal.fire('ช้าลงหน่อย', 'คุณโหวตถี่เกินไป ลองใหม่อีกครั้งในภายหลัง', 'warning');
        } else {
            $row.find('.btn-pending-report-vote').prop('disabled', false);
            Swal.fire('Error', 'ไม่สามารถบันทึกการโหวตได้: ' + msg, 'error');
        }
    }
};

// ปุ่มเป็น markup คงที่ใน index.html → ผูกตอน DOM ready ได้เลย
$(function () {
    $('#pending-reports-btn').on('click', function () {
        if ($(this).prop('disabled')) return;
        window.openPendingReportsOverlay();
    });
});
