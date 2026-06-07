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
            return await response.json();
        } catch (err) {
            console.warn(`Attempt ${i + 1} failed. Retrying...`);
            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
    }
};

window.sendActivityLog = function (action, target, result = "", meta = "") {
    const timeSpent = Math.floor((Date.now() - window.questionStartTime) / 1000);

    const payload = {
        action: 'logUserActivity',
        data: {
            session: window.SESSION_ID,
            action: action,
            target: target,
            result: result,
            timeSpent: timeSpent,
            metadata: meta || navigator.userAgent
        }
    };

    fetch(window.APPSCRIPT_URL, {
        method: 'POST',
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    }).catch(err => console.warn("Log Error:", err));
};

// กู้คืนฟังก์ชันการส่งข้อมูลรายงานข้อสอบผิดที่ตกหล่นไป
window.saveReportToGoogleSheet = async function (from, category, questionId, question, questionImages, allChoices, suggestedChoice, report, time) {
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
        time: time
    };

    try {
        await window.sendWithRetry(data);
        console.log("Report saved successfully");
    } catch (error) {
        console.error("Error saving report after retries:", error);
    }
};