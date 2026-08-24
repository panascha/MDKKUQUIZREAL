// js/sync.js — ซิงค์ความคืบหน้าข้ามอุปกรณ์ (ต้องล็อกอินด้วยบัญชี KKU — Admin หรือ Student)
// Flow: saveProgressToCache (db.js) → markProgressDirty → flushProgressSync (debounced POST saveProgress)
// ตอนเปิดวิชา: checkCloudProgress ถูกเรียกจาก checkAndPromptRestoreProgress (app.js) — ถ้า cloud ใหม่กว่า local จะถามผู้ใช้

window._progressPending = null;   // { subject, state } ล่าสุดที่ยังไม่ได้อัปโหลด
window._lastProgressSync = 0;
window._isSyncInFlight = false;   // กันยิง saveProgress ซ้อนกันจากหลาย trigger (interval + visibilitychange + beforeunload)
window.PROGRESS_SYNC_INTERVAL_MS = 120000; // อัปโหลดไม่ถี่กว่า 2 นาที (ยกเว้น force)

window.markProgressDirty = function (subjectParam, state) {
    window._progressPending = { subject: subjectParam || 'default', state: state };
};

window.flushProgressSync = async function (force) {
    if (!window._progressPending) return;
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.sessionToken) return;
    if (!force && Date.now() - window._lastProgressSync < window.PROGRESS_SYNC_INTERVAL_MS) return;
    // กันยิงซ้อน: ถ้ามี flush ค้างอยู่ ปล่อย _progressPending ไว้ให้รอบถัดไปเก็บ (interval/visibilitychange/beforeunload อาจยิงพร้อมกัน)
    if (window._isSyncInFlight) return;

    window._isSyncInFlight = true;
    const pending = window._progressPending;
    window._progressPending = null;
    window._lastProgressSync = Date.now();
    try {
        const res = await window.sendWithRetry({
            action: 'saveProgress',
            sessionToken: window.EDIT_SESSION.sessionToken,
            subject: pending.subject,
            state: pending.state
        });
        if (res && res.result === 'stale') {
            // cloud มี state ที่ใหม่กว่า (เครื่องนี้ค้างจอไว้นาน) — ไม่ทับ ปล่อยให้ prompt ตอนเปิดวิชารอบหน้าจัดการ
            console.log('[sync] Cloud state newer — upload skipped');
        }
    } catch (err) {
        // ส่งไม่สำเร็จ → คืน pending ไว้รอรอบหน้า แต่ถ้ามี state ใหม่กว่าถูกคิวไว้ระหว่างรอ (timestamp ใหม่กว่า) อย่าทับ
        const queued = window._progressPending;
        const pendingTs = (pending.state && pending.state.timestamp) || 0;
        const queuedTs = (queued && queued.state && queued.state.timestamp) || 0;
        if (!queued || pendingTs > queuedTs) window._progressPending = pending;
        console.warn('[sync] saveProgress failed:', err);
    } finally {
        window._isSyncInFlight = false;
    }
};

// รอให้ session resume (setupGoogleSSO ดีเลย์ 1.2s + roundtrip verifySession) เสร็จก่อนเช็ค cloud
// คืน true เมื่อมี sessionToken พร้อมใช้, false เมื่อไม่ได้ล็อกอิน/รอเกิน maxMs
window.waitForSyncSession = function (maxMs) {
    return new Promise(function (resolve) {
        if (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) return resolve(true);
        if (!localStorage.getItem('mdkku_session_token')) return resolve(false);
        let waited = 0;
        const iv = setInterval(function () {
            if (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) {
                clearInterval(iv);
                resolve(true);
            } else if ((waited += 200) >= maxMs) {
                clearInterval(iv);
                resolve(false);
            }
        }, 200);
    });
};

// แปลง timestamp เป็นข้อความอ่านง่าย (สำหรับการ์ดเทียบข้อมูล)
window._fmtSyncTs = function (ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—'; // ts เพี้ยน (null/สตริงพัง) → กันโชว์ "Invalid Date"
    try {
        return d.toLocaleString('th-TH', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return d.toLocaleString();
    }
};

// การ์ดข้อมูลด้านเดียว (ใช้ทั้งฝั่ง local และ cloud ในโมดัลเทียบ)
window._syncCardHtml = function (label, color, state, ts) {
    const qStates = (state && state.currentQuestionsState) || [];
    const total = qStates.length;
    const cardOpen = `<div style="flex:1 1 180px; min-width:160px; border:2px solid ${color}; border-radius:10px; padding:12px; text-align:left;">
            <div style="font-weight:800; color:${color}; margin-bottom:8px;">${label}</div>`;
    if (!state || total === 0) {
        // ยังไม่มีข้อมูลฝั่งนี้ (เช่นเครื่องใหม่ หรือคลาวด์ว่าง) → อย่าโชว์ 0/0 ข้อ ให้บอกตรงๆ
        return `${cardOpen}
            <div style="font-size:0.95rem; line-height:1.9; color:var(--color-text-muted);">ยังไม่มีข้อมูล</div>
        </div>`;
    }
    const doneCount = qStates.filter(s => s.state).length;
    const score = (state && typeof state.score === 'number') ? state.score : 0;

    // หมวดที่เลือก (สูงสุด 3 ชื่อ แล้วต่อ +N) — ชื่ออาจหาไม่เจอถ้า structure ยังไม่โหลด/id จากเครื่องอื่น → fallback เป็น id
    const cats = (state.selectedCategories || []).filter(Boolean);
    let catLine = '';
    if (cats.length) {
        const nameOf = function (id) {
            const n = (typeof window.getCategoryNameById === 'function') ? window.getCategoryNameById(id) : '';
            return n || id;
        };
        const shown = cats.slice(0, 3).map(nameOf);
        const more = cats.length - shown.length;
        catLine = `หมวด: <strong>${shown.join(', ')}${more > 0 ? ` +${more}` : ''}</strong><br>`;
    } else if (state.filterMode === 'attribute') {
        // โหมดกรองตามคุณสมบัติ (ปี/กลุ่มสอบ/ท้ายชื่อ) — ไม่ได้เลือกหมวด แสดงตัวกรองที่ใช้แทน
        const attrs = [
            ...(state.selectedYears || []).map(y => 'ปี ' + y),
            ...(state.selectedGroups || []),
            ...(state.selectedSuffixes || [])
        ].filter(Boolean);
        if (attrs.length) catLine = `ตัวกรอง: <strong>${attrs.join(', ')}</strong><br>`;
    }

    // ป้ายสถานะโหมด — index/สุ่ม แสดงเสมอ, ทวนข้อผิด/Fast โชว์เฉพาะตอนเปิด (undefined ก็ไม่พัง)
    const badge = function (txt, bg) {
        return `<span style="display:inline-block; background:${bg}; color:#fff; font-size:0.72rem; font-weight:700; padding:2px 7px; border-radius:999px; margin:2px 4px 2px 0; white-space:nowrap;">${txt}</span>`;
    };
    let badges = badge(`ข้อที่ ${(state.questionIndex || 0) + 1}`, '#475569');
    badges += badge(state.isRandomized ? 'สุ่มข้อ' : 'เรียงข้อ', '#0369a1');
    if (state.isReviewMode) badges += badge('ทวนข้อผิด', '#b45309');
    if (state.isFastMode) badges += badge('Fast Mode', '#7c3aed');

    return `${cardOpen}
            <div style="font-size:0.95rem; line-height:1.9;">
                ทำแล้ว: <strong>${doneCount}/${total}</strong> ข้อ<br>
                คะแนน: <strong>${score}</strong><br>
                ${catLine}
                <span style="color:var(--color-text-muted); font-size:0.85rem;">${window._fmtSyncTs(ts)}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; margin-top:6px;">${badges}</div>
        </div>`;
};

// เช็ค state บน cloud เทียบกับ local + แสดงโมดัลเทียบแบบ side-by-side
// คืน: 'restored' (เลือก cloud, เขียน IndexedDB แล้ว) · 'kept-local' (เลือกเครื่องนี้, ดันขึ้น cloud แล้ว)
//      · 'cancelled' (ปิดเฉยๆ ไม่แตะข้อมูล) · 'no-cloud' (ยังไม่มีข้อมูลบนคลาวด์) · 'no-session' (ยังไม่ล็อกอิน) · null
// options.forcePrompt = true → ข้ามการเงียบเมื่อ cloud ไม่ใหม่กว่า local (สำหรับปุ่มซิงค์เอง)
window.checkCloudProgress = async function (subjectParam, sessionKey, options) {
    options = options || {};
    // ปุ่มสั่งเอง: ผู้ใช้กำลังรออยู่ → รอ session สั้นลง; auto-startup รอนานกว่าได้
    const hasSession = await window.waitForSyncSession(options.forcePrompt ? 2000 : 5000);
    if (!hasSession) return 'no-session';

    let res;
    try {
        res = await window.sendWithRetry({
            action: 'getProgress',
            sessionToken: window.EDIT_SESSION.sessionToken,
            subject: subjectParam || 'default'
        });
    } catch (err) {
        console.warn('[sync] getProgress failed:', err);
        return options.forcePrompt ? 'network-error' : null; // auto-startup เงียบ ไม่รบกวนผู้ใช้ offline
    }
    // token หมดอายุ/ถูกลบบน GAS → sendWithRetry ล้าง session เงียบไปแล้ว แจ้งให้ผู้ใช้ล็อกอินใหม่
    if (res && res.result === 'error' && (res.message === 'session_expired' || res.message === 'token_expired')) return 'no-session';
    if (!res || res.result !== 'success' || !res.state) return 'no-cloud';

    let local = await window.getCacheDB(sessionKey);
    const localTs = (local && local.timestamp) || 0;
    if (!options.forcePrompt && (res.timestamp || 0) <= localTs) return null; // local ใหม่กว่า/เท่ากัน → เงียบ (เฉพาะ auto)

    $('#loading-overlay').hide();
    const result = await Swal.fire({
        title: 'เทียบความคืบหน้ากับคลาวด์',
        html: `
            <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:8px;">
                ${window._syncCardHtml('เครื่องนี้', '#64748b', local, localTs)}
                ${window._syncCardHtml('คลาวด์', '#1a73e8', res.state, res.timestamp)}
            </div>`,
        icon: 'question',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'ใช้ข้อมูลบนคลาวด์',
        denyButtonText: 'ใช้ข้อมูลเครื่องนี้',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#1a73e8',
        denyButtonColor: '#64748b',
        allowOutsideClick: false
    });

    if (result.isConfirmed) {
        await window.setCacheDB(sessionKey, res.state);
        // กันโยน state ที่เพิ่งดึงมากลับขึ้น cloud ทันที (echo) — เคลียร์คิว + รีเซ็ตตัวจับเวลา
        window._progressPending = null;
        window._lastProgressSync = Date.now();
        return 'restored';
    }

    if (result.isDenied) {
        // เครื่องใหม่ที่ยังไม่เคย save ลง IndexedDB → snapshot state ในหน่วยความจำก่อน ไม่งั้นจะดันของว่างขึ้น cloud
        if (!local && typeof window.saveProgressToCache === 'function') {
            await window.saveProgressToCache();
            local = await window.getCacheDB(sessionKey);
        }
        // เลือกเครื่องนี้ → ดัน local ขึ้น cloud ด้วย timestamp ใหม่ (ทับ cloud, จะได้ไม่ถามซ้ำ)
        if (local) {
            local.timestamp = Date.now();
            await window.setCacheDB(sessionKey, local);
            window.markProgressDirty(subjectParam || 'default', local);
            window.flushProgressSync(true);
        }
        return 'kept-local';
    }

    return 'cancelled'; // ยกเลิก → ไม่แตะข้อมูลทั้งสองฝั่ง
};

// คู่มือการใช้งานซิงค์ข้ามอุปกรณ์ (เปิดจากลิงก์ในหน้าล็อกอิน และปุ่ม ? บนป้ายสถานะ)
window.showSyncHelpModal = function () {
    Swal.fire({
        title: '<i class="fas fa-cloud" style="color:#38bdf8;"></i> วิธีใช้การซิงค์ข้ามอุปกรณ์',
        html: `
            <div style="text-align: left; font-size: 1rem; line-height: 1.8;">
                <p><strong>ทำข้อสอบต่อจากที่ค้างไว้ ไม่ว่าจะเปิดจากมือถือหรือคอม</strong></p>
                <ol style="padding-left: 20px; margin: 10px 0;">
                    <li>กดปุ่มโลโก้ <strong>KKU</strong> (มุมขวาล่าง) แล้วล็อกอินด้วยบัญชี
                        <strong>@kkumail.com</strong> หรือ <strong>@kku.ac.th</strong></li>
                    <li>ทำข้อสอบตามปกติ — ระบบบันทึกความคืบหน้าให้อัตโนมัติ
                        (อัปโหลดทุก ~2 นาที และตอนสลับแอป/ปิดแท็บ)</li>
                    <li>ที่เครื่องอีกเครื่อง ล็อกอิน<strong>บัญชีเดียวกัน</strong>แล้วเปิดวิชาเดิม</li>
                    <li>ระบบจะถาม "พบความคืบหน้าจากอุปกรณ์อื่น" —
                        กด <strong>ทำต่อจากอุปกรณ์อื่น</strong> เพื่อทำต่อจากข้อที่ค้างไว้
                        หรือ <strong>ใช้ของเครื่องนี้</strong> เพื่อใช้ข้อมูลในเครื่องแทน</li>
                </ol>
                <p style="font-size: 0.9rem; color: var(--color-text-muted); margin-top: 10px;">
                    <i class="fas fa-info-circle"></i> ความคืบหน้าแยกเก็บรายวิชา ·
                    ล็อกอินค้างไว้ได้สูงสุด 5 เครื่อง (เครื่องเก่าสุดจะหลุดเอง) ·
                    ถ้าไม่ล็อกอิน ข้อมูลยังบันทึกในเครื่องตามปกติ แต่จะไม่ซิงค์ข้ามอุปกรณ์
                </p>
            </div>
        `,
        confirmButtonText: 'เข้าใจแล้ว',
        width: 600
    }).then(function () {
        // เปิดจากหน้าล็อกอิน (Swal เปิดซ้อนไม่ได้ — หน้าล็อกอินถูกแทนที่) → พากลับไปล็อกอินต่อ
        if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) window.showGoogleSignInModal();
    });
};

// เรียกจาก auth-edit.js หลังล็อกอิน/กู้ session สำเร็จ — ดัน state ที่ค้างอยู่ขึ้นทันที
window.onSyncSessionReady = function () {
    window.flushProgressSync(true);
};

// Triggers (แบบเดียวกับ flushActivityLog ใน api.js): เช็คทุก 30s (throttle จริงใน flush),
// อัปโหลดทันทีเมื่อซ่อนแท็บ/ปิดหน้า
setInterval(function () { window.flushProgressSync(false); }, 30000);
window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') window.flushProgressSync(true);
});
window.addEventListener('beforeunload', function () { window.flushProgressSync(true); });
