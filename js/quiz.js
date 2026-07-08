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

// แปลง Markdown จาก AI เป็น HTML แบบปลอดภัย (whitelist tags, ไม่มี attribute ใดๆ)
// ลำดับสำคัญ: ดึง code ออกก่อน → ดึงสูตรคณิต ($...$) → escape ทั้งหมด → parse markdown → คืน code/math กลับ
window.renderMarkdownSafe = function (mdText) {
    if (mdText == null) return '';
    var text = String(mdText).replace(/\r\n/g, '\n');

    var escapeHtml = function (s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    var codeStore = [];
    var mathStore = [];

    text = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, function (_m, code) {
        codeStore.push({ block: true, code: code.replace(/\n$/, '') });
        return '\u0000C' + (codeStore.length - 1) + '\u0000';
    });
    text = text.replace(/`([^`\n]+)`/g, function (_m, code) {
        codeStore.push({ block: false, code: code });
        return '\u0000C' + (codeStore.length - 1) + '\u0000';
    });
    // เก็บสูตรทั้ง delimiter ไว้ — KaTeX (renderAllMath) จะอ่านจาก textContent หลัง insert
    text = text.replace(/\$\$[\s\S]+?\$\$/g, function (m) {
        mathStore.push(m);
        return '\u0000M' + (mathStore.length - 1) + '\u0000';
    });
    text = text.replace(/\$[^$\n]+?\$/g, function (m) {
        mathStore.push(m);
        return '\u0000M' + (mathStore.length - 1) + '\u0000';
    });

    text = escapeHtml(text);

    var inlineMd = function (s) {
        return s
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/(^|\s)_([^_\n]+)_/g, '$1<em>$2</em>')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    };

    var lines = text.split('\n');
    var out = [];
    var para = [];
    var flushPara = function () {
        if (para.length) out.push('<p>' + inlineMd(para.join('<br>')) + '</p>');
        para = [];
    };

    var i = 0;
    while (i < lines.length) {
        var trimmed = lines[i].trim();

        if (!trimmed) { flushPara(); i++; continue; }

        // code block ที่อยู่บรรทัดเดี่ยว — วางนอก <p> กัน nesting เพี้ยน
        var soloCode = trimmed.match(/^\u0000C(\d+)\u0000$/);
        if (soloCode && codeStore[+soloCode[1]].block) { flushPara(); out.push(trimmed); i++; continue; }

        if (/^#{1,3}\s+/.test(trimmed)) {
            flushPara();
            var tag = trimmed.match(/^(#{1,3})/)[1].length >= 3 ? 'h5' : 'h4';
            out.push('<' + tag + '>' + inlineMd(trimmed.replace(/^#{1,3}\s+/, '')) + '</' + tag + '>');
            i++; continue;
        }
        if (/^---+$/.test(trimmed)) { flushPara(); out.push('<hr>'); i++; continue; }
        if (/^&gt;\s?/.test(trimmed)) {
            flushPara();
            var bq = [];
            while (i < lines.length && /^&gt;\s?/.test(lines[i].trim())) {
                bq.push(lines[i].trim().replace(/^&gt;\s?/, ''));
                i++;
            }
            out.push('<blockquote>' + inlineMd(bq.join('<br>')) + '</blockquote>');
            continue;
        }
        if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
            flushPara();
            var ordered = /^\d+[.)]\s+/.test(trimmed);
            var itemRe = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
            var items = [];
            while (i < lines.length && itemRe.test(lines[i].trim())) {
                items.push('<li>' + inlineMd(lines[i].trim().replace(itemRe, '')) + '</li>');
                i++;
            }
            out.push(ordered ? '<ol>' + items.join('') + '</ol>' : '<ul>' + items.join('') + '</ul>');
            continue;
        }
        if (/^\|.*\|$/.test(trimmed)) {
            flushPara();
            var rows = [];
            while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
                rows.push(lines[i].trim());
                i++;
            }
            var hasSep = rows.length > 1 && /^\|[\s:|-]+\|$/.test(rows[1]);
            var tableHtml = '<table>';
            rows.forEach(function (row, idx) {
                if (hasSep && idx === 1) return;
                var cellTag = (hasSep && idx === 0) ? 'th' : 'td';
                tableHtml += '<tr>' + row.slice(1, -1).split('|').map(function (c) {
                    return '<' + cellTag + '>' + inlineMd(c.trim()) + '</' + cellTag + '>';
                }).join('') + '</tr>';
            });
            out.push(tableHtml + '</table>');
            continue;
        }

        para.push(trimmed);
        i++;
    }
    flushPara();

    var html = out.join('');
    html = html.replace(/\u0000C(\d+)\u0000/g, function (_m, n) {
        var c = codeStore[+n];
        return c.block
            ? '<pre><code>' + escapeHtml(c.code) + '</code></pre>'
            : '<code>' + escapeHtml(c.code) + '</code>';
    });
    // escape entities ใน math ด้วย — textContent ใน DOM จะกลับเป็นอักขระจริงให้ KaTeX เอง
    html = html.replace(/\u0000M(\d+)\u0000/g, function (_m, n) {
        return escapeHtml(mathStore[+n]);
    });
    return html;
};

// จำแนกประเภทคำถามนิสิต (keyword heuristic ไทย/อังกฤษ) → ใช้เลือกโมเดลอัตโนมัติ
window.classifyQueryTask = function (query) {
    var q = String(query || '').toLowerCase();
    if (/คำนวณ|โด[สซ]|dose|dosage|gfr|clearance|anion gap|กี่\s*(มก|มล|กรัม|เท่า)|\d+\s*(mg|ml|meq|mmol|kg|%)/.test(q))
        return { key: 'calculation', labelTh: 'คำนวณ' };
    if (/ทำไม(ถึง)?ไม่ใช่|ไม่ใช่ข้อ|ข้อ\s*[a-e1-5ก-จ]|ผิดตรงไหน|ตัด\s*choice|choice\s*[a-e]|ต่างจากข้อ|ข้อไหนถูก/.test(q))
        return { key: 'choice_analysis', labelTh: 'วิเคราะห์ตัวเลือก' };
    if (/ช่วยจำ|วิธีจำ|จำยังไง|จำง่าย|mnemonic|ท่องจำ|เทคนิค(การ)?จำ/.test(q))
        return { key: 'mnemonic', labelTh: 'เทคนิคช่วยจำ' };
    if (/แปลว่า|แปลเป็น|ช่วยแปล|หมายถึงอะไร|หมายความว่า|translate|ภาษาอังกฤษเรียก|ศัพท์/.test(q))
        return { key: 'translate', labelTh: 'แปล/ความหมายศัพท์' };
    if (q.length <= 40 && /คืออะไร|นิยาม|definition|ค่าปกติ|normal (value|range)|เรียกว่าอะไร/.test(q))
        return { key: 'quick_fact', labelTh: 'ข้อเท็จจริงสั้น' };
    return { key: 'reasoning_deep', labelTh: 'อธิบายกลไก/วิเคราะห์เชิงลึก' };
};

// ตาราง preference: งานแต่ละแบบ → ลำดับ family โมเดลที่เหมาะ (match กับ catalog สดจาก backend)
window.TASK_MODEL_PREFS = {
    reasoning_deep: [/^deepseek-v4-pro$/, /^deepseek-.*pro/, /^claude-sonnet/, /^gemini-.*pro/, /^grok-4/, /^gpt-5$/, /^deepseek-/],
    choice_analysis: [/^deepseek-v4-pro$/, /^deepseek-.*pro/, /^claude-sonnet/, /^gemini-.*pro/, /^grok-4/, /^gpt-5$/, /^deepseek-/],
    calculation: [/^deepseek-v4-pro$/, /^gpt-5$/, /^claude-sonnet/, /^gemini-.*pro/, /^qwen.*max/],
    quick_fact: [/^claude-haiku/, /^gemini-.*flash-lite/, /^gemini-.*flash/, /^gpt-5-(nano|mini)/, /^deepseek-.*flash/],
    translate: [/^gemini-.*flash/, /^claude-haiku/, /^gpt-5-mini/, /^qwen/],
    mnemonic: [/^claude-sonnet/, /^gpt-5$/, /^grok-4/, /^gemini-.*pro/]
};

// เลือกโมเดลจริงจาก catalog ตามประเภทงาน — fallback เป็น deepseek-v4-pro เสมอ ห้ามคืน __auto__
window.pickAutoModel = function (taskKey) {
    var ids = [];
    var cat = window._chatbotCatalog;
    if (cat) Object.keys(cat).forEach(function (p) { (cat[p] || []).forEach(function (id) { ids.push(id); }); });
    var prefs = window.TASK_MODEL_PREFS[taskKey] || [];
    for (var i = 0; i < prefs.length; i++) {
        for (var j = 0; j < ids.length; j++) {
            if (prefs[i].test(ids[j])) return ids[j];
        }
    }
    if (ids.indexOf('deepseek-v4-pro') >= 0) return 'deepseek-v4-pro';
    return ids[0] || 'deepseek-v4-pro';
};

// เปิด/ปิด side panel — สถานะจำไว้ใน localStorage
window.toggleChatbotPanel = function (force) {
    var open = (typeof force === 'boolean') ? force : !document.body.classList.contains('chatbot-open');
    document.body.classList.toggle('chatbot-open', open);
    try { localStorage.setItem('mdkku_chatbot_open', open ? '1' : '0'); } catch (e) { }
    if (open) setTimeout(function () { $('#chatbot-input').trigger('focus'); }, 260);
};

// คู่มือ: โมเดลไหนเหมาะกับงานแบบไหน
window.showChatbotModelGuide = function () {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
        title: 'โมเดลไหนเหมาะกับงานแบบไหน?',
        html:
            '<div style="text-align:left;font-size:0.95rem;line-height:1.8;">' +
            '<b>🤖 Auto (แนะนำ)</b> — ระบบวิเคราะห์คำถามแล้วเลือกโมเดลที่เหมาะให้อัตโนมัติ<hr style="margin:8px 0;">' +
            '🧠 <b>อธิบายกลไก / วิเคราะห์เชิงลึก</b> → Deepseek V4 Pro, Claude Sonnet<br>' +
            '🔍 <b>วิเคราะห์ตัวเลือก (ทำไมไม่ใช่ข้อ X)</b> → Deepseek V4 Pro, Claude Sonnet<br>' +
            '🧮 <b>คำนวณ (dose, GFR, ค่าแลบ)</b> → Deepseek V4 Pro, GPT-5<br>' +
            '⚡ <b>ข้อเท็จจริงสั้น / นิยาม</b> → Claude Haiku, Gemini Flash (เร็ว ประหยัดโควต้า)<br>' +
            '🌐 <b>แปลศัพท์ / ความหมาย</b> → Gemini Flash, Claude Haiku<br>' +
            '💡 <b>เทคนิคช่วยจำ (mnemonic)</b> → Claude Sonnet, GPT-5, Grok' +
            '</div>',
        confirmButtonText: 'เข้าใจแล้ว'
    });
};

// โหลด catalog โมเดลจาก backend (listModels) มาเติม dropdown
window.loadChatbotModelCatalog = async function () {
    try {
        var res = await window.sendWithRetry({ action: 'listModels' });
        if (res.result !== 'success') throw new Error('catalog fetch failed');

        window._chatbotCatalog = res.catalog;
        window._chatbotDonors = res.donors || [];

        var $select = $('#chatbot-model-select');
        $select.empty();
        $select.append($('<option>').val('__auto__').text('🤖 Auto — เลือกโมเดลอัตโนมัติ (แนะนำ)'));

        var providerOrder = ["Deepseek", "Gemini", "Meta", "Nova", "xAI", "Qwen", "OpenAI", "Claude", "Mistral", "MiniMax"];
        providerOrder.forEach(function (provider) {
            var models = res.catalog[provider];
            if (!models || models.length === 0) return;
            var $group = $('<optgroup>').attr('label', provider);
            models.forEach(function (modelId) { $group.append($('<option>').val(modelId).text(modelId)); });
            $select.append($group);
        });

        $select.val('__auto__');
    } catch (e) {
        console.warn('[Chatbot] Model catalog load failed, using minimal fallback list', e);
        window._chatbotCatalog = null;
        window._chatbotDonors = [];
        $('#chatbot-model-select').html(
            '<option value="__auto__" selected>🤖 Auto — เลือกโมเดลอัตโนมัติ (แนะนำ)</option>' +
            '<option value="deepseek-v4-pro">Deepseek V4 Pro</option>'
        );
    }
};

// Feedback (👍/😐/👎) ต่อคำตอบ AI — หนึ่งเสียงต่อหนึ่งฟองคำตอบ, fire-and-forget
window._chatbotFeedbackCtx = {};
window._chatbotFeedbackSeq = 0;

// Session memory (in-memory only — cleared on reload). Folded into the prompt because backend is stateless.
window._chatHistory = []; // [{ role:'user'|'ai', text, questionId }]
window.CHATBOT_PLACEHOLDER_HTML =
    '<p class="text-muted mb-0" style="font-style:italic;">พิมพ์คำถามเพื่อให้ AI อธิบายกลไกการเกิดโรคหรือขยายความเฉลยได้ทันที...</p>';

// เริ่มเซสชันใหม่: ล้างประวัติ + รีเซ็ตกล่องสนทนา + ซ่อนแบนเนอร์
window.startNewChatSession = function () {
    window._chatHistory = [];
    $('#chatbot-conversation').html(window.CHATBOT_PLACEHOLDER_HTML);
    $('#chatbot-newq-banner').hide();
    $('#chatbot-input').trigger('focus');
};

// โชว์แบนเนอร์ถามว่าจะเริ่มเซสชันใหม่ไหม เมื่อเปลี่ยนข้อทั้งที่ยังมีบทสนทนาเดิม
window.showNewQuestionBanner = function () {
    $('#chatbot-newq-banner').css('display', 'block');
};

window.submitAiFeedbackRating = function (fbId, rating, btn) {
    $('#ai-fb-' + fbId + ' button').prop('disabled', true).css('opacity', 0.4);
    $(btn).css('opacity', 1);
    $('#ai-fb-' + fbId).append('<span style="margin-left:4px;">ขอบคุณ!</span>');

    var ctx = window._chatbotFeedbackCtx[fbId] || {};
    delete window._chatbotFeedbackCtx[fbId];
    window.sendWithRetry({
        action: 'submitAiFeedback',
        rating: rating,
        model: ctx.model || '',
        questionId: ctx.questionId || '',
        subject: ctx.subject || '',
        promptSnippet: ctx.promptSnippet || '',
        answerSnippet: ctx.answerSnippet || '',
        sessionToken: localStorage.getItem('mdkku_session_token') || 'guest_user'
    }).catch(function () { /* fire-and-forget */ });
};

// ส่งคำถามนิสิต + context ข้อสอบปัจจุบันไป askAIExpert (provider: IntelSphere)
// opts (F5 §5.2): study panel reuse "transport เดิมทั้งหมด" — เปลี่ยนได้เฉพาะหน้าจอ (input/conversation/ปุ่ม)
// ไม่ส่ง opts = พฤติกรรม chatbot dock เดิมทุกอย่าง (default selector เดิม)
window.sendChatbotQuery = async function (opts) {
    opts = opts || {};
    var inputSel = opts.inputSel || '#chatbot-input';
    var convSel = opts.convSel || '#chatbot-conversation';
    var btnSel = opts.btnSel || '#btn-send-chat';
    var query = $(inputSel).val().trim();
    if (!query) return;

    var q = window.APP.current_question;
    if (!q) return;
    var model = $('#chatbot-model-select').val();
    var autoTask = null;
    if (!model || model === '__auto__') {
        autoTask = window.classifyQueryTask(query);
        model = window.pickAutoModel(autoTask.key);
    }
    var token = localStorage.getItem("mdkku_session_token") || "guest_user";

    $(inputSel).val('').prop('disabled', true);
    $(btnSel).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

    var $conv = $(convSel);
    $conv.append(
        '<div style="align-self:flex-end;background:var(--color-primary-pale);color:var(--color-primary);' +
        'padding:8px 12px;border-radius:12px 12px 0 12px;max-width:85%;font-weight:600;">' +
        $('<div>').text(query).html() + '</div>'  // XSS-safe: escape user input before inserting
    );
    $conv.scrollTop($conv[0].scrollHeight);

    // พับประวัติบทสนทนา (session memory) เข้า prompt — backend stateless จึงต้องส่งเป็นข้อความเดียว
    var histText = '';
    if (window._chatHistory && window._chatHistory.length) {
        var turns = window._chatHistory.slice(-6).map(function (t) {
            return (t.role === 'user' ? 'นิสิต' : 'AI') + ': ' + String(t.text || '').slice(0, 500);
        });
        histText = turns.join('\n');
        while (histText.length > 2500 && turns.length > 1) {
            turns.shift();
            histText = turns.join('\n');
        }
    }

    // Feature 4: ป้อน "ข้อสอบที่เกี่ยวข้อง" (precomputed) เป็น grounding block ให้ผู้ช่วย (top 3)
    // อ้างอิงแบบ deterministic จาก relationsMap ไม่ใช่ parse จากคำตอบโมเดล (หลักการเดียวกับ RAG §1.7)
    var relBlock = '';
    var rels = (typeof window.getRelationsForQuestion === 'function' && q)
        ? window.getRelationsForQuestion(q.questionId).slice(0, 3) : [];
    if (rels.length) {
        var pool = window.APP.allQuestions || [];
        var lines = [];
        rels.forEach(function (r) {
            var rq = pool.find(function (x) { return String(x.questionId) === String(r.relatedId); });
            if (rq) {
                lines.push('- โจทย์: "' + (rq.problem || '') + '" เฉลย: "' + (rq.answer || '') +
                    '" คำอธิบาย: "' + (rq.explain || '') + '" (questionId: ' + rq.questionId + ')');
            }
        });
        if (lines.length) relBlock = 'ข้อสอบที่เกี่ยวข้องในคลัง (ใช้ประกอบการอธิบายความเชื่อมโยงถ้าเกี่ยวข้อง):\n' + lines.join('\n') + '\n\n';
    }

    var prompt =
        'คุณคืออาจารย์แพทย์ ช่วยตอบคำถามของนิสิตแพทย์โดยอธิบายด้วยความสุภาพ อิงพยาธิสรีรวิทยา (Pathophysiology) เป็นหลัก\n\n' +
        (histText ? ('บทสนทนาก่อนหน้า (ล่าสุดอยู่ล่างสุด):\n' + histText + '\n\n') : '') +
        relBlock +
        'โจทย์ข้อสอบ: "' + (q.problem || '') + '"\n' +
        'ตัวเลือก: "' + (q.choices || '') + '"\n' +
        'เฉลย: "' + (q.answer || '') + '"\n' +
        'คำอธิบาย: "' + (q.explain || '') + '"\n' +
        '(บริบทโจทย์ด้านบนคือข้อปัจจุบันที่นิสิตกำลังดูอยู่ตอนนี้)\n\n' +
        'คำถามใหม่จากนิสิต: "' + query + '"\n\n' +
        'กรุณาตอบสั้นๆ กระชับ ตรงประเด็น ภาษาไทย ไม่เกิน 200 คำ';

    try {
        var res = await window.sendWithRetry({
            action: 'askAIExpert', prompt: prompt, provider: 'IntelSphere', sessionToken: token, model: model
        });

        if (res.result === 'success') {
            var safeAnswer = window.renderMarkdownSafe(res.answer); // sanitize-by-construction: escaped text + whitelist tags
            // เก็บเทิร์นนิสิต + คำตอบ AI (plain text) เข้าประวัติ เฉพาะเมื่อสำเร็จ (เลี่ยง user turn ค้างเมื่อ error)
            window._chatHistory.push({ role: 'user', text: query, questionId: (q.questionId || '') });
            window._chatHistory.push({ role: 'ai', text: String(res.answer || ''), questionId: (q.questionId || '') });
            if (window._chatHistory.length > 20) window._chatHistory.splice(0, window._chatHistory.length - 20);
            var servedSafe = $('<div>').text(res.servedModel || model).html();
            var autoBadge = autoTask
                ? '<div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:4px;">' +
                '🤖 Auto เลือก <b>' + servedSafe + '</b> · ประเภทคำถาม: ' + autoTask.labelTh + '</div>'
                : '';
            var switchNote = res.switched
                ? '<div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:4px;">' +
                'ℹ️ โควต้าของโมเดลที่เลือกหมดชั่วคราว ระบบตอบด้วย <b>' + servedSafe + '</b> แทน</div>'
                : '';
            // เก็บ context ไว้ส่งกับ feedback (👍/😐/👎) — ลบทิ้งหลังส่ง
            var fbId = ++window._chatbotFeedbackSeq;
            window._chatbotFeedbackCtx[fbId] = {
                model: res.servedModel || model,
                questionId: q.questionId || '',
                subject: new URLSearchParams(location.search).get('subject') || '',
                promptSnippet: query.slice(0, 200),
                answerSnippet: String(res.answer || '').slice(0, 200)
            };
            var fbBar =
                '<div class="ai-fb-bar" id="ai-fb-' + fbId + '">คำตอบนี้เป็นยังไง?' +
                '<button type="button" onclick="window.submitAiFeedbackRating(' + fbId + ',\'good\',this)">👍</button>' +
                '<button type="button" onclick="window.submitAiFeedbackRating(' + fbId + ',\'neutral\',this)">😐</button>' +
                '<button type="button" onclick="window.submitAiFeedbackRating(' + fbId + ',\'bad\',this)">👎</button>' +
                '</div>';
            $conv.append(
                '<div class="chat-md" style="align-self:flex-start;background:var(--color-surface-3);color:var(--color-text);' +
                'padding:8px 12px;border-radius:12px 12px 12px 0;max-width:85%;font-weight:500;font-size:0.95rem;">' +
                autoBadge + switchNote + safeAnswer + fbBar + '</div>'
            );
        } else {
            $conv.append(
                '<div style="align-self:flex-start;background:var(--color-wrong-bg);color:var(--color-wrong);' +
                'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.9rem;">⚠️ ' +
                $('<div>').text(res.message || '').html() + '</div>'
            );
        }
    } catch (e) {
        $conv.append(
            '<div style="align-self:flex-start;background:var(--color-wrong-bg);color:var(--color-wrong);' +
            'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.9rem;">' +
            '⚠️ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง</div>'
        );
    } finally {
        $(inputSel).prop('disabled', false).focus();
        $(btnSel).prop('disabled', false).html('<i class="fas fa-paper-plane"></i>');
        $conv.scrollTop($conv[0].scrollHeight);
        if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 50);
    }
};

$(document).on('keypress', '#chatbot-input', function (e) {
    if (e.which === 13) window.sendChatbotQuery();
});

$(document).ready(function () { window.loadChatbotModelCatalog(); });

// Hook showQuestion: โชว์ FAB + เคลียร์บทสนทนาเมื่อเปลี่ยนข้อ (สถานะเปิด/ปิด panel คงไว้ตาม localStorage)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[Chatbot] window.showQuestion not found at hook time — panel will not auto-show');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        $('#chatbot-fab').css('display', 'flex');
        // โชว์แบนเนอร์เฉพาะเมื่อ "เปลี่ยนข้อจริง" (questionId เปลี่ยน) ไม่ใช่ตอน re-render ข้อเดิม เช่นหลังตอบ (showQuestion ถูกเรียกซ้ำที่ quiz.js:311,529)
        var curQid = (window.APP.current_question && window.APP.current_question.questionId) || '';
        var qChanged = (window._chatLastQid !== undefined && window._chatLastQid !== curQid);
        window._chatLastQid = curQid;
        if (window._chatHistory && window._chatHistory.length > 0) {
            if (qChanged) window.showNewQuestionBanner();
        } else {
            $('#chatbot-conversation').html(window.CHATBOT_PLACEHOLDER_HTML);
            $('#chatbot-newq-banner').hide();
        }
        // ครั้งแรกเท่านั้น: คืนสถานะ panel จากรอบก่อน
        if (!window._chatbotStateRestored) {
            window._chatbotStateRestored = true;
            try {
                if (localStorage.getItem('mdkku_chatbot_open') === '1') window.toggleChatbotPanel(true);
            } catch (e) { }
        }
    };
})();

/* =========================================
   Standalone RAG Chat (Feature 1 v1 — lexical grounding)
   คนละ surface กับ per-question assistant ด้านบน: ค้นจากคลังข้อสอบทั้งวิชาแบบ live
   retrieval แล้วส่ง prompt ที่ ground แล้วผ่าน askAIExpert/IntelSphere เดิม — ไม่มี backend ใหม่
   ========================================= */

// เปิด/ปิด RAG panel
window.toggleRagPanel = function () {
    var $panel = $('#rag-chat-panel');
    $panel.slideToggle(200, function () {
        if ($panel.is(':visible')) $('#rag-input').trigger('focus');
    });
};

// Thai-aware tokenizer — Intl.Segmenter('th') ตัดคำไทยได้จริง (ไทยไม่มีช่องว่างคั่นคำ); fallback = whitespace
window.tokenizeForRetrieval = function (text) {
    text = (text || '').toLowerCase();
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        var seg = new Intl.Segmenter('th', { granularity: 'word' });
        return Array.from(seg.segment(text))
            .filter(function (s) { return s.isWordLike; })
            .map(function (s) { return s.segment; });
    }
    return text.split(/\s+/).filter(Boolean);
};

// Lexical scan ของ RAG เอง — ไม่แตะ performSearch/searchDictionary (แยก concern ตามแผน)
// allQuestions เป็นชุดของวิชาปัจจุบันอยู่แล้ว (app.js:668) — ไม่ต้อง filter วิชา
// §1.8: สแกน "สอง corpus" (ข้อสอบ + KB chunks) ให้คะแนนแล้ว merge เป็น top-k union เดียว
// แต่ละ hit ติด sourceType ('question' | 'kb') เพื่อให้ §1.7 วาด citation แยกชนิดได้
// §1.6 flat scan (แยกออกมาเป็นฟังก์ชันเดียวเพื่อให้ทั้ง fallback (§1.9) และ within-group ใช้ร่วมกัน
// รับ pool/kb ที่ถูก filter มาแล้ว → fallback ส่ง pool เต็มวิชา ทำให้ผลลัพธ์ "เท่าเดิมทุก byte" ไม่ regress)
window._ragFlatScan = function (qTokens, pool, kb, k) {
    var scored = [];

    // (a) คลังข้อสอบที่ตรวจแล้ว
    (pool || []).forEach(function (q) {
        var hay = ((q.problem || '') + ' ' + (q.choices || '') + ' ' +
            (q.explain || '') + ' ' + (q.answer || '')).toLowerCase();
        var score = 0;
        for (var i = 0; i < qTokens.length; i++) if (hay.indexOf(qTokens[i]) >= 0) score++;
        if (score > 0) scored.push({
            score: score,
            hit: {
                sourceType: 'question', questionId: q.questionId, problem: q.problem,
                answer: q.answer, explain: q.explain
            }
        });
    });

    // (b) คลังความรู้ KB (§1.8) — ให้คะแนน heading + chunk_md ด้วย token ชุดเดียวกัน
    (kb || []).forEach(function (c) {
        var hay = ((c.heading || '') + ' ' + (c.chunk_md || '')).toLowerCase();
        var score = 0;
        for (var i = 0; i < qTokens.length; i++) if (hay.indexOf(qTokens[i]) >= 0) score++;
        if (score > 0) scored.push({
            score: score,
            hit: {
                sourceType: 'kb', chunkId: c.chunkId, source: c.source,
                heading: c.heading, chunk_md: c.chunk_md
            }
        });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, k).map(function (s) { return s.hit; });
};

// §1.9 Source map — สร้าง "แผนที่หมวด" จาก corpus ที่โหลดไว้แล้ว (join บน categoryId ที่มีอยู่แล้ว — ไม่สร้าง taxonomy ใหม่)
// แต่ละ group = 1 categoryId ถือ "ข้อสอบของหมวดนั้น" (q.category array มี id นี้) + "KB chunk ของหมวดนั้น" (c.categoryId === id)
// profile = สัญญาณ routing แบบเบา = token ของ "ชื่อหมวด" + "heading ของ KB" เท่านั้น (ไม่ยัด problem/chunk_md
//   → เก็บให้ discriminative + prod ที่ KB ว่าง จะ degrade เป็น fallback (พฤติกรรมเดิม) เป๊ะ ๆ ไม่ regress)
// memoize ต่อวิชา (signature = subject|#questions|#kb) — rebuild เมื่อ corpus เปลี่ยน (โหลดวิชาใหม่ / KB มาถึง)
window.buildGroupIndex = function () {
    var subjectParam = new URLSearchParams(location.search).get('subject') || '';
    var qs = window.APP.allQuestions || [];
    var kb = window.APP.kbChunks || [];
    var sig = subjectParam + '|' + qs.length + '|' + kb.length;
    if (window.APP._groupIndexSig === sig && window.APP._groupIndex) return window.APP._groupIndex;

    var groups = {}; // categoryId -> { categoryId, name, questions:[], kbChunks:[], profile:{token:true} }
    function ensureGroup(catId) {
        if (!groups[catId]) {
            var nm = (typeof window.getCategoryNameById === 'function' ? window.getCategoryNameById(catId) : catId) || catId;
            groups[catId] = { categoryId: catId, name: nm, questions: [], kbChunks: [], profile: {} };
            // ใส่ token ของชื่อหมวดเข้า profile (label เป็นสัญญาณ routing หลัก)
            var nameToks = window.tokenizeForRetrieval(nm);
            for (var n = 0; n < nameToks.length; n++) groups[catId].profile[nameToks[n]] = true;
        }
        return groups[catId];
    }

    // ข้อสอบเข้า group ตามทุก categoryId ใน q.category (ข้อที่อยู่หลายหมวด = อยู่หลาย group)
    qs.forEach(function (q) {
        var cats = Array.isArray(q.category) ? q.category : (q.category != null && q.category !== '' ? [q.category] : []);
        for (var i = 0; i < cats.length; i++) {
            if (cats[i] == null || cats[i] === '') continue;
            ensureGroup(cats[i]).questions.push(q);
        }
    });

    // KB chunk เข้า group ตาม categoryId (§1.9 backend คอลัมน์ I) — heading ป้อน profile ด้วย
    kb.forEach(function (c) {
        if (c.categoryId == null || c.categoryId === '') return; // chunk ไม่มีหมวด → ไม่เข้า group (จะไปโผล่ใน fallback แทน)
        var g = ensureGroup(c.categoryId);
        g.kbChunks.push(c);
        var hToks = window.tokenizeForRetrieval(c.heading || '');
        for (var h = 0; h < hToks.length; h++) g.profile[hToks[h]] = true;
    });

    var arr = Object.keys(groups).map(function (id) { return groups[id]; });

    // §1.9: document-frequency ของ token ข้ามทุก group — token ที่โผล่ในหลายหมวด (stopword เช่น "the"/"of"
    // หรือคำสามัญของวิชา เช่น "heart" ในวิชา CVS) ไม่ discriminative → routeToGroups จะข้ามมัน กัน routing หลอก
    var df = {};
    arr.forEach(function (g) {
        Object.keys(g.profile).forEach(function (tok) { df[tok] = (df[tok] || 0) + 1; });
    });

    window.APP._groupIndex = arr;
    window.APP._groupDF = df;
    window.APP._groupIndexSig = sig;
    return arr;
};

// §1.9 Route — ให้คะแนน query กับ profile ของแต่ละ group แล้วเลือก top-N; คืน null = routing ไม่ชัด (→ fallback)
// ใช้เฉพาะ token ที่ discriminative (df <= 25% ของหมวด) — token สามัญ/stopword ถูกทิ้งก่อน (กัน routing หลอก เช่น "the")
// เกณฑ์ inconclusive: (1) เหลือแต่ token สามัญ  (2) ไม่มีหมวดใดตรง  (3) query ลาม >60% ของหมวดทั้งหมด (generic)
window.routeToGroups = function (qTokens, groups) {
    var N = 3;
    var df = window.APP._groupDF || {};
    var dfCap = Math.max(2, Math.floor(groups.length * 0.25)); // token อยู่ >25% ของหมวด = ไม่ช่วยแยกหมวด → ข้าม
    // กรอง query token เหลือเฉพาะตัว discriminative (dedup ด้วย)
    var useToks = [];
    for (var t = 0; t < qTokens.length; t++) {
        var tk = qTokens[t];
        if ((df[tk] || 0) <= dfCap && useToks.indexOf(tk) < 0) useToks.push(tk);
    }
    if (!useToks.length) return null; // เหลือแต่คำสามัญ → routing ไม่ชัด → fallback whole-subject

    var scored = [];
    for (var i = 0; i < groups.length; i++) {
        var g = groups[i], s = 0;
        for (var u = 0; u < useToks.length; u++) if (g.profile[useToks[u]]) s++;
        if (s > 0) scored.push({ score: s, group: g });
    }
    if (!scored.length) return null; // ไม่มีหมวดใดตรง → fallback whole-subject
    // generic guard: ถ้า query ลาม >60% ของหมวดทั้งหมด (และมีหมวดมากพอ) → ถือ generic → fallback
    if (groups.length >= 3 && scored.length > Math.ceil(groups.length * 0.6)) return null;
    scored.sort(function (a, b) { return b.score - a.score; });
    // tie guard: score สูงสุด = 1 แต่ตรงกับหลายหมวด (> N) = สัญญาณอ่อน/กำกวม (คำเดียวที่กระจายทั่ว) → fallback
    // (คำที่ discriminative จริงจะตรงแค่ไม่กี่หมวด; กัน route หลอกจาก token สามัญที่ df filter ไม่ทัน)
    var topCount = 0;
    for (var j = 0; j < scored.length; j++) if (scored[j].score === scored[0].score) topCount++;
    if (scored[0].score <= 1 && topCount > N) return null;
    return scored.slice(0, N).map(function (x) { return x.group; });
};

// §1.9 two-stage routed retrieval — callers เดิมไม่ต้องแก้ (signature เท่าเดิม)
// 1) route ไป top-N groups  2) สแกน §1.6 เฉพาะ union ของ group ที่เลือก  3) routing ไม่ชัด → fallback flat scan ทั้งวิชา (บังคับ)
// หมวดที่ route ถูกเก็บใน window.APP._lastRoutedGroups ให้ sendRagQuery ไปโชว์ "อ้างอิงจากหมวด: ..."
window.retrieveGroundingContext = function (query, k) {
    k = k || 5;
    var qTokens = window.tokenizeForRetrieval(query);
    window.APP._lastRoutedGroups = []; // reset ทุกครั้ง — default = fallback (ไม่มีป้ายหมวด)
    if (!qTokens.length) return [];

    var groups = window.buildGroupIndex();
    var routed = (groups && groups.length) ? window.routeToGroups(qTokens, groups) : null;

    var qPool, kbPool;
    if (routed && routed.length) {
        // union เฉพาะ member ของ group ที่ route มา (dedup ข้อสอบ/chunk ที่อยู่หลายหมวด)
        var seenQ = {}, seenC = {};
        qPool = []; kbPool = [];
        routed.forEach(function (g) {
            g.questions.forEach(function (q) {
                var qid = String(q.questionId);
                if (!seenQ[qid]) { seenQ[qid] = true; qPool.push(q); }
            });
            g.kbChunks.forEach(function (c) {
                var cid = String(c.chunkId);
                if (!seenC[cid]) { seenC[cid] = true; kbPool.push(c); }
            });
        });
        window.APP._lastRoutedGroups = routed.map(function (g) { return { categoryId: g.categoryId, name: g.name }; });
    } else {
        // FALLBACK (บังคับ, non-negotiable): flat whole-subject union scan เดิม → RAG ไม่ regress เมื่อ routing ไม่ชัด
        qPool = window.APP.allQuestions || [];
        kbPool = window.APP.kbChunks || [];
    }

    return window._ragFlatScan(qTokens, qPool, kbPool, k);
};

window.sendRagQuery = async function () {
    var query = $('#rag-input').val().trim();
    if (!query) return;
    var token = localStorage.getItem('mdkku_session_token') || 'guest_user';

    $('#rag-input').val('').prop('disabled', true);
    $('#btn-rag-send').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

    var $conv = $('#rag-conversation');
    $conv.append('<div style="align-self:flex-end;background:var(--color-primary-pale);' +
        'color:var(--color-primary);padding:8px 12px;border-radius:12px 12px 0 12px;max-width:85%;' +
        'font-weight:600;">' + $('<div>').text(query).html() + '</div>');   // XSS-safe
    $conv.scrollTop($conv[0].scrollHeight);

    var grounding = window.retrieveGroundingContext(query, 5);
    // §1.9: จับหมวดที่ route ทันที (ก่อน await) เหมือนที่จับ grounding — กัน query อื่นมาทับ _lastRoutedGroups
    var routedGroups = (window.APP._lastRoutedGroups || []).slice();
    // §1.8: grounding block แยกชนิดต่อบรรทัด — ข้อสอบ (ตรวจแล้ว) vs [อ้างอิง] (KB, ยังไม่ตรวจ)
    var groundingBlock = grounding.map(function (g, i) {
        if (g.sourceType === 'kb') {
            return (i + 1) + '. [อ้างอิง] ' + (g.source || '') + ' · ' + (g.heading || '') +
                ': "' + (g.chunk_md || '') + '" (chunkId: ' + g.chunkId + ')';
        }
        return (i + 1) + '. โจทย์: "' + (g.problem || '') + '" เฉลย: "' + (g.answer || '') +
            '" คำอธิบาย: "' + (g.explain || '') + '" (questionId: ' + g.questionId + ')';
    }).join('\n') || '(ไม่พบเนื้อหาที่เกี่ยวข้องในคลัง)';

    var prompt =
        'คุณคืออาจารย์แพทย์ ตอบคำถามนิสิตแพทย์โดยอ้างอิงจากเนื้อหาที่ให้ด้านล่างเท่านั้น อิงพยาธิสรีรวิทยาเป็นหลัก\n' +
        'ถ้าเนื้อหาที่ให้ไม่พอจะตอบ ให้บอกตรงๆ ว่า "ข้อมูลในคลังยังไม่พอ" — ห้ามเดา\n\n' +
        '[เนื้อหาอ้างอิง]\n' + groundingBlock + '\n\n' +
        'คำถามจากนิสิต: "' + query + '"\n\n' +
        'ตอบภาษาไทย กระชับ ตรงประเด็น ไม่เกิน 200 คำ';

    try {
        var res = await window.sendWithRetry({
            action: 'askAIExpert', prompt: prompt, provider: 'IntelSphere',
            sessionToken: token, model: 'deepseek-v4-pro'   // single default จนกว่า v6 tiering จะมา (แล้วค่อยเป็น tier:'reason')
        });
        if (res.result === 'success') {
            var safe = window.renderMarkdownSafe(res.answer); // sanitize-by-construction เหมือน per-question chatbot
            // Citations วาดจาก grounding ที่ retrieve จริง — ไม่ parse จากข้อความคำตอบโมเดล (deterministic)
            // §1.8: ข้อสอบ → .rag-cite-chip (#qid, jumpToQuestion); KB → .kb-cite-chip (📖, เปิด excerpt modal)
            var chips = grounding.map(function (g) {
                if (g.sourceType === 'kb') {
                    return '<button type="button" class="kb-cite-chip btn-xs" data-chunkid="' +
                        $('<div>').text(g.chunkId).html() + '" style="font-size:0.75rem;margin:2px;">📖 ' +
                        $('<div>').text((g.source || '') + ' · ' + (g.heading || '')).html() + '</button>';
                }
                return '<button type="button" class="rag-cite-chip btn-xs" data-qid="' + g.questionId +
                    '" style="font-size:0.75rem;margin:2px;">#' + g.questionId + '</button>';
            }).join(' ');
            // badge เตือนเมื่อคำตอบอิงเอกสารอ้างอิง (KB) ซึ่งยังไม่ผ่านการตรวจเหมือนคลังข้อสอบ
            var hasKb = grounding.some(function (g) { return g.sourceType === 'kb'; });
            var kbBadge = hasKb
                ? '<span style="display:inline-block;font-size:0.7rem;background:#fff3cd;color:#856404;' +
                  'padding:1px 6px;border-radius:6px;margin-left:6px;">จากเอกสารอ้างอิง</span>'
                : '';
            var citeRow = grounding.length
                ? '<div style="margin-top:6px;font-size:0.75rem;color:var(--color-text-muted);">อ้างอิง: ' + chips + kbBadge + '</div>'
                : '';
            // §1.9: ป้ายหมวดที่ routed retrieval เลือกมา (โชว์เหนือชิป) — ว่างเมื่อ fallback ทั้งวิชา
            var groupLabel = routedGroups.length
                ? '<div style="margin-top:6px;font-size:0.75rem;color:var(--color-primary);font-weight:600;">อ้างอิงจากหมวด: ' +
                  $('<div>').text(routedGroups.map(function (g) { return g.name; }).join(', ')).html() + '</div>'
                : '';
            $conv.append('<div class="chat-md" style="align-self:flex-start;background:var(--color-surface-3);' +
                'color:var(--color-text);padding:8px 12px;border-radius:12px 12px 12px 0;max-width:85%;' +
                'font-size:0.95rem;">' + safe + groupLabel + citeRow + '</div>');
        } else {
            $conv.append('<div style="align-self:flex-start;background:var(--color-wrong-bg);' +
                'color:var(--color-wrong);padding:8px 12px;border-radius:12px;max-width:85%;">⚠️ ' +
                $('<div>').text(res.message || '').html() + '</div>');
        }
    } catch (e) {
        $conv.append('<div style="align-self:flex-start;background:var(--color-wrong-bg);' +
            'color:var(--color-wrong);padding:8px 12px;border-radius:12px;max-width:85%;">' +
            '⚠️ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่</div>');
    } finally {
        $('#rag-input').prop('disabled', false).focus();
        $('#btn-rag-send').prop('disabled', false).html('<i class="fas fa-paper-plane"></i>');
        $conv.scrollTop($conv[0].scrollHeight);
        if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 50);
    }
};

// Citation chip → กระโดดไปข้อนั้น — jumpToQuestion รับ index จึง map id→index ก่อน
$(document).on('click', '.rag-cite-chip', function () {
    var qid = this.dataset.qid;
    var idx = (window.APP.currentQuestions || []).findIndex(function (q) { return String(q.questionId) === qid; });
    if (idx >= 0 && typeof window.jumpToQuestion === 'function') window.jumpToQuestion(idx);
});

// §1.8: KB citation chip → เปิด excerpt ใน modal (ไม่ jump ข้อสอบ) — หา chunk จาก kbChunks ด้วย chunkId
$(document).on('click', '.kb-cite-chip', function () {
    var chunkId = this.dataset.chunkid;
    var chunk = (window.APP.kbChunks || []).find(function (c) { return String(c.chunkId) === String(chunkId); });
    if (!chunk || typeof Swal === 'undefined') return;
    var bodyHtml = (typeof window.renderMarkdownSafe === 'function')
        ? window.renderMarkdownSafe(chunk.chunk_md || '')
        : $('<div>').text(chunk.chunk_md || '').html();
    Swal.fire({
        titleText: '📖 ' + (chunk.source || '') + ' · ' + (chunk.heading || ''),
        html: '<div class="chat-md" style="text-align:left;font-size:0.95rem;">' + bodyHtml + '</div>' +
            '<div style="margin-top:10px;font-size:0.8rem;color:#856404;background:#fff3cd;' +
            'padding:4px 8px;border-radius:6px;">จากเอกสารอ้างอิง — ยังไม่ผ่านการตรวจสอบเหมือนคลังข้อสอบ</div>',
        width: 640,
        confirmButtonText: 'ปิด'
    });
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 60);
});

/* =========================================
   Feature 4 — Related-Questions chips (token-free v1)
   ดึง relations ต่อวิชา (precomputed บน backend) มาเก็บใน window.APP.relationsMap แล้ว
   วาดชิป .rag-cite-chip (reuse handler ด้านบน) ใต้ข้อสอบ + ป้อน grounding ให้ per-question assistant
   ========================================= */

// โหลด relations map ของวิชา (เรียกครั้งเดียวต่อวิชา) — เก็บผลใน window.APP.relationsMap เสมอ
// (ทั้งกรณีสำเร็จ/พลาด/ยังไม่ generate) เพื่อไม่ให้ยิงซ้ำทุก showQuestion
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
window.normalizeGlossaryKey = function (s) {
    s = (s == null ? "" : String(s)).toLowerCase().trim();
    s = s.replace(/^[^a-z0-9฀-๿]+/, "").replace(/[^a-z0-9฀-๿]+$/, "");
    return s.replace(/\s+/g, " ");
};

// เพิ่ม/อัปเดต term เข้า map (คีย์ทั้ง en และ th ที่ normalize แล้ว) + array; bump version ให้ cluster memo rebuild
window._glossaryInsertTerm = function (term) {
    if (!term) return;
    window.APP.glossaryTerms = window.APP.glossaryTerms || [];
    window.APP.glossaryMap = window.APP.glossaryMap || {};
    var kEn = window.normalizeGlossaryKey(term.term_en);
    var kTh = window.normalizeGlossaryKey(term.term_th);
    var existing = (kEn && window.APP.glossaryMap[kEn]) || (kTh && window.APP.glossaryMap[kTh]) || null;
    if (existing) {
        var idx = window.APP.glossaryTerms.indexOf(existing);
        if (idx >= 0) window.APP.glossaryTerms[idx] = term; else window.APP.glossaryTerms.push(term);
    } else {
        window.APP.glossaryTerms.push(term);
    }
    if (kEn) window.APP.glossaryMap[kEn] = term; // ข้ามคีย์ว่าง (ไม่ให้ map[""])
    if (kTh) window.APP.glossaryMap[kTh] = term;
    window.APP._glossaryTermsVersion = (window.APP._glossaryTermsVersion || 0) + 1;
};

// §2.4: โหลด glossary ของวิชา (ครั้งเดียวต่อวิชา) — mirror loadKB แต่ ***อ่าน res.terms*** (ไม่ใช่ res.chunks)
window.loadGlossary = async function (subject) {
    if (window.APP._glossaryLoading) return;
    window.APP._glossaryLoading = true;
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getGlossary' +
                (subject ? '&subject=' + encodeURIComponent(subject) : '') + '&_=' + Date.now();
        });
        var terms = (res && res.result === 'success' && Array.isArray(res.terms)) ? res.terms : [];
        window.APP.glossaryTerms = [];
        window.APP.glossaryMap = {};
        window.APP._glossaryTermsVersion = 0;
        terms.forEach(function (t) { window._glossaryInsertTerm(t); });
    } catch (e) {
        console.warn('[Glossary] load failed:', e && e.message);
        window.APP.glossaryTerms = window.APP.glossaryTerms || [];
        window.APP.glossaryMap = window.APP.glossaryMap || {};
    } finally {
        window.APP._glossaryLoaded = true;   // กัน refetch วน (Playwright: inject synthetic หลัง _glossaryLoaded===true)
        window.APP._glossaryLoading = false;
    }
    if ($('#glossary-panel').is(':visible')) { window.renderGlossaryList(); }
};

// ค้นหา term จากคำ (normalize ก่อน) — คืน object หรือ null
window.glossaryLookup = function (word) {
    var k = window.normalizeGlossaryKey(word);
    if (!k) return null;
    return (window.APP.glossaryMap && window.APP.glossaryMap[k]) || null;
};

// จัดตำแหน่ง element ลอย (chip/popup) ให้อยู่ใกล้ selection และไม่ล้นจอ (display ถูกตั้งโดย caller ก่อนเรียก)
window._positionGlossaryFloat = function ($el, anchorRect) {
    var el = $el && $el[0];
    if (!el) return;
    var prevVis = el.style.visibility;
    el.style.visibility = 'hidden'; // วัดขนาดโดยไม่กระพริบ
    var w = el.offsetWidth, h = el.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var left, top;
    if (anchorRect) {
        left = anchorRect.left;
        top = anchorRect.bottom + 8;                       // ใต้ selection
        if (top + h > vh - pad) top = anchorRect.top - h - 8; // ไม่พอด้านล่าง → ขึ้นด้านบน
    } else {
        left = (vw - w) / 2; top = (vh - h) / 2;           // ไม่มี anchor → กลางจอ
    }
    if (left + w > vw - pad) left = vw - w - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = prevVis || 'visible';
};

window.hideGlossaryPopup = function () { $('#glossary-popup').hide(); };
window.hideGlossaryChip = function () { $('#glossary-translate-chip').hide(); };

// §2.5: ตัวเรนเดอร์ popup เดียว — ใช้ทั้ง hit / miss / panel / cluster. สร้างจาก OBJECT เท่านั้น
window.renderGlossaryPopup = function (term, anchorRect) {
    if (!term) return;
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var badge = (term.status === 'auto')
        ? '<span style="display:inline-block;font-size:0.68rem;background:#fff3cd;color:#856404;' +
          'padding:1px 6px;border-radius:6px;margin-left:6px;">AI สร้าง</span>'
        : '';
    // qid chips — เฉพาะข้อที่อยู่ในชุดปัจจุบัน (map qid→index); reuse .rag-cite-chip handler (jump) + ปิด popup
    var qids = (term.source_questionIds || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
    var cur = window.APP.currentQuestions || [];
    var chips = qids.filter(function (qid) {
        return cur.some(function (q) { return String(q.questionId) === String(qid); });
    }).map(function (qid) {
        return '<button type="button" class="rag-cite-chip glossary-qid-chip btn-xs" data-qid="' +
            esc(qid) + '" style="font-size:0.72rem;margin:2px;">#' + esc(qid) + '</button>';
    }).join(' ');
    var rootHtml = term.root_breakdown
        ? '<div style="font-size:0.85rem;color:var(--color-text-muted);margin-top:6px;">' +
          '<i class="fas fa-sitemap"></i> ' + esc(term.root_breakdown) + '</div>' : '';
    var defHtml = term.short_def_th
        ? '<div style="font-size:0.92rem;margin-top:6px;">' + esc(term.short_def_th) + '</div>' : '';
    var chipsHtml = chips
        ? '<div style="margin-top:8px;font-size:0.72rem;color:var(--color-text-muted);">ปรากฏในข้อ: ' + chips + '</div>' : '';
    var html =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
          '<div style="font-weight:800;color:var(--color-primary);font-size:1.05rem;">' + esc(term.term_en) + badge + '</div>' +
          '<button type="button" class="glossary-popup-close" title="ปิด" ' +
          'style="border:none;background:none;color:var(--color-text-muted);font-size:1.25rem;line-height:1;cursor:pointer;padding:0 2px;">&times;</button>' +
        '</div>' +
        '<div style="font-size:0.98rem;font-weight:600;margin-top:2px;">' + esc(term.term_th) + '</div>' +
        rootHtml + defHtml + chipsHtml;
    var $p = $('#glossary-popup');
    $p.html(html).css('display', 'block');
    window._positionGlossaryFloat($p, anchorRect);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 30);
};

// §2.5: อ่าน selection ในเขตโจทย์/ตัวเลือก/เฉลย → ***จับ pending ที่ตอน SHOW*** (คลิกชิปทีหลัง selection อาจหายแล้ว)
window._glossaryScopeSel = '#question, #choices, #quiz-explain-container';
window._glossaryHandleSelection = function () {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { window.hideGlossaryChip(); return; }
    var text = sel.toString().trim();
    if (!text) { window.hideGlossaryChip(); return; }
    if (text.split(/\s+/).filter(Boolean).length > 4) { window.hideGlossaryChip(); return; } // ≤ ~4 คำ (ไทยไม่มีช่องว่าง = 1)
    var node = sel.anchorNode;
    var el = node && (node.nodeType === 3 ? node.parentElement : node);
    var container = el && el.closest ? el.closest(window._glossaryScopeSel) : null;
    if (!container) { window.hideGlossaryChip(); return; } // นอกเขต → ไม่ทำอะไร
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { window.hideGlossaryChip(); return; }
    var sentence = (container.innerText || container.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    window.APP._glossaryPending = {
        word: text, sentence: sentence,
        rect: { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right }
    };
    $('#glossary-translate-chip').css('display', 'inline-flex').html('<i class="fas fa-language"></i> แปล');
    window._positionGlossaryFloat($('#glossary-translate-chip'), window.APP._glossaryPending.rect);
};

// §2.5: hit → popup ทันที (0 token); miss → POST askGlossaryTerm → insert map → popup. dedup in-flight ต่อ normalized key
window.resolveGlossaryTerm = async function (pending) {
    if (!pending) return;
    var rect = pending.rect;
    var key = window.normalizeGlossaryKey(pending.word);
    if (!key) { window.hideGlossaryChip(); return; }
    var hit = window.glossaryLookup(pending.word);
    if (hit) { window.hideGlossaryChip(); window.renderGlossaryPopup(hit, rect); return; } // hit path — zero network
    window.APP._glossaryInflight = window.APP._glossaryInflight || {};
    if (window.APP._glossaryInflight[key]) return;                                          // กันยิงซ้ำคำเดียวกันพร้อมกัน
    window.APP._glossaryInflight[key] = true;
    $('#glossary-translate-chip').css('display', 'inline-flex').html('<i class="fas fa-spinner fa-spin"></i> กำลังแปล...');
    var subject = new URLSearchParams(location.search).get('subject') || ''; // *** ไม่มี window.APP.currentSubject ในโค้ดฐานนี้ ***
    var token = (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) || undefined;     // optional — public endpoint
    var qid = (window.APP.current_question && window.APP.current_question.questionId) || '';
    var payload = { action: 'askGlossaryTerm', word: pending.word, sentence: pending.sentence, subject: subject, questionId: qid };
    if (token) payload.sessionToken = token;
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success' && res.term) {
            window._glossaryInsertTerm(res.term);
            // alias คีย์ของคำที่เลือก (อาจไม่ตรง canonical en/th) → tap ซ้ำ = 0 network
            if (!window.APP.glossaryMap[key]) window.APP.glossaryMap[key] = res.term;
            window.hideGlossaryChip();
            window.renderGlossaryPopup(res.term, rect);
            if ($('#glossary-panel').is(':visible')) { window.renderGlossaryList(); window.renderGlossaryClusters(); }
        } else {
            window.hideGlossaryChip();
            if (window.bgToast) window.bgToast.fire({ icon: 'warning', title: (res && res.message) || 'ไม่สามารถแปลคำนี้ได้' });
        }
    } catch (e) {
        window.hideGlossaryChip();
        if (window.bgToast) window.bgToast.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่' });
    } finally {
        delete window.APP._glossaryInflight[key];
    }
};

// §2.4: เปิด/ปิด panel — โหลด glossary ครั้งแรกที่เปิด (เผื่อยังไม่ถูก lazy-load จาก showQuestion)
window.toggleGlossaryPanel = function () {
    var $p = $('#glossary-panel');
    $p.slideToggle(200, function () {
        if ($p.is(':visible')) {
            var subject = new URLSearchParams(location.search).get('subject') || '';
            if (!window.APP._glossaryLoaded && !window.APP._glossaryLoading) window.loadGlossary(subject);
            window.renderGlossaryList();
        }
    });
};

// §2.4: วาดรายการศัพท์แบบ flat + กรองด้วยช่องค้นหา (substring บน normalized en/th)
window.renderGlossaryList = function () {
    var $c = $('#glossary-list-container');
    if (!$c.length) return;
    var terms = window.APP.glossaryTerms || [];
    if (!terms.length) {
        $c.html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">' +
            (window.APP._glossaryLoaded ? 'ยังไม่มีศัพท์ในวิชานี้ — ลองแตะคำในโจทย์เพื่อเพิ่มศัพท์' : 'กำลังโหลด...') + '</div>');
        return;
    }
    var q = window.normalizeGlossaryKey(($('#glossary-search').val() || '').trim());
    var filtered = q ? terms.filter(function (t) {
        return window.normalizeGlossaryKey(t.term_en).indexOf(q) >= 0 ||
               window.normalizeGlossaryKey(t.term_th).indexOf(q) >= 0;
    }) : terms.slice();
    filtered.sort(function (a, b) { return String(a.term_en || '').localeCompare(String(b.term_en || '')); });
    if (!filtered.length) { $c.html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">ไม่พบศัพท์ที่ค้นหา</div>'); return; }
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    $c.html(filtered.map(function (t) {
        var badge = (t.status === 'auto') ? ' <span style="font-size:0.62rem;background:#fff3cd;color:#856404;padding:0 5px;border-radius:5px;">AI</span>' : '';
        var gkey = window.normalizeGlossaryKey(t.term_en) || window.normalizeGlossaryKey(t.term_th);
        return '<div class="glossary-row" data-gkey="' + esc(gkey) + '" ' +
            'style="padding:7px 9px;border-radius:7px;cursor:pointer;border:1px solid var(--color-border-soft);margin-bottom:5px;background:var(--color-surface);">' +
            '<span style="font-weight:700;color:var(--color-primary);">' + esc(t.term_en) + '</span>' + badge +
            ' <span style="color:var(--color-text-muted);">— ' + esc(t.term_th) + '</span></div>';
    }).join(''));
};

// §2.6: ดึงความหมายไทยของ morpheme จาก root_breakdown เช่น "hepato- (ตับ) + -megaly (โต)" → "hepato-" → "ตับ"
window._extractMorphemeGloss = function (morpheme, breakdown) {
    if (!morpheme || !breakdown) return '';
    var esc = morpheme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp(esc + '\\s*\\(([^)]*)\\)').exec(breakdown);
    return (m && m[1]) ? m[1].trim() : '';
};

// §2.6: สร้าง cluster index จาก root_parts (many-to-many) — MEMOIZE บน version ของ glossaryTerms (rebuild เมื่อ mutate เท่านั้น)
window.buildGlossaryClusters = function () {
    var ver = window.APP._glossaryTermsVersion || 0;
    if (window.APP._glossaryClusters && window.APP._glossaryClustersVersion === ver) return window.APP._glossaryClusters;
    window.APP._glossaryClustersBuildCount = (window.APP._glossaryClustersBuildCount || 0) + 1; // พิสูจน์ memoization ใน test
    var terms = window.APP.glossaryTerms || [];
    var buckets = {}; // morphemeKey -> { morpheme, gloss, terms:[] }
    var noRoot = [];
    terms.forEach(function (t) {
        var morphs = (t.root_parts || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!morphs.length) { noRoot.push(t); return; }
        var seen = {}; // dedup morpheme ต่อ term (กัน prefix==suffix → term โผล่ 2 ครั้งใน bucket เดียว)
        morphs.forEach(function (m) {
            var mk = m.toLowerCase();
            if (seen[mk]) return; seen[mk] = true;
            if (!buckets[mk]) buckets[mk] = { morpheme: m, gloss: window._extractMorphemeGloss(m, t.root_breakdown), terms: [] };
            else if (!buckets[mk].gloss) buckets[mk].gloss = window._extractMorphemeGloss(m, t.root_breakdown);
            buckets[mk].terms.push(t);
        });
    });
    var arr = Object.keys(buckets).map(function (k) { return buckets[k]; });
    arr.forEach(function (b) { b.terms.sort(function (a, c) { return String(a.term_en || '').localeCompare(String(c.term_en || '')); }); });
    arr.sort(function (a, b) { return b.terms.length - a.terms.length; }); // cluster ใหญ่ก่อน
    window.APP._glossaryClusters = { clusters: arr, noRoot: noRoot };
    window.APP._glossaryClustersVersion = ver;
    return window.APP._glossaryClusters;
};

// §2.6: วาด grid ดัชนีรากศัพท์ (แต่ละ cell reuse popup renderer เดียวกัน)
window.renderGlossaryClusters = function () {
    var $c = $('#glossary-cluster-container');
    if (!$c.length) return;
    var terms = window.APP.glossaryTerms || [];
    if (!terms.length) {
        $c.html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">' +
            (window.APP._glossaryLoaded ? 'ยังไม่มีศัพท์ในวิชานี้' : 'กำลังโหลด...') + '</div>');
        return;
    }
    var data = window.buildGlossaryClusters();
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var cellsFor = function (list) {
        return list.map(function (t) {
            var badge = (t.status === 'auto') ? ' <span style="font-size:0.6rem;background:#fff3cd;color:#856404;padding:0 4px;border-radius:4px;">AI</span>' : '';
            var gkey = window.normalizeGlossaryKey(t.term_en) || window.normalizeGlossaryKey(t.term_th);
            return '<button type="button" class="glossary-cluster-cell" data-gkey="' + esc(gkey) + '" ' +
                'style="font-size:0.78rem;margin:3px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border-soft);background:var(--color-surface);cursor:pointer;">' +
                esc(t.term_en) + badge + '</button>';
        }).join('');
    };
    var html = data.clusters.map(function (b) {
        var glossTxt = b.gloss ? ' <span style="color:var(--color-text-muted);font-weight:400;">(' + esc(b.gloss) + ')</span>' : '';
        return '<div style="margin-bottom:12px;">' +
            '<div style="font-weight:800;color:var(--color-primary);font-size:0.95rem;margin-bottom:4px;">' +
            esc(b.morpheme) + glossTxt +
            ' <span style="color:var(--color-text-muted);font-weight:400;font-size:0.8rem;">×' + b.terms.length + '</span></div>' +
            '<div>' + cellsFor(b.terms) + '</div></div>';
    }).join('');
    if (data.noRoot.length) {
        html += '<div style="margin-bottom:12px;">' +
            '<div style="font-weight:800;color:var(--color-text-muted);font-size:0.95rem;margin-bottom:4px;">อื่นๆ</div>' +
            '<div>' + cellsFor(data.noRoot) + '</div></div>';
    }
    $c.html(html || '<div style="color:var(--color-text-muted);font-style:italic;">ไม่มีข้อมูลรากศัพท์</div>');
};

/* ---- Delegated handlers (bind ONCE ที่ document — ห้าม bind ใน render ไม่งั้นซ้อนกันยิงหลายครั้ง) ---- */

// selection ในเขต → โชว์ชิป (ยิง LLM เฉพาะตอนคลิกชิป). ข้าม target ที่เป็นชิปเอง (กัน re-trigger ทับ spinner)
$(document).on('mouseup touchend', function (e) {
    if (e.target && e.target.closest && e.target.closest('#glossary-translate-chip')) return;
    setTimeout(window._glossaryHandleSelection, 10); // ให้ selection settle ก่อนอ่าน (โดยเฉพาะ touchend)
});

// mousedown บนชิป: กัน selection หาย + กัน bubble ไปโดน outside-hide ด้านล่าง
$(document).on('mousedown', '#glossary-translate-chip', function (e) { e.preventDefault(); e.stopPropagation(); });

// คลิกชิป "แปล" → resolve จาก pending ที่จับไว้ตอน show (ไม่อ่าน selection ใหม่ตอนนี้ — มันอาจ collapse ไปแล้ว)
$(document).on('click', '#glossary-translate-chip', function (e) {
    e.preventDefault();
    if (window.APP._glossaryPending) window.resolveGlossaryTerm(window.APP._glossaryPending);
});

// คลิกนอก popup/ชิป → ปิดทั้งคู่ (ชิปมี stopPropagation จึงไม่โดนเอง)
$(document).on('mousedown', function (e) {
    if (!$(e.target).closest('#glossary-popup, #glossary-translate-chip').length) {
        window.hideGlossaryPopup();
        window.hideGlossaryChip();
    }
});

$(document).on('click', '.glossary-popup-close', function () { window.hideGlossaryPopup(); });
// qid chip: .rag-cite-chip handler (quiz.js:1325) ทำหน้าที่ jump; ตัวนี้แค่ปิด popup ตามหลัง
$(document).on('click', '.glossary-qid-chip', function () { window.hideGlossaryPopup(); });

// สลับแท็บรายการ/ดัชนีรากศัพท์
$(document).on('click', '.glossary-tab-btn', function () {
    var tab = this.dataset.gtab;
    $('.glossary-tab-btn').removeClass('active');
    $(this).addClass('active');
    if (tab === 'cluster') {
        $('#glossary-tab-list').hide();
        $('#glossary-tab-cluster').show();
        window.renderGlossaryClusters();
    } else {
        $('#glossary-tab-cluster').hide();
        $('#glossary-tab-list').show();
        window.renderGlossaryList();
    }
});

$(document).on('input', '#glossary-search', function () { window.renderGlossaryList(); });

// คลิกแถวรายการ/เซลล์ในดัชนี → เปิด popup เดียวกัน (anchor ที่ element ที่คลิก)
$(document).on('click', '.glossary-row, .glossary-cluster-cell', function () {
    var term = window.APP.glossaryMap && window.APP.glossaryMap[this.dataset.gkey];
    if (!term) return;
    var r = this.getBoundingClientRect();
    window.renderGlossaryPopup(term, { left: r.left, top: r.top, bottom: r.bottom, right: r.right });
});

// เปลี่ยนข้อ → ปิด popup/ชิปที่ค้าง (chips อ้าง currentQuestions ของข้อเดิม)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') return;
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        window.hideGlossaryPopup();
        window.hideGlossaryChip();
    };
})();

$(document).on('keypress', '#rag-input', function (e) { if (e.which === 13) window.sendRagQuery(); });

/* =========================================
   Feature 3 — High-yield cram sheet (§3.1–§3.6) — สรุป + ตัวช่วยจำ (mnemonics) + คีย์เวิร์ด ต่อ "หัวข้อของข้อปัจจุบัน"
   serving: GET getHighYield&category=X (client cache ต่อ categoryId); miss = ปุ่มสร้าง → POST generateHighYield (~30s)
   render: summary_md ผ่าน renderMarkdownSafe + renderAllMath (deterministic), keywords=chips, mnemonics=👍/🚩 (localStorage re-vote guard)
   multi-category (§5): ใช้ category[0] เป็น primary (v1). AI badge เมื่อ status==='auto'. ทุกฟังก์ชันแชร์เป็น window.* (กฎ REAL)
   ========================================= */

// หา "หมวดหลัก" ของข้อปัจจุบัน (primary = category[0]) + subject + ชื่อหมวด — null เมื่อยังไม่มีข้อ/ไม่มีหมวด
window._highYieldCurrentCategory = function () {
    var q = window.APP.current_question;
    if (!q || !q.category) return null;
    var cats = Array.isArray(q.category) ? q.category : [q.category];
    if (!cats.length) return null;
    var catId = cats[0];
    if (!catId) return null;
    var subject = new URLSearchParams(location.search).get('subject') || '';
    var name = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(catId) : catId;
    return { categoryId: String(catId), subject: subject, categoryName: name };
};

// เปิด/ปิด panel — โหลดชีทของหมวดปัจจุบันเมื่อเปิด
window.toggleHighYieldPanel = function () {
    var $p = $('#highyield-panel');
    $p.slideToggle(200, function () {
        if ($p.is(':visible')) {
            var ctx = window._highYieldCurrentCategory();
            if (!ctx) { window._renderHighYieldMessage('กรุณาเปิดข้อสอบก่อน แล้วกดปุ่มนี้อีกครั้งเพื่อดูสรุปของหัวข้อนั้น', ''); return; }
            window.loadHighYield(ctx.categoryId, ctx.subject, ctx.categoryName);
        }
    });
};

// เขียนข้อความสถานะลง panel + ตั้ง subtitle (ใช้ทั้ง empty/loading/error)
window._renderHighYieldMessage = function (msg, subtitle) {
    $('#highyield-subtitle, #sp-hy-subtitle').text(subtitle || 'หัวข้อของข้อที่กำลังดูอยู่');
    $('#highyield-content, #sp-hy-content').html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.92rem;">' +
        $('<div>').text(msg).html() + '</div>');
};

// โหลดชีท high-yield ของหมวด — client cache ต่อ categoryId; hit=render, miss=ปุ่มสร้าง
// *** stale-render guard: _hyActiveCategory *** — พลิกข้อเร็วๆ ตอน panel เปิดจะยิง GET ซ้อนกันหลายหมวด;
// ต้อง render เฉพาะผลของหมวดที่ยัง "active" อยู่ ไม่งั้นผลที่ resolve ช้ากว่าจะทับหมวดปัจจุบัน (race)
window.loadHighYield = async function (categoryId, subject, categoryName) {
    if (!categoryId) { window._renderHighYieldMessage('ไม่พบหัวข้อของข้อนี้', ''); return; }
    window.APP.highYieldCache = window.APP.highYieldCache || {};
    window.APP._hyActiveCategory = categoryId; // หมวดที่ผู้ใช้กำลังดูตอนนี้
    var cached = window.APP.highYieldCache[categoryId];
    if (cached && cached !== 'MISS') { window.renderHighYieldSheet(cached, categoryId, subject, categoryName); return; }
    if (cached === 'MISS') { window.renderHighYieldMiss(categoryId, subject, categoryName); return; }

    $('#highyield-subtitle, #sp-hy-subtitle').text('หัวข้อ: ' + (categoryName || categoryId));
    $('#highyield-content, #sp-hy-content').html('<div style="color:var(--color-text-muted);font-size:0.92rem;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>');
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getHighYield&category=' + encodeURIComponent(categoryId) + '&_=' + Date.now();
        });
        if (res && res.result === 'success' && res.highyield) {
            window.APP.highYieldCache[categoryId] = res.highyield;
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldSheet(res.highyield, categoryId, subject, categoryName);
        } else {
            window.APP.highYieldCache[categoryId] = 'MISS';
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldMiss(categoryId, subject, categoryName);
        }
    } catch (e) {
        if (window.APP._hyActiveCategory === categoryId) window._renderHighYieldMessage('โหลดไม่สำเร็จ กรุณาลองใหม่', 'หัวข้อ: ' + (categoryName || categoryId));
    }
};

// miss → ปุ่ม "สร้างชีทสรุป" (lazy-generate) — data-* ส่งเข้าตัว handler (ไม่ inline onclick กับสตริงไทย)
window.renderHighYieldMiss = function (categoryId, subject, categoryName) {
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    $('#highyield-subtitle, #sp-hy-subtitle').text('หัวข้อ: ' + (categoryName || categoryId));
    $('#highyield-content, #sp-hy-content').html(
        '<div style="color:var(--color-text-muted);font-size:0.92rem;margin-bottom:10px;">ยังไม่มีชีทสรุปของหัวข้อนี้ — สร้างด้วย AI จากคลังข้อสอบได้เลย (ใช้เวลา ~30 วินาที)</div>' +
        '<button type="button" class="btn-xs teal hy-generate-btn" data-cat="' + esc(categoryId) + '" data-subject="' + esc(subject || '') + '" data-catname="' + esc(categoryName || '') + '">' +
        '<i class="fas fa-wand-magic-sparkles"></i> สร้างชีทสรุป High-yield</button>');
};

// lazy-generate → POST generateHighYield (~30s) → cache + render
window.generateHighYieldNow = async function (categoryId, subject, categoryName) {
    if (!categoryId) return;
    window.APP._hyActiveCategory = categoryId; // กันผู้ใช้เปลี่ยนข้อระหว่างรอ ~30s แล้วผลไปทับหมวดอื่น
    $('#highyield-subtitle, #sp-hy-subtitle').text('หัวข้อ: ' + (categoryName || categoryId));
    $('#highyield-content, #sp-hy-content').html('<div style="color:var(--color-text-muted);font-size:0.92rem;"><i class="fas fa-spinner fa-spin"></i> กำลังสร้างชีทสรุปด้วย AI... (~30 วินาที กรุณารอสักครู่)</div>');
    var token = localStorage.getItem('mdkku_session_token') || undefined;
    var payload = { action: 'generateHighYield', category: categoryId, subject: subject || '' };
    if (token) payload.sessionToken = token;
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success' && res.highyield) {
            window.APP.highYieldCache = window.APP.highYieldCache || {};
            window.APP.highYieldCache[categoryId] = res.highyield;
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldSheet(res.highyield, categoryId, subject, categoryName);
        } else {
            if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldMiss(categoryId, subject, categoryName);
            if (window.bgToast) window.bgToast.fire({ icon: 'warning', title: (res && res.message) || 'สร้างชีทสรุปไม่สำเร็จ' });
        }
    } catch (e) {
        if (window.APP._hyActiveCategory === categoryId) window.renderHighYieldMiss(categoryId, subject, categoryName);
        if (window.bgToast) window.bgToast.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่' });
    }
};

// render ชีทเต็ม: subtitle+badge, summary(markdown+math), keywords(chips), mnemonics(👍/🚩 + net votes + guard)
window.renderHighYieldSheet = function (hy, categoryId, subject, categoryName) {
    if (!hy) { window.renderHighYieldMiss(categoryId, subject, categoryName); return; }
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    // inline bold เฉพาะ **...** (mnemonics มักเน้นตัวอักษรตัวย่อ เช่น **I**ntention) — escape ก่อน แล้วค่อยแทน (XSS-safe: HTML ถูก neutralize ไปแล้ว)
    var mdBold = function (s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); };
    var badge = (hy.status === 'auto')
        ? ' <span style="display:inline-block;font-size:0.66rem;background:#fff3cd;color:#856404;padding:1px 6px;border-radius:6px;">AI สร้าง</span>' : '';
    $('#highyield-subtitle, #sp-hy-subtitle').html('หัวข้อ: <b>' + esc(categoryName || categoryId) + '</b>' + badge);

    // summary — sanitize-by-construction ผ่าน renderMarkdownSafe (escaped text + whitelist tags)
    var summaryHtml = (typeof window.renderMarkdownSafe === 'function')
        ? window.renderMarkdownSafe(hy.summary_md) : esc(hy.summary_md);
    var html = '<div class="hy-summary chat-md">' + summaryHtml + '</div>';

    // keywords → chips
    var kws = Array.isArray(hy.keywords) ? hy.keywords : [];
    if (kws.length) {
        html += '<div class="hy-section-title"><i class="fas fa-key"></i> คีย์เวิร์ดที่ต้องรู้</div><div class="hy-keywords">' +
            kws.map(function (k) { return '<span class="hy-chip">' + esc(k) + '</span>'; }).join('') + '</div>';
    }

    // mnemonics → list + vote buttons
    var mns = Array.isArray(hy.mnemonics) ? hy.mnemonics : [];
    var votes = hy.mnemonic_votes || {};
    if (mns.length) {
        html += '<div class="hy-section-title"><i class="fas fa-brain"></i> ตัวช่วยจำ (Mnemonics)</div>';
        html += mns.map(function (m, i) {
            var net = parseInt(votes[i], 10) || 0;
            var voted = localStorage.getItem('mdkku_hymv_' + categoryId + '_' + i);
            var disAttr = voted ? ' disabled' : '';
            return '<div class="hy-mnemonic" data-idx="' + i + '">' +
                '<div class="hy-mnemonic-text">' + mdBold(m) + '</div>' +
                '<div class="hy-mnemonic-votes">' +
                '<button type="button" class="hy-vote-btn hy-vote-up" data-cat="' + esc(categoryId) + '" data-idx="' + i + '" data-delta="1" title="ช่วยจำได้ดี"' + disAttr + '>👍</button>' +
                '<span class="hy-vote-count" data-idx="' + i + '">' + net + '</span>' +
                '<button type="button" class="hy-vote-btn hy-vote-flag" data-cat="' + esc(categoryId) + '" data-idx="' + i + '" data-delta="-1" title="ไม่ช่วย/ไม่ถูกต้อง"' + disAttr + '>🚩</button>' +
                '</div></div>';
        }).join('');
    }

    if (!hy.summary_md && !kws.length && !mns.length) {
        html = '<div style="color:var(--color-text-muted);font-style:italic;">ชีทสรุปนี้ว่างเปล่า</div>';
    }
    $('#highyield-content, #sp-hy-content').html(html);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 30);
};

// โหวต mnemonic — localStorage re-vote guard (client) + optimistic UI + POST voteHighYieldMnemonic
window.voteHighYieldMnemonic = async function (categoryId, idx, delta, btnEl) {
    var guardKey = 'mdkku_hymv_' + categoryId + '_' + idx;
    if (localStorage.getItem(guardKey)) {
        if (window.bgToast) window.bgToast.fire({ icon: 'info', title: 'คุณโหวตตัวช่วยจำนี้ไปแล้ว' });
        return;
    }
    localStorage.setItem(guardKey, String(delta)); // guard ทันที (กันดับเบิลคลิก); rollback เมื่อ error
    var $row = $(btnEl).closest('.hy-mnemonic');
    $row.find('.hy-vote-btn').prop('disabled', true);
    var $count = $row.find('.hy-vote-count');
    var optimistic = (parseInt($count.text(), 10) || 0) + delta;
    $count.text(optimistic);

    var token = localStorage.getItem('mdkku_session_token') || undefined;
    var payload = { action: 'voteHighYieldMnemonic', category: categoryId, mnemonicIdx: idx, delta: delta };
    if (token) payload.sessionToken = token;
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success') {
            if (typeof res.netVotes === 'number') $count.text(res.netVotes);
            // sync client cache ให้ตรง (เผื่อ re-render)
            var c = window.APP.highYieldCache && window.APP.highYieldCache[categoryId];
            if (c && c !== 'MISS') { c.mnemonic_votes = c.mnemonic_votes || {}; c.mnemonic_votes[idx] = (typeof res.netVotes === 'number') ? res.netVotes : optimistic; }
        } else {
            localStorage.removeItem(guardKey); // rollback guard
            $row.find('.hy-vote-btn').prop('disabled', false);
            $count.text((parseInt($count.text(), 10) || 0) - delta);
            if (window.bgToast) window.bgToast.fire({ icon: 'warning', title: (res && res.message) || 'โหวตไม่สำเร็จ' });
        }
    } catch (e) {
        localStorage.removeItem(guardKey);
        $row.find('.hy-vote-btn').prop('disabled', false);
        $count.text((parseInt($count.text(), 10) || 0) - delta);
        if (window.bgToast) window.bgToast.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่' });
    }
};

/* ---- Delegated handlers (bind ONCE ที่ document) ---- */
$(document).on('click', '.hy-generate-btn', function () {
    window.generateHighYieldNow(this.dataset.cat, this.dataset.subject, this.dataset.catname);
});
$(document).on('click', '.hy-vote-btn', function () {
    window.voteHighYieldMnemonic(this.dataset.cat, parseInt(this.dataset.idx, 10), parseInt(this.dataset.delta, 10), this);
});

// เปลี่ยนข้อ → ถ้า panel เปิดอยู่ อัปเดตชีทให้ตรงหมวดของข้อใหม่ (cache ต่อ categoryId ทำให้ไม่ยิงซ้ำ)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') return;
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        if ($('#highyield-panel').is(':visible')) {
            var ctx = window._highYieldCurrentCategory();
            if (ctx) window.loadHighYield(ctx.categoryId, ctx.subject, ctx.categoryName);
            else window._renderHighYieldMessage('ข้อนี้ไม่มีหัวข้อ', '');
        }
    };
})();

/* =========================================
   Feature 6 — Keyword index (§6.1–§6.4) — คำสำคัญที่ออกบ่อยต่อหมวด (backend นับความถี่แบบ token-free)
   serving: GET getKeywordIndex&category=X (client cache ต่อ categoryId) → "list" จัดอันดับ Freq desc
   filters (§6.3): category selector (default = หมวดของข้อปัจจุบัน), min-Freq, "ซ่อนที่ทบทวนแล้ว"
   reviewed = localStorage kw_reviewed_<categoryId> (per-device เท่านั้น §6.4; มีหมายเหตุบน UI)
   expansion (NotebookLM-compliant, deterministic): question chips (.rag-cite-chip → jumpToQuestion),
     KB chips (.kb-cite-chip → excerpt modal), glossary join (glossaryMap[normalizeGlossaryKey(en)] → renderGlossaryPopup)
   generation = admin เท่านั้น (§6.2) → miss = ข้อความแจ้ง (ไม่มีปุ่มสร้างแบบ public ต่างจาก high-yield)
   ทุกฟังก์ชันแชร์เป็น window.* (กฎ REAL). stale-render guard: _kwActiveCategory
   ========================================= */

// หมวดทั้งหมดของข้อปัจจุบัน → ตัวเลือกใน selector (§6.3 default = หมวดของข้อปัจจุบัน). [] เมื่อยังไม่มีข้อ/ไม่มีหมวด
window._kwCurrentCategoryList = function () {
    var q = window.APP.current_question;
    if (!q || !q.category) return [];
    var cats = Array.isArray(q.category) ? q.category : [q.category];
    var out = [];
    cats.forEach(function (c) {
        if (!c) return;
        var name = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(c) : c;
        out.push({ categoryId: String(c), categoryName: name });
    });
    return out;
};

// เปิด/ปิด panel — เติม selector จากหมวดของข้อปัจจุบัน + โหลดหมวดแรกเมื่อเปิด
window.toggleKeywordIndexPanel = function () {
    var $p = $('#keyword-index-panel');
    $p.slideToggle(200, function () {
        if ($p.is(':visible')) {
            var cats = window._kwCurrentCategoryList();
            if (!cats.length) { $('#kw-category-select').empty(); window._kwRenderMessage('กรุณาเปิดข้อสอบก่อน แล้วกดปุ่มนี้อีกครั้งเพื่อดูคำสำคัญของหัวข้อนั้น'); return; }
            window._kwPopulateCategorySelect(cats, cats[0].categoryId);
            window.loadKeywordIndex(cats[0].categoryId);
        }
    });
};

// เติมตัวเลือกหมวดใน <select> (escape ชื่อไทย)
window._kwPopulateCategorySelect = function (cats, selectedId) {
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    $('#kw-category-select').html((cats || []).map(function (c) {
        return '<option value="' + esc(c.categoryId) + '"' + (String(c.categoryId) === String(selectedId) ? ' selected' : '') + '>' +
            esc(c.categoryName || c.categoryId) + '</option>';
    }).join(''));
};

// เขียนข้อความสถานะลง content (empty/loading/error)
window._kwRenderMessage = function (msg) {
    $('#keyword-index-content, #sp-kw-content').html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.92rem;">' +
        $('<div>').text(msg).html() + '</div>');
};

// โหลดดัชนีคำสำคัญของหมวด — client cache ต่อ categoryId; hit=render, miss (list ว่าง)=ข้อความแจ้ง
// *** stale-render guard _kwActiveCategory *** — เปลี่ยนหมวดเร็วๆ ตอน panel เปิด จะยิง GET ซ้อน; render เฉพาะหมวดที่ยัง active
window.loadKeywordIndex = async function (categoryId) {
    if (!categoryId) { window._kwRenderMessage('ไม่พบหัวข้อของข้อนี้'); return; }
    window.APP.keywordIndexCache = window.APP.keywordIndexCache || {};
    window.APP._kwActiveCategory = categoryId;
    window.APP._kwRenderedCategory = categoryId;
    // F5: subtitle ของ section "คำสำคัญหมวดนี้" ใน study panel ตามหมวดที่กำลังโหลด (no-op เมื่อไม่มี element)
    var spKwName = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(categoryId) : categoryId;
    $('#sp-kw-subtitle').text('หมวด: ' + (spKwName || categoryId));
    var cached = window.APP.keywordIndexCache[categoryId];
    if (cached) { window.renderKeywordIndex(); return; }

    $('#keyword-index-content, #sp-kw-content').html('<div style="color:var(--color-text-muted);font-size:0.92rem;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>');
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getKeywordIndex&category=' + encodeURIComponent(categoryId) + '&_=' + Date.now();
        });
        var list = (res && res.result === 'success' && Array.isArray(res.keywords)) ? res.keywords : [];
        window.APP.keywordIndexCache[categoryId] = list;
        if (window.APP._kwActiveCategory === categoryId) window.renderKeywordIndex();
    } catch (e) {
        if (window.APP._kwActiveCategory === categoryId) window._kwRenderMessage('โหลดไม่สำเร็จ กรุณาลองใหม่');
    }
};

// reviewed state (localStorage ต่อหมวด) — เก็บ set ของ normalized key ที่ทบทวนแล้ว (per-device, §6.4)
window._kwReviewedSet = function (categoryId) {
    try { return JSON.parse(localStorage.getItem('kw_reviewed_' + categoryId) || '{}') || {}; }
    catch (e) { return {}; }
};
window._kwToggleReviewed = function (categoryId, key, isReviewed) {
    var set = window._kwReviewedSet(categoryId);
    if (isReviewed) set[key] = 1; else delete set[key];
    try { localStorage.setItem('kw_reviewed_' + categoryId, JSON.stringify(set)); } catch (e) {}
};

// วาดส่วนขยายของ keyword: question chips (ในชุดปัจจุบัน) + KB chips + ปุ่มรากศัพท์ (glossary join)
window._kwRenderExpansion = function (kw, glossChip) {
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var cur = window.APP.currentQuestions || [];
    var qids = String(kw.source_questionIds || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
    var inSet = qids.filter(function (qid) { return cur.some(function (q) { return String(q.questionId) === String(qid); }); });
    var qChips = inSet.map(function (qid) {
        return '<button type="button" class="rag-cite-chip btn-xs" data-qid="' + esc(qid) +
            '" style="font-size:0.72rem;margin:2px;">#' + esc(qid) + '</button>';
    }).join(' ');
    var outCount = qids.length - inSet.length;

    var cids = String(kw.source_kb_chunkIds || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
    var kbMap = {};
    (window.APP.kbChunks || []).forEach(function (c) { kbMap[String(c.chunkId)] = c; });
    var kbChips = cids.filter(function (cid) { return kbMap[cid]; }).map(function (cid) {
        var c = kbMap[cid];
        return '<button type="button" class="kb-cite-chip btn-xs" data-chunkid="' + esc(cid) +
            '" style="font-size:0.72rem;margin:2px;">📖 ' + esc((c.source || '') + ' · ' + (c.heading || '')) + '</button>';
    }).join(' ');

    var parts = [];
    if (qChips) parts.push('<div class="kw-exp-row">ปรากฏในข้อ: ' + qChips +
        (outCount > 0 ? ' <span class="kw-more">(+' + outCount + ' นอกชุดนี้)</span>' : '') + '</div>');
    else if (qids.length) parts.push('<div class="kw-exp-row kw-more">ข้ออ้างอิงไม่อยู่ในชุดปัจจุบัน (' + qids.length + ' ข้อ)</div>');
    if (kbChips) parts.push('<div class="kw-exp-row">เอกสารอ้างอิง: ' + kbChips + '</div>');
    if (glossChip) parts.push('<div class="kw-exp-row">' + glossChip + '</div>');
    if (!parts.length) parts.push('<div class="kw-exp-row kw-more">ไม่มีข้ออ้างอิงในชุดปัจจุบัน</div>');
    return parts.join('');
};

// วาดรายการคำสำคัญของหมวดที่ render อยู่ (อ่านจาก cache) + apply filters (min-Freq / hide-reviewed). ไม่ยิง network
window.renderKeywordIndex = function () {
    var categoryId = window.APP._kwRenderedCategory;
    if (!categoryId) return;
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var list = (window.APP.keywordIndexCache && window.APP.keywordIndexCache[categoryId]) || [];
    if (!list.length) {
        window._kwRenderMessage('ยังไม่มีดัชนีคำสำคัญของหมวดนี้ — ผู้ดูแลระบบต้องสร้างก่อน (สร้างจากคลังข้อสอบแบบไม่ใช้โทเคน)');
        return;
    }
    var minFreq = parseInt($('#kw-min-freq').val(), 10) || 1;
    var hideReviewed = $('#kw-hide-reviewed').is(':checked');
    var reviewed = window._kwReviewedSet(categoryId);

    var rows = list.slice().sort(function (a, b) { return (b.freq || 0) - (a.freq || 0); }); // rank Freq desc (กันกรณี backend ไม่ได้ sort)
    var shown = 0;
    var html = rows.map(function (kw, i) {
        if ((kw.freq || 0) < minFreq) return '';
        var key = window.normalizeGlossaryKey(kw.keyword_en || kw.keyword_th || '');
        var isRev = !!reviewed[key];
        if (hideReviewed && isRev) return '';
        shown++;
        var label = esc(kw.keyword_en || '');
        if (kw.keyword_th) label += ' <span class="kw-th">(' + esc(kw.keyword_th) + ')</span>';
        if (!label.trim()) label = esc(kw.keyword_th || '(ไม่มีชื่อ)');
        var glossHit = !!(window.APP.glossaryMap && key && window.APP.glossaryMap[key]);
        var glossChip = glossHit
            ? '<button type="button" class="btn-xs kw-glossary-chip" data-key="' + esc(key) + '" title="ดูรากศัพท์/นิยาม"><i class="fas fa-sitemap"></i> รากศัพท์</button>'
            : '';
        return '<div class="kw-row' + (isRev ? ' kw-reviewed' : '') + '">' +
            '<div class="kw-row-head">' +
                '<label class="kw-review" title="ทำเครื่องหมายว่าทบทวนแล้ว (บนอุปกรณ์นี้)">' +
                    '<input type="checkbox" class="kw-review-toggle" data-cat="' + esc(categoryId) + '" data-key="' + esc(key) + '"' + (isRev ? ' checked' : '') + '></label>' +
                '<button type="button" class="kw-expand-btn"><i class="fas fa-caret-right"></i></button>' +
                '<span class="kw-label">' + label + '</span>' +
                '<span class="kw-freq" title="จำนวนข้อสอบที่ทดสอบคำนี้">' + (kw.freq || 0) + '</span>' +
            '</div>' +
            '<div class="kw-expand" style="display:none;">' + window._kwRenderExpansion(kw, glossChip) + '</div>' +
        '</div>';
    }).join('');
    if (!shown) html = '<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">ไม่มีคำสำคัญตามเงื่อนไขที่เลือก</div>';
    $('#keyword-index-content, #sp-kw-content').html(html);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 30);
};

/* ---- Delegated handlers (bind ONCE ที่ document) ---- */
$(document).on('change', '#kw-category-select', function () { window.loadKeywordIndex(this.value); });
$(document).on('input', '#kw-min-freq', function () { window.renderKeywordIndex(); });
$(document).on('change', '#kw-hide-reviewed', function () { window.renderKeywordIndex(); });
$(document).on('change', '.kw-review-toggle', function () {
    window._kwToggleReviewed(this.dataset.cat, this.dataset.key, this.checked);
    var $row = $(this).closest('.kw-row');
    $row.toggleClass('kw-reviewed', this.checked);
    if (this.checked && $('#kw-hide-reviewed').is(':checked')) $row.slideUp(150);
});
// หา expansion จากแถวตัวเอง (ไม่ใช้ id — รายการเดียวกัน render อยู่ 2 ที่: standalone panel + study panel §6.3)
$(document).on('click', '.kw-expand-btn', function () {
    $(this).closest('.kw-row').find('.kw-expand').first().slideToggle(120);
    $(this).find('i').toggleClass('fa-caret-right fa-caret-down');
});
// glossary join — เปิด popup เดิม (deterministic: term OBJECT จาก glossaryMap, ไม่ parse ข้อความ)
$(document).on('click', '.kw-glossary-chip', function () {
    var term = window.APP.glossaryMap && window.APP.glossaryMap[this.dataset.key];
    if (!term || typeof window.renderGlossaryPopup !== 'function') return;
    var r = this.getBoundingClientRect();
    window.renderGlossaryPopup(term, { left: r.left, top: r.top, bottom: r.bottom, right: r.right });
});

// เปลี่ยนข้อ → ถ้า panel เปิดอยู่ อัปเดต selector + โหลดคำสำคัญของหมวดข้อใหม่ (cache ต่อ categoryId กันยิงซ้ำ)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') return;
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        if ($('#keyword-index-panel').is(':visible')) {
            var cats = window._kwCurrentCategoryList();
            if (cats.length) {
                window._kwPopulateCategorySelect(cats, cats[0].categoryId);
                window.loadKeywordIndex(cats[0].categoryId);
            } else { $('#kw-category-select').empty(); window._kwRenderMessage('ข้อนี้ไม่มีหัวข้อ'); }
        }
    };
})();

/* =========================================
   Feature 5 — Unified study side panel (§5.1–§5.3) — "ผู้ช่วยติว: เกี่ยวกับข้อนี้"
   UI composition ล้วน (ไม่มี backend/action ใหม่): 4 section แบบ lazy + cache-first reuse ของเดิมทั้งหมด
     (1) สรุป High-yield        → loadHighYield/renderHighYieldSheet + APP.highYieldCache (multi-target #sp-hy-*)
     (2) ข้อสอบที่เกี่ยวข้อง     → renderRelatedChips + APP.relationsMap (chip .rag-cite-chip + handler เดิม verbatim)
     (3) คำสำคัญหมวดนี้ (§6.3)  → loadKeywordIndex/renderKeywordIndex + APP.keywordIndexCache (multi-target #sp-kw-content)
     (4) ถาม AI เกี่ยวกับข้อนี้  → sendChatbotQuery transport เดิมทุกอย่าง (เปลี่ยนเฉพาะ selector หน้าจอ)
   primary category = category[0] — กติกาเดียวกับ F3/F6 (_highYieldCurrentCategory / _kwCurrentCategoryList()[0])
   resize (§5.1): PointerEvents + setPointerCapture (mouse+touch ทางเดียว), rAF-throttle DOM write,
     clamp desktop [280px, min(560px, 60vw)] / mobile bottom-sheet [35vh, 85vh],
     persist localStorage mdkku_studypanel_width|height (เขียนครั้งเดียวตอน pointerup),
     re-clamp ค่าที่จำไว้ทุกครั้งที่เปิด, ต่ำกว่า breakpoint (768) ไม่ใช้ width ที่จำไว้ (เต็มความกว้าง),
     dbl-click handle = ล้างค่า + กลับ default (380px desktop / 60dvh mobile — CSS fallback)
   คนละ surface กับ RAG chat (F1 — ทั้งวิชา, standalone) และเปิดพร้อม chatbot dock ไม่ได้ (กัน drawer ขวาซ้อนกัน)
   ทุกฟังก์ชันแชร์เป็น window.* (กฎ REAL)
   ========================================= */

window._spIsMobile = function () { return window.innerWidth < 768; }; // breakpoint เดียวกับ chatbot dock (≤767 = bottom sheet)

window._spClampW = function (w) {
    var max = Math.min(560, Math.round(window.innerWidth * 0.6));
    return Math.max(280, Math.min(max, Math.round(w)));
};

window._spClampH = function (h) {
    var min = Math.round(window.innerHeight * 0.35), max = Math.round(window.innerHeight * 0.85);
    return Math.max(min, Math.min(max, Math.round(h)));
};

// อ่านค่าที่จำไว้ → re-clamp กับ viewport ปัจจุบัน "ทุกครั้งที่เปิด" (§5.3 กันค่า 560px ค้างบนจอเล็ก);
// ไม่มีค่า/อยู่คนละโหมด → ล้าง var ให้ CSS fallback (380px / 60dvh) ทำงาน
window._spApplyStoredSize = function () {
    var root = document.documentElement.style;
    if (window._spIsMobile()) {
        root.removeProperty('--studypanel-w');
        var h = parseInt(localStorage.getItem('mdkku_studypanel_height'), 10);
        if (h > 0) root.setProperty('--studypanel-h', window._spClampH(h) + 'px');
        else root.removeProperty('--studypanel-h');
    } else {
        root.removeProperty('--studypanel-h');
        var w = parseInt(localStorage.getItem('mdkku_studypanel_width'), 10);
        if (w > 0) root.setProperty('--studypanel-w', window._spClampW(w) + 'px');
        else root.removeProperty('--studypanel-w');
    }
};

// เปิด/ปิด study panel — เปิดแล้วปิด chatbot dock (drawer ขวาใช้ที่เดียวกัน) + refresh section ที่กางอยู่
window.toggleStudyPanel = function (force) {
    var open = (typeof force === 'boolean') ? force : !document.body.classList.contains('studypanel-open');
    if (open) {
        if (document.body.classList.contains('chatbot-open')) window.toggleChatbotPanel(false);
        window._spApplyStoredSize();
    }
    document.body.classList.toggle('studypanel-open', open);
    try { localStorage.setItem('mdkku_studypanel_open', open ? '1' : '0'); } catch (e) { }
    if (open) window._spRefreshSections();
};

// mutual exclusion ฝั่ง chatbot: เปิด dock → ปิด study panel (wrap ไม่แก้ตัวเดิม — dock เดี่ยวๆ ไม่ regress)
(function () {
    var _orig = window.toggleChatbotPanel;
    if (typeof _orig !== 'function') return;
    window.toggleChatbotPanel = function (force) {
        var open = (typeof force === 'boolean') ? force : !document.body.classList.contains('chatbot-open');
        if (open && document.body.classList.contains('studypanel-open')) window.toggleStudyPanel(false);
        return _orig.call(this, force);
    };
})();

// selector ชุดของ section 4 — ส่งเข้า sendChatbotQuery (transport เดิม, จอ study panel)
window._spChatOpts = function () {
    return { inputSel: '#sp-chat-input', convSel: '#sp-chat-conversation', btnSel: '#btn-sp-chat-send' };
};

// เติมข้อมูล section ตอน "กางออก" เท่านั้น (lazy §5.2) — ตัวโหลดเดิมเป็น cache-first จึงไม่ยิงเครือข่ายซ้ำ
window._spFetchSection = function (sec) {
    if (sec === 'hy') {
        var ctx = window._highYieldCurrentCategory();
        if (ctx) window.loadHighYield(ctx.categoryId, ctx.subject, ctx.categoryName);
        else window._renderHighYieldMessage('กรุณาเปิดข้อสอบก่อน จึงจะดูสรุปของหัวข้อได้', '');
    } else if (sec === 'rel') {
        window.renderRelatedChips();
    } else if (sec === 'kw') {
        var cats = window._kwCurrentCategoryList();
        if (cats.length) window.loadKeywordIndex(cats[0].categoryId); // primary = category[0] (กติกาเดียวกับ section 1)
        else $('#sp-kw-content').html('<div class="sp-muted" style="font-style:italic;">กรุณาเปิดข้อสอบก่อน จึงจะดูคำสำคัญได้</div>');
    } else if (sec === 'ai') {
        setTimeout(function () { $('#sp-chat-input').trigger('focus'); }, 200);
    }
};

// refresh ทุก section ที่กางอยู่ (เรียกตอนเปิด panel + ตอนเปลี่ยนข้อ) — cache-first ทั้งหมด
window._spRefreshSections = function () {
    $('#study-panel .sp-section').each(function () {
        if ($(this).find('.sp-section-body').first().is(':visible')) {
            window._spFetchSection(this.getAttribute('data-spsec'));
        }
    });
};

// กาง/หุบ section (accordion) — กางแล้วค่อย fetch (lazy)
$(document).on('click', '.sp-section-head', function () {
    var $sec = $(this).closest('.sp-section');
    var $body = $sec.find('.sp-section-body').first();
    var willShow = !$body.is(':visible');
    $body.slideToggle(150);
    $sec.toggleClass('sp-open', willShow);
    if (willShow) window._spFetchSection($sec.attr('data-spsec'));
});

/* ---- Resize drag (§5.1/§5.2): pointerdown จับ pointer + จำจุดเริ่ม; pointermove เขียน DOM ผ่าน rAF;
   pointerup ปล่อย capture + persist "ครั้งเดียว"; dbl-click ล้างค่า + snap กลับ default ---- */
window._spDrag = null;

window._spOnPointerDown = function (e) {
    if (typeof e.button === 'number' && e.button !== 0) return; // ลากด้วยปุ่มหลัก/นิ้วเท่านั้น
    var panel = document.getElementById('study-panel');
    if (!panel) return;
    var rect = panel.getBoundingClientRect();
    window._spDrag = {
        id: e.pointerId,
        mobile: window._spIsMobile(),
        startX: e.clientX, startY: e.clientY,
        startW: rect.width, startH: rect.height,
        pending: null, raf: 0
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
    document.body.classList.add('studypanel-resizing');
    e.preventDefault();
};

window._spOnPointerMove = function (e) {
    var d = window._spDrag;
    if (!d || e.pointerId !== d.id) return;
    // panel อยู่ขอบขวา/ล่าง: ลากไปทางซ้าย (desktop) = กว้างขึ้น, ลากขึ้น (mobile) = สูงขึ้น
    d.pending = d.mobile
        ? window._spClampH(d.startH + (d.startY - e.clientY))
        : window._spClampW(d.startW + (d.startX - e.clientX));
    if (!d.raf) {
        d.raf = requestAnimationFrame(function () {
            var dd = window._spDrag;
            if (!dd) return;
            dd.raf = 0;
            if (dd.pending == null) return;
            document.documentElement.style.setProperty(dd.mobile ? '--studypanel-h' : '--studypanel-w', dd.pending + 'px');
        });
    }
};

window._spOnPointerUp = function (e) {
    var d = window._spDrag;
    if (!d || e.pointerId !== d.id) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { }
    if (d.raf) cancelAnimationFrame(d.raf);
    if (d.pending != null) {
        document.documentElement.style.setProperty(d.mobile ? '--studypanel-h' : '--studypanel-w', d.pending + 'px');
        // persist ครั้งเดียวตอนปล่อย (§5.2) — ไม่เขียน localStorage ระหว่างลาก
        try { localStorage.setItem(d.mobile ? 'mdkku_studypanel_height' : 'mdkku_studypanel_width', String(d.pending)); } catch (err) { }
    }
    document.body.classList.remove('studypanel-resizing');
    window._spDrag = null;
};

// dbl-click = ล้างค่าที่จำ + กลับ default (§5.2) — removeProperty ปล่อยให้ CSS fallback (380px / 60dvh) ทำงาน
window._spOnHandleDblClick = function () {
    var mobile = window._spIsMobile();
    try { localStorage.removeItem(mobile ? 'mdkku_studypanel_height' : 'mdkku_studypanel_width'); } catch (e) { }
    document.documentElement.style.removeProperty(mobile ? '--studypanel-h' : '--studypanel-w');
};

$(function () {
    var h = document.getElementById('study-resize-handle');
    if (!h) return;
    // bind ตรงบน handle (ไม่ delegate) — setPointerCapture retarget ทุก move มาที่ handle เอง
    h.addEventListener('pointerdown', window._spOnPointerDown);
    h.addEventListener('pointermove', window._spOnPointerMove);
    h.addEventListener('pointerup', window._spOnPointerUp);
    h.addEventListener('pointercancel', window._spOnPointerUp);
    h.addEventListener('dblclick', window._spOnHandleDblClick);
});

// viewport เปลี่ยนระหว่างเปิด (หมุนจอ/ย่อหน้าต่าง) → re-clamp ค่าที่จำไว้ใหม่ (§5.3)
window.addEventListener('resize', function () {
    if (!document.body.classList.contains('studypanel-open') || window._spDrag) return;
    clearTimeout(window._spResizeT);
    window._spResizeT = setTimeout(window._spApplyStoredSize, 150);
});

// Enter ในช่องถาม AI ของ study panel (มิเรอร์ handler ของ chatbot dock)
$(document).on('keypress', '#sp-chat-input', function (e) {
    if (e.which === 13) window.sendChatbotQuery(window._spChatOpts());
});

// Hook showQuestion: โชว์ FAB + ถ้า panel เปิดอยู่ refresh section ที่กางอยู่ให้ตรงข้อ/หมวดใหม่ (cache-first)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[StudyPanel] window.showQuestion not found at hook time — study panel will not auto-refresh');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        $('#study-fab').css('display', 'flex');
        if (document.body.classList.contains('studypanel-open')) window._spRefreshSections();
        // ครั้งแรกเท่านั้น: คืนสถานะเปิด/ปิดจากรอบก่อน (รูปแบบเดียวกับ chatbot dock; ถ้าทั้งคู่จำว่าเปิด อันนี้ชนะ)
        if (!window._spStateRestored) {
            window._spStateRestored = true;
            try {
                if (localStorage.getItem('mdkku_studypanel_open') === '1') window.toggleStudyPanel(true);
            } catch (e) { }
        }
    };
})();