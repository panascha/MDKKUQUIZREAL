// REFACTOR/js/study-sets.js — Study Sets: (A) ชุดข้อสอบของฉัน + (B) ฝึกข้อที่เคยผิด
// REAL frontend ล้วน ไม่แตะ backend. โหลดหลัง similar.js (ใช้ cluster engine ร่วมกัน)
// ทุกฟังก์ชันอยู่บน window.* ตาม invariant ของ repo
//
// Feature A — ชุดข้อสอบซ้ำแบบตั้งชื่อ+แก้ได้ (persistent):
//   storage IndexedDB `custom_sets_<subject>`: [{id,name,qids[],createdAt}]
//   seed จากคลัสเตอร์ของ similar.js (buildSimilarReportData) — ตัวแทน 1 ข้อ/คลัสเตอร์ (สุ่มตอนสร้าง)
// Feature B — ฝึกข้อที่เคยผิด (virtual filter):
//   storage IndexedDB `wrong_history_<subject>`: {qid:{failCount,lastWrongAt,correctStreak}}
//   เขียนตอน submit (hook) — อยู่แยกจาก currentQuestions จึงรอด reload/เปลี่ยนตัวกรอง
//   ออกจาก log เมื่อ "ถูกติดกัน 2 ครั้ง" (ทุกโหมด)

window.WRONG_LEAVE_STREAK = 2; // ตอบถูกติดกันกี่ครั้งถึงเอาออกจากคลังข้อที่เคยผิด

// ── 0. Storage helpers (memoize per subject) ─────────────────

window.studySubjectKey = function () {
    return new URLSearchParams(location.search).get('subject') || 'default';
};

window._wrongHistCache = {};
window._wrongHistLoad = {};
window.ensureWrongHistory = function (subj) {
    if (window._wrongHistCache[subj]) return Promise.resolve(window._wrongHistCache[subj]);
    if (window._wrongHistLoad[subj]) return window._wrongHistLoad[subj];
    window._wrongHistLoad[subj] = window.getCacheDB('wrong_history_' + subj)
        .then(d => {
            const log = (d && typeof d === 'object') ? d : {};
            window._wrongHistCache[subj] = log;
            return log;
        })
        .catch(() => { const log = {}; window._wrongHistCache[subj] = log; return log; });
    return window._wrongHistLoad[subj];
};

window._customSetsCache = {};
window._customSetsLoad = {};
window.ensureCustomSets = function (subj) {
    if (window._customSetsCache[subj]) return Promise.resolve(window._customSetsCache[subj]);
    if (window._customSetsLoad[subj]) return window._customSetsLoad[subj];
    window._customSetsLoad[subj] = window.getCacheDB('custom_sets_' + subj)
        .then(d => {
            const sets = Array.isArray(d) ? d : [];
            window._customSetsCache[subj] = sets;
            return sets;
        })
        .catch(() => { const sets = []; window._customSetsCache[subj] = sets; return sets; });
    return window._customSetsLoad[subj];
};

// ── I. Feature B: wrong-answer history ───────────────────────

// hook เดียวจาก submitQuestion — correct=true/false ของข้อที่เพิ่งตอบ
window.recordAnswerResult = async function (qid, correct) {
    if (qid === undefined || qid === null) return;
    const subj = window.studySubjectKey();
    const log = await window.ensureWrongHistory(subj);
    const key = String(qid);
    const entry = log[key];
    if (correct) {
        if (!entry) return; // ไม่เคยผิด → ไม่ต้องทำอะไร
        entry.correctStreak = (entry.correctStreak || 0) + 1;
        if (entry.correctStreak >= window.WRONG_LEAVE_STREAK) delete log[key];
    } else {
        if (entry) {
            entry.failCount = (entry.failCount || 0) + 1;
            entry.lastWrongAt = Date.now();
            entry.correctStreak = 0;
        } else {
            log[key] = { failCount: 1, lastWrongAt: Date.now(), correctStreak: 0 };
        }
    }
    try { await window.setCacheDB('wrong_history_' + subj, log); } catch (e) { console.warn('[StudySets] save wrong_history failed', e); }
    window.updateWrongPracticeButton();
};

// qids ที่ยังอยู่ใน log ∩ allQuestions — lazy-drop ข้อที่ถูกลบไปแล้ว (คืน questionId จริง)
window.getWrongPracticeQids = function () {
    const subj = window.studySubjectKey();
    const log = window._wrongHistCache[subj];
    if (!log) return [];
    const qs = window.APP.allQuestions || [];
    const byId = {};
    qs.forEach(q => { byId[String(q.questionId)] = q; });
    let pruned = false;
    const out = [];
    Object.keys(log).forEach(key => {
        const q = byId[key];
        if (q) out.push(q.questionId);
        else { delete log[key]; pruned = true; }
    });
    if (pruned) window.setCacheDB('wrong_history_' + subj, log).catch(() => { });
    return out;
};

window.updateWrongPracticeButton = function () {
    if (!$('#wrong-practice-btn').length) return;
    const subj = window.studySubjectKey();
    if (!window._wrongHistCache[subj]) {
        window.ensureWrongHistory(subj).then(window.updateWrongPracticeButton);
        return;
    }
    const n = window.getWrongPracticeQids().length;
    $('#wrong-practice-count').text(n);
    $('#wrong-practice-btn')
        .prop('disabled', n === 0)
        .attr('title', n === 0 ? 'ยังไม่มีข้อที่เคยตอบผิด — ตอบผิดข้อไหนระบบจะจำไว้ให้ฝึกซ้ำ' : '');
};

window.launchWrongPractice = function () {
    const qs = window.APP.allQuestions || [];
    if (!qs.length) return;
    const ids = window.getWrongPracticeQids();
    if (!ids.length) {
        Swal.fire('ยังไม่มีข้อที่เคยผิด', 'ตอบผิดข้อไหนก่อน ระบบจะจำไว้ให้ฝึกซ้ำที่นี่', 'info');
        return;
    }
    const byId = {};
    qs.forEach(q => { byId[String(q.questionId)] = q; });
    window.APP.filterMode = 'wrong-practice';
    window.setFilterMode('wrong-practice', true); // อัปเดตหน้าจอตัวกรอง, ไม่ rebuild
    window.studyLoadQuestions(ids.map(id => byId[String(id)]).filter(Boolean));
    window.bgToast.fire({ icon: 'success', title: 'โหมดฝึกข้อที่เคยผิด (' + ids.length + ' ข้อ)' });
};

// ── II. Shared loader: ยัด question array ลง currentQuestions แล้วแสดง ─────
window.studyLoadQuestions = function (qArr) {
    window.APP.currentQuestions = (qArr || []).map(q => ({
        ...q, state: false, select: "", attemptCount: 0, failCount: 0
    }));
    if (typeof window.sortCurrentQuestions === 'function') window.sortCurrentQuestions();
    window.APP.score = 0;
    window.APP.questionIndex = 0;
    $('#score').text('0/' + window.APP.currentQuestions.length);
    $('#image-container-div').hide();
    if (window.APP.currentQuestions.length > 0) {
        window.showQuestion(false);
        window.preloadQuizImages(window.APP.currentQuestions);
    }
    if (typeof window.updateProgressHeader === 'function') window.updateProgressHeader();
    window.updateSelectedCategoryStatus && window.updateSelectedCategoryStatus();
    window.saveProgressToCache();
    const qc = document.getElementById('quiz-container');
    if (qc) qc.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── III. Feature A: custom sets (storage + open + editor) ─────

// คลัสเตอร์ทั้งหมดของวิชานี้ (จาก engine ของ similar.js) — เฉพาะคลัสเตอร์ที่มีสมาชิก >= 2
window.getSubjectClusters = function () {
    const data = window.buildSimilarReportData();
    const qs = window.APP.allQuestions || [];
    const out = [];
    data.forEach(cat => cat.clusters.forEach((cl, clIdx) => {
        if (cl.members.length < 2) return;
        out.push({
            catId: cat.catId,
            catName: cat.catName,
            clIdx,
            years: cl.years,
            qids: cl.members.map(i => qs[i].questionId)
        });
    }));
    return out;
};

// สร้างชุดจากรายการคลัสเตอร์ ({qids:[...]}) — ตัวแทน 1 ข้อ/คลัสเตอร์ สุ่มตอนสร้าง
window.createSetFromClusters = async function (clusterList, name) {
    const subj = window.studySubjectKey();
    const sets = await window.ensureCustomSets(subj);
    const qids = [];
    (clusterList || []).forEach(cl => {
        const m = cl.qids || [];
        if (!m.length) return;
        const pick = m[Math.floor(Math.random() * m.length)];
        if (!qids.some(x => String(x) === String(pick))) qids.push(pick);
    });
    if (!qids.length) {
        Swal.fire('ไม่มีข้อ', 'ไม่พบคลัสเตอร์ที่เลือก', 'info');
        return null;
    }
    const set = {
        id: 'set_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: name || ('ชุด ' + (sets.length + 1)),
        qids,
        createdAt: Date.now()
    };
    sets.push(set);
    await window.setCacheDB('custom_sets_' + subj, sets);
    window.renderMySetsList();
    window.bgToast.fire({ icon: 'success', title: 'สร้างชุด "' + set.name + '" (' + qids.length + ' ข้อ)' });
    return set;
};

window.renderMySetsList = function () {
    const $list = $('#my-sets-list');
    if (!$list.length) return;
    const subj = window.studySubjectKey();
    if (!window._customSetsCache[subj]) {
        window.ensureCustomSets(subj).then(window.renderMySetsList);
        return;
    }
    const sets = window._customSetsCache[subj] || [];
    if (!sets.length) {
        $list.html('<p style="text-align:center;color:var(--color-text-muted);font-size:0.9rem;margin:6px 0;">ยังไม่มีชุด — กด "สร้างชุดใหม่" ด้านล่าง หรือสร้างจากปุ่ม "ข้อออกบ่อย"</p>');
        return;
    }
    const html = sets.map(s => `
        <div class="my-set-row" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--color-border-soft);border-radius:8px;background:var(--color-surface);">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${window.similarSnippet(s.name, 60)}</div>
                <div style="font-size:0.8rem;color:var(--color-text-muted);">${s.qids.length} ข้อ · ${new Date(s.createdAt).toLocaleDateString('th-TH')}</div>
            </div>
            <button class="btn-xs teal my-set-open" data-id="${s.id}"><i class="fas fa-play"></i> เปิด</button>
            <button class="btn-xs my-set-edit" data-id="${s.id}" style="background:var(--color-surface-2);color:var(--color-text);"><i class="fas fa-pen"></i></button>
            <button class="btn-xs my-set-delete" data-id="${s.id}" style="background:#fee2e2;color:#b91c1c;"><i class="fas fa-trash"></i></button>
        </div>`).join('');
    $list.html(html);
};

window.openCustomSet = async function (setId) {
    const subj = window.studySubjectKey();
    const sets = await window.ensureCustomSets(subj);
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    const qs = window.APP.allQuestions || [];
    const byId = {};
    qs.forEach(q => { byId[String(q.questionId)] = q; });
    const valid = set.qids.filter(id => byId[String(id)]);
    if (valid.length < set.qids.length) { // lazy-prune ข้อที่ถูกลบ
        set.qids = valid;
        await window.setCacheDB('custom_sets_' + subj, sets);
    }
    if (!valid.length) {
        Swal.fire('ชุดว่างเปล่า', 'ข้อในชุดนี้ถูกลบไปหมดแล้ว', 'warning');
        window.renderMySetsList();
        return;
    }
    if (window.APP.filterMode === 'wrong-practice') window.APP.filterMode = 'category';
    window.studyLoadQuestions(valid.map(id => byId[String(id)]));
    window.bgToast.fire({ icon: 'success', title: 'เปิดชุด: ' + set.name + ' (' + valid.length + ' ข้อ)' });
};

window.deleteCustomSet = async function (setId) {
    const subj = window.studySubjectKey();
    const sets = await window.ensureCustomSets(subj);
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    const res = await Swal.fire({
        title: 'ลบชุดนี้?', text: set.name, icon: 'warning',
        showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc2626'
    });
    if (!res.isConfirmed) return;
    const next = sets.filter(s => s.id !== setId);
    window._customSetsCache[subj] = next;
    await window.setCacheDB('custom_sets_' + subj, next);
    window.renderMySetsList();
    window.bgToast.fire({ icon: 'success', title: 'ลบชุดแล้ว' });
};

// ── IV. Set editor overlay ───────────────────────────────────

window.studyEnsureModals = function () {
    if (document.getElementById('study-editor-overlay')) return;
    const overlay = `
    <div id="study-editor-overlay" class="study-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:12000;padding:20px;box-sizing:border-box;overflow:auto;">
        <div class="study-modal" style="max-width:640px;margin:20px auto;background:var(--color-surface);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,0.3);overflow:hidden;">
            <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--color-border-soft);">
                <i class="fas fa-layer-group" style="color:#7C3AED;"></i>
                <h3 id="study-editor-title" style="margin:0;flex:1;font-size:1.1rem;">แก้ไขชุด</h3>
                <button id="study-editor-close" class="btn-xs" style="background:var(--color-surface-2);color:var(--color-text);">ปิด</button>
            </div>
            <div id="study-editor-body" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;"></div>
            <div style="padding:12px 16px;border-top:1px solid var(--color-border-soft);">
                <button id="study-editor-add" class="quiz-button" style="width:100%;margin:0;background:#0d9488;color:white;border:none;min-height:42px;font-weight:700;">
                    <i class="fas fa-plus"></i> เพิ่มข้อจากคลัสเตอร์
                </button>
            </div>
        </div>
    </div>
    <div id="study-picker-overlay" class="study-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:12100;padding:20px;box-sizing:border-box;overflow:auto;">
        <div class="study-modal" style="max-width:680px;margin:20px auto;background:var(--color-surface);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,0.3);overflow:hidden;">
            <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--color-border-soft);">
                <i class="fas fa-fire" style="color:#7C3AED;"></i>
                <h3 id="study-picker-title" style="margin:0;flex:1;font-size:1.1rem;">เลือกคลัสเตอร์ข้อออกบ่อย</h3>
                <button id="study-picker-close" class="btn-xs" style="background:var(--color-surface-2);color:var(--color-text);">ปิด</button>
            </div>
            <div id="study-picker-namewrap" style="padding:10px 16px 0;">
                <input id="study-picker-name" type="text" placeholder="ชื่อชุด" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--color-border);border-radius:8px;font-size:1rem;">
            </div>
            <div id="study-picker-body" style="padding:12px 16px;max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:6px;"></div>
            <div style="padding:12px 16px;border-top:1px solid var(--color-border-soft);display:flex;gap:8px;">
                <button id="study-picker-confirm" class="quiz-button" style="flex:1;margin:0;background:#7C3AED;color:white;border:none;min-height:44px;font-weight:700;">
                    <i class="fas fa-check"></i> <span id="study-picker-confirm-label">สร้างชุด</span>
                </button>
            </div>
        </div>
    </div>`;
    $('body').append(overlay);
};

window.openSetEditor = async function (setId) {
    window.studyEnsureModals();
    const subj = window.studySubjectKey();
    const sets = await window.ensureCustomSets(subj);
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    window._studyEditId = setId;
    window._studyClusters = window.getSubjectClusters(); // snapshot ตอนเปิด editor
    $('#study-editor-title').text('แก้ไขชุด: ' + set.name);
    window.renderSetEditor();
    $('#study-editor-overlay').fadeIn(150);
};

window.renderSetEditor = function () {
    const subj = window.studySubjectKey();
    const sets = window._customSetsCache[subj] || [];
    const set = sets.find(s => s.id === window._studyEditId);
    if (!set) return;
    const qs = window.APP.allQuestions || [];
    const byId = {};
    qs.forEach(q => { byId[String(q.questionId)] = q; });

    if (!set.qids.length) {
        $('#study-editor-body').html('<p style="text-align:center;color:var(--color-text-muted);margin:8px 0;">ยังไม่มีข้อในชุด — กด "เพิ่มข้อจากคลัสเตอร์" ด้านล่าง</p>');
        return;
    }
    const html = set.qids.map(id => {
        const q = byId[String(id)];
        const stem = q ? window.similarSnippet(q.problem, 110) : '<i>(ข้อถูกลบแล้ว)</i>';
        const yearChip = q ? window.similarYearChip(q) : '';
        const cl = window.studyFindCluster(id);
        const swappable = cl && cl.qids.length > 1;
        return `
        <div class="study-editor-row" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--color-border-soft);border-radius:8px;">
            <div style="flex:1;min-width:0;font-size:0.92rem;">${yearChip} ${stem}</div>
            <button class="btn-xs study-swap" data-id="${id}" ${swappable ? '' : 'disabled'} title="${swappable ? 'สลับเป็นข้ออื่นในคลัสเตอร์เดียวกัน' : 'ไม่มีข้ออื่นในคลัสเตอร์'}" style="background:var(--color-surface-2);color:var(--color-text);"><i class="fas fa-random"></i></button>
            <button class="btn-xs study-remove" data-id="${id}" style="background:#fee2e2;color:#b91c1c;"><i class="fas fa-times"></i></button>
        </div>`;
    }).join('');
    $('#study-editor-body').html(html);
    setTimeout(window.renderAllMath, 30);
};

window.studyFindCluster = function (qid) {
    const clusters = window._studyClusters || [];
    return clusters.find(c => c.qids.some(x => String(x) === String(qid)));
};

window.swapSetMember = async function (qid) {
    const subj = window.studySubjectKey();
    const sets = window._customSetsCache[subj] || [];
    const set = sets.find(s => s.id === window._studyEditId);
    if (!set) return;
    const cl = window.studyFindCluster(qid);
    if (!cl) { window.bgToast.fire({ icon: 'info', title: 'ข้อนี้ไม่มีคลัสเตอร์ให้สลับ' }); return; }
    const inSet = new Set(set.qids.map(String));
    const cands = cl.qids.filter(x => String(x) !== String(qid) && !inSet.has(String(x)));
    if (!cands.length) { window.bgToast.fire({ icon: 'info', title: 'ไม่มีข้ออื่นในคลัสเตอร์ให้สลับแล้ว' }); return; }
    const next = cands[Math.floor(Math.random() * cands.length)];
    const idx = set.qids.findIndex(x => String(x) === String(qid));
    set.qids[idx] = next;
    await window.setCacheDB('custom_sets_' + subj, sets);
    window.renderSetEditor();
    window.renderMySetsList();
};

window.removeSetMember = async function (qid) {
    const subj = window.studySubjectKey();
    const sets = window._customSetsCache[subj] || [];
    const set = sets.find(s => s.id === window._studyEditId);
    if (!set) return;
    set.qids = set.qids.filter(x => String(x) !== String(qid));
    await window.setCacheDB('custom_sets_' + subj, sets);
    window.renderSetEditor();
    window.renderMySetsList();
};

// ── V. Cluster picker (create mode + add-to-set mode) ────────

// mode: 'create' → สร้างชุดใหม่ (มีช่องชื่อ); 'add' → เพิ่มเข้าชุดที่กำลังแก้ (ตัดคลัสเตอร์ที่มีข้ออยู่แล้ว)
window.openStudyPicker = function (mode) {
    window.studyEnsureModals();
    const subj = window.studySubjectKey();
    const clusters = window.getSubjectClusters();
    window._studyPickerMode = mode;

    let excludeQids = new Set();
    if (mode === 'add') {
        const set = (window._customSetsCache[subj] || []).find(s => s.id === window._studyEditId);
        if (set) set.qids.forEach(id => excludeQids.add(String(id)));
    }

    const qs = window.APP.allQuestions || [];
    const byId = {};
    qs.forEach(q => { byId[String(q.questionId)] = q; });

    // จัดกลุ่มตามหัวข้อ (lecture); ตัดคลัสเตอร์ที่ทุกข้ออยู่ในชุดแล้ว (add mode)
    const byCat = {};
    clusters.forEach(cl => {
        if (mode === 'add' && cl.qids.every(id => excludeQids.has(String(id)))) return;
        (byCat[cl.catId] = byCat[cl.catId] || { catName: cl.catName, list: [] }).list.push(cl);
    });

    const cats = Object.keys(byCat);
    if (!cats.length) {
        Swal.fire('ไม่พบคลัสเตอร์', mode === 'add' ? 'ไม่มีคลัสเตอร์อื่นให้เพิ่มแล้ว' : 'วิชานี้ยังไม่มีข้อออกซ้ำเป็นคลัสเตอร์', 'info');
        return;
    }

    let html = '';
    cats.forEach(catId => {
        const grp = byCat[catId];
        html += `
        <div class="study-pick-cat" style="border:1px solid var(--color-border-soft);border-radius:8px;overflow:hidden;">
            <label style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--color-surface-2);font-weight:700;cursor:pointer;">
                <input type="checkbox" class="study-pick-cat-all" data-cat="${catId}">
                <span style="flex:1;">${grp.catName}</span>
                <span style="font-size:0.8rem;color:var(--color-text-muted);">${grp.list.length} คลัสเตอร์</span>
            </label>
            <div style="padding:4px 10px 8px;display:flex;flex-direction:column;gap:4px;">`;
        grp.list.forEach(cl => {
            const rep = byId[String(cl.qids[0])];
            const stem = rep ? window.similarSnippet(rep.problem, 90) : '';
            const key = cl.catId + '::' + cl.clIdx;
            const yrs = (cl.years || []).map(y => `<span class="similar-year-chip">ปี ${y}</span>`).join('');
            html += `
                <label style="display:flex;align-items:flex-start;gap:8px;padding:6px;border-radius:6px;cursor:pointer;font-size:0.9rem;">
                    <input type="checkbox" class="study-pick-cluster" data-cat="${catId}" data-key="${key}" style="margin-top:3px;">
                    <span style="flex:1;">${yrs} ${stem} <span style="color:var(--color-text-muted);">(${cl.qids.length} ข้อ)</span></span>
                </label>`;
        });
        html += `</div></div>`;
    });

    window._studyPickerClusters = {};
    clusters.forEach(cl => { window._studyPickerClusters[cl.catId + '::' + cl.clIdx] = cl; });

    $('#study-picker-body').html(html);
    $('#study-picker-title').text(mode === 'add' ? 'เพิ่มข้อจากคลัสเตอร์' : 'เลือกคลัสเตอร์ข้อออกบ่อย');
    $('#study-picker-confirm-label').text(mode === 'add' ? 'เพิ่มเข้าชุด' : 'สร้างชุด');
    $('#study-picker-namewrap').toggle(mode !== 'add');
    $('#study-picker-name').val('');
    $('#study-picker-overlay').fadeIn(150);
    setTimeout(window.renderAllMath, 30);
};

window.studyPickerConfirm = async function () {
    const mode = window._studyPickerMode;
    const picked = $('#study-picker-body .study-pick-cluster:checked').map(function () {
        return window._studyPickerClusters[$(this).data('key')];
    }).get().filter(Boolean);
    if (!picked.length) { window.bgToast.fire({ icon: 'info', title: 'ยังไม่ได้เลือกคลัสเตอร์' }); return; }

    if (mode === 'add') {
        const subj = window.studySubjectKey();
        const sets = window._customSetsCache[subj] || [];
        const set = sets.find(s => s.id === window._studyEditId);
        if (!set) return;
        const inSet = new Set(set.qids.map(String));
        picked.forEach(cl => {
            const cands = cl.qids.filter(id => !inSet.has(String(id)));
            if (!cands.length) return;
            const pick = cands[Math.floor(Math.random() * cands.length)];
            set.qids.push(pick);
            inSet.add(String(pick));
        });
        await window.setCacheDB('custom_sets_' + subj, sets);
        window.renderSetEditor();
        window.renderMySetsList();
        $('#study-picker-overlay').fadeOut(120);
    } else {
        const name = ($('#study-picker-name').val() || '').trim() || ('ชุดข้อออกบ่อย ' + new Date().toLocaleDateString('th-TH'));
        const set = await window.createSetFromClusters(picked, name);
        $('#study-picker-overlay').fadeOut(120);
        if (set) window.openSetEditor(set.id); // เปิด editor ให้ปรับต่อทันที
    }
};

// ── VI. Home-panel refresh hook + wiring ─────────────────────

// เรียกทุกครั้งที่ accordion filter panel เรนเดอร์ (ได้ subject + allQuestions แล้ว)
window.studyRefreshHomeUI = function () {
    const subj = window.studySubjectKey();
    window.ensureWrongHistory(subj).then(window.updateWrongPracticeButton);
    window.ensureCustomSets(subj).then(window.renderMySetsList);
};

// ติดตั้ง decorator ทั้งหมดตอน DOM ready — setFilterMode/renderAccordionUI นิยามใน ui.js
// ซึ่งโหลด "หลัง" ไฟล์นี้ จึงต้องรอให้ทุกสคริปต์ parse เสร็จก่อน (ready รันก่อน initApp เสมอ)
window.studyInstallHooks = function () {
    if (window._studyHooksInstalled) return;
    window._studyHooksInstalled = true;

    // บันทึกผลตอบทุกครั้งที่ submit (choke point เดียว, ทุกโหมด)
    var _origSubmit = window.submitQuestion;
    if (typeof _origSubmit === 'function') {
        window.submitQuestion = function () {
            var wasAnswered = window.APP.current_question && window.APP.current_question.state;
            _origSubmit.apply(this, arguments);
            var cq = window.APP.current_question;
            if (!cq || wasAnswered || !cq.state) return; // ข้าม early-return (ตอบแล้ว/ไม่ได้เลือก)
            window.recordAnswerResult(cq.questionId, cq.select === cq.answer);
        };
    } else {
        console.warn('[StudySets] submitQuestion not found — wrong-history logging disabled');
    }

    // ออกจากโหมด wrong-practice อัตโนมัติเมื่อผู้ใช้เปลี่ยนตัวกรองจริง
    var _origUQS = window.updateQuestionSet;
    if (typeof _origUQS === 'function') {
        window.updateQuestionSet = function () {
            if (window.APP.filterMode === 'wrong-practice') window.APP.filterMode = 'category';
            return _origUQS.apply(this, arguments);
        };
    }

    // setFilterMode รู้จักโหมด wrong-practice (กันตกไป branch attribute ตอน reload)
    var _origSFM = window.setFilterMode;
    if (typeof _origSFM === 'function') {
        window.setFilterMode = function (mode, skip) {
            if (mode === 'wrong-practice') {
                window.APP.filterMode = 'wrong-practice';
                $('#dynamic-accordion-area').show();
                $('#attribute-filter-area').hide();
                return;
            }
            return _origSFM.apply(this, arguments);
        };
    }

    // หลัง accordion เรนเดอร์ → รีเฟรชปุ่ม/รายการชุด
    var _origRA = window.renderAccordionUI;
    if (typeof _origRA === 'function') {
        window.renderAccordionUI = function () {
            _origRA.apply(this, arguments);
            window.studyRefreshHomeUI();
        };
    }
};

$(function () {
    window.studyInstallHooks();

    // Feature B
    $('#wrong-practice-btn').on('click', window.launchWrongPractice);

    // Feature A — My Sets section
    $('#my-sets-create-btn').on('click', function () { window.openStudyPicker('create'); });
    $(document).on('click', '.my-set-open', function () { window.openCustomSet($(this).data('id')); });
    $(document).on('click', '.my-set-edit', function () { window.openSetEditor($(this).data('id')); });
    $(document).on('click', '.my-set-delete', function () { window.deleteCustomSet($(this).data('id')); });

    // Editor
    $(document).on('click', '#study-editor-close', function () { $('#study-editor-overlay').fadeOut(120); });
    $(document).on('click', '.study-swap', function () { if (!$(this).prop('disabled')) window.swapSetMember($(this).data('id')); });
    $(document).on('click', '.study-remove', function () { window.removeSetMember($(this).data('id')); });
    $(document).on('click', '#study-editor-add', function () { window.openStudyPicker('add'); });

    // Picker
    $(document).on('click', '#study-picker-close', function () { $('#study-picker-overlay').fadeOut(120); });
    $(document).on('click', '#study-picker-confirm', window.studyPickerConfirm);
    $(document).on('change', '.study-pick-cat-all', function () {
        const cat = String($(this).data('cat'));
        const checked = $(this).is(':checked');
        $('#study-picker-body .study-pick-cluster').each(function () {
            if (String($(this).data('cat')) === cat) $(this).prop('checked', checked);
        });
    });

    // ปุ่มลัดใน overlay "ข้อออกบ่อย" — สร้างชุดจากคลัสเตอร์ที่กำลังดู (เพิ่มครั้งเดียว)
    if ($('#similar-report-toolbar').length && !$('#study-report-create-btn').length) {
        $('#similar-report-toolbar').append(
            '<button id="study-report-create-btn" class="btn-xs" style="background:#7C3AED;color:white;"><i class="fas fa-layer-group"></i> สร้างชุดจากคลัสเตอร์</button>'
        );
        $(document).on('click', '#study-report-create-btn', function () { window.openStudyPicker('create'); });
    }
});
