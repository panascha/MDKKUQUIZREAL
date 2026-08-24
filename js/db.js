// REFACTOR/js/db.js

const dbName = "MDKKU_Quiz_DB";
const storeName = "quiz_cache";

window.openDB = function () {
    // T3.3: Memoize — เปิด IndexedDB แค่ครั้งเดียว ส่ง Promise เดิมซ้ำ
    if (window._dbConnPromise) return window._dbConnPromise;
    window._dbConnPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        request.onsuccess = (e) => {
            const db = e.target.result;
            // เมื่อ connection ถูกปิดจากภายนอก ล้าง memo เพื่อให้ call ต่อไป reopen ได้
            db.onclose = function () { window._dbConnPromise = null; };
            resolve(db);
        };
        request.onerror = (e) => {
            window._dbConnPromise = null; // ล้าง memo เมื่อ open ล้มเหลว
            reject(e.target.error);
        };
    });
    return window._dbConnPromise;
};

window.setCacheDB = async function (key, data) {
    const db = await window.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        store.put(data, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e.target.error);
    });
};

window.getCacheDB = async function (key) {
    const db = await window.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

window.saveProgressToCache = async function (options) {
    options = options || {};
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || 'default';
    const sessionKey = `session_state_${subjectParam}`;

    const state = {
        questionIndex: window.APP.questionIndex,
        score: window.APP.score,
        isRandomized: window.APP.isRandomized,
        isReviewMode: window.APP.isReviewMode,
        isFastMode: window.APP.isFastMode,
        filterMode: window.APP.filterMode || "category", // บันทึกสถานะโหมดตัวกรอง
        categoryLimits: { ...(window.APP.categoryLimits || {}) }, // จำนวนข้อที่สุ่มต่อหมวด
        currentQuestionsState: window.APP.currentQuestions.map(q => ({
            questionId: q.questionId,
            state: q.state,
            select: q.select,
            attemptCount: q.attemptCount,
            failCount: q.failCount
        })),
        selectedCategories: $('input[type="checkbox"][name="category"]:checked').map(function () {
            return this.value;
        }).get(),
        // บันทึกตัวเลือกการกรองละเอียดเพิ่มเติม
        selectedYears: $('input[type="checkbox"][name="filter-year"]:checked').map(function () {
            return this.value;
        }).get(),
        selectedGroups: $('input[type="checkbox"][name="filter-examgroup"]:checked').map(function () {
            return this.value;
        }).get(),
        selectedSuffixes: $('input[type="checkbox"][name="filter-suffix"]:checked').map(function () {
            return this.value;
        }).get(),
        selectedTopics: $('input[type="checkbox"][name="filter-topic"]:checked').map(function () {
            return this.value;
        }).get(),
        timestamp: Date.now()
    };

    await window.setCacheDB(sessionKey, state);
    // Cross-device sync: ตั้งธงให้ sync.js อัปโหลดแบบ debounced (no-op ถ้าไม่ได้ล็อกอิน)
    // skipCloudSync: true → บันทึกลง IndexedDB เฉยๆ ไม่ mark dirty (กัน echo หลัง restore จาก cloud)
    if (!options.skipCloudSync && typeof window.markProgressDirty === 'function') {
        window.markProgressDirty(subjectParam, state);
    }
    console.log("Progress Auto-Saved");
};

window.loadProgressFromCache = async function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || 'default';
    const sessionKey = `session_state_${subjectParam}`;

    const savedState = await window.getCacheDB(sessionKey);
    if (!savedState) return false;

    try {
        window.APP.filterMode = savedState.filterMode || "category";
        window.APP.categoryLimits = savedState.categoryLimits || {};

        // คืนค่าเช็คบ็อกซ์แบบตามวิชา/ตามบทเรียนปกติ
        $('input[type="checkbox"][name="category"]').prop('checked', false);
        if (savedState.selectedCategories) {
            savedState.selectedCategories.forEach(catId => {
                const targetInput = document.getElementById(`cat-${catId}`);
                if (targetInput) {
                    $(targetInput).prop('checked', true);
                }
            });
        }

        // ซิงค์ stepper จำนวนข้อต่อหมวดให้ตรงกับค่าที่กู้คืนมา (ต้องทำหลังคืนค่า checkbox)
        if (typeof window.syncCategoryLimitUI === 'function') window.syncCategoryLimitUI();

        // คืนค่าเช็คบ็อกซ์ตัวเลือกละเอียด (Year / ExamGroup / Suffix)
        if (window.APP.filterMode === "attribute") {
            window.renderAttributeFilterUI();
        }

        $('input[type="checkbox"][name^="filter-"]').prop('checked', false);
        if (savedState.selectedYears) {
            savedState.selectedYears.forEach(val => {
                const target = document.getElementById(`filter-year-${val}`);
                if (target) $(target).prop('checked', true);
            });
        }
        if (savedState.selectedGroups) {
            savedState.selectedGroups.forEach(val => {
                const target = document.getElementById(`filter-examgroup-${val}`);
                if (target) $(target).prop('checked', true);
            });
        }
        if (savedState.selectedSuffixes) {
            savedState.selectedSuffixes.forEach(val => {
                const target = document.getElementById(`filter-suffix-${val}`);
                if (target) $(target).prop('checked', true);
            });
        }
        if (savedState.selectedTopics) {
            savedState.selectedTopics.forEach(val => {
                const target = document.getElementById(`filter-topic-${val}`);
                if (target) $(target).prop('checked', true);
            });
        }

        // ซิงค์ UI การแสดงผลของโหมดตัวเลือก (skipUpdate: ด้านล่างจะกู้คืนลำดับข้อจาก savedState เอง)
        window.setFilterMode(window.APP.filterMode, true);

        const reorderedQuestions = [];
        savedState.currentQuestionsState.forEach(savedQ => {
            const originalQ = window.APP.allQuestions.find(q => q.questionId === savedQ.questionId);
            if (originalQ) {
                reorderedQuestions.push({
                    ...originalQ,
                    state: savedQ.state,
                    select: savedQ.select,
                    attemptCount: savedQ.attemptCount || 0,
                    failCount: savedQ.failCount || 0
                });
            }
        });

        if (reorderedQuestions.length === 0) return false;

        window.APP.currentQuestions = reorderedQuestions;

        // เมล็ดลำดับสุ่มต่อหมวดจาก session ที่กู้คืนมา — _catSampleOrder เป็นของ session เดียว
        // ถ้าไม่ seed ไว้ updateQuestionSet() ครั้งถัดไป (เช่นติ๊กหมวดเพิ่ม) จะสุ่มชุดใหม่ทับ ทำให้ข้อที่ทำไปแล้วหาย
        window._catSampleOrder = window._catSampleOrder || {};
        const restoredByCat = {};
        reorderedQuestions.forEach(q => {
            const cats = Array.isArray(q.category) ? q.category : [q.category];
            cats.forEach(c => {
                if (!c) return;
                (restoredByCat[c] = restoredByCat[c] || []).push(q.questionId);
            });
        });
        Object.keys(restoredByCat).forEach(c => { window._catSampleOrder[c] = restoredByCat[c]; });

        if (window.APP.currentQuestions.length > 0) window.preloadQuizImages(window.APP.currentQuestions);
        // clamp: ถ้าแอดมินลบ/แก้ข้อ ทำให้ reorderedQuestions สั้นลง questionIndex เดิมอาจเกินขอบเขต
        window.APP.questionIndex = Math.min(savedState.questionIndex || 0, reorderedQuestions.length - 1);
        // คำนวณคะแนนใหม่จากข้อที่เหลือจริง — ไม่เชื่อ savedState.score ตรงๆ (กัน score เกิน เช่น 45/40 หลังข้อถูกลบ)
        window.APP.score = reorderedQuestions.filter(q => q.state && q.select === q.answer).length;
        window.APP.isRandomized = savedState.isRandomized;
        window.APP.isReviewMode = savedState.isReviewMode || false;
        window.APP.isFastMode = savedState.isFastMode || false;

        window.updateSelectedCategoryStatus();

        $('#toggle-random-btn').html(window.APP.isRandomized ? '<i class="fas fa-random"></i> โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : '<i class="fas fa-sort-amount-down-alt"></i> โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)').css({
            'background-color': window.APP.isRandomized ? '#e8710a' : '#007bff',
            'color': 'white',
            'border-color': window.APP.isRandomized ? '#e8710a' : '#007bff'
        });
        if (window.APP.isReviewMode) {
            $('#toggle-review-mode-btn').html('<i class="fas fa-redo"></i> โหมดทวนข้อผิด: เปิด').css({
                'background-color': '#28a745',
                'color': 'white',
                'border-color': '#28a745'
            });
        } else {
            $('#toggle-review-mode-btn').html('<i class="fas fa-times-circle"></i> โหมดทวนข้อผิด: ปิด').css({
                'background-color': 'var(--color-surface)',
                'color': 'var(--color-text)',
                'border-color': 'var(--color-border)'
            });
        }

        if (typeof window.updateFastModeButtonUI === 'function') {
            window.updateFastModeButtonUI();
        }

        // บันทึก state ที่กู้คืนสำเร็จกลับลง cache ทันที — กันกรณีมี save อื่นเขียนทับระหว่าง init
        // skipCloudSync: กัน echo — ถ้ากู้มาจาก cloud อยู่แล้ว ไม่ต้อง mark dirty แล้วดันกลับขึ้นไปทันที
        window.saveProgressToCache({ skipCloudSync: true });

        return true;
    } catch (e) {
        console.error("Load Progress Failed", e);
        return false;
    }
};

window.syncQuestionsToCache = async function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || '';
    const cacheKey = `data_${subjectParam}`;

    const dataToSave = {
        structure: window.APP.globalStructure,
        questions: window.APP.allQuestions
    };

    await window.setCacheDB(cacheKey, dataToSave);
    console.log("Local cache updated with new categories.");
};

// ─────────────────────────────────────────────────────
// INCREMENTAL SYNC HELPERS
// ─────────────────────────────────────────────────────

/**
 * Merge เฉพาะคำถามที่เปลี่ยนแปลงเข้า IndexedDB cache
 * โดยไม่แทนทั้งหมด เพื่อลด write overhead
 *
 * @param {Array}  changedQuestions  array of question objects จาก getChangedSince
 * @param {string} subject           subject param สำหรับ cache key
 * @returns {{ added: number, updated: number } | undefined}
 */
window.mergeChangedQuestionsToCache = async function (changedQuestions, subject) {
    if (!changedQuestions || changedQuestions.length === 0) return;

    var cacheKey = 'data_' + (subject || '');
    var existingCache = await window.getCacheDB(cacheKey);

    // ถ้าไม่มี cache เดิมเลย ไม่ต้อง merge
    if (!existingCache) return;

    var questions = existingCache.questions || [];

    // สร้าง lookup map: questionId → index ใน array
    var qMap = {};
    for (var i = 0; i < questions.length; i++) {
        qMap[questions[i].questionId] = i;
    }

    var added = 0, updated = 0;

    changedQuestions.forEach(function (newQ) {
        // normalize category ให้เป็น array เสมอ
        if (!Array.isArray(newQ.category)) {
            newQ.category = newQ.category ? [newQ.category] : [];
        }

        if (qMap[newQ.questionId] !== undefined) {
            // อัปเดต: เขียนทับข้อมูลเดิม — ต้องคง _originalIndex ไว้ ไม่งั้นโหมดเรียงลำดับ
            // (sortCurrentQuestions เทียบ a._originalIndex - b._originalIndex) จะได้ NaN แล้วลำดับพัง
            var idx = qMap[newQ.questionId];
            newQ._originalIndex = (questions[idx]._originalIndex !== undefined) ? questions[idx]._originalIndex : idx;
            questions[idx] = newQ;
            updated++;
        } else {
            // เพิ่มใหม่: push เข้า array และอัปเดต map พร้อมตั้ง _originalIndex ต่อท้าย
            newQ._originalIndex = questions.length;
            qMap[newQ.questionId] = questions.length;
            questions.push(newQ);
            added++;
        }
    });

    existingCache.questions = questions;
    await window.setCacheDB(cacheKey, existingCache);

    console.log('[Sync] Cache merged: +' + added + ' new, ~' + updated + ' updated');
    return { added: added, updated: updated };
};

/**
 * บันทึก timestamp (epoch ms) ของการ sync ล่าสุดที่สำเร็จ
 */
window.saveLastSyncTime = async function (subject, timestamp) {
    await window.setCacheDB('last_sync_' + (subject || ''), timestamp);
};

/**
 * ดึง timestamp ของการ sync ล่าสุด
 */
window.getLastSyncTime = async function (subject) {
    var t = await window.getCacheDB('last_sync_' + (subject || ''));
    return t || 0;
};