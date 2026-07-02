window.SESSION_ID = 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
window.questionStartTime = Date.now();

window.sendWithRetry = async function (payload, retries = 3) {
    // T2.2: Exponential backoff with full jitter; 4xx (ยกเว้น 429) ไม่ retry; 429/5xx/network retry
    const BASE_MS = 1000;
    const CAP_MS = 10000;

    for (let i = 0; i < retries; i++) {
        let response;
        try {
            response = await fetch(window.APPSCRIPT_URL, {
                method: 'POST',
                redirect: 'follow', // บังคับสิทธิ์ตามพิกัด 302 Redirect ของกูเกิลอย่างน่าเชื่อถือ
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });
        } catch (networkErr) {
            // Network error (offline, DNS, etc.) — retry with backoff
            if (i === retries - 1) throw networkErr;
            const netDelay = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn(`Attempt ${i + 1} failed (network). Retrying in ${Math.round(netDelay)}ms...`);
            await new Promise(res => setTimeout(res, netDelay));
            continue;
        }

        if (!response.ok) {
            const status = response.status;
            // 4xx (ยกเว้น 429): ข้อผิดพลาดถาวร ไม่ retry
            if (status >= 400 && status < 500 && status !== 429) {
                throw new Error('Client error ' + status);
            }
            // 429 หรือ 5xx: retry ด้วย backoff
            if (i === retries - 1) throw new Error('Server error ' + status + ' after ' + retries + ' attempts');
            let retryDelay;
            if (status === 429) {
                const retryAfterHdr = response.headers.get('Retry-After');
                const retryAfterSec = retryAfterHdr ? parseFloat(retryAfterHdr) : NaN;
                retryDelay = !isNaN(retryAfterSec) && retryAfterSec > 0
                    ? retryAfterSec * 1000
                    : Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            } else {
                retryDelay = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            }
            console.warn(`Attempt ${i + 1} failed (${status}). Retrying in ${Math.round(retryDelay)}ms...`);
            await new Promise(res => setTimeout(res, retryDelay));
            continue;
        }

        let resJson;
        try {
            resJson = await response.json();
        } catch (parseErr) {
            // GAS อาจตอบ 200 พร้อม HTML (transient overload) — ถือเป็น retryable
            if (i === retries - 1) throw parseErr;
            const parseDelay = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn(`Attempt ${i + 1} failed (bad JSON). Retrying in ${Math.round(parseDelay)}ms...`);
            await new Promise(res => setTimeout(res, parseDelay));
            continue;
        }

        // ตรวจสอบความถูกต้องของสิทธิ์จากทางหลังบ้านแบบเรียลไทม์ (Global Interceptor)
        if (resJson && resJson.result === 'error' &&
            (resJson.message === 'token_expired' ||
                resJson.message === 'Session หมดอายุ กรุณาล็อกอินใหม่' ||
                (typeof resJson.message === 'string' && resJson.message.indexOf('หมดอายุ') !== -1))) {

            if (typeof window.logoutEditModeSilent === 'function') {
                window.logoutEditModeSilent();
            }
        }

        return resJson;
    }
};

window.sendActivityLog = function (action, target, result = "", meta = "") {
    const timeSpent = Math.floor((Date.now() - window.questionStartTime) / 1000);
    const logEntry = {
        timestamp: Date.now(),
        session: window.SESSION_ID,
        action: action,
        target: target,
        result: result,
        timeSpent: timeSpent,
        metadata: meta || navigator.userAgent
    };
    window.bufferActivityLog(logEntry);
};

window.bufferActivityLog = function (entry) {
    try {
        const buf = JSON.parse(localStorage.getItem('activityBuffer') || '[]');
        buf.push(entry);
        localStorage.setItem('activityBuffer', JSON.stringify(buf));
    } catch (e) {
        console.warn("Buffer log failed:", e);
    }
};

// T3.7: timestamp ของ flush ล่าสุด เพื่อ throttle
window._lastFlushTime = 0;

window.flushActivityLog = function (force) {
    // force เป็น truthy (เช่น Event จาก beforeunload) หรือ true → ข้าม throttle
    try {
        const bufStr = localStorage.getItem('activityBuffer');
        if (!bufStr) return;
        const buf = JSON.parse(bufStr);
        if (!buf.length) return;

        if (!force) {
            const elapsed = Date.now() - window._lastFlushTime;
            // T3.7: flush เฉพาะเมื่อ buffer หนาพอ, ครบ interval, หรือแท็บกำลังซ่อน >15s
            const shouldFlush = buf.length >= 5
                || elapsed >= 60000
                || (document.visibilityState === 'hidden' && elapsed >= 15000);
            if (!shouldFlush) return;
        }

        window._lastFlushTime = Date.now();

        const payload = {
            action: 'batchLog',
            logs: buf
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' });

        let sent = false;
        if (navigator.sendBeacon) {
            sent = navigator.sendBeacon(window.APPSCRIPT_URL, blob);
        }

        // Fallback to fetch with keepalive if sendBeacon is unsupported or fails (e.g., payload exceeds 64KB)
        if (!sent) {
            fetch(window.APPSCRIPT_URL, {
                method: 'POST',
                redirect: "follow",
                keepalive: true,
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            }).catch(err => console.warn("Fallback log flush failed:", err));
        }

        localStorage.removeItem('activityBuffer');
    } catch (e) {
        console.warn("Flush log failed:", e);
    }
};

// Bind lifecycle and tab change listeners
window.removeEventListener('visibilitychange', window.flushActivityLog);
window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
        window.flushActivityLog(); // throttled — ดู logic ใน flushActivityLog
    }
});
window.removeEventListener('beforeunload', window.flushActivityLog);
window.addEventListener('beforeunload', window.flushActivityLog); // force=Event (truthy) → bypass throttle

// กู้คืนฟังก์ชันการส่งข้อมูลรายงานข้อสอบผิดที่ตกหล่นไป
window.saveReportToGoogleSheet = async function (from, category, questionId, question, questionImages, allChoices, suggestedChoice, report, time, suggestedExplain) {
    const data = {
        action: 'submitReport',
        from: from,
        category: category,
        questionId: questionId,
        question: question,
        questionImages: questionImages,
        allChoices: allChoices,
        suggestedChoice: suggestedChoice,
        report: report,
        time: time,
        suggestedExplain: suggestedExplain || ""
    };

    try {
        await window.sendWithRetry(data);
        console.log("Report saved successfully");
    } catch (error) {
        console.error("Error saving report after retries:", error);
    }
};