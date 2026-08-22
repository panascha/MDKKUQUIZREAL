// REFACTOR/js/search.js

window.searchDictionary = new Set();
const colors = ['#FFECB3', '#FFCDD2', '#C8E6C9', '#BBDEFB', '#D1C4E9', '#FFE0B2', '#F0F4C3', '#DCEDC8', '#FFCCBC', '#D7CCC8'];

// LRU Cache ขนาด 100 รายการสำหรับเก็บผลลัพธ์คำแนะนำการสะกดคำ
const _fuzzyCache = new Map();
const _FUZZY_CACHE_MAX = 100;

window.buildSearchDictionary = function () {
    window.searchDictionary.clear();
    console.log("Building Search Dictionary...");

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

        commonThaiWords.forEach(word => {
            if (lowerText.includes(word)) {
                window.searchDictionary.add(word);
            }
        });

        const tokens = text.split(/[\s\n\r\t\(\)\[\]\{\}"'\/\\,\.\-\?\!]+/);
        tokens.forEach(t => {
            const cleanT = t.trim().toLowerCase();
            if (cleanT.length > 1 && isNaN(cleanT)) {
                window.searchDictionary.add(cleanT);
            }
        });
    });
    console.log(`Dictionary built with ${window.searchDictionary.size} words.`);
    _fuzzyCache.clear();
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
    // T3.2: Lazy build — สร้าง Dictionary เมื่อมีการค้นหาจริงครั้งแรก
    if (window.searchDictionaryDirty || window.searchDictionary.size === 0) {
        window.buildSearchDictionary();
        window.searchDictionaryDirty = false;
    }
    term = term.toLowerCase().replace(/["“”]/g, '').trim();
    if (term.length < 2) return [];

    // ตรวจสอบความสอดคล้องว่าตรงตามตัวอักษรแบบเป๊ะๆ หรือไม่ ทั้งในพจนานุกรมหลักและเนื้อหาข้อสอบทั้งหมด
    const isExactMatch = window.searchDictionary.has(term) || window.APP.allQuestions.some(q => {
        const fullText = `${q.problem || ''} ${q.choices || ''} ${q.explain || ''} ${q.answer || ''}`.toLowerCase();
        return fullText.includes(term);
    });

    // หากพบคำตรงตัวแล้ว จะไม่เสนอคำอื่นเพิ่มเติมเพื่อจำกัดขอบเขตการค้นหาให้ตรงจุดที่สุด
    if (isExactMatch) {
        return [];
    }

    // หากคำค้นหามีหลายคำ (มีช่องว่างระหว่างคำ) และไม่มีการจับคู่ตรงตัวเป๊ะ
    // ให้ดึงคำแนะนำสะกดคำสำหรับทุกๆ คำในวลีนั้นออกมารวมกันแทนการดูแค่คำเดี่ยวๆ
    if (term.includes(' ')) {
        const words = term.split(/\s+/).filter(w => w.length > 1);
        let combinedSuggestions = [];
        const seen = new Set();

        words.forEach(word => {
            const wordSuggs = window.findSuggestions(word);
            wordSuggs.forEach(s => {
                if (!seen.has(s)) {
                    seen.add(s);
                    combinedSuggestions.push(s);
                }
            });
        });
        return combinedSuggestions.slice(0, 5);
    }

    if (_fuzzyCache.has(term)) {
        const cachedVal = _fuzzyCache.get(term);
        _fuzzyCache.delete(term);
        _fuzzyCache.set(term, cachedVal);
        return cachedVal;
    }

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
    const result = suggestions.slice(0, 5).map(s => s.word);

    if (_fuzzyCache.size >= _FUZZY_CACHE_MAX) {
        _fuzzyCache.delete(_fuzzyCache.keys().next().value);
    }
    _fuzzyCache.set(term, result);

    return result;
};

window.highlight = function (text) {
    if (!text) return "";
    let highlightedText = String(text);

    // 1. If there are no terms to highlight, return original text immediately
    if (!window.APP.termColors || Object.keys(window.APP.termColors).length === 0) {
        return highlightedText;
    }

    // 2. Sort terms by length in descending order to match longer terms/phrases first
    const terms = Object.keys(window.APP.termColors)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    if (terms.length === 0) return highlightedText;

    // 3. Escape regex special characters in the search terms
    const evaporatedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // 4. Create a single-pass regular expression combining all terms
    const regex = new RegExp(`(${evaporatedTerms.join('|')})`, 'gi');

    // 5. Tokenize the text to separate HTML tags from plain text.
    // HTML tags end up in odd indices of the split array; plain text in even indices.
    const tokens = highlightedText.split(/(<[^>]+>)/g);

    // 6. Run replacement ONLY on the plain text tokens (even indices)
    for (let i = 0; i < tokens.length; i += 2) {
        if (!tokens[i]) continue;
        tokens[i] = tokens[i].replace(regex, (match) => {
            const lowerMatch = match.toLowerCase();
            const color = window.APP.termColors[lowerMatch];
            if (!color) return match; // Fallback if no matching color is found
            return `<mark style="background-color: ${color}; color: #000; padding: 0 2px; border-radius: 2px;">${match}</mark>`;
        });
    }

    // 7. Reassemble the tokens back into a single clean string
    return tokens.join('');
};

window.performSearch = function () {
    // T3.2: Lazy build — สร้าง Dictionary เมื่อมีการค้นหาจริงครั้งแรก
    if (window.searchDictionaryDirty || window.searchDictionary.size === 0) {
        window.buildSearchDictionary();
        window.searchDictionaryDirty = false;
    }
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

    // ตัวดำเนินการมาตรฐานสำหรับคัดกรอง
    const operators = ['and', 'or', 'not'];

    // [ขั้นตอนที่ 1] สร้าง fuzzyMap ข้ามตัวดำเนินการ (Case-Insensitive)
    const fuzzyMap = {};
    terms.forEach(term => {
        const lowerTerm = term.toLowerCase();
        if (!operators.includes(lowerTerm) && lowerTerm.length > 1) {
            const suggestions = window.findSuggestions(lowerTerm);
            fuzzyMap[lowerTerm] = [lowerTerm, ...suggestions];
        }
    });

    // [ขั้นตอนที่ 2] กำหนดสีไฮไลต์ ข้ามตัวดำเนินการ (Case-Insensitive)
    terms.forEach(term => {
        const lowerTerm = term.toLowerCase();
        if (operators.includes(lowerTerm) || lowerTerm.length <= 1) return;

        const color = colors[window.APP.colorIndex % colors.length];
        window.APP.termColors[lowerTerm] = color;
        window.APP.colorIndex++;

        const variations = fuzzyMap[lowerTerm] || [];
        variations.forEach(v => {
            if (!window.APP.termColors[v]) {
                window.APP.termColors[v] = color;
            }
        });
    });

    // [ขั้นตอนที่ 3] คัดกรองข้อสอบ (ตัวดำเนินการรองรับ Case-Insensitive)
    let searchResults = window.APP.allQuestions.filter(q => {
        let includeQuestion = false;
        let currentOperator = 'and';
        if (terms.length === 0) return false;

        const searchableText = ((q.answer || '') + (q.problem || '') + (q.choices || '') + (q.explain || '')).toLowerCase();

        for (let i = 0; i < terms.length; i++) {
            const term = terms[i].toLowerCase();
            if (operators.includes(term)) {
                currentOperator = term;
            } else {
                const variations = fuzzyMap[term] || [term];
                const termInAny = variations.some(v => searchableText.includes(v));

                if (i === 0 || (i === 1 && operators.includes(terms[0].toLowerCase()))) {
                    includeQuestion = (currentOperator === 'not') ? !termInAny : termInAny;
                } else {
                    if (currentOperator === 'and') includeQuestion = includeQuestion && termInAny;
                    else if (currentOperator === 'or') includeQuestion = includeQuestion || termInAny;
                    else if (currentOperator === 'not') includeQuestion = includeQuestion && !termInAny;
                }
                currentOperator = 'and';
            }
        }
        return includeQuestion;
    });

    // [ขั้นตอนที่ 4] จัดอันดับตามความเกี่ยวข้องเป็นหลัก (เจอในเฉลย > โจทย์ > ตัวเลือก > คำอธิบาย)
    // หากคะแนนความเกี่ยวข้องเท่ากัน ให้เรียงตามปีข้อสอบจากใหม่ไปเก่า
    const _rankCache = new Map();
    const getRank = (q) => {
        if (_rankCache.has(q)) return _rankCache.get(q);

        let score = 0;
        terms.filter(t => !operators.includes(t.toLowerCase())).forEach(t => {
            const term = t.toLowerCase();
            const variations = fuzzyMap[term] || [term];

            variations.forEach((v, idx) => {
                const weight = idx === 0 ? 1.0 : 0.3;

                let baseScore = 0;
                if (q.answer && q.answer.toLowerCase().includes(v)) baseScore = 100;
                else if (q.problem && q.problem.toLowerCase().includes(v)) baseScore = 50;
                else if (q.choices && q.choices.toLowerCase().includes(v)) baseScore = 20;
                else if (q.explain && q.explain.toLowerCase().includes(v)) baseScore = 10;

                score = Math.max(score, baseScore * weight);
            });
        });

        const meta = typeof window.parseQuestionMetadata === 'function' ? window.parseQuestionMetadata(q) : { year: "N/A" };
        const rank = { score: score, year: parseInt(meta.year) || 0 };
        _rankCache.set(q, rank);
        return rank;
    };

    searchResults.sort((a, b) => {
        const rankA = getRank(a);
        const rankB = getRank(b);

        // 1. คะแนนความเกี่ยวข้องมากไปน้อย (เฉลย > โจทย์ > ตัวเลือก > คำอธิบาย)
        if (rankA.score !== rankB.score) {
            return rankB.score - rankA.score;
        }

        // 2. คะแนนเท่ากัน → ปีใหม่ไปเก่า
        return rankB.year - rankA.year;
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

    const expandedTerms = [];
    for (const key in fuzzyMap) {
        const variations = fuzzyMap[key] || [];
        variations.slice(1).forEach(v => {
            if (v !== key && !expandedTerms.includes(v)) {
                expandedTerms.push(v);
            }
        });
    }

    let fuzzyNoticeHtml = '';
    if (expandedTerms.length > 0) {
        fuzzyNoticeHtml = `
            <p class="small-text" style="color: var(--color-text-muted); font-size: 1rem; text-align: center; margin-top: -8px; margin-bottom: 12px; width: 100%;">
                <i class="fas fa-info-circle"></i> รวมผลลัพธ์จากคำสะกดใกล้เคียง: 
                ${expandedTerms.map(t => `<b style="color: var(--color-primary);">${t}</b>`).join(', ')}
            </p>`;
    }

    let cardsHtml = `
        <p class="small-text" style="color: #28a745; font-weight: bold; width: 100%; margin-bottom: 8px;">พบ ${searchResults.length} ข้อ</p>
        ${fuzzyNoticeHtml}
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

        const choicesList = q.choices ? q.choices.split('///').map((c, ci) => {
            const trimmed = c.trim();
            const hasPrefix = /^[A-E]\s*[\.\)]/i.test(trimmed);
            const prefix = hasPrefix ? "" : (String.fromCharCode(65 + ci) + ". ");

            if (window.isUrl(trimmed)) return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}</span><img src="${window.transformUrl(trimmed)}" style="height:40px;"></li>`;
            if (trimmed.startsWith('<svg')) return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}</span><div style="height:40px;">${trimmed}</div></li>`;
            return `<li style="display: flex; align-items: center; gap: 4px;"><span>${prefix}${window.highlight(trimmed)}</span></li>`;
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
                    ${window.renderExplainHtmlForSearchCard(q.explain)}
                </div>` : ''}
                <div class="search-card-actions">
                    <button class="btn-search-action btn-search-report" data-idx="${index}">
                        <i class="fas fa-exclamation-triangle"></i> แจ้งปัญหา
                    </button>
                    <button class="btn-search-action btn-search-vote" data-idx="${index}">
                        <i class="fas fa-tags"></i> แยกเลค
                    </button>
                    <button class="btn-search-action btn-search-edit" data-idx="${index}">
                        <i class="fas fa-edit"></i> แก้ไข
                    </button>
                    <button class="btn-search-action btn-search-copy" data-idx="${index}" title="คัดลอกโจทย์และตัวเลือกไปถาม AI">
                        <i class="fas fa-copy"></i> คัดลอกคำถาม
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

    // ปุ่มแก้ไขบนการ์ดผลค้นหา — แสดงเฉพาะโหมดแก้ไข (ควบคุมด้วย CSS body.edit-mode-active)
    $('.btn-search-edit').on('click', function () {
        const idx = $(this).data('idx');
        window.openEditModal(searchResults[idx]);
    });

    $('.btn-search-copy').on('click', function () {
        const idx = $(this).data('idx');
        window.copyQuestionPrompt(searchResults[idx]);
    });

    window.renderAllMath();

    // Glossary: ขีดเส้นใต้ศัพท์ที่เคยแปลแล้วในผลค้นหา (แตะ = popup) — โหลดคลังศัพท์ครั้งแรกถ้ายังไม่ได้โหลด
    if (typeof window.markGlossaryTerms === 'function') {
        if (!window.APP._glossaryLoaded && !window.APP._glossaryLoading &&
            (!window.APP._glossaryLastAttempt || Date.now() - window.APP._glossaryLastAttempt > 60000)) {
            window.loadGlossary(new URLSearchParams(location.search).get('subject') || '');
        }
        setTimeout(window.markGlossaryTerms, 120);
    }
};

// ─── OPTIMIZATION: ปรับปรุงการวิเคราะห์คำและสกัดคำแนะนำแบบพิกัดเคอร์เซอร์ (Caret-Aware Suggestions) ───
let _suggestDebounceTimer = null;
$('#search-input').on('input', function () {
    const $input = $(this);
    const inputEl = $input[0];

    clearTimeout(_suggestDebounceTimer);
    _suggestDebounceTimer = setTimeout(function () {
        const query = $input.val();
        const caretPos = inputEl.selectionStart || 0;
        const $suggContainer = $('#search-suggestions-container');
        const $chips = $('#suggestion-chips');

        if (!query.trim() || query.length < 2) {
            $suggContainer.hide();
            return;
        }

        let searchWord = '';
        let isQuoted = false;

        // ตรวจสอบว่ามีกลุ่มคำที่อยู่ภายในอัญประกาศคู่ " " หรือไม่
        const quoteMatch = query.match(/["“]([^"”]*)["”]/);
        if (quoteMatch) {
            const insideQuotes = quoteMatch[1].trim();
            if (insideQuotes.length >= 2) {
                searchWord = insideQuotes;
                isQuoted = true;
            }
        }

        let start = 0, end = 0;
        if (!isQuoted) {
            // หาตำแหน่งและขอบเขตคำเดี่ยวตามตำแหน่งเคอร์เซอร์ปกติ
            start = query.lastIndexOf(' ', caretPos - 1) + 1;
            end = query.indexOf(' ', caretPos);
            if (end === -1) end = query.length;
            searchWord = query.substring(start, end).trim();
        }

        const upperWord = searchWord.toUpperCase();

        // [ความต้องการ] ตัวเชื่อม Operators (AND, OR, NOT) จะไม่แสดงคำแนะนำสะกดคำ
        if (upperWord === 'AND' || upperWord === 'OR' || upperWord === 'NOT' || searchWord.length < 2) {
            $suggContainer.hide();
            return;
        }

        // หลีกเลี่ยงการสะกิดเมื่ออยู่ในเครื่องหมายคำพูดเดี่ยวๆ หรือเปิดค้างไว้
        if (!isQuoted && (searchWord.startsWith('"') || searchWord.startsWith('“'))) {
            $suggContainer.hide();
            return;
        }

        const suggs = window.findSuggestions(searchWord);
        if (suggs.length === 0) {
            $suggContainer.hide();
        } else {
            $input.data('replace-range', { start: start, end: end });

            $chips.empty();
            suggs.forEach(s => {
                // หาคำต้นฉบับในช่องป้อนข้อมูลที่สอดคล้อง/สะกดผิดใกล้เคียงกับคำแนะนำนี้ที่สุดเพื่อความเข้าใจง่าย
                const wordsInQuery = query.split(/[\s"“‘”’\(\)\[\]\{\}]+/);
                let originalWord = searchWord;
                let minD = 999;

                wordsInQuery.forEach(w => {
                    const cleanW = w.replace(/[^a-zA-Z0-9ก-๙]/g, '').trim();
                    if (cleanW.length >= 2) {
                        const d = window.levenshtein(s, cleanW.toLowerCase());
                        if (d < minD) {
                            minD = d;
                            originalWord = cleanW;
                        }
                    }
                });

                $chips.append(`<span class="suggestion-chip" data-word="${s}">
                        <span class="original-term">${originalWord}</span> <i class="fas fa-arrow-right"></i> <b>${s}</b>
                    </span>`);
            });
            $suggContainer.show();
        }
    }, 250);
});

$(document).on('click', '.suggestion-chip', function () {
    const word = $(this).data('word');
    const $input = $('#search-input');
    const val = $input.val();

    // ค้นหาคำในช่องค้นหาที่มีความคล้ายกับคำแนะนำมากที่สุดเพื่อเขียนทับแบบเจาะจงเฉพาะจุดที่สะกดผิด
    const words = val.split(/([\s"“‘”’\(\)\[\]\{\}]+)/);
    let bestIdx = -1;
    let minDistance = 999;

    for (let i = 0; i < words.length; i++) {
        const cleanW = words[i].replace(/[^a-zA-Z0-9ก-๙]/g, '').trim();
        if (cleanW.length >= 2) {
            const dist = window.levenshtein(word, cleanW.toLowerCase());
            if (dist < minDistance) {
                minDistance = dist;
                bestIdx = i;
            }
        }
    }

    if (bestIdx !== -1 && minDistance <= 3) {
        words[bestIdx] = word;
        $input.val(words.join(''));
        window.performSearch();
        $('#search-suggestions-container').hide();
        $input.focus();
    } else {
        // แผนสำรองกรณีค้นหาเพื่อสลับจุดสะกดผิดดั้งเดิมไม่สำเร็จ
        const range = $input.data('replace-range');
        if (range) {
            const newVal = val.substring(0, range.start) + word + val.substring(range.end);
            $input.val(newVal);
            window.performSearch();
            $('#search-suggestions-container').hide();
            $input.focus();
        }
    }
});

window.renderExplainHtmlForSearchCard = function (explainRaw) {
    if (!explainRaw) return '';
    const parsed = window.parseExplain(explainRaw);
    // render Markdown ก่อนเสมอ แล้วค่อย highlight — window.highlight ข้าม token ที่เป็น HTML tag อยู่แล้ว
    // (ถ้าไม่มี search terms window.highlight จะคืนค่าเดิมทันที)
    const textHtml = window.highlight(window.renderMarkdownSafe(parsed.text));
    let html = `<b>คำอธิบาย:</b><br>${textHtml || 'ไม่มีคำอธิบาย'}`;

    if (parsed.media && parsed.media.length > 0) {
        html += `<div class="explain-media-group" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px; width: 100%;">`;

        let images = [];
        let pdfs = [];
        let svgs = [];

        parsed.media.forEach(url => {
            const type = window.getMediaType(url);
            if (type === 'pdf') pdfs.push(url);
            else if (type === 'svg') svgs.push(url);
            else images.push(url);
        });

        svgs.forEach(svg => {
            html += `<div class="svg-render-area" onclick="viewFullImageSVG(this, event)" style="cursor: pointer; max-height: 100px; width: auto; background: white; border: 1px solid var(--color-border); border-radius: 4px;">${svg}</div>`;
        });

        if (images.length > 0) {
            html += `<div class="explain-image-gallery">`;
            images.forEach(img => {
                const transformed = window.transformUrl(img);
                html += `<img src="${transformed}" class="explain-img-thumb" onclick="viewFullImage('${transformed}', event)">`;
            });
            html += `</div>`;
        }

        pdfs.forEach(pdf => {
            const transformed = window.transformUrl(pdf);
            html += `
                <a href="${transformed}" target="_blank" class="btn btn-outline-primary btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; font-size: 0.95rem; padding: 6px 12px; border-radius: 6px; text-decoration: none; border: 1.5px solid var(--color-primary); color: var(--color-primary); background: var(--color-primary-pale); transition: all 0.15s;">
                    <i class="fas fa-file-pdf text-danger" style="font-size: 1.1rem;"></i> เปิดดู PDF แนบ
                </a>
            `;
        });

        html += `</div>`;
    }
    return html;
};