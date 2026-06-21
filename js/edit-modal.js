window.editChoiceCounter = 0;
window.editImageArray = [];
window.editImageIndex = 0;
window.explainImageArray = [];
window.explainImageIndex = 0;
window.choiceImagesData = {}; // Stores pending base64/blob for choice images
window.currentLibTarget = { type: 'main', rowId: null };

window.openEditModal = function () {
    // Auth Guard: หากเซสชันยังไม่ถูกต้องหรือหมดอายุ ให้ตรวจสอบก่อน
    if (!window.ensureActiveSession()) return;

    const q = window.APP.current_question;
    if (!q || !q.questionId) return;

    // Reset state variables
    window.editChoiceCounter = 0;
    window.editImageArray = [];
    window.editImageIndex = 0;
    window.explainImageArray = [];
    window.explainImageIndex = 0;
    window.choiceImagesData = {};

    $("#edit-q-id").val(q.questionId);
    $("#edit-q-id-display").text("ID: " + q.questionId);
    $("#edit-problem").val(q.problem || "");

    // 1. Categories UI Setup (Dropdowns)
    const currentCategories = Array.isArray(q.category) ? q.category : [q.category];
    window.renderCategoriesUI(currentCategories);

    // 2. Main Images Gallery Setup
    const imgStr = q.img || "";
    window.editImageArray = imgStr.split('///').map(u => u.trim()).filter(Boolean);
    window.syncEditImageGallery();

    // 3. Choices Setup (Redesigned Active Row Mode)
    const choices = (q.choices || "").split("///").map(s => s.trim()).filter(Boolean);
    $("#dynamic-choices-container").empty();
    choices.forEach(c => {
        window.addEditChoiceRow(c, c === q.answer);
    });
    if (choices.length === 0) {
        for (let i = 0; i < 4; i++) window.addEditChoiceRow("", i === 0);
    }

    // 4. Explanation & Media Setup
    const parsedExp = window.parseExplain(q.explain);
    $("#edit-explanation").val(parsedExp.text || "");
    window.renderExplainMediaUI(parsedExp.media || []);

    // 5. Reset default tab focus
    const tabBtnQuestion = document.getElementById('tab-btn-question');
    if (tabBtnQuestion) {
        window.switchEditModalTab(tabBtnQuestion, 't-question');
    }

    $("#quiz-edit-modal").css("display", "flex").hide().fadeIn(250);
};

window.closeEditModal = function () {
    $("#quiz-edit-modal").fadeOut(250);
};

// --- Tab Navigation Switcher ---

window.switchEditModalTab = function (btn, panelId) {
    $('#quiz-edit-modal .tab-btn').removeClass('active').attr('aria-selected', 'false');
    $('#quiz-edit-modal .tab-panel').removeClass('active');
    $(btn).addClass('active').attr('aria-selected', 'true');
    $('#quiz-edit-modal #' + panelId).addClass('active');
};

// --- Category Dropdowns Management ---

window.renderCategoriesUI = function (categoryArray) {
    const $container = $('#dynamic-categories-container').empty();
    const categories = Array.isArray(categoryArray) ? categoryArray : [categoryArray];

    const validCats = categories.filter(c => c && c !== '-' && c !== 'Uncategorized');
    if (validCats.length === 0) {
        window._renderNewCategoryRow();
    } else {
        // ส่งพารามิเตอร์เพื่อระบุว่าหมวดหมู่แรกสุด (index === 0) คือหมวดหมู่เริ่มต้น (Default)
        validCats.forEach((catId, index) => window._renderNewCategoryRow(catId, index === 0));
    }
    window.syncCategoriesToHiddenInput();
};

window._renderNewCategoryRow = function (selectedCategoryID = null, isDefault = false) {
    const $container = $('#dynamic-categories-container');
    const subjects = [...new Set(window.APP.globalStructure.category.map(c => c.subjectRef))].filter(Boolean).sort();

    let subjectOptions = `<option value="">-- เลือกวิชา --</option>`;
    subjects.forEach(s => {
        subjectOptions += `<option value="${s}">${s}</option>`;
    });

    let selectedSubject = '';
    let selectedGroup = '';

    if (selectedCategoryID) {
        const cleanID = String(selectedCategoryID).trim();
        const cat = window.APP.globalStructure.category.find(c => String(c.categoryId).trim() === cleanID);
        if (cat) {
            selectedSubject = cat.subjectRef;
            selectedGroup = cat.accordionGroup;
        }
    }

    const rowId = "category-row-" + Date.now() + Math.floor(Math.random() * 100);

    // แสดงปุ่มล็อค (Lock) แทนปุ่มลบสำหรับหมวดหมู่เริ่มต้น
    const actionBtn = isDefault
        ? `<button class="btn-icon btn-delete" type="button" disabled style="opacity: 0.55; cursor: not-allowed; background: #e2e8f0; color: #64748b;" title="หมวดหมู่เริ่มต้น (Default) ไม่สามารถแก้ไขหรือลบได้"><i class="fas fa-lock" aria-hidden="true"></i></button>`
        : `<button class="btn-icon btn-delete" type="button" onclick="window.removeCategoryRow(this)"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>`;

    // ใส่พื้นหลังสีฟ้าพาสเทลเพื่อบ่งชี้ว่าเป็นหมวดหมู่เริ่มต้น
    const rowHtml = `
        <div class="cat-row ${isDefault ? 'default-cat-row' : ''}" id="${rowId}" style="${isDefault ? 'border-left: 4px solid #0284c7; background: #f0f9ff;' : ''}">
            <select class="field-input category-subject-select" onchange="window.updateGroupSelect(this)">
                ${subjectOptions}
            </select>
            <select class="field-input category-group-select" onchange="window.updateCategorySelect(this)" disabled>
                <option value="">-- กลุ่ม --</option>
            </select>
            <select class="field-input category-id-select" onchange="window.syncCategoriesToHiddenInput()" disabled>
                <option value="">-- หัวข้อ/Category --</option>
                ${(selectedCategoryID && !selectedSubject) ? `<option value="${selectedCategoryID}" selected>${selectedCategoryID}</option>` : ''}
            </select>
            ${actionBtn}
        </div>
    `;

    const $row = $(rowHtml);
    $container.append($row);

    if (selectedSubject) {
        $row.find('.category-subject-select').val(selectedSubject);
        window.updateGroupSelect($row.find('.category-subject-select')[0]);
        if (selectedGroup) {
            $row.find('.category-group-select').val(selectedGroup);
            window.updateCategorySelect($row.find('.category-group-select')[0]);
            if (selectedCategoryID) {
                $row.find('.category-id-select').val(selectedCategoryID);
            }
        }
    }

    // ล็อคอินพุตตัวเลือกทั้งหมดของหมวดหมู่เริ่มต้น
    if (isDefault) {
        $row.find('select').prop('disabled', true);
        // ตกแต่งพื้นหลังเพิ่มเติมในกรณีสกิน Dark Theme
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            $row.css({ 'background': '#0c1e35', 'border-left': '4px solid #38bdf8' });
        }
    }
};

window.addNewCategoryRow = function () {
    window._renderNewCategoryRow();
};

window.removeCategoryRow = function (btn) {
    $(btn).closest('.cat-row').remove();
    window.syncCategoriesToHiddenInput();
};

window.updateGroupSelect = function (selectElement) {
    const $subjectSelect = $(selectElement);
    const subjId = $subjectSelect.val();
    const $row = $subjectSelect.closest('.cat-row');
    const $groupSelect = $row.find('.category-group-select');
    const $catSelect = $row.find('.category-id-select');

    $groupSelect.empty().append('<option value="">-- กลุ่ม --</option>').prop('disabled', true);
    $catSelect.empty().append('<option value="">-- หัวข้อ/Category --</option>').prop('disabled', true);

    if (subjId) {
        const relatedCategory = window.APP.globalStructure.category.filter(t => t.subjectRef === subjId);
        const groups = [...new Set(relatedCategory.map(t => t.accordionGroup))].filter(Boolean).sort();
        groups.forEach(g => {
            $groupSelect.append(`<option value="${g}">${g}</option>`);
        });
        $groupSelect.prop('disabled', false);
    }
    window.syncCategoriesToHiddenInput();
};

window.updateCategorySelect = function (selectElement) {
    const $groupSelect = $(selectElement);
    const groupName = $groupSelect.val();
    const $row = $groupSelect.closest('.cat-row');
    const subjId = $row.find('.category-subject-select').val();
    const $categorySelect = $row.find('.category-id-select');

    $categorySelect.empty().append('<option value="">-- หัวข้อ/Category --</option>').prop('disabled', true);

    if (groupName && subjId) {
        const categories = window.APP.globalStructure.category.filter(t => t.subjectRef === subjId && t.accordionGroup === groupName);
        categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
        categories.forEach(t => {
            $categorySelect.append(`<option value="${t.categoryId}">${t.categoryName} (${t.categoryId})</option>`);
        });
        $categorySelect.prop('disabled', false);
    }
    window.syncCategoriesToHiddenInput();
};

window.syncCategoriesToHiddenInput = function () {
    const categories = [];
    $('#dynamic-categories-container .category-id-select').each(function () {
        const val = $(this).val();
        if (val) categories.push(val);
    });
    $('#edit-category-hidden').val(JSON.stringify(categories));
};

// --- Choice Management (Rich Mode) ---

window.addEditChoiceRow = function (value = "", isAnswer = false) {
    window.editChoiceCounter++;
    const rowId = "edit-choice-row-" + window.editChoiceCounter;
    const isImagePendingPlaceholder = value === '[IMAGE_PENDING]';

    const rowHtml = `
        <div class="choice-row ${isAnswer ? 'correct' : ''}" id="${rowId}">
            <div class="letter-badge">A</div>
            <div class="radio-circle ${isAnswer ? 'active' : ''}" onclick="window.setChoiceCorrect('${rowId}')" role="radio" aria-checked="${isAnswer}" aria-label="ตั้งเป็นเฉลย" tabindex="0"></div>
            <input class="choice-input edit-choice-input" type="text" value="${isImagePendingPlaceholder ? '' : value.replace(/"/g, '&quot;')}" placeholder="ตัวเลือก…" oninput="window.syncChoicesToHiddenInput()">
            
            <div class="choice-actions">
                <button type="button" class="btn-xs teal" title="เลือกจากคลัง" onclick="window.openImageLibrary('choice', '${rowId}')"><i class="fas fa-images" aria-hidden="true"></i></button>
                <label class="btn-xs purple mb-0" style="cursor: pointer; display: flex; align-items: center; justify-content: center; margin: 0;" title="อัปโหลดรูป"><i class="fas fa-upload" aria-hidden="true"></i><input type="file" class="d-none" accept="image/*" onchange="window.handleChoiceImageSelect(this, '${rowId}')"></label>
                <button type="button" class="btn-xs red" onclick="window.removeEditChoiceRow('${rowId}')" title="ลบ" aria-label="ลบตัวเลือก"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>
            </div>
            
            <!-- Choice Preview Sub-panel (hidden by default unless image/svg exists) -->
            <div class="choice-preview-box w-100" style="display: none; margin-top: 8px; text-align: center; background: var(--surface2); padding: 8px; border-radius: 6px; position: relative;">
                <img class="choice-preview-img" referrerpolicy="no-referrer" style="max-height: 100px; object-fit: contain; display: none;">
                <div class="choice-preview-svg" style="display: none; max-height: 100px; overflow: auto; background: white; padding: 6px;"></div>
                <button type="button" class="btn-xs red" style="margin: 6px auto 0; font-size: 11px; width: auto; padding: 0 10px;" onclick="window.removeChoiceMedia('${rowId}')">ล้างสื่อ</button>
            </div>
        </div>
    `;

    const $row = $(rowHtml);
    $("#dynamic-choices-container").append($row);

    // Bind Choice Selection Frame Hover Highlight
    $row.on('click', function (e) {
        $('.choice-row').removeClass('focus');
        $row.addClass('focus');
        if (!$(e.target).is('input') && !$(e.target).is('button') && !$(e.target).is('i') && !$(e.target).is('label')) {
            $row.find('.edit-choice-input').focus();
        }
    });

    window.renderEditChoicePreview($row.find('.edit-choice-input'));
    window.updateChoiceLetters();
};

window.updateChoiceLetters = function () {
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    $('#dynamic-choices-container .choice-row').each(function (idx) {
        $(this).find('.letter-badge').text(letters[idx] || (idx + 1));
    });
};

window.setChoiceCorrect = function (rowId) {
    $('#dynamic-choices-container .choice-row').removeClass('correct');
    $('#dynamic-choices-container .radio-circle').removeClass('active').attr('aria-checked', 'false');

    const $targetRow = $('#' + rowId);
    $targetRow.addClass('correct');
    $targetRow.find('.radio-circle').addClass('active').attr('aria-checked', 'true');

    window.syncChoicesToHiddenInput();
};

window.renderEditChoicePreview = function ($input) {
    const val = $input.val().trim();
    const $row = $input.closest('.choice-row');
    const rowId = $row.attr('id');
    const $previewBox = $row.find('.choice-preview-box');
    const $img = $row.find('.choice-preview-img');
    const $svg = $row.find('.choice-preview-svg');

    $previewBox.hide(); $img.hide(); $svg.hide().empty();

    const imgEntry = window.choiceImagesData[rowId];
    if (imgEntry) {
        $input.hide();
        $img.attr('src', imgEntry.blob).show();
        $previewBox.show();
        return;
    }

    if (!val) { $input.show(); return; }

    if (val.startsWith('<svg')) {
        $input.show();
        $svg.html(val).show();
        $previewBox.show();
    } else if (val.includes('drive.google.com') || val.startsWith('http')) {
        $input.hide();
        $img.attr('src', window.transformUrl(val)).show();
        $previewBox.show();
    } else {
        $input.show();
    }
};

window.removeEditChoiceRow = function (rowId) {
    if (window.choiceImagesData[rowId]) {
        delete window.choiceImagesData[rowId];
    }
    $("#" + rowId).remove();
    window.updateChoiceLetters();
    window.syncChoicesToHiddenInput();
};

window.removeChoiceMedia = function (rowId) {
    const $row = $("#" + rowId);
    const $input = $row.find('.edit-choice-input');

    if (window.choiceImagesData[rowId]) {
        delete window.choiceImagesData[rowId];
    }
    $input.val('').show();
    window.renderEditChoicePreview($input);
    window.syncChoicesToHiddenInput();
};

window.handleChoiceImageSelect = function (input, rowId) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const localUrl = URL.createObjectURL(file);

    window.getBase64(file).then(async base64 => {
        const compressed = await window.compressImage(base64, 800, 800);
        window.choiceImagesData[rowId] = { type: 'pending', data: compressed, blob: localUrl };
        const $input = $("#" + rowId).find('.edit-choice-input');
        $input.val('[IMAGE_PENDING]');
        window.renderEditChoicePreview($input);
        window.syncChoicesToHiddenInput();
    });
};

window.addNewChoiceRow = function () {
    window.addEditChoiceRow("");
    window.syncChoicesToHiddenInput();
};

window.syncChoicesToHiddenInput = function () {
    const choices = [];
    let correctAnswer = "";

    $('#dynamic-choices-container .choice-row').each(function () {
        const $input = $(this).find('.edit-choice-input');
        const textVal = $input.val().trim();
        const isChecked = $(this).hasClass('correct');

        if (textVal !== "") {
            choices.push(textVal);
            if (isChecked) correctAnswer = textVal;
        }
    });

    $('#edit-choices').val(choices.join('///'));
    $('#edit-answer').val(correctAnswer);
};

// --- Main Image Gallery ---

window.syncEditImageGallery = function () {
    const $container = $("#edit-image-gallery-container");
    const $img = $("#edit-gallery-img");
    const $svg = $("#edit-gallery-svg-render");
    const $counter = $("#image-counter");

    if (window.editImageArray.length === 0) {
        $container.hide();
        return;
    }

    $container.show();
    const current = window.editImageArray[window.editImageIndex];

    $img.hide(); $svg.hide().empty();

    if (current.startsWith('<svg')) {
        $svg.html(current).show();
    } else {
        $img.attr('src', current.startsWith('data:') ? current : window.transformUrl(current)).show();
    }

    $counter.text(`${window.editImageIndex + 1} / ${window.editImageArray.length}`);
    window.syncImagesToHiddenInput();
};

window.removeCurrentImageFromGallery = function () {
    if (window.editImageArray.length === 0) return;
    window.editImageArray.splice(window.editImageIndex, 1);
    window.editImageIndex = Math.max(0, window.editImageIndex - 1);
    window.syncEditImageGallery();
};

window.handleMainImagesSelection = function (input) {
    if (!input.files || input.files.length === 0) return;
    const promises = [];
    for (let i = 0; i < input.files.length; i++) {
        promises.push(window.getBase64(input.files[i]));
    }
    Promise.all(promises).then(async base64Array => {
        const compressedArray = [];
        for (let b64 of base64Array) {
            const comp = await window.compressImage(b64, 800, 800);
            compressedArray.push(comp);
        }
        window.editImageArray = window.editImageArray.concat(compressedArray);
        window.editImageIndex = window.editImageArray.length - 1;
        window.syncEditImageGallery();
        input.value = '';
    });
};

window.syncImagesToHiddenInput = function () {
    const cleanImgs = window.editImageArray.map(u => u.trim()).filter(Boolean);
    $('#edit-img').val(cleanImgs.join('///'));
};

// --- Explanation Media Gallery ---

window.renderExplainMediaUI = function (mediaArray) {
    window.explainImageArray = (mediaArray || []).map(u => u.trim()).filter(Boolean);
    window.explainImageIndex = 0;
    window.syncExplainMediaGallery();
};

window.syncExplainMediaGallery = function () {
    const $container = $('#explain-media-gallery-container');
    const $img = $('#explain-gallery-img');
    const $svgRender = $('#explain-gallery-svg-render');
    const $pdfRender = $('#explain-gallery-pdf-render');
    const $counter = $('#explain-media-counter');

    if (window.explainImageArray.length === 0) {
        $container.hide();
        return;
    }

    $container.show();
    const current = window.explainImageArray[window.explainImageIndex];
    const type = window.getMediaType(current);

    $img.hide();
    $svgRender.hide().empty();
    $pdfRender.hide();

    if (type === 'pdf') {
        $('#explain-pdf-preview-link').attr('href', window.transformUrl(current));
        $pdfRender.show().css('display', 'flex');
    } else if (type === 'svg') {
        $svgRender.html(current).show();
    } else {
        $img.attr('src', current.startsWith('data:') ? current : window.transformUrl(current)).show();
    }

    $counter.text(`${window.explainImageIndex + 1} / ${window.explainImageArray.length}`);
    window.syncExplainMediaToHiddenInput();
};

window.removeCurrentExplainMediaFromGallery = function () {
    if (window.explainImageArray.length === 0) return;
    window.explainImageArray.splice(window.explainImageIndex, 1);
    window.explainImageIndex = Math.max(0, window.explainImageIndex - 1);
    window.syncExplainMediaGallery();
};

window.handleExplainMediaSelection = function (input) {
    if (!input.files || input.files.length === 0) return;
    (async () => {
        const compressedResults = [];
        for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            const base64 = await window.getBase64(file);
            if (file.type.includes('image/')) {
                const comp = await window.compressImage(base64, 800, 800);
                compressedResults.push(comp);
            } else if (file.type === 'application/pdf') {
                if (file.size > 10 * 1024 * 1024) {
                    Swal.fire('ข้อผิดพลาด', 'ขนาดเอกสาร PDF ต้องไม่เกิน 10MB', 'error');
                    continue;
                }
                compressedResults.push(base64);
            }
        }
        window.explainImageArray = window.explainImageArray.concat(compressedResults);
        window.explainImageIndex = window.explainImageArray.length - 1;
        window.syncExplainMediaGallery();
        input.value = '';
    })();
};

window.syncExplainMediaToHiddenInput = function () {
    const cleanMedia = window.explainImageArray.map(u => u.trim()).filter(Boolean);
    $('#edit-explain-media').val(cleanMedia.join('///'));
};

// --- Image Library Integration ---

window.openImageLibrary = function (targetType, rowId = null) {
    window.currentLibTarget = { type: targetType, rowId: rowId };
    const currentSubject = new URLSearchParams(window.location.search).get('subject') || '';
    $("#lib-subject-name").text(currentSubject);

    const libMap = {};
    window.APP.allQuestions.forEach(q => {
        const qSubj = window.getSubjectFromCategory(q.category);
        if (qSubj !== currentSubject) return;

        const catName = Array.isArray(q.category) ? q.category[0] : q.category;
        const extract = (str) => {
            if (!str) return;
            str.split('///').map(s => s.trim()).filter(Boolean).forEach(item => {
                if (item.includes('drive.google.com') || item.startsWith('<svg')) {
                    if (!libMap[catName]) libMap[catName] = new Set();
                    libMap[catName].add(item);
                }
            });
        };
        extract(q.img); extract(q.choices);
    });

    const $grid = $("#lib-grid-container").empty();
    Object.entries(libMap).forEach(([cat, items]) => {
        $grid.append(`<div style="grid-column: 1/-1; font-weight: bold; border-bottom: 1px solid #eee; padding: 5px 0; font-size: 0.95rem; margin-top: 10px;">${cat}</div>`);
        items.forEach(item => {
            let inner = item.startsWith('<svg') ? item : `<img src="${window.transformUrl(item)}" style="width:100%; height:100%; object-fit:contain;">`;
            const $item = $(`<div style="height: 160px; border: 1.5px solid #ddd; border-radius: 6px; cursor: pointer; background: white; padding: 5px; overflow: hidden; display: flex; align-items: center; justify-content: center;">${inner}</div>`);
            $item.on('click', () => window.selectFromLib(item));
            $grid.append($item);
        });
    });

    $("#quiz-image-library-modal").css("display", "flex").hide().fadeIn(200);
};

window.selectFromLib = function (content) {
    if (window.currentLibTarget.type === 'main') {
        if (!window.editImageArray.includes(content)) {
            window.editImageArray.push(content);
            window.editImageIndex = window.editImageArray.length - 1;
            window.syncEditImageGallery();
        }
    } else if (window.currentLibTarget.type === 'explain') {
        if (!window.explainImageArray.includes(content)) {
            window.explainImageArray.push(content);
            window.explainImageIndex = window.explainImageArray.length - 1;
            window.syncExplainMediaGallery();
        }
    } else {
        const $input = $("#" + window.currentLibTarget.rowId).find(".edit-choice-input");
        $input.val(content);
        window.renderEditChoicePreview($input);
        window.syncChoicesToHiddenInput();
    }
    $("#quiz-image-library-modal").fadeOut(200);
};

// --- Paste Handler ---

$(document).on('paste', function (e) {
    if (!$("#quiz-edit-modal").is(':visible')) return;

    let items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let $targetInput = $(document.activeElement);
    let isChoice = $targetInput.hasClass('edit-choice-input');
    let $row = isChoice ? $targetInput.closest('.choice-row') : null;

    for (let index in items) {
        let item = items[index];
        if (item.kind === 'file' && item.type.includes('image/')) {
            e.preventDefault();
            let blob = item.getAsFile();
            const localUrl = URL.createObjectURL(blob);

            window.getBase64(blob).then(async base64 => {
                const compressed = await window.compressImage(base64, 800, 800);
                if (isChoice) {
                    const rowId = $row.attr('id');
                    window.choiceImagesData[rowId] = { type: 'pending', data: compressed, blob: localUrl };
                    $targetInput.val('[IMAGE_PENDING]');
                    window.renderEditChoicePreview($targetInput);
                    window.syncChoicesToHiddenInput();
                } else {
                    // ตรวจสอบว่าแอดมินกำลังใช้งานอยู่ในแท็บ "คำอธิบาย" (t-explanation) หรือไม่
                    if ($('#t-explanation').hasClass('active')) {
                        // เก็บภาพเข้าคลังสื่อประกอบคำอธิบาย
                        window.explainImageArray.push(compressed);
                        window.explainImageIndex = window.explainImageArray.length - 1;
                        window.syncExplainMediaGallery();
                    } else {
                        // เก็บภาพเข้าคลังรูปภาพประกอบโจทย์หลักตามเดิม
                        window.editImageArray.push(compressed);
                        window.editImageIndex = window.editImageArray.length - 1;
                        window.syncEditImageGallery();
                    }
                }
            });
        }
    }
});

window.getBase64 = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => res(reader.result);
    reader.onerror = e => rej(e);
});

// --- AI Assistant ---

window.askAIForEdit = async function () {
    if (!window.ensureActiveSession()) return;
    const prob = $("#edit-problem").val().trim();
    if (!prob) return Swal.fire("กรุณากรอกโจทย์", "", "warning");

    const $btn = $("#btn-ask-ai");
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> AI Processing...');
    $("#ai-status-text").fadeIn();

    const choices = [];
    $("#dynamic-choices-container .edit-choice-input").each(function () {
        const txt = $(this).val();
        if (txt) choices.push(txt);
    });

    const payload = {
        action: 'askAIExpert',
        sessionToken: window.EDIT_SESSION.sessionToken,
        prompt: `คุณคืออาจารย์แพทย์ ช่วยเขียนคำอธิบายเฉลย (Explanation) 1 ย่อหน้าสั้นๆ สำหรับโจทย์: "${prob}" ตัวเลือก: ${choices.join(', ')}`,
        images: window.editImageArray.filter(i => i.startsWith('http'))
    };

    try {
        const res = await window.sendWithRetry(payload);
        if (res.result === 'success') {
            if (!res.answer) {
                Swal.fire("AI ไม่ส่งคำตอบกลับมา", "Gemini อาจกรองเนื้อหาออก โปรดลองใหม่หรือปรับโจทย์", "warning");
            } else {
                $("#edit-explanation").val(res.answer);
                // Switch to explanation tab so user sees the result
                const tabBtn = document.getElementById('tab-btn-explanation');
                if (tabBtn) window.switchEditModalTab(tabBtn, 't-explanation');
            }
        } else {
            Swal.fire("เกิดข้อผิดพลาดจากระบบหลังบ้าน", res.message || "ไม่สามารถเขียนคำอธิบายได้ขณะนี้", "error");
        }
    } catch (e) {
        console.error(e);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อกับระบบ AI ได้", "error");
    } finally {
        $btn.prop('disabled', false).html('<i class="fas fa-robot"></i> ใช้ AI ช่วยเขียน');
        $("#ai-status-text").hide();
    }
};

window.askAIForChoices = async function () {
    if (!window.ensureActiveSession()) return;
    const prob = $("#edit-problem").val().trim();
    if (!prob) return Swal.fire("กรุณากรอกโจทย์ก่อน", "", "warning");

    const maxChoices = Math.max(2, parseInt($('#ai-choice-count').val()) || 5);
    const $btn = $("#btn-ask-ai-choices");
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> AI กำลังแต่งตัวเลือก...');

    const filledChoices = [];
    $("#dynamic-choices-container .edit-choice-input").each(function () {
        const txt = $(this).val().trim();
        if (txt && txt !== '[IMAGE_PENDING]') filledChoices.push(txt);
    });

    const needCount = Math.max(0, maxChoices - filledChoices.length);
    if (needCount === 0) {
        $btn.prop('disabled', false).html('<i class="fas fa-magic"></i> AI เติมตัวเลือก');
        return Swal.fire("ตัวเลือกครบแล้ว", `มีตัวเลือกครบ ${maxChoices} ข้อแล้ว เพิ่มจำนวนในช่อง "ครบ X ข้อ" หากต้องการมากกว่านี้`, "info");
    }

    const payload = {
        action: 'askAIExpert',
        sessionToken: window.EDIT_SESSION.sessionToken,
        prompt: `คุณคืออาจารย์แพทย์ ช่วยแต่งตัวเลือก (Distractors) เพิ่มอีก ${needCount} ตัวเลือก (รวมเป็น ${maxChoices} ตัวเลือก) สำหรับโจทย์ทางการแพทย์นี้: "${prob}"\nตัวเลือกที่มีอยู่แล้วคือ: ${filledChoices.join(', ')}\nโปรดส่งเฉพาะตัวเลือกใหม่ ${needCount} ข้อกลับมาในรูปแบบ JSON Array ของสตริงเท่านั้น (ไม่มีคำนำ คั่น หรือ markdown เช่น \`\`\`json) ตัวอย่างเช่น: ["ตัวเลือก 1", "ตัวเลือก 2"]`,
        images: window.editImageArray.filter(i => i.startsWith('http'))
    };

    try {
        const res = await window.sendWithRetry(payload);
        if (res.result === 'success') {
            if (!res.answer) {
                return Swal.fire("AI ไม่ส่งคำตอบกลับมา", "โปรดลองใหม่อีกครั้ง", "warning");
            }
            let aiChoices = [];
            try {
                const cleanJson = res.answer.replace(/```json|```/g, '').trim();
                aiChoices = JSON.parse(cleanJson);
            } catch (e) {
                aiChoices = res.answer.split('\n').map(s => s.replace(/^[-*\d\.\s]+/g, '').trim()).filter(Boolean);
            }
            aiChoices = aiChoices.slice(0, needCount);

            if (Array.isArray(aiChoices) && aiChoices.length > 0) {
                let aiIdx = 0;
                $("#dynamic-choices-container .choice-row").each(function () {
                    const $input = $(this).find('.edit-choice-input');
                    if ($input.val().trim() === '' && aiIdx < aiChoices.length) {
                        $input.val(aiChoices[aiIdx]);
                        window.renderEditChoicePreview($input);
                        aiIdx++;
                    }
                });
                while (aiIdx < aiChoices.length) {
                    window.addEditChoiceRow(aiChoices[aiIdx], false);
                    aiIdx++;
                }
                window.syncChoicesToHiddenInput();
                Swal.fire({
                    icon: 'success',
                    title: 'เติมตัวเลือกสำเร็จ',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                Swal.fire("ไม่สามารถแปลงข้อมูลตัวเลือกได้", "รูปแบบคำตอบจาก AI ไม่ถูกต้อง", "warning");
            }
        } else {
            Swal.fire("เกิดข้อผิดพลาดจากระบบหลังบ้าน", res.message || "ไม่สามารถแต่งตัวเลือกได้ขณะนี้", "error");
        }
    } catch (err) {
        console.error(err);
        Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถเชื่อมต่อกับระบบ AI ได้ขณะนี้", "error");
    } finally {
        $btn.prop('disabled', false).html('<i class="fas fa-magic"></i> ให้ AI ช่วยเติมตัวเลือก');
    }
};

// --- Save Action ---

window.saveEditChanges = async function () {
    if (!window.ensureActiveSession()) return;
    const qId = $("#edit-q-id").val();
    const problem = $("#edit-problem").val().trim();
    const explainText = $("#edit-explanation").val().trim();
    const categories = JSON.parse($("#edit-category-hidden").val() || "[]");

    if (categories.length === 0) {
        return Swal.fire("แจ้งเตือน", "กรุณาระบุหัวข้อวิชาอย่างน้อย 1หัวข้อ", "warning");
    }

    // --- STEP 1: สร้าง Snapshot ข้อมูลก่อนปิดหน้าต่าง เพื่อส่งไปประมวลผลเบื้องหลัง (Memory Isolation) ---
    const mainImgsSnapshot = [...window.editImageArray];
    const explainMediaSnapshot = [...window.explainImageArray];
    const rowElements = $("#dynamic-choices-container .choice-row");

    const choicesBlueprint = [];
    const choicesOptimisticList = [];
    let answerOptimistic = "";

    for (let i = 0; i < rowElements.length; i++) {
        const $row = $(rowElements[i]);
        const rowId = $row.attr('id');
        const isCorrect = $row.hasClass('correct');
        const textVal = $row.find('.edit-choice-input').val().trim();
        const pendingUpload = window.choiceImagesData[rowId];

        // สำหรับหน้าจอแบบรวดเร็ว (Optimistic UI): ดึง blob หรือ base64 ท้องถิ่นขึ้นแสดงทันทีโดยไม่ต้องรอ Drive URL
        const localImgUrl = pendingUpload ? (pendingUpload.blob || pendingUpload.data) : textVal;

        choicesBlueprint.push({
            rowId,
            isCorrect,
            originalVal: textVal,
            pendingUpload: pendingUpload ? pendingUpload.data : null
        });

        if (localImgUrl && localImgUrl !== "") {
            choicesOptimisticList.push(localImgUrl);
            if (isCorrect) answerOptimistic = localImgUrl;
        }
    }

    // --- STEP 2: Optimistic UI Update (แสดงผลลัพธ์แก้ไขล่าสุดบนหน้าจอนิสิตทันทีระดับมิลลิวินาที) ---
    const localQ = window.APP.allQuestions.find(q => q.questionId === qId);
    if (localQ) {
        Object.assign(localQ, {
            problem: problem,
            explain: window.serializeExplain(explainText, explainMediaSnapshot),
            category: categories,
            img: mainImgsSnapshot.join('///'),
            choices: choicesOptimisticList.join('///'),
            answer: answerOptimistic
        });
    }

    // สั่งวาดหน้าจอแสดงข้อสอบ, ประวัติ และระบบค้นหาใหม่ทันที
    window.showQuestion(false);
    window.showSubmission($('#submission-filter').val());
    if ($('#search-input').val().trim() !== '' && $('#search-input').val().trim() !== '""') {
        window.performSearch();
    }

    // ปิดหน้าต่าง Modal เพื่อให้ทำข้อสอบต่อได้ทันที
    window.closeEditModal();

    // คำนวณจำนวนไฟล์ภาพทั้งหมดที่กำลังจะถูกซิงค์ในระบบเบื้องหลัง
    const pendingUploadCount = choicesBlueprint.filter(c => c.pendingUpload).length +
        mainImgsSnapshot.filter(img => img.startsWith('data:')).length +
        explainMediaSnapshot.filter(img => img.startsWith('data:')).length;

    window.bgToast.fire({
        icon: "info",
        title: pendingUploadCount > 0 ? `กำลังอัปโหลดรูปภาพเบื้องหลัง (${pendingUploadCount} ไฟล์)...` : "กำลังเชื่อมโยงฐานข้อมูลเบื้องหลัง...",
        timer: 3000
    });

    // --- STEP 3: ทำงานเบื้องหลัง (Background Thread Async Task) ---
    (async () => {
        try {
            // 3.1 ดำเนินการอัปโหลดไฟล์ภาพตัวเลือกที่ติดค้างอยู่ (Choices Upload)
            const finalChoices = [];
            let finalAnswer = "";

            for (const choice of choicesBlueprint) {
                let val = choice.originalVal;
                if (choice.pendingUpload) {
                    const res = await window.sendWithRetry({
                        action: 'uploadImage',
                        sessionToken: window.EDIT_SESSION.sessionToken,
                        data: { base64: choice.pendingUpload, questionId: qId, type: 'Choice' }
                    });
                    val = res.url;
                }
                if (val && val !== "") {
                    finalChoices.push(val);
                    if (choice.isCorrect) finalAnswer = val;
                }
            }

            // 3.2 ดำเนินการอัปโหลดไฟล์รูปภาพโจทย์ (Main Images Upload)
            const finalMainImgs = [];
            for (let img of mainImgsSnapshot) {
                if (img.startsWith('data:')) {
                    const res = await window.sendWithRetry({
                        action: 'uploadImage',
                        sessionToken: window.EDIT_SESSION.sessionToken,
                        data: { base64: img, questionId: qId, type: 'Main' }
                    });
                    finalMainImgs.push(res.url);
                } else {
                    finalMainImgs.push(img);
                }
            }

            // 3.3 ดำเนินการอัปโหลดไฟล์สื่อประกอบคำอธิบาย (Explain Media Upload)
            const finalExplainMedia = [];
            for (let media of explainMediaSnapshot) {
                if (media.startsWith('data:')) {
                    const isPdf = media.includes('application/pdf');
                    const res = await window.sendWithRetry({
                        action: 'uploadImage',
                        sessionToken: window.EDIT_SESSION.sessionToken,
                        data: { base64: media, questionId: qId, type: isPdf ? 'Explain' : 'Explain' }
                    });
                    finalExplainMedia.push(res.url);
                } else {
                    finalExplainMedia.push(media);
                }
            }

            const serializedExplain = window.serializeExplain(explainText, finalExplainMedia);

            // 3.4 ส่งชุดคำสั่งอัปเดตข้อมูลทั้งหมดลงฐานแผ่นงาน Google Sheets
            const res = await window.sendWithRetry({
                action: 'editQuestion',
                sessionToken: window.EDIT_SESSION.sessionToken,
                data: {
                    id: qId,
                    problem: problem,
                    explain: serializedExplain,
                    category: categories,
                    img: finalMainImgs.join('///'),
                    choices: finalChoices.join('///'),
                    answer: finalAnswer
                }
            });

            if (res.result === "success") {
                // ซิงค์บันทึก URL จริงของฝั่งเซิร์ฟเวอร์ทับข้อมูลจำลองในเครื่องเพื่อความถูกต้องถาวร
                if (localQ) {
                    Object.assign(localQ, {
                        explain: serializedExplain,
                        img: finalMainImgs.join('///'),
                        choices: finalChoices.join('///'),
                        answer: finalAnswer
                    });
                }

                await window.syncQuestionsToCache();

                // วาดการแสดงผลใหม่อีกครั้งอย่างเงียบๆ (Silent Re-render) ด้วยข้อมูล URL สมบูรณ์
                window.showQuestion(false);
                window.showSubmission($('#submission-filter').val());

                window.bgToast.fire({
                    icon: "success",
                    title: `บันทึกและเชื่อมโยงข้อสอบ ${qId} สำเร็จ!`,
                    timer: 2000
                });
            }
        } catch (err) {
            console.error("Background sync failed for question:", qId, err);
            window.bgToast.fire({
                icon: "error",
                title: `ซิงค์ข้อสอบ ${qId} ล้มเหลว!`,
                text: err.message,
                timer: 6000
            });
        }
    })();
};

// --- UI Bindings ---

$(function () {
    $(document).on('click', '#btn-edit-current-q', () => window.openEditModal());
    $(document).on('input', '.edit-choice-input', function () { window.renderEditChoicePreview($(this)); });

    $("#edit-prev-img").on('click', function () {
        if (window.editImageArray.length > 1) {
            window.editImageIndex = (window.editImageIndex - 1 + window.editImageArray.length) % window.editImageArray.length;
            window.syncEditImageGallery();
        }
    });
    $("#edit-next-img").on('click', function () {
        if (window.editImageArray.length > 1) {
            window.editImageIndex = (window.editImageIndex + 1) % window.editImageArray.length;
            window.syncEditImageGallery();
        }
    });

    $("#prev-explain-media-btn").on('click', function () {
        if (window.explainImageArray.length > 1) {
            window.explainImageIndex = (window.explainImageIndex - 1 + window.explainImageArray.length) % window.explainImageArray.length;
            window.syncExplainMediaGallery();
        }
    });
    $("#next-explain-media-btn").on('click', function () {
        if (window.explainImageArray.length > 1) {
            window.explainImageIndex = (window.explainImageIndex + 1) % window.explainImageArray.length;
            window.syncExplainMediaGallery();
        }
    });
});