// MDKKUQUIZ Service Worker
// ทำหน้าที่แค่ลงทะเบียนให้เว็บ "ติดตั้งได้" (installable)
// และ cache เฉพาะไฟล์ static ของตัวเอง
// ไม่แตะ requests ไปหา Google Apps Script (script.google.com) เด็ดขาด

const CACHE_NAME = 'mdkkuquiz-v1';
const STATIC_ASSETS = [
    './',
    'index.html',
    'css/styles.css',
    'js/config.js',
    'js/db.js',
    'js/api.js',
    'js/search.js',
    'js/quiz.js',
    'js/vote.js',
    'js/report.js',
    'js/ui.js',
    'js/auth-edit.js',
    'js/edit-modal.js',
    'js/app.js',
    'js/pdf-generator.js',
    'js/grader.js'
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

    // สำหรับไฟล์ static ของแอป: cache-first
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request);
        })
    );
});