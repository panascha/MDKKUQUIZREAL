// version.js — แสดงเวอร์ชันแอป + ตรวจสอบ/รับอัปเดตด้วยคลิกเดียว
// Source of truth เดียวคือ CACHE_NAME ใน service-worker.js (ถามผ่าน MessageChannel)

// กันหน้า reload ซ้ำซ้อนเมื่อ controllerchange ยิงหลายครั้ง
window._swRefreshing = false;
// จำไว้ว่าตอนเปิดหน้ามี SW คุมอยู่แล้วหรือไม่ — กัน prompt ตอนติดตั้ง SW ครั้งแรก
window._swHadController = false;

// ถามเวอร์ชันจาก SW ที่คุมหน้านี้อยู่ — คืน string เช่น 'v18' หรือ null ถ้าไม่มี SW (เช่นเปิดผ่าน file://)
window.getAppVersion = function () {
    return new Promise((resolve) => {
        const controller = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (!controller) return resolve(null);

        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), 2000); // กันค้างถ้า SW ไม่ตอบ
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            const raw = (event.data && event.data.version) || '';
            resolve(raw ? raw.replace('mdkkuquiz-', '') : null);
        };
        controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
};

// อัปเดตป้ายเวอร์ชันใน footer และปุ่มตรวจสอบอัปเดต
window.renderVersionBadge = async function () {
    const version = await window.getAppVersion();
    const label = document.getElementById('app-version-label');
    if (label) label.textContent = 'เวอร์ชัน: ' + (version || '-');
    const btnText = document.getElementById('btn-check-update-text');
    if (btnText && version) btnText.textContent = 'ตรวจสอบอัปเดต (' + version + ')';
};

// ตรวจสอบอัปเดตกับ server — manual=true คือผู้ใช้กดเอง (มี feedback ทุกกรณี)
window.checkForUpdate = async function (manual) {
    if (!('serviceWorker' in navigator)) {
        if (manual && window.Swal) Swal.fire({ icon: 'info', title: 'เบราว์เซอร์ไม่รองรับระบบอัปเดตอัตโนมัติ' });
        return;
    }
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            // register ไม่สำเร็จ (เช่น origin ไม่ปลอดภัย) — กดเองต้องมี feedback เสมอ
            if (manual && window.Swal) Swal.fire({ icon: 'info', title: 'ระบบอัปเดตยังไม่พร้อม', text: 'ลองรีเฟรชหน้าอีกครั้ง' });
            return;
        }
        await reg.update();

        if (reg.installing || reg.waiting) {
            // เจอเวอร์ชันใหม่ — SW ใหม่จะ skipWaiting + claim เอง แล้ว controllerchange จะเด้ง prompt ให้ reload
            if (manual && window.Swal) {
                Swal.fire({
                    icon: 'info',
                    title: 'พบเวอร์ชันใหม่ กำลังติดตั้ง...',
                    timer: 2500,
                    showConfirmButton: false
                });
            }
        } else if (manual) {
            const version = await window.getAppVersion();
            if (window.Swal) {
                Swal.fire({
                    icon: 'success',
                    title: 'คุณใช้เวอร์ชันล่าสุดแล้ว' + (version ? ' (' + version + ')' : ''),
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        }
    } catch (err) {
        // update() ล้มเหลวได้ตอน offline — ไม่ต้องรบกวนผู้ใช้ถ้าเป็น auto check
        if (manual && window.Swal) {
            Swal.fire({ icon: 'warning', title: 'ตรวจสอบอัปเดตไม่สำเร็จ', text: 'ลองใหม่เมื่อมีอินเทอร์เน็ต' });
        }
    }
};

// เรียกครั้งเดียวหลัง register SW — ผูก listener + วาดป้ายเวอร์ชัน + ผูกปุ่ม
window.initVersionUpdater = function () {
    if (!('serviceWorker' in navigator)) return;

    window._swHadController = !!navigator.serviceWorker.controller;

    // SW ใหม่เข้าคุมหน้า (หลัง skipWaiting+claim) → ชวนผู้ใช้ reload รับของใหม่
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
        if (window._swRefreshing) return;
        if (!window._swHadController) {
            // ติดตั้ง SW ครั้งแรกของเครื่องนี้ — ไม่ใช่การอัปเดต ไม่ต้อง prompt
            window._swHadController = true;
            window.renderVersionBadge();
            return;
        }
        const newVersion = await window.getAppVersion(); // controller ตอนนี้คือตัวใหม่แล้ว
        const doReload = () => { window._swRefreshing = true; location.reload(); };
        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'พบเวอร์ชันใหม่' + (newVersion ? ' (' + newVersion + ')' : ''),
                text: 'กดอัปเดตเพื่อโหลดหน้าใหม่ (ข้อมูลการทำข้อสอบถูกบันทึกไว้แล้ว)',
                confirmButtonText: '<i class="fas fa-cloud-download-alt"></i> อัปเดตเลย',
                showCancelButton: true,
                cancelButtonText: 'ไว้ทีหลัง'
            }).then((res) => { if (res.isConfirmed) doReload(); });
        } else if (confirm('พบเวอร์ชันใหม่ กดตกลงเพื่ออัปเดต')) {
            doReload();
        }
    });

    // วาดป้ายเวอร์ชันเมื่อ SW พร้อม
    navigator.serviceWorker.ready.then(() => window.renderVersionBadge());

    // ผูกปุ่ม + ป้าย ให้กดตรวจสอบอัปเดตได้
    const btn = document.getElementById('btn-check-update');
    if (btn) btn.addEventListener('click', () => window.checkForUpdate(true));
    const label = document.getElementById('app-version-label');
    if (label) label.addEventListener('click', () => window.checkForUpdate(true));
};
