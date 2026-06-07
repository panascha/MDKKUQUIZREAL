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

// Initialize Google One Tap Globally exactly ONCE
window.setupGoogleSSO = function () {
    try {
        google.accounts.id.initialize({
            client_id: window.GOOGLE_CLIENT_ID,
            callback: window.handleCredentialResponse,
            use_fedcm_for_prompt: false // Disable FedCM to prevent Chrome-specific AbortError conflicts
        });

        // Instant UI Restoration: ตรวจสอบเซสชันเก่าและกู้คืนหน้าแก้ไขทันทีเพื่อข้ามข้อจำกัด Cooldown ของกูเกิล
        const saved = sessionStorage.getItem("mdkku_edit_session");
        if (saved) {
            const data = JSON.parse(saved);
            if (data.isLoggedIn) {
                window.EDIT_SESSION = {
                    isLoggedIn: true,
                    email: data.email,
                    displayName: data.displayName,
                    fullName: data.fullName,
                    studentId: data.studentId,
                    idToken: data.idToken || '', // ดึงโทเค็นเดิมมาสแตนด์บายใช้งานทันที
                    role: data.role
                };
                window.enableEditModeUI();
            }
            // เรียกพรอมต์ในพื้นหลังเพื่ออัปเดต Token ให้เป็นเวอร์ชันใหม่แบบเงียบ ๆ
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    console.log("One Tap silent prompt skipped by Google. Maintaining cached session state.");
                }
            });
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

            // บันทึกสถานะรวมถึง idToken ลงใน sessionStorage เพื่อป้องกันการหลุดเมื่อกดรีเฟรชหน้าเว็บ
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

    // คืนค่าปุ่มแก้ไขกลับเป็นโลโก้ KKU สีสุภาพเป็นทางการ
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
// Show Google One Tap login prompt manually when edit FAB is clicked
window.initiateGoogleLogin = function () {
    if (window.EDIT_SESSION.isLoggedIn) {
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
        return;
    }

    try {
        google.accounts.id.prompt(); // Trigger One Tap prompt safely without multiple initializations
    } catch (err) {
        console.error("Google login initiation error:", err);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถเปิดระบบล็อกอินของ Google ได้ขณะนี้", "error");
    }
};

window.enableEditModeUI = function () {
    $("body").addClass("edit-mode-active");
    $("#edit-mode-badge").css("display", "flex");

    // ดึงชื่อจริง นามสกุล และรหัสนักศึกษามาแสดงผลในสไตล์ที่เป็นทางการ
    const nameDisplay = window.EDIT_SESSION.fullName || window.EDIT_SESSION.displayName || window.EDIT_SESSION.email;
    const infoText = window.EDIT_SESSION.studentId
        ? `${nameDisplay} (รหัสนักศึกษา: ${window.EDIT_SESSION.studentId})`
        : nameDisplay;

    $("#edit-mode-username").text(infoText);
    $("#btn-edit-current-q").fadeIn(200);
    $("#toggle-edit-mode-btn").css("background", "#16a34a").html('<i class="fas fa-check-circle"></i>');
};

$(function () {
    // Setup and initialize Google SSO on load
    setTimeout(window.setupGoogleSSO, 1200);
});