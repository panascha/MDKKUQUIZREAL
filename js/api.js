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
// ⚠️ RETRY AMPLIFICATION GUARD (2026-08-02)
//   abort/ล้มฝั่ง browser ไม่ได้หยุด execution ฝั่ง GAS — retry ด้วย URL ใหม่ = execution ที่ 2 ซ้อนตัวแรก
//   ที่ยังรันอยู่ ทั้งคู่กินโควต้า simultaneous executions ของบัญชีเจ้าของ (deployment รันแบบ USER_DEPLOYING)
//   → คำขอหนักๆ เร่งกันจนคิวเต็ม แล้วทุกตัวไปตายที่เพดาน 6 นาที (369.99s ในหน้า Executions)
//   กติกา: retry เฉพาะที่ "ล้มเร็ว" (cold-start / echo key หมดอายุ — ล้มในไม่กี่วินาที) เท่านั้น
//   ล้มช้า = เซิร์ฟเวอร์กำลังทำงานจริง → ยิงซ้ำมีแต่ทำให้แย่ลง
var GAS_SLOW_FAIL_MS = 15000;
// เขียน (editQuestion ฯลฯ) ใช้เวลานาน 15-25s ปกติ (Sheet sort + lock) — timeout สั้นตัด save ที่สำเร็จอยู่แล้วออกก่อนเวลา
var POST_SLOW_FAIL_MS = 60000;
window.fetchGAS = async function (buildUrl, retries) {
    retries = (typeof retries === 'number') ? retries : 3;
    var BASE_MS = 1500;
    var CAP_MS  = 12000;

    for (var i = 0; i < retries; i++) {
        var url = typeof buildUrl === 'function' ? buildUrl() : buildUrl;
        var attemptStart = Date.now();
        var response;
        try {
            response = await fetch(url, { redirect: 'follow' });
        } catch (netErr) {
            if (i === retries - 1) throw netErr;
            if (Date.now() - attemptStart > GAS_SLOW_FAIL_MS) throw netErr;
            var nd = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn('[fetchGAS] Network error attempt ' + (i + 1) + '. Retry in ' + Math.round(nd) + 'ms');
            await new Promise(function(r){ setTimeout(r, nd); });
            continue;
        }

        // GAS cold-start / stale echo key → 404 หรือ 5xx
        if (!response.ok) {
            if (i === retries - 1) throw new Error('[fetchGAS] HTTP ' + response.status + ' after ' + retries + ' attempts');
            // 404 ที่มาหลังรอนาน ≠ cold-start — GAS ทำงานอยู่จริงและ echo key หมดอายุระหว่างทาง
            if (Date.now() - attemptStart > GAS_SLOW_FAIL_MS) {
                throw new Error('[fetchGAS] HTTP ' + response.status + ' after ' + Math.round((Date.now() - attemptStart) / 1000) + 's — ไม่ retry (เซิร์ฟเวอร์ยังประมวลผลคำขอเดิมอยู่)');
            }
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
            if (Date.now() - attemptStart > GAS_SLOW_FAIL_MS) throw new SyntaxError('[fetchGAS] Got HTML body หลังรอ ' + Math.round((Date.now() - attemptStart) / 1000) + 's — ไม่ retry');
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
        const attemptStart = Date.now();
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
            // ล้มหลังรอนาน = GAS รับงานไปแล้วและยังรันอยู่ (write action อาจสำเร็จไปแล้วด้วยซ้ำ)
            // → retry = execution ซ้อน + เสี่ยงเขียนซ้ำ
            if (Date.now() - attemptStart > POST_SLOW_FAIL_MS) throw networkErr;
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
            // 404 cold-start เกิดในไม่กี่วินาที — 404/5xx ที่มาช้าแปลว่า GAS ประมวลผลจริงอยู่ ห้ามยิงซ้ำ
            // (429 ยกเว้น: rate-limit ตอบเร็วเสมอ และมี Retry-After กำกับ)
            if (status !== 429 && Date.now() - attemptStart > POST_SLOW_FAIL_MS) {
                throw new Error('Server error ' + status + ' after ' + Math.round((Date.now() - attemptStart) / 1000) + 's — ไม่ retry (คำขอเดิมอาจยังทำงานอยู่)');
            }
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
        // เดิมใช้ substring 'หมดอายุ' ทำให้ logout จาก error ทั่วไป (เช่น rate limit/parse fail ของฝั่งหลังบ้าน)
        // ตอนนี้รับเฉพาะ code error ที่ backend ส่งมาอย่างชัดเจนเท่านั้น
        if (resJson && resJson.result === 'error' &&
            (resJson.message === 'session_expired' ||
             resJson.message === 'token_expired' ||
             resJson.message === 'Session หมดอายุ กรุณาล็อกอินใหม่')) {

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
// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE READ LAYER — Phase 1 ฝั่ง REAL, slice `questions` เท่านั้น
//
// structure/category/announcements/votes/reports ยังมาจาก GAS ทั้งหมด — เปลี่ยนเฉพาะ
// ตัวที่หนักที่สุด (getQuestions) ซึ่งเป็นคำขอที่ทำให้ GAS ช้าและกินโควตามากที่สุด
//
// ⚠️ v_questions ไม่มีคอลัมน์ subject — การตัดสินว่าข้อไหนอยู่วิชาไหนต้องผ่าน
//    category → subjectRef map ฝั่ง client (มาจาก getStructure ของ GAS) เสมอ
//    predicate ตัวเดียวกันนี้ถูกส่งเข้าไปเป็น ?category=ov.{...} เพื่อไม่ต้องโหลด
//    ข้อสอบทั้งฐาน 23,904 ข้อ (~19MB) ลงเครื่องนักศึกษาเพื่อดูวิชาเดียว
//
// ทุกฟังก์ชันในบล็อกนี้ไม่ถูกเรียกเลยถ้า window.USE_SUPABASE_QUESTIONS = false
// ─────────────────────────────────────────────────────────────────────────────

// PostgREST บังคับ header `apikey` — Authorization: Bearer เปล่าๆ ถูกปฏิเสธ 401
window.sbHeaders = function () {
    return {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY,
        Accept: 'application/json'
    };
};

// ยิงจริง + retry — คืน Response ดิบ เพราะ sbFetchPaged ต้องอ่าน header Content-Range
// (Supabase ประกาศ Content-Range ไว้ใน Access-Control-Expose-Headers แล้ว ตรวจจากของจริง 2026-09-05)
async function sbRequest(path, init, retries) {
    retries = (typeof retries === 'number') ? retries : 3;
    var BASE_MS = 500;
    var CAP_MS = 8000;

    for (var i = 0; i < retries; i++) {
        var response;
        try {
            response = await fetch(window.SUPABASE_URL + '/rest/v1/' + path, init);
        } catch (netErr) {
            if (i === retries - 1) throw netErr;
            var nd = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn('[sbFetch] Network error attempt ' + (i + 1) + '. Retry in ' + Math.round(nd) + 'ms');
            await new Promise(function (r) { setTimeout(r, nd); });
            continue;
        }

        // 4xx = คำขอผิดเอง (คีย์ผิด/คอลัมน์ผิด/RLS/URL ยาวเกิน) — ยิงซ้ำได้ผลเดิม
        if (response.status >= 400 && response.status < 500) {
            throw new Error('[sbFetch] HTTP ' + response.status + ' ' + path.slice(0, 120) + ' — ' + (await response.text()).slice(0, 200));
        }
        if (!response.ok) {
            if (i === retries - 1) throw new Error('[sbFetch] HTTP ' + response.status + ' after ' + retries + ' attempts');
            var hd = Math.random() * Math.min(BASE_MS * Math.pow(2, i), CAP_MS);
            console.warn('[sbFetch] HTTP ' + response.status + ' attempt ' + (i + 1) + '. Retry in ' + Math.round(hd) + 'ms');
            await new Promise(function (r) { setTimeout(r, hd); });
            continue;
        }

        return response;
    }
}

window.sbFetch = async function (path, init, retries) {
    var response = await sbRequest(path, init, retries);
    return response.json();
};

// ผลลัพธ์ถูกตัดที่ 1000 แถวเสมอ และต้องใช้ ?limit=&offset= — header Range ถูกเมิน
// pathWithQuery ต้องมี order= ที่ unique อยู่แล้ว ไม่งั้น offset ข้าม/ซ้ำแถวเงียบๆ
//
// หน้าที่หายไปหนึ่งหน้าจะ "เร็วและดูถูกต้อง" ทุกประการ — จึงขอ count=exact ติดมากับหน้าแรก
// (ไม่เปลืองคำขอเพิ่ม) แล้วเทียบยอดรวมก่อนคืนค่า ถ้าไม่ตรงให้ throw เพื่อให้ caller ตกไป GAS
window.sbFetchPaged = async function (pathWithQuery) {
    var pageSize = window.SUPABASE_PAGE_SIZE;
    var out = [];
    var expected = null;

    for (var offset = 0; ; offset += pageSize) {
        var headers = window.sbHeaders();
        if (offset === 0) headers.Prefer = 'count=exact';

        var response = await sbRequest(pathWithQuery + '&limit=' + pageSize + '&offset=' + offset, { headers: headers });

        if (offset === 0) {
            var cr = response.headers.get('Content-Range');       // เช่น "0-999/2557"
            var total = cr ? cr.split('/')[1] : null;
            if (total && total !== '*') expected = parseInt(total, 10);
        }

        var page = await response.json();
        if (!Array.isArray(page)) throw new Error('[sbFetchPaged] ไม่ได้ array จาก ' + pathWithQuery.slice(0, 120));
        for (var i = 0; i < page.length; i++) out.push(page[i]);   // ห้าม spread — 1000 args ต่อรอบ

        if (page.length < pageSize) break;
    }

    if (expected !== null && !isNaN(expected) && out.length !== expected) {
        throw new Error('[sbFetchPaged] อ่านได้ ' + out.length + ' แถว คาด ' + expected + ' — ข้อมูลไม่ครบ');
    }
    return out;
};

// cursor/ยอดรวมของฐาน — อ่านจาก DB เสมอ ห้ามใช้นาฬิกาของเครื่อง client
// คืน { questions: <ISO|null>, serverTime: <ISO>, questionCount: <int> }
window.fetchSupabaseDataVersion = function () {
    return window.sbFetch('rpc/data_version', {
        method: 'POST',
        headers: Object.assign(window.sbHeaders(), { 'Content-Type': 'application/json' }),
        body: '{}'
    });
};

// เรียงตาม questionId แบบรู้จักตัวเลข: CVS_51MCQ1_2 มาก่อน CVS_51MCQ1_10
// (เรียงแบบ lexical ล้วนจะได้ _10 ก่อน _2 ซึ่งพังลำดับข้อสอบในโหมด "ไม่สุ่ม")
var _sbCollator = null;
window.sortQuestionsNatural = function (rows) {
    if (!_sbCollator) _sbCollator = new Intl.Collator('en', { numeric: true });
    return rows.sort(function (a, b) {
        return _sbCollator.compare(String(a.questionId), String(b.questionId));
    });
};

// ตัด categoryId เป็นก้อนตามความยาว "หลัง encode" ไม่ใช่ตามจำนวนหมวด
// ชื่อหมวดยาวไม่เท่ากันมาก (CVS ~42 ตัว/หมวด, GI ~62) การนับจำนวนหมวดจึงคุมความยาว URL ไม่ได้จริง
window.sbChunkCategoryIds = function (ids) {
    var budget = window.SUPABASE_FILTER_URL_BUDGET;
    var out = [];
    var cur = [];
    var len = 2;                                   // วงเล็บปีกกาเปิด-ปิด
    for (var i = 0; i < ids.length; i++) {
        var cost = encodeURIComponent('"' + ids[i] + '",').length;
        if (cur.length && len + cost > budget) { out.push(cur); cur = []; len = 2; }
        cur.push(ids[i]);
        len += cost;
    }
    if (cur.length) out.push(cur);
    return out;
};

// โหลดข้อสอบของวิชาเดียวจาก Supabase
//   structure = ผลลัพธ์ getStructure&subject=<subjectParam> ของ GAS (ต้องมี .category)
// throw ทุกกรณีที่ไม่มั่นใจว่าได้ข้อมูลครบ — caller (fetchQuestionsForSubject) จะตกไป GAS ให้เอง
window.fetchSupabaseQuestionsForSubject = async function (subjectParam, structure) {
    var cleanFilter = subjectParam ? String(subjectParam).trim().toUpperCase() : '';

    // ── โหลดทุกวิชา (ผู้ใช้กด "โหลดทุกวิชา") — ไม่มี predicate, เทียบครบด้วย questionCount ของ DB
    if (cleanFilter === '') {
        var dv = await window.fetchSupabaseDataVersion();
        var allRows = await window.sbFetchPaged('v_questions?select=*&order=questionId');
        var expected = Number(dv && dv.questionCount);
        if (!isNaN(expected) && allRows.length !== expected) {
            throw new Error('[Supabase] อ่านข้อสอบได้ไม่ครบ: ' + allRows.length + '/' + expected);
        }
        return window.sortQuestionsNatural(allRows);
    }

    // ── map หมวด→วิชา ฝั่ง client: ใช้เกณฑ์เดียวกับ GAS getQuestionsArray เป๊ะ
    //    (cache.gs: key = categoryId.trim(), value = subjectRef.trim().toUpperCase())
    var catIds = [];
    var catRows = (structure && structure.category) || [];
    for (var i = 0; i < catRows.length; i++) {
        if (String(catRows[i].subjectRef || '').trim().toUpperCase() !== cleanFilter) continue;
        var cid = String(catRows[i].categoryId || '').trim();
        if (cid) catIds.push(cid);
    }

    // หมวดว่าง ⇒ ov.{} คืน 0 แถว ซึ่ง "ดูเหมือนสำเร็จ" — ต้องตกไป GAS แทนที่จะแคชวิชาเปล่า
    if (!catIds.length) {
        throw new Error('[Supabase] ไม่พบหมวดของวิชา ' + cleanFilter + ' ใน structure — ไม่ยิง query');
    }

    var chunks = window.sbChunkCategoryIds(catIds);
    var byId = new Map();
    for (var c = 0; c < chunks.length; c++) {
        var literal = '{' + chunks[c].map(function (id) {
            return '"' + id.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        }).join(',') + '}';
        // ov. = array overlap ⇒ "ข้อนี้มีหมวดใดหมวดหนึ่งของวิชานี้" = predicate เดียวกับ GAS .some()
        var rows = await window.sbFetchPaged(
            'v_questions?select=*&category=ov.' + encodeURIComponent(literal) + '&order=questionId'
        );
        for (var r = 0; r < rows.length; r++) byId.set(rows[r].questionId, rows[r]);   // ข้อเดียวอยู่ได้หลายหมวด/หลายก้อน
    }

    return window.sortQuestionsNatural(Array.from(byId.values()));
};

// จุดเรียกใช้จริงของ app.js — ลอง Supabase ก่อน ล้มเมื่อไรตกไป GAS getQuestions ทันที
// คืน array ของข้อสอบรูปแบบเดียวกับ GAS ทุกประการ (มี updatedAt เพิ่มมาเฉยๆ ไม่มีใครอ่าน)
window.fetchQuestionsForSubject = async function (subjectParam, structure) {
    if (window.USE_SUPABASE_QUESTIONS) {
        try {
            return await window.fetchSupabaseQuestionsForSubject(subjectParam, structure);
        } catch (err) {
            console.warn('[Supabase] โหลดข้อสอบไม่สำเร็จ ใช้ GAS แทน:', err);
        }
    }
    return window.fetchGAS(function () {
        return window.APPSCRIPT_URL + '?action=getQuestions&subject=' + subjectParam + '&_=' + Date.now();
    });
};
