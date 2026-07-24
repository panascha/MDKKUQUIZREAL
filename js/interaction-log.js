// ──────────────────────────────────────────────────────────────────────────────
// interaction-log.js — client logger สำหรับระบบ audit ใหม่ (แทน sendActivityLog/batchLog เดิม)
// ยิงไป action=logUserInteraction → backend เขียนลงไฟล์ audit "แยกจากคลังข้อสอบ"
//
// ใช้ร่วมกันได้ทั้ง 5 แอป: คัดลอกไฟล์นี้ไปแต่ละแอป แล้วตั้ง window.APP_ID ให้ต่างกัน
//
//   window.logFeature(feature, meta)              — สถิติการใช้ฟีเจอร์ (buffer + throttled beacon, best-effort)
//   window.logAiPrompt(promptText, model, respMeta) — prompt AI (ยิงทันที fetch keepalive, ไม่ drop)
// ──────────────────────────────────────────────────────────────────────────────

window.APP_ID = 'real'; // ★ แต่ละแอปตั้งค่าต่างกัน (real / database / converter / …)

// client UUID ถาวรต่ออุปกรณ์ — ใช้เป็น rate-limit key รอง และ join anonymous events
window.getClientId = function () {
    var id = localStorage.getItem('mdkku_client_id');
    if (!id) {
        id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('mdkku_client_id', id);
    }
    return id;
};

window._ilBasePayload = function (events) {
    return {
        action: 'logUserInteraction',
        appId: window.APP_ID,
        sessionToken: localStorage.getItem('mdkku_session_token') || '',
        clientId: window.getClientId(),
        userAgent: navigator.userAgent,
        events: events
    };
};

// ── feature usage: buffered + throttled ────────────────────────────────────────
window.logFeature = function (feature, meta) {
    try {
        var buf = JSON.parse(localStorage.getItem('interactionBuffer') || '[]');
        buf.push({ eventType: 'feature_use', feature: String(feature || ''), meta: meta || '' });
        localStorage.setItem('interactionBuffer', JSON.stringify(buf));
    } catch (e) { console.warn('logFeature buffer failed:', e); }
    window.flushInteractions(false);
};

window._ilLastFlush = 0;

window.flushInteractions = function (force) {
    try {
        var s = localStorage.getItem('interactionBuffer');
        if (!s) return;
        var buf = JSON.parse(s);
        if (!buf.length) return;

        if (!force) {
            var el = Date.now() - window._ilLastFlush;
            // flush เมื่อ buffer หนาพอ, ครบ interval, หรือแท็บซ่อน >15s (เหมือน pattern เดิมของ REAL)
            var should = buf.length >= 5 || el >= 60000 || (document.visibilityState === 'hidden' && el >= 15000);
            if (!should) return;
        }

        // batch cap 50/คำขอ (ตรงกับ cap ฝั่ง backend) — ที่เกินเก็บไว้รอบถัดไป
        var batch = buf.slice(0, 50);
        var n = batch.length;
        window._ilLastFlush = Date.now();
        var payload = window._ilBasePayload(batch);
        var blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' });

        var sent = navigator.sendBeacon ? navigator.sendBeacon(window.APPSCRIPT_URL, blob) : false;
        if (sent) {
            // FIX บั๊กเดิม: เคลียร์เฉพาะแถวที่ส่งไปแล้ว (n แถวแรก) ไม่ removeItem ทั้งก้อนก่อนยืนยัน
            _ilDropFirst(n);
        } else {
            // beacon ไม่รองรับ/คิวไม่ผ่าน → fetch keepalive แล้วเคลียร์เมื่อสำเร็จเท่านั้น
            fetch(window.APPSCRIPT_URL, {
                method: 'POST', redirect: 'follow', keepalive: true,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            }).then(function () { _ilDropFirst(n); })
                .catch(function (err) { console.warn('flushInteractions failed:', err); });
        }
    } catch (e) { console.warn('flushInteractions error:', e); }
};

// ลบ n แถวแรกออกจาก buffer ปัจจุบัน (อ่านสด กัน race กับ event ที่ push เข้ามาระหว่างส่ง)
function _ilDropFirst(n) {
    try {
        var cur = JSON.parse(localStorage.getItem('interactionBuffer') || '[]');
        localStorage.setItem('interactionBuffer', JSON.stringify(cur.slice(n)));
    } catch (e) { /* ignore */ }
}

// ── AI prompt: ยิงทันที ไม่ buffer (prompt คือ record ที่ต้องการจริง อย่า drop) ──────
window.logAiPrompt = function (promptText, model, responseMeta) {
    try {
        var payload = window._ilBasePayload([{
            eventType: 'ai_prompt',
            promptText: String(promptText || ''),
            model: model || '',
            responseMeta: responseMeta || ''
        }]);
        fetch(window.APPSCRIPT_URL, {
            method: 'POST', redirect: 'follow', keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }).catch(function (err) { console.warn('logAiPrompt failed:', err); });
    } catch (e) { console.warn('logAiPrompt error:', e); }
};

// lifecycle flush (feature buffer เท่านั้น; ai_prompt ส่งทันทีอยู่แล้ว)
window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') window.flushInteractions(false);
});
window.addEventListener('beforeunload', function () { window.flushInteractions(true); });
