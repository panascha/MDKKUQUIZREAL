// ──────────────────────────────────────────────────────────────────────────────
// interaction-log.js — client logger สถิติการใช้งาน "แบบไม่ระบุตัวตน"
// ยิงไป action=logUserInteraction → backend เขียนลงไฟล์ audit "แยกจากคลังข้อสอบ"
//
// PRIVACY: เก็บแค่ intent tag + ชื่อฟีเจอร์ + app + เวลา เท่านั้น
//   ไม่ส่ง/ไม่เก็บ: email, sessionToken, ข้อความ prompt ดิบ, userAgent
//   การจำแนก intent ทำ "ฝั่ง client" (classifyAiIntent) → ข้อความดิบไม่เคยออกจากอุปกรณ์
//   clientId ส่งไปเพื่อ rate-limit ชั่วคราวเท่านั้น (backend ไม่เขียนลง sheet)
//
// ใช้ร่วมกันได้ทั้ง 5 แอป: คัดลอกไฟล์นี้ไปแต่ละแอป แล้วตั้ง window.APP_ID ให้ต่างกัน
//
//   window.logFeature(feature)          — สถิติการใช้ฟีเจอร์ (buffer + throttled beacon, best-effort)
//   window.logAiIntent(queryText, model) — จำแนก intent ฝั่ง client แล้วส่งเฉพาะ tag (ยิงทันที, ไม่ drop)
// ──────────────────────────────────────────────────────────────────────────────

window.APP_ID = 'real'; // ★ แต่ละแอปตั้งค่าต่างกัน (real / database / converter / …)

// client UUID ถาวรต่ออุปกรณ์ — ใช้เป็น rate-limit key ชั่วคราวเท่านั้น (ไม่ถูกเก็บใน audit)
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
        clientId: window.getClientId(), // throttle key เท่านั้น — backend ไม่ persist
        events: events
    };
};

// จำแนกเจตนาคำถาม AI เป็น 1 ใน 5 tag (keyword heuristic ไทย/อังกฤษ) — ลำดับเช็คสำคัญ
// คืนเฉพาะ "tag" ไม่คืน/ไม่ส่งข้อความดิบ
window.classifyAiIntent = function (query) {
    var q = String(query || '').toLowerCase();
    // 1) เช็คว่าคำตอบถูกไหม / ทำไมไม่ใช่ข้อนี้
    if (/ถูก(ไหม|มั้ย|รึ)|ใช่(ไหม|มั้ย)|ผิดตรงไหน|ทำไม(ถึง)?ไม่ใช่|ไม่ใช่ข้อ|ข้อไหนถูก|ต่างจากข้อ|ตัด\s*choice|choice\s*[a-e]|why not|is this correct|which (one|choice)|ตรวจ(คำตอบ)?/.test(q))
        return 'answer-verification';
    // 2) ช่วยทำ/เฉลย/คำนวณข้อสอบ
    if (/ช่วย(ทำ|ตอบ|แก้|เฉลย)|เฉลย|วิธีทำ|ข้อนี้(ทำ|ตอบ)|คำนวณ|โด[สซ]|dose|dosage|solve|answer this|how (do i|to) (solve|answer)/.test(q))
        return 'quiz-help';
    // 3) วางแผน/เตรียมสอบ/เทคนิคจำ
    if (/เตรียมสอบ|วางแผน|ควรอ่าน|อ่านอะไร|ออกสอบ|ช่วยจำ|วิธีจำ|จำยังไง|mnemonic|ท่องจำ|สรุป(ย่อ|เนื้อหา)|study (plan|tips)|exam/.test(q))
        return 'study-planning';
    // 4) อธิบายคอนเซปต์/นิยาม/กลไก/แปลศัพท์
    if (/คืออะไร|อธิบาย|กลไก|ทำงานยังไง|หมายถึง|หมายความว่า|นิยาม|แปลว่า|แปลเป็น|definition|explain|mechanism|what is|meaning of/.test(q))
        return 'concept-explanation';
    return 'other';
};

// ── feature usage: buffered + throttled ────────────────────────────────────────
window.logFeature = function (feature) {
    try {
        var buf = JSON.parse(localStorage.getItem('interactionBuffer') || '[]');
        buf.push({ eventType: 'feature_use', feature: String(feature || '') });
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

// ── AI intent: จำแนกฝั่ง client แล้วส่งเฉพาะ tag (ยิงทันที ไม่ buffer) ─────────────
// รับ queryText มาเพื่อจำแนกในเครื่องเท่านั้น — ส่งออกแค่ tag + model ข้อความดิบไม่ออกจากอุปกรณ์
window.logAiIntent = function (queryText, model) {
    try {
        var payload = window._ilBasePayload([{
            eventType: 'ai_intent',
            tag: window.classifyAiIntent(queryText),
            model: model || ''
        }]);
        fetch(window.APPSCRIPT_URL, {
            method: 'POST', redirect: 'follow', keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }).catch(function (err) { console.warn('logAiIntent failed:', err); });
    } catch (e) { console.warn('logAiIntent error:', e); }
};

// lifecycle flush (feature buffer เท่านั้น; ai_intent ส่งทันทีอยู่แล้ว)
window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') window.flushInteractions(false);
});
window.addEventListener('beforeunload', function () { window.flushInteractions(true); });
