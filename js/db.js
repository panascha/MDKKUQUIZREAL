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
        $('input[type="checkbox"][name="category"]').prop('checked', false);
        if (savedState.selectedCategories) {
            savedState.selectedCategories.forEach(catId => {
                const targetInput = document.getElementById(`cat-${catId}`);
                if (targetInput) {
                    $(targetInput).prop('checked', true);
                }
            });
        }

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

        window.updateSelectedCategoryStatus();

        $('#toggle-random-btn').text(window.APP.isRandomized ? 'โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : 'โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');
        if (window.APP.isReviewMode) {
            $('#toggle-review-mode-btn').text('โหมดทวนข้อผิด: เปิด').css('background-color', '#28a745');
        } else {
            $('#toggle-review-mode-btn').text('โหมดทวนข้อผิด: ปิด').css('background-color', '#d32f2f');
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