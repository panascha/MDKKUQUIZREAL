// REFACTOR/js/grader.js

$(function () {
    // สืบทอด OMR Config มาใช้งานอย่างปลอดภัย
    const OMR_CONFIG = window.OMR_CONFIG;

    $('#grader-dropzone').off('click').on('click', function (e) {
        e.preventDefault();
        $('#grader-file-input').trigger('click');
    });

    $('#btn-open-grader').off('click').on('click', () => {
        $('#grader-results').hide();
        $('#grader-status').hide();
        $('#auto-grader-modal').fadeIn();
    });

    $('#close-grader-modal').off('click').on('click', () => {
        $('#auto-grader-modal').fadeOut();
    });

    $('#grader-file-input').off('change').on('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        $('#grader-results').hide();
        $('#grader-status').show();
        $('#grader-status-text').text("กำลังดึงข้อมูลเฉลยจาก PDF...");

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let omrPages = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const textStr = textContent.items.map(item => item.str).join('');

                const match = textStr.match(/\[MDKKU_OMR_DATA\](.*?)\[\/MDKKU_OMR_DATA\]/);
                if (match) {
                    try {
                        omrPages.push({
                            pageNum: i,
                            data: JSON.parse(match[1])
                        });
                    } catch (jsonErr) {
                        console.error("JSON Parse Error:", jsonErr);
                    }
                }
            }

            if (omrPages.length === 0) {
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่พบข้อมูลเฉลย',
                    text: 'ไฟล์นี้อาจถูก Flatten มา หรือไม่ได้สร้างจากระบบ OMR ของเรา กรุณาตรวจสอบการตั้งค่าตอน Export PDF',
                });
                throw new Error("ไม่พบกระดาษคำตอบ OMR ในไฟล์นี้ (โปรดใช้ไฟล์ PDF ชุดข้อสอบที่ Export จากเว็บโดยตรง)");
            }

            let totalScore = 0;
            let totalItems = 0;
            let gradingResults = [];

            $('#grader-status-text').text("กำลังสแกนการฝนดินสอ...");

            const RENDER_SCALE = 2.0;
            const mmToPx = (72 / 25.4) * RENDER_SCALE;
            const radiusPx = OMR_CONFIG.bubbleRadius * mmToPx;

            for (const omrPage of omrPages) {
                const page = await pdf.getPage(omrPage.pageNum);
                const viewport = page.getViewport({ scale: RENDER_SCALE });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                omrPage.data.forEach(qData => {
                    totalItems++;
                    let selectedChoice = null;
                    let maxDarkness = 0;

                    for (let b = 0; b < qData.numChoices; b++) {
                        const cx = (qData.startX + (b * OMR_CONFIG.bubbleSpacingX)) * mmToPx;
                        const cy = qData.y * mmToPx;

                        const imgData = ctx.getImageData(cx - radiusPx, cy - radiusPx, radiusPx * 2, radiusPx * 2);
                        let darkPixelsCount = 0;

                        for (let p = 0; p < imgData.data.length; p += 4) {
                            const r = imgData.data[p];
                            const g = imgData.data[p + 1];
                            const b_col = imgData.data[p + 2];
                            const alpha = imgData.data[p + 3];

                            if (alpha < 50) continue;

                            const brightness = (0.299 * r + 0.587 * g + 0.114 * b_col);
                            if (brightness < 200) darkPixelsCount++;
                        }

                        const fillRatio = darkPixelsCount / (Math.PI * radiusPx * radiusPx);

                        if (fillRatio > 0.15 && fillRatio > maxDarkness) {
                            maxDarkness = fillRatio;
                            selectedChoice = String.fromCharCode(65 + b);
                        }
                    }

                    const isCorrect = selectedChoice === qData.correctLetter;
                    if (isCorrect) totalScore++;

                    gradingResults.push({
                        qNum: qData.qNum,
                        selected: selectedChoice || 'ไม่ตอบ',
                        correct: qData.correctLetter,
                        isCorrect: isCorrect
                    });
                });
            }

            $('#grader-score-text').text(`${totalScore} / ${totalItems}`);

            let tableHtml = '';
            gradingResults.forEach(res => {
                const rowColor = res.isCorrect ? '' : 'background-color: #f8d7da; color: #842029;';
                const icon = res.isCorrect ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>';
                tableHtml += `<tr style="${rowColor}">
                        <td style="text-align: center; border-bottom: 1px solid #ddd; padding: 8px;"><b>ข้อ ${res.qNum}</b></td>
                        <td style="text-align: center; border-bottom: 1px solid #ddd; padding: 8px;">${res.selected} ${icon}</td>
                        <td style="text-align: center; border-bottom: 1px solid #ddd; padding: 8px;"><b>${res.correct}</b></td>
                    </tr>`;
            });

            $('#grader-table-body').html(tableHtml);
            $('#grader-status').hide();
            $('#grader-results').fadeIn();

            Swal.fire({
                icon: 'success',
                title: 'ตรวจข้อสอบเสร็จสิ้น',
                text: `คุณได้คะแนน ${totalScore} จาก ${totalItems} คะแนน`,
                timer: 2000,
                showConfirmButton: false
            });

        } catch (error) {
            console.error(error);
            $('#grader-status').hide();
            Swal.fire("ข้อผิดพลาด", error.message, "error");
        } finally {
            e.target.value = '';
        }
    });
});