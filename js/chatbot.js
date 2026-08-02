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
    if (open && (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn)) {
        window.showGoogleSignInModal('เข้าสู่ระบบเพื่อใช้ MDKKUQUIZ AI Passport EIEI');
        return;
    }
    document.body.classList.toggle('chatbot-open', open);
    try { localStorage.setItem('mdkku_chatbot_open', open ? '1' : '0'); } catch (e) { }
    if (open) {
        window.applyChatbotWidth();
        setTimeout(function () { $('#chatbot-input').trigger('focus'); }, 260);
    }
};

// Resize handle: drag left edge เพื่อปรับความกว้างของ panel (min 300px, max 65vw)
// ค่าถูกเก็บใน localStorage และ sync กับ CSS variable --chatbot-dock-w
window.applyChatbotWidth = function () {
    var w = 380;
    try { var v = localStorage.getItem('mdkku_chatbot_w'); if (v) w = parseInt(v, 10) || 380; } catch (e) { }
    w = Math.max(300, Math.min(w, Math.floor(window.innerWidth * 0.65)));
    document.documentElement.style.setProperty('--chatbot-dock-w', w + 'px');
};

$(document).on('mousedown', '#chatbot-resize-handle', function (e) {
    e.preventDefault();
    var $panel = $('#quiz-chatbot-panel');
    var startX = e.clientX;
    var startW = $panel.width();
    var $handle = $(this);
    $handle.addClass('dragging');
    var rafPending = null;

    function onMove(ev) {
        if (!rafPending) {
            rafPending = requestAnimationFrame(function () {
                rafPending = null;
                var delta = startX - ev.clientX;
                var newW = Math.max(300, Math.min(startW + delta, Math.floor(window.innerWidth * 0.65)));
                document.documentElement.style.setProperty('--chatbot-dock-w', newW + 'px');
            });
        }
    }

    function onUp(ev) {
        if (rafPending) { cancelAnimationFrame(rafPending); rafPending = null; }
        $(document).off('mousemove', onMove).off('mouseup', onUp);
        $handle.removeClass('dragging');
        var finalW = $panel.width();
        try { localStorage.setItem('mdkku_chatbot_w', finalW); } catch (e) { }
    }

    $(document).on('mousemove', onMove).on('mouseup', onUp);
});

$(document).on('touchstart', '#chatbot-resize-handle', function (e) {
    e.preventDefault();
    var $panel = $('#quiz-chatbot-panel');
    var startX = e.originalEvent.touches[0].clientX;
    var startW = $panel.width();
    var $handle = $(this);
    $handle.addClass('dragging');

    var rafPendingTouch = null;
    function onMove(ev) {
        var touchX = ev.originalEvent.touches[0].clientX;
        if (!rafPendingTouch) {
            rafPendingTouch = requestAnimationFrame(function () {
                rafPendingTouch = null;
                var delta = startX - touchX;
                var newW = Math.max(300, Math.min(startW + delta, Math.floor(window.innerWidth * 0.65)));
                document.documentElement.style.setProperty('--chatbot-dock-w', newW + 'px');
            });
        }
    }

    function onUp() {
        if (rafPendingTouch) { cancelAnimationFrame(rafPendingTouch); rafPendingTouch = null; }
        $(document).off('touchmove', onMove).off('touchend', onUp);
        $handle.removeClass('dragging');
        var finalW = $panel.width();
        try { localStorage.setItem('mdkku_chatbot_w', finalW); } catch (e) { }
    }

    $(document).on('touchmove', onMove).on('touchend', onUp);
});

// Restore width on page load (before panel open)
$(document).ready(function () { window.applyChatbotWidth(); });

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
    window._chatTurns = {};   // snapshot ของเทิร์นเก่าไม่มีความหมายแล้ว ปุ่ม Retry หายไปพร้อมฟองแชท
    if (window.clearPendingImages) window.clearPendingImages();
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

// ── โหมดคำตอบ (Flash / Think) ────────────────────────────────────────────────
// mode คุมสองอย่าง: (1) คำสั่งรูปแบบคำตอบที่ต่อท้าย prompt (2) โมเดลที่เลือกเมื่ออยู่โหมด Auto
// ลำดับความสำคัญ: ถ้านิสิตเลือกโมเดลเองใน dropdown → โมเดลนั้นชนะเสมอ mode คุมแค่รูปแบบคำตอบ
window.CHAT_MODES = {
    flash: {
        labelTh: '⚡ Flash',
        taskKey: 'quick_fact',
        instr: 'ตอบสั้น กระชับ เป็น bullet ไม่เกิน 5 ข้อ เอาเฉพาะประเด็นที่ออกสอบบ่อย (high-yield) ห้ามเกริ่นนำ ห้ามสรุปซ้ำท้ายคำตอบ'
    },
    think: {
        labelTh: '🧠 Think',
        taskKey: 'reasoning_deep',
        instr: 'อธิบายเป็นลำดับเหตุ-ผล (causal chain) ตั้งแต่กลไกระดับเซลล์/พยาธิสรีรวิทยา ไปจนถึงอาการทางคลินิกและแนวทางเวชปฏิบัติ ' +
            'ถ้ามีตัวเลือกให้ไล่ตัดทีละข้อพร้อมเหตุผล และถ้าไม่แน่ใจให้บอกตรงๆ ว่าไม่แน่ใจ ห้ามเดาแบบมั่นใจ'
    }
};
window.CHAT_MODE_DEFAULT = 'think';

window.getChatMode = function () {
    try {
        var m = localStorage.getItem('mdkku_chat_mode');
        if (m && window.CHAT_MODES[m]) return m;
    } catch (e) { }
    return window.CHAT_MODE_DEFAULT;
};

window.setChatMode = function (mode) {
    if (!window.CHAT_MODES[mode]) return;
    try { localStorage.setItem('mdkku_chat_mode', mode); } catch (e) { }
    window.updateChatModeUI();
};

window.updateChatModeUI = function () {
    var cur = window.getChatMode();
    $('.chat-mode-btn').each(function () {
        var on = $(this).data('mode') === cur;
        $(this).toggleClass('active', on).attr('aria-pressed', on ? 'true' : 'false');
    });
};

// เลือกโมเดลที่อ่านรูปได้ — ต้องตรงกับ whitelist ฝั่ง backend (isVisionModel ใน intelsphere.gs)
// ถ้าไม่เจอเลย คืน null แล้วปล่อยให้ backend ตอบกลับว่าไม่ได้ส่งรูป (imagesSent=false)
window.VISION_MODEL_PREFS = [/^gemini-.*flash/, /^gemini-/, /^claude-sonnet/, /^claude-/, /^gpt-(4o|5)/, /^nova-(lite|pro)/];
window.pickVisionModel = function () {
    var ids = [];
    var cat = window._chatbotCatalog;
    if (cat) Object.keys(cat).forEach(function (p) { (cat[p] || []).forEach(function (id) { ids.push(id); }); });
    for (var i = 0; i < window.VISION_MODEL_PREFS.length; i++) {
        for (var j = 0; j < ids.length; j++) {
            if (window.VISION_MODEL_PREFS[i].test(ids[j])) return ids[j];
        }
    }
    return null;
};

// ── สถานะการยิงคำถาม ────────────────────────────────────────────────────────
window._chatAbort = null;   // AbortController ของเทิร์นที่กำลังรันอยู่
window._chatTurns = {};     // turnId → snapshot ของบริบทตอนกดส่ง (ใช้ตอน Retry)
window._chatTurnSeq = 0;

// สลับปุ่มส่ง ↔ ปุ่มหยุด
window.setChatBusy = function (busy) {
    $('#chatbot-input').prop('disabled', busy);
    $('#btn-send-chat').toggle(!busy);
    $('#btn-stop-chat').toggle(!!busy);
    if (!busy) $('#chatbot-input').trigger('focus');
};

// ปุ่มหยุด — ยกเลิกการ "รอ" เท่านั้น GAS ฝั่งเซิร์ฟเวอร์ยังรันต่อและโควต้าที่ใช้ไปแล้วไม่คืน
window.stopChatGeneration = function () {
    if (!window._chatAbort) return;
    var ctrl = window._chatAbort;
    var tid = window._chatCurrentTurnId;

    // ตอบสนอง UI ทันที: ถ้า abort ตกอยู่กลาง backoff sleep ของ sendWithRetry
    // กว่า catch จะทำงานอาจกินเวลาถึง 10 วิ — นิสิตจะนึกว่าปุ่มไม่ทำงาน
    if (tid) $('#chat-ai-' + tid).html(window.buildChatStoppedHtml(tid));
    window._chatAbort = null;
    window._chatCurrentTurnId = null;
    window.setChatBusy(false);
    ctrl.abort();
};

window.buildChatStoppedHtml = function (turnId) {
    return '<div style="align-self:flex-start;background:var(--color-surface-3);color:var(--color-text-muted);' +
        'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.85rem;">' +
        '⏹️ หยุดรอคำตอบแล้ว (โควต้าที่ใช้ไปรอบนี้ไม่ได้คืนนะ) ' +
        '<button type="button" class="chat-retry-btn" onclick="window.retryChatTurn(' + turnId + ')">↻ ถามใหม่</button></div>';
};

// เก็บ snapshot บริบทของข้อ ณ เวลาที่กดส่ง — Retry ต้องใช้ชุดนี้ ไม่ใช่ข้อที่เปิดอยู่ตอนกด Retry
window.snapshotQuestionCtx = function () {
    var q = window.APP.current_question || {};
    return {
        questionId: q.questionId || '',
        problem: q.problem || '',
        choices: q.choices || '',
        answer: q.answer || '',
        explain: q.explain || '',
        subject: new URLSearchParams(location.search).get('subject') || ''
    };
};

// URL รูปของข้อปัจจุบัน แปลงเป็นลิงก์สาธารณะ (lh3.googleusercontent.com) จำกัด 4 รูป
window.getCurrentQuestionImageUrls = function () {
    var q = window.APP.current_question || {};
    if (!q.img) return [];
    // transformUrl คืน URL ของ PDF/preview ตามเดิมโดยไม่แปลง (config.js) — ส่งไปเป็นรูปไม่ได้
    // ถ้าปล่อยไป gateway จะตอบ 400 แล้วเสีย call ของ donor key ฟรีๆ
    return String(q.img).split('///')
        .map(function (u) { return window.transformUrl(String(u).trim()); })
        .filter(function (u) { return u && /^https:\/\//.test(u) && !/\.pdf|\/preview/i.test(u); })
        .slice(0, 4);
};

// ปุ่ม "ให้ AI ช่วยอ่านภาพนี้" ข้างรูปโจทย์
window.askAiAboutQuestionImage = function () {
    var imgs = window.getCurrentQuestionImageUrls();
    if (!imgs.length) return;

    // toggleChatbotPanel จะ early-return + เปิด modal ล็อกอินถ้ายังไม่ได้ล็อกอิน
    // ต้องเช็คก่อนยิง ไม่งั้นคำถามจะถูกส่งเข้า panel ที่ไม่เคยเปิด
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        window.toggleChatbotPanel(true);
        return;
    }
    window.toggleChatbotPanel(true);

    // ไม่ยิงเองทันที — เติมคำถามให้แล้วให้นิสิตกดส่งเอง (1 คลิกพลาด = เสียโควต้า 1 ครั้งจาก 15/ชม.)
    $('#chatbot-input').val('ช่วยอ่านภาพในโจทย์ข้อนี้ให้หน่อย: เห็นอะไรบ้าง มี finding ที่สำคัญอะไร และเกี่ยวกับโจทย์ยังไง');
    window._chatPendingImages = imgs;
    $('#chatbot-img-chip').show().find('#chatbot-img-count').text(imgs.length);
    setTimeout(function () { $('#chatbot-input').trigger('focus'); }, 300);
};

window.clearPendingImages = function () {
    window._chatPendingImages = null;
    $('#chatbot-img-chip').hide();
};

// ส่งคำถามนิสิต + context ข้อสอบปัจจุบันไป askAIExpert (provider: IntelSphere)
window.sendChatbotQuery = function () {
    var query = $('#chatbot-input').val().trim();
    if (!query) return;
    if (window._chatAbort) return; // กันยิงซ้อนขณะยังรออยู่

    var turnId = ++window._chatTurnSeq;
    window._chatTurns[turnId] = {
        query: query,
        ctx: window.snapshotQuestionCtx(),
        imageUrls: window._chatPendingImages || [],
        mode: window.getChatMode(),
        chosenModel: $('#chatbot-model-select').val()
    };

    $('#chatbot-input').val('');
    window.clearPendingImages();

    var $conv = $('#chatbot-conversation');
    $conv.append(
        '<div style="align-self:flex-end;background:var(--color-primary-pale);color:var(--color-primary);' +
        'padding:8px 12px;border-radius:12px 12px 0 12px;max-width:85%;font-weight:600;">' +
        $('<div>').text(query).html() +   // XSS-safe: escape user input before inserting
        (window._chatTurns[turnId].imageUrls.length
            ? '<div style="font-size:0.75rem;opacity:0.85;margin-top:4px;">🖼️ แนบรูปโจทย์ ' + window._chatTurns[turnId].imageUrls.length + ' รูป</div>'
            : '') +
        '</div>'
    );
    $conv.append('<div id="chat-ai-' + turnId + '" class="chat-ai-slot"></div>');
    $conv.scrollTop($conv[0].scrollHeight);

    return window.runChatTurn(turnId);
};

// ยิงคำถามซ้ำด้วย snapshot เดิมเป๊ะๆ — ไม่หยิบข้อที่เปิดอยู่ปัจจุบันมาใช้
window.retryChatTurn = function (turnId) {
    var turn = window._chatTurns[turnId];
    if (!turn || window._chatAbort) return;
    // ลบคำตอบเก่าของเทิร์นนี้ออกจากประวัติก่อน ไม่งั้น context จะมีคำตอบซ้ำสองรอบ
    if (turn.histRefs) {
        turn.histRefs.forEach(function (ref) {
            var idx = window._chatHistory.indexOf(ref);
            if (idx >= 0) window._chatHistory.splice(idx, 1);
        });
        turn.histRefs = null;
    }
    return window.runChatTurn(turnId);
};

// สร้างต่อจากคำตอบที่ถูกตัด — ส่ง prompt ใหม่ที่ขอให้ AI ตอบต่อจากเดิม โดยใช้ context ทั้งหมด
window.continueChatTurn = function (prevTurnId) {
    var prev = window._chatTurns[prevTurnId];
    if (!prev || window._chatAbort) return;
    // หาคำตอบ AI ล่าสุดของเทิร์นนี้จาก history
    var lastAiText = '';
    if (prev.histRefs) {
        for (var i = prev.histRefs.length - 1; i >= 0; i--) {
            if (prev.histRefs[i].role === 'ai') { lastAiText = prev.histRefs[i].text; break; }
        }
    }
    var contQuery = '【คำตอบก่อนหน้านี้ถูกตัดกลางคัน — กรุณาสร้างต่อจากจุดที่ค้างไว้ด้านล่างนี้ โดยไม่ต้องอธิบายซ้ำหัวข้อเดิม】\n\n' +
        '--- คำตอบที่ถูกตัด (สร้างต่อจากนี้) ---\n' +
        lastAiText.slice(-2000) + // เอาเฉพาะท้ายๆ กัน prompt บวม
        '\n--- จบคำตอบที่ถูกตัด ---\n\n' +
        'โปรดตอบต่อจากจุดที่ค้างไว้ด้านบน อย่างเป็นธรรมชาติ (เหมือนเป็นการตอบคราวเดียว)';
    var turnId = ++window._chatTurnSeq;
    window._chatTurns[turnId] = {
        query: contQuery,
        ctx: window.snapshotQuestionCtx(),
        imageUrls: prev.imageUrls || [],    // ส่งรูปเดิมไปด้วยเผื่อยังต้องใช้
        mode: prev.mode,
        chosenModel: prev.chosenModel
    };
    return window.runChatTurn(turnId);
};

window.runChatTurn = async function (turnId) {
    var turn = window._chatTurns[turnId];
    if (!turn) return;

    var q = turn.ctx;
    var modeDef = window.CHAT_MODES[turn.mode] || window.CHAT_MODES[window.CHAT_MODE_DEFAULT];
    var hasImages = turn.imageUrls && turn.imageUrls.length > 0;

    // เลือกโมเดล: dropdown ชนะ mode → mode เลือกให้เมื่อเป็น Auto → รูปบังคับใช้โมเดลสาย vision
    var model = turn.chosenModel;
    var pickedBy = '';
    if (!model || model === '__auto__') {
        model = window.pickAutoModel(modeDef.taskKey);
        pickedBy = modeDef.labelTh;
        if (hasImages) {
            var vm = window.pickVisionModel();
            if (vm) { model = vm; pickedBy = modeDef.labelTh + ' + อ่านรูป'; }
        }
    }
    var token = localStorage.getItem("mdkku_session_token") || "guest_user";

    // Audit (ไม่ระบุตัวตน): จำแนก intent ฝั่ง client แล้วส่งเฉพาะ tag + model — ไม่ส่งข้อความดิบ
    if (window.logAiIntent) window.logAiIntent(turn.query, model);

    var $slot = $('#chat-ai-' + turnId);
    $slot.html('<div style="align-self:flex-start;color:var(--color-text-muted);font-size:0.9rem;">' +
        '<i class="fas fa-spinner fa-spin"></i> กำลังคิด…</div>');

    window._chatAbort = new AbortController();
    window._chatCurrentTurnId = turnId;
    window.setChatBusy(true);

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
        '(บริบทโจทย์ด้านบนคือข้อที่นิสิตถามถึง)\n\n' +
        (hasImages ? 'หมายเหตุ: มีรูปประกอบโจทย์แนบมาด้วย กรุณาอ่านรูปประกอบการตอบ\n\n' : '') +
        'คำถามใหม่จากนิสิต: "' + turn.query + '"\n\n' +
        'รูปแบบคำตอบที่ต้องการ: ' + modeDef.instr + '\n' +
        'กรุณาตอบเป็นภาษาไทย';

    try {
        var res = await window.sendWithRetry({
            action: 'askAIExpert', prompt: prompt, provider: 'IntelSphere',
            sessionToken: token, model: model,
            imageUrls: hasImages ? turn.imageUrls : undefined
        }, 3, window._chatAbort.signal);

        if (res.result === 'success') {
            var safeAnswer = window.renderMarkdownSafe(res.answer); // sanitize-by-construction: escaped text + whitelist tags
            // เก็บ reference ไว้เพื่อให้ Retry ถอนคู่นี้ออกได้ ไม่ให้ประวัติซ้ำ
            var uRef = { role: 'user', text: turn.query, questionId: q.questionId };
            var aRef = { role: 'ai', text: String(res.answer || ''), questionId: q.questionId };
            turn.histRefs = [uRef, aRef];
            window._chatHistory.push(uRef, aRef);
            if (window._chatHistory.length > 20) window._chatHistory.splice(0, window._chatHistory.length - 20);

            var servedSafe = $('<div>').text(res.servedModel || model).html();
            var modeBadge = pickedBy
                ? '<div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:4px;">' +
                pickedBy + ' → <b>' + servedSafe + '</b></div>'
                : '';
            var switchNote = res.switched
                ? '<div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:4px;">' +
                'ℹ️ โควต้าของโมเดลที่เลือกหมดชั่วคราว ระบบตอบด้วย <b>' + servedSafe + '</b> แทน</div>'
                : '';
            // เตือนตรงๆ เมื่อ AI ไม่ได้เห็นรูป — ห้ามปล่อยให้นิสิตเข้าใจผิดว่าคำตอบมาจากการดูรูป
            // เช็คจาก "ไม่มีคำยืนยันว่าส่งรูปแล้ว" ไม่ใช่ "มี flag บอกว่ารูปหลุด"
            // backend เก่าที่ยังไม่ได้ deploy จะไม่ส่ง imagesSent กลับมา → ต้องเตือน ไม่ใช่เงียบ
            var imgWarn = (hasImages && !res.imagesSent)
                ? '<div style="font-size:0.78rem;color:var(--color-wrong);margin-bottom:6px;font-weight:600;">' +
                '⚠️ โมเดลนี้อ่านรูปไม่ได้ คำตอบนี้อ้างอิงจากข้อความโจทย์เท่านั้น (ไม่ได้ดูรูป)</div>'
                : '';
            // finishReason === "length" = โดน max_tokens หรือ token limit ตัดจบกลางคัน
            var truncWarn = '';
            var contBtn = '';
            if (res.finishReason === 'length') {
                truncWarn =
                    '<div style="font-size:0.78rem;color:var(--color-warning, #c79100);margin-bottom:6px;font-weight:600;">' +
                    '⚠️ คำตอบถูกตัดกลางคันเพราะเกินความยาวสูงสุด (token limit)</div>';
                contBtn =
                    '<button type="button" class="chat-retry-btn" onclick="window.continueChatTurn(' + turnId + ')" ' +
                    'title="ขอให้ AI ตอบต่อจากเดิม (ใช้โควต้าเพิ่ม 1 ครั้ง)" ' +
                    'style="margin-left:4px;background:var(--color-primary,#3b82f6);color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;">▶ สร้างต่อ</button>';
            }

            // เก็บ context ไว้ส่งกับ feedback (👍/😐/👎) — ลบทิ้งหลังส่ง
            var fbId = ++window._chatbotFeedbackSeq;
            window._chatbotFeedbackCtx[fbId] = {
                model: res.servedModel || model,
                questionId: q.questionId || '',
                subject: q.subject || '',
                promptSnippet: turn.query.slice(0, 200),
                answerSnippet: String(res.answer || '').slice(0, 200)
            };
            var fbBar =
                '<div class="ai-fb-bar" id="ai-fb-' + fbId + '">คำตอบนี้เป็นยังไง?' +
                '<button type="button" onclick="window.submitAiFeedbackRating(' + fbId + ',\'good\',this)">👍</button>' +
                '<button type="button" onclick="window.submitAiFeedbackRating(' + fbId + ',\'neutral\',this)">😐</button>' +
                '<button type="button" onclick="window.submitAiFeedbackRating(' + fbId + ',\'bad\',this)">👎</button>' +
                '<button type="button" class="chat-retry-btn" onclick="window.retryChatTurn(' + turnId + ')" ' +
                'title="ถามใหม่ด้วยโจทย์เดิม (ใช้โควต้าเพิ่ม 1 ครั้ง)">↻ ถามใหม่</button>' +
                '</div>';
            $slot.html(
                '<div class="chat-md" style="align-self:flex-start;background:var(--color-surface-3);color:var(--color-text);' +
                'padding:10px 14px;border-radius:12px 12px 12px 0;max-width:85%;font-weight:500;">' +
                modeBadge + switchNote + imgWarn + truncWarn + safeAnswer + fbBar + contBtn + '</div>'
            );
        } else {
            $slot.html(
                '<div style="align-self:flex-start;background:var(--color-wrong-bg);color:var(--color-wrong);' +
                'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.9rem;">⚠️ ' +
                $('<div>').text(res.message || '').html() +
                '<button type="button" class="chat-retry-btn" onclick="window.retryChatTurn(' + turnId + ')">↻ ลองใหม่</button></div>'
            );
        }
    } catch (e) {
        if (e && e.name === 'AbortError') {
            // ปกติ stopChatGeneration วาดข้อความนี้ไปแล้ว — วาดซ้ำเผื่อ abort มาจากทางอื่น
            $slot.html(window.buildChatStoppedHtml(turnId));
        } else {
            $slot.html(
                '<div style="align-self:flex-start;background:var(--color-wrong-bg);color:var(--color-wrong);' +
                'padding:8px 12px;border-radius:12px;max-width:85%;font-size:0.9rem;">' +
                '⚠️ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง ' +
                '<button type="button" class="chat-retry-btn" onclick="window.retryChatTurn(' + turnId + ')">↻ ลองใหม่</button></div>'
            );
        }
    } finally {
        // ถ้านิสิตกดหยุดแล้วเริ่มเทิร์นใหม่ทันที เทิร์นเก่าที่เพิ่งจบต้องไม่ไปรีเซ็ตสถานะของเทิร์นใหม่
        if (window._chatCurrentTurnId === turnId) {
            window._chatAbort = null;
            window._chatCurrentTurnId = null;
            window.setChatBusy(false);
        }
        var $conv2 = $('#chatbot-conversation');
        $conv2.scrollTop($conv2[0].scrollHeight);
        if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 50);
    }
};

$(document).on('keypress', '#chatbot-input', function (e) {
    if (e.which === 13) window.sendChatbotQuery();
});

$(document).on('click', '.chat-mode-btn', function () {
    window.setChatMode($(this).data('mode'));
});

$(document).ready(function () {
    setTimeout(function () { window.loadChatbotModelCatalog(); }, 4000);
    window.updateChatModeUI();
    $('#btn-stop-chat').hide();
});

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

        // ปุ่ม "ให้ AI ช่วยอ่านภาพนี้" โผล่เฉพาะข้อที่มีรูปจริง
        $('#btn-ask-ai-image').toggle(window.getCurrentQuestionImageUrls().length > 0);
        // เปลี่ยนข้อแล้วรูปที่ค้างรอส่งเป็นของข้อเก่า — ทิ้งไปกันแนบรูปผิดข้อ
        if (qChanged && window.clearPendingImages) window.clearPendingImages();
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
                if (localStorage.getItem('mdkku_chatbot_open') === '1' && window.EDIT_SESSION && window.EDIT_SESSION.isLoggedIn) window.toggleChatbotPanel(true);
            } catch (e) { }
        }
    };
})();
