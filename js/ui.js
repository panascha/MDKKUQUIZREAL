// REFACTOR/js/ui.js

// =========================================================
// I. Global Helper Functions (ขอบเขตส่วนกลาง)
// =========================================================

window.getCategoryNameById = function (categoryId) {
    if (!window.APP.globalStructure.category) return categoryId;
    const found = window.APP.globalStructure.category.find(t => t.categoryId === categoryId);
    return found ? found.categoryName : categoryId;
};

window.displayAnswerContent = function (text) {
    if (!text) return "";
    const trimmed = text.trim();
    if (trimmed.includes('drive.google.com')) {
        return `<img src="${window.transformUrl(trimmed)}" style="height:50px; vertical-align:middle;">`;
    }
    if (trimmed.startsWith('<svg')) {
        return `<div class="svg-choice-container" style="display:inline-block; width:50px; height:50px; vertical-align:middle;">${trimmed}</div>`;
    }
    return trimmed;
};

window.getSubjectFromCategory = function (category) {
    if (!category) return "";
    const catId = Array.isArray(category) ? category[0] : category;
    const catObj = window.APP.globalStructure.category.find(c => c.categoryId === catId);
    return catObj ? catObj.subjectRef : "";
};

window.getSelectedCategoryNames = function () {
    if (window.APP.filterMode === "category") {
        return window.APP.globalStructure.category
            .filter(t => $(`input[data-category-id="${t.categoryId}"]`).is(':checked'))
            .map(t => t.categoryName);
    } else {
        const selectedYears = $('input[type="checkbox"][name="filter-year"]:checked').map(function () { return "ปี " + this.value; }).get();
        const selectedGroups = $('input[type="checkbox"][name="filter-examgroup"]:checked').map(function () { return this.value; }).get();
        const selectedSuffixes = $('input[type="checkbox"][name="filter-suffix"]:checked').map(function () { return this.value; }).get();
        return [...selectedYears, ...selectedGroups, ...selectedSuffixes];
    }
};

window.currentZoom = 100;

window.applyZoom = function () {
    $('html').css('font-size', window.currentZoom + '%');
    window.bgToast.fire({
        icon: 'info',
        title: `ระดับการซูม: ${window.currentZoom}%`,
        timer: 1000
    });
};

window.updateImageGallery = function () {
    const $prevBtn = $('#prev-img-btn');
    const $nextBtn = $('#next-img-btn');
    const $counter = $('#image-counter');
    const $imageContainer = $('#image-container-div');
    const $questionImage = $('#question-image');

    if (window.APP.currentImageArray.length === 0) {
        $imageContainer.hide();
        return;
    }

    const currentUrl = window.transformUrl(window.APP.currentImageArray[window.APP.currentImageIndex]);

    if (!currentUrl) {
        $imageContainer.hide();
    } else {
        $imageContainer.show();
        $questionImage.attr('src', currentUrl).show();
    }

    if (window.APP.currentImageArray.length > 1) {
        $prevBtn.show();
        $nextBtn.show();
        $counter.show().text(`${window.APP.currentImageIndex + 1} / ${window.APP.currentImageArray.length}`);
    } else {
        $prevBtn.hide();
        $nextBtn.hide();
        $counter.hide();
    }
};

// =========================================================
// II. Metadata Parser & Dynamic Attribute Filtering UI (NEW)
// =========================================================

window.parseQuestionMetadata = function (q) {
    const defaultCat = q.category && q.category[0] ? q.category[0] : "";
    const standardizedCat = q.category && q.category[1] ? q.category[1] : "";

    let year = "N/A";
    let examGroup = "N/A";
    let suffix = "CLINICAL"; // default fallback
    let topic = "N/A";

    // 1. แยก Year และ ExamGroup จาก Default_CategoryID
    const defaultParts = defaultCat.split('_');
    if (defaultParts.length >= 2) {
        const yearGroupStr = defaultParts[1]; // e.g., "51MCQ1"
        const match = yearGroupStr.match(/^(\d+)(.*)$/); // capture ตัวเลข 2 หลักแรก
        if (match) {
            year = match[1];      // "51"
            examGroup = match[2]; // "MCQ1"
        } else {
            examGroup = yearGroupStr;
        }
    }

    // 2. แยก SubGroupSuffix จาก Standardized_CategoryID
    const stdParts = standardizedCat.split('_');
    if (stdParts.length >= 3) {
        suffix = stdParts[1]; // e.g., "ANA"
    } else {
        const upperStd = standardizedCat.toUpperCase();
        const knownSuffixes = ["ANA", "BIOCHEM", "PHYSIO", "MICRO", "PARASITO", "PATHO", "PHARM", "RADIO", "CLINICAL"];
        for (const s of knownSuffixes) {
            if (upperStd.includes(`_${s}_`) || upperStd.includes(`_${s}`)) {
                suffix = s;
                break;
            }
        }
    }

    // 3. สกัดหา Topic Name (ข้อความหลังเครื่องหมาย _ ลำดับสุดท้ายของหมวดหมู่หัวข้อที่ตรงที่สุด)
    if (q.category) {
        const cats = Array.isArray(q.category) ? q.category : [q.category];
        let bestCat = cats.find(c => {
            const parts = c.split('_');
            return parts.length >= 3 && !c.endsWith('_Extracted') && !c.includes('_by AI_');
        });
        if (!bestCat) {
            bestCat = cats.find(c => c.split('_').length >= 3);
        }
        if (!bestCat && cats.length > 0) {
            bestCat = cats[0];
        }
        if (bestCat) {
            const parts = bestCat.split('_');
            topic = parts[parts.length - 1];
        }
    }

    return { year, examGroup, suffix, topic };
};

window.renderAttributeFilterUI = function () {
    const $container = $('#attribute-filter-area');
    if (!$container.length) return;

    // 1. ดึงสถานะการเลือกปัจจุบันไว้ก่อน เพื่อนำไปติ๊กซ้ำหลังจากเขียน HTML ใหม่ (Cascading States)
    const selectedYears = $('input[type="checkbox"][name="filter-year"]:checked').map(function () { return this.value; }).get();
    const selectedGroups = $('input[type="checkbox"][name="filter-examgroup"]:checked').map(function () { return this.value; }).get();
    const selectedSuffixes = $('input[type="checkbox"][name="filter-suffix"]:checked').map(function () { return this.value; }).get();
    const selectedTopics = $('input[type="checkbox"][name="filter-topic"]:checked').map(function () { return this.value; }).get();

    // ตัวตรวจสอบเงื่อนไขความสอดคล้อง (Faceted Search Helpers)
    const matchYear = (meta, selected) => selected.length === 0 || selected.includes(meta.year);
    const matchGroup = (meta, selected) => selected.length === 0 || selected.includes(meta.examGroup);
    const matchSuffix = (meta, selected) => selected.length === 0 || selected.includes(meta.suffix);
    const matchTopic = (meta, selected) => selected.length === 0 || selected.includes(meta.topic);

    const availableYears = new Set();
    const availableGroups = new Set();
    const availableSuffixes = new Set();
    const availableTopics = new Set();
    const topicToSuffix = {}; // ตารางจับคู่ Topic Name -> Suffix เพื่อทำไฮไลต์สี

    // 2. คำนวณหา Facet และสร้างโครงสร้างจับคู่ความสัมพันธ์ของวิชากับหัวข้อย่อย
    window.APP.allQuestions.forEach(q => {
        const meta = window.parseQuestionMetadata(q);

        if (meta.topic !== "N/A" && meta.suffix !== "N/A") {
            topicToSuffix[meta.topic] = meta.suffix;
        }

        if (matchGroup(meta, selectedGroups) && matchSuffix(meta, selectedSuffixes) && matchTopic(meta, selectedTopics)) {
            if (meta.year !== "N/A") availableYears.add(meta.year);
        }
        if (matchYear(meta, selectedYears) && matchSuffix(meta, selectedSuffixes) && matchTopic(meta, selectedTopics)) {
            if (meta.examGroup !== "N/A") availableGroups.add(meta.examGroup);
        }
        if (matchYear(meta, selectedYears) && matchGroup(meta, selectedGroups) && matchTopic(meta, selectedTopics)) {
            if (meta.suffix !== "N/A") availableSuffixes.add(meta.suffix);
        }
        if (matchYear(meta, selectedYears) && matchGroup(meta, selectedGroups) && matchSuffix(meta, selectedSuffixes)) {
            if (meta.topic !== "N/A") availableTopics.add(meta.topic);
        }
    });

    const sortedYears = Array.from(availableYears).sort();
    const sortedExamGroups = Array.from(availableGroups).sort();
    const sortedSuffixes = Array.from(availableSuffixes).sort();
    const sortedTopics = Array.from(availableTopics).sort();

    function getSuffixColorClass(suffix) {
        const s = suffix.toUpperCase();
        if (s.includes("RADIO") || s.includes("CLINICAL")) return "cat-clinical";
        if (s.includes("ANATOMY") || s.includes("ANA")) return "cat-anatomy";
        if (s.includes("PARASITO") || s.includes("MICRO")) return "cat-micro";
        if (s.includes("PATHO")) return "cat-patho";
        if (s.includes("PHYSIO") || s.includes("BIOCHEM")) return "cat-physio";
        if (s.includes("PHARM")) return "cat-pharm";
        return "cat-non";
    }

    const isChecked = (arr, val) => arr.includes(val) ? 'checked' : '';

    let html = `
        <div class="filter-group-container" style="display: flex; flex-direction: column; gap: 14px; text-align: left; background: var(--color-surface-2); padding: 18px; border-radius: var(--border-radius); border: 1px solid var(--color-border); box-sizing: border-box; width:100%;">
            
            <!-- 1. เลือกปีข้อสอบ -->
            <div>
                <h4 style="margin: 0 0 10px 0; font-size: 1.15rem; font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary); padding-left: 8px;">1. เลือกปีข้อสอบ (Year)</h4>
                <div class="button-grid" id="attr-year-grid">
                    ${sortedYears.map(y => `
                        <label class="category-label">
                            <input type="checkbox" name="filter-year" id="filter-year-${y}" value="${y}" ${isChecked(selectedYears, y)} style="display: none;">
                            <span class="toggle-button cat-non">ปี ${y}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <!-- 2. เลือกประเภทข้อสอบ -->
            <div>
                <h4 style="margin: 14px 0 10px 0; font-size: 1.15rem; font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary); padding-left: 8px;">2. เลือกประเภทข้อสอบ (Exam Group)</h4>
                <div class="button-grid" id="attr-group-grid">
                    ${sortedExamGroups.map(eg => `
                        <label class="category-label">
                            <input type="checkbox" name="filter-examgroup" id="filter-examgroup-${eg}" value="${eg}" ${isChecked(selectedGroups, eg)} style="display: none;">
                            <span class="toggle-button cat-non">${eg}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <!-- 3. เลือกรายวิชาเฉพาะทาง -->
            <div>
                <h4 style="margin: 14px 0 10px 0; font-size: 1.15rem; font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary); padding-left: 8px;">3. เลือกหัวข้อวิชาเฉพาะทาง (SubGroup Suffix)</h4>
                <div class="button-grid" id="attr-suffix-grid">
                    ${sortedSuffixes.map(s => {
        const colorClass = getSuffixColorClass(s);
        return `
                            <label class="category-label">
                                <input type="checkbox" name="filter-suffix" id="filter-suffix-${s}" value="${s}" ${isChecked(selectedSuffixes, s)} style="display: none;">
                                <span class="toggle-button ${colorClass}">${s}</span>
                            </label>
                        `;
    }).join('')}
                </div>
            </div>

            <!-- 4. เลือกหัวข้อย่อยเฉพาะ (Topic Name) -->
            <div>
                <h4 style="margin: 14px 0 10px 0; font-size: 1.15rem; font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary); padding-left: 8px;">4. เลือกหัวข้อย่อย (Topic Name)</h4>
                <div class="button-grid" id="attr-topic-grid" style="max-height: 250px; overflow-y: auto; padding: 5px; border: 1px solid var(--color-border-soft); border-radius: 6px; background: var(--color-surface);">
                    ${sortedTopics.map(t => {
        const mappedSuffix = topicToSuffix[t] || "N/A";
        const colorClass = getSuffixColorClass(mappedSuffix);
        return `
                            <label class="category-label">
                                <input type="checkbox" name="filter-topic" id="filter-topic-${t.replace(/"/g, '&quot;')}" value="${t.replace(/"/g, '&quot;')}" ${isChecked(selectedTopics, t)} style="display: none;">
                                <span class="toggle-button ${colorClass}" style="font-size: 0.95rem; padding: 6px 12px; border-radius: 12px;">${t}</span>
                            </label>
                        `;
    }).join('')}
                </div>
            </div>

        </div>
    `;

    $container.html(html);

    // ตรวจสอบการกดติ๊กช่องตัวเลือก ยิงคำสั่งอัปเดตเซตคำถาม และอัปเดตตัวกรอง cascading ทันที
    $('input[type="checkbox"][name^="filter-"]').off('change').on('change', function () {
        window.updateQuestionSet();
        window.updateSelectedCategoryStatus();
        window.renderAttributeFilterUI(); // รีเรนเดอร์เพื่ออัปเดต Cascading Choices
    });
};

window.setFilterMode = function (mode) {
    window.APP.filterMode = mode;
    if (mode === "category") {
        $('#btn-mode-category').addClass('btn-dark').removeClass('btn-light').css('background-color', '');
        $('#btn-mode-filter').addClass('btn-light').removeClass('btn-dark').css('background-color', '#4b5563');
        $('#dynamic-accordion-area').show();
        $('#attribute-filter-area').hide();
    } else {
        $('#btn-mode-filter').addClass('btn-dark').removeClass('btn-light').css('background-color', '');
        $('#btn-mode-category').addClass('btn-light').removeClass('btn-dark').css('background-color', '#4b5563');
        $('#dynamic-accordion-area').hide();
        $('#attribute-filter-area').show();

        // ถ้าแผง UI ตัวกรองละเอียดยังว่างอยู่ ให้ทำการสร้างมันขึ้นมา
        if (!$('#attribute-filter-area').children().length) {
            window.renderAttributeFilterUI();
        }
    }
    window.updateQuestionSet();
    window.updateSelectedCategoryStatus();
};

window.clearAllAttributeFilters = function () {
    $('input[type="checkbox"][name^="filter-"]').prop('checked', false);
    window.updateQuestionSet();
    window.updateSelectedCategoryStatus();
};

window.uncheckAttributeFilter = function (type, value) {
    const el = document.getElementById(`filter-${type}-${value}`);
    if (el) {
        $(el).prop('checked', false).trigger('change');
    }
};

window.renderAccordionUI = function (data) {
    const $container = $('#dynamic-accordion-area');
    $container.empty();

    const categoryStats = {};
    if (typeof window.APP.allQuestions !== 'undefined' && window.APP.allQuestions.length > 0) {
        window.APP.allQuestions.forEach(q => {
            const cats = Array.isArray(q.category) ? q.category : [q.category];
            const realCats = cats.filter(c => c && c !== 'Uncategorized');
            const isSplit = realCats.length > 1;
            realCats.forEach(catId => {
                if (!categoryStats[catId]) categoryStats[catId] = { total: 0, split: 0 };
                categoryStats[catId].total++;
                if (isSplit) categoryStats[catId].split++;
            });
        });
    }

    function getCategoryColorClass(catId) {
        const id = catId.toUpperCase();
        let t = id.includes("_EXTRACTED") ? id.split("_EXTRACTED")[0].split("_").pop() : id;
        if (t.includes("RADIO") || t.includes("CLINICAL")) return "cat-clinical";
        if (t.includes("ANATOMY") || t.includes("ANA")) return "cat-anatomy";
        if (t.includes("PARASITO") || t.includes("MICRO")) return "cat-micro";
        if (t.includes("PATHO")) return "cat-patho";
        if (t.includes("PHYSIO") || t.includes("BIOCHEM")) return "cat-physio";
        if (t.includes("PHARM")) return "cat-pharm";
        return "cat-non";
    }

    const SUBGROUPS = ["ANA", "BIOCHEM", "PHYSIO", "MICRO", "PARASITO", "PATHO", "PHARM", "RADIO", "CLINICAL"];

    function isLectureCategory(catId) {
        const upper = catId.toUpperCase();
        const parts = upper.split('_');
        for (let i = 1; i < parts.length; i++) {
            if (SUBGROUPS.some(sg => parts[i].includes(sg))) return true;
        }
        return false;
    }

    function buildCategoryButton(category, isExcludedGroup) {
        const stats = categoryStats[category.categoryId] || { total: 0, split: 0 };
        const colorClass = getCategoryColorClass(category.categoryId);
        let displayCount;
        let badgeStyle = "";
        if (isExcludedGroup) {
            displayCount = `(${stats.total})`;
        } else {
            const isComplete = stats.split >= stats.total && stats.total > 0;
            badgeStyle = isComplete ? "color: #16a34a;" : "color: #dc2626; font-weight: 800;";
            displayCount = `(${stats.split}/${stats.total})`;
        }
        return `
            <label class="category-label">
                <input type="checkbox" name="category" id="cat-${category.categoryId}" data-category-id="${category.categoryId}" value="${category.categoryId}" style="display: none;">
                <span class="toggle-button ${colorClass}">${category.categoryName} <span style="${badgeStyle}">${displayCount}</span></span>
            </label>
        `;
    }

    function buildAccordion(groupName, categories, isExcludedGroup) {
        const helperText = !isExcludedGroup ? " (คำถามที่แยกเลคแล้ว/คำถามทั้งหมด)" : "";
        const btns = categories.map(c => buildCategoryButton(c, isExcludedGroup)).join('');
        return `
            <details class="accordion-group">
                <summary class="accordion-header">
                    ${groupName} <span style="font-size: 0.85rem; font-weight: normal; margin-left: 5px; color: var(--color-text-muted);">${helperText}</span>
                    <span class="selected-count-badge">0</span>
                </summary>
                <div class="button-grid">
                    ${btns}
                </div>
            </details>
        `;
    }

    const groups = {};
    data.category.forEach(cat => {
        const key = cat.accordionGroup || 'Uncategorized';
        if (!groups[key]) groups[key] = [];
        groups[key].push(cat);
    });

    const MCQ_PATTERN = /MCQ\d+/i;
    const FMT_PATTERN = /FMT\d+/i;

    const superGroups = {};
    const standaloneAccordions = [];

    Object.entries(groups).forEach(([groupName, categories]) => {
        const isExcluded = groupName.includes("LEC") ||
            groupName.includes("by AI") ||
            groupName.includes("(Extracted)") ||
            categories.some(c => c.categoryName.includes("MODULE")) ||
            categories.some(c => c.categoryName.includes("COMMED"));

        const firstCat = categories[0];
        const subjectId = firstCat ? (firstCat.subjectRef || '') : '';

        if (MCQ_PATTERN.test(groupName)) {
            const key = `${subjectId}|MCQ`;
            if (!superGroups[key]) superGroups[key] = {
                label: `${subjectId} MCQ`,
                variant: 'mcq',
                subjectId,
                isExcluded,
                accordions: []
            };
            superGroups[key].accordions.push({ groupName, categories, isExcluded });
        } else if (FMT_PATTERN.test(groupName)) {
            const key = `${subjectId}|FMT`;
            if (!superGroups[key]) superGroups[key] = {
                label: `${subjectId} FMT`,
                variant: 'mcq',
                subjectId,
                isExcluded,
                accordions: []
            };
            superGroups[key].accordions.push({ groupName, categories, isExcluded });
        } else if (
            (groupName.toUpperCase().includes("LEC") ||
            categories.some(c => isLectureCategory(c.categoryId))) &&
            !groupName.toUpperCase().includes("BY AI")
        ) {
            const key = `${subjectId}|LEC`;
            if (!superGroups[key]) superGroups[key] = {
                label: `${subjectId} Lecture`,
                variant: 'lec',
                subjectId,
                isExcluded: false,
                accordions: []
            };
            superGroups[key].accordions.push({ groupName, categories, isExcluded });
        } else {
            standaloneAccordions.push({ groupName, categories, isExcluded });
        }
    });

    standaloneAccordions.forEach(({ groupName, categories, isExcluded }) => {
        $container.append(buildAccordion(groupName, categories, isExcluded));
    });

    Object.values(superGroups).forEach(sg => {
        if (sg.accordions.length === 1) {
            const { groupName, categories, isExcluded } = sg.accordions[0];
            $container.append(buildAccordion(groupName, categories, isExcluded));
            return;
        }

        const innerHtml = sg.accordions
            .map(({ groupName, categories, isExcluded }) =>
                buildAccordion(groupName, categories, isExcluded))
            .join('');

        const icon = sg.variant === 'lec'
            ? '<i class="fas fa-book-open"></i>'
            : '<i class="fas fa-graduation-cap"></i>';

        const html = `
            <div class="super-group">
                <div class="super-group-header ${sg.variant === 'lec' ? 'lec-header' : 'mcq-header'}" onclick="window.toggleSuperGroup(this)">
                    ${icon}
                    <span>${sg.label}</span>
                    <span class="super-group-badge" style="display: none;">0</span>
                    <i class="fas fa-chevron-down super-group-arrow" style="margin-left: auto;"></i>
                </div>
                <div class="super-group-body">
                    ${innerHtml}
                </div>
            </div>
        `;
        $container.append(html);
    });

    $('input[type="checkbox"][name="category"]').on('change', () => {
        window.updateQuestionSet();
        window.updateSelectedCategoryStatus();
        window.updateSuperGroupBadges();
    });
};

window.toggleSuperGroup = function (headerEl) {
    const $header = $(headerEl);
    const $body = $header.next('.super-group-body');
    const isOpen = $body.hasClass('open');
    $body.toggleClass('open', !isOpen);
    $header.toggleClass('open', !isOpen);
};

window.updateSuperGroupBadges = function () {
    $('.super-group').each(function () {
        const $sg = $(this);
        const totalChecked = $sg.find('input[type="checkbox"]:checked').length;
        const $badge = $sg.find('> .super-group-header .super-group-badge');
        if (totalChecked > 0) {
            $badge.text(totalChecked).show();
        } else {
            $badge.hide();
        }
    });
};

window.updateSelectedCategoryStatus = function () {
    const $status = $('#selected-category-status');
    $status.empty();

    if (window.APP.filterMode === "category") {
        const selected = $('input[type="checkbox"][name="category"]:checked');
        if (selected.length === 0) {
            $status.html('<p class="small-text" style="color: #999; margin:0;">ยังไม่ได้เลือกหัวข้อ</p>');
        } else {
            $status.append(`<button class="btn-clear-all" onclick="window.clearAllCategories()"><i class="fas fa-trash-alt"></i> ล้างทั้งหมด (${selected.length})</button>`);

            selected.each(function () {
                const categoryId = $(this).data('category-id');
                const categoryObj = window.APP.globalStructure.category.find(c => c.categoryId === categoryId);
                const labelName = categoryObj ? categoryObj.categoryName : categoryId;

                $status.append(`
                    <button class="status-category-button" title="คลิกเพื่อเอาออก" 
                            onclick="window.uncheckCategory('${categoryId.replace(/'/g, "\\'")}')">
                        ${labelName} <i class="fas fa-times"></i>
                    </button>
                `);
            });
        }

        $('.accordion-group').each(function () {
            const $group = $(this);
            const totalInGroup = $group.find('input[type="checkbox"]').length;
            const checkedInGroup = $group.find('input[type="checkbox"]:checked').length;
            const $badge = $group.find('.selected-count-badge');

            if (checkedInGroup > 0) {
                $badge.text(`${checkedInGroup}/${totalInGroup}`).fadeIn(200);
                $group.css('border-color', 'var(--color-primary)');
            } else {
                $badge.hide();
                $group.css('border-color', '#ddd');
            }
        });
    } else {
        // โหมดสุมเลือกคัดแยกละเอียด Year, Group, Suffix, Topic Status display
        const selectedYears = $('input[type="checkbox"][name="filter-year"]:checked');
        const selectedGroups = $('input[type="checkbox"][name="filter-examgroup"]:checked');
        const selectedSuffixes = $('input[type="checkbox"][name="filter-suffix"]:checked');
        const selectedTopics = $('input[type="checkbox"][name="filter-topic"]:checked');

        const totalSelected = selectedYears.length + selectedGroups.length + selectedSuffixes.length + selectedTopics.length;

        if (totalSelected === 0) {
            $status.html('<p class="small-text" style="color: #999; margin:0;">ยังไม่ได้เลือกตัวกรองละเอียด</p>');
        } else {
            $status.append(`<button class="btn-clear-all" onclick="window.clearAllAttributeFilters()"><i class="fas fa-trash-alt"></i> ล้างตัวกรองทั้งหมด (${totalSelected})</button>`);

            selectedYears.each(function () {
                const val = this.value;
                $status.append(`<button class="status-category-button" onclick="window.uncheckAttributeFilter('year', '${val}')">ปี: ${val} <i class="fas fa-times"></i></button>`);
            });
            selectedGroups.each(function () {
                const val = this.value;
                $status.append(`<button class="status-category-button" onclick="window.uncheckAttributeFilter('examgroup', '${val}')">กลุ่ม: ${val} <i class="fas fa-times"></i></button>`);
            });
            selectedSuffixes.each(function () {
                const val = this.value;
                $status.append(`<button class="status-category-button" onclick="window.uncheckAttributeFilter('suffix', '${val}')">วิชา: ${val} <i class="fas fa-times"></i></button>`);
            });
            selectedTopics.each(function () {
                const val = this.value;
                $status.append(`<button class="status-category-button" onclick="window.uncheckAttributeFilter('topic', '${val.replace(/'/g, "\\'")}')">หัวข้อ: ${val} <i class="fas fa-times"></i></button>`);
            });
        }
    }

    window.updateProgressHeader();
};

window.uncheckCategory = function (categoryId) {
    const el = document.getElementById(`cat-${categoryId}`);
    if (el) {
        $(el).prop('checked', false).trigger('change');
    }
};

window.viewFullImage = function (url, event) {
    if (event) event.stopPropagation();
    Swal.fire({
        imageUrl: url,
        imageAlt: 'Full size image',
        width: '90%',
        showCloseButton: true,
        showConfirmButton: false,
        background: 'rgba(0,0,0,0.8)',
        customClass: {
            image: 'img-fluid animate__animated animate__zoomIn'
        }
    });
};

window.viewFullImageSVG = function (el, event) {
    if (event) event.stopPropagation();
    const svgHtml = $(el).html();
    Swal.fire({
        html: `<div style="padding:20px; background:white; border-radius:10px;">${svgHtml}</div>`,
        width: '80%',
        showConfirmButton: false,
        showCloseButton: true
    });
};

window.clearAllCategories = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectParam = urlParams.get('subject') || 'default';
    const sessionKey = `session_state_${subjectParam}`;

    Swal.fire({
        title: 'เริ่มใหม่ทั้งหมด?',
        text: "คะแนนและความคืบหน้าปัจจุบันจะถูกล้างทิ้งถาวร",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, เริ่มใหม่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const db = await window.openDB();
                const transaction = db.transaction("quiz_cache", "readwrite");
                const store = transaction.objectStore("quiz_cache");
                await store.delete(sessionKey);

                $('input[type="checkbox"][name="category"]').prop('checked', false);

                location.reload();
            } catch (e) {
                console.error("Clear cache failed", e);
                location.reload();
            }
        }
    });
};

// =========================================================
// II. Event Listeners & Initialization (ส่วนจัดการเหตุการณ์)
// =========================================================

$(function () {
    // --- กู้คืนชุดโค้ดควบคุมระบบ Index Panel ---
    $('#index-panel-header').on('click', function () {
        const $grid = $('#index-grid-container');
        const $icon = $('#index-panel-toggle-icon');
        const isOpen = $grid.hasClass('open');

        if (isOpen) {
            $grid.removeClass('open');
            $icon.removeClass('open');
        } else {
            $grid.addClass('open');
            $icon.addClass('open');
            window.renderIndexPanel();
        }
    });

    // --- ควบคุมหน้าต่างป๊อปอัปย่อย (Modals UI Controls) ---
    $('#save').on('click', function () {
        $('#pdf-choice-modal').fadeIn();
    });

    $('#close-pdf-modal-btn').on('click', function () {
        $('#pdf-choice-modal').fadeOut();
    });

    $('#export-format-select').on('change', function () {
        if ($(this).val() === 'omr') {
            $('#omr-extras').slideDown();
        } else {
            $('#omr-extras').slideUp();
        }
    });

    $('#show-progress-modal-btn').on('click', () => {
        $('#progress-modal-card').fadeIn();
    });

    $('#close-progress-modal').on('click', () => {
        $('#progress-modal-card').fadeOut();
    });

    $('#donate-coffee-btn').on('click', () => {
        $('#donate-modal-card').fadeIn();
    });

    $('#close-donate-modal').on('click', () => {
        $('#donate-modal-card').fadeOut();
    });

    // --- จัดการปุ่มสลับการซูมและควบคุมตำแหน่งสกรอลล์ ---
    $('#zoom-in-btn').on('click', function () {
        if (window.currentZoom < window.maxZoom) {
            window.currentZoom += window.zoomStep;
            window.applyZoom();
        }
    });

    $('#zoom-out-btn').on('click', function () {
        if (window.currentZoom > window.minZoom) {
            window.currentZoom -= window.zoomStep;
            window.applyZoom();
        }
    });

    $('#scroll-to-search-btn').on('click', function () {
        $('html, body').animate({
            scrollTop: $("#search-section").offset().top
        }, 800);
    });

    $('#scroll-to-quiz-btn').on('click', function () {
        $('html, body').animate({
            scrollTop: $("#quiz-container").offset().top
        }, 800);
    });

    // --- แผงปุ่มดาวน์โหลดเอกสาร PDF จาก Modal ---
    $('#save-results-pdf-btn').on('click', () => {
        const selectedCats = window.getSelectedCategoryNames().join(' / ');
        window.sendActivityLog('DOWNLOAD_PDF_RESULT', "", selectedCats, "Format: Result");
        window.saveResultsToPdf();
        $('#pdf-choice-modal').fadeOut();
    });

    $('#save-practice-pdf-btn').off('click').on('click', () => {
        $('#pdf-choice-modal').fadeOut();

        const selectedCats = window.getSelectedCategoryNames().join(' / ');
        const format = $('#export-format-select').val();
        window.sendActivityLog('DOWNLOAD_PDF_PRACTICE', "", selectedCats, `Format: ${format}`);

        window.savePracticeSheetToPdf();
    });

    // --- กลไกปุ่มกระโดดข้อสอบด่วนและกล่องส่งคำตอบคำถาม ---
    $('#jump-to-current-btn').on('click', function () {
        window.jumpToQuestion(window.APP.currentQuestions.findIndex(q => q.state === false));
    });

    $('#submit-btn').off('click').on('click', () => {
        const $selectedBtn = $('#choices').find("button.selected");
        const selectedValue = $selectedBtn.attr('data-answer');

        if (!selectedValue) {
            Swal.fire("กรุณาเลือกคำตอบก่อนส่ง");
            return;
        }

        window.submitQuestion();
    });

    // --- การดักจับคีย์บอร์ดลัด (Keyboard Shortcuts Navigation) ---
    $(document).on('keydown', function (e) {
        if ($('#search-input').is(':focus') || $(document.activeElement).is('input, textarea')) return;
        if ($('#report-card').is(":visible") || $('#progress-modal-card').is(":visible") || $('#pdf-choice-modal').is(":visible") || $('#vote-category-modal').is(":visible") || $('#donate-modal-card').is(":visible")) return;

        if (e.key === 'ArrowRight') {
            window.nextQuestion();
        } else if (e.key === 'ArrowLeft') {
            window.prevQuestion();
        } else if (e.key === 'Enter') {
            const $focusedElement = $(document.activeElement);
            if ($focusedElement.parent().is('#choices')) {
                e.preventDefault();
                if ($focusedElement.hasClass('selected')) {
                    window.submitQuestion();
                } else {
                    $focusedElement.trigger('click');
                }
            } else if ($('#choices').find("button.selected").length > 0) {
                window.submitQuestion();
            }
        } else if (e.key === ' ' && document.activeElement.tagName === 'BUTTON' && $(document.activeElement).parent().is('#choices')) {
            $(document.activeElement).trigger('click');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIndex = $('#choices').find("button:focus").index();
            if (currentIndex > 0) {
                $('#choices').find("button").eq(currentIndex - 1).focus();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const currentIndex = $('#choices').find("button:focus").index();
            if (currentIndex < $('#choices').find("button").length - 1) {
                $('#choices').find("button").eq(currentIndex + 1).focus();
            }
        }
    });

    // --- การบันทึกและกู้คืนสัญกรณ์ Code ทำข้อสอบแบบข้อความบีบอัด ---
    window.generateExportCode = function () {
        if (window.APP.currentQuestions.length === 0) {
            Swal.fire("กรุณาเลือกหัวข้อก่อนทำการ export");
            return null;
        }
        const answeredStates = {};
        window.APP.currentQuestions.forEach(q => {
            if (q.state) {
                answeredStates[q.questionId] = { select: q.select };
            }
        });

        const state = {
            filterMode: window.APP.filterMode || "category",
            category: window.APP.globalStructure.category
                .filter(t => {
                    const el = document.getElementById(`cat-${t.categoryId}`);
                    return el ? el.checked : false;
                })
                .map(t => t.categoryId),
            selectedYears: $('input[type="checkbox"][name="filter-year"]:checked').map(function () {
                return this.value;
            }).get(),
            selectedGroups: $('input[type="checkbox"][name="filter-examgroup"]:checked').map(function () {
                return this.value;
            }).get(),
            selectedSuffixes: $('input[type="checkbox"][name="filter-suffix"]:checked').map(function () {
                return this.value;
            }).get(),
            selectedTopics: $('input[type="checkbox"][name="filter-topic"]:checked').map(function () {
                return this.value;
            }).get(),
            answered: answeredStates,
            index: window.APP.questionIndex,
            isRandom: window.APP.isRandomized,
            order: window.APP.currentQuestions.map(q => q.questionId)
        };
        return btoa(JSON.stringify(state));
    };

    window.applyImportedState = function (encodedString) {
        try {
            const stateJSON = atob(encodedString);
            const state = JSON.parse(stateJSON);

            window.APP.filterMode = state.filterMode || "category";

            $('input[type="checkbox"]').prop('checked', false);

            if (state.category) {
                state.category.forEach(categoryId => {
                    const el = document.getElementById(`cat-${categoryId}`);
                    if (el) el.checked = true;
                });
            }

            if (window.APP.filterMode === "attribute") {
                window.renderAttributeFilterUI();
            }

            if (state.selectedYears) {
                state.selectedYears.forEach(val => {
                    const target = document.getElementById(`filter-year-${val}`);
                    if (target) target.checked = true;
                });
            }
            if (state.selectedGroups) {
                state.selectedGroups.forEach(val => {
                    const target = document.getElementById(`filter-examgroup-${val}`);
                    if (target) target.checked = true;
                });
            }
            if (state.selectedSuffixes) {
                state.selectedSuffixes.forEach(val => {
                    const target = document.getElementById(`filter-suffix-${val}`);
                    if (target) target.checked = true;
                });
            }
            if (state.selectedTopics) {
                state.selectedTopics.forEach(val => {
                    const target = document.getElementById(`filter-topic-${val}`);
                    if (target) target.checked = true;
                });
            }

            window.setFilterMode(window.APP.filterMode);

            window.APP.isRandomized = state.isRandom;
            $('#toggle-random-btn').text(window.APP.isRandomized ? 'โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : 'โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');

            window.updateQuestionSet(false);

            const newOrderedQuestions = [];
            let newScore = 0;

            state.order.forEach(questionId => {
                const question = window.APP.currentQuestions.find(q => q.questionId === questionId);
                if (question) {
                    if (state.answered[questionId]) {
                        question.state = true;
                        question.select = state.answered[questionId].select;
                        if (question.select === question.answer) {
                            newScore++;
                        }
                    }
                    newOrderedQuestions.push(question);
                }
            });

            window.APP.currentQuestions = newOrderedQuestions;
            window.APP.score = newScore;
            window.APP.questionIndex = state.index || 0;

            $('#score').text(`คะแนน: ${window.APP.score}/${window.APP.currentQuestions.length}`);
            window.showQuestion();
            Swal.fire("โหลดข้อมูลสำเร็จ!");
            $('#progress-modal-card').fadeOut();
        } catch (e) {
            console.error("Import failed:", e);
            Swal.fire("ไม่สามารถโหลดข้อมูลได้ อาจเป็นเพราะ Code ไม่ถูกต้อง");
        }
    };

    // --- ระบบนำออก/นำเข้า และคัดลอก Progress แผ่นทำข้อสอบ ---
    $('#modal-export-txt-btn').on('click', function () {
        const code = window.generateExportCode();
        if (!code) return;
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quiz-progress-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        $('#feedback-save').text('ไฟล์ .txt ได้ถูกดาวน์โหลดแล้ว').show().fadeOut(2000);
    });

    // Rest of ui.js events intact...
    $('#modal-export-copy-btn').on('click', function () {
        const code = window.generateExportCode();
        if (!code) return;
        try {
            navigator.clipboard.writeText(code).then(() => {
                $('#feedback-save').text('คัดลอก Code สำเร็จ!').show().fadeOut(2000);
            }, (err) => {
                const textarea = document.createElement('textarea');
                textarea.value = code;
                textarea.style.position = 'fixed';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        $('#feedback-save').text('คัดลอก Code สำเร็จ!').show().fadeOut(2000);
                    } else {
                        $('#feedback-save').text('ไม่สามารถคัดลอก Code ได้! โปรดลองอีกครั้ง').show().fadeOut(2000);
                    }
                } catch (copyErr) {
                    $('#feedback-save').text('ไม่สามารถคัดลอกได้').show().fadeOut(2000);
                    console.error('Fallback: Could not copy text: ', copyErr);
                } finally {
                    document.body.removeChild(textarea);
                }
            });
        } catch (err) {
            console.error('Could not copy text: ', err);
            $('#feedback-save').text('การคัดลอกอัตโนมัติไม่สำเร็จ โปรดคัดลอกด้วยตนเอง').show().fadeOut(2000);
        }
    });

    $('#modal-import-btn').on('click', function () {
        const code = $('#modal-import-code').val().trim();
        if (code) {
            window.applyImportedState(code);
        } else {
            Swal.fire('กรุณาวาง Code หรือเลือกไฟล์');
        }
    });

    $('#modal-import-file').on('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const code = e.target.result;
                $('#modal-import-code').val(code);
                if (code) {
                    window.applyImportedState(code.trim());
                }
            };
            reader.readAsText(file);
        }
    });

    // --- สับเปลี่ยนธีมแสดงผลบนหน้าจอหลัก ---
    const themes = ['light', 'dark', 'claude', 'stranger'];
    const themeNames = { light: 'LIGHT', dark: 'DARK', claude: 'CLAUDE', stranger: 'ST' };
    let currentThemeIndex = 0;

    const savedTheme = localStorage.getItem('mdkku-theme');
    if (savedTheme && themes.includes(savedTheme)) {
        currentThemeIndex = themes.indexOf(savedTheme);
    }

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.title = 'ธีม: ' + themeNames[theme] + ' (คลิกเปลี่ยน)';
            btn.innerHTML = `<span style="font-size:14px;font-weight:700;font-family:sans-serif;">${themeNames[theme]}</span>`;
        }
        localStorage.setItem('mdkku-theme', theme);
    }

    applyTheme(themes[currentThemeIndex]);

    $('#theme-toggle-btn').on('click', function () {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        applyTheme(themes[currentThemeIndex]);
    });

    // --- ระบบดักจับการคลิกเลือกตัวเลือก (Choices Selection) ---
    $('#choices').on("click", "button", function () {
        if (window.APP.currentQuestions[window.APP.questionIndex]?.state) return;
        $(this).addClass("selected").siblings().removeClass("selected");
    });

    // --- ปุ่มเปลี่ยนข้อสอบ ก่อนหน้า / ถัดไป ---
    $('#next-question').on('click', function () {
        window.nextQuestion();
    });

    $('#prev-question').on('click', function () {
        window.prevQuestion();
    });

    // --- ระบบจับการแสดงผลผิดพลาดของภาพโจทย์ ---
    $('#question-image').on('error', function () {
        const src = $(this).attr('src');
        if (src && src !== "") {
            window.sendActivityLog('IMG_ERROR', window.APP.current_question.questionId || "Unknown", "Load Failed", "URL: " + src);
        }
    });

    // --- ปุ่มควบคุมโหมดการสุ่มข้อสอบ ---
    $('#toggle-random-btn').on('click', function () {
        window.APP.isRandomized = !window.APP.isRandomized;
        $(this).text(window.APP.isRandomized ? 'โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : 'โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');

        if (window.APP.isRandomized) {
            $(this).css('background-color', '#e8710a');
        } else {
            $(this).css('background-color', '#007bff');
        }

        window.sortCurrentQuestions();
        window.APP.questionIndex = 0;
        window.showQuestion();

        const currentFilter = $('#submission-filter').val();
        window.showSubmission(currentFilter);
        window.saveProgressToCache();
    });

    // --- ปุ่มเปิด/ปิด โหมดทบทวนข้อผิด ---
    $('#toggle-review-mode-btn').on('click', function () {
        window.APP.isReviewMode = !window.APP.isReviewMode;
        if (window.APP.isReviewMode) {
            $(this).text('โหมดทวนข้อผิด: เปิด').css('background-color', '#28a745');
            Swal.fire("เปิดโหมดทวนข้อผิด", "ข้อที่ตอบผิดจะถูกสุ่มกลับมาให้ทำใหม่จนกว่าจะถูก", "info");
        } else {
            $(this).text('โหมดทวนข้อผิด: ปิด').css('background-color', '#d32f2f');
        }
    });

    // --- ปุ่มแสดงเฉลยล่วงหน้า (Screening Mode) ---
    $('#show-all-answers-btn').on('click', function () {
        window.APP.isShowingAllAnswers = !window.APP.isShowingAllAnswers;
        if (window.APP.isShowingAllAnswers) {
            $(this).text('ซ่อนเฉลย (Screening)');
            $('#submit-btn').hide();
        } else {
            $(this).text('แสดงเฉลย (Screening)');
            $('#submit-btn').show();
        }
        window.showQuestion();
    });

    // --- ปุ่มเลื่อนรูปโจทย์กรณีมีภาพประกอบหลายใบ ---
    $('#prev-img-btn').on('click', function () {
        if (window.APP.currentImageArray.length > 1) {
            window.APP.currentImageIndex--;
            if (window.APP.currentImageIndex < 0) {
                window.APP.currentImageIndex = window.APP.currentImageArray.length - 1;
            }
            window.updateImageGallery();
        }
    });

    $('#next-img-btn').on('click', function () {
        if (window.APP.currentImageArray.length > 1) {
            window.APP.currentImageIndex++;
            if (window.APP.currentImageIndex >= window.APP.currentImageArray.length) {
                window.APP.currentImageIndex = 0;
            }
            window.updateImageGallery();
        }
    });

    // --- การเปลี่ยนตัวกรองประวัติการทำข้อสอบ (Submission Filter) ---
    $('#submission-filter').on('change', function () {
        window.showSubmission(this.value);
    });

    // --- กลไกการค้นหาข้อสอบในโมดูลค้นหาหลัก ---
    $('#search-btn').on('click', function () {
        window.performSearch();
    });

    $('#search-input').on('keypress', function (e) {
        if (e.which === 13) {
            window.performSearch();
        }
    });

    // --- ช่วยโฟกัสและเตรียมเครื่องหมายคำพูดสำหรับการค้นหาแบบ Exact ---
    $('#search-input').on('focus', function () {
        const input = this;
        if ($(input).data('initialized') === undefined) {
            if (input.value === '') {
                input.value = '" "';
                setTimeout(() => {
                    if (input.setSelectionRange) {
                        input.setSelectionRange(1, 2);
                    } else if (input.createTextRange) {
                        const range = input.createTextRange();
                        range.collapse(true);
                        range.moveEnd('character', 1);
                        range.moveStart('character', 1);
                        range.select();
                    }
                }, 50);
            }
            $(input).data('initialized', true);
        }
    });

    // --- อัปเดตสถานะเริ่มต้นของปุ่มสุ่มข้อสอบ ---
    $('#toggle-random-btn').text(window.APP.isRandomized ? 'โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : 'โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');
});

window.renderAnnouncementsUI = function (announcements) {
    const $container = $('#dynamic-announcements-container');
    if (!$container.length) return;
    $container.empty().hide();

    const activeAnns = (announcements || []).filter(a => String(a.Active).trim().toUpperCase() === 'TRUE');
    if (activeAnns.length === 0) return;

    // จัดเรียงตามลำดับความสำคัญ (Order)
    activeAnns.sort((a, b) => (parseInt(a.Order) || 0) - (parseInt(b.Order) || 0));

    // จับคู่คลาส Type ให้รองรับการเปลี่ยนสีตาม CSS variables ของทุกธีม (Light, Dark, Claude, Stranger)
    const alertClasses = {
        info: { bg: 'var(--color-primary-pale)', border: '1px solid var(--color-primary-light)', color: 'var(--color-text)' },
        warning: { bg: 'var(--pastel-pharm)', border: '1px solid var(--active-pharm)', color: 'var(--color-text)' },
        danger: { bg: 'var(--color-wrong-bg)', border: '1px solid var(--color-wrong)', color: 'var(--color-wrong)' },
        success: { bg: 'var(--color-correct-bg)', border: '1px solid var(--color-correct)', color: 'var(--color-correct)' }
    };

    let html = '';
    activeAnns.forEach(ann => {
        const type = String(ann.Type).trim().toLowerCase();
        const styles = alertClasses[type] || alertClasses.info;
        html += `
            <div style="background-color: ${styles.bg}; border: ${styles.border}; color: ${styles.color}; padding: 12px; border-radius: 8px; font-weight: 700; line-height: 1.45;">
                ${ann.Text}
            </div>
        `;
    });

    $container.html(html).css('display', 'flex');
};