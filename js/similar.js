// REFACTOR/js/similar.js — Similar Questions v1: client-side similarity engine
// สองผู้ใช้ engine เดียวกัน: (1) แผงข้อสอบคล้ายกันใต้คำถาม (โชว์หลังตอบแล้วเท่านั้น — spoiler guard)
// (2) รายงานข้อออกบ่อยราย category (union-find clustering + copy เป็น Markdown)
// Client-side ล้วน ไม่แตะ backend — token-equality เหมือน relationsTokenize ฝั่ง GAS

// ── I. Engine ──────────────────────────────────────────────

// cache ต่อวิชา: invalidate เมื่อ window.APP.allQuestions ถูกแทนที่ (เปลี่ยนวิชา/sync ใหม่)
window._similarState = { source: null, count: 0, sets: [], byQid: {} };

window.similarTokenize = function (q) {
    const text = ((q.problem || '') + ' ' + (q.choices || '')).toLowerCase();
    const set = new Set();
    text.split(/[^a-z0-9ก-๙]+/).forEach(t => { if (t.length >= 2) set.add(t); });
    return set;
};

window.buildSimilarIndex = function () {
    const qs = window.APP.allQuestions || [];
    const st = window._similarState;
    if (st.source === qs && st.count === qs.length) return st;

    const rawSets = qs.map(q => window.similarTokenize(q));
    const df = {};
    rawSets.forEach(set => set.forEach(t => { df[t] = (df[t] || 0) + 1; }));
    // token ที่โผล่เกิน SIMILAR_STOPWORD_RATIO ของวิชา = stopword; ขั้นต่ำ 2 กันวิชาเล็กๆ ที่ 20% < 2
    // (token ร่วมมี df >= 2 เสมอ — cutoff ต่ำกว่า 2 จะฆ่าทุก match)
    const cutoff = Math.max(2, qs.length * window.SIMILAR_STOPWORD_RATIO);
    st.sets = rawSets.map(set => {
        const s = new Set();
        set.forEach(t => { if (df[t] <= cutoff) s.add(t); });
        return s;
    });
    st.source = qs;
    st.count = qs.length;
    st.byQid = {};
    return st;
};

window.similarSharedCount = function (a, b) {
    const small = a.size < b.size ? a : b;
    const big = small === a ? b : a;
    let shared = 0;
    small.forEach(t => { if (big.has(t)) shared++; });
    return shared;
};

// คืน [{q, score}] เรียง score มาก→น้อย, ไม่จำกัดจำนวน
// threshold คู่: shared >= SIMILAR_MIN_SHARED และ overlap coefficient >= SIMILAR_MIN_OVERLAP
// (absolute อย่างเดียวไม่ scale — ข้อยาวๆ ในวิชาใหญ่ match กันเองเป็นร้อยด้วยคำทั่วไป)
// รวมข้อซ้ำเป๊ะด้วย (นั่นแหละประเด็น — ข้อเดิมออกซ้ำคนละปีต้องขึ้นบนสุด), memoize ต่อ questionId
window.getSimilarQuestions = function (q) {
    const st = window.buildSimilarIndex();
    const qs = window.APP.allQuestions || [];
    const qid = q.questionId;
    if (st.byQid[qid]) return st.byQid[qid];

    const myIdx = qs.findIndex(x => x.questionId === qid);
    if (myIdx === -1) return [];
    const mySet = st.sets[myIdx];
    const results = [];
    for (let i = 0; i < qs.length; i++) {
        if (i === myIdx) continue;
        const other = st.sets[i];
        const minSize = Math.min(mySet.size, other.size);
        if (!minSize) continue;
        const shared = window.similarSharedCount(mySet, other);
        if (shared >= window.SIMILAR_MIN_SHARED && shared / minSize >= window.SIMILAR_MIN_OVERLAP) {
            results.push({ q: qs[i], score: shared });
        }
    }
    results.sort((a, b) => b.score - a.score);
    st.byQid[qid] = results;
    return results;
};

// ── II. Helpers ────────────────────────────────────────────

window.similarSnippet = function (text, maxLen) {
    let s = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
    return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

window.similarYearChip = function (q) {
    const meta = typeof window.parseQuestionMetadata === 'function'
        ? window.parseQuestionMetadata(q) : { year: 'N/A', examGroup: 'N/A' };
    if (meta.year === 'N/A') return '';
    const group = meta.examGroup !== 'N/A' ? ' ' + meta.examGroup : '';
    return `<span class="similar-year-chip">ปี ${meta.year}${group}</span>`;
};

// ── III. Surface 1: แผงข้อสอบคล้ายกันใต้คำถาม ─────────────────

window.renderSimilarPanel = function () {
    const q = window.APP.current_question;
    const $panel = $('#similar-panel');
    // spoiler guard: โชว์เฉพาะเมื่อตอบข้อนี้แล้ว (จังหวะเดียวกับคำอธิบายเฉลย)
    const revealed = q && q.questionId !== undefined && (q.state || window.APP.isShowingAllAnswers);
    if (!revealed || !window.APP.allQuestions || !window.APP.allQuestions.length) {
        $panel.hide();
        return;
    }
    window._similarPanelSims = window.getSimilarQuestions(q);
    $('#similar-panel-count').text(window._similarPanelSims.length);
    $('#similar-panel-list').hide().empty(); // เริ่มพับทุกข้อ — list สร้าง lazy ตอนกดกาง
    $('#similar-panel-toggle-icon').removeClass('open');
    $panel.show();
};

window.renderSimilarPanelList = function () {
    const sims = window._similarPanelSims || [];
    if (!sims.length) {
        $('#similar-panel-list').html('<p class="similar-empty">ไม่พบข้อสอบที่คล้ายกันในวิชานี้</p>');
        return;
    }
    const html = sims.map((s, i) => `
        <div class="similar-item" data-sim-idx="${i}">
            <span class="similar-badge">ตรงกัน ${s.score} คำ</span>${window.similarYearChip(s.q)}
            <span class="similar-item-stem">${window.similarSnippet(s.q.problem, 140)}</span>
        </div>`).join('');
    $('#similar-panel-list').html(html);
};

// ── IV. Preview modal (โครง markup เดียวกับ search-card ใน search.js) ──

window.buildSimilarPreviewHtml = function (q) {
    let categoryLabel = 'Unknown';
    if (window.APP.globalStructure.category) {
        const found = window.APP.globalStructure.category.find(t =>
            Array.isArray(q.category) ? q.category.includes(t.categoryId) : q.category === t.categoryId
        );
        if (found) categoryLabel = found.categoryName;
    }

    const imgArray = q.img ? q.img.split('///').map(u => u.trim()).filter(Boolean) : [];
    let problemImgs = '';
    if (imgArray.length > 0) {
        problemImgs = `
            <div class="search-card-images" style="margin: 10px 0;">
                <div class="search-image-gallery" style="position: relative; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border-radius: 8px; padding: 10px; min-height: 250px;">
                    <img src="${window.transformUrl(imgArray[0])}" class="search-gallery-main-img" style="max-width: 100%; max-height: 400px; object-fit: contain; cursor: pointer;">
                    ${imgArray.length > 1 ? `
                    <button class="search-gallery-prev" style="position: absolute; left: 5px; background: rgba(0,0,0,0.5); color: white; border: none; padding: 10px 12px; border-radius: 4px; cursor: pointer; z-index: 10;">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="search-gallery-next" style="position: absolute; right: 5px; background: rgba(0,0,0,0.5); color: white; border: none; padding: 10px 12px; border-radius: 4px; cursor: pointer; z-index: 10;">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <div class="search-gallery-counter" style="position: absolute; bottom: 10px; background: rgba(0,0,0,0.7); color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.9rem; font-weight: bold;">
                        1 / ${imgArray.length}
                    </div>
                    ` : ''}
                </div>
            </div>`;
    }

    const choicesList = q.choices ? q.choices.split('///').map((c, ci) => {
        const trimmed = c.trim();
        const hasPrefix = /^[A-E]\s*[\.\)]/i.test(trimmed);
        const prefix = hasPrefix ? "" : (String.fromCharCode(65 + ci) + ". ");

        if (window.isUrl(trimmed)) return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}</span><img src="${window.transformUrl(trimmed)}" style="height:40px;"></li>`;
        if (trimmed.startsWith('<svg')) return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}</span><div style="height:40px;">${trimmed}</div></li>`;
        return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}${trimmed}</span></li>`;
    }).join('') : '';

    const answerDisplay = window.isUrl(q.answer) ? `<img src="${window.transformUrl(q.answer)}" style="max-height:60px;">` : (q.answer || '');

    return `
        <div class="search-card" style="width: 100%; box-sizing: border-box;">
            <div class="search-card-header">
                <span class="search-card-category">${categoryLabel}</span>
                ${window.similarYearChip(q)}
            </div>
            <div class="search-card-body">
                <div class="search-card-problem">${(q.problem || '').replace(/\n/g, '<br>')}</div>
                ${problemImgs}
                <ul class="search-card-choices">${choicesList}</ul>
            </div>
            <div class="search-card-answer">
                <b>เฉลย:</b>
                <div class="search-card-answer-val">${answerDisplay}</div>
            </div>
            ${q.explain ? `
            <div class="search-card-footer">
                ${window.renderExplainHtmlForSearchCard(q.explain)}
            </div>` : ''}
            <div class="search-card-actions">
                <button class="btn-search-action btn-similar-report-q">
                    <i class="fas fa-exclamation-triangle"></i> แจ้งปัญหา
                </button>
                <button class="btn-search-action btn-similar-vote-q">
                    <i class="fas fa-tags"></i> แยกเลค
                </button>
            </div>
        </div>`;
};

window.openSimilarPreview = function (q) {
    const $body = $('#similar-preview-body');
    $body.html(window.buildSimilarPreviewHtml(q));

    const imgArray = q.img ? q.img.split('///').map(u => u.trim()).filter(Boolean) : [];
    if (imgArray.length > 0) {
        let currentIdx = 0;
        const $mainImg = $body.find('.search-gallery-main-img');
        const $counter = $body.find('.search-gallery-counter');
        const showIdx = () => {
            $mainImg.attr('src', window.transformUrl(imgArray[currentIdx]));
            $counter.text(`${currentIdx + 1} / ${imgArray.length}`);
        };
        $body.find('.search-gallery-prev').on('click', function (e) {
            e.preventDefault();
            currentIdx = (currentIdx - 1 + imgArray.length) % imgArray.length;
            showIdx();
        });
        $body.find('.search-gallery-next').on('click', function (e) {
            e.preventDefault();
            currentIdx = (currentIdx + 1) % imgArray.length;
            showIdx();
        });
        $mainImg.on('click', function () {
            window.open(window.transformUrl(imgArray[currentIdx]), '_blank');
        });
    }

    $body.find('.btn-similar-report-q').on('click', function () { window.openReportModal(q); });
    $body.find('.btn-similar-vote-q').on('click', function () { window.openVoteModal(q, false); });

    $('#similar-preview-modal').fadeIn(200);
    setTimeout(window.renderAllMath, 50);
};

// ── V. Surface 2: รายงานข้อออกบ่อยราย category ─────────────────

// clustering ราย category: union-find, edge = overlap coefficient >= CLUSTER_OVERLAP
// (คนละ threshold กับแผง — ใช้ >=3 token ตรงนี้จะ chain ทั้ง category เป็นก้อนเดียว)
window.buildSimilarReportData = function () {
    const st = window.buildSimilarIndex();
    const qs = window.APP.allQuestions || [];
    const catList = window.APP.globalStructure.category || [];
    const data = [];

    catList.forEach(cat => {
        const idxs = [];
        qs.forEach((q, i) => {
            const cats = Array.isArray(q.category) ? q.category : [q.category];
            if (cats.includes(cat.categoryId)) idxs.push(i);
        });
        if (!idxs.length) return;

        const parent = {};
        idxs.forEach(i => { parent[i] = i; });
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

        for (let a = 0; a < idxs.length; a++) {
            for (let b = a + 1; b < idxs.length; b++) {
                const A = st.sets[idxs[a]], B = st.sets[idxs[b]];
                const minSize = Math.min(A.size, B.size);
                if (!minSize) continue;
                if (window.similarSharedCount(A, B) / minSize >= window.CLUSTER_OVERLAP) union(idxs[a], idxs[b]);
            }
        }

        const groups = {};
        idxs.forEach(i => { const r = find(i); (groups[r] = groups[r] || []).push(i); });

        const clusters = Object.values(groups).map(members => {
            const withYear = members.map(i => {
                const meta = typeof window.parseQuestionMetadata === 'function'
                    ? window.parseQuestionMetadata(qs[i]) : { year: 'N/A' };
                return { i, year: parseInt(meta.year) || 0 };
            });
            withYear.sort((x, y) => y.year - x.year); // ตัวแทน = ข้อปีล่าสุด
            const years = [...new Set(withYear.map(m => m.year).filter(Boolean))].sort((a, b) => a - b);
            return { members: withYear.map(m => m.i), years };
        });
        clusters.sort((a, b) => b.members.length - a.members.length);
        data.push({ catName: cat.categoryName, clusters });
    });
    return data;
};

window.renderSimilarReport = function () {
    const qs = window.APP.allQuestions || [];
    const showSingles = $('#similar-report-singleton-toggle').is(':checked');
    const data = window._similarReportData || [];
    let html = '';

    data.forEach((cat, ci) => {
        const visible = cat.clusters
            .map((cl, clIdx) => ({ cl, clIdx }))
            .filter(x => showSingles || x.cl.members.length >= 2);
        if (!visible.length) return;

        html += `
        <div class="similar-report-cat">
            <div class="similar-report-cat-head">
                <h3>${cat.catName}</h3>
                <button class="btn-xs teal similar-copy-md-btn" data-ci="${ci}"><i class="fas fa-copy"></i> คัดลอก Markdown</button>
            </div>`;

        visible.forEach(({ cl, clIdx }) => {
            const rep = qs[cl.members[0]];
            const yearChips = cl.years.map(y => `<span class="similar-year-chip">ปี ${y}</span>`).join('');
            const memberRows = cl.members.map(mi => `
                <div class="similar-member-row" data-qidx="${mi}">
                    ${window.similarYearChip(qs[mi]) || '<span class="similar-year-chip">ปี ?</span>'}
                    <span>${window.similarSnippet(qs[mi].problem, 120)}</span>
                </div>`).join('');

            html += `
            <div class="similar-cluster">
                <div class="similar-cluster-head" data-ci="${ci}" data-cl="${clIdx}">
                    <span class="similar-badge">ออก ${cl.members.length} ครั้ง</span>
                    ${yearChips}
                    <span class="similar-cluster-stem">${window.similarSnippet(rep.problem, 140)}</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="similar-cluster-members" style="display:none;">${memberRows}</div>
            </div>`;
        });

        html += `</div>`;
    });

    $('#similar-report-content').html(html || '<p class="similar-empty" style="text-align:center;">ไม่พบคลัสเตอร์ข้อสอบซ้ำในวิชานี้</p>');
};

window.openSimilarReport = function () {
    if (!window.APP.allQuestions || !window.APP.allQuestions.length) {
        Swal.fire('ยังไม่มีข้อสอบ', 'กรุณาเลือกวิชาเพื่อโหลดข้อสอบก่อน', 'info');
        return;
    }
    window._similarReportData = window.buildSimilarReportData();
    window.renderSimilarReport();
    $('#similar-report-overlay').fadeIn(200);
};

window.copySimilarCategoryMarkdown = function (ci) {
    const qs = window.APP.allQuestions || [];
    const cat = (window._similarReportData || [])[ci];
    if (!cat) return;
    const showSingles = $('#similar-report-singleton-toggle').is(':checked');

    let md = `## ${cat.catName}\n`;
    cat.clusters.filter(cl => showSingles || cl.members.length >= 2).forEach(cl => {
        const years = cl.years.length ? ` (ปี ${cl.years.join(', ')})` : '';
        md += `- ออก ${cl.members.length} ครั้ง${years}: ${window.similarSnippet(qs[cl.members[0]].problem, 200)}\n`;
    });

    const done = () => window.bgToast.fire({ icon: 'success', title: 'คัดลอก Markdown แล้ว' });
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(done).catch(() => window.similarCopyFallback(md, done));
    } else {
        window.similarCopyFallback(md, done);
    }
};

window.similarCopyFallback = function (text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { }
    document.body.removeChild(ta);
};

// ── VI. Wiring ─────────────────────────────────────────────

// Hook showQuestion: วาด/ซ่อนแผงทุกครั้งที่เรนเดอร์ข้อ (decorator pattern เดียวกับ meq.js)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[Similar] window.showQuestion not found at hook time — similar panel will not render');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        window.renderSimilarPanel();
    };
})();

$(function () {
    $('#similar-panel-header').on('click', function () {
        const $list = $('#similar-panel-list');
        if ($list.is(':visible')) {
            $list.slideUp(150);
            $('#similar-panel-toggle-icon').removeClass('open');
        } else {
            if (!$list.children().length) window.renderSimilarPanelList();
            $list.slideDown(150);
            $('#similar-panel-toggle-icon').addClass('open');
        }
    });

    $(document).on('click', '#similar-panel-list .similar-item', function () {
        const sim = (window._similarPanelSims || [])[$(this).data('sim-idx')];
        if (sim) window.openSimilarPreview(sim.q);
    });

    $('#close-similar-preview').on('click', function () {
        $('#similar-preview-modal').fadeOut(150);
    });

    $('#open-similar-report-btn').on('click', window.openSimilarReport);
    $('#close-similar-report').on('click', function () {
        $('#similar-report-overlay').fadeOut(150);
    });
    $('#similar-report-singleton-toggle').on('change', window.renderSimilarReport);

    $(document).on('click', '.similar-cluster-head', function () {
        $(this).next('.similar-cluster-members').slideToggle(150);
        $(this).find('.fa-chevron-down').toggleClass('open');
    });

    $(document).on('click', '.similar-member-row', function () {
        const q = (window.APP.allQuestions || [])[$(this).data('qidx')];
        if (q) window.openSimilarPreview(q);
    });

    $(document).on('click', '.similar-copy-md-btn', function (e) {
        e.stopPropagation();
        window.copySimilarCategoryMarkdown($(this).data('ci'));
    });
});
