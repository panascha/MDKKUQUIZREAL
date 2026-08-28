// reviews-donations.js — รีวิววิชา (อ่านสาธารณะ + นักศึกษาเขียน) + บริจาคแบบแนบสลิป
// backend: reviews.gs / donations.gs; router-doGet.gs (getReviews GET), router-doPost.gs (submitReview/submitDonation)
// ★ XSS: ข้อความจากผู้ใช้ (reviewText/displayName/yearLabel) เรนเดอร์ด้วย textContent/createElement เท่านั้น — ห้าม innerHTML
// ★ getReviews: อย่าแนบ clientVer (router-doGet.gs:70 — จะโดน NOT_MODIFIED ของ version หลัก)

// ───────────────────────── helpers ─────────────────────────
window._rdReviewsCache = {}; // subjectId -> {avgRating,totalReviews,reviews[]}

window.rdStars = function (n) {
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};

// ชื่อผู้รีวิวที่จะแสดง — คีย์จาก isAnonymous ไม่ใช่ชื่อว่าง (seed มีทั้ง anon+มีชื่อ และ ไม่ anon)
window.rdReviewerName = function (r) {
    return (r.isAnonymous || !String(r.displayName || '').trim()) ? 'นิรนาม' : String(r.displayName).trim();
};

// คำนวณ year label ฝั่ง client (พอร์ตจาก reviews.gs::computeStudentYearAtReview_) — ใช้ preview เท่านั้น, server เป็นตัวจริง
window.rdComputeYearLabel = function (studentId) {
    var sid = String(studentId || '').trim();
    if (!/^\d{2}/.test(sid)) return '';
    var now = new Date(Date.now() + 7 * 3600 * 1000); // UTC+7 (ไทยไม่มี DST)
    var academicYearBE = now.getUTCFullYear() + 543 - (now.getUTCMonth() >= 5 ? 0 : 1); // ตัดปีการศึกษาที่ มิ.ย.
    var entryYearBE = 2500 + parseInt(sid.slice(0, 2), 10);
    var yl = academicYearBE - entryYearBE + 1;
    if (isNaN(yl)) return '';
    if (yl > 6) return 'ศิษย์เก่า';
    if (yl >= 1) return 'ปี ' + yl;
    return '';
};

// ───────────────────────── REVIEWS: fetch ─────────────────────────
window.fetchReviews = async function (subjectId, force) {
    var sid = String(subjectId || '').trim().toUpperCase();
    if (!sid) return null;
    if (!force && window._rdReviewsCache[sid]) return window._rdReviewsCache[sid];
    var url = window.APPSCRIPT_URL + '?action=getReviews&subject=' + encodeURIComponent(sid);
    try {
        var data = await window.fetchGAS(function () { return url; });
        if (data && data.result === 'success') { window._rdReviewsCache[sid] = data; return data; }
    } catch (e) {
        console.warn('[reviews] fetch failed', e);
    }
    return null;
};

// ───────────────────────── REVIEWS: badge บนตัวเลือกวิชา ─────────────────────────
window.renderSubjectReviewBadge = async function (subjectId) {
    var bar = document.getElementById('subject-review-bar');
    if (!bar) return;
    var sid = String(subjectId || '').trim();
    var badge = document.getElementById('subject-review-badge');
    if (!sid) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    if (badge) badge.textContent = 'กำลังโหลดรีวิว…';

    var data = await window.fetchReviews(sid);
    badge = document.getElementById('subject-review-badge');
    if (!badge) return;
    // การ์ดยังใช้อยู่ (สลับวิชาระหว่างโหลด) → เช็คว่ายังตรงวิชาปัจจุบัน
    if (String($('#subject-select').val() || '').trim() !== sid) return;
    if (!data || data.totalReviews < 3 || data.avgRating == null) {
        badge.textContent = data && data.totalReviews ? ('★ ใหม่ (' + data.totalReviews + ')') : '★ ใหม่';
    } else {
        badge.textContent = '★ ' + Number(data.avgRating).toFixed(1) + ' (' + data.totalReviews + ')';
    }
};

// ───────────────────────── REVIEWS: drawer ─────────────────────────
window._rdDrawerSubject = '';
window._rdDrawerSort = 'latest';

window.openReviewsDrawer = async function () {
    var sid = String($('#subject-select').val() || '').trim();
    if (!sid) { window.bgToast.fire({ icon: 'info', title: 'กรุณาเลือกวิชาก่อนดูรีวิว' }); return; }
    window._rdDrawerSubject = sid;
    window._rdDrawerSort = 'latest';
    window.rdUpdateSortButtons();
    $('#reviews-drawer').fadeIn(150);
    await window.renderReviewsDrawer(true);
};

window.rdUpdateSortButtons = function () {
    $('#reviews-sort-latest').toggleClass('btn-dark', window._rdDrawerSort === 'latest').toggleClass('btn-light', window._rdDrawerSort !== 'latest');
    $('#reviews-sort-rating').toggleClass('btn-dark', window._rdDrawerSort === 'rating').toggleClass('btn-light', window._rdDrawerSort !== 'rating');
};

window.renderReviewsDrawer = async function (force) {
    var sid = window._rdDrawerSubject;
    var list = document.getElementById('reviews-drawer-list');
    var summary = document.getElementById('reviews-drawer-summary');
    if (!list) return;
    list.innerHTML = '<div class="loading-spinner"></div>';
    if (summary) summary.textContent = '';

    var data = await window.fetchReviews(sid, force);
    var reviews = (data && data.reviews) ? data.reviews.slice() : [];

    // สรุป: ค่าเฉลี่ย + จำนวน + แจกแจงดาว (นับจาก reviews[] ที่ดึงมาแล้ว — ไม่ยิง backend ซ้ำ)
    if (summary) {
        summary.innerHTML = '';
        var avgLine = document.createElement('div');
        avgLine.style.cssText = 'font-size:1.15rem; font-weight:700; margin-bottom:6px; color:var(--color-text);';
        if (!data || data.totalReviews < 3 || data.avgRating == null) {
            avgLine.textContent = data && data.totalReviews
                ? ('★ ใหม่ — รีวิว ' + data.totalReviews + ' รายการ (ต้องมี ≥ 3 จึงแสดงค่าเฉลี่ย)')
                : 'ยังไม่มีรีวิวสำหรับวิชานี้';
        } else {
            avgLine.textContent = '★ ' + Number(data.avgRating).toFixed(1) + ' / 5  ·  ' + data.totalReviews + ' รีวิว';
        }
        summary.appendChild(avgLine);

        if (reviews.length) {
            var buckets = [0, 0, 0, 0, 0]; // index 0=1ดาว .. 4=5ดาว
            reviews.forEach(function (r) {
                var v = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
                buckets[v - 1]++;
            });
            for (var s = 5; s >= 1; s--) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--color-text-muted); margin:2px 0;';
                var lbl = document.createElement('span');
                lbl.style.cssText = 'width:34px; text-align:right;';
                lbl.textContent = s + '★';
                var track = document.createElement('span');
                track.style.cssText = 'flex:1; height:8px; background:var(--color-surface-2); border-radius:4px; overflow:hidden;';
                var fill = document.createElement('span');
                var pct = reviews.length ? Math.round((buckets[s - 1] / reviews.length) * 100) : 0;
                fill.style.cssText = 'display:block; height:100%; width:' + pct + '%; background:#F59E0B;';
                track.appendChild(fill);
                var cnt = document.createElement('span');
                cnt.style.cssText = 'width:28px;';
                cnt.textContent = String(buckets[s - 1]);
                row.appendChild(lbl); row.appendChild(track); row.appendChild(cnt);
                summary.appendChild(row);
            }
        }
    }

    // เรียง
    if (window._rdDrawerSort === 'rating') {
        reviews.sort(function (a, b) { return (b.rating - a.rating) || (new Date(b.timestamp) - new Date(a.timestamp)); });
    } else {
        reviews.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    }

    list.innerHTML = '';
    if (!reviews.length) {
        var empty = document.createElement('p');
        empty.className = 'small-text';
        empty.style.cssText = 'text-align:center; color:var(--color-text-muted); padding:16px 0;';
        empty.textContent = 'ยังไม่มีรีวิว เป็นคนแรกที่รีวิววิชานี้สิ!';
        list.appendChild(empty);
        return;
    }
    reviews.forEach(function (r) { list.appendChild(window.rdBuildReviewCard(r)); });
};

// สร้างการ์ดรีวิว — user string ทุกตัวผ่าน textContent (XSS gate)
window.rdBuildReviewCard = function (r) {
    var card = document.createElement('div');
    card.style.cssText = 'border:1px solid var(--color-border); border-radius:10px; padding:10px 12px; margin:8px 0; background:var(--color-surface); text-align:left;';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;';

    var stars = document.createElement('span');
    stars.style.cssText = 'color:#F59E0B; font-size:1rem; letter-spacing:1px;';
    stars.textContent = window.rdStars(r.rating);
    head.appendChild(stars);

    var name = document.createElement('span');
    name.style.cssText = 'font-weight:700; font-size:0.9rem; color:var(--color-text);';
    name.textContent = window.rdReviewerName(r);
    head.appendChild(name);

    if (r.yearLabel) {
        var year = document.createElement('span');
        year.style.cssText = 'font-size:0.75rem; padding:1px 7px; border-radius:10px; background:var(--color-surface-2); color:var(--color-text-muted);';
        year.textContent = '[' + r.yearLabel + ']';
        head.appendChild(year);
    }

    var when = document.createElement('span');
    when.style.cssText = 'font-size:0.72rem; color:var(--color-text-muted); margin-left:auto;';
    try { when.textContent = new Date(r.timestamp).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { when.textContent = ''; }
    head.appendChild(when);

    card.appendChild(head);

    if (String(r.reviewText || '').trim()) {
        var txt = document.createElement('p');
        txt.style.cssText = 'margin:0; font-size:0.9rem; color:var(--color-text); white-space:pre-wrap; word-break:break-word;';
        txt.textContent = r.reviewText;
        card.appendChild(txt);
    }
    return card;
};

// ───────────────────────── REVIEWS: เขียนรีวิว ─────────────────────────
window._rdSelectedStar = 0;

window.rdSetStar = function (n) {
    window._rdSelectedStar = n;
    for (var i = 1; i <= 5; i++) {
        var el = document.getElementById('review-star-' + i);
        if (el) { el.textContent = i <= n ? '★' : '☆'; el.style.color = i <= n ? '#F59E0B' : 'var(--color-text-muted)'; }
    }
};

window.rdToggleReviewNameField = function () {
    var anon = document.getElementById('review-anon-toggle');
    var wrap = document.getElementById('review-name-wrap');
    if (wrap) wrap.style.display = (anon && anon.checked) ? 'none' : 'block';
};

window.openWriteReviewModal = function () {
    if (!window.EDIT_SESSION || !window.EDIT_SESSION.isLoggedIn) {
        Swal.fire({
            icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน',
            text: 'กรุณาเข้าสู่ระบบด้วยบัญชี KKU เพื่อเขียนรีวิว (รีวิวได้ 1 ครั้งต่อวิชา แก้ไขได้)',
            showCancelButton: true, confirmButtonText: 'เข้าสู่ระบบ', cancelButtonText: 'ยกเลิก'
        }).then(function (res) {
            if (res.isConfirmed && typeof window.initiateGoogleLogin === 'function') window.initiateGoogleLogin();
        });
        return;
    }

    // เติม dropdown วิชา จาก APP.allSubjectsList (มีอยู่แล้วหลัง populateSubjectSelector)
    var $sel = $('#review-subject-select');
    $sel.empty().append('<option value="">-- เลือกวิชา --</option>');
    var subjects = (window.APP && window.APP.allSubjectsList) || [];
    subjects.forEach(function (s) {
        var yl = s.year ? ('[ปี ' + s.year + '] ') : '';
        $sel.append($('<option></option>').attr('value', s.id).text(yl + s.id + ' - ' + s.name));
    });
    var cur = String($('#subject-select').val() || '').trim();
    if (cur) $sel.val(cur);

    window.rdSetStar(0);
    document.getElementById('review-text-input').value = '';
    document.getElementById('review-anon-toggle').checked = false;
    document.getElementById('review-name-input').value = '';
    window.rdToggleReviewNameField();

    // preview year badge จาก session (server เป็นตัวจริง)
    var yearPrev = document.getElementById('review-year-preview');
    if (yearPrev) {
        var yl = window.rdComputeYearLabel(window.EDIT_SESSION.studentId);
        yearPrev.textContent = yl ? ('ป้ายชั้นปีที่จะแสดง: [' + yl + ']') : 'ระบบจะแสดงชั้นปีให้อัตโนมัติเมื่อมีข้อมูลรหัสนักศึกษา';
    }
    $('#submit-review-modal').fadeIn(150);
};

window.submitCourseReview = async function () {
    var subjectId = String($('#review-subject-select').val() || '').trim();
    var rating = window._rdSelectedStar || 0;
    var text = document.getElementById('review-text-input').value.trim();
    var isAnon = document.getElementById('review-anon-toggle').checked;

    if (!subjectId) { Swal.fire({ icon: 'warning', title: 'กรุณาเลือกวิชา', confirmButtonText: 'ตกลง' }); return; }
    if (!(rating >= 1 && rating <= 5)) { Swal.fire({ icon: 'warning', title: 'กรุณาให้คะแนน 1-5 ดาว', confirmButtonText: 'ตกลง' }); return; }

    var payload = {
        action: 'submitReview',
        sessionToken: (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) || '',
        subjectId: subjectId,
        rating: rating,
        reviewText: text,
        isAnonymous: isAnon,
        displayName: isAnon ? '' : (document.getElementById('review-name-input').value || '').trim(), // anon → ไม่ส่งชื่อ (server เก็บ nickname ทั้งสองกรณี)
        clientId: window.getFeedbackClientId()
    };

    var btn = document.getElementById('review-submit-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังส่ง...';
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success') {
            $('#submit-review-modal').fadeOut(150);
            delete window._rdReviewsCache[subjectId.toUpperCase()]; // invalidate → badge/drawer ดึงใหม่
            window.bgToast.fire({ icon: 'success', title: res.updated ? 'อัปเดตรีวิวแล้ว ขอบคุณครับ 💖' : 'ส่งรีวิวแล้ว ขอบคุณครับ 💖' });
            if (String($('#subject-select').val() || '').trim() === subjectId) window.renderSubjectReviewBadge(subjectId);
            if ($('#reviews-drawer').is(':visible') && window._rdDrawerSubject === subjectId) window.renderReviewsDrawer(true);
        } else {
            Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: (res && res.message) || 'กรุณาลองใหม่ภายหลัง', confirmButtonText: 'ตกลง' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่ภายหลัง', confirmButtonText: 'ตกลง' });
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งรีวิว';
    }
};

// ───────────────────────── DONATIONS: แนบสลิป ─────────────────────────
window._donateSlipImage = null;

window._donateReadSlip = function (file) {
    if (!file || file.type.indexOf('image/') !== 0) return;
    var reader = new FileReader();
    reader.onload = function (ev) { window.addDonateSlip(ev.target.result); };
    reader.readAsDataURL(file);
};

// สลิป = ภาพข้อความ (เลข Ref เล็ก) → compress เบาๆ 1600px/q0.9 ไม่งั้น OCR อ่าน transRef ไม่ออก server reject
window.addDonateSlip = async function (base64) {
    var compressed = await window.compressImage(base64, 1600, 1600, 0.9);
    if (compressed.length > 8 * 1024 * 1024) { // ตรงกับ guard donations.gs:89
        window.bgToast.fire({ icon: 'warning', title: 'รูปสลิปใหญ่เกินไป กรุณาถ่าย/ครอปให้เล็กลง' });
        return;
    }
    window._donateSlipImage = compressed;
    window.renderDonateSlipPreview();
};

window.removeDonateSlip = function () {
    window._donateSlipImage = null;
    window.renderDonateSlipPreview();
};

window.renderDonateSlipPreview = function () {
    var wrap = document.getElementById('donate-slip-preview');
    if (!wrap) return;
    if (!window._donateSlipImage) { wrap.innerHTML = ''; return; }
    wrap.innerHTML =
        '<div style="position:relative; display:inline-block; margin-top:8px;">' +
        '<img src="' + window._donateSlipImage + '" alt="สลิปที่แนบ" style="max-width:180px; max-height:220px; border-radius:8px; border:1px solid var(--color-border);">' +
        '<button type="button" onclick="window.removeDonateSlip()" title="ลบสลิป" style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%; border:none; background:#DC2626; color:#fff; cursor:pointer; font-size:0.85rem; line-height:1;">&times;</button>' +
        '</div>';
};

window.submitDonation = async function () {
    if (!window._donateSlipImage) { Swal.fire({ icon: 'warning', title: 'กรุณาแนบรูปสลิปโอนเงิน', confirmButtonText: 'ตกลง' }); return; }
    var isAnon = document.getElementById('donate-anon-toggle').checked;
    var payload = {
        action: 'submitDonation',
        slipImage: window._donateSlipImage,
        donorName: isAnon ? '' : (document.getElementById('donate-donor-name').value || '').trim(),
        isAnonymous: isAnon,
        message: (document.getElementById('donate-message').value || '').trim(),
        clientId: window.getFeedbackClientId(),
        sessionToken: (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) || ''
    };

    var btn = document.getElementById('submit-donation-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบสลิป...';
    try {
        var res = await window.sendWithRetry(payload);
        // dedup false-fail: retry ฝั่ง network หลัง GAS บันทึกแล้ว → attempt 2 เจอ transRef ซ้ำ ตอบ error "บันทึกไว้แล้ว" ทั้งที่สำเร็จ → ถือว่าสำเร็จ
        var dupOk = res && res.result === 'error' && /บันทึกไว้แล้ว/.test(res.message || '');
        if ((res && res.result === 'success') || dupOk) {
            $('#donate-modal-card').fadeOut(150);
            window._donateSlipImage = null;
            window.renderDonateSlipPreview();
            document.getElementById('donate-donor-name').value = '';
            document.getElementById('donate-message').value = '';
            document.getElementById('donate-anon-toggle').checked = false;
            Swal.fire({ icon: 'success', title: 'ขอบคุณสำหรับการสนับสนุน 🙏', text: 'ระบบบันทึกสลิปเรียบร้อยแล้ว', confirmButtonText: 'ตกลง' });
        } else {
            Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: (res && res.message) || 'กรุณาลองใหม่ภายหลัง', confirmButtonText: 'ตกลง' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่ภายหลัง', confirmButtonText: 'ตกลง' });
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> ส่งสลิปยืนยันการโอน';
    }
};

// ───────────────────────── wiring ─────────────────────────
$(document).ready(function () {
    // review badge bar buttons
    $('#open-reviews-drawer-btn').on('click', window.openReviewsDrawer);
    $('#open-write-review-btn').on('click', window.openWriteReviewModal);

    // reviews drawer
    $('#close-reviews-drawer').on('click', function () { $('#reviews-drawer').fadeOut(150); });
    $('#reviews-sort-latest').on('click', function () { window._rdDrawerSort = 'latest'; window.rdUpdateSortButtons(); window.renderReviewsDrawer(false); });
    $('#reviews-sort-rating').on('click', function () { window._rdDrawerSort = 'rating'; window.rdUpdateSortButtons(); window.renderReviewsDrawer(false); });
    $('#reviews-drawer-write-btn').on('click', window.openWriteReviewModal);

    // write review modal
    for (var i = 1; i <= 5; i++) {
        (function (n) { $('#review-star-' + n).on('click', function () { window.rdSetStar(n); }); })(i);
    }
    $('#review-anon-toggle').on('change', window.rdToggleReviewNameField);
    $('#review-submit-btn').on('click', window.submitCourseReview);
    $('#close-review-modal').on('click', function () { $('#submit-review-modal').fadeOut(150); });

    // donation slip
    $('#donate-slip-dropzone').on('click', function () { $('#donate-slip-input').trigger('click'); });
    $('#donate-slip-input').on('change', function () {
        if (this.files && this.files[0]) window._donateReadSlip(this.files[0]);
        this.value = '';
    });
    $('#donate-slip-dropzone')
        .on('dragover', function (e) { e.preventDefault(); $(this).css('border-color', '#F59E0B'); })
        .on('dragleave drop', function (e) { e.preventDefault(); $(this).css('border-color', ''); });
    $('#donate-slip-dropzone').on('drop', function (e) {
        var dt = e.originalEvent.dataTransfer;
        if (dt && dt.files && dt.files[0]) window._donateReadSlip(dt.files[0]);
    });
    $('#donate-anon-toggle').on('change', function () {
        $('#donate-name-wrap').css('display', this.checked ? 'none' : 'block');
    });
    $('#submit-donation-btn').on('click', window.submitDonation);

    // วางสลิปจาก clipboard ขณะ donate modal เปิด
    document.addEventListener('paste', function (e) {
        if (!$('#donate-modal-card').is(':visible')) return;
        var items = (e.clipboardData || {}).items || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) {
                window._donateReadSlip(items[i].getAsFile());
                e.preventDefault();
                break;
            }
        }
    });

    // สลับวิชา → refresh badge (initApp เติม #subject-select แบบ async หลัง ready แล้ว)
    $(document).on('change', '#subject-select', function () {
        window.renderSubjectReviewBadge($(this).val());
    });
});
