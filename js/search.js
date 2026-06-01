// REFACTOR/js/search.js

window.searchDictionary = new Set();
const colors = ['#FFECB3', '#FFCDD2', '#C8E6C9', '#BBDEFB', '#D1C4E9', '#FFE0B2', '#F0F4C3', '#DCEDC8', '#FFCCBC', '#D7CCC8'];

window.buildSearchDictionary = function () {
    window.searchDictionary.clear();
    console.log("Building Search Dictionary...");

    // คลังคำศัพท์หลักภาษาไทยสืบค้นบ่อยในควิซสรีรวิทยา กายวิภาคศาสตร์ และพยาธิวิทยา
    const commonThaiWords = [
        "กระเพาะ", "อาหาร", "หัวใจ", "ปอด", "ตับ", "ไต", "สมอง", "กระดูก", "กล้ามเนื้อ",
        "เส้นประสาท", "หลอดเลือด", "เซลล์", "อักเสบ", "มะเร็ง", "ติดเชื้อ", "รักษา",
        "อาการ", "ตรวจ", "ฟิล์ม", "รังสี", "ไขสันหลัง", "น้ำดี", "ตับอ่อน", "ลำไส้",
        "ม้าม", "ต่อมน้ำเหลือง", "เต้านม", "มดลูก", "รังไข่", "ช่องคลอด", "องคชาต",
        "อัณฑะ", "ต่อมลูกหมาก", "ปัสสาวะ", "อุจจาระ", "โลหิต", "เลือด", "หัวกระดูก",
        "ข้อต่อ", "ผิวหนัง", "ตา", "หู", "จมูก", "ปาก", "คอ", "ฟัน", "ลิ้น", "หลอดลม",
        "ถุงลม", "ต่อมไทรอยด์", "ต่อมใต้สมอง", "ต่อมหมวกไต", "ฮอร์โมน", "เอนไซม์",
        "ภูมิคุ้มกัน", "แบคทีเรีย", "ไวรัส", "พยาธิ", "เชื้อรา", "สารเคมี", "ยีน", "โครโมโซม"
    ];

    window.APP.allQuestions.forEach(q => {
        const text = `${q.problem || ''} ${q.choices || ''} ${q.explain || ''}`;
        const lowerText = text.toLowerCase();

        // 1. ตรวจสอบและดึงคำศัพท์ไทยสำคัญที่พบบ่อยเข้ามาในพจนานุกรมเพื่อประยุกต์ทำ Fuzzy Search
        commonThaiWords.forEach(word => {
            if (lowerText.includes(word)) {
                window.searchDictionary.add(word);
            }
        });

        // 2. การสกัดคำเดี่ยวภาษาอังกฤษหรือคำที่มีช่องว่างตามแนวทางปกติ
        const tokens = text.split(/[\s\n\r\t\(\)\[\]\{\}"'\/\\,\.\-\?\!]+/);
        tokens.forEach(t => {
            const cleanT = t.trim().toLowerCase();
            if (cleanT.length > 1 && isNaN(cleanT)) {
                window.searchDictionary.add(cleanT);
            }
        });
    });
    console.log(`Dictionary built with ${window.searchDictionary.size} words.`);
};

window.levenshtein = function (a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

window.findSuggestions = function (term) {
    term = term.toLowerCase().replace(/["“”]/g, '');
    if (term.length < 2) return [];

    const suggestions = [];
    const maxDistance = Math.floor(term.length * 0.4);

    for (const word of window.searchDictionary) {
        if (word.includes(term) && word !== term) {
            suggestions.push({ word: word, score: 0.1, type: 'subset' });
        } else {
            const dist = window.levenshtein(term, word);
            if (dist <= maxDistance) {
                suggestions.push({ word: word, score: dist, type: 'fuzzy' });
            }
        }
    }

    suggestions.sort((a, b) => a.score - b.score);
    return suggestions.slice(0, 5).map(s => s.word);
};

window.highlight = function (text) {
    if (!text) return "";
    let highlightedText = String(text);

    for (const term in window.APP.termColors) {
        if (!term) continue;
        const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeTerm})`, 'gi');
        const color = window.APP.termColors[term];

        highlightedText = highlightedText.replace(regex, `<mark style="background-color: ${color}; color: #000; padding: 0 2px; border-radius: 2px;">$1</mark>`);
    }
    return highlightedText;
};

window.performSearch = function () {
    for (const member in window.APP.termColors) delete window.APP.termColors[member];
    window.APP.colorIndex = 0;

    let searchTerm = $('#search-input').val().trim();

    if (searchTerm === '""' || !searchTerm) {
        $('#search-results-container').html('<p class="small-text">กรุณาป้อนคำเพื่อค้นหา</p>');
        $('#search-suggestions-container').hide();
        return;
    }

    const rawTerms = searchTerm.match(/(?:[^\s"Standard]+|"[^"]*"|“[^”]*”)+/g) || [];
    const terms = rawTerms.map(term => term.replace(/^["“”]|["“”]$/g, ''));
    const operators = ['and', 'or', 'not'];

    terms.forEach(term => {
        const lowerTerm = term.toLowerCase();
        if (!operators.includes(lowerTerm) && lowerTerm.length > 1) {
            window.APP.termColors[lowerTerm] = colors[window.APP.colorIndex % colors.length];
            window.APP.colorIndex++;
        }
    });

    let searchResults = window.APP.allQuestions.filter(q => {
        let includeQuestion = false;
        let currentOperator = 'or';
        if (terms.length === 0) return false;

        for (let i = 0; i < terms.length; i++) {
            const term = terms[i].toLowerCase();
            if (operators.includes(term)) {
                currentOperator = term;
            } else {
                const termInAny = (q.answer + q.problem + q.choices + (q.explain || "")).toLowerCase().includes(term);
                if (i === 0 || (i === 1 && operators.includes(terms[0].toLowerCase()))) {
                    includeQuestion = (currentOperator === 'not') ? !termInAny : termInAny;
                } else {
                    if (currentOperator === 'and') includeQuestion = includeQuestion && termInAny;
                    else if (currentOperator === 'or') includeQuestion = includeQuestion || termInAny;
                    else if (currentOperator === 'not') includeQuestion = includeQuestion && !termInAny;
                }
                currentOperator = 'or';
            }
        }
        return includeQuestion;
    });

    searchResults.sort((a, b) => {
        const getScore = (q) => {
            let score = 0;
            terms.filter(t => !operators.includes(t.toLowerCase())).forEach(t => {
                const term = t.toLowerCase();
                if (q.answer && q.answer.toLowerCase().includes(term)) score = Math.max(score, 100);
                else if (q.problem && q.problem.toLowerCase().includes(term)) score = Math.max(score, 50);
                else if (q.choices && q.choices.toLowerCase().includes(term)) score = Math.max(score, 20);
                else if (q.explain && q.explain.toLowerCase().includes(term)) score = Math.max(score, 10);
            });
            return score;
        };
        return getScore(b) - getScore(a);
    });

    const questionTexts = new Set();
    searchResults = searchResults.filter(q => {
        const key = (q.problem || '') + (q.choices || '');
        if (questionTexts.has(key)) return false;
        questionTexts.add(key);
        return true;
    });

    if (searchResults.length === 0) {
        $('#search-results-container').html('<p class="small-text">ไม่พบผลลัพธ์ที่ตรงกัน</p>');
        return;
    }

    let cardsHtml = `<p class="small-text" style="color: #28a745; font-weight: bold; width: 100%;">พบ ${searchResults.length} ข้อ</p>
                     <div class="search-results-grid">`;

    searchResults.forEach((q, index) => {
        let categoryLabel = 'Unknown';
        if (window.APP.globalStructure.category) {
            const found = window.APP.globalStructure.category.find(t =>
                Array.isArray(q.category) ? q.category.includes(t.categoryId) : q.category === t.categoryId
            );
            if (found) categoryLabel = found.categoryName;
        }

        let problemImgs = '';
        if (q.img) {
            const imgArray = q.img.split('///').map(url => url.trim()).filter(Boolean);
            if (imgArray.length > 0) {
                problemImgs = `
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
                    const $card = $(`.search-card[data-search-idx="${index}"]`);
                    $card.data('imgArray', imgArray);

                    let currentIdx = 0;
                    const $mainImg = $card.find('.search-gallery-main-img');
                    const $counter = $card.find('.search-gallery-counter');
                    const $prevBtn = $card.find('.search-gallery-prev');
                    const $nextBtn = $card.find('.search-gallery-next');

                    $prevBtn.on('click', function (e) {
                        e.preventDefault();
                        currentIdx = (currentIdx - 1 + imgArray.length) % imgArray.length;
                        $mainImg.attr('src', window.transformUrl(imgArray[currentIdx]));
                        $counter.text(`${currentIdx + 1} / ${imgArray.length}`);
                    });

                    $nextBtn.on('click', function (e) {
                        e.preventDefault();
                        currentIdx = (currentIdx + 1) % imgArray.length;
                        $mainImg.attr('src', window.transformUrl(imgArray[currentIdx]));
                        $counter.text(`${currentIdx + 1} / ${imgArray.length}`);
                    });

                    $mainImg.on('click', function () {
                        window.open(window.transformUrl(imgArray[currentIdx]), '_blank');
                    });
                }, 50);
            }
        }

        const choicesList = q.choices ? q.choices.split('///').map(c => {
            const trimmed = c.trim();
            if (window.isUrl(trimmed)) return `<li><img src="${window.transformUrl(trimmed)}" style="height:40px;"></li>`;
            if (trimmed.startsWith('<svg')) return `<li><div style="height:40px;">${trimmed}</div></li>`;
            return `<li>${window.highlight(trimmed)}</li>`;
        }).join('') : '';

        let answerDisplay = window.isUrl(q.answer) ? `<img src="${window.transformUrl(q.answer)}" style="max-height:60px;">` : window.highlight(q.answer);

        cardsHtml += `
            <div class="search-card" data-search-idx="${index}">
                <div class="search-card-header">
                    <span class="search-card-category">${categoryLabel}</span>
                    <span class="search-card-relevance">Match</span>
                </div>
                <div class="search-card-body">
                    <div class="search-card-problem">${window.highlight(q.problem).replace(/\n/g, '<br>')}</div>
                    ${problemImgs}
                    <ul class="search-card-choices">${choicesList}</ul>
                </div>
                <div class="search-card-answer">
                    <b>เฉลย:</b>
                    <div class="search-card-answer-val">${answerDisplay}</div>
                </div>
                ${q.explain ? `
                <div class="search-card-footer">
                    <b>คำอธิบาย:</b><br>
                    ${window.highlight(q.explain).replace(/\n/g, '<br>')}
                </div>` : ''}
                <div class="search-card-actions">
                    <button class="btn-search-action btn-search-report" data-idx="${index}">
                        <i class="fas fa-exclamation-triangle"></i> แจ้งปัญหา
                    </button>
                    <button class="btn-search-action btn-search-vote" data-idx="${index}">
                        <i class="fas fa-tags"></i> แยกเลค
                    </button>
                </div>
            </div>`;
    });

    cardsHtml += `</div>`;
    $('#search-results-container').html(cardsHtml);

    $('.btn-search-report').on('click', function () {
        const idx = $(this).data('idx');
        window.openReportModal(searchResults[idx]);
    });

    $('.btn-search-vote').on('click', function () {
        const idx = $(this).data('idx');
        window.openVoteModal(searchResults[idx], false);
    });

    window.renderAllMath();
};

// ระบบแสดงคำแนะนำคำค้นหาเมื่อมีการพิมพ์ในช่องค้นหา
$('#search-input').on('input', function () {
    const query = $(this).val().trim();
    const $suggContainer = $('#search-suggestions-container');
    const $chips = $('#suggestion-chips');

    if (query.length < 2) {
        $suggContainer.hide();
        return;
    }

    const terms = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    if (terms.length === 0) {
        $suggContainer.hide();
        return;
    }
    const lastTerm = terms[terms.length - 1];
    if (lastTerm.startsWith('"') || lastTerm.startsWith('“')) {
        $suggContainer.hide();
        return;
    }

    const suggs = window.findSuggestions(lastTerm);
    if (suggs.length === 0) {
        $suggContainer.hide();
    } else {
        $chips.empty();
        suggs.forEach(s => {
            $chips.append(`<span class="suggestion-chip" data-word="${s}">
                    <span class="original-term">${lastTerm}</span> <i class="fas fa-arrow-right"></i> <b>${s}</b>
                </span>`);
        });
        $suggContainer.show();
    }
});

// เมื่อผู้ใช้คลิกเลือกคำแนะนำอัจฉริยะ (Suggestion Chips)
$(document).on('click', '.suggestion-chip', function () {
    const word = $(this).data('word');
    const currentVal = $('#search-input').val();
    const terms = currentVal.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    if (terms.length > 0) {
        terms[terms.length - 1] = word;
        $('#search-input').val(terms.join(' ') + ' ');
        window.performSearch();
        $('#search-input').focus();
    }
});