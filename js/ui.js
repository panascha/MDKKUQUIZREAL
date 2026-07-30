// REFACTOR/js/ui.js

// =========================================================
// I. Global Helper Functions (ขอบเขตส่วนกลาง)
// =========================================================

window.getCategoryNameById = function (categoryId) {
    if (!window.APP.globalStructure.category) return categoryId;
    const found = window.APP.globalStructure.category.find(t => t.categoryId === categoryId);
    return found ? found.categoryName : categoryId;
};

// ตรวจว่า categoryId เป็นหมวดเลคเชอร์/สาขาวิชา (มี token สาขาในส่วนใดส่วนหนึ่งของรหัส)
// ตัวจำแนกกลางที่ใช้ร่วมกัน — renderAccordionUI มีสำเนา local ของตัวเองอยู่ (ไม่แตะ)
window.isLectureCategory = function (catId) {
    const SUBGROUPS = ["ANA", "BIOCHEM", "PHYSIO", "MICRO", "PARASITO", "PATHO", "PHARM", "RADIO", "CLINICAL"];
    const parts = String(catId).toUpperCase().split('_');
    for (let i = 1; i < parts.length; i++) {
        if (SUBGROUPS.some(sg => parts[i].includes(sg))) return true;
    }
    return false;
};

// สกัดชื่อ discipline จาก categoryId — ใช้แยก "by AI" ตามกลุ่มวิชา
// คืน "" ถ้าไม่เจอ discipline token ในส่วนใดส่วนหนึ่งของ categoryId
window.extractDisciplineFromCategory = function (catId) {
    const MAP = {
        ANA: 'ANATOMY', BIOCHEM: 'PHYSIO and BIOCHEM', PHYSIO: 'PHYSIO and BIOCHEM', PHY: 'PHYSIO and BIOCHEM',
        MICRO: 'PARASITO and MICRO', PARASITO: 'PARASITO and MICRO',
        PATHO: 'PATHO',
        PHARM: 'PHARM', PHARMACO: 'PHARM',
        RADIO: 'RADIO and CLINICAL', IMAGE: 'RADIO and CLINICAL', CLINICAL: 'RADIO and CLINICAL'
    };
    const parts = String(catId).toUpperCase().split('_');
    for (let i = 1; i < parts.length; i++) {
        if (MAP[parts[i]]) return MAP[parts[i]];
    }
    return '';
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
    // 2. คำนวณหา Facet และสร้างโครงสร้างจับคู่ความสัมพันธ์ของวิชากับหัวข้อย่อย
    window.APP.allQuestions.forEach(q => {
        const meta = window.parseQuestionMetadata(q);

        if (meta.topic !== "N/A" && meta.suffix !== "N/A") {
            topicToSuffix[meta.topic] = meta.suffix;
        }

        // ปรับระบบเป็น Strict Top-Down เพื่อป้องกันปุ่มระดับบนหายระหว่างเลือก
        // 1. ปีข้อสอบ (Year) จะแสดงตัวเลือกทั้งหมดเสมอ ไม่ถูกกรองจากตัวเลือกระดับล่าง
        if (meta.year !== "N/A" && meta.year !== "") {
            availableYears.add(meta.year);
        }
        // 2. กลุ่มข้อสอบ (Exam Group) จะกรองตาม ปีข้อสอบ (Year) ที่เลือกเท่านั้น
        if (matchYear(meta, selectedYears)) {
            if (meta.examGroup !== "N/A") availableGroups.add(meta.examGroup);
        }
        // 3. หมวดวิชาเฉพาะทาง (Suffix) จะกรองตาม ปีข้อสอบ + กลุ่มข้อสอบ ที่เลือกเท่านั้น
        if (matchYear(meta, selectedYears) && matchGroup(meta, selectedGroups)) {
            if (meta.suffix !== "N/A") availableSuffixes.add(meta.suffix);
        }
        // 4. หัวข้อย่อย (Topic) จะกรองตาม ปีข้อสอบ + กลุ่มข้อสอบ + หมวดวิชาเฉพาะทาง ที่เลือก
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

window.setFilterMode = function (mode, skipUpdate) {
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
    // skipUpdate = true เมื่อผู้เรียกจะสร้าง/กู้คืน currentQuestions เอง (เช่น loadProgressFromCache)
    // ป้องกัน updateQuestionSet(สุ่ม) + saveProgressToCache ทับ session ระหว่างกู้คืน
    if (!skipUpdate) {
        window.updateQuestionSet();
        window.updateSelectedCategoryStatus();
    }
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
    // จดจำ ID ของวิชา/เลคเชอร์ที่ผู้ใช้เลือกไว้ก่อนล้าง DOM
    const checkedIds = $('input[type="checkbox"][name="category"]:checked').map(function () {
        return this.value;
    }).get();

    const $container = $('#dynamic-accordion-area');
    $container.empty();

    // แถบตั้งจำนวนข้อแบบด่วน — มีผลกับทุกหมวดที่ติ๊กไว้ตอนนั้น
    $container.append(`
        <div id="category-limit-presets" class="limit-preset-bar">
            <span class="limit-preset-label"><i class="fas fa-dice"></i> สุ่มข้อต่อหัวข้อ:</span>
            <button type="button" class="limit-preset-btn" data-limit="5">5</button>
            <button type="button" class="limit-preset-btn" data-limit="10">10</button>
            <button type="button" class="limit-preset-btn" data-limit="20">20</button>
            <button type="button" class="limit-preset-btn" data-limit="25%">25%</button>
            <button type="button" class="limit-preset-btn" data-limit="50%">50%</button>
            <button type="button" class="limit-preset-btn" data-limit="all">ทั้งหมด</button>
            <span class="limit-preset-hint">มีผลกับหัวข้อที่เลือกไว้แล้วเท่านั้น</span>
        </div>
    `);

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
        const catId = category.categoryId;
        const poolSize = stats.total;
        const limitVal = window.getCategoryLimit(catId, poolSize); // อ่านจาก SSOT กัน state หายตอนรีเรนเดอร์

        return `
            <div class="category-item" data-cat-id="${catId}">
                <label class="category-label">
                    <input type="checkbox" name="category" id="cat-${catId}" data-category-id="${catId}" value="${catId}" style="display: none;">
                    <span class="toggle-button ${colorClass}">${category.categoryName} <span style="${badgeStyle}">${displayCount}</span></span>
                </label>
                <div class="limit-stepper" data-cat-id="${catId}" data-max="${poolSize}" style="display: none;">
                    <button type="button" class="lim-btn" data-act="dec" title="ลดจำนวนข้อ">−</button>
                    <input type="text" class="lim-input" inputmode="decimal" value="${limitVal}">
                    <span class="lim-max">/${poolSize}</span>
                    <button type="button" class="lim-btn" data-act="inc" title="เพิ่มจำนวนข้อ">+</button>
                    <button type="button" class="lim-btn lim-full" data-act="full" title="เอาทั้งหมดของหัวข้อนี้">ทั้งหมด</button>
                </div>
            </div>
        `;
    }

    function buildAccordion(groupName, categories, isExcludedGroup) {
        const helperText = !isExcludedGroup ? " (คำถามที่แยกเลคแล้ว/คำถามทั้งหมด)" : "";
        const btns = categories.map(c => buildCategoryButton(c, isExcludedGroup)).join('');
        // แปลงชื่อกลุ่มภายในให้สวยขึ้น — "GI_by AI_ANATOMY" → "GI by AI (ANATOMY)"
        var displayName = groupName;
        if (/by AI_/i.test(groupName)) {
            displayName = groupName.replace(/_?by AI_/i, ' by AI (') + ')';
        }
        return `
            <details class="accordion-group">
                <summary class="accordion-header">
                    ${displayName} <span style="font-size: 0.85rem; font-weight: normal; margin-left: 5px; color: var(--color-text-muted);">${helperText}</span>
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
        var key = cat.accordionGroup || 'Uncategorized';
        // แยก "by AI" ตาม discipline — สร้าง accordionGroup เสมือน (เช่น "GI_by AI_ANATOMY")
        if (key.toUpperCase().includes("BY AI")) {
            var disc = window.extractDisciplineFromCategory(cat.categoryId);
            if (disc) {
                key = key + '_' + disc;
            }
        }
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

    // คืนค่า Checked ให้กับ Checkboxes ที่เพิ่งสร้างใหม่
    checkedIds.forEach(catId => {
        const targetEl = document.getElementById(`cat-${catId}`);
        if (targetEl) {
            $(targetEl).prop('checked', true);
        }
    });

    $('input[type="checkbox"][name="category"]').on('change', () => {
        window.syncCategoryLimitUI();
        window.updateQuestionSet();
        window.updateSelectedCategoryStatus();
        window.updateSuperGroupBadges();
    });

    window.bindCategoryLimitHandlers();
    window.syncCategoryLimitUI();

    // อัปเดตการแสดงผลและ Badges ตัวเลขสะสมของปุ่มในหน้า UI
    window.updateSelectedCategoryStatus();
    window.updateSuperGroupBadges();
};

// เขียนค่าลง SSOT (window.APP.categoryLimits) — ค่าว่าง/เต็มจำนวน = ลบคีย์ทิ้งให้เหลือ default เดียว
// รองรับ string: fixed number ("10") และ percentage ("50%")
window.setCategoryLimit = function (catId, value, max) {
    if (!window.APP.categoryLimits) window.APP.categoryLimits = {};

    // ยังไม่รู้จำนวนข้อจริงของหมวด (ตอนเรนเดอร์ก่อนโหลดข้อสอบเสร็จ data-max=0) → อย่าเพิ่งเขียนค่า
    if (typeof max !== 'number' || max <= 0) return;

    if (value === null || value === undefined) {
        delete window.APP.categoryLimits[catId];
        return;
    }

    var s = String(value).trim();
    if (s.endsWith('%')) {
        var pct = parseFloat(s);
        if (pct > 0 && pct <= 100) {
            window.APP.categoryLimits[catId] = s;
        } else {
            delete window.APP.categoryLimits[catId];
        }
        return;
    }

    var n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 1) {
        delete window.APP.categoryLimits[catId];
        return;
    }

    var clamped = Math.max(1, Math.min(n, max));
    if (clamped >= max) {
        delete window.APP.categoryLimits[catId];
        return;
    }
    window.APP.categoryLimits[catId] = clamped;
};

// ซิงค์ DOM ให้ตรงกับ SSOT — โชว์ stepper เฉพาะหัวข้อที่ติ๊กไว้
window.syncCategoryLimitUI = function () {
    $('#dynamic-accordion-area .category-item').each(function () {
        const $item = $(this);
        const $stepper = $item.find('.limit-stepper');
        const isChecked = $item.find('input[name="category"]').prop('checked');

        $stepper.toggle(!!isChecked);
        if (!isChecked) return;

        const catId = $item.attr('data-cat-id');
        const max = parseInt($stepper.attr('data-max'), 10) || 0;
        // แสดงค่า raw จาก SSOT (อาจเป็น % string) กัน % กลายเป็น NaN — getCategoryLimit ใช้ resolve value
        var rawVal = (window.APP.categoryLimits || {})[catId];
        $stepper.find('.lim-input').val(rawVal != null ? String(rawVal) : window.getCategoryLimit(catId, max));
    });
};

// ปุ่มลัด 5 / 10 / 20 / ทั้งหมด — ตั้งค่าให้ทุกหัวข้อที่ติ๊กไว้ (n = null คือทั้งหมด)
window.applyLimitPreset = function (n) {
    $('#dynamic-accordion-area .category-item').each(function () {
        const $item = $(this);
        if (!$item.find('input[name="category"]').prop('checked')) return;

        const $stepper = $item.find('.limit-stepper');
        window.setCategoryLimit(
            $item.attr('data-cat-id'),
            n,
            parseInt($stepper.attr('data-max'), 10) || 0
        );
    });

    window.syncCategoryLimitUI();
    window.updateQuestionSet();
};

// ผูก event แบบ delegate ครั้งเดียว — renderAccordionUI ถูกเรียกซ้ำหลายรอบต่อ session
window.bindCategoryLimitHandlers = function () {
    if (window._limitUIBound) return;
    window._limitUIBound = true;

    const $area = $('#dynamic-accordion-area');

    $area.on('click', '.limit-preset-btn', function () {
        var raw = $(this).attr('data-limit');
        if (raw === 'all') { window.applyLimitPreset(null); return; }
        // ส่ง raw string ไปให้ setCategoryLimit จัดการ (%/number)
        window.applyLimitPreset(raw);
    });

    $area.on('click', '.lim-btn', function () {
        const $stepper = $(this).closest('.limit-stepper');
        const catId = $stepper.attr('data-cat-id');
        const max = parseInt($stepper.attr('data-max'), 10) || 0;
        const act = $(this).attr('data-act');

        if (act === 'full') {
            window.setCategoryLimit(catId, null, max);
        } else {
            const current = window.getCategoryLimit(catId, max);
            window.setCategoryLimit(catId, act === 'inc' ? current + 1 : current - 1, max);
        }

        window.syncCategoryLimitUI();
        window.updateQuestionSet();
    });

    // ใช้ change (ไม่ใช่ input) — กันไม่ให้ยิง updateQuestionSet ทุกตัวอักษรที่พิมพ์
    $area.on('change', '.lim-input', function () {
        const $stepper = $(this).closest('.limit-stepper');
        window.setCategoryLimit(
            $stepper.attr('data-cat-id'),
            $(this).val(),
            parseInt($stepper.attr('data-max'), 10) || 0
        );

        window.syncCategoryLimitUI();
        window.updateQuestionSet();
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

        const totalSelectedCount = selectedYears.length + selectedGroups.length + selectedSuffixes.length + selectedTopics.length;

        if (totalSelectedCount === 0) {
            $status.html('<p class="small-text" style="color: #999; margin:0;">ยังไม่ได้เลือกตัวกรองละเอียด</p>');
        } else {
            $status.append(`<button class="btn-clear-all" onclick="window.clearAllAttributeFilters()"><i class="fas fa-trash-alt"></i> ล้างตัวกรองทั้งหมด (${totalSelectedCount})</button>`);

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

            // คำนวณสรุปจำนวนข้อสอบแยกตามปีและวิชาเฉพาะทาง (SubGroup Suffix) จากผลการกรองจริง
            const summaryMap = {};
            window.APP.currentQuestions.forEach(q => {
                const meta = window.parseQuestionMetadata(q);
                const yr = meta.year || 'N/A';
                const sfx = meta.suffix || 'N/A';
                if (!summaryMap[yr]) summaryMap[yr] = {};
                if (!summaryMap[yr][sfx]) summaryMap[yr][sfx] = 0;
                summaryMap[yr][sfx]++;
            });

            const years = Object.keys(summaryMap).sort();
            if (years.length > 0 && window.APP.currentQuestions.length > 0) {
                // ฟังก์ชันช่วยสกัดสไตล์สีตามชื่อวิชา
                const getSuffixStyle = (suffix) => {
                    const s = suffix.toUpperCase();
                    if (s.includes("RADIO") || s.includes("CLINICAL")) {
                        return { bg: "var(--pastel-clinical, #F0FFFF)", border: "#A5F3FC", text: "var(--color-text, #000)" };
                    }
                    if (s.includes("ANATOMY") || s.includes("ANA")) {
                        return { bg: "var(--pastel-anatomy, #FFF0F0)", border: "#FECACA", text: "var(--color-text, #000)" };
                    }
                    if (s.includes("PARASITO") || s.includes("MICRO")) {
                        return { bg: "var(--pastel-micro, #F5F0FF)", border: "#DDD6FE", text: "var(--color-text, #000)" };
                    }
                    if (s.includes("PATHO")) {
                        return { bg: "var(--pastel-patho, #F0FFF4)", border: "#BBF7D0", text: "var(--color-text, #000)" };
                    }
                    if (s.includes("PHYSIO") || s.includes("BIOCHEM")) {
                        return { bg: "var(--pastel-physio, #F0F7FF)", border: "#BFDBFE", text: "var(--color-text, #000)" };
                    }
                    if (s.includes("PHARM")) {
                        return { bg: "var(--pastel-pharm, #FFF9F0)", border: "#FDE68A", text: "var(--color-text, #000)" };
                    }
                    // ถ้าไม่ตรงกับวิชาหลัก ให้แสดงผลเป็นสีเทา (Gray Background)
                    return { bg: "var(--color-surface-3, #e2e8f0)", border: "var(--color-border, #cbd5e1)", text: "var(--color-text-muted, #475569)" };
                };

                let summaryHtml = `
                    <div class="filter-summary-box" style="width: 100%; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--color-border-soft); font-size: 0.95rem; text-align: left; color: var(--color-text-muted);">
                        <div style="font-weight: 700; margin-bottom: 8px; color: var(--color-primary);"><i class="fas fa-chart-bar"></i> สรุปข้อสอบที่กรองได้แยกตามปี:</div>
                        <ul style="margin: 0; padding-left: 20px; list-style-type: disc; display: flex; flex-direction: column; gap: 8px;">
                `;

                years.forEach(yr => {
                    summaryHtml += `
                        <li style="line-height: 1.5;">
                            <strong style="color: var(--color-text);">ปี ${yr}:</strong>
                            <span style="display: inline-flex; flex-wrap: wrap; gap: 6px; margin-left: 6px; vertical-align: middle;">
                    `;

                    const suffixes = Object.keys(summaryMap[yr]).sort();
                    suffixes.forEach(sfx => {
                        const count = summaryMap[yr][sfx];
                        const style = getSuffixStyle(sfx);
                        summaryHtml += `
                            <span style="background: ${style.bg}; border: 1px solid ${style.border}; color: ${style.text}; padding: 1px 8px; border-radius: 8px; font-weight: 600; font-size: 0.85rem;">
                                [${sfx}] ${count} ข้อ
                            </span>
                        `;
                    });

                    summaryHtml += `
                            </span>
                        </li>
                    `;
                });

                summaryHtml += `
                        </ul>
                    </div>
                `;
                $status.append(summaryHtml);
            }
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

    $('#show-stats-modal-btn').on('click', () => {
        window.renderWeaknessStats();
        $('#stats-modal-card').css('display', 'flex').hide().fadeIn(250);
    });

    $('#close-stats-modal').on('click', () => {
        $('#stats-modal-card').fadeOut();
    });

    $('#donate-coffee-btn').on('click', () => {
        $('#donate-modal-card').fadeIn();
    });

    $('#close-donate-modal').on('click', () => {
        $('#donate-modal-card').fadeOut();
    });

    // --- Donate API Key (KKU IntelSphere) ---
    $('#donate-key-btn').on('click', () => window.openDonateKeyModal());

    $('#close-donate-key-modal').on('click', () => {
        $('#donate-key-modal-card').fadeOut();
    });

    $('#donate-key-anon').on('change', function () {
        $('#donate-key-name').prop('disabled', this.checked);
        if (this.checked) $('#donate-key-name').val('');
    });

    $('#btn-submit-donate-key').on('click', () => window.submitDonatedKey());

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
        window.logFeature('DOWNLOAD_PDF_RESULT', { cats: selectedCats, note: 'Format: Result' });
        window.saveResultsToPdf();
        $('#pdf-choice-modal').fadeOut();
    });

    $('#save-practice-pdf-btn').off('click').on('click', () => {
        $('#pdf-choice-modal').fadeOut();

        const selectedCats = window.getSelectedCategoryNames().join(' / ');
        const format = $('#export-format-select').val();
        window.logFeature('DOWNLOAD_PDF_PRACTICE', { cats: selectedCats, note: `Format: ${format}` });

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
        if ($('#report-card').is(":visible") || $('#progress-modal-card').is(":visible") || $('#pdf-choice-modal').is(":visible") || $('#vote-category-modal').is(":visible") || $('#donate-modal-card').is(":visible") || $('#donate-key-modal-card').is(":visible") || $('#release-history-modal').is(":visible")) return;

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
        return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    };

    window.applyImportedState = function (encodedString) {
        try {
            const stateJSON = decodeURIComponent(escape(atob(encodedString)));
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

            window.setFilterMode(window.APP.filterMode, true); // skipUpdate — ด้านล่างเรียก updateQuestionSet(false) แล้วเรียงตาม state.order เอง

            window.APP.isRandomized = state.isRandom;
            $('#toggle-random-btn').text(window.APP.isRandomized ? 'โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : 'โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');

            // รหัสแชร์ไม่ได้เก็บลิมิตต่อหมวด — ต้องปลดลิมิตก่อน ไม่งั้นข้อใน state.order หายไปบางส่วน
            window.APP.categoryLimits = {};
            window.syncCategoryLimitUI();

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
        // กำลังลากเลือกคำในตัวเลือก (glossary tap-translate) — ไม่ใช่ตั้งใจเลือกคำตอบ
        var sel = window.getSelection && window.getSelection();
        if (sel && !sel.isCollapsed && this.contains(sel.anchorNode)) return;
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
            window.logFeature('IMG_ERROR', { target: window.APP.current_question.questionId || "Unknown", result: 'Load Failed', url: src });
        }
    });

    // --- ปุ่มควบคุมโหมดการสุ่มข้อสอบ ---
    $('#toggle-random-btn').on('click', function () {
        window.APP.isRandomized = !window.APP.isRandomized;
        $(this).html(window.APP.isRandomized ? '<i class="fas fa-random"></i> โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : '<i class="fas fa-sort-amount-down-alt"></i> โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)');

        if (window.APP.isRandomized) {
            $(this).css({ 'background-color': '#e8710a', 'color': 'white', 'border-color': '#e8710a' });
        } else {
            $(this).css({ 'background-color': '#007bff', 'color': 'white', 'border-color': '#007bff' });
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
            $(this).html('<i class="fas fa-redo"></i> โหมดทวนข้อผิด: เปิด').css({
                'background-color': '#28a745',
                'color': 'white',
                'border-color': '#28a745'
            });
            Swal.fire("เปิดโหมดทวนข้อผิด", "ข้อที่ตอบผิดจะถูกสุ่มกลับมาให้ทำใหม่จนกว่าจะถูก", "info");
        } else {
            $(this).html('<i class="fas fa-times-circle"></i> โหมดทวนข้อผิด: ปิด').css({
                'background-color': 'var(--color-surface)',
                'color': 'var(--color-text)',
                'border-color': 'var(--color-border)'
            });
        }
    });

    // --- ปุ่มแสดงเฉลยล่วงหน้า (Screening Mode) ---
    $('#show-all-answers-btn').on('click', function () {
        window.APP.isShowingAllAnswers = !window.APP.isShowingAllAnswers;
        if (window.APP.isShowingAllAnswers) {
            $(this).html('<i class="fas fa-eye-slash"></i> ซ่อนเฉลย (Screening)').css({
                'background-color': 'var(--color-correct, #16a34a)',
                'color': 'white',
                'border-color': 'var(--color-correct, #16a34a)'
            });
            $('#submit-btn').hide();
        } else {
            $(this).html('<i class="fas fa-eye"></i> แสดงเฉลย (Screening)').css({
                'background-color': 'var(--color-surface)',
                'color': 'var(--color-text)',
                'border-color': 'var(--color-border)'
            });
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

    // --- อัปเดตสถานะเริ่มต้นของปุ่มสุ่มข้อสอบและปุ่มโหมดทวนข้อผิด ---
    $('#toggle-random-btn').html(window.APP.isRandomized ? '<i class="fas fa-random"></i> โหมดสุ่ม (คลิกเพื่อเรียงลำดับ)' : '<i class="fas fa-sort-amount-down-alt"></i> โหมดเรียงลำดับ (คลิกเพื่อสุ่ม)').css({
        'background-color': window.APP.isRandomized ? '#e8710a' : '#007bff',
        'color': 'white',
        'border-color': window.APP.isRandomized ? '#e8710a' : '#007bff'
    });

    $('#toggle-review-mode-btn').html(window.APP.isReviewMode ? '<i class="fas fa-redo"></i> โหมดทวนข้อผิด: เปิด' : '<i class="fas fa-times-circle"></i> โหมดทวนข้อผิด: ปิด').css({
        'background-color': window.APP.isReviewMode ? '#28a745' : 'var(--color-surface)',
        'color': window.APP.isReviewMode ? 'white' : 'var(--color-text)',
        'border-color': window.APP.isReviewMode ? '#28a745' : 'var(--color-border)'
    });
});

// สร้าง prompt วิเคราะห์ข้อสอบ 5 ส่วน (มาตรฐานกลาง)
// NOTE: มีสำเนาชุดเดียวกันอยู่ที่ MDKKUQUIZDATABASE/js/ui.js — แก้ที่นี่แล้วต้องแก้อีกฝั่งด้วย
// choices รับได้ทั้ง array และ string ที่คั่นด้วย '///'
window.buildQuestionAiPrompt = function (problem, choices) {
    const choicesArray = Array.isArray(choices) ? choices : String(choices || "").split("///");

    const choicesText = choicesArray.map(c => String(c || "").trim()).filter(Boolean).map((c, i) => {
        // ถ้าตัวเลือกมี prefix (A. / B)) มาในข้อมูลอยู่แล้ว ไม่ต้องใส่ซ้ำ — เกณฑ์เดียวกับการ์ดใน search.js/app.js
        const prefix = /^[A-E]\s*[\.\)]/i.test(c) ? "" : `${String.fromCharCode(65 + i)}. `;
        if (c.startsWith('<svg')) return `${prefix}[รูปภาพ SVG]`;
        if (window.isUrl(c)) return `${prefix}[รูปภาพประกอบ]`;
        return `${prefix}${c}`;
    }).join("\n");

    return `
คุณคือผู้เชี่ยวชาญทางการแพทย์ ช่วยวิเคราะห์ข้อสอบแพทย์ข้อนี้ โดยอธิบายตามหลักการทางวิทยาศาสตร์และการแพทย์ตรงๆ ไม่ต้องใช้การเปรียบเทียบหรืออุปมา

อธิบายตาม 5 ส่วนนี้:

1. เฉลยและเหตุผล
บอกคำตอบที่ถูกต้อง พร้อมเหตุผลโดยตรงว่าทำไมจึงถูก

2. Mechanism / Pathophysiology
อธิบาย causal chain ของกระบวนการที่เกิดขึ้นตามลำดับ (ใช้ → แสดงขั้นตอน) พร้อมอธิบายว่า "ทำไม" แต่ละขั้นตอนจึงเกิดขึ้น ไม่ใช่แค่บอกว่าเกิดอะไร

3. ตัวเลือกที่ไม่ถูก: แต่ละอันคืออะไร และต่างจากคำตอบอย่างไร
สำหรับแต่ละ choice ที่ไม่ใช่คำตอบ อธิบายว่ามันคืออะไร, ทำไมจึงผิดในโจทย์นี้, และในสถานการณ์ใดที่มันจะเป็นคำตอบที่ถูก

4. Key Concepts ที่ต้องรู้
สรุป high-yield points ที่ต้องจำ รวมถึง keywords อื่นๆ ในโจทย์ที่มีนัยสำคัญ

5. Clinical Relevance และแหล่งอ้างอิง
บอกว่า concept นี้เจอในคลินิกหรือข้อสอบในบริบทใด และระบุแหล่งอ้างอิง (เช่น Harrison's, Robbins, UpToDate, หรือ guideline ที่เกี่ยวข้อง) พร้อมบอกหน้า/บทถ้าทราบ

---
โจทย์: ${problem}

ตัวเลือก:
${choicesText}
`.trim();
};

// คัดลอก prompt ของข้อสอบที่ส่งเข้ามา (ใช้ได้กับทั้งข้อปัจจุบัน การ์ดสรุปผล และการ์ดผลค้นหา)
window.copyQuestionPrompt = function (q) {
    if (!q || !q.problem) return;

    const textToCopy = window.buildQuestionAiPrompt(q.problem, q.choices);

    navigator.clipboard.writeText(textToCopy).then(() => {
        window.bgToast.fire({
            icon: 'success',
            title: 'คัดลอกโจทย์พร้อม Prompt สำเร็จ!',
            timer: 2000
        });
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = textToCopy;
        tempTextarea.style.position = 'fixed';
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        try {
            document.execCommand('copy');
            window.bgToast.fire({
                icon: 'success',
                title: 'คัดลอกโจทย์พร้อม Prompt สำเร็จ! (Fallback)',
                timer: 2000
            });
        } catch (e) {
            Swal.fire("ไม่สามารถคัดลอกได้", "กรุณาคัดลอกข้อมูลโจทย์ด้วยตนเอง", "error");
        } finally {
            document.body.removeChild(tempTextarea);
        }
    });
};

window.copyQuestionForAI = function () {
    window.copyQuestionPrompt(window.APP.current_question);
};

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

window.renderWeaknessStats = function () {
    const $container = $('#stats-container');
    $container.empty();

    const answered = window.APP.currentQuestions.filter(q => q.state);
    if (answered.length === 0) {
        $container.html(`
            <div style="text-align: center; padding: 40px 20px; color: var(--color-text-muted, #475569);">
                <i class="fas fa-clipboard-list fa-3x" style="opacity: 0.3; margin-bottom: 12px; color: var(--color-text-muted);"></i>
                <p style="font-size: 1.15rem; margin: 0; font-weight: 700; color: var(--color-text);">ยังไม่มีประวัติการทำข้อสอบ</p>
                <p style="font-size: 0.95rem; margin-top: 4px; opacity: 0.8;">กรุณาลองทำข้อสอบบางข้อก่อนเปิดแผงวิเคราะห์จุดอ่อน</p>
            </div>
        `);
        return;
    }

    const SUBGROUPS_LOCAL = ["ANA", "BIOCHEM", "PHYSIO", "MICRO", "PARASITO", "PATHO", "PHARM", "RADIO", "CLINICAL"];
    const isLectureCategoryLocal = (catId) => {
        const upper = String(catId).toUpperCase();
        // รองรับวิชาที่มีโครงสร้างเลคเชอร์แบบ _LEC_ หรือ _QUIZ_ เป็นรหัสระบบ
        if (upper.includes("_LEC_") || upper.includes("_QUIZ_")) {
            return true;
        }
        const parts = upper.split('_');
        for (let i = 1; i < parts.length; i++) {
            if (SUBGROUPS_LOCAL.some(sg => parts[i].includes(sg))) return true;
        }
        return false;
    };

    // ฟังก์ชันช่วยสลับเส้นทางจัดหมวดหมู่วิชากลุ่มทั่วไปและวิชาพิเศษเข้าสู่แกนหมวดหมู่สากล
    const getSystemCorrectedSuffix = (catId, originalSuffix) => {
        const upper = String(catId).toUpperCase();
        if (upper.startsWith("MBN2_") || upper.startsWith("MBN_")) {
            return "BIOCHEM";
        }
        if (upper.startsWith("EMBRYO_")) {
            return "ANA";
        }
        if (upper.startsWith("GEN3_")) {
            if (upper.includes("CESTODE") || upper.includes("PARASITE") || upper.includes("PROTOZOA") || upper.includes("TREMATODES") || upper.includes("NEMATODES")) {
                return "PARASITO";
            }
            return "MICRO";
        }
        if (upper.startsWith("GEN4_")) {
            return "MICRO";
        }
        if (upper.startsWith("GEN2_")) {
            if (upper.includes("EPITHELIAL") || upper.includes("CONNECTIVE") || upper.includes("MUSCLE TISSUE") || upper.includes("NERVOUS TISSUE") || upper.includes("MICROSCOPE") || upper.includes("ORGANELLES") || upper.includes("STRUCTURE")) {
                return "ANA";
            }
            if (upper.includes("INJURY") || upper.includes("ADAPTATIONS")) {
                return "PATHO";
            }
            return "PHYSIO";
        }
        if (upper.startsWith("PSYCHIATRY_") || upper.startsWith("COMMED_")) {
            return "CLINICAL";
        }
        return originalSuffix;
    };

    const stats = {}; // { suffix: { total: 0, correct: 0, lectures: {} } }
    answered.forEach(q => {
        const qCats = Array.isArray(q.category) ? q.category : [q.category];

        let detectedSfx = 'OTHER';
        let detectedLectureCatId = null;

        // สกัดหา Lecture Category ดั้งเดิมที่มีสิทธิ์ใช้งานจริง (และข้าม Extracted)
        for (let i = 0; i < qCats.length; i++) {
            const catId = qCats[i];
            if (isLectureCategoryLocal(catId)) {
                const catName = window.getCategoryNameById(catId) || catId;
                if (catId.toUpperCase().includes("EXTRACTED") || catName.toUpperCase().includes("EXTRACTED")) {
                    continue;
                }
                detectedLectureCatId = catId;
                break;
            }
        }

        // จัดหมวดหมู่ Suffix (หมวดหลัก) ให้แม่นยำขึ้นสำหรับวิชากลุ่มสากลหลักสูตรใหม่
        if (detectedLectureCatId) {
            detectedSfx = getSystemCorrectedSuffix(detectedLectureCatId, 'OTHER');
        } else if (qCats.length > 0) {
            const meta = window.parseQuestionMetadata(q);
            detectedSfx = getSystemCorrectedSuffix(qCats[0], meta.suffix || 'OTHER');
        }

        const sfx = detectedSfx;
        if (!stats[sfx]) {
            stats[sfx] = { total: 0, correct: 0, lectures: {} };
        }

        stats[sfx].total++;
        const isCorrect = (q.select === q.answer);
        if (isCorrect) {
            stats[sfx].correct++;
        }

        if (detectedLectureCatId) {
            if (!stats[sfx].lectures[detectedLectureCatId]) {
                stats[sfx].lectures[detectedLectureCatId] = {
                    name: window.getCategoryNameById(detectedLectureCatId) || detectedLectureCatId,
                    total: 0,
                    correct: 0
                };
            }
            stats[sfx].lectures[detectedLectureCatId].total++;
            if (isCorrect) {
                stats[sfx].lectures[detectedLectureCatId].correct++;
            }
        } else {
            const fallbackId = sfx + "_GENERAL_FALLBACK";
            if (!stats[sfx].lectures[fallbackId]) {
                stats[sfx].lectures[fallbackId] = {
                    name: "หัวข้อทั่วไป / ยังไม่แยกเลคเชอร์",
                    total: 0,
                    correct: 0
                };
            }
            stats[sfx].lectures[fallbackId].total++;
            if (isCorrect) {
                stats[sfx].lectures[fallbackId].correct++;
            }
        }
    });

    const sfxConfig = {
        'ANA': { name: 'Anatomy (กายวิภาคศาสตร์)', icon: 'fas fa-bone', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
        'PHYSIO': { name: 'Physiology (สรีรวิทยา)', icon: 'fas fa-heartbeat', bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a' },
        'BIOCHEM': { name: 'Biochemistry (ชีวเคมี)', icon: 'fas fa-dna', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
        'MICRO': { name: 'Microbiology (จุลชีววิทยา)', icon: 'fas fa-microscope', bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
        'PARASITO': { name: 'Parasitology (ปรสิตวิทยา)', icon: 'fas fa-bug', bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8' },
        'PATHO': { name: 'Pathology (พยาธิวิทยา)', icon: 'fas fa-vial', bg: '#dcfce7', border: '#86efac', text: '#14532d' },
        'PHARM': { name: 'Pharmacology (เภสัชวิทยา)', icon: 'fas fa-pills', bg: '#fef3c7', border: '#fde68a', text: '#78350f' },
        'RADIO': { name: 'Radiology (รังสีวิทยา)', icon: 'fas fa-radiation', bg: '#ecfeff', border: '#a5f3fc', text: '#115e59' },
        'CLINICAL': { name: 'Clinical (เวชปฏิบัติคลินิก)', icon: 'fas fa-user-md', bg: '#e0f2fe', border: '#bae6fd', text: '#075985' },
        'OTHER': { name: 'หมวดหมู่อื่น ๆ', icon: 'fas fa-folder', bg: '#f3f4f6', border: '#e5e7eb', text: '#374151' }
    };

    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; width: 100%; box-sizing: border-box;">';

    Object.keys(stats).sort().forEach(sfx => {
        const item = stats[sfx];
        const pct = Math.round((item.correct / item.total) * 100);

        const config = sfxConfig[sfx.toUpperCase()] || sfxConfig['OTHER'];
        const displayName = config.name;
        const iconClass = config.icon;

        let statusText = 'ควรปรับปรุง ❌';
        let statusColor = 'var(--color-wrong, #dc2626)';
        let statusBg = 'var(--color-wrong-bg, #fee2e2)';
        let statusBorderColor = '#fca5a5';

        if (pct >= 80) {
            statusText = 'ดีเยี่ยม 🎉';
            statusColor = 'var(--color-correct, #16a34a)';
            statusBg = 'var(--color-correct-bg, #dcfce7)';
            statusBorderColor = '#86efac';
        } else if (pct >= 50) {
            statusText = 'พอใช้ได้ ⚠️';
            statusColor = '#f59e0b';
            statusBg = 'var(--pastel-pharm, #fff9f0)';
            statusBorderColor = '#fde68a';
        }

        // จัดทำชุดข้อมูลการแจกแจงราย Lecture (Lectures Breakdown)
        let lecturesHtml = '';
        const lectureIds = Object.keys(item.lectures);
        if (lectureIds.length > 0) {
            lecturesHtml += `
                <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--color-border-soft, #e2e8f0); display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted, #475569);"><i class="fas fa-list-ul"></i> สถิติรายเลคเชอร์:</div>
            `;
            lectureIds.forEach(catId => {
                const lect = item.lectures[catId];
                const lPct = Math.round((lect.correct / lect.total) * 100);

                let lColor = '#16a34a';
                if (lPct < 50) lColor = '#dc2626';
                else if (lPct < 80) lColor = '#f59e0b';

                lecturesHtml += `
                    <div style="font-size: 0.85rem; color: var(--color-text, #0f172a);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72%;" title="${lect.name}">• ${lect.name}</span>
                            <span style="font-weight: 700; color: ${lColor}; flex-shrink: 0; margin-left: 4px;">${lect.correct}/${lect.total} ข้อ (${lPct}%)</span>
                        </div>
                        <div style="width: 100%; background: var(--color-surface-3, #e2e8f0); height: 5px; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${lPct}%; background: ${lColor}; height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                `;
            });
            lecturesHtml += `</div>`;
        }

        html += `
            <div style="background: var(--color-surface, #fff); border: 1.5px solid var(--color-border, #cbd5e1); padding: 14px; border-radius: var(--border-radius, 8px); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
                <div>
                    <!-- รายชื่อบทเรียนและไอคอนสี Soft-palette -->
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                        <span style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: ${config.bg}; border: 1px solid ${config.border}; color: ${config.text}; font-size: 0.9rem; flex-shrink: 0;">
                            <i class="${iconClass}"></i>
                        </span>
                        <span style="font-weight: 700; font-size: 1.05rem; color: var(--color-text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 36px);">${displayName}</span>
                    </div>

                    <!-- ค่าประเมินสถานะคำตอบหลัก -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.95rem; color: var(--color-text-muted, #475569);">
                            ภาพรวม: ถูกต้อง <b>${item.correct}</b> / <b>${item.total}</b> ข้อ
                        </span>
                        <span style="background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorderColor}; font-size: 0.8rem; padding: 1px 8px; border-radius: 12px; font-weight: 700;">
                            ${statusText}
                        </span>
                    </div>
                </div>

                <!-- แถบประเมินทักษะอย่างละเอียดเชิงเปอร์เซ็นต์ (Progress Bar) -->
                <div style="margin-top: 6px; margin-bottom: 2px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
                        <span style="font-size: 0.8rem; color: var(--color-text-muted, #475569); font-weight: 600;">ความแม่นยำภาพรวม</span>
                        <span style="font-size: 1.15rem; font-weight: 800; color: ${statusColor}; line-height: 1;">${pct}%</span>
                    </div>
                    <div style="width: 100%; background: var(--color-surface-3, #e2e8f0); height: 10px; border-radius: 10px; overflow: hidden; border: 1px solid var(--color-border-soft, #e2e8f0);">
                        <div style="width: ${pct}%; background: ${statusColor}; height: 100%; border-radius: 10px; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                    </div>
                </div>

                <!-- การแสดงสถิติแจกแจงรายเลคเชอร์ที่ซ้อนอยู่ภายใน -->
                ${lecturesHtml}
            </div>
        `;
    });

    html += '</div>';
    $container.html(html);
};
// =========================================================
// Donate API Key (KKU IntelSphere) — modal + submit
// =========================================================

window.openDonateKeyModal = function () {
    window.renderDonorCredits();
    $('#donate-key-modal-card').fadeIn();
};

// รายชื่อผู้บริจาคจาก listModels (window._chatbotDonors ตั้งค่าใน loadChatbotModelCatalog)
window.renderDonorCredits = function () {
    var donors = window._chatbotDonors || [];
    var $list = $('#donor-credits-list');
    if (donors.length === 0) {
        $list.text('ยังไม่มีรายชื่อ — เป็นคนแรกได้เลย!');
        return;
    }
    $list.empty();
    donors.forEach(function (name) {
        $list.append(
            $('<span>').text(name).css({
                display: 'inline-block', background: 'var(--color-surface-3)',
                borderRadius: '12px', padding: '2px 10px', margin: '2px 4px 2px 0', fontWeight: 600
            })
        );
    });
};

window.submitDonatedKey = async function () {
    var apiKey = $('#donate-key-input').val().trim();
    if (!apiKey) {
        Swal.fire('กรุณาวาง API Key ก่อนส่ง', '', 'warning');
        return;
    }
    var donorName = $('#donate-key-anon').is(':checked') ? '' : $('#donate-key-name').val().trim();

    var $btn = $('#btn-submit-donate-key');
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ Key...');

    try {
        var res = await window.sendWithRetry({
            action: 'seedIntelSphereKey',
            apiKey: apiKey,
            donorName: donorName,
            notes: 'donated via web form',
            sessionToken: localStorage.getItem('mdkku_session_token') || ''
        });

        if (res.result === 'success') {
            $('#donate-key-input').val('');
            $('#donate-key-name').val('');
            $('#donate-key-modal-card').fadeOut();
            Swal.fire('สำเร็จ 💖', res.message || 'ขอบคุณสำหรับการบริจาค!', 'success');
            window.loadChatbotModelCatalog(); // refresh catalog + donor list ด้วย key ใหม่
        } else {
            Swal.fire('บริจาคไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
        }
    } catch (e) {
        Swal.fire('บริจาคไม่สำเร็จ', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่ภายหลัง', 'error');
    } finally {
        $btn.prop('disabled', false).html('<i class="fas fa-key"></i> บริจาค Key');
    }
};
