// js/app.js

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
            if (window.isUrl(trimmed)) return `<img src="${window.transformUrl(trimmed)}" class="search-card-img" onclick="viewFullImage('${window.transformUrl(trimmed)}', event)">`;
            return trimmed;
        };

        let problemMedia = '';
        if (q.img) {
            const imgArray = q.img.split('///').map(url => url.trim()).filter(Boolean);
            if (imgArray.length > 0) {
                problemMedia = `
                    <div class="search-card-images" style="margin: 10px 0;">
                        <div class="search-image-gallery" style="position: relative; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border-radius: 8px; padding: 10px; min-height: 250px;">
                            <img src="${window.transformUrl(imgArray[0])}" class="search-gallery-main-img" style="max-width: 100%; max-height: 400px; object-fit: contain; cursor: pointer;" data-img-index="0">
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
            <div class="result-card ${isCorrect ? 'is-correct' : 'is-incorrect'} ${isFirstInList ? 'current-active' : ''}" data-search-idx="${realIdx}"
                 onclick="jumpToQuestion(${realIdx})">
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
                ${q.explain ? `<div class="search-card-footer"><b>อธิบาย:</b><br>${q.explain}</div>` : ''}
                <div class="search-card-actions">
                    <button class="btn-search-action btn-search-report" onclick="event.stopPropagation(); window.openReportModal(window.currentQuestions[${realIdx}])">
                        <i class="fas fa-exclamation-triangle"></i> แจ้งปัญหา
                    </button>
                    <button class="btn-search-action btn-search-vote" onclick="event.stopPropagation(); window.openVoteModal(window.currentQuestions[realIdx], false)">
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
    const localVer = await window.getCacheDB(verKey);
    const localData = await window.getCacheDB(cacheKey);

    if (localData) {
        window.APP.globalStructure = localData.structure;
        window.APP.allQuestions = localData.questions;
        window.renderAccordionUI(window.APP.globalStructure);
        window.buildSearchDictionary();
        window.updateSubjectUI(subjectParam);

        // ตรวจเช็คความคืบหน้าที่เซฟค้างไว้และถามผู้ใช้
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

        $('#loading-overlay').hide();
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
                questions: resQues.map((q, index) => ({ ...q, _originalIndex: index }))
            };

            await window.setCacheDB(cacheKey, newData);
            await window.setCacheDB(verKey, serverVersion);

            if (!localData) {
                window.APP.globalStructure = newData.structure;
                window.APP.allQuestions = newData.questions;
                window.renderAccordionUI(window.APP.globalStructure);
                window.updateQuestionSet();
                window.buildSearchDictionary();
            }
        }
    } catch (err) {
        console.error("Init Error:", err);
    } finally {
        window.finishLoading();
    }
};

// สั่งรันคำสั่งเมื่อ DOM พร้อมทำงาน
$(function () {
    window.initApp();
    window.checkPendingReports();
});