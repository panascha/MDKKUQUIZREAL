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

// โหลด changelog.js ของเวอร์ชันใหม่ทับตัวเก่าในหน้า — ตอน controllerchange หน้านี้ยังถือไฟล์เก่า
// ที่ไม่มี entry ของเวอร์ชันใหม่ (SW ใหม่ cache ไฟล์ใหม่ไว้แล้วตอน install, ignoreSearch ทำให้ ?v= ไม่พลาด cache)
window.reloadChangelogScript = function (newVersion) {
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'js/changelog.js?v=' + encodeURIComponent(newVersion || Date.now());
        const timer = setTimeout(resolve, 3000); // กันค้าง — โหลดไม่ได้ก็ใช้ CHANGELOG เดิม/fallback
        s.onload = () => { clearTimeout(timer); resolve(); };
        s.onerror = () => { clearTimeout(timer); resolve(); };
        document.head.appendChild(s);
    });
};

// สร้าง HTML รายการ new/fixed ของ entry เดียวจาก CHANGELOG — คืน '' ถ้าไม่มีรายการเลย
window.buildChangelogNotesHtml = function (entry) {
    if (!entry) return '';
    const section = (items, icon, title) => {
        if (!items || !items.length) return '';
        return '<div style="margin-top:0.5rem;"><b>' + icon + ' ' + title + '</b><ul style="text-align:left;margin:0.25rem 0 0;padding-left:1.5rem;">'
            + items.map((t) => '<li>' + t + '</li>').join('') + '</ul></div>';
    };
    return section(entry.new, '✨', 'ของใหม่') + section(entry.fixed, '🔧', 'แก้ไข');
};

// เปิด modal ประวัติการอัปเดต — วาดทุก entry จาก CHANGELOG (ใหม่สุดอยู่บน)
window.openReleaseHistoryModal = function () {
    const list = document.getElementById('release-history-list');
    if (!list) return;
    const entries = window.CHANGELOG || [];
    if (!entries.length) {
        list.innerHTML = '<p class="small-text">ยังไม่มีบันทึกการอัปเดต</p>';
    } else {
        list.innerHTML = entries.map((e) => {
            const section = (items, icon, title) => {
                if (!items || !items.length) return '';
                return '<b>' + icon + ' ' + title + '</b><ul>' + items.map((t) => '<li>' + t + '</li>').join('') + '</ul>';
            };
            return '<div class="release-entry">'
                + '<div class="release-entry-header"><span class="release-entry-version">' + e.version + '</span>'
                + '<span class="release-entry-date">' + (e.date || '') + '</span></div>'
                + section(e.new, '✨', 'ของใหม่') + section(e.fixed, '🔧', 'แก้ไข')
                + '</div>';
        }).join('');
    }
    if (window.jQuery) $('#release-history-modal').fadeIn(250);
    else document.getElementById('release-history-modal').style.display = 'block';
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
        const doReload = () => {
            window._swRefreshing = true;
            // ธง one-shot: หลัง reload จากการอัปเดตเวอร์ชัน ให้กู้คืนชุดข้อสอบอัตโนมัติโดยไม่ถาม
            try { sessionStorage.setItem('mdkku_resume_after_update', '1'); } catch (e) { }
            location.reload();
        };
        if (window.Swal) {
            // ดึง changelog ใหม่ก่อน — ไฟล์ในหน้านี้เป็นของเวอร์ชันเก่า ไม่มี entry ใหม่
            await window.reloadChangelogScript(newVersion);
            // หา entry ใน CHANGELOG ที่ตรงกับเวอร์ชันใหม่ — ไม่เจอ (internal-only bump) ใช้ข้อความ fallback
            const entry = (window.CHANGELOG || []).find((e) => e.version === newVersion);
            const notesHtml = window.buildChangelogNotesHtml(entry)
                || '<div style="margin-top:0.5rem;color:var(--color-text-muted,#78716c);">การปรับปรุงภายในเล็กน้อย</div>';
            Swal.fire({
                icon: 'success',
                title: 'พบเวอร์ชันใหม่' + (newVersion ? ' (' + newVersion + ')' : ''),
                html: notesHtml
                    + '<div style="margin-top:0.75rem;font-size:0.9rem;">กดอัปเดตเพื่อโหลดหน้าใหม่ (ข้อมูลการทำข้อสอบถูกบันทึกไว้แล้ว)</div>',
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
    // ป้ายเวอร์ชันเปิดประวัติการอัปเดต (ตรวจสอบอัปเดตใช้ปุ่ม #btn-check-update แทน)
    const label = document.getElementById('app-version-label');
    if (label) label.addEventListener('click', () => window.openReleaseHistoryModal());
    const closeHistory = document.getElementById('close-release-history-modal');
    if (closeHistory) closeHistory.addEventListener('click', () => {
        if (window.jQuery) $('#release-history-modal').fadeOut(250);
        else document.getElementById('release-history-modal').style.display = 'none';
    });
};
