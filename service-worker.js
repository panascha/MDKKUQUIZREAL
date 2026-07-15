// MDKKUQUIZ Service Worker
// ทำหน้าที่แค่ลงทะเบียนให้เว็บ "ติดตั้งได้" (installable)
// และ cache เฉพาะไฟล์ static ของตัวเอง
// ไม่แตะ requests ไปหา Google Apps Script (script.google.com) เด็ดขาด

const CACHE_NAME = 'mdkkuquiz-v3.3.1'; // semver — bump ทุกครั้งที่ deploy JS ใหม่; ถ้ามีของใหม่ให้เพิ่ม entry ใน js/changelog.js ด้วย
const STATIC_ASSETS = [
    './',
    'index.html',
    'css/variables.css',
    'css/base.css',
    'css/selection.css',
    'css/quiz-core.css',
    'css/modals.css',
    'css/results.css',
    'css/responsive.css',
    'css/info-banner.css',
    'css/themes.css',
    'css/edit-modal.css',
    'css/fast-mode.css',
    'css/features.css',
    'js/config.js',
    'js/changelog.js',
    'js/version.js',
    'js/db.js',
    'js/api.js',
    'js/search.js',
    'js/quiz-core.js',
    'js/quiz-render.js',
    'js/chatbot.js',
    'js/glossary.js',
    'js/meq.js',
    'js/similar.js',
    'js/vote.js',
    'js/report.js',
    'js/ui.js',
    'js/auth-edit.js',
    'js/sync.js',
    'js/edit-modal.js',
    'js/app.js',
    'js/pdf-generator.js',
    'js/grader.js',
    'js/th-sarabun-font.js'
];

// ติดตั้ง: cache ไฟล์ static
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: ล้าง cache เก่า
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Message: หน้าเว็บถาม version ปัจจุบันผ่าน MessageChannel — CACHE_NAME คือ source of truth เดียว
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

// Fetch: Network-first สำหรับ API calls, Cache-first สำหรับ static assets
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // ปล่อย requests ไปหา Google APIs / Apps Script ผ่านตรง ไม่ cache เลย
    if (
        url.includes('script.google.com') ||
        url.includes('googleapis.com') ||
        url.includes('accounts.google.com') ||
        url.includes('googletagmanager.com') ||
        url.includes('drive.google.com') ||
        url.includes('lh3.googleusercontent.com')
    ) {
        return; // ปล่อยผ่าน — browser จัดการเอง
    }

    // สำหรับไฟล์ static ของแอป: cache-first พร้อม ignoreSearch เพื่อให้รองรับ query parameters เช่น ?subject=...
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            return cached || fetch(event.request);
        }).catch(() => {
            // ป้องกันข้อยกเว้น TypeError จากการดึงข้อมูลเครือข่ายล้มเหลว
            return fetch(event.request);
        })
    );
});