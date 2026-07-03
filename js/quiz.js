// REFACTOR/js/quiz.js

// 1. ระบบจัดการภาพรวมชุดข้อสอบ (Index Panel)
window.renderIndexPanel = function () {
    if (typeof window.APP.currentQuestions === 'undefined' || !window.APP.currentQuestions.length) return;

    const $grid = $('#index-dot-grid');
    $grid.empty();

    let correct = 0, wrong = 0;
    window.APP.currentQuestions.forEach((q, idx) => {
        let cls = 'index-dot';
        let title = `ข้อที่ ${idx + 1}`;

        if (idx === window.APP.questionIndex) {
            cls += ' idx-current';
            title += ' (ปัจจุบัน)';
        } else if (q.state) {
            if (q.select === q.answer) {
                cls += ' idx-correct';
                correct++;
                title += ' ✓ ถูก';
            } else {
                cls += ' idx-wrong';
                wrong++;
                title += ' ✗ ผิด';
            }
        }

        $grid.append(
            `<div class="${cls}" title="${title}" onclick="window.jumpToQuestion(${idx})">${idx + 1}</div>`
        );
    });

    let totalCorrect = window.APP.currentQuestions.filter(q => q.state && q.select === q.answer).length;
    let totalAnswered = window.APP.currentQuestions.filter(q => q.state).length;
    $('#index-score-badge-header').text(`${totalCorrect} / ${totalAnswered}`);
};

window.jumpToQuestion = function (index) {
    if (index < 0 || index >= window.APP.currentQuestions.length) return;
    window.APP.questionIndex = index;
    window.showQuestion();
    window.updateProgressHeader();
    window.showSubmission($('#submission-filter').val());
};

// 2. ระบบดาวน์โหลดภาพคำถามล่วงหน้า (Image Preloader)
window.preloadQuizImages = function (questions) {
    if (!questions || questions.length === 0) return;

    questions.forEach(q => {
        if (q.img) {
            const urls = q.img.split('///').map(u => window.transformUrl(u.trim())).filter(Boolean);
            urls.forEach(url => {
                if (!window.APP.preloadedImages[url]) {
                    const img = new Image();
                    img.src = url;
                    window.APP.preloadedImages[url] = img;
                }
            });
        }

        if (q.choices) {
            const choicesArray = q.choices.split("///").map(s => s.trim()).filter(Boolean);
            choicesArray.forEach(choice => {
                if (window.isUrl(choice)) {
                    const url = window.transformUrl(choice);
                    if (!window.APP.preloadedImages[url]) {
                        const img = new Image();
                        img.src = url;
                        window.APP.preloadedImages[url] = img;
                    }
                }
            });
        }

        if (q.explain) {
            const parsedExp = window.parseExplain(q.explain);
            parsedExp.media.forEach(url => {
                if (window.getMediaType(url) === 'image') {
                    const trans = window.transformUrl(url);
                    if (!window.APP.preloadedImages[trans]) {
                        const img = new Image();
                        img.src = trans;
                        window.APP.preloadedImages[trans] = img;
                    }
                }
            });
        }
    });
    console.log("Preloading started for " + questions.length + " questions...");
};

// 3. ระบบแสดงคำถาม (Show Question)
window.showQuestion = function (shouldFocus = true) {
    if (!window.APP.currentQuestions.length) return;

    window.questionStartTime = Date.now();
    window.APP.current_question = window.APP.currentQuestions[window.APP.questionIndex];

    window.APP.current_question.attemptCount = window.APP.current_question.attemptCount || 0;
    window.APP.current_question.failCount = window.APP.current_question.failCount || 0;

    let statusColor = "#dc3545";
    let statusSuffix = "";

    if (window.APP.current_question.state && window.APP.current_question.select === window.APP.current_question.answer) {
        statusColor = "#198754";
        statusSuffix = " | สถานะ: ทำถูกแล้ว ✅";
    }

    // ==========================================
    // 1. สั่งล้างคำอธิบายเฉลยและ Feedback เก่าทิ้งทันทีเมื่อเปลี่ยนข้อ
    // ==========================================
    $('#feedback').empty().removeClass();
    $('#quiz-explain-container').empty();
    $('#choices').empty();

    $('#vote-notification-bar').empty();
    if (window.APP.pendingVotesCache[window.APP.current_question.questionId]) {
        window.renderVoteNotificationUI(window.APP.current_question.questionId, window.APP.pendingVotesCache[window.APP.current_question.questionId]);
    }
    // T1.1: per-qid fetch เฉพาะกรณี bulk ยังไม่เสร็จ (fallback สำหรับข้อปัจจุบัน)
    if (!window._bulkPendingLoaded) {
        window.fetchPendingVotes(window.APP.current_question.questionId);
    }

    $('#report-notification-bar').empty();
    if (window.APP.pendingReportsCache[window.APP.current_question.questionId]) {
        window.renderReportNotificationUI(window.APP.current_question.questionId, window.APP.pendingReportsCache[window.APP.current_question.questionId]);
    }
    // T1.1: per-qid fetch เฉพาะกรณี bulk ยังไม่เสร็จ (fallback สำหรับข้อปัจจุบัน)
    if (!window._bulkPendingLoaded) {
        window.fetchPendingReports(window.APP.current_question.questionId);
    }

    let categoryName = "";
    window.APP.current_question.category.forEach(catId => {
        const catObj = window.APP.globalStructure.category.find(c => c.categoryId === catId);
        if (catObj) {
            categoryName += (categoryName ? "<br>" : "") + (window.APP.current_question.category.indexOf(catId) + 1) + ". " + catObj.categoryName;
        }
    });
    $('#categoryquestion').html(categoryName ? `หัวข้อ: <b>${categoryName}</b>` : "หัวข้อ: <b>ไม่ระบุหัวข้อ</b>");
    $('#btn-copy-question-ai').show();
    $('#question').html(window.APP.current_question.problem ? window.APP.current_question.problem.replace(/\n/g, '<br>') : "");

    window.APP.currentImageArray = window.APP.current_question.img ?
        (window.APP.current_question.img.includes('///') ? window.APP.current_question.img.split('///') : [window.APP.current_question.img])
        : [];
    window.APP.currentImageIndex = 0;
    window.updateImageGallery();

    const choicesRaw = window.APP.current_question.choices || "";
    const choicesArray = choicesRaw.split("///").map(s => s.trim()).filter(Boolean);

    let indices = choicesArray.map((_, i) => i);
    // Shuffle choices only if the question has not been answered yet
    if (!window.APP.current_question.state) {
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
    }

    let allowedOriginalIndices = [];
    if (window.APP.isFastMode && !window.APP.current_question.state) {
        const correctOriginalIdx = choicesArray.indexOf(window.APP.current_question.answer);
        if (correctOriginalIdx !== -1) {
            const incorrectOriginalIndices = choicesArray.map((_, idx) => idx).filter(idx => idx !== correctOriginalIdx);
            if (incorrectOriginalIndices.length > 0) {
                const randomIncorrectIdx = incorrectOriginalIndices[Math.floor(Math.random() * incorrectOriginalIndices.length)];
                allowedOriginalIndices = [correctOriginalIdx, randomIncorrectIdx];
            }
        }
    }

    indices.forEach((i, idx) => {
        const choiceText = choicesArray[i];

        // ล้างลบตัวเลือกหัวข้อ A-E เดิมที่ติดมาจากฐานข้อมูลออกก่อน (ถ้ามี) เพื่อป้องกันการตีกันของหัวข้อตอนสลับลำดับ
        const cleanChoiceText = choiceText.replace(/^[A-E]\s*[\.\)]\s*/i, "");
        const prefix = String.fromCharCode(65 + idx) + ". ";
        let content = cleanChoiceText;

        if (window.isUrl(cleanChoiceText)) {
            content = `${prefix}<img src="${window.transformUrl(cleanChoiceText)}" alt="Choice">`;
        } else if (cleanChoiceText.startsWith('<svg')) {
            content = `${prefix}<div class="svg-choice-container" style="display:inline-block; vertical-align:middle;">${cleanChoiceText}</div>`;
        } else {
            content = prefix + cleanChoiceText;
        }
        const $btn = $('<button></button>');
        // เก็บคำตอบต้นฉบับเต็มไว้ใช้ตรวจสอบกับคำเฉลย (ห้ามตัด Prefix ออกจากแอตทริบิวต์ data-answer เพื่อความถูกต้องในการตรวจเฉลย)
        $btn.attr('data-answer', choiceText);
        $btn.html(content);

        if (window.APP.isFastMode && !window.APP.current_question.state && allowedOriginalIndices.length > 0) {
            if (!allowedOriginalIndices.includes(i)) {
                $btn.addClass('faded-choice');
            }
        }

        $('#choices').append($btn);
    });

    // ==========================================
    // 2. ตรวจสอบสถานะเพื่อแสดงคำอธิบายเฉลยเฉพาะของข้อปัจจุบัน
    // ==========================================
    if (window.APP.current_question.state) {
        // หากผู้เรียนเคยทำข้อนี้ไปแล้ว -> แสดงเฉลย และดึงคำอธิบายเฉลยของข้อนี้ขึ้นมาวาดใหม่
        window.checkAnswerUI(window.APP.current_question.select, false);
        window.renderExplainMediaInQuiz(window.APP.current_question.explain, '#quiz-explain-container');
    } else if (window.APP.isShowingAllAnswers) {
        // หากเปิดโหมดแสดงเฉลยล่วงหน้า -> บังคับแสดงเฉลย และคำอธิบายเฉลยของข้อนี้ทันที
        $('#choices').find(`button[data-answer="${window.APP.current_question.answer}"]`).addClass('correct');
        $('#feedback').addClass('correct').html(`เฉลย: ${window.displayAnswerContent(window.APP.current_question.answer)}`);
        window.renderExplainMediaInQuiz(window.APP.current_question.explain, '#quiz-explain-container');
    }

    $('#questionIndex').text(`${window.APP.questionIndex + 1}/${window.APP.currentQuestions.length}`);

    if (window.APP.pendingVotesCache[window.APP.current_question.questionId]) {
        window.renderVoteNotificationUI(window.APP.current_question.questionId, window.APP.pendingVotesCache[window.APP.current_question.questionId]);
    }
    // T1.1: per-qid fetch เฉพาะกรณี bulk ยังไม่เสร็จ
    if (!window._bulkPendingLoaded) {
        window.fetchPendingVotes(window.APP.current_question.questionId);
    }

    // Sync Edit Mode button status
    if (window.EDIT_SESSION && window.EDIT_SESSION.isLoggedIn) {
        $('#btn-edit-current-q').show();
    } else {
        $('#btn-edit-current-q').hide();
    }

    if (shouldFocus) {
        // ... (focus choices) ...
        $('#choices').find('button').first().trigger('focus', { preventScroll: true });
    }
    setTimeout(window.renderAllMath, 50);

    if ($('#quick-cat-container').is(':visible')) { window.renderQuickCatPanel(); }
};

// 4. ระบบการเดินหน้า / ถอยหลังของคำถาม
window.nextQuestion = function () {
    if (window.APP.questionIndex < window.APP.currentQuestions.length - 1) {
        window.APP.questionIndex++;
        window.showQuestion();
    } else {
        Swal.fire("นี่คือข้อสุดท้ายแล้ว!");
    }
    window.updateProgressHeader();
    window.saveProgressToCache();
    window.showSubmission($('#submission-filter').val());
};

window.prevQuestion = function () {
    if (window.APP.questionIndex > 0) {
        window.APP.questionIndex--;
        window.showQuestion();
        window.updateProgressHeader();
        window.saveProgressToCache();
        window.showSubmission($('#submission-filter').val());
    }
};

// 5. ระบบส่งคำตอบและคำนวณคะแนน
window.submitQuestion = function () {
    if (window.APP.current_question.state) return;

    const $selectedBtn = $('#choices').find("button.selected");
    const selectedAnswer = $selectedBtn.attr('data-answer');

    if (!selectedAnswer) {
        Swal.fire("กรุณาเลือกคำตอบ");
        return;
    }

    window.APP.current_question.attemptCount = (window.APP.current_question.attemptCount || 0) + 1;
    window.APP.currentQuestions[window.APP.questionIndex].select = selectedAnswer;
    window.APP.currentQuestions[window.APP.questionIndex].state = true;

    if (selectedAnswer === window.APP.current_question.answer) {
        window.APP.score++;
    } else {
        window.APP.current_question.failCount = (window.APP.current_question.failCount || 0) + 1;

        if (window.APP.isReviewMode) {
            const retryQuestion = {
                ...window.APP.current_question,
                state: false,
                select: ""
            };

            const min = window.APP.questionIndex + 1;
            const max = window.APP.currentQuestions.length;
            const insertAt = Math.floor(Math.random() * (max - min + 1)) + min;

            window.APP.currentQuestions.splice(insertAt, 0, retryQuestion);
        }
    }

    $('#score').text(`${window.APP.score}/${window.APP.currentQuestions.length}`);
    $('#questionIndex').text(`${window.APP.questionIndex + 1}/${window.APP.currentQuestions.length}`);

    // Re-draw choices in their original database order (since state is now true, showQuestion will not shuffle)
    window.showQuestion(false);

    if (selectedAnswer !== window.APP.current_question.answer && window.APP.isReviewMode) {
        $('#feedback').append(`<div style="font-size: 0.8em; color: #721c24;">* ข้อนี้ถูกเพิ่มกลับเข้าไปในชุดคำถามเพื่อให้คุณแก้ตัวอีกครั้ง</div>`);
    }

    window.showSubmission($('#submission-filter').val());
    window.updateProgressHeader();
    setTimeout(window.renderAllMath, 50);
    window.saveProgressToCache();

    setTimeout(() => {
        if (window.APP.sessionAutoVoteCount >= window.MAX_AUTO_VOTE) return;

        let cats = Array.isArray(window.APP.current_question.category) ? window.APP.current_question.category : [window.APP.current_question.category];
        cats = cats.filter(c => c && c !== 'Uncategorized');
        if (cats.length > 1) return;

        let isExcluded = false;
        if (window.APP.globalStructure.category) {
            cats.forEach(catId => {
                const catObj = window.APP.globalStructure.category.find(c => c.categoryId === catId);
                if (catObj) {
                    const groupName = (catObj.accordionGroup || "").toUpperCase();
                    const catName = (catObj.categoryName || "").toUpperCase();

                    const isExcludedGroupName = groupName.includes("LEC") ||
                        groupName.includes("BY AI") ||
                        groupName.includes("(EXTRACTED)");

                    const isExcludedCatName = catName.includes("MODULE") ||
                        catName.includes("COMMED");

                    if (isExcludedGroupName || isExcludedCatName) {
                        isExcluded = true;
                    }
                }
            });
        }

        if (isExcluded) return;
        window.openVoteModal(window.APP.current_question, true);

    }, 80);
};

// 6. ระบบระบุสีให้กับปุ่มตัวเลือก
window.checkAnswerUI = function (selectedVal, updateScore = true) {
    const correctVal = window.APP.current_question.answer;

    $('#choices').find('button').each(function () {
        // ใช้คำสั่ง .attr() แทน .data() ดึงข้อมูลแอตทริบิวต์โดยตรงเพื่อความเสถียรและหลีกเลี่ยงค่า undefined
        const val = $(this).attr('data-answer');
        if (val === correctVal) $(this).addClass('correct');
        if (val === selectedVal && val !== correctVal) $(this).addClass('wrong');
    });

    if (selectedVal === correctVal) {
        $('#feedback').addClass("correct").html(`ถูกต้อง! ${window.displayAnswerContent(correctVal)}`);
        if (updateScore) window.APP.score++;
    } else {
        $('#feedback').addClass("incorrect").html(`ผิด! คำตอบที่ถูกคือ: ${window.displayAnswerContent(correctVal)}`);
    }
    $('#score').text(`คะแนน: ${window.APP.score}/${window.APP.currentQuestions.length}`);
};

window.highlightAnswers = function () {
    $('#choices').find("button").each(function () {
        const buttonVal = $(this).attr('data-answer');
        if (buttonVal === window.APP.current_question.answer) {
            $(this).addClass("correct");
        } else if (buttonVal === window.APP.current_question.select) {
            $(this).addClass("wrong");
        }
    });
};

// 7. ตรรกะคัดแยกและจัดเรียงคำถาม
window.sortCurrentQuestions = function () {
    const answered = window.APP.currentQuestions.filter(q => q.state);
    const unanswered = window.APP.currentQuestions.filter(q => !q.state);

    const groupAndShuffle = (list) => {
        if (!window.APP.isRandomized) {
            return list.sort((a, b) => a._originalIndex - b._originalIndex);
        }

        const groups = [];
        const groupMap = new Map();

        list.forEach(q => {
            const match = q.problem.trim().match(/^(\d+)\./);
            if (match) {
                const baseNumber = match[1];
                if (!groupMap.has(baseNumber)) {
                    const newGroup = [];
                    groups.push(newGroup);
                    groupMap.set(baseNumber, newGroup);
                }
                groupMap.get(baseNumber).push(q);
            } else {
                groups.push([q]);
            }
        });

        groups.forEach(group => {
            if (group.length > 1) {
                group.sort((a, b) => {
                    return a.problem.localeCompare(b.problem, undefined, { numeric: true, sensitivity: 'base' });
                });
            }
        });

        for (let i = groups.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [groups[i], groups[j]] = [groups[j], groups[i]];
        }

        return groups.flat();
    };

    window.APP.currentQuestions = [...groupAndShuffle(answered), ...groupAndShuffle(unanswered)];
};

// 8. การกรองและเปลี่ยนชุดข้อสอบ (Modified to support both categories and dynamic attribute filters)
window.updateQuestionSet = function (shouldSort = true, shouldShow = true) {
    const previouslyAnswered = {};
    window.APP.currentQuestions.forEach(q => {
        if (q.state) {
            previouslyAnswered[q.questionId] = {
                select: q.select,
                state: q.state,
                attemptCount: q.attemptCount,
                failCount: q.failCount
            };
        }
    });

    window.APP.currentQuestions = [];

    if (window.APP.filterMode === "category") {
        // กรองแบบ Accordion Category ปกติ
        const selectedCategoryIds = $('input[type="checkbox"][name="category"]:checked').map(function () {
            return this.value;
        }).get();

        if (selectedCategoryIds.length === 0) {
            window.APP.currentQuestions = window.APP.allQuestions.map(q => ({
                ...q,
                attemptCount: 0,
                failCount: 0
            }));
        } else {
            window.APP.currentQuestions = window.APP.allQuestions.filter(q => {
                if (!q.category) return false;
                let cats = Array.isArray(q.category) ? q.category : [q.category];
                return cats.some(c => selectedCategoryIds.includes(c));
            }).map(q => ({
                ...q,
                attemptCount: 0,
                failCount: 0
            }));
        }
    } else {
        // กรองแบบคุณสมบัติละเอียด (Year / ExamGroup / SubGroupSuffix / Topic)
        const selectedYears = $('input[type="checkbox"][name="filter-year"]:checked').map(function () { return this.value; }).get();
        const selectedGroups = $('input[type="checkbox"][name="filter-examgroup"]:checked').map(function () { return this.value; }).get();
        const selectedSuffixes = $('input[type="checkbox"][name="filter-suffix"]:checked').map(function () { return this.value; }).get();
        const selectedTopics = $('input[type="checkbox"][name="filter-topic"]:checked').map(function () { return this.value; }).get();

        const totalSelectedCount = selectedYears.length + selectedGroups.length + selectedSuffixes.length + selectedTopics.length;

        if (totalSelectedCount === 0) {
            window.APP.currentQuestions = window.APP.allQuestions.map(q => ({
                ...q,
                attemptCount: 0,
                failCount: 0
            }));
        } else {
            window.APP.currentQuestions = window.APP.allQuestions.filter(q => {
                const meta = window.parseQuestionMetadata(q);

                const matchYear = selectedYears.length === 0 || selectedYears.includes(meta.year);
                const matchGroup = selectedGroups.length === 0 || selectedGroups.includes(meta.examGroup);
                const matchSuffix = selectedSuffixes.length === 0 || selectedSuffixes.includes(meta.suffix);
                const matchTopic = selectedTopics.length === 0 || selectedTopics.includes(meta.topic);

                return matchYear && matchGroup && matchSuffix && matchTopic;
            }).map(q => ({
                ...q,
                attemptCount: 0,
                failCount: 0
            }));
        }
    }

    window.APP.score = 0;
    window.APP.currentQuestions.forEach(q => {
        if (previouslyAnswered[q.questionId]) {
            const prev = previouslyAnswered[q.questionId];
            q.select = prev.select;
            q.state = prev.state;
            q.attemptCount = prev.attemptCount;
            q.failCount = prev.failCount;
            if (q.state && q.select === q.answer) window.APP.score++;
        } else {
            q.state = false;
            q.select = "";
        }
    });

    if (shouldSort) window.sortCurrentQuestions();

    $('#score').text(`${window.APP.score}/${window.APP.currentQuestions.length}`);
    window.APP.questionIndex = 0;

    if (window.APP.currentQuestions.length > 0) {
        $('#image-container-div').hide();
        if (shouldShow) window.showQuestion(false);
    } else {
        $('#question').html("ไม่พบข้อสอบในเงื่อนไขการกรองที่เลือก");
        $('#choices').empty();
        $('#questionIndex').text("0/0");
        $('#btn-copy-question-ai').hide();
    }

    if (window.APP.currentQuestions.length > 0) {
        window.preloadQuizImages(window.APP.currentQuestions);
    }

    window.updateSelectedCategoryStatus();
    window.saveProgressToCache();
};

window.renderExplainMediaInQuiz = function (explainRaw, containerSelector) {
    const $container = $(containerSelector);
    $container.empty();
    if (!explainRaw) return;

    const parsed = window.parseExplain(explainRaw);

    // 1. Text Explanation
    if (parsed.text) {
        $container.append(`<div class="explain-text-content" style="margin-top: 10px; font-weight: 500; font-size: 1.15rem; line-height: 1.6; color: var(--color-text);">${parsed.text}</div>`);
    }

    // 2. Media container
    if (parsed.media && parsed.media.length > 0) {
        const $mediaDiv = $('<div class="explain-media-group" style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px; width: 100%;"></div>');

        let images = [];
        let pdfs = [];
        let svgs = [];

        parsed.media.forEach(url => {
            const type = window.getMediaType(url);
            if (type === 'pdf') pdfs.push(url);
            else if (type === 'svg') svgs.push(url);
            else images.push(url);
        });

        // SVG rendering
        svgs.forEach(svg => {
            $mediaDiv.append(`<div class="svg-render-area" onclick="viewFullImageSVG(this, event)" style="cursor: pointer; max-height: 200px; width: auto; background: white; border: 1px solid var(--color-border); border-radius: 8px;">${svg}</div>`);
        });

        // Images as simple list/gallery
        if (images.length > 0) {
            const $imgGallery = $('<div class="explain-image-gallery"></div>');
            images.forEach(img => {
                const transformed = window.transformUrl(img);
                $imgGallery.append(`<img src="${transformed}" class="explain-img-thumb" onclick="viewFullImage('${transformed}', event)">`);
            });
            $mediaDiv.append($imgGallery);
        }

        // PDFs as prominent buttons
        pdfs.forEach(pdf => {
            const transformed = window.transformUrl(pdf);
            $mediaDiv.append(`
                <a href="${transformed}" target="_blank" class="btn btn-outline-primary btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; font-size: 1.1rem; padding: 8px 16px; border-radius: 8px; text-decoration: none; border: 1.5px solid var(--color-primary); color: var(--color-primary); background: var(--color-primary-pale); transition: all 0.15s;">
                    <i class="fas fa-file-pdf text-danger" style="font-size: 1.4rem;"></i> 📄 เปิดดูเอกสาร PDF ประกอบคำอธิบาย
                </a>
            `);
        });

        $container.append($mediaDiv);
    }
};

/*
   =========================================
   AI Study Assistant — KKU IntelSphere Shared Pool
   (Idea/interested-using-kkuintel.md — v7: per-question only, no RAG)
   =========================================
*/

// โหลด catalog โมเดลจาก backend (listModels) มาเติม dropdown
window.loadChatbotModelCatalog = async function () {
    try {
        var res = await window.sendWithRetry({ action: 'listModels' });
        if (res.result !== 'success') throw new Error('catalog fetch failed');

        var $select = $('#chatbot-model-select');
        $select.empty();

        var providerOrder = ["Deepseek", "Gemini", "Meta", "Nova", "xAI", "Qwen", "OpenAI", "Claude", "Mistral", "MiniMax"];
        providerOrder.forEach(function (provider) {
            var models = res.catalog[provider];
            if (!models || models.length === 0) return;
            var $group = $('<optgroup>').attr('label', provider);
            models.forEach(function (modelId) { $group.append($('<option>').val(modelId).text(modelId)); });
            $select.append($group);
        });

        var deepseekModels = res.catalog["Deepseek"];
        if (deepseekModels && deepseekModels.indexOf("deepseek-v4-pro") >= 0) {
            $select.val("deepseek-v4-pro");
        }
    } catch (e) {
        console.warn('[Chatbot] Model catalog load failed, using minimal fallback list', e);
        $('#chatbot-model-select').html('<option value="deepseek-v4-pro">Deepseek V4 Pro</option>');
    }
};

// ส่งคำถามนิสิต + context ข้อสอบปัจจุบันไป askAIExpert (provider: IntelSphere)
window.sendChatbotQuery = async function () {
    var query = $('#chatbot-input').val().trim();
    if (!query) return;

    var q = window.APP.current_question;
    var model = $('#chatbot-model-select').val();
    if (!model) { alert('กรุณาเลือกโมเดล AI ก่อน'); return; }
    var token = localStorage.getItem("mdkku_session_token") || "guest_user";

    $('#chatbot-input').val('').prop('disabled', true);
    $('#btn-send-chat').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

    var $conv = $('#chatbot-conversation');
    $conv.append(
        '<div style="align-self:flex-end;background:var(--color-primary-pale);color:var(--color-primary);' +
        'padding:8px 12px;border-radius:12px 12px 0 12px;max-width:85%;font-weight:600;">' +
        $('<div>').text(query).html() + '</div>'  // XSS-safe: escape user input before inserting
    );
    $conv.scrollTop($conv[0].scrollHeight);

    var prompt =
        'คุณคืออาจารย์แพทย์ ช่วยตอบคำถามของนิสิตแพทย์โดยอธิบายด้วยความสุภาพ อิงพยาธิสรีรวิทยา (Pathophysiology) เป็นหลัก\n\n' +
        'โจทย์ข้อสอบ: "' + (q.problem || '') + '"\n' +
        'ตัวเลือก: "' + (q.choices || '') + '"\n' +
        'เฉลย: "' + (q.answer || '') + '"\n' +
        'คำอธิบาย: "' + (q.explain || '') + '"\n\n' +
        'คำถามจากนิสิต: "' + query + '"\n\n' +
        'กรุณาตอบสั้นๆ กระชับ ตรงประเด็น ภาษาไทย ไม่เกิน 200 คำ';

    try {
        var res = await window.sendWithRetry({
            action: 'askAIExpert', prompt: prompt, provider: 'IntelSphere', sessionToken: token, model: model
        });

        if (res.result === 'success') {
            var safeAnswer = $('<div>').text(res.answer).html(); // escape AI response too, not just user input
            var switchNote = res.switched
                ? '<div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:4px;">' +
                'ℹ️ โควต้าของโมเดลที่เลือกหมดชั่วคราว ระบบตอบด้วย <b>' + res.servedModel + '</b> แทน</div>'
                : '';
            $conv.append(
                '<div style="align-self:flex-start;background:var(--color-surface-3);color:var(--color-text);' +
                'padding:8px 12px;border-radius:12px 12px 12px 0;max-width:85%;font-weight:500;font-size:0.95rem;">' +
                switchNote + safeAnswer + '</div>'
            );
        } else {
            $conv.append(
                '<div style="align-self:flex-start;background:var(--color-wrong-bg);color:var(--color-wrong);' +
                'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.9rem;">⚠️ ' + res.message + '</div>'
            );
        }
    } catch (e) {
        $conv.append(
            '<div style="align-self:flex-start;background:var(--color-wrong-bg);color:var(--color-wrong);' +
            'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.9rem;">' +
            '⚠️ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง</div>'
        );
    } finally {
        $('#chatbot-input').prop('disabled', false).focus();
        $('#btn-send-chat').prop('disabled', false).html('<i class="fas fa-paper-plane"></i>');
        $conv.scrollTop($conv[0].scrollHeight);
        if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 50);
    }
};

$(document).on('keypress', '#chatbot-input', function (e) {
    if (e.which === 13) window.sendChatbotQuery();
});

$(document).ready(function () { window.loadChatbotModelCatalog(); });

// Hook showQuestion: โชว์ panel + เคลียร์บทสนทนาเมื่อเปลี่ยนข้อ
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[Chatbot] window.showQuestion not found at hook time — panel will not auto-show');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        $('#quiz-chatbot-panel').fadeIn(200);
        $('#chatbot-conversation').html(
            '<p class="text-muted mb-0" style="font-style:italic;">' +
            'พิมพ์คำถามเพื่อให้ AI อธิบายกลไกการเกิดโรคหรือขยายความเฉลยได้ทันที...</p>'
        );
    };
})();