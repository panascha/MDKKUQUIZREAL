// js/auth-edit.js

window.EDIT_SESSION = {
    isLoggedIn: false,
    email: '',
    displayName: '',
    fullName: '',
    studentId: '',
    idToken: '',
    role: ''
};

window.GOOGLE_CLIENT_ID = "409421225331-envq9b2dg6d2tbq2681c097j4h1qinv4.apps.googleusercontent.com"; // OAuth 2.0 Web Application Client ID

// ฟังก์ชันตรวจสอบความถูกต้องของ Google ID Token บนฝั่ง Client (lightweight Base64 JWT parser)
window.isTokenExpired = function (token) {
    if (!token) return true;
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        const exp = payload.exp;
        if (!exp) return true;
        // ลบออก 300 วินาที เพื่อเพิ่มเกราะป้องกันกรณีนาฬิกาบนอุปกรณ์ผู้ใช้เดินไม่ตรงกับเซิร์ฟเวอร์
        return (Date.now() / 1000) >= (exp - 300);
    } catch (e) {
        return true;
    }
};

// ฟังก์ชันเปิดป๊อปอัปให้ล็อกอินด้วย Google Sign-In Button แบบเสถียร (ป้องกัน One Tap Cooldown)
window.showGoogleSignInModal = function (titleText = 'เข้าสู่ระบบแก้ไขข้อสอบ') {
    Swal.fire({
        title: titleText,
        html: `
            <p style="font-size: 1.1rem; color: var(--color-text-muted); margin-bottom: 15px;">
                กรุณาลงชื่อเข้าใช้ด้วยบัญชี Google ของทางมหาวิทยาลัยขอนแก่น (@kkumail.com หรือ @kku.ac.th) เพื่อรับสิทธิ์การแก้ไขและเข้าถึงระบบ AI Assistant
            </p>
            <div id="google-signin-button-swal" style="display: flex; justify-content: center; margin: 20px 0; min-height: 44px;"></div>
            <p style="font-size: 0.9rem; color: var(--color-text-muted);">
                *ระบบจะตรวจสอบสิทธิ์แอดมิน (Whitelist) ในระบบหลังบ้านโดยอัตโนมัติ
            </p>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            const container = document.getElementById("google-signin-button-swal");
            if (container) {
                // เรนเดอร์ปุ่ม Google Sign-In อย่างเป็นทางการเพื่อ bypass cooldown ของ One Tap
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

// ฟังก์ชันตรวจสอบและอัปเดตสิทธิ์ก่อนเรียกใช้งาน API สำคัญ
window.ensureActiveSession = function () {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        window.showGoogleSignInModal('กรุณาเข้าสู่ระบบก่อนดำเนินการ');
        return false;
    }
    if (window.isTokenExpired(window.EDIT_SESSION.idToken)) {
        window.logoutEditModeSilent();
        window.showGoogleSignInModal('เซสชันแก้ไขข้อสอบหมดอายุการใช้งาน');
        return false;
    }
    return true;
};

// การออกจากระบบแบบเงียบเมื่อเซสชันหมดอายุ ป้องกัน UI ขัดแย้ง
window.logoutEditModeSilent = function () {
    window.EDIT_SESSION = {
        isLoggedIn: false,
        email: '',
        displayName: '',
        fullName: '',
        studentId: '',
        idToken: '',
        role: ''
    };
    sessionStorage.removeItem("mdkku_edit_session");
    $("body").removeClass("edit-mode-active");
    $("#edit-mode-badge").hide();
    $("#btn-edit-current-q").fadeOut(200);
    $("#toggle-edit-mode-btn")
        .css({ "background": "#1e293b", "border": "1px solid #475569" })
        .html('<img src="https://www.kku.ac.th/wp-content/uploads/2021/07/KKU-Logo-PNG.png" alt="KKU Logo" style="width: 24px; height: 24px; object-fit: contain;">');

    // สั่งปิดหน้าต่างย่อย (Modal) ทันทีหลังถูกถอดสิทธิ์ เพื่อป้องกันการทำงานต่อบนฟิลด์แบบค้างสถานะ
    if (typeof window.closeEditModal === 'function') {
        window.closeEditModal();
    }
};

// Initialize Google One Tap Globally exactly ONCE
window.setupGoogleSSO = function () {
    try {
        google.accounts.id.initialize({
            client_id: window.GOOGLE_CLIENT_ID,
            callback: window.handleCredentialResponse,
            use_fedcm_for_prompt: false // Disable FedCM to prevent Chrome-specific AbortError conflicts
        });

        // Instant UI Restoration: ตรวจสอบและสแตนบายเซสชันเดิม
        const saved = sessionStorage.getItem("mdkku_edit_session");
        if (saved) {
            const data = JSON.parse(saved);
            if (data.isLoggedIn) {
                // เพิ่มการตรวจสอบ Token ตั้งแต่โหลดหน้าเว็บ
                if (window.isTokenExpired(data.idToken)) {
                    console.log("Cached session token has already expired. Performing silent logout.");
                    window.logoutEditModeSilent();
                } else {
                    window.EDIT_SESSION = {
                        isLoggedIn: true,
                        email: data.email,
                        displayName: data.displayName,
                        fullName: data.fullName,
                        studentId: data.studentId,
                        idToken: data.idToken || '',
                        role: data.role
                    };
                    window.enableEditModeUI();

                    // เรียกพรอมต์ในพื้นหลังเพื่ออัปเดต Token ให้เป็นเวอร์ชันใหม่แบบเงียบ ๆ
                    google.accounts.id.prompt((notification) => {
                        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                            console.log("One Tap silent prompt skipped by Google. Maintaining verified session.");
                        }
                    });
                }
            }
        }
    } catch (err) {
        console.warn("Failed to initialize Google SSO:", err);
    }
};

// Callback returned by Google with the ID Token
window.handleCredentialResponse = async function (response) {
    const idToken = response.credential;
    if (!idToken) return;

    Swal.fire({
        title: "กำลังตรวจสอบสิทธิ์แก้ไข...",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const payload = {
            action: "checkGoogleAuth",
            idToken: idToken
        };

        const res = await fetch(window.APPSCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.result === "success") {
            window.EDIT_SESSION = {
                isLoggedIn: true,
                email: res.user.email,
                displayName: res.user.displayName,
                fullName: res.user.fullName,
                studentId: res.user.studentId,
                idToken: idToken,
                role: res.user.role
            };

            // บันทึกสถานะรวมถึง idToken ลงใน sessionStorage
            sessionStorage.setItem("mdkku_edit_session", JSON.stringify({
                isLoggedIn: true,
                email: res.user.email,
                displayName: res.user.displayName,
                fullName: res.user.fullName,
                studentId: res.user.studentId,
                idToken: idToken,
                role: res.user.role
            }));

            window.enableEditModeUI();

            Swal.fire({
                icon: "success",
                title: "เข้าสู่ระบบแก้ไขข้อสอบแล้ว",
                text: `ยินดีต้อนรับคุณ ${res.user.displayName}`,
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            Swal.fire("สิทธิ์ไม่ถูกต้อง", res.message || "บัญชีนี้ไม่มีสิทธิ์การแก้ไขระบบ", "error");
        }
    } catch (err) {
        console.error("Auth check error:", err);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถตรวจสอบบัญชีกับทางระบบหลังบ้านได้", "error");
    }
};

window.logoutEditMode = function () {
    window.EDIT_SESSION = {
        isLoggedIn: false,
        email: '',
        displayName: '',
        fullName: '',
        studentId: '',
        idToken: '',
        role: ''
    };
    sessionStorage.removeItem("mdkku_edit_session");
    $("body").removeClass("edit-mode-active");
    $("#edit-mode-badge").hide();
    $("#btn-edit-current-q").fadeOut(200);

    $("#toggle-edit-mode-btn")
        .css({ "background": "#1e293b", "border": "1px solid #475569" })
        .html('<img src="https://www.kku.ac.th/wp-content/uploads/2021/07/KKU-Logo-PNG.png" alt="KKU Logo" style="width: 24px; height: 24px; object-fit: contain;">');

    try {
        google.accounts.id.disableAutoSelect();
    } catch (e) { }

    Swal.fire({
        icon: "success",
        title: "ออกจากระบบแก้ไขแล้ว",
        timer: 1500,
        showConfirmButton: false
    });
};

// จัดการเมื่อกดปุ่มล็อกอินที่ FAB ขวาบน
window.initiateGoogleLogin = function () {
    if (window.EDIT_SESSION.isLoggedIn) {
        if (window.isTokenExpired(window.EDIT_SESSION.idToken)) {
            window.logoutEditModeSilent();
            window.showGoogleSignInModal('Session หมดอายุการใช้งาน');
        } else {
            Swal.fire({
                title: "คุณอยู่ในระบบแก้ไขแล้ว",
                text: `ล็อกอินในชื่อ: ${window.EDIT_SESSION.displayName}`,
                icon: "info",
                showCancelButton: true,
                confirmButtonText: "ออกจากระบบ (Logout)",
                cancelButtonText: "ปิดหน้าต่าง"
            }).then((result) => {
                if (result.isConfirmed) {
                    window.logoutEditMode();
                }
            });
        }
        return;
    }

    // หากไม่ได้เข้าสู่ระบบ ให้แสดงกล่อง Google Sign-In Button ทันที
    window.showGoogleSignInModal();
};

window.enableEditModeUI = function () {
    $("body").addClass("edit-mode-active");
    $("#edit-mode-badge").css("display", "flex");

    const nameDisplay = window.EDIT_SESSION.fullName || window.EDIT_SESSION.displayName || window.EDIT_SESSION.email;
    const infoText = window.EDIT_SESSION.studentId
        ? `${nameDisplay} (รหัสนักศึกษา: ${window.EDIT_SESSION.studentId})`
        : nameDisplay;

    $("#edit-mode-username").text(infoText);
    $("#btn-edit-current-q").fadeIn(200);
    $("#toggle-edit-mode-btn").css("background", "#16a34a").html('<i class="fas fa-check-circle"></i>');
};

$(function () {
    setTimeout(window.setupGoogleSSO, 1200);
});