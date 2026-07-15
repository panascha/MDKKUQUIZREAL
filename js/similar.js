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

window.similarYearOf = function (q) {
    return typeof window.parseQuestionMetadata === 'function'
        ? window.parseQuestionMetadata(q).year : 'N/A';
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
    // จุดประสงค์ของระบบ: เช็คว่าข้อนี้มีโอกาสออกซ้ำจากปีอื่นไหม — แสดงเฉพาะข้อคล้ายที่มาจาก "ปีอื่น" เท่านั้น
    // ปีอ่านจาก category[0] (Default_CategoryID) ผ่าน parseQuestionMetadata; ปีเดียวกัน/ไม่ระบุปีไม่แสดง
    const myYear = window.similarYearOf(q);
    const sims = myYear === 'N/A' ? []
        : window.getSimilarQuestions(q).filter(s => {
            const y = window.similarYearOf(s.q);
            return y !== 'N/A' && y !== myYear;
        });

    window._similarPanelSims = sims;
    $('#similar-panel-count').text(sims.length);
    $('#similar-panel-list').hide().empty(); // เริ่มพับทุกข้อ — list สร้าง lazy ตอนกดกาง
    $('#similar-panel-toggle-icon').removeClass('open');
    $panel.show();
};

window.renderSimilarPanelList = function () {
    const sims = window._similarPanelSims || [];
    if (!sims.length) {
        $('#similar-panel-list').html('<p class="similar-empty">ไม่พบข้อสอบคล้ายกันจากปีอื่น</p>');
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

// wiring แยกต่อการ์ด — $card คือ .search-card เฉพาะใบ; scope ทุก handler ด้วย $card.find
// เพื่อให้หลายการ์ดอยู่ใน DOM พร้อมกันได้ (cluster stack, compare 2 คอลัมน์) โดย gallery/ปุ่มไม่ชนกัน
window.wireSimilarCard = function ($card, q) {
    const imgArray = q.img ? q.img.split('///').map(u => u.trim()).filter(Boolean) : [];
    if (imgArray.length > 0) {
        let currentIdx = 0;
        const $mainImg = $card.find('.search-gallery-main-img');
        const $counter = $card.find('.search-gallery-counter');
        const showIdx = () => {
            $mainImg.attr('src', window.transformUrl(imgArray[currentIdx]));
            $counter.text(`${currentIdx + 1} / ${imgArray.length}`);
        };
        $card.find('.search-gallery-prev').on('click', function (e) {
            e.preventDefault();
            currentIdx = (currentIdx - 1 + imgArray.length) % imgArray.length;
            showIdx();
        });
        $card.find('.search-gallery-next').on('click', function (e) {
            e.preventDefault();
            currentIdx = (currentIdx + 1) % imgArray.length;
            showIdx();
        });
        $mainImg.on('click', function () {
            window.open(window.transformUrl(imgArray[currentIdx]), '_blank');
        });
    }

    $card.find('.btn-similar-report-q').on('click', function () { window.openReportModal(q); });
    $card.find('.btn-similar-vote-q').on('click', function () { window.openVoteModal(q, false); });
};

window.openSimilarPreview = function (q) {
    const $body = $('#similar-preview-body');
    $('#similar-preview-modal').removeClass('compare-wide');
    $body.html(window.buildSimilarPreviewHtml(q));
    window.wireSimilarCard($body.find('.search-card'), q);
    $('#similar-preview-modal').fadeIn(200);
    setTimeout(window.renderAllMath, 50);
};

// เทียบข้อปัจจุบัน (ซ้าย) กับข้อคล้ายจากปีอื่น (ขวา) ในภาพเดียว — ไม่ต้องสลับหน้าต่างไปมา
// ปุ่ม ก่อนหน้า/ถัดไป เลื่อนดูข้อคล้ายทั้งหมดใน _similarPanelSims โดยข้อปัจจุบัน (ซ้าย) คงเดิม
window.openSimilarCompare = function (startIdx) {
    const cur = window.APP.current_question;
    const sims = window._similarPanelSims || [];
    if (!cur || !sims.length) return;
    window._similarCompareIdx = Math.max(0, Math.min(startIdx || 0, sims.length - 1));

    const $body = $('#similar-preview-body');
    $('#similar-preview-modal').addClass('compare-wide');
    $body.html(`
        <div class="similar-compare">
            <div class="similar-compare-col">
                <div class="similar-compare-head">ข้อปัจจุบัน ${window.similarYearChip(cur)}</div>
                <div class="similar-compare-slot" data-side="cur"></div>
            </div>
            <div class="similar-compare-col">
                <div class="similar-compare-head">
                    <span>ข้อคล้ายจากปีอื่น <span class="similar-compare-simyear"></span></span>
                    <span class="similar-compare-nav">
                        <button class="similar-compare-prev" title="ก่อนหน้า"><i class="fas fa-chevron-left"></i></button>
                        <span class="similar-compare-pos"></span>
                        <button class="similar-compare-next" title="ถัดไป"><i class="fas fa-chevron-right"></i></button>
                    </span>
                </div>
                <div class="similar-compare-slot" data-side="sim"></div>
            </div>
        </div>`);

    const $cur = $body.find('[data-side="cur"]');
    $cur.html(window.buildSimilarPreviewHtml(cur));
    window.wireSimilarCard($cur.find('.search-card'), cur);

    window.renderSimilarCompareSim();
    $('#similar-preview-modal').fadeIn(200);
};

// เรนเดอร์เฉพาะคอลัมน์ขวา (ข้อคล้าย) ตาม _similarCompareIdx + อัปเดตปุ่มนำทาง
window.renderSimilarCompareSim = function () {
    const sims = window._similarPanelSims || [];
    const idx = window._similarCompareIdx || 0;
    const simQ = sims[idx] && sims[idx].q;
    if (!simQ) return;

    const $sim = $('#similar-preview-body [data-side="sim"]');
    $sim.html(window.buildSimilarPreviewHtml(simQ));
    window.wireSimilarCard($sim.find('.search-card'), simQ);

    $('.similar-compare-simyear').html(window.similarYearChip(simQ));
    $('.similar-compare-pos').text(`${idx + 1} / ${sims.length}`);
    $('.similar-compare-prev').prop('disabled', idx === 0);
    $('.similar-compare-next').prop('disabled', idx === sims.length - 1);
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
        // จัดกลุ่มเฉพาะหมวด lecture (category[1] / Standardized_CategoryID) — ไม่เอาหมวดปี (category[0])
        const idxs = [];
        qs.forEach((q, i) => {
            const cats = Array.isArray(q.category) ? q.category : [q.category];
            if (cats[1] === cat.categoryId) idxs.push(i);
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
        data.push({
            catName: cat.categoryName,
            catId: cat.categoryId,
            accordionGroup: cat.accordionGroup || 'อื่นๆ',
            clusters
        });
    });
    return data;
};

// จำนวน "ข้อซ้ำ" ของหัวข้อ = ผลรวมสมาชิกในคลัสเตอร์ที่ออก >=2 ครั้ง (ใช้ทั้ง chart และเรียงลำดับ)
window.similarCatRepeatCount = function (cat) {
    return cat.clusters.reduce((s, cl) => s + (cl.members.length >= 2 ? cl.members.length : 0), 0);
};

// เติม dropdown เลือกหัวข้อ (lecture) — เฉพาะหัวข้อที่มีคลัสเตอร์ เรียงตามจำนวนข้อซ้ำมาก→น้อย
window.populateSimilarLectureFilter = function () {
    const data = window._similarReportData || [];
    const prev = $('#similar-report-lecture-filter').val() || '';
    const opts = data
        .map((cat, ci) => ({ cat, ci, n: window.similarCatRepeatCount(cat) }))
        .filter(x => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .map(x => `<option value="${x.cat.catId}">${x.cat.catName} (${x.n})</option>`)
        .join('');
    $('#similar-report-lecture-filter').html(`<option value="">ทุกหัวข้อ</option>${opts}`).val(prev);
};

// bar chart แบบ div (ไม่พึ่ง lib) — Top หัวข้อ ตามจำนวนข้อซ้ำ
window.renderSimilarReportChart = function () {
    const rows = (window._similarReportData || [])
        .map(cat => ({ name: cat.catName, count: window.similarCatRepeatCount(cat) }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    if (!rows.length) { $('#similar-report-chart').empty(); return; }
    const max = rows[0].count;
    const bars = rows.map(r => `
        <div class="chart-row">
            <span class="chart-label" title="${r.name}">${r.name}</span>
            <div class="chart-bar-track"><div class="chart-bar" style="width:${(r.count / max * 100).toFixed(1)}%"></div></div>
            <span class="chart-val">${r.count}</span>
        </div>`).join('');
    $('#similar-report-chart').html(
        `<h3 class="chart-title"><i class="fas fa-fire"></i> หัวข้อที่ออกซ้ำบ่อยสุด (Top ${rows.length})</h3>${bars}`
    );
};

window.renderSimilarReport = function () {
    const qs = window.APP.allQuestions || [];
    const showSingles = $('#similar-report-singleton-toggle').is(':checked');
    const lectureFilter = $('#similar-report-lecture-filter').val() || '';
    const data = window._similarReportData || [];

    // จัดกลุ่มตาม accordionGroup; กลุ่มเรียงตามชื่อ, หัวข้อในกลุ่มเรียงตามจำนวนข้อซ้ำมาก→น้อย
    const groups = {};
    data.forEach((cat, ci) => {
        if (lectureFilter && cat.catId !== lectureFilter) return;
        const g = cat.accordionGroup || 'อื่นๆ';
        (groups[g] = groups[g] || []).push({ cat, ci });
    });

    let html = '';
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'th')).forEach(gName => {
        const cats = groups[gName].slice()
            .sort((x, y) => window.similarCatRepeatCount(y.cat) - window.similarCatRepeatCount(x.cat));

        let groupHtml = '';
        cats.forEach(({ cat, ci }) => {
            const visible = cat.clusters
                .map((cl, clIdx) => ({ cl, clIdx }))
                .filter(x => showSingles || x.cl.members.length >= 2);
            if (!visible.length) return;

            let clustersHtml = '';
            visible.forEach(({ cl, clIdx }) => {
                const rep = qs[cl.members[0]];
                const yearChips = cl.years.map(y => `<span class="similar-year-chip">ปี ${y}</span>`).join('');
                clustersHtml += `
                <div class="similar-cluster">
                    <div class="similar-cluster-head" data-ci="${ci}" data-cl="${clIdx}">
                        <span class="similar-badge">ออก ${cl.members.length} ครั้ง</span>
                        ${yearChips}
                        <span class="similar-cluster-stem">${window.similarSnippet(rep.problem, 140)}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="similar-cluster-members" style="display:none;"></div>
                </div>`;
            });

            // หัวข้อกางได้ (dropdown) — เปิดอัตโนมัติเมื่อกรองเหลือหัวข้อเดียว, ที่เหลือพับไว้
            const bodyStyle = lectureFilter ? '' : 'display:none;';
            const chevOpen = lectureFilter ? ' open' : '';
            groupHtml += `
            <div class="similar-report-cat">
                <div class="similar-report-cat-head">
                    <i class="fas fa-chevron-down similar-cat-chevron${chevOpen}"></i>
                    <h3>${cat.catName}</h3>
                    <span class="similar-cat-count">${visible.length}</span>
                    <button class="btn-xs teal similar-copy-md-btn" data-ci="${ci}"><i class="fas fa-copy"></i> คัดลอก Markdown</button>
                </div>
                <div class="similar-report-cat-body" style="${bodyStyle}">${clustersHtml}</div>
            </div>`;
        });

        if (groupHtml) {
            html += `<div class="similar-report-group"><h2 class="similar-report-group-head">${gName}</h2>${groupHtml}</div>`;
        }
    });

    $('#similar-report-content').html(html || '<p class="similar-empty" style="text-align:center;">ไม่พบคลัสเตอร์ข้อสอบซ้ำในวิชานี้</p>');
};

// เรนเดอร์การ์ดเต็มของคลัสเตอร์แบบ lazy (ตอนกางครั้งแรก) — ข้อซ้ำทั้งหมดเรียงลงมาในภาพเดียว
window.renderSimilarClusterCards = function ($members, ci, cl) {
    const cluster = (((window._similarReportData || [])[ci] || {}).clusters || [])[cl];
    if (!cluster) return;
    const qs = window.APP.allQuestions || [];
    $members.empty();
    cluster.members.forEach(mi => {
        const $wrap = $('<div class="similar-cluster-card"></div>').html(window.buildSimilarPreviewHtml(qs[mi]));
        $members.append($wrap);
        window.wireSimilarCard($wrap.find('.search-card'), qs[mi]);
    });
    $members.data('rendered', true);
    setTimeout(window.renderAllMath, 50);
};

window.openSimilarReport = function () {
    if (!window.APP.allQuestions || !window.APP.allQuestions.length) {
        Swal.fire('ยังไม่มีข้อสอบ', 'กรุณาเลือกวิชาเพื่อโหลดข้อสอบก่อน', 'info');
        return;
    }
    window._similarReportData = window.buildSimilarReportData();
    window.populateSimilarLectureFilter();
    window.renderSimilarReportChart();
    window.renderSimilarReport();
    $('#similar-report-overlay').fadeIn(200);
};

// Markdown ของทุกหัวข้อที่แสดงอยู่ (เคารพ singleton toggle + lecture filter)
window.buildSimilarReportMarkdown = function () {
    const qs = window.APP.allQuestions || [];
    const showSingles = $('#similar-report-singleton-toggle').is(':checked');
    const lectureFilter = $('#similar-report-lecture-filter').val() || '';
    const subj = new URLSearchParams(location.search).get('subject') || '';
    let md = `# ข้อออกบ่อย${subj ? ' — ' + subj : ''}\n\n`;
    (window._similarReportData || []).forEach(cat => {
        if (lectureFilter && cat.catId !== lectureFilter) return;
        const clusters = cat.clusters.filter(cl => showSingles || cl.members.length >= 2);
        if (!clusters.length) return;
        md += `## ${cat.catName}\n`;
        clusters.forEach(cl => {
            const years = cl.years.length ? ` (ปี ${cl.years.join(', ')})` : '';
            md += `- ออก ${cl.members.length} ครั้ง${years}: ${window.similarSnippet(qs[cl.members[0]].problem, 200)}\n`;
        });
        md += `\n`;
    });
    return md;
};

window.copySimilarReportMarkdown = function () {
    const md = window.buildSimilarReportMarkdown();
    const done = () => window.bgToast.fire({ icon: 'success', title: 'คัดลอก Markdown ทั้งหมดแล้ว' });
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(done).catch(() => window.similarCopyFallback(md, done));
    } else {
        window.similarCopyFallback(md, done);
    }
};

// PDF = พิมพ์ผ่าน browser (@media print โชว์เฉพาะ overlay) — กางทุกคลัสเตอร์ให้เต็มก่อนพิมพ์
window.exportSimilarReportPDF = function () {
    $('.similar-report-cat-body').show();
    $('.similar-cat-chevron').addClass('open');
    $('.similar-cluster').each(function () {
        const $members = $(this).find('.similar-cluster-members');
        if (!$members.data('rendered')) {
            const $head = $(this).find('.similar-cluster-head');
            window.renderSimilarClusterCards($members, $head.data('ci'), $head.data('cl'));
        }
        $members.show();
        $(this).find('.fa-chevron-down').addClass('open');
    });
    setTimeout(function () { window.renderAllMath(); setTimeout(function () { window.print(); }, 400); }, 300);
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
        window.openSimilarCompare($(this).data('sim-idx'));
    });

    $(document).on('click', '.similar-compare-prev', function () {
        if ((window._similarCompareIdx || 0) > 0) {
            window._similarCompareIdx--;
            window.renderSimilarCompareSim();
        }
    });
    $(document).on('click', '.similar-compare-next', function () {
        if ((window._similarCompareIdx || 0) < (window._similarPanelSims || []).length - 1) {
            window._similarCompareIdx++;
            window.renderSimilarCompareSim();
        }
    });

    $('#close-similar-preview').on('click', function () {
        $('#similar-preview-modal').fadeOut(150);
    });

    $('#open-similar-report-btn').on('click', window.openSimilarReport);
    $('#close-similar-report').on('click', function () {
        $('#similar-report-overlay').fadeOut(150);
    });
    $('#similar-report-singleton-toggle').on('change', function () {
        window.renderSimilarReport();
    });
    $('#similar-report-lecture-filter').on('change', window.renderSimilarReport);
    $('#similar-report-export-md').on('click', window.copySimilarReportMarkdown);
    $('#similar-report-export-pdf').on('click', window.exportSimilarReportPDF);

    // กางหัวข้อ (dropdown) → โชว์/ซ่อนคลัสเตอร์ของหัวข้อนั้น (ไม่นับคลิกปุ่มคัดลอก)
    $(document).on('click', '.similar-report-cat-head', function (e) {
        if ($(e.target).closest('.similar-copy-md-btn').length) return;
        $(this).find('.similar-cat-chevron').toggleClass('open');
        $(this).next('.similar-report-cat-body').slideToggle(150);
    });

    // กางคลัสเตอร์ → เรนเดอร์การ์ดเต็มแบบ lazy ครั้งแรก แล้วเรียงลงมาในภาพเดียว
    $(document).on('click', '.similar-cluster-head', function () {
        const $members = $(this).next('.similar-cluster-members');
        $(this).find('.fa-chevron-down').toggleClass('open');
        if (!$members.data('rendered')) {
            window.renderSimilarClusterCards($members, $(this).data('ci'), $(this).data('cl'));
        }
        $members.slideToggle(150);
    });

    $(document).on('click', '.similar-copy-md-btn', function (e) {
        e.stopPropagation();
        window.copySimilarCategoryMarkdown($(this).data('ci'));
    });
});
