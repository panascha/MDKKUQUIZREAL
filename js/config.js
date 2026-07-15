// REFACTOR/js/config.js

// 1. ตั้งค่าการเชื่อมต่อ Server API และตั้งค่าพื้นฐาน
window.APPSCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwqv5BXxGOvTKO1DJoahJSTgn74_lPnRq_opqrUndXhJC3TAt7PHv6B_PbMvxzrAAIl/exec';

window.zoomStep = 10;
window.maxZoom = 200;
window.minZoom = 30;

// 2. ระบบช่วยจัดการ URL (ย้ายมาโหลดอันดับแรกสุดเพื่อความปลอดภัยทางสถาปัตยกรรม)
window.transformUrl = function (url) {
    if (!url) return "";
    if (url.toLowerCase().includes("require_img")) return "";
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    if (url.includes('/preview') || url.toLowerCase().includes('.pdf')) return url;

    const match = url.match(/\/d\/(.*?)\//) || url.match(/id=([^&]+)/) || url.match(/\/file\/d\/([^\/\?]+)/);
    // ใช้รูปแบบ Direct Link ผ่าน lh3.googleusercontent.com ที่เสถียรที่สุด โดยไม่ต้องระบุ ?authuser ป้องกันสิทธิ์ขัดข้องและลดอัตราการชน 429 Rate Limit
    return (match && match[1]) ? `https://lh3.googleusercontent.com/d/${match[1]}=w1000` : url;
};

window.parseExplain = function (explainRaw) {
    if (!explainRaw) return { text: "", media: [] };
    const parts = explainRaw.split('///').map(s => s.trim());
    return {
        text: parts[0] || "",
        media: parts.slice(1).filter(Boolean)
    };
};

window.serializeExplain = function (text, mediaArray) {
    const cleanText = (text || "").trim();
    const cleanMedia = (mediaArray || []).filter(s => s && s.trim() !== "");
    if (cleanMedia.length === 0) return cleanText;
    return [cleanText, ...cleanMedia].join('///');
};

window.getMediaType = function (url) {
    if (!url) return 'unknown';
    if (url.includes('/preview') || url.toLowerCase().includes('.pdf')) return 'pdf';
    if (url.startsWith('<svg')) return 'svg';
    return 'image';
};

window.isUrl = function (s) {
    return s && (typeof s === 'string') && (s.includes('drive.google.com'));
};

// 3. ระบบพิกัดและขนาดกระดาษคำตอบ OMR
window.OMR_CONFIG = {
    a4Width: 210,
    a4Height: 297,
    margin: 15,
    bubbleRadius: 2.2,
    bubbleSpacingX: 6,
    rowHeight: 7.5,
    colWidth: 45,
    maxCols: 4,
    fiducialSize: 5,
    fiducialMargin: 5
};

// 4. ตัวแจ้งเตือนด่วน SweetAlert2 Toast
window.bgToast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});

// 5. ระบบเรนเดอร์สัญลักษณ์ทางคณิตศาสตร์ (LaTeX via KaTeX)
window.renderAllMath = function () {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.body, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });
    }
};

// 5.1 ระบบบีบอัดและปรับสัดส่วนรูปภาพด้วย Canvas (Client-side Image Compressor)
window.compressImage = function (base64Str, maxWidth = 800, maxHeight = 800, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = function () {
            let width = img.width;
            let height = img.height;

            // คำนวณอัตราส่วนเพื่อคงสัดส่วนของรูปภาพเดิม
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // บีบอัดไฟล์ภาพเพื่อจำกัดภาระการส่งข้อมูลขึ้นระบบ
            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedBase64);
        };
        img.onerror = function () {
            resolve(base64Str); // เกิดข้อผิดพลาดส่งค่าดั้งเดิมกลับไปป้องกัน UI ค้าง
        };
    });
};

// 6. กำหนดโครงสร้างเริ่มต้นของ Global State
window.APP = {
    globalStructure: { subjects: [], category: [] },
    allQuestions: [],
    currentQuestions: [],
    current_question: {},
    score: 0,
    questionIndex: 0,
    isRandomized: true,
    isShowingAllAnswers: false,
    isReviewMode: false,
    isFastMode: false,
    filterMode: "category",
    pendingVotesCache: {},
    pendingReportsCache: {},
    sessionAutoVoteCount: 0,
    votedQuestionIds: new Set(),
    modalTargetQuestion: null,
    termColors: {},
    colorIndex: 0,
    currentImageArray: [],
    currentImageIndex: 0,
    preloadedImages: {},
    answerKeyMap: [],
    allSubjectsList: [],
    meqMode: false
};

// 7. โหมด MEQ (Hidden Choices + Free-Recall) — persist ต่างจากค่าอื่นใน APP ที่เก็บผ่าน IndexedDB session state
try {
    window.APP.meqMode = localStorage.getItem('mdkku_meq_mode') === '1';
} catch (e) { }

// 8. ค่าคงที่ระบบข้อสอบคล้ายกัน (Similar Questions — js/similar.js)
window.SIMILAR_MIN_SHARED = 3;        // panel: ต้องมี token ร่วมกันอย่างน้อยกี่คำถึงนับว่า "คล้าย"
window.SIMILAR_MIN_OVERLAP = 0.35;    // panel: และ shared / min(|A|,|B|) >= 0.35 — กันข้อยาวๆ match กันเองด้วยคำทั่วไป
                                      // (วัดจากข้อมูลจริง 2026-07-15: GI 1903 ข้อ ไม่มี overlap filter median=78 ข้อ/คำถาม, ที่ 0.35 → median=1, p90=7)
window.SIMILAR_STOPWORD_RATIO = 0.2;  // token ที่โผล่ใน >20% ของข้อสอบวิชานั้น = stopword ไม่นับ
window.CLUSTER_OVERLAP = 0.5;         // report: edge เมื่อ shared / min(|A|,|B|) >= 0.5 (overlap coefficient)