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
    $('#index-score-badge-header').text(`${totalCorrect} / ${window.APP.currentQuestions.length}`);
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

    $('#feedback').empty().removeClass();
    $('#choices').empty();

    $('#vote-notification-bar').empty();
    if (window.APP.pendingVotesCache[window.APP.current_question.questionId]) {
        window.renderVoteNotificationUI(window.APP.current_question.questionId, window.APP.pendingVotesCache[window.APP.current_question.questionId]);
    }
    window.fetchPendingVotes(window.APP.current_question.questionId);

    let categoryName = "";
    window.APP.current_question.category.forEach(catId => {
        const catObj = window.APP.globalStructure.category.find(c => c.categoryId === catId);
        if (catObj) {
            categoryName += (categoryName ? "<br>" : "") + (window.APP.current_question.category.indexOf(catId) + 1) + ". " + catObj.categoryName;
        }
    });
    $('#categoryquestion').html(categoryName ? `หัวข้อ: <b>${categoryName}</b>` : "หัวข้อ: <b>ไม่ระบุหัวข้อ</b>");
    $('#question').html(window.APP.current_question.problem ? window.APP.current_question.problem.replace(/\n/g, '<br>') : "");

    window.APP.currentImageArray = window.APP.current_question.img ?
        (window.APP.current_question.img.includes('///') ? window.APP.current_question.img.split('///') : [window.APP.current_question.img])
        : [];
    window.APP.currentImageIndex = 0;
    window.updateImageGallery();

    const choicesRaw = window.APP.current_question.choices || "";
    const choicesArray = choicesRaw.split("///").map(s => s.trim()).filter(Boolean);

    let indices = choicesArray.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    indices.forEach(i => {
        const choiceText = choicesArray[i];
        let content = choiceText;
        if (window.isUrl(choiceText)) {
            content = `<img src="${window.transformUrl(choiceText)}" alt="Choice">`;
        } else if (choiceText.startsWith('<svg')) {
            content = `<div class="svg-choice-container">${choiceText}</div>`;
        }
        const $btn = $('<button></button>');
        $btn.attr('data-answer', choiceText);
        $btn.html(content);

        $('#choices').append($btn);
    });

    if (window.APP.current_question.state) {
        window.checkAnswerUI(window.APP.current_question.select, false);
    } else if (window.APP.isShowingAllAnswers) {
        $('#choices').find(`button[data-answer="${window.APP.current_question.answer}"]`).addClass('correct');
        $('#feedback').addClass('correct').html(`เฉลย: ${window.displayAnswerContent(window.APP.current_question.answer)}`);
    }

    $('#questionIndex').text(`${window.APP.questionIndex + 1}/${window.APP.currentQuestions.length}`);

    if (window.APP.pendingVotesCache[window.APP.current_question.questionId]) {
        window.renderVoteNotificationUI(window.APP.current_question.questionId, window.APP.pendingVotesCache[window.APP.current_question.questionId]);
    }
    window.fetchPendingVotes(window.APP.current_question.questionId);

    if (shouldFocus) {
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
        $('#feedback').addClass("correct").html(`ถูกต้อง!: ${window.displayAnswerContent(window.APP.current_question.answer)}`);
        $('#quiz-container h1 span[style*="color"]').css("color", "#198754")
            .html(`(ข้อนี้ทำไป: ${window.APP.current_question.attemptCount} | ผิด: ${window.APP.current_question.failCount} | สถานะ: ทำถูกแล้ว ✅)`);
    } else {
        window.APP.current_question.failCount = (window.APP.current_question.failCount || 0) + 1;
        $('#feedback').addClass("incorrect").html(`ผิด! คำตอบที่ถูกคือ: ${window.displayAnswerContent(window.APP.current_question.answer)}`);
        $('#quiz-container h1 span[style*="color"]').html(`(ข้อนี้ทำไป: ${window.APP.current_question.attemptCount} | ผิด: ${window.APP.current_question.failCount})`);

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
            $('#feedback').append(`<div style="font-size: 0.8em; color: #721c24;">* ข้อนี้ถูกเพิ่มกลับเข้าไปในชุดคำถามเพื่อให้คุณแก้ตัวอีกครั้ง</div>`);
        }
    }

    $('#score').text(`${window.APP.score}/${window.APP.currentQuestions.length}`);
    $('#questionIndex').text(`${window.APP.questionIndex + 1}/${window.APP.currentQuestions.length}`);
    window.highlightAnswers();
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
        const val = $(this).data('answer');
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

// 8. การกรองและเปลี่ยนชุดข้อสอบ
window.updateQuestionSet = function (shouldSort = true) {
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

    const selectedCategoryIds = $('input[type="checkbox"][name="category"]:checked').map(function () {
        return this.value;
    }).get();

    window.APP.currentQuestions = [];

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
        window.showQuestion(false);
    } else {
        $('#question').html("ไม่พบข้อสอบในหมวดหมู่ที่เลือก");
        $('#choices').empty();
        $('#questionIndex').text("0/0");
    }

    if (window.APP.currentQuestions.length > 0) {
        window.preloadQuizImages(window.APP.currentQuestions);
    }

    window.updateSelectedCategoryStatus();
    window.saveProgressToCache();
};