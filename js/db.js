// REFACTOR/js/db.js

const dbName = "MDKKU_Quiz_DB";
const storeName = "quiz_cache";

window.openDB = function () {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
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

window.saveProgressToCache = async function () {
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

        // ซิงค์ UI การแสดงผลของโหมดตัวเลือก
        window.setFilterMode(window.APP.filterMode);

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
        if (window.APP.currentQuestions.length > 0) window.preloadQuizImages(window.APP.currentQuestions);
        window.APP.questionIndex = savedState.questionIndex;
        window.APP.score = savedState.score;
        window.APP.isRandomized = savedState.isRandomized;
        window.APP.isReviewMode = savedState.isReviewMode || false;
        window.APP.isFastMode = savedState.isFastMode || false;

        window.updateSelectedCategoryStatus();

        $('#toggle-random-btn').text(window.APP.isRandomized ? 'โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : 'โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');
        if (window.APP.isReviewMode) {
            $('#toggle-review-mode-btn').text('โหมดทวนข้อผิด: เปิด').css('background-color', '#28a745');
        } else {
            $('#toggle-review-mode-btn').text('โหมดทวนข้อผิด: ปิด').css('background-color', '#d32f2f');
        }

        const $fastBtn = $('#toggle-fast-mode-btn');
        if (window.APP.isFastMode) {
            $fastBtn.html('<i class="fas fa-bolt"></i> โหมดเร่งด่วน (Fast Mode): เปิด').css('background-color', '#eab308');
        } else {
            $fastBtn.html('<i class="fas fa-bolt"></i> โหมดเร่งด่วน (Fast Mode): ปิด').css('background-color', '#6b7280');
        }

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
            // อัปเดต: เขียนทับข้อมูลเดิม
            questions[qMap[newQ.questionId]] = newQ;
            updated++;
        } else {
            // เพิ่มใหม่: push เข้า array และอัปเดต map
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