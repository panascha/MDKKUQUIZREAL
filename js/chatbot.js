// REFACTOR/js/chatbot.js — AI chat & retrieval engine

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
