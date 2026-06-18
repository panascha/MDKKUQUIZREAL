// REFACTOR/js/report.js

window.openReportModal = function (q) {
    if (!q || !q.problem) {
        Swal.fire("ไม่พบข้อมูลคำถาม");
        return;
    }

    window.APP.modalTargetQuestion = JSON.parse(JSON.stringify(q));
    window.sendActivityLog('REPORT_OPEN', window.APP.modalTargetQuestion.questionId);

    $('#report_text').val('');
    $('#report-new-choice-input').val('');
    $('#report-suggest-explain-input').val('');
    $('#report-correct-choice-select').empty();
    $('#report-question-images').empty();

    $('#report-question-text').html(window.APP.modalTargetQuestion.problem.replace(/\n/g, '<br>'));

    if (window.APP.modalTargetQuestion.img) {
        const imgUrls = window.APP.modalTargetQuestion.img.split('///').map(s => s.trim()).filter(Boolean);
        let imgHtml = '';
        imgUrls.forEach(url => {
            imgHtml += `<img src="${window.transformUrl(url)}" class="report-img-preview" alt="Question Image">`;
        });
        $('#report-question-images').html(imgHtml);
    }

    const choicesArray = (window.APP.modalTargetQuestion.choices || "").split("///").map(s => s.trim()).filter(Boolean);
    let choicesHtml = choicesArray.map((choice, index) => {
        let content = window.isUrl(choice) ? `<br><img src="${window.transformUrl(choice)}" class="report-choice-img">` :
            (choice.startsWith('<svg') ? `<div class="report-choice-svg-container">${choice}</div>` : choice);
        return `<p style="margin: 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;"><b>${String.fromCharCode(65 + index)}.</b> ${content}</p>`;
    }).join('');
    $('#report-choices-list').html(choicesHtml || 'ไม่มีตัวเลือก');

    let selectOptions = '<option value="newanswer">-- คำตอบใหม่ (ถ้าไม่มีในตัวเลือกเดิม) --</option>';
    choicesArray.forEach((choice, index) => {
        const isCurrentAnswer = choice === window.APP.modalTargetQuestion.answer;
        let display = window.isUrl(choice) ? `[รูปภาพ] ...${choice.slice(-10)}` : (choice.startsWith('<svg') ? `[SVG]` : choice);
        selectOptions += `<option value="${choice.replace(/"/g, '&quot;')}" ${isCurrentAnswer ? 'selected' : ''}>
            ${String.fromCharCode(65 + index)}. ${display}${isCurrentAnswer ? ' (เฉลยปัจจุบัน)' : ''}
        </option>`;
    });
    $('#report-correct-choice-select').append(selectOptions);

    $('#report-card').fadeIn();
};

$(function () {
    $('#report').on('click', () => {
        window.openReportModal(window.APP.currentQuestions[window.APP.questionIndex]);
    });

    $('#cancel-report').on('click', () => {
        $('#report-card').fadeOut();
    });

    $('#submit-report').off('click').on('click', () => {
        const q = window.APP.modalTargetQuestion;

        if (!q) {
            Swal.fire("Error", "ไม่พบข้อมูลคำถามที่กำลังแจ้งปัญหา", "error");
            return;
        }

        let rawCat = q.category;
        let catsArray = Array.isArray(rawCat) ? rawCat : (rawCat ? [rawCat] : []);
        let categoryString = catsArray.join(", ");

        let subjectFrom = "Unknown Subject";
        if (window.APP.globalStructure.category && catsArray.length > 0) {
            const matchedCategoryInfo = window.APP.globalStructure.category.find(t => t.categoryId === catsArray[0]);
            if (matchedCategoryInfo && matchedCategoryInfo.subjectRef) {
                subjectFrom = matchedCategoryInfo.subjectRef;
            }
        }

        if ($('#report-correct-choice-select').val() === 'newanswer' && !$('#report-new-choice-input').val().trim()) {
            Swal.fire("กรุณาพิมพ์คำตอบที่ถูกต้องใหม่ในช่องด้านล่าง");
            $('#report-new-choice-input').focus();
            return;
        }
        const reportTextValue = $('#report_text').val().trim();
        if (reportTextValue === '') {
            Swal.fire("กรุณาใส่เหตุผลของปัญหา");
            $('#report_text').focus();
            return;
        }

        let suggestedChoice = $('#report-correct-choice-select').val() === 'newanswer' ?
            $('#report-new-choice-input').val().trim() :
            $('#report-correct-choice-select').val();

        if (suggestedChoice && (suggestedChoice.includes('drive.google'))) {
            suggestedChoice = window.transformUrl(suggestedChoice);
        }

        let questionImagesString = "";
        if (q.img) {
            const rawImgs = q.img.split("///");
            questionImagesString = rawImgs.map(url => window.transformUrl(url.trim())).join("///");
        }

        const allChoices = (q.choices || "").split("///").map((s, i) => {
            const letter = String.fromCharCode(65 + i);
            let choiceText = s.trim();
            const isCurrentAnswer = choiceText === (q.answer || "").trim();
            return `${letter}. ${isCurrentAnswer ? '(answer)' : ''} ${choiceText}`;
        }).join("\n");

        const suggestedExplainValue = $('#report-suggest-explain-input').val().trim();

        window.saveReportToGoogleSheet(
            subjectFrom,
            categoryString,
            q.questionId,
            q.problem,
            questionImagesString,
            allChoices,
            suggestedChoice,
            reportTextValue,
            new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
            suggestedExplainValue
        );

        $('#report-card').fadeOut();
        Swal.fire({
            icon: 'success',
            title: 'ส่งรายงานสำเร็จ',
            text: 'ขอบคุณสำหรับข้อมูลครับ',
            timer: 2000,
            showConfirmButton: false
        });
    });
});