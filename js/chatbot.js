// REFACTOR/js/chatbot.js — AI chat & retrieval engine

// จำแนกประเภทคำถามนิสิต (keyword heuristic ไทย/อังกฤษ) → ใช้เลือกโมเดลอัตโนมัติ
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
window.sendChatbotQuery = async function () {
    var query = $('#chatbot-input').val().trim();
    if (!query) return;

    var q = window.APP.current_question;
    var model = $('#chatbot-model-select').val();
    var autoTask = null;
    if (!model || model === '__auto__') {
        autoTask = window.classifyQueryTask(query);
        model = window.pickAutoModel(autoTask.key);
    }
    var token = localStorage.getItem("mdkku_session_token") || "guest_user";

    $('#chatbot-input').val('').prop('disabled', true);
    $('#btn-send-chat').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

    var $conv = $('#chatbot-conversation');
    $conv.append(
        '<div style="align-self:flex-end;background:var(--color-primary-pale);color:var(--color-primary);' +
        'padding:8px 12px;border-radius:12px 12px 0 12px;max-width:85%;font-weight:600;">' +
        $('<div>').text(query).html() + '</div>'  // XSS-safe: escape user input before inserting
    );
    $conv.scrollTop($conv[0].scrollHeight);

    // พับประวัติบทสนทนา (session memory) เข้า prompt — backend stateless จึงต้องส่งเป็นข้อความเดียว
    var histText = '';
    if (window._chatHistory && window._chatHistory.length) {
        var turns = window._chatHistory.slice(-10).map(function (t) {
            return (t.role === 'user' ? 'นิสิต' : 'AI') + ': ' + String(t.text || '').slice(0, 1000);
        });
        histText = turns.join('\n');
        while (histText.length > 5000 && turns.length > 1) {
            turns.shift();
            histText = turns.join('\n');
        }
    }

    var prompt =
        'คุณคืออาจารย์แพทย์ ช่วยตอบคำถามของนิสิตแพทย์โดยอธิบายด้วยความสุภาพ อิงพยาธิสรีรวิทยา (Pathophysiology) เป็นหลัก\n\n' +
        (histText ? ('บทสนทนาก่อนหน้า (ล่าสุดอยู่ล่างสุด):\n' + histText + '\n\n') : '') +
        'โจทย์ข้อสอบ: "' + (q.problem || '') + '"\n' +
        'ตัวเลือก: "' + (q.choices || '') + '"\n' +
        'เฉลย: "' + (q.answer || '') + '"\n' +
        'คำอธิบาย: "' + (q.explain || '') + '"\n' +
        '(บริบทโจทย์ด้านบนคือข้อปัจจุบันที่นิสิตกำลังดูอยู่ตอนนี้)\n\n' +
        'คำถามใหม่จากนิสิต: "' + query + '"\n\n' +
        'กรุณาตอบกระชับ ตรงประเด็น ภาษาไทย';

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
        $('#chatbot-input').prop('disabled', false).focus();
        $('#btn-send-chat').prop('disabled', false).html('<i class="fas fa-paper-plane"></i>');
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
