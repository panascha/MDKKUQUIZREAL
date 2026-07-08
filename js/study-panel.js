// REFACTOR/js/study-panel.js — Unified study panel shell

window._spIsMobile = function () { return window.innerWidth < 768; }; // breakpoint เดียวกับ chatbot dock (≤767 = bottom sheet)

window._spClampW = function (w) {
    var max = Math.min(560, Math.round(window.innerWidth * 0.6));
    return Math.max(280, Math.min(max, Math.round(w)));
};

window._spClampH = function (h) {
    var min = Math.round(window.innerHeight * 0.35), max = Math.round(window.innerHeight * 0.85);
    return Math.max(min, Math.min(max, Math.round(h)));
};

// อ่านค่าที่จำไว้ → re-clamp กับ viewport ปัจจุบัน "ทุกครั้งที่เปิด" (§5.3 กันค่า 560px ค้างบนจอเล็ก);
// ไม่มีค่า/อยู่คนละโหมด → ล้าง var ให้ CSS fallback (380px / 60dvh) ทำงาน
window._spApplyStoredSize = function () {
    var root = document.documentElement.style;
    if (window._spIsMobile()) {
        root.removeProperty('--studypanel-w');
        var h = parseInt(localStorage.getItem('mdkku_studypanel_height'), 10);
        if (h > 0) root.setProperty('--studypanel-h', window._spClampH(h) + 'px');
        else root.removeProperty('--studypanel-h');
    } else {
        root.removeProperty('--studypanel-h');
        var w = parseInt(localStorage.getItem('mdkku_studypanel_width'), 10);
        if (w > 0) root.setProperty('--studypanel-w', window._spClampW(w) + 'px');
        else root.removeProperty('--studypanel-w');
    }
};

// เปิด/ปิด study panel — เปิดแล้วปิด chatbot dock (drawer ขวาใช้ที่เดียวกัน) + refresh section ที่กางอยู่
window.toggleStudyPanel = function (force) {
    var open = (typeof force === 'boolean') ? force : !document.body.classList.contains('studypanel-open');
    if (open) {
        if (document.body.classList.contains('chatbot-open')) window.toggleChatbotPanel(false);
        window._spApplyStoredSize();
    }
    document.body.classList.toggle('studypanel-open', open);
    try { localStorage.setItem('mdkku_studypanel_open', open ? '1' : '0'); } catch (e) { }
    if (open) window._spRefreshSections();
};

// mutual exclusion ฝั่ง chatbot: เปิด dock → ปิด study panel (wrap ไม่แก้ตัวเดิม — dock เดี่ยวๆ ไม่ regress)
(function () {
    var _orig = window.toggleChatbotPanel;
    if (typeof _orig !== 'function') return;
    window.toggleChatbotPanel = function (force) {
        var open = (typeof force === 'boolean') ? force : !document.body.classList.contains('chatbot-open');
        if (open && document.body.classList.contains('studypanel-open')) window.toggleStudyPanel(false);
        return _orig.call(this, force);
    };
})();

// selector ชุดของ section 4 — ส่งเข้า sendChatbotQuery (transport เดิม, จอ study panel)
window._spChatOpts = function () {
    return { inputSel: '#sp-chat-input', convSel: '#sp-chat-conversation', btnSel: '#btn-sp-chat-send' };
};

// เติมข้อมูล section ตอน "กางออก" เท่านั้น (lazy §5.2) — ตัวโหลดเดิมเป็น cache-first จึงไม่ยิงเครือข่ายซ้ำ
window._spFetchSection = function (sec) {
    if (sec === 'hy') {
        var ctx = window._highYieldCurrentCategory();
        if (ctx) window.loadHighYield(ctx.categoryId, ctx.subject, ctx.categoryName);
        else window._renderHighYieldMessage('กรุณาเปิดข้อสอบก่อน จึงจะดูสรุปของหัวข้อได้', '');
    } else if (sec === 'rel') {
        window.renderRelatedChips();
    } else if (sec === 'kw') {
        var cats = window._kwCurrentCategoryList();
        if (cats.length) window.loadKeywordIndex(cats[0].categoryId); // primary = category[0] (กติกาเดียวกับ section 1)
        else $('#sp-kw-content').html('<div class="sp-muted" style="font-style:italic;">กรุณาเปิดข้อสอบก่อน จึงจะดูคำสำคัญได้</div>');
    } else if (sec === 'ai') {
        setTimeout(function () { $('#sp-chat-input').trigger('focus'); }, 200);
    }
};

// refresh ทุก section ที่กางอยู่ (เรียกตอนเปิด panel + ตอนเปลี่ยนข้อ) — cache-first ทั้งหมด
window._spRefreshSections = function () {
    $('#study-panel .sp-section').each(function () {
        if ($(this).find('.sp-section-body').first().is(':visible')) {
            window._spFetchSection(this.getAttribute('data-spsec'));
        }
    });
};

// กาง/หุบ section (accordion) — กางแล้วค่อย fetch (lazy)
$(document).on('click', '.sp-section-head', function () {
    var $sec = $(this).closest('.sp-section');
    var $body = $sec.find('.sp-section-body').first();
    var willShow = !$body.is(':visible');
    $body.slideToggle(150);
    $sec.toggleClass('sp-open', willShow);
    if (willShow) window._spFetchSection($sec.attr('data-spsec'));
});

/* ---- Resize drag (§5.1/§5.2): pointerdown จับ pointer + จำจุดเริ่ม; pointermove เขียน DOM ผ่าน rAF;
   pointerup ปล่อย capture + persist "ครั้งเดียว"; dbl-click ล้างค่า + snap กลับ default ---- */
window._spDrag = null;

window._spOnPointerDown = function (e) {
    if (typeof e.button === 'number' && e.button !== 0) return; // ลากด้วยปุ่มหลัก/นิ้วเท่านั้น
    var panel = document.getElementById('study-panel');
    if (!panel) return;
    var rect = panel.getBoundingClientRect();
    window._spDrag = {
        id: e.pointerId,
        mobile: window._spIsMobile(),
        startX: e.clientX, startY: e.clientY,
        startW: rect.width, startH: rect.height,
        pending: null, raf: 0
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
    document.body.classList.add('studypanel-resizing');
    e.preventDefault();
};

window._spOnPointerMove = function (e) {
    var d = window._spDrag;
    if (!d || e.pointerId !== d.id) return;
    // panel อยู่ขอบขวา/ล่าง: ลากไปทางซ้าย (desktop) = กว้างขึ้น, ลากขึ้น (mobile) = สูงขึ้น
    d.pending = d.mobile
        ? window._spClampH(d.startH + (d.startY - e.clientY))
        : window._spClampW(d.startW + (d.startX - e.clientX));
    if (!d.raf) {
        d.raf = requestAnimationFrame(function () {
            var dd = window._spDrag;
            if (!dd) return;
            dd.raf = 0;
            if (dd.pending == null) return;
            document.documentElement.style.setProperty(dd.mobile ? '--studypanel-h' : '--studypanel-w', dd.pending + 'px');
        });
    }
};

window._spOnPointerUp = function (e) {
    var d = window._spDrag;
    if (!d || e.pointerId !== d.id) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { }
    if (d.raf) cancelAnimationFrame(d.raf);
    if (d.pending != null) {
        document.documentElement.style.setProperty(d.mobile ? '--studypanel-h' : '--studypanel-w', d.pending + 'px');
        // persist ครั้งเดียวตอนปล่อย (§5.2) — ไม่เขียน localStorage ระหว่างลาก
        try { localStorage.setItem(d.mobile ? 'mdkku_studypanel_height' : 'mdkku_studypanel_width', String(d.pending)); } catch (err) { }
    }
    document.body.classList.remove('studypanel-resizing');
    window._spDrag = null;
};

// dbl-click = ล้างค่าที่จำ + กลับ default (§5.2) — removeProperty ปล่อยให้ CSS fallback (380px / 60dvh) ทำงาน
window._spOnHandleDblClick = function () {
    var mobile = window._spIsMobile();
    try { localStorage.removeItem(mobile ? 'mdkku_studypanel_height' : 'mdkku_studypanel_width'); } catch (e) { }
    document.documentElement.style.removeProperty(mobile ? '--studypanel-h' : '--studypanel-w');
};

$(function () {
    var h = document.getElementById('study-resize-handle');
    if (!h) return;
    // bind ตรงบน handle (ไม่ delegate) — setPointerCapture retarget ทุก move มาที่ handle เอง
    h.addEventListener('pointerdown', window._spOnPointerDown);
    h.addEventListener('pointermove', window._spOnPointerMove);
    h.addEventListener('pointerup', window._spOnPointerUp);
    h.addEventListener('pointercancel', window._spOnPointerUp);
    h.addEventListener('dblclick', window._spOnHandleDblClick);
});

// viewport เปลี่ยนระหว่างเปิด (หมุนจอ/ย่อหน้าต่าง) → re-clamp ค่าที่จำไว้ใหม่ (§5.3)
window.addEventListener('resize', function () {
    if (!document.body.classList.contains('studypanel-open') || window._spDrag) return;
    clearTimeout(window._spResizeT);
    window._spResizeT = setTimeout(window._spApplyStoredSize, 150);
});

// Enter ในช่องถาม AI ของ study panel (มิเรอร์ handler ของ chatbot dock)
$(document).on('keypress', '#sp-chat-input', function (e) {
    if (e.which === 13) window.sendChatbotQuery(window._spChatOpts());
});

// Hook showQuestion: โชว์ FAB + ถ้า panel เปิดอยู่ refresh section ที่กางอยู่ให้ตรงข้อ/หมวดใหม่ (cache-first)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[StudyPanel] window.showQuestion not found at hook time — study panel will not auto-refresh');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        $('#study-fab').css('display', 'flex');
        if (document.body.classList.contains('studypanel-open')) window._spRefreshSections();
        // ครั้งแรกเท่านั้น: คืนสถานะเปิด/ปิดจากรอบก่อน (รูปแบบเดียวกับ chatbot dock; ถ้าทั้งคู่จำว่าเปิด อันนี้ชนะ)
        if (!window._spStateRestored) {
            window._spStateRestored = true;
            try {
                if (localStorage.getItem('mdkku_studypanel_open') === '1') window.toggleStudyPanel(true);
            } catch (e) { }
        }
    };
})();