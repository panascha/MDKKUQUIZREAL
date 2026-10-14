/* AssistiveTouch mascot shell (task-31 part 2): draggable trigger + 3x3 menu.
   Hook flags: window._mascotHooksInstalled covers ONLY the toggleChatbotPanel wrap.
   Part 3 must use its own guard (e.g. window._mascotHooksInstalled2). */
(function () {
    if (window._mascotShellInstalled) return;
    window._mascotShellInstalled = true;

    var POS_KEY = 'mdkku_assistive_pos';
    var DRAG_PX = 6;
    var PAD = 12;
    var SIZE = 56;
    var KEEP_OPEN = ['zoom-in-btn', 'zoom-out-btn', 'font-weight-toggle-btn', 'mascot-mute-toggle'];

    var wrap, trigger, panel, scrim, zonesEl;
    var side = 'right';
    var swallowClick = false;
    var insetCache = null;

    function reducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function safeInsets() {
        if (insetCache) return insetCache;
        var probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
        document.body.appendChild(probe);
        var cs = getComputedStyle(probe);
        insetCache = {
            t: parseFloat(cs.paddingTop) || 0,
            r: parseFloat(cs.paddingRight) || 0,
            b: parseFloat(cs.paddingBottom) || 0,
            l: parseFloat(cs.paddingLeft) || 0
        };
        document.body.removeChild(probe);
        return insetCache;
    }

    function bounds() {
        var s = safeInsets();
        return {
            minX: PAD + s.l,
            maxX: window.innerWidth - SIZE - PAD - s.r,
            minY: PAD + s.t,
            maxY: window.innerHeight - SIZE - PAD - s.b
        };
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    window.getAssistivePos = function () {
        try {
            var p = JSON.parse(localStorage.getItem(POS_KEY));
            if (p && isFinite(p.xPct) && isFinite(p.yPct)) return { xPct: p.xPct, yPct: p.yPct };
        } catch (e) { }
        return { xPct: 100, yPct: 45 };
    };

    function savePos(x, y) {
        var b = bounds();
        var rx = b.maxX - b.minX, ry = b.maxY - b.minY;
        try {
            localStorage.setItem(POS_KEY, JSON.stringify({
                xPct: rx > 0 ? (x - b.minX) / rx * 100 : 100,
                yPct: ry > 0 ? (y - b.minY) / ry * 100 : 45
            }));
        } catch (e) { }
    }

    window.applyAssistivePos = function (x, y, snapSide) {
        if (!wrap) return;
        var b = bounds();
        x = clamp(x, b.minX, b.maxX);
        y = clamp(y, b.minY, b.maxY);
        side = snapSide || (x + SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right');
        wrap.style.setProperty('--at-x', x + 'px');
        wrap.style.setProperty('--at-y', y + 'px');
        wrap.classList.toggle('is-snapped-left', side === 'left');
        wrap.classList.toggle('is-snapped-right', side === 'right');
    };

    function applySaved() {
        var p = window.getAssistivePos();
        var b = bounds();
        var x = b.minX + (b.maxX - b.minX) * p.xPct / 100;
        var y = b.minY + (b.maxY - b.minY) * p.yPct / 100;
        window.applyAssistivePos(x, y, p.xPct >= 50 ? 'right' : 'left');
    }

    function curPos() {
        var r = trigger.getBoundingClientRect();
        return { x: r.left, y: r.top };
    }

    function emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    }

    function placePanel() {
        var r = trigger.getBoundingClientRect();
        var pw = panel.offsetWidth, ph = panel.offsetHeight;
        var left = side === 'right' ? r.right - pw : r.left;
        var top = r.top < window.innerHeight / 2 ? r.bottom + 8 : r.top - ph - 8;
        panel.style.setProperty('--ap-x', clamp(left, PAD, Math.max(PAD, window.innerWidth - pw - PAD)) + 'px');
        panel.style.setProperty('--ap-y', clamp(top, PAD, Math.max(PAD, window.innerHeight - ph - PAD)) + 'px');
    }

    window.isAssistiveMenuOpen = function () {
        return document.body.classList.contains('assistive-open');
    };

    window.toggleAssistiveMenu = function (force) {
        if (!panel) return;
        var open = typeof force === 'boolean' ? force : !window.isAssistiveMenuOpen();
        if (open === window.isAssistiveMenuOpen()) return;
        document.body.classList.toggle('assistive-open', open);
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) placePanel();
        emit('mascot:menu', { open: open });
    };

    window.openAssistiveMenu = function () { window.toggleAssistiveMenu(true); };
    window.closeAssistiveMenu = function () { window.toggleAssistiveMenu(false); };

    function onPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        var start = curPos();
        var sx = e.clientX, sy = e.clientY;
        var dragging = false;
        try { trigger.setPointerCapture(e.pointerId); } catch (err) { }

        function move(ev) {
            var dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (!dragging) {
                if (Math.sqrt(dx * dx + dy * dy) <= DRAG_PX) return;
                dragging = true;
                trigger.classList.add('is-dragging');
                window.closeAssistiveMenu();
                if (zonesEl && !bubbleSuppressed()) {
                    zonesEl.classList.add('zones-active');
                    zonesOn = true;
                }
            }
            window.applyAssistivePos(start.x + dx, start.y + dy);
            stretchSprite(ev);
            if (zonesOn) hoverZone(ev.clientX, ev.clientY);
        }

        function end(ev) {
            trigger.removeEventListener('pointermove', move);
            trigger.removeEventListener('pointerup', end);
            trigger.removeEventListener('pointercancel', end);
            try { trigger.releasePointerCapture(e.pointerId); } catch (err) { }
            if (!dragging) return;
            var dropAction = zonesOn && ev && ev.type === 'pointerup' ? hoverAction : null;
            if (zonesOn) {
                zonesEl.classList.remove('zones-active');
                setHovered(null);
                window.setMascotEyes(null);
            }
            trigger.classList.remove('is-dragging');
            clearStretch();
            swallowClick = true;
            setTimeout(function () { swallowClick = false; }, 0);
            var b = bounds();
            var p = curPos();
            var snapSide = p.x + SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right';
            var x = snapSide === 'left' ? b.minX : b.maxX;
            if (!reducedMotion()) {
                trigger.classList.add('is-settling');
                setTimeout(function () { trigger.classList.remove('is-settling'); }, 250);
            }
            window.applyAssistivePos(x, p.y, snapSide);
            if (!reducedMotion()) animateSprite('is-jelly', 500);
            savePos(clamp(x, b.minX, b.maxX), clamp(p.y, b.minY, b.maxY));
            emit('mascot:moved', { side: snapSide });
            if (dropAction) runDropAction(dropAction);
        }

        var zonesOn = false;
        var hoverAction = null;

        function setHovered(action) {
            hoverAction = action;
            var zs = zonesEl ? zonesEl.querySelectorAll('.drop-zone') : [];
            for (var i = 0; i < zs.length; i++) {
                zs[i].classList.toggle('is-hovered', !!action && zs[i].getAttribute('data-action') === action);
            }
        }

        // Hit-test the pointer point (mascot centre is clamped by bounds, pointer is not).
        function hoverZone(px, py) {
            var zs = zonesEl.querySelectorAll('.drop-zone');
            var hit = null;
            for (var i = 0; i < zs.length; i++) {
                var r = zs[i].getBoundingClientRect();
                if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
                    hit = zs[i].getAttribute('data-action');
                    break;
                }
            }
            if (hit === hoverAction) return;
            setHovered(hit);
            if (hit) {
                if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { } }
                window.setMascotEyes('is-happy');
            } else {
                window.setMascotEyes(null);
            }
        }

        trigger.addEventListener('pointermove', move);
        trigger.addEventListener('pointerup', end);
        trigger.addEventListener('pointercancel', end);
    }

    function runDropAction(action) {
        try {
            if (action === 'quiz' || action === 'search') {
                var btn = document.getElementById(action === 'quiz' ? 'scroll-to-quiz-btn' : 'scroll-to-search-btn');
                if (btn) btn.click();
            } else if (action === 'ai') {
                if (window.toggleChatbotPanel) window.toggleChatbotPanel(true);
            }
            window.triggerMascotEmote('correct');
        } catch (err) { }
    }

    function init() {
        zonesEl = document.getElementById('assistive-drop-zones');
        wrap = document.getElementById('assistive-wrap');
        trigger = document.getElementById('assistive-touch-trigger');
        panel = document.getElementById('assistive-menu-panel');
        scrim = document.getElementById('assistive-scrim');
        if (!wrap || !trigger || !panel || !scrim) return;

        applySaved();
        trigger.addEventListener('pointerdown', onPointerDown);
        // Tap (and keyboard Enter/Space) arrive as click; a click right after a drag is swallowed.
        trigger.addEventListener('click', function () {
            if (swallowClick) return;
            if (!reducedMotion()) animateSprite('is-hop', 450);
            window.toggleAssistiveMenu();
        });
        scrim.addEventListener('click', window.closeAssistiveMenu);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && window.isAssistiveMenuOpen()) window.closeAssistiveMenu();
        });
        panel.addEventListener('click', function (e) {
            var btn = e.target.closest('button');
            if (btn) {
                // setTimeout: let the legacy handler on the button run before the menu closes
                if (KEEP_OPEN.indexOf(btn.id) === -1) setTimeout(window.closeAssistiveMenu, 0);
                return;
            }
            if (e.target.closest('label')) return;
            var item = e.target.closest('.assistive-menu-item');
            var inner = item && item.querySelector('button');
            if (inner) inner.click();
        });
        window.addEventListener('resize', applySaved);
        window.addEventListener('orientationchange', applySaved);

        window.MASCOT = {
            el: {
                wrap: wrap,
                trigger: trigger,
                sprite: trigger.querySelector('.mascot-sprite'),
                eyes: trigger.querySelectorAll('.mascot-eye'),
                panel: panel
            },
            getSide: function () { return side; },
            getTriggerRect: function () { return trigger.getBoundingClientRect(); },
            openMenu: window.openAssistiveMenu,
            closeMenu: window.closeAssistiveMenu,
            isMenuOpen: window.isAssistiveMenuOpen,
            setEyes: window.setMascotEyes,
            emote: window.triggerMascotEmote,
            say: window.showMascotBubble
        };
        initPersonality();
    }

    /* ---------- part 3: personality ---------- */
    var QUIET_KEY = 'mdkku_mascot_quiet';
    var BUBBLE_COOLDOWN = 20000;
    var BUBBLE_TTL = 4000;
    var IDLE_MIN = 45000, IDLE_MAX = 90000;
    var BLINK_MIN = 3000, BLINK_MAX = 6000;
    var CHANCE = 0.25;
    var ANIM_CLS = ['is-hop', 'is-jelly', 'is-jump', 'is-hit'];
    var EYE_CLS = ['is-sleeping', 'is-happy', 'is-wrong'];

    var quiet = false;
    try { quiet = localStorage.getItem(QUIET_KEY) === '1'; } catch (e) { }
    var lastBubbleAt = 0, hintBusy = false, lastQid = null;
    var idleTimer, blinkTimer, bubbleTimer, eyeTimer, emoteTimer, animTimer, lastMove = null;
    var bubble, emoteEl;

    var BANTER = {
        load: ['ลุยข้อนี้กันเลย!', 'ค่อยๆ อ่านโจทย์นะ อย่ารีบ', 'ข้อนี้ต้องคิดนิดนึงน้า', 'สู้ๆ เดี๋ยวก็ได้เอง'],
        correct: ['เก่งมาก!', 'ถูกต้องงง ไปต่อ!', 'ว้าว แม่นจริง', 'สมกับเป็นหมอในอนาคต'],
        wrong: ['ไม่เป็นไร ข้อหน้าเอาใหม่', 'อ่านเฉลยแล้วจำไว้นะ', 'พลาดนิดเดียวเอง สู้ต่อ!', 'ผิดวันนี้ ดีกว่าผิดวันสอบ'],
        highYield: ['ข้อนี้ออกมาแล้ว {n} ปีเลยนะ จำไว้!', 'ข้อแฝดโผล่ {n} ปีซ้อน ๆ ข้อนี้เด็ดจริง', 'ออกซ้ำ {n} ปีแล้วน้า ห้ามพลาดข้อนี้'],
        idle: ['ง่วงแล้วน้า...', 'ยังอยู่ไหมเนี่ย', 'พักสายตาบ้างก็ได้นะ', 'zzZ...']
    };

    function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function spr() { return window.MASCOT && window.MASCOT.el.sprite; }
    function curQ() { return window.APP && window.APP.current_question; }

    function animateSprite(cls, ms) {
        var s = spr();
        if (!s) return;
        clearTimeout(animTimer);
        ANIM_CLS.forEach(function (c) { s.classList.remove(c); });
        void s.offsetWidth;
        s.classList.add(cls);
        animTimer = setTimeout(function () { s.classList.remove(cls); }, ms);
    }

    function stretchSprite(ev) {
        var s = spr();
        if (!s || reducedMotion()) return;
        var now = Date.now();
        if (lastMove && now > lastMove.t) {
            var dx = ev.clientX - lastMove.x, dy = ev.clientY - lastMove.y;
            var speed = Math.sqrt(dx * dx + dy * dy) / (now - lastMove.t) * 1000; // px/s
            var k = Math.min(0.18, speed / 3000);
            s.style.transform = 'scale(' + (1 + k) + ',' + (1 - k) + ')';
        }
        lastMove = { t: now, x: ev.clientX, y: ev.clientY };
    }

    function clearStretch() {
        lastMove = null;
        var s = spr();
        if (s) s.style.transform = '';
    }

    window.setMascotEyes = function (state, ms) {
        var s = spr();
        if (!s) return;
        clearTimeout(eyeTimer);
        EYE_CLS.forEach(function (c) { s.classList.remove(c); });
        if (!state) return;
        s.classList.add(state);
        if (ms) eyeTimer = setTimeout(function () { s.classList.remove(state); }, ms);
    };

    window.triggerMascotEmote = function (kind) {
        clearTimeout(emoteTimer);
        if (trigger) trigger.classList.remove('is-thinking');
        if (!emoteEl) return;
        emoteEl.classList.remove('is-show');
        var glyph = { sleep: '💤', correct: '✨', wrong: '💥', think: '❓' }[kind];
        if (!glyph) return;
        emoteEl.textContent = glyph;
        void emoteEl.offsetWidth;
        emoteEl.classList.add('is-show');
        if (kind === 'correct') animateSprite('is-jump', 600);
        else if (kind === 'wrong') animateSprite('is-hit', 550);
        if (kind === 'think') {
            if (trigger) trigger.classList.add('is-thinking');
            return;
        }
        emoteTimer = setTimeout(function () { emoteEl.classList.remove('is-show'); }, 1400);
    };

    function bubbleSuppressed() {
        if (document.body.classList.contains('sp-zen')) return true;
        if (document.querySelector('.scratchpad-drawing')) return true;
        return false;
    }

    window.hideMascotBubble = function () {
        clearTimeout(bubbleTimer);
        if (bubble) bubble.classList.remove('is-show');
    };

    window.showMascotBubble = function (html, opts) {
        opts = opts || {};
        if (!bubble || bubbleSuppressed()) return false;
        if (opts.auto) {
            if (quiet || Date.now() - lastBubbleAt < BUBBLE_COOLDOWN || window.isAssistiveMenuOpen()) return false;
            var lh = document.getElementById('login-benefit-hint');
            if (lh && getComputedStyle(lh).display !== 'none') return false;
        }
        var ttl = opts.ttl === undefined ? BUBBLE_TTL : opts.ttl;
        bubble.innerHTML = '';
        if (ttl === 0 && opts.close) {
            var cb = document.createElement('button');
            cb.type = 'button';
            cb.className = 'mascot-bubble-close';
            cb.setAttribute('aria-label', 'ปิด');
            cb.textContent = '×';
            cb.addEventListener('click', window.hideMascotBubble);
            bubble.appendChild(cb);
        }
        var body = document.createElement('div');
        body.className = 'mascot-bubble-body';
        body.innerHTML = html;
        bubble.appendChild(body);
        if (opts.hintBtn) {
            var hb = document.createElement('button');
            hb.type = 'button';
            hb.id = 'mascot-bubble-hint';
            hb.textContent = hintLabel();
            hb.addEventListener('click', function () { window.askMascotHint(); });
            bubble.appendChild(hb);
        }
        bubble.classList.toggle('has-hint', !!(opts.hintBtn || opts.close));
        bubble.classList.add('is-show');
        clearTimeout(bubbleTimer);
        if (ttl > 0) bubbleTimer = setTimeout(window.hideMascotBubble, ttl);
        if (opts.auto) lastBubbleAt = Date.now();
        return true;
    };

    function hintLabel() {
        var cq = curQ();
        return cq && cq.state ? '🧠 สรุปให้จำ' : '💡 ขอคำใบ้';
    }

    function updateHintLabel() {
        var b = document.getElementById('mascot-hint-btn');
        if (b) b.textContent = hintLabel();
    }

    function banter(kind, cq) {
        var line = pick(BANTER[kind]);
        if (kind === 'load' && cq && Math.random() < 1 / 3 && Array.isArray(cq.category) && typeof window.getCategoryNameById === 'function') {
            var name = window.getCategoryNameById(cq.category[0]);
            if (name) line = 'ข้อนี้หมวด "' + esc(name) + '" นะ จัดไป!';
        }
        window.showMascotBubble(line, { auto: true, hintBtn: kind === 'load' });
    }

    function resetIdle() {
        clearTimeout(idleTimer);
        var s = spr();
        if (s) s.classList.remove('is-sleeping');
        if (document.hidden) return;
        idleTimer = setTimeout(idleFire, rand(IDLE_MIN, IDLE_MAX));
    }

    function idleFire() {
        window.setMascotEyes('is-sleeping');
        window.triggerMascotEmote('sleep');
        banter('idle');
        idleTimer = setTimeout(idleFire, rand(IDLE_MIN, IDLE_MAX));
    }

    function scheduleBlink() {
        clearTimeout(blinkTimer);
        if (document.hidden) return;
        blinkTimer = setTimeout(function () {
            var s = spr();
            if (s && !s.classList.contains('is-sleeping')) {
                s.classList.add('is-blink');
                setTimeout(function () { s.classList.remove('is-blink'); }, 120);
            }
            scheduleBlink();
        }, rand(BLINK_MIN, BLINK_MAX));
    }

    function applyQuietLabel() {
        var b = document.getElementById('mascot-mute-toggle');
        if (b) b.innerHTML = quiet
            ? '<i class="fas fa-comment-slash"></i> คำพูด: ปิด'
            : '<i class="fas fa-comment"></i> คำพูด: เปิด';
    }

    window.askMascotHint = async function () {
        var token = null;
        try { token = localStorage.getItem('mdkku_session_token'); } catch (e) { }
        if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn || !token) {
            if (typeof window.showGoogleSignInModal === 'function') window.showGoogleSignInModal('เข้าสู่ระบบเพื่อขอคำใบ้จากน้องซูชิ');
            return;
        }
        var cq = curQ();
        if (!cq || hintBusy) return;
        var mode = cq.state ? 'post' : 'pre';
        var problem = String(cq.problem || '');
        if (cq.img && problem.replace(/\s+/g, '').length < 40) {
            window.showMascotBubble('ข้อนี้ต้องสังเกตจุดสำคัญในภาพประกอบเองน้า~', { ttl: 6000 });
            return;
        }
        var qid = cq.questionId;
        var subject = new URLSearchParams(location.search).get('subject') || 'default';
        var key = 'sushi_hint_' + subject + '_' + qid + '_' + mode;
        try {
            var c = await window.getCacheDB(key);
            if (c && c.text) {
                window.showMascotBubble(window.renderMarkdownSafe(c.text), { ttl: 0, close: true });
                return;
            }
        } catch (e) { }

        hintBusy = true;
        window.triggerMascotEmote('think');
        window.showMascotBubble('กำลังคิด…', { ttl: 0 });
        try {
            if (!window._chatbotCatalog && typeof window.loadChatbotModelCatalog === 'function') await window.loadChatbotModelCatalog();
            var model = typeof window.pickAutoModel === 'function' ? window.pickAutoModel('quick_fact') : 'deepseek-v4-pro';
            var choices = String(cq.choices || '').split('///').join(' | ');
            var persona = 'คุณคือ "น้องซูชิ" (MDKKU Mascot) ผู้ชาย เป็นรุ่นพี่/เพื่อนคู่หูนักศึกษาแพทย์ มีไหวพริบ กวนนิดๆ และให้กำลังใจ พูดไทยปนศัพท์หมอ ' +
                'ใช้คำลงท้ายสุภาพแบบผู้ชาย "ครับ" เท่านั้น ห้ามใช้ "ค่ะ" "คะ" "ค่า" เด็ดขาด เรียกตัวเองว่า "พี่" หรือ "ซูชิ" ก็ได้ ' +
                'ตัวอย่างน้ำเสียง: "ซูชิมาแล้วครับ! ลองนึกถึงเรื่อง chemical structure กับ functional group ที่คล้ายกันดูสิครับ ระวังเรื่อง cross-reactivity ไว้ให้ดีนะ พี่ใบ้แค่นี้พอก่อน เดี๋ยวเก่งเกิน!"\n';
            var prompt;
            if (mode === 'pre') {
                prompt = persona + 'ให้ใบ้เบาๆ 1-2 ประโยค ชี้กลไก/แนวคิดวินิจฉัยที่ควรนึกถึง ห้ามเฉลย ห้ามบอกชื่อโรค/ยา/ตัวอักษรตัวเลือกที่ถูก ห้ามยืนยันหรือตัดตัวเลือกใดๆ ตอบสั้นกระชับ\n' +
                    'โจทย์: "' + problem + '"\nตัวเลือก: "' + choices + '"\n' +
                    'คำอธิบายประกอบ (ห้ามเอามาเฉลยตรงๆ): "' + String(cq.explain || '') + '"';
            } else {
                prompt = persona + 'สรุปให้จำ 1-2 ประโยค เป็น mnemonic หรือ clinical pearl สั้นกระชับ\n' +
                    'โจทย์: "' + problem + '"\nตัวเลือก: "' + choices + '"\nเฉลย: "' + String(cq.answer || '') + '"\n' +
                    'คำอธิบายประกอบ: "' + String(cq.explain || '') + '"';
            }
            var res = await window.sendWithRetry({ action: 'askAIExpert', provider: 'IntelSphere', prompt: prompt, model: model, sessionToken: token }, 2);
            if (res && res.result === 'success' && res.answer) {
                try { await window.setCacheDB(key, { text: String(res.answer), ts: Date.now() }); } catch (e) { }
                var now = curQ();
                if (now && now.questionId === qid) window.showMascotBubble(window.renderMarkdownSafe(String(res.answer)), { ttl: 0, close: true });
                else window.hideMascotBubble();
            } else {
                window.showMascotBubble('ซูชิคิดไม่ออกตอนนี้ครับ ลองใหม่อีกทีนะ', { ttl: 5000 });
            }
        } catch (e) {
            window.showMascotBubble('ซูชิคิดไม่ออกตอนนี้ครับ ลองใหม่อีกทีนะ', { ttl: 5000 });
        } finally {
            hintBusy = false;
            window.triggerMascotEmote('');
        }
    };

    function onQuestionShown() {
        var cq = curQ();
        if (!cq) return;
        updateHintLabel();
        if (cq.questionId === lastQid) return;
        lastQid = cq.questionId;
        window.hideMascotBubble();
        window.setMascotEyes('');
        window.triggerMascotEmote('');
        resetIdle();
        var hy = typeof window.getHighYieldInfo === 'function' ? window.getHighYieldInfo(cq) : null;
        if (hy && hy.count >= 3) {
            window.showMascotBubble(pick(BANTER.highYield).replace('{n}', hy.count), { auto: true, hintBtn: true });
        } else if (Math.random() < CHANCE) banter('load', cq);
    }

    function onSubmitted(was) {
        var cq = curQ();
        if (!cq || was || !cq.state) return;
        var ok = cq.select === cq.answer;
        window.setMascotEyes(ok ? 'is-happy' : 'is-wrong', 1600);
        window.triggerMascotEmote(ok ? 'correct' : 'wrong');
        updateHintLabel();
        resetIdle();
        if (Math.random() < CHANCE) banter(ok ? 'correct' : 'wrong');
    }

    function initPersonality() {
        bubble = document.createElement('div');
        bubble.id = 'mascot-speech-bubble';
        bubble.setAttribute('role', 'status');
        wrap.appendChild(bubble);
        emoteEl = document.createElement('div');
        emoteEl.id = 'mascot-emote';
        emoteEl.setAttribute('aria-hidden', 'true');
        wrap.appendChild(emoteEl);

        document.addEventListener('pointerdown', function (e) {
            resetIdle();
            if (!bubble.classList.contains('is-show')) return;
            var t = e.target;
            if (bubble.contains(t) || (t.closest && t.closest('#mascot-hint-btn'))) return;
            window.hideMascotBubble();
        }, true);
        document.addEventListener('keydown', resetIdle, { passive: true });
        window.addEventListener('scroll', function (e) {
            if (bubble.classList.contains('is-show') && !bubble.contains(e.target)) window.hideMascotBubble();
        }, { passive: true, capture: true });
        document.addEventListener('mascot:menu', function (e) {
            if (e.detail && e.detail.open) window.hideMascotBubble();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { clearTimeout(blinkTimer); clearTimeout(idleTimer); }
            else { scheduleBlink(); resetIdle(); }
        });

        var mute = document.getElementById('mascot-mute-toggle');
        if (mute) mute.addEventListener('click', function () {
            quiet = !quiet;
            try { localStorage.setItem(QUIET_KEY, quiet ? '1' : '0'); } catch (e) { }
            applyQuietLabel();
            if (quiet) window.hideMascotBubble();
        });
        applyQuietLabel();
        var hint = document.getElementById('mascot-hint-btn');
        if (hint) hint.addEventListener('click', function () { window.askMascotHint(); });

        updateHintLabel();
        scheduleBlink();
        resetIdle();
    }

    if (!window._mascotHooksInstalled2) {
        window._mascotHooksInstalled2 = true;
        if (typeof window.showQuestion === 'function') {
            var origShow = window.showQuestion;
            window.showQuestion = function () {
                var r = origShow.apply(this, arguments);
                try { onQuestionShown(); } catch (e) { }
                return r;
            };
        }
        if (typeof window.submitQuestion === 'function') {
            var origSubmit = window.submitQuestion;
            window.submitQuestion = function () {
                var cq0 = curQ();
                var was = !!(cq0 && cq0.state);
                var r = origSubmit.apply(this, arguments);
                try { onSubmitted(was); } catch (e) { }
                return r;
            };
        }
    }

    if (!window._mascotHooksInstalled && typeof window.toggleChatbotPanel === 'function') {
        var origToggle = window.toggleChatbotPanel;
        window.toggleChatbotPanel = function () {
            window.closeAssistiveMenu();
            return origToggle.apply(this, arguments);
        };
        window._mascotHooksInstalled = true;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
