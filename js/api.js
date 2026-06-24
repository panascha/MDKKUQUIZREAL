window.SESSION_ID = 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
window.questionStartTime = Date.now();

window.sendWithRetry = async function (payload, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(window.APPSCRIPT_URL, {
                method: 'POST',
                redirect: 'follow', // บังคับสิทธิ์ตามพิกัด 302 Redirect ของกูเกิลอย่างน่าเชื่อถือ
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Server Busy');
            const resJson = await response.json();

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
        } catch (err) {
            console.warn(`Attempt ${i + 1} failed. Retrying...`);
            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
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

window.flushActivityLog = function () {
    try {
        const bufStr = localStorage.getItem('activityBuffer');
        if (!bufStr) return;
        const buf = JSON.parse(bufStr);
        if (!buf.length) return;

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
        window.flushActivityLog();
    }
});
window.removeEventListener('beforeunload', window.flushActivityLog);
window.addEventListener('beforeunload', window.flushActivityLog);

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