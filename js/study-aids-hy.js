// REFACTOR/js/study-aids-hy.js — High-yield & keyword index

window._highYieldCurrentCategory = function () {
    var q = window.APP.current_question;
    if (!q || !q.category) return null;
    var cats = Array.isArray(q.category) ? q.category : [q.category];
    if (!cats.length) return null;
    var catId = cats[0];
    if (!catId) return null;
    var subject = new URLSearchParams(location.search).get('subject') || '';
    var name = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(catId) : catId;
    return { categoryId: String(catId), subject: subject, categoryName: name };
};

// เปิด/ปิด panel — โหลดชีทของหมวดปัจจุบันเมื่อเปิด
window.toggleHighYieldPanel = function () {
    var $p = $('#highyield-panel');
    $p.slideToggle(200, function () {
        if ($p.is(':visible')) {
            var ctx = window._highYieldCurrentCategory();
            if (!ctx) { window._renderHighYieldMessage('กรุณาเปิดข้อสอบก่อน แล้วกดปุ่มนี้อีกครั้งเพื่อดูสรุปของหัวข้อนั้น', ''); return; }
            window.loadHighYield(ctx.categoryId, ctx.subject, ctx.categoryName);
        }
    });
};

// เขียนข้อความสถานะลง panel + ตั้ง subtitle (ใช้ทั้ง empty/loading/error)
window._renderHighYieldMessage = function (msg, subtitle) {
    $('#highyield-subtitle, #sp-hy-subtitle').text(subtitle || 'หัวข้อของข้อที่กำลังดูอยู่');
    $('#highyield-content, #sp-hy-content').html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.92rem;">' +
        $('<div>').text(msg).html() + '</div>');
};

// โหลดชีท high-yield ของหมวด — client cache ต่อ categoryId; hit=render, miss=ปุ่มสร้าง
// *** stale-render guard: _hyActiveCategory *** — พลิกข้อเร็วๆ ตอน panel เปิดจะยิง GET ซ้อนกันหลายหมวด;
// ต้อง render เฉพาะผลของหมวดที่ยัง "active" อยู่ ไม่งั้นผลที่ resolve ช้ากว่าจะทับหมวดปัจจุบัน (race)
window.loadHighYield = async function (categoryId, subject, categoryName) {
    if (!categoryId) { window._renderHighYieldMessage('ไม่พบหัวข้อของข้อนี้', ''); return; }
    window.APP.highYieldCache = window.APP.highYieldCache || {};
    window.APP._hyActiveCategory = categoryId; // หมวดที่ผู้ใช้กำลังดูตอนนี้
    var cached = window.APP.highYieldCache[categoryId];
    if (cached && cached !== 'MISS') { window.renderHighYieldSheet(cached, categoryId, subject, categoryName); return; }
    if (cached === 'MISS') { window.renderHighYieldMiss(categoryId, subject, categoryName); return; }

    $('#highyield-subtitle, #sp-hy-subtitle').text('หัวข้อ: ' + (categoryName || categoryId));
    $('#highyield-content, #sp-hy-content').html('<div style="color:var(--color-text-muted);font-size:0.92rem;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>');
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getHighYield&category=' + encodeURIComponent(categoryId) + '&_=' + Date.now();
        });
        if (res && res.result === 'success' && res.highyield) {
            window.APP.highYieldCache[categoryId] = res.highyield;
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldSheet(res.highyield, categoryId, subject, categoryName);
        } else {
            window.APP.highYieldCache[categoryId] = 'MISS';
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldMiss(categoryId, subject, categoryName);
        }
    } catch (e) {
        if (window.APP._hyActiveCategory === categoryId) window._renderHighYieldMessage('โหลดไม่สำเร็จ กรุณาลองใหม่', 'หัวข้อ: ' + (categoryName || categoryId));
    }
};

// miss → ปุ่ม "สร้างชีทสรุป" (lazy-generate) — data-* ส่งเข้าตัว handler (ไม่ inline onclick กับสตริงไทย)
window.renderHighYieldMiss = function (categoryId, subject, categoryName) {
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    $('#highyield-subtitle, #sp-hy-subtitle').text('หัวข้อ: ' + (categoryName || categoryId));
    $('#highyield-content, #sp-hy-content').html(
        '<div style="color:var(--color-text-muted);font-size:0.92rem;margin-bottom:10px;">ยังไม่มีชีทสรุปของหัวข้อนี้ — สร้างด้วย AI จากคลังข้อสอบได้เลย (ใช้เวลา ~30 วินาที)</div>' +
        '<button type="button" class="btn-xs teal hy-generate-btn" data-cat="' + esc(categoryId) + '" data-subject="' + esc(subject || '') + '" data-catname="' + esc(categoryName || '') + '">' +
        '<i class="fas fa-wand-magic-sparkles"></i> สร้างชีทสรุป High-yield</button>');
};

// lazy-generate → POST generateHighYield (~30s) → cache + render
window.generateHighYieldNow = async function (categoryId, subject, categoryName) {
    if (!categoryId) return;
    window.APP._hyActiveCategory = categoryId; // กันผู้ใช้เปลี่ยนข้อระหว่างรอ ~30s แล้วผลไปทับหมวดอื่น
    $('#highyield-subtitle, #sp-hy-subtitle').text('หัวข้อ: ' + (categoryName || categoryId));
    $('#highyield-content, #sp-hy-content').html('<div style="color:var(--color-text-muted);font-size:0.92rem;"><i class="fas fa-spinner fa-spin"></i> กำลังสร้างชีทสรุปด้วย AI... (~30 วินาที กรุณารอสักครู่)</div>');
    var token = localStorage.getItem('mdkku_session_token') || undefined;
    var payload = { action: 'generateHighYield', category: categoryId, subject: subject || '' };
    if (token) payload.sessionToken = token;
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success' && res.highyield) {
            window.APP.highYieldCache = window.APP.highYieldCache || {};
            window.APP.highYieldCache[categoryId] = res.highyield;
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldSheet(res.highyield, categoryId, subject, categoryName);
        } else {
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldMiss(categoryId, subject, categoryName);
            if (window.bgToast) window.bgToast.fire({ icon: 'warning', title: (res && res.message) || 'สร้างชีทสรุปไม่สำเร็จ' });
        }
    } catch (e) {
        if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldMiss(categoryId, subject, categoryName);
        if (window.bgToast) window.bgToast.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่' });
    }
};

// render ชีทเต็ม: subtitle+badge, summary(markdown+math), keywords(chips), mnemonics(👍/🚩 + net votes + guard)
window.renderHighYieldSheet = function (hy, categoryId, subject, categoryName) {
    if (!hy) { window.renderHighYieldMiss(categoryId, subject, categoryName); return; }
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    // inline bold เฉพาะ **...** (mnemonics มักเน้นตัวอักษรตัวย่อ เช่น **I**ntention) — escape ก่อน แล้วค่อยแทน (XSS-safe: HTML ถูก neutralize ไปแล้ว)
    var mdBold = function (s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); };
    var badge = (hy.status === 'auto')
        ? ' <span style="display:inline-block;font-size:0.66rem;background:#fff3cd;color:#856404;padding:1px 6px;border-radius:6px;">AI สร้าง</span>' : '';
    $('#highyield-subtitle, #sp-hy-subtitle').html('หัวข้อ: <b>' + esc(categoryName || categoryId) + '</b>' + badge);

    // summary — sanitize-by-construction ผ่าน renderMarkdownSafe (escaped text + whitelist tags)
    var summaryHtml = (typeof window.renderMarkdownSafe === 'function')
        ? window.renderMarkdownSafe(hy.summary_md) : esc(hy.summary_md);
    var html = '<div class="hy-summary chat-md">' + summaryHtml + '</div>';

    // keywords → chips
    var kws = Array.isArray(hy.keywords) ? hy.keywords : [];
    if (kws.length) {
        html += '<div class="hy-section-title"><i class="fas fa-key"></i> คีย์เวิร์ดที่ต้องรู้</div><div class="hy-keywords">' +
            kws.map(function (k) { return '<span class="hy-chip">' + esc(k) + '</span>'; }).join('') + '</div>';
    }

    // mnemonics → list + vote buttons
    var mns = Array.isArray(hy.mnemonics) ? hy.mnemonics : [];
    var votes = hy.mnemonic_votes || {};
    if (mns.length) {
        html += '<div class="hy-section-title"><i class="fas fa-brain"></i> ตัวช่วยจำ (Mnemonics)</div>';
        html += mns.map(function (m, i) {
            var net = parseInt(votes[i], 10) || 0;
            var voted = localStorage.getItem('mdkku_hymv_' + categoryId + '_' + i);
            var disAttr = voted ? ' disabled' : '';
            return '<div class="hy-mnemonic" data-idx="' + i + '">' +
                '<div class="hy-mnemonic-text">' + mdBold(m) + '</div>' +
                '<div class="hy-mnemonic-votes">' +
                '<button type="button" class="hy-vote-btn hy-vote-up" data-cat="' + esc(categoryId) + '" data-idx="' + i + '" data-delta="1" title="ช่วยจำได้ดี"' + disAttr + '>👍</button>' +
                '<span class="hy-vote-count" data-idx="' + i + '">' + net + '</span>' +
                '<button type="button" class="hy-vote-btn hy-vote-flag" data-cat="' + esc(categoryId) + '" data-idx="' + i + '" data-delta="-1" title="ไม่ช่วย/ไม่ถูกต้อง"' + disAttr + '>🚩</button>' +
                '</div></div>';
        }).join('');
    }

    if (!hy.summary_md && !kws.length && !mns.length) {
        html = '<div style="color:var(--color-text-muted);font-style:italic;">ชีทสรุปนี้ว่างเปล่า</div>';
    }
    $('#highyield-content, #sp-hy-content').html(html);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 30);
};

// โหวต mnemonic — localStorage re-vote guard (client) + optimistic UI + POST voteHighYieldMnemonic
window.voteHighYieldMnemonic = async function (categoryId, idx, delta, btnEl) {
    var guardKey = 'mdkku_hymv_' + categoryId + '_' + idx;
    if (localStorage.getItem(guardKey)) {
        if (window.bgToast) window.bgToast.fire({ icon: 'info', title: 'คุณโหวตตัวช่วยจำนี้ไปแล้ว' });
        return;
    }
    localStorage.setItem(guardKey, String(delta)); // guard ทันที (กันดับเบิลคลิก); rollback เมื่อ error
    var $row = $(btnEl).closest('.hy-mnemonic');
    $row.find('.hy-vote-btn').prop('disabled', true);
    var $count = $row.find('.hy-vote-count');
    var optimistic = (parseInt($count.text(), 10) || 0) + delta;
    $count.text(optimistic);

    var token = localStorage.getItem('mdkku_session_token') || undefined;
    var payload = { action: 'voteHighYieldMnemonic', category: categoryId, mnemonicIdx: idx, delta: delta };
    if (token) payload.sessionToken = token;
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success') {
            if (typeof res.netVotes === 'number') $count.text(res.netVotes);
            // sync client cache ให้ตรง (เผื่อ re-render)
            var c = window.APP.highYieldCache && window.APP.highYieldCache[categoryId];
            if (c && c !== 'MISS') { c.mnemonic_votes = c.mnemonic_votes || {}; c.mnemonic_votes[idx] = (typeof res.netVotes === 'number') ? res.netVotes : optimistic; }
        } else {
            localStorage.removeItem(guardKey); // rollback guard
            $row.find('.hy-vote-btn').prop('disabled', false);
            $count.text((parseInt($count.text(), 10) || 0) - delta);
            if (window.bgToast) window.bgToast.fire({ icon: 'warning', title: (res && res.message) || 'โหวตไม่สำเร็จ' });
        }
    } catch (e) {
        localStorage.removeItem(guardKey);
        $row.find('.hy-vote-btn').prop('disabled', false);
        $count.text((parseInt($count.text(), 10) || 0) - delta);
        if (window.bgToast) window.bgToast.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่' });
    }
};

/* ---- Delegated handlers (bind ONCE ที่ document) ---- */
$(document).on('click', '.hy-generate-btn', function () {
    window.generateHighYieldNow(this.dataset.cat, this.dataset.subject, this.dataset.catname);
});
$(document).on('click', '.hy-vote-btn', function () {
    window.voteHighYieldMnemonic(this.dataset.cat, parseInt(this.dataset.idx, 10), parseInt(this.dataset.delta, 10), this);
});

// เปลี่ยนข้อ → ถ้า panel เปิดอยู่ อัปเดตชีทให้ตรงหมวดของข้อใหม่ (cache ต่อ categoryId ทำให้ไม่ยิงซ้ำ)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') return;
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        if ($('#highyield-panel').is(':visible')) {
            var ctx = window._highYieldCurrentCategory();
            if (ctx) window.loadHighYield(ctx.categoryId, ctx.subject, ctx.categoryName);
            else window._renderHighYieldMessage('ข้อนี้ไม่มีหัวข้อ', '');
        }
    };
})();

/* =========================================
   Feature 6 — Keyword index (§6.1–§6.4) — คำสำคัญที่ออกบ่อยต่อหมวด (backend นับความถี่แบบ token-free)
   serving: GET getKeywordIndex&category=X (client cache ต่อ categoryId) → "list" จัดอันดับ Freq desc
   filters (§6.3): category selector (default = หมวดของข้อปัจจุบัน), min-Freq, "ซ่อนที่ทบทวนแล้ว"
   reviewed = localStorage kw_reviewed_<categoryId> (per-device เท่านั้น §6.4; มีหมายเหตุบน UI)
   expansion (NotebookLM-compliant, deterministic): question chips (.rag-cite-chip → jumpToQuestion),
     KB chips (.kb-cite-chip → excerpt modal), glossary join (glossaryMap[normalizeGlossaryKey(en)] → renderGlossaryPopup)
   generation = admin เท่านั้น (§6.2) → miss = ข้อความแจ้ง (ไม่มีปุ่มสร้างแบบ public ต่างจาก high-yield)
   ทุกฟังก์ชันแชร์เป็น window.* (กฎ REAL). stale-render guard: _kwActiveCategory
   ========================================= */

// หมวดทั้งหมดของข้อปัจจุบัน → ตัวเลือกใน selector (§6.3 default = หมวดของข้อปัจจุบัน). [] เมื่อยังไม่มีข้อ/ไม่มีหมวด
window._kwCurrentCategoryList = function () {
    var q = window.APP.current_question;
    if (!q || !q.category) return [];
    var cats = Array.isArray(q.category) ? q.category : [q.category];
    var out = [];
    cats.forEach(function (c) {
        if (!c) return;
        var name = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(c) : c;
        out.push({ categoryId: String(c), categoryName: name });
    });
    return out;
};

// เปิด/ปิด panel — เติม selector จากหมวดของข้อปัจจุบัน + โหลดหมวดแรกเมื่อเปิด
window.toggleKeywordIndexPanel = function () {
    var $p = $('#keyword-index-panel');
    $p.slideToggle(200, function () {
        if ($p.is(':visible')) {
            var cats = window._kwCurrentCategoryList();
            if (!cats.length) { $('#kw-category-select').empty(); window._kwRenderMessage('กรุณาเปิดข้อสอบก่อน แล้วกดปุ่มนี้อีกครั้งเพื่อดูคำสำคัญของหัวข้อนั้น'); return; }
            window._kwPopulateCategorySelect(cats, cats[0].categoryId);
            window.loadKeywordIndex(cats[0].categoryId);
        }
    });
};

// เติมตัวเลือกหมวดใน <select> (escape ชื่อไทย)
window._kwPopulateCategorySelect = function (cats, selectedId) {
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    $('#kw-category-select').html((cats || []).map(function (c) {
        return '<option value="' + esc(c.categoryId) + '"' + (String(c.categoryId) === String(selectedId) ? ' selected' : '') + '>' +
            esc(c.categoryName || c.categoryId) + '</option>';
    }).join(''));
};

// เขียนข้อความสถานะลง content (empty/loading/error)
window._kwRenderMessage = function (msg) {
    $('#keyword-index-content, #sp-kw-content').html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.92rem;">' +
        $('<div>').text(msg).html() + '</div>');
};

// โหลดดัชนีคำสำคัญของหมวด — client cache ต่อ categoryId; hit=render, miss (list ว่าง)=ข้อความแจ้ง
// *** stale-render guard _kwActiveCategory *** — เปลี่ยนหมวดเร็วๆ ตอน panel เปิด จะยิง GET ซ้อน; render เฉพาะหมวดที่ยัง active
window.loadKeywordIndex = async function (categoryId) {
    if (!categoryId) { window._kwRenderMessage('ไม่พบหัวข้อของข้อนี้'); return; }
    window.APP.keywordIndexCache = window.APP.keywordIndexCache || {};
    window.APP._kwActiveCategory = categoryId;
    window.APP._kwRenderedCategory = categoryId;
    // F5: subtitle ของ section "คำสำคัญหมวดนี้" ใน study panel ตามหมวดที่กำลังโหลด (no-op เมื่อไม่มี element)
    var spKwName = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(categoryId) : categoryId;
    $('#sp-kw-subtitle').text('หมวด: ' + (spKwName || categoryId));
    var cached = window.APP.keywordIndexCache[categoryId];
    if (cached) { window.renderKeywordIndex(); return; }

    $('#keyword-index-content, #sp-kw-content').html('<div style="color:var(--color-text-muted);font-size:0.92rem;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>');
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getKeywordIndex&category=' + encodeURIComponent(categoryId) + '&_=' + Date.now();
        });
        var list = (res && res.result === 'success' && Array.isArray(res.keywords)) ? res.keywords : [];
        window.APP.keywordIndexCache[categoryId] = list;
        if (window.APP._kwActiveCategory === categoryId) window.renderKeywordIndex();
    } catch (e) {
        if (window.APP._kwActiveCategory === categoryId) window._kwRenderMessage('โหลดไม่สำเร็จ กรุณาลองใหม่');
    }
};

// reviewed state (localStorage ต่อหมวด) — เก็บ set ของ normalized key ที่ทบทวนแล้ว (per-device, §6.4)
window._kwReviewedSet = function (categoryId) {
    try { return JSON.parse(localStorage.getItem('kw_reviewed_' + categoryId) || '{}') || {}; }
    catch (e) { return {}; }
};
window._kwToggleReviewed = function (categoryId, key, isReviewed) {
    var set = window._kwReviewedSet(categoryId);
    if (isReviewed) set[key] = 1; else delete set[key];
    try { localStorage.setItem('kw_reviewed_' + categoryId, JSON.stringify(set)); } catch (e) {}
};

// วาดส่วนขยายของ keyword: question chips (ในชุดปัจจุบัน) + KB chips + ปุ่มรากศัพท์ (glossary join)
window._kwRenderExpansion = function (kw, glossChip) {
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var cur = window.APP.currentQuestions || [];
    var qids = String(kw.source_questionIds || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
    var inSet = qids.filter(function (qid) { return cur.some(function (q) { return String(q.questionId) === String(qid); }); });
    var qChips = inSet.map(function (qid) {
        return '<button type="button" class="rag-cite-chip btn-xs" data-qid="' + esc(qid) +
            '" style="font-size:0.72rem;margin:2px;">#' + esc(qid) + '</button>';
    }).join(' ');
    var outCount = qids.length - inSet.length;

    var cids = String(kw.source_kb_chunkIds || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
    var kbMap = {};
    (window.APP.kbChunks || []).forEach(function (c) { kbMap[String(c.chunkId)] = c; });
    var kbChips = cids.filter(function (cid) { return kbMap[cid]; }).map(function (cid) {
        var c = kbMap[cid];
        return '<button type="button" class="kb-cite-chip btn-xs" data-chunkid="' + esc(cid) +
            '" style="font-size:0.72rem;margin:2px;">📖 ' + esc((c.source || '') + ' · ' + (c.heading || '')) + '</button>';
    }).join(' ');

    var parts = [];
    if (qChips) parts.push('<div class="kw-exp-row">ปรากฏในข้อ: ' + qChips +
        (outCount > 0 ? ' <span class="kw-more">(+' + outCount + ' นอกชุดนี้)</span>' : '') + '</div>');
    else if (qids.length) parts.push('<div class="kw-exp-row kw-more">ข้ออ้างอิงไม่อยู่ในชุดปัจจุบัน (' + qids.length + ' ข้อ)</div>');
    if (kbChips) parts.push('<div class="kw-exp-row">เอกสารอ้างอิง: ' + kbChips + '</div>');
    if (glossChip) parts.push('<div class="kw-exp-row">' + glossChip + '</div>');
    if (!parts.length) parts.push('<div class="kw-exp-row kw-more">ไม่มีข้ออ้างอิงในชุดปัจจุบัน</div>');
    return parts.join('');
};

// วาดรายการคำสำคัญของหมวดที่ render อยู่ (อ่านจาก cache) + apply filters (min-Freq / hide-reviewed). ไม่ยิง network
window.renderKeywordIndex = function () {
    var categoryId = window.APP._kwRenderedCategory;
    if (!categoryId) return;
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var list = (window.APP.keywordIndexCache && window.APP.keywordIndexCache[categoryId]) || [];
    if (!list.length) {
        window._kwRenderMessage('ยังไม่มีดัชนีคำสำคัญของหมวดนี้ — ผู้ดูแลระบบต้องสร้างก่อน (สร้างจากคลังข้อสอบแบบไม่ใช้โทเคน)');
        return;
    }
    var minFreq = parseInt($('#kw-min-freq').val(), 10) || 1;
    var hideReviewed = $('#kw-hide-reviewed').is(':checked');
    var reviewed = window._kwReviewedSet(categoryId);

    var rows = list.slice().sort(function (a, b) { return (b.freq || 0) - (a.freq || 0); }); // rank Freq desc (กันกรณี backend ไม่ได้ sort)
    var shown = 0;
    var html = rows.map(function (kw, i) {
        if ((kw.freq || 0) < minFreq) return '';
        var key = window.normalizeGlossaryKey(kw.keyword_en || kw.keyword_th || '');
        var isRev = !!reviewed[key];
        if (hideReviewed && isRev) return '';
        shown++;
        var label = esc(kw.keyword_en || '');
        if (kw.keyword_th) label += ' <span class="kw-th">(' + esc(kw.keyword_th) + ')</span>';
        if (!label.trim()) label = esc(kw.keyword_th || '(ไม่มีชื่อ)');
        var glossHit = !!(window.APP.glossaryMap && key && window.APP.glossaryMap[key]);
        var glossChip = glossHit
            ? '<button type="button" class="btn-xs kw-glossary-chip" data-key="' + esc(key) + '" title="ดูรากศัพท์/นิยาม"><i class="fas fa-sitemap"></i> รากศัพท์</button>'
            : '';
        return '<div class="kw-row' + (isRev ? ' kw-reviewed' : '') + '">' +
            '<div class="kw-row-head">' +
                '<label class="kw-review" title="ทำเครื่องหมายว่าทบทวนแล้ว (บนอุปกรณ์นี้)">' +
                    '<input type="checkbox" class="kw-review-toggle" data-cat="' + esc(categoryId) + '" data-key="' + esc(key) + '"' + (isRev ? ' checked' : '') + '></label>' +
                '<button type="button" class="kw-expand-btn"><i class="fas fa-caret-right"></i></button>' +
                '<span class="kw-label">' + label + '</span>' +
                '<span class="kw-freq" title="จำนวนข้อสอบที่ทดสอบคำนี้">' + (kw.freq || 0) + '</span>' +
            '</div>' +
            '<div class="kw-expand" style="display:none;">' + window._kwRenderExpansion(kw, glossChip) + '</div>' +
        '</div>';
    }).join('');
    if (!shown) html = '<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">ไม่มีคำสำคัญตามเงื่อนไขที่เลือก</div>';
    $('#keyword-index-content, #sp-kw-content').html(html);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 30);
};

/* ---- Delegated handlers (bind ONCE ที่ document) ---- */
$(document).on('change', '#kw-category-select', function () { window.loadKeywordIndex(this.value); });
$(document).on('input', '#kw-min-freq', function () { window.renderKeywordIndex(); });
$(document).on('change', '#kw-hide-reviewed', function () { window.renderKeywordIndex(); });
$(document).on('change', '.kw-review-toggle', function () {
    window._kwToggleReviewed(this.dataset.cat, this.dataset.key, this.checked);
    var $row = $(this).closest('.kw-row');
    $row.toggleClass('kw-reviewed', this.checked);
    if (this.checked && $('#kw-hide-reviewed').is(':checked')) $row.slideUp(150);
});
// หา expansion จากแถวตัวเอง (ไม่ใช้ id — รายการเดียวกัน render อยู่ 2 ที่: standalone panel + study panel §6.3)
$(document).on('click', '.kw-expand-btn', function () {
    $(this).closest('.kw-row').find('.kw-expand').first().slideToggle(120);
    $(this).find('i').toggleClass('fa-caret-right fa-caret-down');
});
// glossary join — เปิด popup เดิม (deterministic: term OBJECT จาก glossaryMap, ไม่ parse ข้อความ)
$(document).on('click', '.kw-glossary-chip', function () {
    var term = window.APP.glossaryMap && window.APP.glossaryMap[this.dataset.key];
    if (!term || typeof window.renderGlossaryPopup !== 'function') return;
    var r = this.getBoundingClientRect();
    window.renderGlossaryPopup(term, { left: r.left, top: r.top, bottom: r.bottom, right: r.right });
});

// เปลี่ยนข้อ → ถ้า panel เปิดอยู่ อัปเดต selector + โหลดคำสำคัญของหมวดข้อใหม่ (cache ต่อ categoryId กันยิงซ้ำ)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') return;
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        if ($('#keyword-index-panel').is(':visible')) {
            var cats = window._kwCurrentCategoryList();
            if (cats.length) {
                window._kwPopulateCategorySelect(cats, cats[0].categoryId);
                window.loadKeywordIndex(cats[0].categoryId);
            } else { $('#kw-category-select').empty(); window._kwRenderMessage('ข้อนี้ไม่มีหัวข้อ'); }
        }
    };
})();

/* =========================================
   Feature 5 — Unified study side panel (§5.1–§5.3) — "ผู้ช่วยติว: เกี่ยวกับข้อนี้"
   UI composition ล้วน (ไม่มี backend/action ใหม่): 4 section แบบ lazy + cache-first reuse ของเดิมทั้งหมด
     (1) สรุป High-yield        → loadHighYield/renderHighYieldSheet + APP.highYieldCache (multi-target #sp-hy-*)
     (2) ข้อสอบที่เกี่ยวข้อง     → renderRelatedChips + APP.relationsMap (chip .rag-cite-chip + handler เดิม verbatim)
     (3) คำสำคัญหมวดนี้ (§6.3)  → loadKeywordIndex/renderKeywordIndex + APP.keywordIndexCache (multi-target #sp-kw-content)
     (4) ถาม AI เกี่ยวกับข้อนี้  → sendChatbotQuery transport เดิมทุกอย่าง (เปลี่ยนเฉพาะ selector หน้าจอ)
   primary category = category[0] — กติกาเดียวกับ F3/F6 (_highYieldCurrentCategory / _kwCurrentCategoryList()[0])
   resize (§5.1): PointerEvents + setPointerCapture (mouse+touch ทางเดียว), rAF-throttle DOM write,
     clamp desktop [280px, min(560px, 60vw)] / mobile bottom-sheet [35vh, 85vh],
     persist localStorage mdkku_studypanel_width|height (เขียนครั้งเดียวตอน pointerup),
     re-clamp ค่าที่จำไว้ทุกครั้งที่เปิด, ต่ำกว่า breakpoint (768) ไม่ใช้ width ที่จำไว้ (เต็มความกว้าง),
     dbl-click handle = ล้างค่า + กลับ default (380px desktop / 60dvh mobile — CSS fallback)
   คนละ surface กับ RAG chat (F1 — ทั้งวิชา, standalone) และเปิดพร้อม chatbot dock ไม่ได้ (กัน drawer ขวาซ้อนกัน)
   ทุกฟังก์ชันแชร์เป็น window.* (กฎ REAL)
   ========================================= */

