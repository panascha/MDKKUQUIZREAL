// REFACTOR/js/vote.js

// ปรับปรุงจาก Single Boolean Lock เป็นแบบระบุเจาะจงราย Question ID (Set) เพื่อให้ระบบดาวน์โหลดขนานกันเบื้องหลังได้โดยไม่บล็อกกันเอง
window.activeVoteFetches = window.activeVoteFetches || new Set();

// T1.1: flag ว่า Bulk Votes/Reports โหลดครบแล้ว — เมื่อ true ไม่ต้อง per-qid fetch อีก
window._bulkPendingLoaded = false;
// flag ว่า Bulk กำลังโหลดอยู่ — กัน showQuestion ยิง per-qid ซ้อนระหว่างที่ bulk ยังไม่เสร็จ (แข่งกันแย่ง GAS execution)
window._bulkPendingInFlight = false;

window.fetchPendingVotes = function (questionId) {
    if (window.activeVoteFetches.has(questionId)) return;
    window.activeVoteFetches.add(questionId);

    window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getPendingVotes&qid=${questionId}&_=${Date.now()}`)
        .then(data => {
            window.APP.pendingVotesCache[questionId] = data;
            window.renderVoteNotificationUI(questionId, data, false);
            if ($('#vote-category-modal').is(':visible')) {
                window.renderModalPendingVotes(data);
            }
        })
        .catch(err => {
            console.warn("Fetch Pending Votes Failed:", err);
        })
        .finally(() => {
            window.activeVoteFetches.delete(questionId);
        });
};

window.renderModalPendingVotes = function (data) {
    const $container = $('#suggested-category-container');
    const votes = data.votes || [];
    const thresholds = data.thresholds || { approve: 20, confirm: 50 };

    $container.empty();

    if (votes.length === 0) {
        $container.html('<span class="empty-state-text">- ยังไม่มีข้อเสนอใหม่ -</span>');
        return;
    }

    votes.forEach(item => {
        const categoryName = window.getCategoryNameById(item.categoryId);
        const currentCount = parseInt(item.count) || 0;

        let nextTarget = thresholds.confirm;
        let statusLabel = 'เพื่ออนุมัติ';

        const votesRemaining = nextTarget - currentCount;
        const statusText = votesRemaining > 0
            ? `${votesRemaining} โหวต ${statusLabel}`
            : `${currentCount} โหวตแล้ว!`;

        const $badge = $(`
            <div class="category-badge suggested" title="คลิกเพื่อโหวตเห็นด้วย">
                ${categoryName} 
                <span class="vote-count-badge">${currentCount} <i class="fas fa-user"></i></span>
                <span class="votes-remaining-text" style="font-size: 0.85rem; margin-left: 5px; color: #ffeb3b; font-weight: 700;">(${statusText})</span>
            </div>
        `);

        $badge.off('click').on('click', function () {
            const targetQ = window.APP.modalTargetQuestion;

            if (!targetQ) {
                Swal.fire("Error", "ไม่พบข้อมูลคำถามที่กำลังโหวต", "error");
                return;
            }

            Swal.fire({
                title: 'คุณเห็นด้วยกับหัวข้อนี้หรือไม่?',
                html: `หัวข้อ: <b>"${categoryName}"</b>`,
                icon: 'question',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: 'เห็นด้วย (+1)',
                denyButtonText: 'ไม่เห็นด้วย (-1)',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#28a745',
                denyButtonColor: '#dc3545',
            }).then((result) => {
                if (result.isConfirmed) {
                    window.submitVoteData([item.categoryId], targetQ, true, 1);
                } else if (result.isDenied) {
                    window.submitVoteData([item.categoryId], targetQ, true, -1);
                }
            });
        });

        $container.append($badge);
    });
};

window.submitVoteData = async function (categoryArray, q, shouldRefreshUI = false, delta = 1) {
    if (!q || !q.questionId) return;

    $('#vote-category-modal').fadeOut(200);

    Swal.fire({
        title: 'กำลังส่งข้อมูล...',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1000,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    const payload = {
        action: 'submitVote',
        questionId: q.questionId,
        questionText: q.problem,
        suggestedCategory: categoryArray,
        delta: delta
    };

    try {
        await window.sendWithRetry(payload);

        categoryArray.forEach(newCatId => {
            if (!q.category.includes(newCatId)) {
                q.category.push(newCatId);
            }
        });

        await window.syncQuestionsToCache();

        if (window.APP.current_question && q.questionId === window.APP.current_question.questionId) {
            window.showQuestion(false);
        }

        if ($('#quick-cat-container').is(':visible')) {
            window.renderQuickCatPanel();
        }

        Swal.fire({
            icon: 'success',
            title: 'บันทึกการแยกเลคเชอร์สำเร็จ!',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000
        });

        if (!window.APP.votedQuestionIds.has(q.questionId)) {
            window.APP.sessionAutoVoteCount++;
            window.APP.votedQuestionIds.add(q.questionId);
        }

        if (shouldRefreshUI && q.questionId === window.APP.current_question.questionId) {
            delete window.APP.pendingVotesCache[q.questionId];
            window.fetchPendingVotes(q.questionId);
        }
    } catch (err) {
        Swal.fire("Error", "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง", "error");
    }
};

window.submitSingleVote = function (categoryId, q, shouldRefreshUI = false, delta = 1) {
    window.submitVoteData([categoryId], q, shouldRefreshUI, delta);
};

window.renderVoteNotificationUI = function (questionId, data, isInitialLoad = true) {
    if (questionId !== window.APP.current_question.questionId) return;
    const $bar = $('#vote-notification-bar');
    if (isInitialLoad) $bar.empty();

    const votes = data.votes || [];
    const thresholds = data.thresholds || { confirm: 2 };
    if (votes.length === 0) {
        if (isInitialLoad) $bar.empty();
        return;
    }

    const incompleteVotes = votes.filter(v => (parseInt(v.count) || 0) < thresholds.confirm);
    if (incompleteVotes.length === 0) return;

    const topVote = incompleteVotes.reduce((max, current) => {
        return (parseInt(current.count) || 0) > (parseInt(max.count) || 0) ? current : max;
    }, { count: -1, categoryId: null, status: null });

    if (!topVote.categoryId) return;

    const categoryName = window.getCategoryNameById(topVote.categoryId);
    const currentCount = parseInt(topVote.count) || 0;

    let nextTarget = thresholds.confirm;
    let statusLabel = 'เพื่ออนุมัติ';
    let bgColor = '#fff3cd';
    let textColor = '#856404';

    const votesRemaining = nextTarget - currentCount;
    const statusText = votesRemaining > 0
        ? `ขาดอีก <b style="color: ${textColor};">${votesRemaining}</b> โหวต ${statusLabel}!`
        : `<b style="color: ${textColor};">รอ Admin ตรวจสอบ</b>`;

    const html = `
        <div id="quick-vote-badge"
            data-category-id="${topVote.categoryId}"
            style="margin-top: -10px; margin-bottom: 10px; padding: 10px 20px; border-radius: 25px; 
                 background-color: ${bgColor}; color: ${textColor}; font-weight: 700; 
                 display: flex; align-items: center; justify-content: center; cursor: pointer;
                 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); border: 2px solid ${textColor};
                 transition: all 0.3s ease-in-out; z-index: 10;">
            <i class="fas fa-tags" style="margin-right: 8px;"></i>
            <span style="font-size: 1.2rem; margin-right: 12px;">เสนอหัวข้อ: <b>${categoryName}</b></span>
            <span style="font-size: 1.1rem; font-weight: 600;">(${statusText})</span>
        </div>
    `;

    $bar.html(html);

    $bar.find('#quick-vote-badge').off('click').on('click', function () {
        const categoryIdToVote = $(this).data('category-id');
        const catName = $(this).find('b').first().text();
        const targetQ = window.APP.current_question;

        Swal.fire({
            title: 'คุณเห็นด้วยกับหัวข้อนี้หรือไม่?',
            html: `หัวข้อ: <b>"${catName}"</b>`,
            icon: 'question',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'เห็นด้วย (+1)',
            denyButtonText: 'ไม่เห็นด้วย (-1)',
        }).then((result) => {
            if (result.isConfirmed) {
                window.submitVoteData([categoryIdToVote], targetQ, true, 1);
            } else if (result.isDenied) {
                window.submitVoteData([categoryIdToVote], targetQ, true, -1);
            }
        });
    });
};

window.renderQuickCatPanel = function () {
    const $content = $('#quick-cat-content');
    $content.empty();

    const currentSubject = new URLSearchParams(window.location.search).get('subject') || '';

    // เลือกเฉพาะหมวดเลคเชอร์/สาขาวิชาของวิชานี้ (ข้ามชุดข้อสอบ by AI / Extracted)
    // ใช้สัญญาณเดียวกับ accordion: ชื่อกลุ่มมี "LEC" หรือ categoryId มี token สาขาวิชา
    const relevantCats = window.APP.globalStructure.category.filter(c => {
        if (c.subjectRef !== currentSubject) return false;
        const agU = (c.accordionGroup || '').toUpperCase();
        if (agU.includes("BY AI") || agU.includes("(EXTRACTED)")) return false;
        return agU.includes("LEC") || window.isLectureCategory(c.categoryId);
    });

    if (relevantCats.length === 0) {
        $content.html('<div style="padding:10px; text-align:center; color: var(--color-text-muted); font-size:0.9rem;">ไม่มีหมวดเลคเชอร์ให้แยกสำหรับวิชานี้</div>');
        return;
    }

    // จัดกลุ่มตาม accordionGroup — เป็นแกนสาขาวิชาตามธรรมชาติของข้อมูลอยู่แล้ว
    const groups = {};
    relevantCats.forEach(c => {
        const g = c.accordionGroup || 'อื่นๆ';
        (groups[g] = groups[g] || []).push(c);
    });

    // เดาสีขอบซ้ายจากชื่อกลุ่ม (สอดคล้องกับ getCategoryColorClass ใน ui.js)
    const colorForGroup = (name) => {
        const t = name.toUpperCase();
        if (t.includes("ANATOMY") || t.includes("ANA")) return "q-ana";
        if (t.includes("PHYSIO") || t.includes("BIOCHEM")) return "q-physio";
        if (t.includes("MICRO") || t.includes("PARASITO")) return "q-micro";
        if (t.includes("PATHO")) return "q-patho";
        if (t.includes("PHARM")) return "q-pharm";
        if (t.includes("RADIO") || t.includes("CLINICAL")) return "q-radio";
        return "";
    };

    for (const groupName of Object.keys(groups).sort()) {
        const cats = groups[groupName];
        const colorClass = colorForGroup(groupName);

        let html = `<div class="quick-cat-group">
                <div class="quick-cat-group-title">${groupName} <span>${cats.length} เลค</span></div>
                <div class="quick-cat-grid">`;

        cats.forEach(c => {
            const isAlreadySelected = window.APP.current_question.category.includes(c.categoryId);
            const btnStyle = isAlreadySelected
                ? "opacity: 0.4; cursor: default; background: #e0e0e0; color: #888;"
                : "cursor: pointer;";
            const checkMark = isAlreadySelected ? " <i class='fas fa-check-circle'></i>" : "";
            const clickEvent = isAlreadySelected ? "" : `onclick="window.handleQuickVote('${c.categoryId}', '${c.categoryName.replace(/'/g, "\\'")}')"`;

            html += `<button class="btn-quick-cat ${colorClass}"
                    style="${btnStyle}"
                    ${clickEvent}
                    title="${c.categoryName}">
                    ${c.categoryName}${checkMark}
                 </button>`;
        });

        html += `</div></div>`;
        $content.append(html);
    }
};

window.handleQuickVote = function (catId, catName) {
    Swal.fire({
        title: 'ยืนยันแยกหัวข้อ',
        text: `แยกข้อนี้ไปที่: ${catName}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ใช่ (Approve)',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#1a73e8'
    }).then((result) => {
        if (result.isConfirmed) {
            window.submitVoteData([catId], window.APP.current_question, true, 1);
            setTimeout(window.renderQuickCatPanel, 500);
        }
    });
};

window.openVoteModal = function (q, isAuto = false) {
    const target = q || window.APP.current_question;

    if (!target || !target.questionId) {
        Swal.fire("กรุณาเลือกข้อสอบก่อน");
        return;
    }

    window.APP.modalTargetQuestion = JSON.parse(JSON.stringify(target));

    $('#vote-question-preview').text(window.APP.modalTargetQuestion.problem);

    window.renderCurrentCategoryForModal(window.APP.modalTargetQuestion);
    window.fetchPendingVotes(window.APP.modalTargetQuestion.questionId);

    const $msgContainer = $('#vote-message-container');
    $msgContainer.empty().show();

    if (isAuto) {
        const remaining = window.MAX_AUTO_VOTE - window.APP.sessionAutoVoteCount;
        $msgContainer.css({ 'background-color': '#f8d7da', 'color': '#721c24', 'border': '1px solid #f5c6cb' });
        $msgContainer.html(`
            <h6 style="margin:0; font-weight:800; font-size:1.2rem;"><i class="fas fa-exclamation-circle"></i> ช่วยกันแยกเลคเชอร์หน่อยนะครับ 1 ครั้งที่ใช้เว็บจะให้ช่วยแยกแค่คนละ 2 ข้อ</h6>
            <h1 style="margin:5px 0 0 0; font-size:1.5rem; text-align:left; color:#721c24;">เหลืออีก ${remaining} ข้อครับ 🙏</h1>
        `);
    } else {
        $msgContainer.css({ 'background-color': '#d1e7dd', 'color': '#0f5132', 'border': '1px solid #badbcc' });
        $msgContainer.html(`<h6 style="margin:0; font-weight:800; font-size:1.2rem;"><i class="fas fa-info-circle"></i> ช่วยระบุเลคเชอร์ เพื่อให้เพื่อนๆ เลือกฝึกทำเฉพาะบทเรียนได้แม่นยำขึ้น</h6>`);
    }

    $('#vote-rows-container').empty();

    const urlParams = new URLSearchParams(window.location.search);
    let currentSubjectId = urlParams.get('subject');
    if (!currentSubjectId && window.APP.modalTargetQuestion.category) {
        const firstCatId = Array.isArray(window.APP.modalTargetQuestion.category) ? window.APP.modalTargetQuestion.category[0] : window.APP.modalTargetQuestion.category;
        const matchedCat = window.APP.globalStructure.category.find(c => c.categoryId === firstCatId);
        if (matchedCat) currentSubjectId = matchedCat.subjectRef;
    }

    window.addVoteRow(currentSubjectId);
    $('#vote-category-modal').fadeIn();
};

window.renderCurrentCategoryForModal = function (q) {
    const $container = $('#current-category-container');
    $container.empty();
    let cats = Array.isArray(q.category) ? q.category : [q.category];
    cats = cats.filter(c => c && c !== 'Uncategorized');

    if (cats.length === 0) {
        $container.html('<span class="empty-state-text">- ยังไม่มีหัวข้อ -</span>');
        return;
    }
    cats.forEach(catId => {
        $container.append(`<span class="category-badge approved">${window.getCategoryNameById(catId)} <i class="fas fa-check"></i></span>`);
    });
};

window.addVoteRow = function (preSelectedSubjectId = null) {
    const subjects = [];
    const uniqueSubjects = {};

    if (window.APP.globalStructure && window.APP.globalStructure.subjects) {
        window.APP.globalStructure.subjects.forEach(s => {
            if (!uniqueSubjects[s.subjectId]) {
                uniqueSubjects[s.subjectId] = s;
                subjects.push({ id: s.subjectId, name: s.subjectName });
            }
        });
    }

    let subjectOptions = `<option value="">-- เลือกวิชา --</option>`;
    subjects.forEach(s => {
        const selected = (preSelectedSubjectId && String(s.id) === String(preSelectedSubjectId)) ? 'selected' : '';
        subjectOptions += `<option value="${s.id}" ${selected}>${s.id} - ${s.name}</option>`;
    });

    const rowHtml = `
        <div class="vote-row" style="display: flex;">
            <button class="btn-remove-row"><i class="fas fa-minus"></i></button>
            
            <div style="flex:1; margin-right: 5px;">
                <select class="vote-select subject-select" style="width:100%; margin-bottom:5px;">${subjectOptions}</select>
            </div>
            
            <div style="flex:1; margin-right: 5px;">
                <select class="vote-select group-select" disabled style="width:100%; margin-bottom:5px;"><option value="">-- เลือกกลุ่ม --</option></select>
                <span class="warning-text group-warning" style="display:none; color:#e65100; font-size:0.9rem; font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> มีหลายกลุ่ม โปรดเลือก</span>
            </div>

            <div style="flex:1;">
                <select class="vote-select category-select" disabled style="width:100%; margin-bottom:5px;"><option value="">-- เลือกหัวข้อ --</option></select>
                <span class="warning-text category-warning" style="display:none; color:#e65100; font-size:0.9rem; font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> มีหลายหัวข้อ โปรดเลือก</span>
            </div>
        </div>
    `;

    const $row = $(rowHtml);
    $('#vote-rows-container').append($row);

    const populateGroups = ($rowCtx, subjId) => {
        const $groupSelect = $rowCtx.find('.group-select');
        const $groupWarning = $rowCtx.find('.group-warning');

        $groupSelect.empty().append('<option value="">-- เลือกกลุ่ม --</option>').prop('disabled', true);
        $groupWarning.hide();

        if (subjId) {
            const relatedCategory = window.APP.globalStructure.category.filter(t => t.subjectRef === subjId);
            const groups = [...new Set(relatedCategory
                .map(t => t.accordionGroup)
                .filter(g => g && g.toUpperCase().includes("LEC"))
            )];

            if (groups.length > 0) {
                groups.forEach(g => {
                    $groupSelect.append(`<option value="${g}">${g}</option>`);
                });
                $groupSelect.prop('disabled', false);

                if (groups.length === 1) {
                    $groupSelect.val(groups[0]).trigger('change');
                } else {
                    $groupWarning.show();
                }
            } else {
                $groupSelect.append('<option value="">(ไม่มีกลุ่ม Lecture ในวิชานี้)</option>');
            }
        }
    };

    const populateCategories = ($rowCtx, subjId, groupName) => {
        const $categorySelect = $rowCtx.find('.category-select');
        const $categoryWarning = $rowCtx.find('.category-warning');

        $categorySelect.empty().append('<option value="">-- เลือกหัวข้อ --</option>').prop('disabled', true);
        $categoryWarning.hide();

        if (groupName && subjId) {
            const categoryList = window.APP.globalStructure.category.filter(t => t.subjectRef === subjId && t.accordionGroup === groupName);

            const uniqueCats = [];
            const seenCatIds = new Set();
            categoryList.forEach(c => {
                if (!seenCatIds.has(c.categoryId)) {
                    seenCatIds.add(c.categoryId);
                    uniqueCats.push(c);
                }
            });

            uniqueCats.forEach(t => {
                $categorySelect.append(`<option value="${t.categoryId}">${t.categoryName}</option>`);
            });
            $categorySelect.prop('disabled', false);

            if (uniqueCats.length === 1) {
                $categorySelect.val(uniqueCats[0].categoryId);
            } else if (uniqueCats.length > 1) {
                $categoryWarning.show();
            }
        }
    };

    $row.find('.subject-select').on('change', function () {
        const subjId = $(this).val();
        $row.find('.group-select').empty().append('<option value="">-- เลือกกลุ่ม --</option>').prop('disabled', true);
        $row.find('.category-select').empty().append('<option value="">-- เลือกหัวข้อ --</option>').prop('disabled', true);
        $row.find('.warning-text').hide();
        populateGroups($row, subjId);
    });

    $row.find('.group-select').on('change', function () {
        const groupName = $(this).val();
        const subjId = $row.find('.subject-select').val();
        populateCategories($row, subjId, groupName);
    });

    $row.find('.btn-remove-row').on('click', function () {
        $(this).closest('.vote-row').remove();
    });

    if (preSelectedSubjectId) {
        populateGroups($row, preSelectedSubjectId);
    }
};

$(function () {
    window.MAX_AUTO_VOTE = 0; // ปิด auto-vote popup — จะแยกหัวข้อด้วย AI batch แทน

    $('#btn-open-vote').on('click', () => {
        window.openVoteModal(window.APP.currentQuestions[window.APP.questionIndex], false);
    });

    $('#btn-close-vote-modal').on('click', () => {
        $('#vote-category-modal').fadeOut();
    });

    $('#btn-add-vote-row').on('click', function () {
        window.addVoteRow();
    });

    $('#toggle-quick-cat').on('click', function () {
        const $panel = $('#quick-cat-container');
        if ($panel.is(':visible')) {
            $panel.slideUp();
            $(this).html('<i class="fas fa-bolt"></i> เปิดแผงแยกหัวข้อด่วน (Quick Mode)');
        } else {
            window.renderQuickCatPanel();
            $panel.slideDown();
            $(this).html('<i class="fas fa-times"></i> ปิดแผงแยกหัวข้อ');
            $('html, body').animate({ scrollTop: $(this).offset().top - 100 }, 500);
        }
    });

    $('#btn-submit-vote').off('click').on('click', () => {
        const votes = [];
        $('.vote-row').each(function () {
            const categoryId = $(this).find('.category-select').val();
            if (categoryId) {
                if (!window.APP.modalTargetQuestion.category.includes(categoryId)) {
                    votes.push(categoryId);
                }
            }
        });

        const uniqueVotes = [...new Set(votes)];

        if (uniqueVotes.length === 0) {
            Swal.fire("กรุณาเลือกหัวข้ออย่างน้อย 1 หัวข้อ (และต้องไม่ซ้ำกับหัวข้อเดิม)");
            return;
        }

        window.submitVoteData(uniqueVotes, window.APP.modalTargetQuestion);
    });

    window.updateFastModeButtonUI = function () {
        const $fastBtn = $('#toggle-fast-mode-btn');
        if (window.APP.isFastMode) {
            $fastBtn.html('<i class="fas fa-bolt"></i> โหมดเร่งด่วน (Fast Mode): เปิด').addClass('fast-mode-on');
        } else {
            $fastBtn.html('<i class="fas fa-bolt"></i> โหมดเร่งด่วน (Fast Mode): ปิด').removeClass('fast-mode-on');
        }
    };

    $('#toggle-fast-mode-btn').on('click', function () {
        window.APP.isFastMode = !window.APP.isFastMode;
        window.updateFastModeButtonUI();

        if (window.APP.isFastMode) {
            window.bgToast.fire({
                icon: 'info',
                title: 'เปิดใช้งานโหมดเร่งด่วน เหลือเพียง 2 ตัวเลือก',
                timer: 2000
            });
        }

        window.showQuestion(false);
        window.saveProgressToCache();
    });
});

// ============================================================
// REPORT VOTE SYSTEM — mirrors fetchPendingVotes pattern
// ============================================================

window.activeReportFetches = window.activeReportFetches || new Set();

window.fetchPendingReports = function (questionId) {
    if (window.activeReportFetches.has(questionId)) return;
    window.activeReportFetches.add(questionId);

    window.fetchGAS(() => `${window.APPSCRIPT_URL}?action=getPendingReports&qid=${questionId}&_=${Date.now()}`)
        .then(data => {
            window.APP.pendingReportsCache[questionId] = data;
            window.renderReportNotificationUI(questionId, data);
        })
        .catch(err => console.warn("Fetch Pending Reports Failed:", err))
        .finally(() => { window.activeReportFetches.delete(questionId); });
};

window.renderReportNotificationUI = function (questionId, data) {
    if (questionId !== window.APP.current_question.questionId) return;
    const $bar = $('#report-notification-bar');
    $bar.empty();

    const reports = (data.reports || []).filter(r => r.voteCount > 0);
    if (reports.length === 0) return;

    const top = reports[0]; // sorted desc by voteCount
    const remaining = data.threshold - top.voteCount;
    const statusText = remaining > 0
        ? `ขาดอีก <b style="color:#9b1c1c;">${remaining}</b> โหวต`
        : `<b style="color:#9b1c1c;">รอ Admin ตรวจสอบ</b>`;

    const html = `
        <div id="quick-report-badge"
            style="margin-top: -10px; margin-bottom: 10px; padding: 10px 20px; border-radius: 25px;
                   background-color: #fde8e8; color: #9b1c1c; font-weight: 700;
                   display: flex; align-items: center; justify-content: center; cursor: pointer;
                   box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 2px solid #9b1c1c;
                   transition: all 0.3s ease-in-out; z-index: 10;">
            <i class="fas fa-exclamation-circle" style="margin-right: 8px;"></i>
            <span style="font-size: 1.2rem; margin-right: 12px;">รายงานเฉลยผิด: <b>${reports.length} รายการ</b></span>
            <span style="font-size: 1.1rem; font-weight: 600;">(${statusText})</span>
        </div>
    `;

    $bar.html(html);
    $bar.find('#quick-report-badge').off('click').on('click', function () {
        window.openReportVoteModal(questionId, data);
    });
};

window.openReportVoteModal = function (questionId, data) {
    const reports = (data.reports || []).filter(r => r.voteCount > 0);
    if (reports.length === 0) return;

    let listHtml = '';
    reports.forEach(function (r) {
        const isUrl = r.suggestedChoice && (r.suggestedChoice.startsWith('http') || r.suggestedChoice.startsWith('<svg'));
        const display = isUrl ? '[รูปภาพ]' : (r.suggestedChoice || '-');
        listHtml += `
            <div style="margin-bottom: 16px; padding: 12px; background: #fff8f8; border-radius: 8px; border-left: 4px solid #e74a3b;">
                <div style="font-size: 1.1rem; margin-bottom: 6px;">
                    เสนอเฉลย: <b>${display}</b>
                    <span style="margin-left: 8px; padding: 2px 8px; background: #6b7280; color: white; border-radius: 10px; font-size: 0.85rem;">
                        <i class="fas fa-users"></i> ${r.voteCount} โหวต
                    </span>
                </div>
                ${r.reportDetail ? `<div style="font-size: 0.9rem; color: #555; margin-bottom: 8px;">เหตุผล: ${r.reportDetail}</div>` : ''}
                <div style="display: flex; gap: 8px;">
                    <button class="btn-report-vote"
                        data-timestamp="${r.timestamp}" data-delta="1" data-qid="${questionId}"
                        style="padding: 6px 16px; border-radius: 20px; border: none; background: #22c55e; color: white; cursor: pointer; font-weight: 700;">
                        เห็นด้วย (+1)
                    </button>
                    <button class="btn-report-vote"
                        data-timestamp="${r.timestamp}" data-delta="-1" data-qid="${questionId}"
                        style="padding: 6px 16px; border-radius: 20px; border: none; background: #dc3545; color: white; cursor: pointer; font-weight: 700;">
                        ไม่เห็นด้วย (-1)
                    </button>
                </div>
            </div>
        `;
    });

    Swal.fire({
        title: '<i class="fas fa-exclamation-circle" style="color:#dc3545;"></i> รายงานเฉลยผิด',
        html: listHtml,
        showConfirmButton: false,
        showCloseButton: true,
        width: '600px',
        didOpen: function () {
            document.querySelectorAll('.btn-report-vote').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const timestamp = this.dataset.timestamp;
                    const delta = parseInt(this.dataset.delta);
                    const qid = this.dataset.qid;
                    Swal.close();
                    window.submitReportVote(timestamp, delta, qid);
                });
            });
        }
    });
};

window.submitReportVote = async function (reportTimestamp, delta, questionId) {
    const payload = {
        action: 'voteOnReport',
        reportTimestamp: reportTimestamp,
        delta: delta,
        questionId: questionId
    };

    try {
        const res = await window.sendWithRetry(payload);
        // ดักจับและประเมินสิทธิ์ความสำเร็จที่ส่งกลับมาจาก Server เสมอเพื่อความเสถียร
        if (res && res.result === 'success') {
            delete window.APP.pendingReportsCache[questionId];
            window.fetchPendingReports(questionId);
            Swal.fire({
                icon: 'success',
                title: 'บันทึกการโหวตสำเร็จ!',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
        } else {
            throw new Error(res ? res.message : "เซิร์ฟเวอร์ปฏิเสธการลงคะแนน");
        }
    } catch (err) {
        Swal.fire("Error", "ไม่สามารถบันทึกการโหวตได้: " + err.message, "error");
    }
};

// ============================================================
// T1.1 — Bulk Votes/Reports Fetch (ครั้งเดียวต่อ Session)
// ดึง pending votes + reports ของทุกข้อในวิชาด้วย request เดียว
// แล้วอัดเข้า pendingVotesCache / pendingReportsCache ทันที
// qid ที่ไม่ปรากฏใน response = ไม่มีข้อมูล (ใช้ _bulkPendingLoaded
// เป็น flag ว่า cache miss = known-empty ไม่ต้อง per-qid fallback)
// ============================================================

window.fetchAllPendingVotesReports = async function (subjectParam) {
    if (!subjectParam) return;
    window._bulkPendingInFlight = true;
    try {
        const json = await window.fetchGAS(
            () => `${window.APPSCRIPT_URL}?action=getPendingVotesReports&subject=${encodeURIComponent(subjectParam)}&_=${Date.now()}`
        );
        if (!json || json.status !== 'success' || !json.data) return;

        const votesMap = json.data.votes || {};
        const reportsMap = json.data.reports || {};

        // เติม cache ด้วยข้อมูลจริงของแต่ละ qid
        Object.keys(votesMap).forEach(function (qid) {
            window.APP.pendingVotesCache[qid] = votesMap[qid];
        });
        Object.keys(reportsMap).forEach(function (qid) {
            window.APP.pendingReportsCache[qid] = reportsMap[qid];
        });

        window._bulkPendingLoaded = true;
        console.log('[Bulk VR] loaded votes for', Object.keys(votesMap).length,
            'qids, reports for', Object.keys(reportsMap).length, 'qids');
    } catch (err) {
        console.warn('[Bulk VR] fetchAllPendingVotesReports failed:', err);
        // ไม่ set _bulkPendingLoaded → showQuestion จะ fallback per-qid ตามเดิม
    } finally {
        window._bulkPendingInFlight = false;
    }
};