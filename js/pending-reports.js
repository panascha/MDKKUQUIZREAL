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

// สถานะตัวกรอง/มุมมอง overlay (client-only) — คงข้ามการรีเฟรชลิสต์ภายในรอบเปิดเดียว
// expanded = qid ที่ถูกกางอยู่ (คงไว้เพื่อรีเฟรชแล้วไม่ยุบเอง)
window._pendingReportsUI = window._pendingReportsUI || { search: '', lecture: '', hideVoted: false, expanded: new Set() };

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
    // ให้ badge ปุ่ม/แบนเนอร์หน้าแรก sync กับผลโหวตล่าสุดหลังปิด (Phase 1 #5)
    window.renderPendingReportsEntryPoints();
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

// เรนเดอร์โครงหลัก: แถบตัวกรอง (คงที่ กันพิมพ์แล้ว input เสียโฟกัส) + กล่องรายการที่รีเฟรชได้เดี่ยว
window.renderPendingReportsList = function () {
    var $body = $('#pending-reports-body');
    // ถ้าไม่มีของรอตรวจเลย (ก่อนกรอง) — โชว์หน้าว่างแบบยินดี, ไม่ต้องมีแถบกรอง
    if (!window.getPendingReportEntries().length) {
        $body.html('<div style="text-align:center; padding:50px 16px; color:var(--color-text-muted,#6b7280);"><i class="fas fa-check-circle" style="font-size:2.5rem; color:#22c55e;"></i><p style="font-size:1.2rem; margin-top:10px;">ไม่มีข้อสอบที่รอการตรวจสอบในวิชานี้ 🎉</p></div>');
        return;
    }

    // สร้างแถบควบคุม + กล่องรายการครั้งเดียว (คงอยู่ข้ามการรีเฟรช/พิมพ์ค้นหา)
    if (!$body.find('#pending-reports-controls').length) {
        $body.html(
            '<div id="pending-reports-controls" style="position:sticky; top:-14px; z-index:2; background:var(--color-surface,#fff); padding:8px 0 10px; margin:-2px 0 8px; border-bottom:1px solid var(--color-border-soft,#e5e7eb); display:flex; flex-wrap:wrap; gap:8px; align-items:center;">' +
              '<input id="pending-reports-search" type="text" placeholder="ค้นหาโจทย์ / เฉลยที่เสนอ..." style="flex:1 1 180px; min-width:140px; padding:7px 12px; border:1px solid var(--color-border-soft,#d1d5db); border-radius:20px; font-size:1rem;">' +
              '<select id="pending-reports-lecture" style="flex:0 1 auto; max-width:55%; padding:7px 10px; border:1px solid var(--color-border-soft,#d1d5db); border-radius:20px; font-size:1rem; background:#fff;"></select>' +
              '<label style="display:flex; align-items:center; gap:5px; font-size:0.95rem; cursor:pointer; white-space:nowrap;"><input type="checkbox" id="pending-reports-hidevoted"> ซ่อนข้อที่โหวตแล้ว</label>' +
            '</div>' +
            '<div id="pending-reports-list"></div>'
        );

        // เดินสายควบคุมครั้งเดียว
        $body.find('#pending-reports-search').on('input', function () {
            window._pendingReportsUI.search = $(this).val();
            window._renderPendingReportItems();
        });
        $body.find('#pending-reports-lecture').on('change', function () {
            window._pendingReportsUI.lecture = $(this).val();
            window._renderPendingReportItems();
        });
        $body.find('#pending-reports-hidevoted').on('change', function () {
            window._pendingReportsUI.hideVoted = $(this).prop('checked');
            window._renderPendingReportItems();
        });
        // โหวต (delegate ครั้งเดียว) — ครอบทั้งปุ่มในบล็อกเต็มและปุ่มโหวตเร็วในแถวย่อ
        $body.off('click.reportvote').on('click.reportvote', '.btn-pending-report-vote', function (e) {
            e.stopPropagation(); // กันไม่ให้ทริกเกอร์ toggle กางการ์ด
            var $b = $(this);
            if ($b.prop('disabled')) return;
            window.submitPendingReportVote($b.data('timestamp'), parseInt($b.data('delta')), $b.data('qid'), $b.closest('.pending-report-card'));
        });
        // กาง/ยุบการ์ดเมื่อคลิกแถวย่อ (เว้นการคลิกปุ่มโหวต)
        $body.off('click.reportexpand').on('click.reportexpand', '.pr-compact', function (e) {
            if ($(e.target).closest('.btn-pending-report-vote').length) return;
            window._togglePendingCard($(this).closest('.pending-report-card'));
        });
    }

    window._populatePendingLectureFilter();
    // คืนค่า control ให้ตรง state (กรณีเปิดใหม่หลังโหลด spinner ทับ)
    $body.find('#pending-reports-search').val(window._pendingReportsUI.search);
    $body.find('#pending-reports-hidevoted').prop('checked', window._pendingReportsUI.hideVoted);
    window._renderPendingReportItems();
};

// ── ข้อมูลหัวข้อ (lecture) ของ 1 ข้อ: id (category[1] fallback [0]) + ชื่ออ่านออก ──
window._pendingLectureInfo = function (q) {
    var cats = Array.isArray(q.category) ? q.category : [q.category];
    var id = cats[1] || cats[0] || '';
    var name = id;
    var list = (window.APP.globalStructure && window.APP.globalStructure.category) || [];
    var found = list.find(function (c) { return c.categoryId === id; });
    if (found) name = found.categoryName;
    return { id: id, name: name };
};

// เติม dropdown หัวข้อจากรายการที่รอตรวจปัจจุบัน + คืนค่าที่เคยเลือก (ถ้าหลุดไปแล้วรีเซ็ต)
window._populatePendingLectureFilter = function () {
    var seen = {};
    window.getPendingReportEntries().forEach(function (e) {
        var info = window._pendingLectureInfo(e.q);
        if (info.id && !seen[info.id]) seen[info.id] = info.name;
    });
    var prev = window._pendingReportsUI.lecture || '';
    var opts = Object.keys(seen).sort(function (a, b) { return String(seen[a]).localeCompare(String(seen[b])); })
        .map(function (id) { return '<option value="' + id + '">' + seen[id] + '</option>'; }).join('');
    var $sel = $('#pending-reports-lecture');
    $sel.html('<option value="">ทุกหัวข้อ</option>' + opts).val(prev);
    if (!$sel.val()) window._pendingReportsUI.lecture = ''; // ค่าเดิมไม่มีแล้ว → ทั้งหมด
};

// ── รวบรวมข้อโต้แย้งของ 1 ข้อ: จัดกลุ่มตาม suggestedChoice ที่เหมือนกันเป๊ะ กันโหวตแตก ──
// ตัวแทน (rep) = ตั๋วคะแนนมากสุด → โหวตทุกครั้งวิ่งเข้าตัวแทน; เลขที่ผูกเกณฑ์ = ของตัวแทน,
// total เป็นบริบทเสริมเท่านั้น (backend ตัดสิน auto-resolve ราย ticket ไม่ใช่ผลรวม)
window._buildPendingDisputes = function (data) {
    var threshold = data.threshold || 5;
    var live = (data.reports || []).filter(function (r) { return r.voteCount > 0; });
    var groups = {};
    live.forEach(function (r) {
        var key = String(r.suggestedChoice == null ? '' : r.suggestedChoice).trim();
        (groups[key] = groups[key] || []).push(r);
    });
    var disputes = Object.keys(groups).map(function (key) {
        var arr = groups[key];
        arr.sort(function (a, b) { return (b.voteCount - a.voteCount) || (a.timestamp - b.timestamp); });
        var rep = arr[0];
        var total = arr.reduce(function (s, r) { return s + (r.voteCount || 0); }, 0);
        var isUrl = key && (key.indexOf('http') === 0 || key.indexOf('<svg') === 0);
        return {
            key: key,
            display: isUrl ? '[รูปภาพ]' : (key || '-'),
            rep: rep,
            count: rep.voteCount,
            total: total,
            tickets: arr.length,
            remaining: Math.max(0, threshold - rep.voteCount),
            reportDetail: rep.reportDetail || '',
            voted: window._pendingReportVoted.has(String(rep.timestamp))
        };
    });
    disputes.sort(function (a, b) { return a.remaining - b.remaining; }); // ใกล้ครบเกณฑ์ก่อน
    return { threshold: threshold, disputes: disputes };
};

// ย่อค่าเฉลย/ตัวเลือกให้สั้น (รูป/svg → [รูปภาพ]) สำหรับแถวย่อ
window._pendingChoiceDisplay = function (val, maxLen) {
    var s = String(val == null ? '' : val).trim();
    if (!s) return '—';
    if (s.indexOf('http') === 0 || s.indexOf('<svg') === 0) return '[รูปภาพ]';
    return window.similarSnippet ? window.similarSnippet(s, maxLen || 40) : s.slice(0, maxLen || 40);
};

// สร้าง row ข้อมูล 1 ข้อจาก qid (ใช้ตอน toggle กาง) — คืน null ถ้าข้อ/ข้อมูลหลุดไปแล้ว
window._pendingCardRow = function (qid) {
    var data = window.APP.pendingReportsCache[qid];
    var q = (window.APP.allQuestions || []).find(function (x) { return String(x.questionId) === String(qid); });
    if (!q || !data) return null;
    var agg = window._buildPendingDisputes(data);
    return { q: q, data: data, disputes: agg.disputes, threshold: agg.threshold };
};

// ── เรนเดอร์เฉพาะกล่องรายการ (กรอง+เรียงด่วน) — เรียกซ้ำได้ ไม่แตะแถบควบคุม ──
window._renderPendingReportItems = function () {
    var $list = $('#pending-reports-list');
    if (!$list.length) return;
    var ui = window._pendingReportsUI;
    var kw = (ui.search || '').trim().toLowerCase();

    var rows = window.getPendingReportEntries().map(function (e) {
        var agg = window._buildPendingDisputes(e.data);
        return {
            q: e.q, data: e.data, disputes: agg.disputes, threshold: agg.threshold,
            urgency: agg.disputes.length ? agg.disputes[0].remaining : Infinity,
            lectureId: window._pendingLectureInfo(e.q).id
        };
    }).filter(function (r) { return r.disputes.length; });

    if (ui.lecture) rows = rows.filter(function (r) { return r.lectureId === ui.lecture; });
    if (ui.hideVoted) rows = rows.filter(function (r) { return !r.disputes.every(function (d) { return d.voted; }); });
    if (kw) rows = rows.filter(function (r) {
        if (String(r.q.problem || '').toLowerCase().indexOf(kw) >= 0) return true;
        return r.disputes.some(function (d) {
            return d.display.toLowerCase().indexOf(kw) >= 0 || String(d.reportDetail).toLowerCase().indexOf(kw) >= 0;
        });
    });

    rows.sort(function (a, b) { return a.urgency - b.urgency; }); // ใกล้ครบเกณฑ์อยู่บนสุด

    if (!rows.length) {
        $list.html('<div style="text-align:center; padding:40px 16px; color:var(--color-text-muted,#6b7280);"><i class="fas fa-filter" style="font-size:1.8rem;"></i><p style="font-size:1.1rem; margin-top:8px;">ไม่มีข้อที่ตรงกับตัวกรอง</p></div>');
        return;
    }

    $list.empty();
    rows.forEach(function (r, idx) {
        var $card = window._buildPendingCompactCard(r, idx + 1);
        $list.append($card);
        if (window._pendingReportsUI.expanded.has(String(r.q.questionId))) {
            window._expandPendingCard($card, r); // คงสถานะกางไว้หลังรีเฟรช
        }
    });
};

// แถวย่อ (compact): #ลำดับ | เฉลยเดิม ➔ เฉลยที่เสนอ | เหตุผลย่อ | แต้มโหวต | โหวตเร็ว/กาง
window._buildPendingCompactCard = function (r, n) {
    var q = r.q;
    var lead = r.disputes[0];
    var moreCount = r.disputes.length - 1;
    var curDisplay = window._pendingChoiceDisplay(q.answer, 40);
    var reason = lead.reportDetail ? window.similarSnippet(lead.reportDetail, 80) : '—';
    var badge = lead.tickets > 1
        ? '<i class="fas fa-users"></i> ' + lead.count + ' <span style="opacity:.85;">(รวม ' + lead.total + ' · ' + lead.tickets + ' ตั๋ว)</span>'
        : '<i class="fas fa-users"></i> ' + lead.count + ' โหวต';
    var votedTag = lead.voted ? '<span style="color:#16a34a;"><i class="fas fa-check"></i></span>' : '';
    var quickBtn = lead.voted
        ? '<span style="font-size:0.85rem; color:#16a34a; font-weight:700; padding:6px 8px; white-space:nowrap;"><i class="fas fa-check"></i> โหวตแล้ว</span>'
        : '<button class="btn-pending-report-vote" data-timestamp="' + lead.rep.timestamp + '" data-delta="1" data-qid="' + q.questionId + '" title="เห็นด้วยกับเฉลยที่เสนอ" style="padding:6px 12px; border-radius:16px; border:none; background:#22c55e; color:#fff; font-weight:700; cursor:pointer;">+1</button>';

    var $card = $('<div class="pending-report-card" data-qid="' + q.questionId + '" style="margin-bottom:10px; border:1px solid var(--color-border-soft,#e5e7eb); border-radius:10px; overflow:hidden; background:var(--color-surface,#fff);"></div>');
    $card.html(
        '<div class="pr-compact" style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer;">' +
          '<div style="flex:0 0 auto; font-weight:800; color:#9b1c1c; min-width:26px;">#' + n + '</div>' +
          '<div style="flex:1 1 auto; min-width:0;">' +
            '<div style="font-size:1rem; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
              '<span style="color:#6b7280;">' + curDisplay + '</span> <i class="fas fa-arrow-right" style="color:#9b1c1c; font-size:0.8rem;"></i> <b style="color:#111827;">' + lead.display + '</b>' +
              (moreCount > 0 ? ' <span style="font-size:0.8rem; color:#9b1c1c;">+' + moreCount + ' โต้แย้ง</span>' : '') +
            '</div>' +
            '<div style="font-size:0.85rem; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + reason + '</div>' +
          '</div>' +
          '<div style="flex:0 0 auto; display:flex; align-items:center; gap:8px;">' +
            '<span class="pending-vote-count" style="padding:3px 8px; background:#6b7280; color:#fff; border-radius:10px; font-size:0.8rem; white-space:nowrap;">' + badge + '</span>' + votedTag +
            quickBtn +
            '<i class="fas fa-chevron-down pr-expand-caret" style="color:#9ca3af; transition:transform .15s;"></i>' +
          '</div>' +
        '</div>' +
        '<div class="pr-expand" hidden style="border-top:1px dashed #fca5a5;"></div>'
    );
    return $card;
};

// กาง/ยุบการ์ด (lazy: สร้าง vignette เต็มตอนกางครั้งแรกเท่านั้น)
window._togglePendingCard = function ($card) {
    var qid = String($card.data('qid'));
    var $exp = $card.find('.pr-expand');
    if (!$exp.prop('hidden')) {
        $exp.prop('hidden', true);
        $card.find('.pr-expand-caret').css('transform', '');
        window._pendingReportsUI.expanded.delete(qid);
        return;
    }
    var row = window._pendingCardRow(qid);
    if (!row) return;
    window._pendingReportsUI.expanded.add(qid);
    window._expandPendingCard($card, row);
};

window._expandPendingCard = function ($card, r) {
    var $exp = $card.find('.pr-expand');
    $card.find('.pr-expand-caret').css('transform', 'rotate(180deg)');
    if ($exp.data('rendered')) { $exp.prop('hidden', false); return; }
    // สร้างตัวข้อสอบเต็ม (โจทย์/รูป/ตัวเลือก/เฉลย) + บล็อกโต้แย้งเต็ม — เฉพาะตอนกางครั้งแรก
    var $vig = $('<div style="padding:8px 12px 0;"></div>').html(window.buildSimilarPreviewHtml(r.q));
    $exp.append($vig);
    $exp.append(window.buildPendingDisputeBlock(r.q.questionId, r.data));
    window.wireSimilarCard($vig.find('.search-card'), r.q);
    $exp.data('rendered', true).prop('hidden', false);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 50);
};

// ── บล็อกโต้แย้งเฉลยต่อ 1 ข้อ (adapt จาก vote.js openReportVoteModal + renderReportNotificationUI) ──
window.buildPendingDisputeBlock = function (questionId, data) {
    var agg = window._buildPendingDisputes(data);
    var rowsHtml = agg.disputes.map(function (d) {
        var ts = d.rep.timestamp; // โหวตวิ่งเข้าตัวแทนเสมอ (รวมแรง กันโหวตแตก)
        var statusText = d.remaining > 0
            ? 'ขาดอีก <b style="color:#9b1c1c;">' + d.remaining + '</b> โหวตจะส่งให้ระบบแก้อัตโนมัติ'
            : '<b style="color:#9b1c1c;">ครบเกณฑ์แล้ว — รอระบบ/Admin ตรวจสอบ</b>';
        var votedTag = d.voted ? '<span style="margin-left:8px; color:#16a34a; font-weight:700;"><i class="fas fa-check"></i> โหวตแล้ว</span>' : '';
        var dupNote = d.tickets > 1 ? '<span style="margin-left:8px; font-size:0.8rem; color:#6b7280;">(รวม ' + d.total + ' โหวตจาก ' + d.tickets + ' ตั๋วซ้ำ)</span>' : '';
        return '' +
            '<div class="pending-dispute-row" data-timestamp="' + ts + '" style="margin:10px 0 0; padding:12px; background:#fff8f8; border-radius:8px; border-left:4px solid #e74a3b;">' +
              '<div style="font-size:1.1rem; margin-bottom:6px;">เสนอเฉลย: <b>' + d.display + '</b>' +
                '<span class="pending-vote-count" style="margin-left:8px; padding:2px 8px; background:#6b7280; color:white; border-radius:10px; font-size:0.85rem;"><i class="fas fa-users"></i> ' + d.count + ' โหวต</span>' +
                dupNote + votedTag +
              '</div>' +
              (d.reportDetail ? '<div style="font-size:0.9rem; color:#555; margin-bottom:8px;">เหตุผล: ' + d.reportDetail + '</div>' : '') +
              '<div class="pending-vote-status" style="font-size:0.95rem; margin-bottom:8px;">' + statusText + '</div>' +
              '<div style="display:flex; gap:8px;">' +
                '<button class="btn-pending-report-vote" data-timestamp="' + ts + '" data-delta="1" data-qid="' + questionId + '"' + (d.voted ? ' disabled' : '') + ' style="padding:6px 16px; border-radius:20px; border:none; background:#22c55e; color:white; cursor:pointer; font-weight:700;' + (d.voted ? ' opacity:0.5; cursor:default;' : '') + '">เห็นด้วย (+1)</button>' +
                '<button class="btn-pending-report-vote" data-timestamp="' + ts + '" data-delta="-1" data-qid="' + questionId + '"' + (d.voted ? ' disabled' : '') + ' style="padding:6px 16px; border-radius:20px; border:none; background:#dc3545; color:white; cursor:pointer; font-weight:700;' + (d.voted ? ' opacity:0.5; cursor:default;' : '') + '">ไม่เห็นด้วย (-1)</button>' +
              '</div>' +
            '</div>';
    }).join('');

    return '<div class="pending-dispute-wrap" style="padding:12px 14px 14px;">' +
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

    // ปิดปุ่มโหวตที่ผูก ts นี้ทั้งในแถวย่อและบล็อกเต็ม กันกดรัว
    var $btns = $card.find('.btn-pending-report-vote[data-timestamp="' + reportTimestamp + '"]');
    $btns.prop('disabled', true);

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
            }
            // รีเฟรชทั้งลิสต์: ลำดับด่วนขยับ + การ์ดที่ตกเกณฑ์ (voteCount=0) ต้องหลุดออก + badge หน้าแรก sync
            window._renderPendingReportItems();
            window.renderPendingReportsEntryPoints();
            Swal.fire({ icon: 'success', title: 'บันทึกการโหวตแล้ว', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        } else {
            $btns.prop('disabled', false);
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
            $btns.prop('disabled', false);
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
