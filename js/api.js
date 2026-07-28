window.SESSION_ID = 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
window.questionStartTime = Date.now();

// ──────────────────────────────────────────────────────────────────────────────
// fetchGAS — GET wrapper สำหรับ Google Apps Script ที่มี retry อัตโนมัติ
//
// สาเหตุที่ต้องมี:
//   GAS GET request ถูก redirect ผ่าน script.googleusercontent.com/macros/echo
//   โดยมี user_content_key ที่มีอายุสั้นมาก (< 60s). เมื่อ GAS container cold-start
//   browser ได้รับ redirect ก่อน container พร้อม ทำให้ echo URL ที่ redirect ไปได้
//   return 404 + HTML แทน JSON → JSON.parse crash → "Unexpected token '<'"
//
// วิธีแก้: retry ด้วย fresh URL (cache-buster ใหม่) แทนที่จะ retry URL เดิม
//   เพราะ url_content_key ฝัง timestamp อยู่แล้ว — การเรียก exec URL ใหม่จะได้
//   echo URL ใหม่ที่ยังไม่หมดอายุ
// ──────────────────────────────────────────────────────────────────────────────
window.fetchGAS = async function (buildUrl, retries) {
    retries = (typeof retries === 'number') ? retries : 3;
    var BASE_MS = 1500;
    var CAP_MS  = 12000;

    for (var i = 0; i < retries; i++) {
        var url = typeof buildUrl === 'function' ? buildUrl() : buildUrl;
        var response;
        try {
            response = await fetch(url, { redirect: 'follow' });
        } catch (netErr) {
            if (i === retries - 1) throw netErr;
            var nd = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn('[fetchGAS] Network error attempt ' + (i + 1) + '. Retry in ' + Math.round(nd) + 'ms');
            await new Promise(function(r){ setTimeout(r, nd); });
            continue;
        }

        // GAS cold-start / stale echo key → 404 หรือ 5xx
        if (!response.ok) {
            if (i === retries - 1) throw new Error('[fetchGAS] HTTP ' + response.status + ' after ' + retries + ' attempts');
            var hd = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn('[fetchGAS] HTTP ' + response.status + ' attempt ' + (i + 1) + '. Retry in ' + Math.round(hd) + 'ms');
            await new Promise(function(r){ setTimeout(r, hd); });
            continue;
        }

        var text;
        try {
            text = await response.text();
        } catch (readErr) {
            if (i === retries - 1) throw readErr;
            continue;
        }

        // GAS อาจ redirect ไป echo แล้วได้รับ HTML (overload / transient error)
        if (!text || text.trimStart().startsWith('<')) {
            if (i === retries - 1) throw new SyntaxError('[fetchGAS] Got HTML instead of JSON after ' + retries + ' attempts');
            var pd = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn('[fetchGAS] Got HTML body attempt ' + (i + 1) + '. Retry in ' + Math.round(pd) + 'ms');
            await new Promise(function(r){ setTimeout(r, pd); });
            continue;
        }

        return JSON.parse(text);
    }
};

// signal (optional): AbortSignal — ใช้กับปุ่ม "หยุด" ของแชท
//   หมายเหตุสำคัญ: abort หยุดได้แค่ฝั่ง browser เท่านั้น GAS ที่รันอยู่ไม่หยุดตาม
//   โควต้า/rate-limit ที่ใช้ไปแล้วไม่คืน — เป็นแค่การเลิกรอคำตอบ ไม่ใช่การประหยัดโควต้า
window.sendWithRetry = async function (payload, retries = 3, signal = null) {
    // T2.2: Exponential backoff with full jitter; 4xx (ยกเว้น 429) ไม่ retry; 429/5xx/network retry
    const BASE_MS = 1000;
    const CAP_MS = 10000;

    for (let i = 0; i < retries; i++) {
        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
        let response;
        try {
            response = await fetch(window.APPSCRIPT_URL, {
                method: 'POST',
                redirect: 'follow', // บังคับสิทธิ์ตามพิกัด 302 Redirect ของกูเกิลอย่างน่าเชื่อถือ
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                signal: signal || undefined
            });
        } catch (networkErr) {
            // ผู้ใช้กดหยุดเอง — ห้าม retry ต่อ ไม่งั้นยิงซ้ำทั้งที่สั่งหยุดไปแล้ว
            if (networkErr && networkErr.name === 'AbortError') throw networkErr;
            // Network error (offline, DNS, etc.) — retry with backoff
            if (i === retries - 1) throw networkErr;
            const netDelay = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn(`Attempt ${i + 1} failed (network). Retrying in ${Math.round(netDelay)}ms...`);
            await new Promise(res => setTimeout(res, netDelay));
            continue;
        }

        if (!response.ok) {
            const status = response.status;
            // 4xx (ยกเว้น 429 และ 404): ข้อผิดพลาดถาวร ไม่ retry
            // 404 เป็นข้อยกเว้น: POST ไป GAS ถูก 302 redirect ไป script.googleusercontent.com/macros/echo
            //   ตอน container cold-start echo URL ยังไม่พร้อม → 404 ชั่วคราว (transient) → ต้อง retry
            //   (เหมือน fetchGAS ด้านบนที่ retry ทุก !response.ok)
            if (status >= 400 && status < 500 && status !== 429 && status !== 404) {
                throw new Error('Client error ' + status);
            }
            // 429, 404 หรือ 5xx: retry ด้วย backoff
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

// Analytics logging ย้ายไป js/interaction-log.js แล้ว (logFeature / logAiIntent → action=logUserInteraction)
// ระบบเดิม (sendActivityLog/flushActivityLog → batchLog/UserActivity) ถูกถอดออก: write-only ไม่มีใครอ่าน + เขียนลง SHEET_ID เดียวกับคลังข้อสอบ

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