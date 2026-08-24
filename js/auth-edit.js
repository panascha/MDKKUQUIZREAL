// js/auth-edit.js

window.EDIT_SESSION = {
    isLoggedIn: false,
    email: '',
    displayName: '',
    fullName: '',
    studentId: '',
    sessionToken: '',
    role: ''
};

window.GOOGLE_CLIENT_ID = "409421225331-envq9b2dg6d2tbq2681c097j4h1qinv4.apps.googleusercontent.com";

window.showGoogleSignInModal = function (titleText = 'เข้าสู่ระบบ MDKKUQUIZ') {
    Swal.fire({
        title: titleText,
        html: `
            <p style="font-size: 1.1rem; color: var(--color-text-muted); margin-bottom: 15px;">
                กรุณาลงชื่อเข้าใช้ด้วยบัญชี Google ของทางมหาวิทยาลัยขอนแก่น (@kkumail.com หรือ @kku.ac.th)
                เพื่อซิงค์ความคืบหน้าข้ามอุปกรณ์ (ทำต่อจากที่ค้างไว้บนเครื่องอื่น)
            </p>
            <div id="google-signin-button-swal" style="display: flex; justify-content: center; margin: 20px 0; min-height: 44px;"></div>
            <p style="font-size: 0.9rem; color: var(--color-text-muted);">
                *ผู้ที่อยู่ใน Whitelist แอดมินจะได้รับสิทธิ์แก้ไขข้อสอบและ AI Assistant โดยอัตโนมัติ
            </p>
            <p style="font-size: 0.95rem; margin-top: 8px;">
                <a href="javascript:void(0)" onclick="window.showSyncHelpModal()" style="color: #0ea5e9; text-decoration: underline;">
                    <i class="fas fa-circle-question"></i> วิธีใช้การซิงค์ข้ามอุปกรณ์
                </a>
            </p>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            const container = document.getElementById("google-signin-button-swal");
            if (container) {
                google.accounts.id.renderButton(container, {
                    theme: "filled_blue",
                    size: "large",
                    width: 250,
                    shape: "pill"
                });
            }
        }
    });
};

// เปิด/ปิดสถานะสีเทาของฟีเจอร์ที่ต้องล็อกอิน (AI Passport, ข้อออกบ่อย) ตามสถานะ EDIT_SESSION
window.updateLoginGatedFeaturesUI = function () {
    var loggedIn = !!(window.EDIT_SESSION && window.EDIT_SESSION.isLoggedIn);
    $('#open-similar-report-btn, #chatbot-fab, #btn-quick-refresh').toggleClass('login-gated', !loggedIn);
};

window.ensureActiveSession = function () {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        window.showGoogleSignInModal('กรุณาเข้าสู่ระบบก่อนดำเนินการ');
        return false;
    }
    if (!window.EDIT_SESSION.sessionToken) {
        window.logoutEditModeSilent();
        window.showGoogleSignInModal('เซสชันแก้ไขข้อสอบหมดอายุการใช้งาน');
        return false;
    }
    return true;
};

window.logoutEditModeSilent = function () {
    // จำอีเมลคนล่าสุด + เคลียร์คิวอัปโหลดที่ค้าง กันไปโผล่อัปใต้ token ของคนที่ล็อกอินต่อ
    try { if (window.EDIT_SESSION && window.EDIT_SESSION.email) localStorage.setItem('mdkku_last_user_email', window.EDIT_SESSION.email); } catch (e) { }
    window._progressPending = null;
    localStorage.removeItem("mdkku_session_token");
    sessionStorage.removeItem("mdkku_edit_session");
    window.EDIT_SESSION = {
        isLoggedIn: false,
        email: '',
        displayName: '',
        fullName: '',
        studentId: '',
        sessionToken: '',
        role: ''
    };
    $("body").removeClass("edit-mode-active");
    $("#edit-mode-badge").hide();
    $("#btn-edit-current-q").fadeOut(200);
    $("#toggle-edit-mode-btn")
        .css({ "background": "#1e293b", "border": "1px solid #475569" })
        .html('<img src="https://www.kku.ac.th/wp-content/uploads/2021/07/KKU-Logo-PNG.png" alt="KKU Logo" style="width: 24px; height: 24px; object-fit: contain;">');
    if (typeof window.closeEditModal === 'function') {
        window.closeEditModal();
    }
    window.updateLoginGatedFeaturesUI();
};

window.resumeSessionFromToken = async function (token) {
    try {
        const res = await window.sendWithRetry({ action: 'verifySession', sessionToken: token });

        if (res.result === 'success') {
            window.EDIT_SESSION = {
                isLoggedIn: true,
                email: res.user.email,
                displayName: res.user.displayName,
                fullName: res.user.fullName,
                studentId: res.user.studentId,
                sessionToken: token,
                role: res.user.role
            };
            if (res.user.role === 'Student') {
                window.enableStudentModeUI();
            } else {
                window.enableEditModeUI();
            }
            window.updateLoginGatedFeaturesUI();
            console.log("Session restored for:", res.user.displayName);
            if (typeof window.onSyncSessionReady === 'function') window.onSyncSessionReady();
            window.promptStudentIdIfNeeded();
            // merge server-side subject popularity counts into local storage
            window._mergeServerPopularity();
        } else if (res.result === 'error' &&
                   (res.message === 'session_expired' || res.message === 'token_expired' || res.message === 'Session หมดอายุ กรุณาล็อกอินใหม่')) {
            // backend บอกชัดเจนว่า token หมดอายุหรือเพิกถอน → ล้างทิ้ง
            localStorage.removeItem("mdkku_session_token");
            console.log("Session expired, user must re-login.");
        } else {
            // transient error (เครือข่าย/overload) → เก็บ token ไว้ลองใหม่
            console.warn("verifySession transient error, keeping token:", res && res.message);
        }
    } catch (err) {
        console.warn("Session resume failed:", err);
    }
};

// รวมยอดความถี่การเลือกวิชาจาก cloud เข้ากับของในเครื่อง (ข้ามอุปกรณ์)
// ยิงครั้งเดียวต่อแท็บ — การเลือกวิชาทุกครั้งทำให้หน้า navigate ใหม่ ถ้าไม่กันไว้จะสแกนชีตทุกครั้งที่โหลด
window._mergeServerPopularity = async function () {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.sessionToken) return;
    if (sessionStorage.getItem('mdkku_pop_merged')) return;
    sessionStorage.setItem('mdkku_pop_merged', '1');
    try {
        const res = await window.sendWithRetry({
            action: 'getSubjectPopularity',
            sessionToken: window.EDIT_SESSION.sessionToken
        });
        if (!res || res.result !== 'success' || !res.counts) return;

        const local = JSON.parse(localStorage.getItem('mdkku_subject_popularity') || '{}');
        let changed = false;
        Object.keys(res.counts).forEach(subj => {
            const merged = Math.max(local[subj] || 0, res.counts[subj] || 0);
            if (merged !== (local[subj] || 0)) { local[subj] = merged; changed = true; }
        });
        if (!changed) return;
        localStorage.setItem('mdkku_subject_popularity', JSON.stringify(local));

        // การ merge เสร็จหลัง dropdown ถูกวาดไปแล้ว (setupGoogleSSO หน่วง 1.2s + verifySession)
        // ถ้าไม่วาดใหม่ ยอดจากเครื่องอื่นจะไม่มีผลจนกว่าจะรีโหลดรอบถัดไป
        if (window.APP && window.APP.allSubjectsList && typeof window.sortSubjectsByPopularity === 'function') {
            window.APP.allSubjectsList = window.sortSubjectsByPopularity(window.APP.allSubjectsList);
            window.filterSubjectOptions($('#year-select').val() || '', $('#subject-select').val() || '');
        }
    } catch (err) {
        console.warn('[popularity] merge failed:', err);
    }
};

// ยืนยันตัวตนด้วยรหัสนักศึกษา — ผู้ใช้ที่ auto-enroll ผ่าน Google SSO ยังไม่มีรหัส นศ. → ขอกรอกหลังล็อกอิน
// ข้ามได้ (ไม่บล็อกการใช้งาน) แต่จะถามอีกครั้งในการล็อกอิน/กลับเข้าใช้ครั้งถัดไปจนกว่าจะกรอก
window.promptStudentIdIfNeeded = function () {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn || !window.EDIT_SESSION.sessionToken) return;
    if (window.EDIT_SESSION.studentId) return; // มีแล้ว ไม่ต้องถาม
    // กด "ข้ามไปก่อน" แล้วพักการถาม 24 ชม. (คีย์ร่วม same-origin กับหน้าคลังข้อสอบ) — กันเด้งทุกครั้งที่รีเฟรช
    var snoozeUntil = parseInt(localStorage.getItem('mdkku_sid_snooze_until') || '0', 10);
    if (snoozeUntil && Date.now() < snoozeUntil) return;
    Swal.fire({
        title: 'ยืนยันตัวตน',
        input: 'text',
        inputLabel: 'กรุณากรอกรหัสนักศึกษาเพื่อยืนยันตัวตน',
        inputPlaceholder: 'เช่น 65xxxxxxxx',
        inputAttributes: { inputmode: 'numeric', maxlength: '12' },
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ข้ามไปก่อน',
        allowOutsideClick: false,
        inputValidator: (value) => {
            if (!/^\d{6,12}$/.test(String(value || '').trim())) return 'รหัสนักศึกษาต้องเป็นตัวเลข 6-12 หลัก';
        },
        preConfirm: async (value) => {
            try {
                const res = await window.sendWithRetry({ action: 'saveStudentId', sessionToken: window.EDIT_SESSION.sessionToken, studentId: String(value).trim() });
                if (res.result !== 'success') { Swal.showValidationMessage(res.message || 'บันทึกไม่สำเร็จ'); return false; }
                return res.studentId;
            } catch (e) { Swal.showValidationMessage('เชื่อมต่อระบบไม่สำเร็จ'); return false; }
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            window.EDIT_SESSION.studentId = result.value;
            localStorage.removeItem('mdkku_sid_snooze_until');
            if (window.EDIT_SESSION.role === 'Student') { window.enableStudentModeUI(); } else { window.enableEditModeUI(); }
            Swal.fire({ icon: 'success', title: 'ยืนยันตัวตนสำเร็จ', timer: 1500, showConfirmButton: false });
        } else {
            localStorage.setItem('mdkku_sid_snooze_until', String(Date.now() + 86400000)); // ข้าม → พัก 24 ชม.
        }
    });
};

window.setupGoogleSSO = function () {
    // แยก try/catch: ถ้า GIS init พัง(สคริปต์ Google โหลดไม่ทัน) ต้องไม่บล็อกการกู้ session จาก token ที่ยังใช้ได้
    try {
        google.accounts.id.initialize({
            client_id: window.GOOGLE_CLIENT_ID,
            callback: window.handleCredentialResponse,
            use_fedcm_for_prompt: false
        });
    } catch (err) {
        console.warn("Failed to initialize Google SSO:", err);
    }

    try {
        const savedToken = localStorage.getItem("mdkku_session_token");
        if (savedToken) {
            window.resumeSessionFromToken(savedToken);
        }
    } catch (err) {
        console.warn("Failed to resume session from token:", err);
    }
};

window.handleCredentialResponse = async function (response) {
    const idToken = response.credential;
    if (!idToken) return;

    Swal.fire({
        title: "กำลังตรวจสอบบัญชี...",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const res = await window.sendWithRetry({ action: "checkGoogleAuth", idToken: idToken });

        if (res.result === "success") {
            if (!res.sessionToken) {
                Swal.fire("ข้อผิดพลาด", "ไม่ได้รับ session token จากระบบ กรุณาลองใหม่", "error");
                return;
            }
            // ตรวจการสลับบัญชีบนเครื่องเดียวกัน — IndexedDB ความคืบหน้าใช้คีย์ร่วม ไม่แยกตามผู้ใช้
            // ถ้าเปลี่ยนคน ต้องทิ้งคิวอัปโหลดของคนเก่า + บังคับเทียบกับคลาวด์ของบัญชีใหม่ (ไม่ให้ local ของคนเก่าชนะเงียบๆ)
            var prevUserEmail = '';
            try { prevUserEmail = localStorage.getItem('mdkku_last_user_email') || ''; } catch (e) { }
            var accountSwitched = !!prevUserEmail && prevUserEmail !== res.user.email;
            if (accountSwitched) {
                window._progressPending = null;
                console.log('[sync] Account switched', prevUserEmail, '→', res.user.email, '— clearing local pending, prioritizing cloud');
            }
            try { localStorage.setItem('mdkku_last_user_email', res.user.email); } catch (e) { }
            window.EDIT_SESSION = {
                isLoggedIn: true,
                email: res.user.email,
                displayName: res.user.displayName,
                fullName: res.user.fullName,
                studentId: res.user.studentId,
                sessionToken: res.sessionToken,
                role: res.user.role
            };
            localStorage.setItem("mdkku_session_token", res.sessionToken);
            sessionStorage.removeItem("mdkku_edit_session");
            $('#login-benefit-hint').hide();  // ซ่อน hint — ล็อกอินแล้ว (ไม่ persist dismiss, ให้โชว์อีกถ้า logout)
            if (window._loginHintTimer) { clearTimeout(window._loginHintTimer); window._loginHintTimer = null; }
            const isStudent = res.user.role === 'Student';
            if (isStudent) {
                window.enableStudentModeUI();
            } else {
                window.enableEditModeUI();
            }
            window.updateLoginGatedFeaturesUI();
            Swal.fire({
                icon: "success",
                title: isStudent ? "เข้าสู่ระบบแล้ว — ซิงค์ความคืบหน้าเปิดใช้งาน" : "เข้าสู่ระบบแก้ไขข้อสอบแล้ว",
                text: `ยินดีต้อนรับคุณ ${res.user.displayName}`,
                timer: 2000,
                showConfirmButton: false
            });
            if (typeof window.onSyncSessionReady === 'function') window.onSyncSessionReady();
            // Pull cloud progress after login — user may have progress from another device
            if (isStudent && typeof window.checkAndPromptRestoreProgress === 'function') {
                var sp = new URLSearchParams(window.location.search).get('subject') || '';
                window.checkAndPromptRestoreProgress('session_state_' + (sp || 'default'), accountSwitched);
            }
            // ขอรหัสนักศึกษาหลังป้ายต้อนรับปิด (กันซ้อน Swal) ถ้ายังไม่เคยยืนยัน
            setTimeout(window.promptStudentIdIfNeeded, 2200);
        } else {
            Swal.fire("สิทธิ์ไม่ถูกต้อง", res.message || "บัญชีนี้ไม่มีสิทธิ์การแก้ไขระบบ", "error");
        }
    } catch (err) {
        console.error("Auth check error:", err);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถตรวจสอบบัญชีกับทางระบบหลังบ้านได้", "error");
    }
};

window.logoutEditMode = function () {
    const tokenToDelete = window.EDIT_SESSION.sessionToken;
    // จำอีเมลคนล่าสุด + เคลียร์คิวอัปโหลดที่ค้าง กันไปโผล่อัปใต้ token ของคนที่ล็อกอินต่อ
    try { if (window.EDIT_SESSION.email) localStorage.setItem('mdkku_last_user_email', window.EDIT_SESSION.email); } catch (e) { }
    window._progressPending = null;
    localStorage.removeItem("mdkku_session_token");
    sessionStorage.removeItem("mdkku_edit_session");
    window.EDIT_SESSION = {
        isLoggedIn: false,
        email: '',
        displayName: '',
        fullName: '',
        studentId: '',
        sessionToken: '',
        role: ''
    };
    $("body").removeClass("edit-mode-active");
    $("#edit-mode-badge").hide();
    $("#btn-edit-current-q").fadeOut(200);
    $("#toggle-edit-mode-btn")
        .css({ "background": "#1e293b", "border": "1px solid #475569" })
        .html('<img src="https://www.kku.ac.th/wp-content/uploads/2021/07/KKU-Logo-PNG.png" alt="KKU Logo" style="width: 24px; height: 24px; object-fit: contain;">');
    if (tokenToDelete) {
        window.sendWithRetry({ action: 'deleteSession', sessionToken: tokenToDelete }).catch(() => {});
    }
    window.updateLoginGatedFeaturesUI();
    try { google.accounts.id.disableAutoSelect(); } catch (e) { }
    Swal.fire({
        icon: "success",
        title: "ออกจากระบบแล้ว",
        timer: 1500,
        showConfirmButton: false
    });
};

window.initiateGoogleLogin = function () {
    if (window.EDIT_SESSION.isLoggedIn) {
        if (!window.EDIT_SESSION.sessionToken) {
            window.logoutEditModeSilent();
            window.showGoogleSignInModal('Session หมดอายุการใช้งาน');
        } else {
            Swal.fire({
                title: window.EDIT_SESSION.role === 'Student' ? "คุณเข้าสู่ระบบแล้ว (ซิงค์ความคืบหน้าเปิดอยู่)" : "คุณอยู่ในระบบแก้ไขแล้ว",
                text: `ล็อกอินในชื่อ: ${window.EDIT_SESSION.displayName}`,
                icon: "info",
                showCancelButton: true,
                confirmButtonText: "ออกจากระบบ (Logout)",
                cancelButtonText: "ปิดหน้าต่าง"
            }).then((result) => {
                if (result.isConfirmed) window.logoutEditMode();
            });
        }
        return;
    }
    window.showGoogleSignInModal();
};

window.enableEditModeUI = function () {
    $("body").addClass("edit-mode-active");
    // รีเซ็ต HTML ป้าย (อาจถูก enableStudentModeUI เขียนทับไว้ในหน้าเดียวกัน)
    $("#edit-mode-badge > span").html(
        '<i class="fas fa-edit" style="color: #38bdf8;"></i> EDIT MODE ACTIVE <span style="color: #475569;">|</span> ' +
        '<span id="edit-mode-username" style="font-weight: 600; color: #f1f5f9;"></span>'
    );
    $("#edit-mode-badge").css("display", "flex");
    const nameDisplay = window.EDIT_SESSION.fullName || window.EDIT_SESSION.displayName || window.EDIT_SESSION.email;
    const infoText = window.EDIT_SESSION.studentId
        ? `${nameDisplay} (รหัสนักศึกษา: ${window.EDIT_SESSION.studentId})`
        : nameDisplay;
    $("#edit-mode-username").text(infoText);
    $("#btn-edit-current-q").fadeIn(200);
    $("#toggle-edit-mode-btn").css("background", "#16a34a").html('<i class="fas fa-check-circle"></i>');
};

// โหมดนักศึกษา (role=Student): ไม่มีสิทธิ์แก้ไข — แสดงแค่สถานะล็อกอิน + ซิงค์ความคืบหน้า
window.enableStudentModeUI = function () {
    // ห้ามใส่ class edit-mode-active (เป็นตัวเปิด UI แก้ไขทั้งหมด)
    const nameDisplay = window.EDIT_SESSION.displayName || window.EDIT_SESSION.email;
    $("#edit-mode-badge > span").html(
        '<i class="fas fa-cloud" style="color: #38bdf8;"></i> ซิงค์ความคืบหน้า: เปิดใช้งาน <span style="color: #475569;">|</span> ' +
        '<span id="edit-mode-username" style="font-weight: 600; color: #f1f5f9;"></span> ' +
        '<button onclick="window.showSyncHelpModal()" title="วิธีใช้การซิงค์ข้ามอุปกรณ์" ' +
        'style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 1rem; padding: 0 4px;">' +
        '<i class="fas fa-circle-question"></i></button>'
    );
    $("#edit-mode-username").text(nameDisplay);
    $("#edit-mode-badge").css("display", "flex");
    $("#toggle-edit-mode-btn").css("background", "#0369a1").html('<i class="fas fa-cloud"></i>');
};

$(function () {
    setTimeout(window.setupGoogleSSO, 1200);
    // Login benefit hint — แสดงครั้งแรกจนกด ×, ล็อกอินสำเร็จ, หรือครบ 8 วิ
    try { if (!localStorage.getItem('mdkku_session_token') && !localStorage.getItem('login_benefit_dismissed_v1')) { $('#login-benefit-hint').css('display', 'flex'); window._loginHintTimer = setTimeout(function () { $('#login-benefit-hint').fadeOut(400); }, 8000); } } catch (e) { }
});
$(document).on('click', '#login-benefit-hint-close', function () {
    $('#login-benefit-hint').hide();
    if (window._loginHintTimer) { clearTimeout(window._loginHintTimer); window._loginHintTimer = null; }
    try { localStorage.setItem('login_benefit_dismissed_v1', '1'); } catch (e) { }
});
