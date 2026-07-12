// REFACTOR/js/app.js

// =========================================================
// 1. ระบบจัดการภาพรวมและ UI พื้นฐาน
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

    // อัปเดตคะแนนในส่วนของ Header ภาพรวมข้อสอบให้ตรงกับปัจจุบันเสมอ (จำนวนที่ถูก / จำนวนข้อที่ทำไปแล้ว)
    let totalAnswered = window.APP.currentQuestions.filter(q => q.state).length;
    $('#index-score-badge-header').text(`${window.APP.score} / ${totalAnswered}`);

    // อัปเดต Dot Grid ทันทีหากผู้ใช้เปิดแผงทิ้งไว้
    if ($('#index-grid-container').hasClass('open')) {
        window.renderIndexPanel();
    }
};

window.updateSubjectUI = function (subjectParam) {
    if (subjectParam) {
        const subjObj = window.APP.globalStructure.subjects.find(s => s.subjectId === subjectParam);
        const subjectName = subjObj?.subjectName || subjectParam;
        const yearLabel = subjObj?.year ? `[ปี ${subjObj.year}] ` : '';
        $('.selection-container h2').html(`✅ เลือกหัวข้อ (วิชา: <span style="color:var(--color-primary)">${yearLabel}${subjectName}</span>)`);
    }
};

window.populateSubjectSelector = async function (subjectParam) {
    let allSubjects = await window.getCacheDB('all_subjects_list_v2');
    if (!allSubjects) {
        try {
            const resAllStruct = await window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getStructure&_=${Date.now()}`);
            if (resAllStruct && resAllStruct.subjects) {
                const uniqueSubjs = [];
                const seen = new Set();
                resAllStruct.subjects.forEach(s => {
                    if (s.subjectId && !seen.has(s.subjectId)) {
                        seen.add(s.subjectId);
                        uniqueSubjs.push({ id: s.subjectId, name: s.subjectName, year: s.year });
                    }
                });
                allSubjects = uniqueSubjs;
                await window.setCacheDB('all_subjects_list_v2', allSubjects);
            }
        } catch (err) {
            console.warn("Failed to fetch all subjects:", err);
        }
    }

    window.APP.allSubjectsList = allSubjects;

    let currentYear = "";
    if (subjectParam && allSubjects) {
        const currentSubj = allSubjects.find(s => String(s.id) === String(subjectParam));
        if (currentSubj && currentSubj.year) {
            currentYear = String(currentSubj.year);
        }
    }

    const $yearSelect = $('#year-select');
    if ($yearSelect.length) {
        $yearSelect.val(currentYear);
    }

    window.filterSubjectOptions(currentYear, subjectParam);
};

window.filterSubjectOptions = function (selectedYear, activeSubjectId) {
    const $select = $('#subject-select');
    const allSubjects = window.APP.allSubjectsList;

    if ($select.length && allSubjects) {
        $select.empty().append('<option value="">-- แสดงทั้งหมด (All Subjects) --</option>');
        allSubjects.forEach(s => {
            if (selectedYear && String(s.year) !== String(selectedYear)) {
                return;
            }
            const selected = (String(s.id) === String(activeSubjectId)) ? 'selected' : '';
            const yearLabel = s.year ? `[ปี ${s.year}] ` : '';
            $select.append(`<option value="${s.id}" ${selected}>${yearLabel}${s.id} - ${s.name}</option>`);
        });
    }
};

window.finishLoading = function () {
    $('#loading-overlay').hide();
};

window.checkPendingReports = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || '';

    window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getPendingReportCount&subject=${subjectParam}&_=${Date.now()}`)
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
// 2. ระบบ INCREMENTAL SYNC (ต้องประกาศก่อนเรียกใช้งาน)
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
    if ($('#donate-key-modal-card').is(':visible')) return true;
    if ($('#auto-grader-modal').is(':visible')) return true;
    if ($('#quiz-edit-modal').is(':visible')) return true;

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
        var currentActiveQId = window.APP.currentQuestions[window.APP.questionIndex] ? window.APP.currentQuestions[window.APP.questionIndex].questionId : null;
        var orderedIds = window.APP.currentQuestions.map(function (q) { return q.questionId; });

        window.updateQuestionSet(false, false);

        // Restore original quiz order; new questions fall to end
        var orderMap = {};
        orderedIds.forEach(function (id, idx) { orderMap[id] = idx; });
        window.APP.currentQuestions.sort(function (a, b) {
            var ia = orderMap[a.questionId];
            var ib = orderMap[b.questionId];
            if (ia === undefined && ib === undefined) return 0;
            if (ia === undefined) return 1;
            if (ib === undefined) return -1;
            return ia - ib;
        });

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
        var resVer = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=checkVersion&_=' + Date.now();
        });

        var localVer = await window.getCacheDB(verKey);
        if (localVer === resVer.v) {
            console.log('[Sync] No changes (version match)');
            return;
        }

        var lastSync = await window.getLastSyncTime(subjectParam);
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL
                + '?action=getChangedSince'
                + '&since=' + lastSync
                + (subjectParam ? '&subject=' + subjectParam : '')
                + '&_=' + Date.now();
        });

        if (!res.changed || res.changed.length === 0) {
            var structRes = await window.fetchGAS(function () { return window.APPSCRIPT_URL + '?action=getStructure' + (subjectParam ? '&subject=' + subjectParam : '') + '&_=' + Date.now(); });

            if (structRes && structRes.subjects) {
                var existingCache = await window.getCacheDB(cacheKey);
                if (existingCache) {
                    existingCache.structure = structRes;
                    await window.setCacheDB(cacheKey, existingCache);
                    window.APP.globalStructure = structRes;
                    window.renderAccordionUI(window.APP.globalStructure);
                    window.renderAnnouncementsUI(window.APP.globalStructure.announcements || []);
                    console.log('[Sync] Structure & Categories updated successfully');
                }
            }

            await window.setCacheDB(verKey, resVer.v);
            await window.saveLastSyncTime(subjectParam, res.serverTime || Date.now());
            return;
        }

        console.log('[Sync] Got ' + res.changed.length + ' changed questions');

        await window.mergeChangedQuestionsToCache(res.changed, subjectParam);
        await window.setCacheDB(verKey, resVer.v);
        await window.saveLastSyncTime(subjectParam, res.serverTime || Date.now());

        res.changed.forEach(function (q) {
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
            background: 'var(--color-primary)', color: 'white',
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
            } else {
                // แจ้งเตือนผู้ใช้ให้ปิดหน้าต่างย่อย (Modal) ที่ทำงานค้างอยู่ก่อนเพื่อความปลอดภัยของระบบ
                if (typeof window.bgToast !== 'undefined') {
                    window.bgToast.fire({
                        icon: 'warning',
                        title: 'กรุณาปิดหน้าต่างแก้ไข/แจ้งปัญหาที่เปิดค้างอยู่ก่อนอัปเดต'
                    });
                }
            }
        });
        $('body').append($badge);
    }
    $badge.html('<i class="fas fa-sync-alt"></i> มีข้อมูลใหม่ ' + count + ' ข้อ (คลิกอัปเดต)').fadeIn();
};

window._syncInterval = null;
window._idleTimeout = null;
window._currentPollingMode = 'ACTIVE';
window._isUserIdle = false;
window._pollTimer = null;

window.startIncrementalPolling = function () {
    // T2.1: เพิ่ม interval เป็น 5 นาที (active) + random jitter ±30s เพื่อกระจาย herd
    var INTERVALS = {
        ACTIVE: 300000, // 5 minutes
        HIDDEN: 600000  // 10 minutes
    };

    function scheduleNextPoll() {
        clearTimeout(window._pollTimer);
        var base = document.hidden ? INTERVALS.HIDDEN : INTERVALS.ACTIVE;
        var jitter = Math.floor(Math.random() * 60000) - 30000; // ±30000ms
        var delay = Math.max(30000, base + jitter); // ไม่ต่ำกว่า 30s ต่อให้ jitter ดึงต่ำ
        console.log('[Sync] Next poll in ' + Math.round(delay / 1000) + 's (' + (document.hidden ? 'HIDDEN' : 'ACTIVE') + ')');
        window._pollTimer = setTimeout(function () {
            console.log("Auto-checking for data updates...");
            window.runIncrementalSync();
            scheduleNextPoll();
        }, delay);
    }

    // ปรับ schedule ใหม่เมื่อ visibility เปลี่ยน (เพื่อใช้ interval ที่เหมาะสม)
    document.removeEventListener('visibilitychange', scheduleNextPoll);
    document.addEventListener('visibilitychange', scheduleNextPoll);

    scheduleNextPoll();
    console.log('[Sync] Adaptive incremental polling system active (5 min active / 10 min background, ±30s jitter)');
};


// =========================================================
// 3. ระบบแสดงข้อมูลและวิเคราะห์เฉลย
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

        const choicesList = q.choices ? q.choices.split('///').map((c, ci) => {
            const trimmed = c.trim();
            const hasPrefix = /^[A-E]\s*[\.\)]/i.test(trimmed);
            const prefix = hasPrefix ? "" : (String.fromCharCode(65 + ci) + ". ");

            if (window.isUrl(trimmed)) {
                return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}</span><img src="${window.transformUrl(trimmed)}" class="search-card-img" referrerpolicy="no-referrer" onclick="viewFullImage('${window.transformUrl(trimmed)}', event)"></li>`;
            }
            if (trimmed.startsWith('<svg')) {
                return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}</span><div class="svg-render-area" onclick="viewFullImageSVG(this, event)">${trimmed}</div></li>`;
            }
            return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}${trimmed}</span></li>`;
        }).join('') : '';
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


// =========================================================
// 4. ระบบกู้คืนสถานะและความคืบหน้าการทำงาน (Progress Recovery)
// =========================================================

window.checkAndPromptRestoreProgress = async function (sessionKey) {
    // Cross-device: เช็ค cloud ก่อน (no-op ถ้าไม่ได้ล็อกอิน) — ถ้า cloud ใหม่กว่าและผู้ใช้ยืนยัน
    // sync.js จะเขียน state ลง IndexedDB แล้วเราโหลดต่อเลยโดยไม่ถามซ้ำ
    if (typeof window.checkCloudProgress === 'function') {
        const subjectParam = new URLSearchParams(window.location.search).get('subject') || 'default';
        const cloudRestored = await window.checkCloudProgress(subjectParam, sessionKey);
        if (cloudRestored === 'restored') {
            const restored = await window.loadProgressFromCache();
            if (restored) {
                window.showQuestion();
                window.updateProgressHeader();
                window.showSubmission($('#submission-filter').val());
                window.bgToast.fire({ icon: 'success', title: 'โหลดความคืบหน้าจากอุปกรณ์อื่นสำเร็จ' });
                return;
            }
        }
    }
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
    let subjectSelectorPopulated = false;

    if (localData) {
        window.APP.globalStructure = localData.structure;
        window.APP.allQuestions = localData.questions.map(q => ({
            ...q,
            category: Array.isArray(q.category) ? q.category : (q.category ? [q.category] : [])
        }));
        window.renderAccordionUI(window.APP.globalStructure);
        window.renderAnnouncementsUI(window.APP.globalStructure.announcements || []);
        window.renderAttributeFilterUI(); // สร้างชุดตัวกรองละเอียดแบบไดนามิก
        window.searchDictionaryDirty = true; // T3.2: Lazy build — สร้าง Dictionary เมื่อค้นหาจริง
        window.updateSubjectUI(subjectParam);
        loadedSuccessfully = true;

        // โหลด Dropdown ทันทีจาก Cache โดยไม่รอ checkVersion
        await window.populateSubjectSelector(subjectParam);
        subjectSelectorPopulated = true;
    } else {
        $('#loading-overlay').css('display', 'flex');
    }

    try {
        // 2. เปรียบเทียบเวอร์ชันและดึงข้อมูลอัปเดตจากเครื่องเซิร์ฟเวอร์หลัก (GAS) - แนบ cache-buster ป้องกัน browser ค้างไฟล์เก่า
        const resVer = await window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=checkVersion&_=${Date.now()}`);
        const serverVersion = resVer.v;

        if (!localData) {
            // ─── T3.6: First Run — ดึงทุกอย่างใน Parallel รวม Structure ไม่ filter สำหรับ Dropdown ───
            const initFetchPromises = [
                window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getStructure&subject=${subjectParam}&_=${Date.now()}`),
                window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getQuestions&subject=${subjectParam}&_=${Date.now()}`)
            ];
            // ดึง Structure ทั้งหมด (ไม่ filter) พร้อมกันเพื่อ populate dropdown — เฉพาะเมื่อมี subject filter
            if (subjectParam) {
                initFetchPromises.push(
                    window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getStructure&_=${Date.now()}`)
                );
            }
            const initResults = await Promise.all(initFetchPromises);
            const resStruct = initResults[0];
            const resQues   = initResults[1];
            const resAllStruct = initResults[2]; // undefined เมื่อ subjectParam ว่าง (scoped = full ในกรณีนั้น)

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
            await window.saveLastSyncTime(subjectParam, Date.now());

            // T3.6: แคช subjects list ล่วงหน้า ป้องกัน getStructure ซ้ำใน populateSubjectSelector
            const subjectsSource = resAllStruct || resStruct;
            if (subjectsSource && subjectsSource.subjects) {
                const uniqueSubjs = [];
                const seen = new Set();
                subjectsSource.subjects.forEach(s => {
                    if (s.subjectId && !seen.has(s.subjectId)) {
                        seen.add(s.subjectId);
                        uniqueSubjs.push({ id: s.subjectId, name: s.subjectName, year: s.year });
                    }
                });
                await window.setCacheDB('all_subjects_list_v2', uniqueSubjs);
            }

            window.APP.globalStructure = newData.structure;
            window.APP.allQuestions = newData.questions;
            window.renderAccordionUI(window.APP.globalStructure);
            window.renderAnnouncementsUI(window.APP.globalStructure.announcements || []);
            window.renderAttributeFilterUI(); // สร้างชุดตัวกรองละเอียดแบบไดนามิกสำหรับการรันครั้งแรก
            window.searchDictionaryDirty = true; // T3.2: Lazy build
            loadedSuccessfully = true;

        } else if (localVer !== serverVersion) {
            // ─── T1.2: Cache มีอยู่ แต่ Version ต่าง → Incremental Sync ก่อน, Fallback full-fetch ถ้าล้มเหลว ───
            let incrementalOk = false;
            try {
                const lastSync = await window.getLastSyncTime(subjectParam);
                const res = await window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getChangedSince&since=${lastSync}${subjectParam ? '&subject=' + subjectParam : ''}&_=${Date.now()}`);

                if (res.changed && res.changed.length > 0) {
                    // มีคำถามเปลี่ยนแปลง: merge เข้า cache แล้วอัปเดต memory
                    await window.mergeChangedQuestionsToCache(res.changed, subjectParam);

                    const mergedCache = await window.getCacheDB(cacheKey);
                    if (mergedCache) {
                        window.APP.allQuestions = mergedCache.questions.map(q => ({
                            ...q,
                            category: Array.isArray(q.category) ? q.category : (q.category ? [q.category] : [])
                        }));
                        window.searchDictionaryDirty = true; // T3.2
                        window.updateQuestionSet(false, true);
                    }
                } else {
                    // ไม่มีคำถามเปลี่ยน แต่ version ต่าง → Structure/Category เปลี่ยน
                    const structRes = await window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getStructure&subject=${subjectParam}&_=${Date.now()}`);
                    if (structRes && structRes.subjects) {
                        const existingCache = await window.getCacheDB(cacheKey);
                        if (existingCache) {
                            existingCache.structure = structRes;
                            await window.setCacheDB(cacheKey, existingCache);
                            window.APP.globalStructure = structRes;
                            window.renderAccordionUI(window.APP.globalStructure);
                            window.renderAnnouncementsUI(window.APP.globalStructure.announcements || []);
                            console.log('[initApp] Structure & Categories updated (incremental)');
                        }
                    }
                }

                await window.setCacheDB(verKey, serverVersion);
                await window.saveLastSyncTime(subjectParam, res.serverTime || Date.now());
                incrementalOk = true;

            } catch (incErr) {
                console.warn('[initApp] Incremental sync failed, falling back to full fetch:', incErr);
            }

            if (!incrementalOk) {
                // Fallback: Full re-download
                const [resStruct, resQues] = await Promise.all([
                    window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getStructure&subject=${subjectParam}&_=${Date.now()}`),
                    window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getQuestions&subject=${subjectParam}&_=${Date.now()}`)
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
                await window.saveLastSyncTime(subjectParam, Date.now());

                window.APP.globalStructure = newData.structure;
                window.APP.allQuestions = newData.questions;
                window.renderAccordionUI(window.APP.globalStructure);
                window.renderAnnouncementsUI(window.APP.globalStructure.announcements || []);
                window.renderAttributeFilterUI();
                window.searchDictionaryDirty = true; // T3.2
                window.updateQuestionSet(false, true);
            }
            loadedSuccessfully = true;
        }
    } catch (err) {
        console.error("Init Error:", err);
    } finally {
        // โหลดรายชื่อวิชาทั้งหมดใส่ Dropdown (เฉพาะกรณีที่ยังไม่ได้โหลดไว้ก่อนหน้า)
        if (!subjectSelectorPopulated) {
            await window.populateSubjectSelector(subjectParam);
        }

        if (loadedSuccessfully) {
            await window.checkAndPromptRestoreProgress(sessionKey);
        }

        // T1.1: ดาวน์โหลด Pending Votes/Reports แบบ Bulk ครั้งเดียวต่อ Session (fire-and-forget)
        // ไม่รอ await — ไม่บล็อก first render; เมื่อเสร็จจะ re-render badge ข้อปัจจุบัน
        if (loadedSuccessfully && subjectParam) {
            window.fetchAllPendingVotesReports(subjectParam).then(function () {
                var curQ = window.APP.current_question;
                if (curQ && curQ.questionId) {
                    if (window.APP.pendingVotesCache[curQ.questionId]) {
                        window.renderVoteNotificationUI(curQ.questionId, window.APP.pendingVotesCache[curQ.questionId]);
                    }
                    if (window.APP.pendingReportsCache[curQ.questionId]) {
                        window.renderReportNotificationUI(curQ.questionId, window.APP.pendingReportsCache[curQ.questionId]);
                    }
                }
            }).catch(function (err) {
                console.warn('[Bulk VR] startup fetch failed:', err);
            });
        }

        // บูตระบบ Incremental Sync ทำงานในฝั่งผู้ใช้งาน (มีตัวรับส่งที่พร้อม 100%)
        window.startPendingUpdateWatcher();   // ตัวคอยตรวจสิทธิ์ว่างทุกๆ 5 วินาที
        window.startIncrementalPolling();      // บูตลูปตรวจสอบเซิร์ฟเวอร์ทุกๆ 5 นาที (active) / 10 นาที (background)

        window.checkPendingReports();
        window.finishLoading();
    }
};

window.forceSyncDatabase = async function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || '';
    const cacheKey = `data_${subjectParam}`;
    const verKey = `ver_${subjectParam}`;
    const syncTimeKey = `last_sync_${subjectParam}`;

    const { isConfirmed } = await Swal.fire({
        title: 'ดึงข้อมูลใหม่ล่าสุดจากเซิร์ฟเวอร์?',
        text: 'ระบบจะทำการเคลียร์ข้อมูล Cache เก่าในเครื่องทั้งหมด และดึงข้อสอบล่าสุดโดยติดต่อตรงกับทาง Google Sheets',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ตกลง, ดึงข้อมูลใหม่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#0d6efd'
    });

    if (!isConfirmed) return;

    $('#loading-overlay').fadeIn(150).css('display', 'flex').find('h5').text('กำลังล้าง Cache และดาวน์โหลดข้อสอบล่าสุด...');

    try {
        const db = await window.openDB();
        const transaction = db.transaction("quiz_cache", "readwrite");
        const store = transaction.objectStore("quiz_cache");
        
        // ล้างข้อมูล cache รายวิชา, ข้อมูลการ sync และ dropdown ทั้งหมด
        await store.delete(cacheKey);
        await store.delete(verKey);
        await store.delete(syncTimeKey);
        await store.delete('all_subjects_list_v2');

        Swal.fire({
            icon: 'success',
            title: 'ล้าง Cache สำเร็จ',
            text: 'ระบบกำลังเริ่มโหลดโครงสร้างและชุดข้อสอบล่าสุดใหม่...',
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            location.reload();
        });
    } catch (e) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถล้าง Cache ได้: ' + e.message, 'error');
        $('#loading-overlay').hide();
    }
};

// สั่งรันคำสั่งเมื่อ DOM พร้อมทำงานสมบูรณ์
$(function () {
    window.initApp();

    $(document).on('change', '#year-select', function () {
        const selectedYear = $(this).val();
        const activeSubjectId = $('#subject-select').val();
        window.filterSubjectOptions(selectedYear, activeSubjectId);
    });

    $(document).on('change', '#subject-select', function () {
        const selectedSubj = $(this).val();
        if (selectedSubj) {
            window.location.search = '?subject=' + encodeURIComponent(selectedSubj);
        } else {
            window.location.search = '';
        }
    });

    $(document).on('click', '#btn-force-sync', function () {
        window.forceSyncDatabase();
    });
});

(function () {
    var deferredInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        var $banner = $('#pwa-install-banner');
        $banner.css('display', 'flex').hide().fadeIn(400);
        setTimeout(function () { $banner.fadeOut(600); }, 8000);
    });

    $(document).on('click', '#pwa-install-btn', function () {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function (choice) {
            if (typeof gtag === 'function') {
                gtag('event', 'pwa_install', { outcome: choice.outcome });
            }
            deferredInstallPrompt = null;
            $('#pwa-install-banner').fadeOut(300);
        });
    });

    $(document).on('click', '#pwa-install-dismiss', function () {
        $('#pwa-install-banner').fadeOut(300);
    });

    window.addEventListener('appinstalled', function () {
        if (typeof gtag === 'function') {
            gtag('event', 'pwa_installed');
        }
        $('#pwa-install-banner').fadeOut(300);
    });

    // iOS/iPadOS: beforeinstallprompt not supported — show manual hint instead
    // iPadOS 13+ reports UA as Macintosh, so also check Mac + touch
    var isIOSLike = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                    (/Mac/i.test(navigator.userAgent) && 'ontouchend' in document);
    if (isIOSLike && !navigator.standalone) {
        var $iosHint = $('#pwa-ios-hint');
        if (window.self !== window.top) {
            // Inside iframe (Google Sites) — user must open quiz directly to install
            $('#pwa-ios-share-text').hide();
            $('#pwa-ios-open-link').show();
        }
        $iosHint.css('display', 'flex');
        setTimeout(function () { $iosHint.fadeOut(600); }, 8000);
    }
}());