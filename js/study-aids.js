// REFACTOR/js/study-aids.js — Cross-reference & question relations

window.loadQuestionRelations = async function (subject) {
    if (window.APP._relationsLoading) return;
    window.APP._relationsLoading = true;
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getRelatedQuestions' +
                (subject ? '&subject=' + encodeURIComponent(subject) : '') + '&_=' + Date.now();
        });
        window.APP.relationsMap = (res && res.result === 'success' && res.relations) ? res.relations : {};
    } catch (e) {
        console.warn('[Relations] load failed:', e && e.message);
        window.APP.relationsMap = {}; // ตั้งเป็น {} แม้พลาด → _relationsLoaded=true กัน refetch วน
    } finally {
        window.APP._relationsLoaded = true;
        window.APP._relationsLoading = false;
    }
    // วาดชิปให้ข้อปัจจุบันทันทีเมื่อ relations มาถึงหลัง render ข้อไปแล้ว
    window.renderRelatedChips();
};

// §1.8: โหลด KB chunks ของวิชา (เรียกครั้งเดียวต่อวิชา) — เก็บใน window.APP.kbChunks เสมอ
// (สำเร็จ/พลาด/ยังไม่มี KB) เพื่อไม่ให้ยิงซ้ำทุก showQuestion; retrieveGroundingContext union-scan อ่านจากนี้
window.loadKB = async function (subject) {
    if (window.APP._kbLoading) return;
    window.APP._kbLoading = true;
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getKB' +
                (subject ? '&subject=' + encodeURIComponent(subject) : '') + '&_=' + Date.now();
        });
        window.APP.kbChunks = (res && res.result === 'success' && res.chunks) ? res.chunks : [];
    } catch (e) {
        console.warn('[KB] load failed:', e && e.message);
        window.APP.kbChunks = []; // ตั้งเป็น [] แม้พลาด → _kbLoaded=true กัน refetch วน
    } finally {
        window.APP._kbLoaded = true;
        window.APP._kbLoading = false;
    }
};

// ดึง relations ของ questionId (คีย์ใน map เป็น string เสมอ)
window.getRelationsForQuestion = function (questionId) {
    var map = window.APP.relationsMap;
    if (!map) return [];
    return map[String(questionId)] || [];
};

// วาด chip row ข้อสอบที่เกี่ยวข้องของข้อปัจจุบันลง #quiz-related-container (ว่างเมื่อไม่มี relation)
// + วาดชิปชุดเดียวกันลง #sp-related-container ของ study panel (F5 §5.2 — markup/handler เดิม verbatim)
window.renderRelatedChips = function () {
    var $c = $('#quiz-related-container');
    var $sp = $('#sp-related-container');
    $c.empty();
    var q = window.APP.current_question;
    var rels = q ? window.getRelationsForQuestion(q.questionId) : [];
    if (!rels.length) {
        $sp.html('<div class="sp-muted" style="font-style:italic;">ยังไม่มีข้อสอบที่เกี่ยวข้องกับข้อนี้ในคลัง</div>');
        return;
    }

    var chips = rels.map(function (r) {
        return '<button type="button" class="rag-cite-chip btn-xs" data-qid="' +
            String(r.relatedId) + '" style="font-size:0.75rem;margin:2px;">#' + String(r.relatedId) + '</button>';
    }).join(' ');
    if ($c.length) $c.html('<div style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:4px;">' +
        '<i class="fas fa-link"></i> ข้อสอบที่เกี่ยวข้อง:</div><div>' + chips + '</div>');
    $sp.html('<div>' + chips + '</div>');
};

// Hook showQuestion: lazy-load relations ครั้งแรกของวิชา + วาดชิปทุกครั้งที่เปลี่ยนข้อ
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[Relations] window.showQuestion not found at hook time — related chips disabled');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        // lazy-load ครั้งเดียวต่อวิชา (allQuestions ถูกตั้งค่าตอนโหลดวิชาแล้ว)
        var subjectParam = new URLSearchParams(location.search).get('subject') || '';
        if (!window.APP._relationsLoaded && !window.APP._relationsLoading) {
            window.loadQuestionRelations(subjectParam);
        }
        // §1.8: lazy-load KB chunks ครั้งเดียวต่อวิชา (union-scan ใน retrieveGroundingContext อ่านจาก kbChunks)
        if (!window.APP._kbLoaded && !window.APP._kbLoading) {
            window.loadKB(subjectParam);
        }
        // §2: lazy-load glossary ครั้งเดียวต่อวิชา (tap/select แปล + panel อ่านจาก glossaryMap/glossaryTerms)
        if (!window.APP._glossaryLoaded && !window.APP._glossaryLoading) {
            window.loadGlossary(subjectParam);
        }
        window.renderRelatedChips();
    };
})();

/* =========================================
   Feature 2 — Glossary (root-word + Thai↔English) — §2.4 (panel) / §2.5 (tap-select แปล) / §2.6 (ดัชนีรากศัพท์)
   client-side ล้วน: hit = 0 network (อ่านจาก glossaryMap), miss = 1 POST askGlossaryTerm แล้ว warm map
   ตัวเรนเดอร์ popup เดียวรับ term OBJECT — ไม่ parse จากข้อความโมเดล (deterministic). field ทั้งหมด escape ก่อน render
   ========================================= */

// §2.5: normalize คีย์ศัพท์ — ***ต้อง byte-identical กับ backend normalizeGlossaryTerm (Code.js:4888)***
// ไม่งั้นแถวที่ backend เขียนจะหาไม่เจอใน client map → ยิง LLM ซ้ำไม่จบ (backend comment บังคับไว้)
