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

    var wrap, trigger, panel, scrim;
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
            }
            window.applyAssistivePos(start.x + dx, start.y + dy);
        }

        function end() {
            trigger.removeEventListener('pointermove', move);
            trigger.removeEventListener('pointerup', end);
            trigger.removeEventListener('pointercancel', end);
            try { trigger.releasePointerCapture(e.pointerId); } catch (err) { }
            if (!dragging) return;
            trigger.classList.remove('is-dragging');
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
            savePos(clamp(x, b.minX, b.maxX), clamp(p.y, b.minY, b.maxY));
            emit('mascot:moved', { side: snapSide });
        }

        trigger.addEventListener('pointermove', move);
        trigger.addEventListener('pointerup', end);
        trigger.addEventListener('pointercancel', end);
    }

    function init() {
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
            isMenuOpen: window.isAssistiveMenuOpen
        };
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
