// REFACTOR/js/app.js

// =========================================================
// 1. ฟังก์ชันอัปเดตข้อมูลความคืบหน้าบนหัวข้อเว็บ (Progress Header)
// =========================================================
window.updateProgressHeader = function () {
    if (!window.APP.currentQuestions.length) return;

    let unansweredBack = 0;
    let unansweredForward = 0;

    window.APP.currentQuestions.forEach((q, idx) => {
        if (!q.state) {
            if (idx < window.APP.questionIndex) unansweredBack++;
            if (idx > window.APP.questionIndex) unansweredForward++;
        }
    });

    let skipWarning = unansweredBack > 0
        ? ` | <span style="color: #dc3545; padding: 2px 5px; border-radius: 4px;">⚠️ ข้ามมา ${unansweredBack} ข้อ</span>`
        : "";

    let statusColor = window.APP.current_question.state && window.APP.current_question.select === window.APP.current_question.answer ? "#198754" : "#dc3545";
    let statusSuffix = window.APP.current_question.state && window.APP.current_question.select === window.APP.current_question.answer ? " | สถานะ: ทำถูกแล้ว ✅" : "";

    $('#quiz-container h1').html(`
        Random Quiz | ข้อที่ <span id="questionIndex">${window.APP.questionIndex + 1}/${window.APP.currentQuestions.length}</span> | 
        คะแนน: <span id="score">${window.APP.score}/${window.APP.currentQuestions.length}</span>
        <div style="font-size: 0.9em; margin-top: 5px; color: #666;">
            (เหลือด้านหน้า: ${unansweredForward} ข้อ${skipWarning})
        </div>
        <div style="font-size: 0.9em; color: ${statusColor};">
            ข้อนี้ทำไป: ${window.APP.current_question.attemptCount || 0} | ผิด: ${window.APP.current_question.failCount || 0}${statusSuffix}
        </div>
    `);

    // อัปเดตคะแนนในส่วนของ Header ภาพรวมข้อสอบให้ตรงกับปัจจุบันเสมอ
    $('#index-score-badge-header').text(`${window.APP.score} / ${window.APP.currentQuestions.length}`);

    // อัปเดต Dot Grid ทันทีหากผู้ใช้เปิดแผงทิ้งไว้ (โดยตรงและเสถียรกว่าการใช้ MutationObserver)
    if ($('#index-grid-container').hasClass('open')) {
        window.renderIndexPanel();
    }
};

// =========================================================
// 2. ฟังก์ชันอัปเดตชื่อวิชาที่เลือก (Subject UI)
// =========================================================
window.updateSubjectUI = function (subjectParam) {
    if (subjectParam) {
        const subjectName = window.APP.globalStructure.subjects.find(s => s.subjectId === subjectParam)?.subjectName || subjectParam;
        $('.selection-container h2').html(`✅ เลือกหัวข้อ (วิชา: <span style="color:var(--color-primary)">${subjectName}</span>)`);
    }
};

window.finishLoading = function () {
    $('#loading-overlay').hide();
};

// =========================================================
// 3. ฟังก์ชันตรวจสอบรายงานข้อสอบค้างแก้ไขจาก Server (Pending Reports)
// =========================================================
window.checkPendingReports = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || '';

    fetch(`${window.APPSCRIPT_URL}?action=getPendingReportCount&subject=${subjectParam}`)
        .then(r => r.json())
        .then(data => {
            if (data.count > 0) {
                const $container = $('#report-notification-container');
                const $content = $('#report-details-content');

                let html = `<p style="font-size: 1.3rem; margin-bottom: 5px;">
                        มี <strong>${data.count}</strong> รายการแจ้งปัญหาที่ยังรอการตรวจสอบในวิชานี้
                    </p>`;

                if (data.samples && data.samples.length > 0) {
                    html += `<ul style="margin: 0; padding-left: 20px; color: #533f03; font-style: italic;">`;
                    data.samples.forEach(s => {
                        html += `<li>[${s.category}] ${s.question}</li>`;
                    });
                    if (data.count > data.samples.length) {
                        html += `<li>... และอีก ${data.count - data.samples.length} รายการ</li>`;
                    }
                    html += `</ul>`;
                }

                $content.html(html);
                $container.fadeIn();
            }
        })
        .catch(err => console.warn("Check Report Error:", err));
};

// =========================================================
// 4. ระบบการแสดงผลประวัติตารางสรุปคำตอบด้านล่าง (Submissions Table)
// =========================================================
window.showSubmission = function (filter = 'all') {
    const $container = $('#submission-cards-container');
    let cardsHtml = '';

    const currentQ = window.APP.currentQuestions[window.APP.questionIndex];
    let topRowQ = null;

    if (currentQ && currentQ.state) {
        topRowQ = currentQ;
    } else if (window.APP.questionIndex > 0) {
        topRowQ = window.APP.currentQuestions[window.APP.questionIndex - 1];
    }

    let answeredQuestions = window.APP.currentQuestions.filter(q => q.state);
    if (filter === 'correct') answeredQuestions = answeredQuestions.filter(q => q.select === q.answer);
    if (filter === 'incorrect') answeredQuestions = answeredQuestions.filter(q => q.select !== q.answer);

    if (answeredQuestions.length === 0 && !topRowQ) {
        $container.html('<p class="small-text" style="grid-column: 1/-1; padding: 40px;">ยังไม่มีข้อมูลการตอบ</p>');
        return;
    }

    const otherQs = answeredQuestions
        .filter(q => !topRowQ || q.questionId !== topRowQ.questionId)
        .reverse();

    const finalDisplayList = topRowQ ? [topRowQ, ...otherQs] : otherQs;

    $('#btn-current-idx').text(window.APP.questionIndex + 1);

    finalDisplayList.forEach(q => {
        const isCorrect = q.select === q.answer;
        const isThisCurrent = q.questionId === window.APP.current_question.questionId;
        const realIdx = window.APP.currentQuestions.findIndex(orig => orig.questionId === q.questionId);

        let categoryLabel = 'ไม่ระบุหัวข้อ';
        if (q.category && window.APP.globalStructure.category) {
            const firstCatId = Array.isArray(q.category) ? q.category[0] : q.category;
            const foundCat = window.APP.globalStructure.category.find(t => t.categoryId == firstCatId);
            if (foundCat) categoryLabel = foundCat.categoryName;
        }

        const renderContent = (val) => {
            if (!val) return '';
            const trimmed = val.trim();
            if (trimmed.startsWith('<svg')) return `<div class="svg-render-area" onclick="viewFullImageSVG(this, event)">${trimmed}</div>`;
            if (window.isUrl(trimmed)) return `<img src="${window.transformUrl(trimmed)}" class="search-card-img" referrerpolicy="no-referrer" onclick="viewFullImage('${window.transformUrl(trimmed)}', event)">`;
            return trimmed;
        };

        let problemMedia = '';
        if (q.img) {
            const imgArray = q.img.split('///').map(url => url.trim()).filter(Boolean);
            if (imgArray.length > 0) {
                problemMedia = `
                    <div class="search-card-images" style="margin: 10px 0;">
                        <div class="search-image-gallery" style="position: relative; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border-radius: 8px; padding: 10px; min-height: 250px;">
                            <img src="${window.transformUrl(imgArray[0])}" class="search-gallery-main-img" referrerpolicy="no-referrer" style="max-width: 100%; max-height: 400px; object-fit: contain; cursor: pointer;" data-img-index="0">
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

                setTimeout(() => {
                    const $card = $(`.result-card[data-search-idx="${realIdx}"]`);
                    $card.data('imgArray', imgArray);

                    let currentIdx = 0;
                    const $mainImg = $card.find('.search-gallery-main-img');
                    const $counter = $card.find('.search-gallery-counter');
                    const $prevBtn = $card.find('.search-gallery-prev');
                    const $nextBtn = $card.find('.search-gallery-next');

                    $prevBtn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        currentIdx = (currentIdx - 1 + imgArray.length) % imgArray.length;
                        $mainImg.attr('src', window.transformUrl(imgArray[currentIdx]));
                        $counter.text(`${currentIdx + 1} / ${imgArray.length}`);
                    });

                    $nextBtn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        currentIdx = (currentIdx + 1) % imgArray.length;
                        $mainImg.attr('src', window.transformUrl(imgArray[currentIdx]));
                        $counter.text(`${currentIdx + 1} / ${imgArray.length}`);
                    });

                    $mainImg.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(window.transformUrl(imgArray[currentIdx]), '_blank');
                    });
                }, 50);
            }
        }

        const choicesList = q.choices ? q.choices.split('///').map(c => `<li>${renderContent(c)}</li>`).join('') : '';
        const isFirstInList = topRowQ && q.questionId === topRowQ.questionId;

        cardsHtml += `
            <div class="result-card ${isCorrect ? 'is-correct' : 'is-incorrect'} ${isFirstInList ? 'current-active' : ''}" data-search-idx="${realIdx}">
                <div class="search-card-header">
                    <span class="search-card-category"><i class="fas fa-folder"></i> ${categoryLabel}</span>
                    <span class="badge ${isCorrect ? 'bg-success' : 'bg-danger'}">ข้อที่ ${realIdx + 1} ${isThisCurrent ? '(ปัจจุบัน)' : ''}</span>
                </div>
                <div class="result-card-body">
                    <div class="search-card-problem">${q.problem.startsWith('<svg') ? '[SVG โจทย์]' : q.problem.replace(/\n/g, '<br>')}</div>
                    ${problemMedia}
                    <ul class="search-card-choices"><b>ตัวเลือก:</b> ${choicesList}</ul>
                    <div class="result-ans-box user-ans"><small>คุณตอบ:</small><br><b>${renderContent(q.select)}</b></div>
                    ${!isCorrect ? `<div class="result-ans-box correct-ans"><small>เฉลยที่ถูก:</small><br><b>${renderContent(q.answer)}</b></div>` : ''}
                </div>
                ${q.explain ? `<div class="search-card-footer">${window.renderExplainHtmlForCard(q.explain)}</div>` : ''}
                <div class="search-card-actions">
                    <button class="btn-search-action btn-search-jump" onclick="event.stopPropagation(); jumpToQuestion(${realIdx})">
                        <i class="fas fa-arrow-right"></i> ไปที่ข้อนี้
                    </button>
                    <button class="btn-search-action btn-search-report" onclick="event.stopPropagation(); window.openReportModal(window.APP.currentQuestions[${realIdx}])">
                        <i class="fas fa-exclamation-triangle"></i> แจ้งปัญหา
                    </button>
                    <button class="btn-search-action btn-search-vote" onclick="event.stopPropagation(); window.openVoteModal(window.APP.currentQuestions[${realIdx}], false)">
                        <i class="fas fa-tags"></i> แยกเลค
                    </button>
                </div>
            </div>`;
    });

    $container.html(cardsHtml);
    setTimeout(window.renderAllMath, 50);
};

// =========================================================
// 5. ฟังก์ชันบูตระบบเริ่มต้นแอปพลิเคชัน (App Initialization)
// =========================================================
window.checkAndPromptRestoreProgress = async function (sessionKey) {
    const savedState = await window.getCacheDB(sessionKey);
    if (savedState && savedState.currentQuestionsState && savedState.currentQuestionsState.length > 0) {
        $('#loading-overlay').hide();
        const result = await Swal.fire({
            title: 'พบข้อมูลการทำค้างไว้',
            text: `คุณต้องการทำต่อจากข้อที่ ${savedState.questionIndex + 1} หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ทำต่อจากเดิม',
            cancelButtonText: 'เริ่มใหม่ทั้งหมด',
            confirmButtonColor: '#1a73e8',
            cancelButtonColor: '#d33',
            allowOutsideClick: false
        });

        if (result.isConfirmed) {
            const success = await window.loadProgressFromCache();
            if (success) {
                window.showQuestion();
                window.updateProgressHeader();
                window.showSubmission($('#submission-filter').val());
                window.bgToast.fire({ icon: 'success', title: 'โหลดข้อมูลเดิมสำเร็จ' });
            }
        } else {
            const db = await window.openDB();
            const transaction = db.transaction("quiz_cache", "readwrite");
            transaction.objectStore("quiz_cache").delete(sessionKey);
            window.updateQuestionSet(true);
        }
    } else {
        window.updateQuestionSet(true);
    }
};

window.initApp = async function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || '';
    const cacheKey = `data_${subjectParam}`;
    const verKey = `ver_${subjectParam}`;
    const sessionKey = `session_state_${subjectParam || 'default'}`;

    if (window.currentZoom > window.minZoom) {
        window.currentZoom += window.zoomStep;
        window.applyZoom();
    }

    // 1. ตรวจค้นโครงสร้างและโจทย์วิชาจาก Cache ท้องถิ่น (IndexedDB)
    const localData = await window.getCacheDB(cacheKey);
    const localVer = await window.getCacheDB(verKey);
    let loadedSuccessfully = false;

    if (localData) {
        window.APP.globalStructure = localData.structure;
        window.APP.allQuestions = localData.questions.map(q => ({
            ...q,
            category: Array.isArray(q.category) ? q.category : (q.category ? [q.category] : [])
        }));
        window.renderAccordionUI(window.APP.globalStructure);
        window.renderAttributeFilterUI(); // สร้างชุดตัวกรองละเอียดแบบไดนามิก
        window.buildSearchDictionary();
        window.updateSubjectUI(subjectParam);
        loadedSuccessfully = true;
    } else {
        $('#loading-overlay').css('display', 'flex');
    }

    try {
        // 2. เปรียบเทียบเวอรชันและดึงข้อมูลอัปเดตจากเครื่องเซิร์ฟเวอร์หลัก (GAS)
        const resVer = await fetch(`${window.APPSCRIPT_URL}?action=checkVersion`).then(r => r.json());
        const serverVersion = resVer.v;

        if (localVer !== serverVersion || !localData) {
            const [resStruct, resQues] = await Promise.all([
                fetch(`${window.APPSCRIPT_URL}?action=getStructure&subject=${subjectParam}`).then(r => r.json()),
                fetch(`${window.APPSCRIPT_URL}?action=getQuestions&subject=${subjectParam}`).then(r => r.json())
            ]);

            const newData = {
                structure: resStruct,
                questions: resQues.map((q, index) => ({
                    ...q,
                    _originalIndex: index,
                    category: Array.isArray(q.category) ? q.category : (q.category ? [q.category] : [])
                }))
            };

            await window.setCacheDB(cacheKey, newData);
            await window.setCacheDB(verKey, serverVersion);

            // บันทึก Last Sync Time เฉพาะเมื่อมีการ Fetch ข้อมูลสำเร็จจริงเท่านั้น
            await window.saveLastSyncTime(subjectParam, Date.now());

            if (!localData) {
                window.APP.globalStructure = newData.structure;
                window.APP.allQuestions = newData.questions;
                window.renderAccordionUI(window.APP.globalStructure);
                window.renderAttributeFilterUI(); // สร้างชุดตัวกรองละเอียดแบบไดนามิกสำหรับการรันครั้งแรก
                window.buildSearchDictionary();
                loadedSuccessfully = true;
            }
        }
    } catch (err) {
        console.error("Init Error:", err);
    } finally {
        if (loadedSuccessfully) {
            await window.checkAndPromptRestoreProgress(sessionKey);
        }

        // บูตระบบ Incremental Sync ทำงานในฝั่งผู้ใช้งาน
        window.startPendingUpdateWatcher();   // ตัวคอยตรวจสิทธิ์ว่างทุกๆ 5 วินาที
        window.startIncrementalPolling();      // บูตลูปตรวจสอบเซิร์ฟเวอร์ทุกๆ 30 วินาที

        window.checkPendingReports();
        window.finishLoading();
    }
};

// =========================================================
// INCREMENTAL SYNC SYSTEM
// =========================================================

window._pendingQuestionUpdates = [];
window._syncInterval = null;
window._isSyncing = false;

window.isUserBusy = function () {
    if ($('#report-card').is(':visible')) return true;
    if ($('#vote-category-modal').is(':visible')) return true;
    if ($('#pdf-choice-modal').is(':visible')) return true;
    if ($('#progress-modal-card').is(':visible')) return true;
    if ($('#donate-modal-card').is(':visible')) return true;
    if ($('#auto-grader-modal').is(':visible')) return true;

    var currentQ = window.APP.currentQuestions[window.APP.questionIndex];
    if (currentQ && !currentQ.state) return true;

    return false;
};

window.applyPendingUpdates = function () {
    if (window._pendingQuestionUpdates.length === 0) return;

    var updates = window._pendingQuestionUpdates.splice(0);
    var applied = 0;

    updates.forEach(function (newQ) {
        if (!Array.isArray(newQ.category)) {
            newQ.category = newQ.category ? [newQ.category] : [];
        }

        var allIdx = window.APP.allQuestions.findIndex(function (q) {
            return q.questionId === newQ.questionId;
        });

        if (allIdx !== -1) {
            // อัปเดตข้อมูลเก่า โดยรักษาสถานะคำตอบเดิม
            var preserved = {
                state: window.APP.allQuestions[allIdx].state,
                select: window.APP.allQuestions[allIdx].select,
                attemptCount: window.APP.allQuestions[allIdx].attemptCount,
                failCount: window.APP.allQuestions[allIdx].failCount,
                _originalIndex: window.APP.allQuestions[allIdx]._originalIndex
            };
            window.APP.allQuestions[allIdx] = Object.assign({}, newQ, preserved);
            applied++;
        } else {
            // เพิ่มข้อมูลข้อสอบใหม่ และตั้ง _originalIndex ป้องกันระบบ Sorting พัง
            var newOriginalIndex = window.APP.allQuestions.length;
            window.APP.allQuestions.push(Object.assign({
                state: false, select: '', attemptCount: 0, failCount: 0,
                _originalIndex: newOriginalIndex
            }, newQ));
            applied++;
        }
    });

    if (applied > 0) {
        // บันทึกคำถามที่ผู้ใช้งานกำลังเปิดค้างไว้เพื่อนำกลับมาแสดงหลังประมวลชุดข้อมูลใหม่
        var currentActiveQId = window.APP.currentQuestions[window.APP.questionIndex] ? window.APP.currentQuestions[window.APP.questionIndex].questionId : null;

        // สั่งรวบรวมและประกอบชุดคำถามคัดกรองใหม่ (ใช้การ rebuild ที่ปลอดภัยของระบบเดิม)
        window.updateQuestionSet(false);

        // ย้ายตำแหน่ง Index กลับมาที่ข้อเดิมที่ผู้ใช้กำลังเปิดอยู่
        if (currentActiveQId) {
            var newActiveIdx = window.APP.currentQuestions.findIndex(function (q) {
                return q.questionId === currentActiveQId;
            });
            if (newActiveIdx !== -1) {
                window.APP.questionIndex = newActiveIdx;
            }
        }

        window.bgToast.fire({
            icon: 'info',
            title: 'อัปเดตข้อมูล ' + applied + ' ข้อเรียบร้อย',
            timer: 2000
        });

        // แสดงคำถามและอัปเดตแผนภาพ Index Dots
        window.showQuestion(false);
        window.renderIndexPanel();

        console.log('[Sync] Applied ' + applied + ' updates and preserved active question state');
    }
};

window.startPendingUpdateWatcher = function () {
    setInterval(function () {
        if (!window.isUserBusy() && window._pendingQuestionUpdates.length > 0) {
            console.log('[Sync] User is free, applying ' + window._pendingQuestionUpdates.length + ' pending updates...');
            window.applyPendingUpdates();
        }
    }, 5000);
};

window.runIncrementalSync = async function () {
    if (window._isSyncing) return;
    window._isSyncing = true;

    var urlParams = new URLSearchParams(window.location.search);
    var subjectParam = urlParams.get('subject') || '';
    var verKey = 'ver_' + subjectParam;
    var cacheKey = 'data_' + subjectParam;

    try {
        var resVer = await fetch(
            window.APPSCRIPT_URL + '?action=checkVersion'
        ).then(function (r) { return r.json(); });

        var localVer = await window.getCacheDB(verKey);
        if (localVer === resVer.v) {
            console.log('[Sync] No changes (version match)');
            return;
        }

        var lastSync = await window.getLastSyncTime(subjectParam);
        var url = window.APPSCRIPT_URL
            + '?action=getChangedSince'
            + '&since=' + lastSync
            + (subjectParam ? '&subject=' + subjectParam : '');

        var res = await fetch(url).then(function (r) { return r.json(); });

        // กรณีโครงสร้างวิชา หรือชื่อบทเรียนเปลี่ยน (แต่คำถามไม่ได้แก้)
        if (!res.changed || res.changed.length === 0) {
            // ดึง Structure และ Category ล่าสุดมาอัปเดต
            var structUrl = window.APPSCRIPT_URL + '?action=getStructure' + (subjectParam ? '&subject=' + subjectParam : '');
            var structRes = await fetch(structUrl).then(function (r) { return r.json(); });

            if (structRes && structRes.subjects) {
                var existingCache = await window.getCacheDB(cacheKey);
                if (existingCache) {
                    existingCache.structure = structRes;
                    await window.setCacheDB(cacheKey, existingCache);
                    window.APP.globalStructure = structRes;
                    window.renderAccordionUI(window.APP.globalStructure); // วาด Sidebar ใหม่
                    console.log('[Sync] Structure & Categories updated successfully');
                }
            }

            await window.setCacheDB(verKey, resVer.v);
            await window.saveLastSyncTime(subjectParam, res.serverTime || Date.now());
            return;
        }

        console.log('[Sync] Got ' + res.changed.length + ' changed questions');

        // Merge เข้า IndexedDB
        await window.mergeChangedQuestionsToCache(res.changed, subjectParam);
        await window.setCacheDB(verKey, resVer.v);
        await window.saveLastSyncTime(subjectParam, res.serverTime || Date.now());

        res.changed.forEach(function (q) {
            // เช็คซ้ำเพื่อป้องกันข้อมูลใน queue ทับกัน
            if (!window._pendingQuestionUpdates.some(function (pq) { return pq.questionId === q.questionId; })) {
                window._pendingQuestionUpdates.push(q);
            }
        });

        if (!window.isUserBusy()) {
            window.applyPendingUpdates();
        } else {
            console.log('[Sync] User busy, queued ' + res.changed.length + ' updates');
            window._showPendingBadge(window._pendingQuestionUpdates.length);
        }

    } catch (err) {
        console.warn('[Sync] Incremental sync failed:', err.message);
    } finally {
        window._isSyncing = false;
    }
};

window._showPendingBadge = function (count) {
    var $badge = $('#sync-pending-badge');
    if ($badge.length === 0) {
        $badge = $('<div id="sync-pending-badge"></div>').css({
            position: 'fixed', bottom: '20px', left: '20px',
            background: 'var(--color-primary)', color: 'white', // สอดคล้องตาม Theme ปัจจุบัน
            padding: '8px 14px', borderRadius: '20px',
            fontSize: '0.9rem', fontWeight: '700',
            zIndex: 500, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            fontFamily: 'var(--font-primary)'
        }).on('click', function () {
            if (!window.isUserBusy()) {
                $badge.html('<i class="fas fa-spinner fa-spin"></i> กำลังดึงข้อมูล...').css('pointer-events', 'none');
                setTimeout(function () {
                    window.applyPendingUpdates();
                    $badge.fadeOut(300, function () { $(this).remove(); });
                }, 100);
            }
        });
        $('body').append($badge);
    }
    $badge.html('<i class="fas fa-sync-alt"></i> มีข้อมูลใหม่ ' + count + ' ข้อ (คลิกอัปเดต)').fadeIn();
};

window.renderExplainHtmlForCard = function (explainRaw) {
    if (!explainRaw) return '';
    const parsed = window.parseExplain(explainRaw);
    let html = `<b>อธิบาย:</b><br>${parsed.text || 'ไม่มีคำอธิบาย'}`;

    if (parsed.media && parsed.media.length > 0) {
        html += `<div class="explain-media-group" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px; width: 100%;">`;

        let images = [];
        let pdfs = [];
        let svgs = [];

        parsed.media.forEach(url => {
            const type = window.getMediaType(url);
            if (type === 'pdf') pdfs.push(url);
            else if (type === 'svg') svgs.push(url);
            else images.push(url);
        });

        svgs.forEach(svg => {
            html += `<div class="svg-render-area" onclick="viewFullImageSVG(this, event)" style="cursor: pointer; max-height: 100px; width: auto; background: white; border: 1px solid var(--color-border); border-radius: 4px;">${svg}</div>`;
        });

        if (images.length > 0) {
            html += `<div class="explain-image-gallery">`;
            images.forEach(img => {
                const transformed = window.transformUrl(img);
                html += `<img src="${transformed}" class="explain-img-thumb" referrerpolicy="no-referrer" onclick="viewFullImage('${transformed}', event)">`;
            });
            html += `</div>`;
        }

        pdfs.forEach(pdf => {
            const transformed = window.transformUrl(pdf);
            html += `
                <a href="${transformed}" target="_blank" class="btn btn-outline-primary btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; font-size: 0.95rem; padding: 6px 12px; border-radius: 6px; text-decoration: none; border: 1.5px solid var(--color-primary); color: var(--color-primary); background: var(--color-primary-pale); transition: all 0.15s;">
                    <i class="fas fa-file-pdf text-danger" style="font-size: 1.1rem;"></i> เปิดดู PDF แนบ
                </a>
            `;
        });

        html += `</div>`;
    }
    return html;
};

// สั่งรันคำสั่งเมื่อ DOM พร้อมทำงาน
$(function () {
    window.initApp();
});