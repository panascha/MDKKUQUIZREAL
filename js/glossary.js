// REFACTOR/js/glossary.js — Glossary tap-translate

window.normalizeGlossaryKey = function (s) {
    s = (s == null ? "" : String(s)).toLowerCase().trim();
    s = s.replace(/^[^a-z0-9฀-๿]+/, "").replace(/[^a-z0-9฀-๿]+$/, "");
    return s.replace(/\s+/g, " ");
};

// เพิ่ม/อัปเดต term เข้า map (คีย์ทั้ง en และ th ที่ normalize แล้ว) + array; bump version ให้ cluster memo rebuild
window._glossaryInsertTerm = function (term) {
    if (!term) return;
    window.APP.glossaryTerms = window.APP.glossaryTerms || [];
    window.APP.glossaryMap = window.APP.glossaryMap || {};
    var kEn = window.normalizeGlossaryKey(term.term_en);
    var kTh = window.normalizeGlossaryKey(term.term_th);
    var existing = (kEn && window.APP.glossaryMap[kEn]) || (kTh && window.APP.glossaryMap[kTh]) || null;
    if (existing) {
        // ลบคีย์เก่าของ object เดิมก่อน (en/th อาจเปลี่ยน) — กัน map ชี้ object ที่หลุดจาก array แล้ว
        var oldEn = window.normalizeGlossaryKey(existing.term_en);
        var oldTh = window.normalizeGlossaryKey(existing.term_th);
        if (oldEn && window.APP.glossaryMap[oldEn] === existing) delete window.APP.glossaryMap[oldEn];
        if (oldTh && window.APP.glossaryMap[oldTh] === existing) delete window.APP.glossaryMap[oldTh];
        var idx = window.APP.glossaryTerms.indexOf(existing);
        if (idx >= 0) window.APP.glossaryTerms[idx] = term; else window.APP.glossaryTerms.push(term);
    } else {
        window.APP.glossaryTerms.push(term);
    }
    if (kEn) window.APP.glossaryMap[kEn] = term; // ข้ามคีย์ว่าง (ไม่ให้ map[""])
    if (kTh) window.APP.glossaryMap[kTh] = term;
    window.APP._glossaryTermsVersion = (window.APP._glossaryTermsVersion || 0) + 1;
};

// §2.4: โหลด glossary ของวิชา (ครั้งเดียวต่อวิชา) — mirror loadKB แต่ ***อ่าน res.terms*** (ไม่ใช่ res.chunks)
window.loadGlossary = async function (subject) {
    if (window.APP._glossaryLoading) return;
    window.APP._glossaryLoading = true;
    window.APP._glossaryLastAttempt = Date.now(); // throttle retry จาก showQuestion hook
    try {
        var res = await window.fetchGAS(function () {
            return window.APPSCRIPT_URL + '?action=getGlossary' +
                (subject ? '&subject=' + encodeURIComponent(subject) : '') + '&_=' + Date.now();
        });
        if (!res || res.result !== 'success' || !Array.isArray(res.terms)) throw new Error('bad response');
        window.APP.glossaryTerms = [];
        window.APP.glossaryMap = {};
        window.APP._glossaryTermsVersion = 0;
        res.terms.forEach(function (t) { window._glossaryInsertTerm(t); });
        window.APP._glossaryLoaded = true;   // ตั้งเฉพาะตอนสำเร็จ — ล้มเหลวแล้วค่อย retry ได้ (Playwright: inject synthetic หลัง _glossaryLoaded===true)
        window.APP._glossaryLoadFailed = false;
    } catch (e) {
        console.warn('[Glossary] load failed:', e && e.message);
        window.APP.glossaryTerms = window.APP.glossaryTerms || [];
        window.APP.glossaryMap = window.APP.glossaryMap || {};
        window.APP._glossaryLoadFailed = true;
    } finally {
        window.APP._glossaryLoading = false;
    }
    if ($('#glossary-panel').is(':visible')) { window.renderGlossaryList(); }
};

// ค้นหา term จากคำ (normalize ก่อน) — คืน object หรือ null
window.glossaryLookup = function (word) {
    var k = window.normalizeGlossaryKey(word);
    if (!k) return null;
    return (window.APP.glossaryMap && window.APP.glossaryMap[k]) || null;
};

// จัดตำแหน่ง element ลอย (chip/popup) ให้อยู่ใกล้ selection และไม่ล้นจอ (display ถูกตั้งโดย caller ก่อนเรียก)
window._positionGlossaryFloat = function ($el, anchorRect) {
    var el = $el && $el[0];
    if (!el) return;
    var prevVis = el.style.visibility;
    el.style.visibility = 'hidden'; // วัดขนาดโดยไม่กระพริบ
    var w = el.offsetWidth, h = el.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var left, top;
    if (anchorRect) {
        left = anchorRect.left;
        top = anchorRect.bottom + 8;                       // ใต้ selection
        if (top + h > vh - pad) top = anchorRect.top - h - 8; // ไม่พอด้านล่าง → ขึ้นด้านบน
    } else {
        left = (vw - w) / 2; top = (vh - h) / 2;           // ไม่มี anchor → กลางจอ
    }
    if (left + w > vw - pad) left = vw - w - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = prevVis || 'visible';
};

window.hideGlossaryPopup = function () { $('#glossary-popup').hide(); };
window.hideGlossaryChip = function () { $('#glossary-translate-chip').hide(); };

// §2.5: ตัวเรนเดอร์ popup เดียว — ใช้ทั้ง hit / miss / panel / cluster. สร้างจาก OBJECT เท่านั้น
window.renderGlossaryPopup = function (term, anchorRect) {
    if (!term) return;
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var badge = (term.status === 'auto')
        ? '<span style="display:inline-block;font-size:0.68rem;background:#fff3cd;color:#856404;' +
          'padding:1px 6px;border-radius:6px;margin-left:6px;">AI สร้าง</span>'
        : '';
    // qid chips — เฉพาะข้อที่อยู่ในชุดปัจจุบัน (map qid→index); reuse .rag-cite-chip handler (jump) + ปิด popup
    var qids = (term.source_questionIds || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
    var cur = window.APP.currentQuestions || [];
    var chips = qids.filter(function (qid) {
        return cur.some(function (q) { return String(q.questionId) === String(qid); });
    }).map(function (qid) {
        return '<button type="button" class="rag-cite-chip glossary-qid-chip btn-xs" data-qid="' +
            esc(qid) + '" style="font-size:0.72rem;margin:2px;">#' + esc(qid) + '</button>';
    }).join(' ');
    var rootHtml = term.root_breakdown
        ? '<div style="font-size:0.85rem;color:var(--color-text-muted);margin-top:6px;">' +
          '<i class="fas fa-sitemap"></i> ' + esc(term.root_breakdown) + '</div>' : '';
    var defHtml = term.short_def_th
        ? '<div style="font-size:0.92rem;margin-top:6px;">' + esc(term.short_def_th) + '</div>' : '';
    var chipsHtml = chips
        ? '<div style="margin-top:8px;font-size:0.72rem;color:var(--color-text-muted);">ปรากฏในข้อ: ' + chips + '</div>' : '';
    var html =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
          '<div style="font-weight:800;color:var(--color-primary);font-size:1.05rem;">' + esc(term.term_en) + badge + '</div>' +
          '<button type="button" class="glossary-popup-close" title="ปิด" ' +
          'style="border:none;background:none;color:var(--color-text-muted);font-size:1.25rem;line-height:1;cursor:pointer;padding:0 2px;">&times;</button>' +
        '</div>' +
        '<div style="font-size:0.98rem;font-weight:600;margin-top:2px;">' + esc(term.term_th) + '</div>' +
        rootHtml + defHtml + chipsHtml;
    var $p = $('#glossary-popup');
    $p.html(html).css('display', 'block');
    window._positionGlossaryFloat($p, anchorRect);
    if (typeof window.renderAllMath === 'function') setTimeout(window.renderAllMath, 30);
};

// §2.5: อ่าน selection ในเขตโจทย์/ตัวเลือก/เฉลย → ***จับ pending ที่ตอน SHOW*** (คลิกชิปทีหลัง selection อาจหายแล้ว)
window._glossaryScopeSel = '#question, #choices, #quiz-explain-container';
window._glossaryHandleSelection = function () {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { window.hideGlossaryChip(); return; }
    var text = sel.toString().trim();
    if (!text) { window.hideGlossaryChip(); return; }
    if (text.split(/\s+/).filter(Boolean).length > 4) { window.hideGlossaryChip(); return; } // ≤ ~4 คำ (ไทยไม่มีช่องว่าง = 1)
    if (text.length > 60) { window.hideGlossaryChip(); return; } // กันลากทั้งย่อหน้าไทย (ไม่มีช่องว่าง → นับคำไม่ได้)
    var node = sel.anchorNode;
    var el = node && (node.nodeType === 3 ? node.parentElement : node);
    var container = el && el.closest ? el.closest(window._glossaryScopeSel) : null;
    if (!container) { window.hideGlossaryChip(); return; } // นอกเขต → ไม่ทำอะไร
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { window.hideGlossaryChip(); return; }
    var sentence = (container.innerText || container.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    window.APP._glossaryPending = {
        word: text, sentence: sentence,
        rect: { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right }
    };
    $('#glossary-translate-chip').css('display', 'inline-flex').html('<i class="fas fa-language"></i> แปล');
    window._positionGlossaryFloat($('#glossary-translate-chip'), window.APP._glossaryPending.rect);
};

// §2.5: hit → popup ทันที (0 token); miss → POST askGlossaryTerm → insert map → popup. dedup in-flight ต่อ normalized key
window.resolveGlossaryTerm = async function (pending) {
    if (!pending) return;
    var rect = pending.rect;
    var key = window.normalizeGlossaryKey(pending.word);
    if (!key) { window.hideGlossaryChip(); return; }
    var hit = window.glossaryLookup(pending.word);
    if (hit) { window.hideGlossaryChip(); window.renderGlossaryPopup(hit, rect); return; } // hit path — zero network
    window.APP._glossaryInflight = window.APP._glossaryInflight || {};
    if (window.APP._glossaryInflight[key]) return;                                          // กันยิงซ้ำคำเดียวกันพร้อมกัน
    window.APP._glossaryInflight[key] = true;
    $('#glossary-translate-chip').css('display', 'inline-flex').html('<i class="fas fa-spinner fa-spin"></i> กำลังแปล...');
    var subject = new URLSearchParams(location.search).get('subject') || ''; // *** ไม่มี window.APP.currentSubject ในโค้ดฐานนี้ ***
    var token = (window.EDIT_SESSION && window.EDIT_SESSION.sessionToken) || undefined;     // optional — public endpoint
    var qid = (window.APP.current_question && window.APP.current_question.questionId) || '';
    var payload = { action: 'askGlossaryTerm', word: pending.word, sentence: pending.sentence, subject: subject, questionId: qid };
    if (token) payload.sessionToken = token;
    try {
        var res = await window.sendWithRetry(payload);
        if (res && res.result === 'success' && res.term) {
            window._glossaryInsertTerm(res.term);
            // alias คีย์ของคำที่เลือก (อาจไม่ตรง canonical en/th) → tap ซ้ำ = 0 network
            if (!window.APP.glossaryMap[key]) window.APP.glossaryMap[key] = res.term;
            window.hideGlossaryChip();
            window.renderGlossaryPopup(res.term, rect);
            if ($('#glossary-panel').is(':visible')) { window.renderGlossaryList(); window.renderGlossaryClusters(); }
        } else {
            window.hideGlossaryChip();
            if (window.bgToast) window.bgToast.fire({ icon: 'warning', title: (res && res.message) || 'ไม่สามารถแปลคำนี้ได้' });
        }
    } catch (e) {
        window.hideGlossaryChip();
        if (window.bgToast) window.bgToast.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่' });
    } finally {
        delete window.APP._glossaryInflight[key];
    }
};

// §2.4: เปิด/ปิด panel — โหลด glossary ครั้งแรกที่เปิด (เผื่อยังไม่ถูก lazy-load จาก showQuestion)
window.toggleGlossaryPanel = function () {
    var $p = $('#glossary-panel');
    $p.slideToggle(200, function () {
        if ($p.is(':visible')) {
            var subject = new URLSearchParams(location.search).get('subject') || '';
            if (!window.APP._glossaryLoaded && !window.APP._glossaryLoading) window.loadGlossary(subject);
            window.renderGlossaryList();
        }
    });
};

// §2.4: วาดรายการศัพท์แบบ flat + กรองด้วยช่องค้นหา (substring บน normalized en/th)
window.renderGlossaryList = function () {
    var $c = $('#glossary-list-container');
    if (!$c.length) return;
    var terms = window.APP.glossaryTerms || [];
    if (!terms.length) {
        $c.html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">' +
            (window.APP._glossaryLoaded ? 'ยังไม่มีศัพท์ในวิชานี้ — ลองแตะคำในโจทย์เพื่อเพิ่มศัพท์'
                : (window.APP._glossaryLoadFailed ? 'โหลดไม่สำเร็จ — ปิดแล้วเปิดคลังศัพท์ใหม่เพื่อลองอีกครั้ง' : 'กำลังโหลด...')) + '</div>');
        return;
    }
    var q = window.normalizeGlossaryKey(($('#glossary-search').val() || '').trim());
    var filtered = q ? terms.filter(function (t) {
        return window.normalizeGlossaryKey(t.term_en).indexOf(q) >= 0 ||
               window.normalizeGlossaryKey(t.term_th).indexOf(q) >= 0;
    }) : terms.slice();
    filtered.sort(function (a, b) { return String(a.term_en || '').localeCompare(String(b.term_en || '')); });
    if (!filtered.length) { $c.html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">ไม่พบศัพท์ที่ค้นหา</div>'); return; }
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    $c.html(filtered.map(function (t) {
        var badge = (t.status === 'auto') ? ' <span style="font-size:0.62rem;background:#fff3cd;color:#856404;padding:0 5px;border-radius:5px;">AI</span>' : '';
        var gkey = window.normalizeGlossaryKey(t.term_en) || window.normalizeGlossaryKey(t.term_th);
        return '<div class="glossary-row" data-gkey="' + esc(gkey) + '" ' +
            'style="padding:7px 9px;border-radius:7px;cursor:pointer;border:1px solid var(--color-border-soft);margin-bottom:5px;background:var(--color-surface);">' +
            '<span style="font-weight:700;color:var(--color-primary);">' + esc(t.term_en) + '</span>' + badge +
            ' <span style="color:var(--color-text-muted);">— ' + esc(t.term_th) + '</span></div>';
    }).join(''));
};

// §2.6: ดึงความหมายไทยของ morpheme จาก root_breakdown เช่น "hepato- (ตับ) + -megaly (โต)" → "hepato-" → "ตับ"
window._extractMorphemeGloss = function (morpheme, breakdown) {
    if (!morpheme || !breakdown) return '';
    var esc = morpheme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp(esc + '\\s*\\(([^)]*)\\)').exec(breakdown);
    return (m && m[1]) ? m[1].trim() : '';
};

// §2.6: สร้าง cluster index จาก root_parts (many-to-many) — MEMOIZE บน version ของ glossaryTerms (rebuild เมื่อ mutate เท่านั้น)
window.buildGlossaryClusters = function () {
    var ver = window.APP._glossaryTermsVersion || 0;
    if (window.APP._glossaryClusters && window.APP._glossaryClustersVersion === ver) return window.APP._glossaryClusters;
    window.APP._glossaryClustersBuildCount = (window.APP._glossaryClustersBuildCount || 0) + 1; // พิสูจน์ memoization ใน test
    var terms = window.APP.glossaryTerms || [];
    var buckets = {}; // morphemeKey -> { morpheme, gloss, terms:[] }
    var noRoot = [];
    terms.forEach(function (t) {
        var morphs = (t.root_parts || '').split('///').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!morphs.length) { noRoot.push(t); return; }
        var seen = {}; // dedup morpheme ต่อ term (กัน prefix==suffix → term โผล่ 2 ครั้งใน bucket เดียว)
        morphs.forEach(function (m) {
            var mk = m.toLowerCase();
            if (seen[mk]) return; seen[mk] = true;
            if (!buckets[mk]) buckets[mk] = { morpheme: m, gloss: window._extractMorphemeGloss(m, t.root_breakdown), terms: [] };
            else if (!buckets[mk].gloss) buckets[mk].gloss = window._extractMorphemeGloss(m, t.root_breakdown);
            buckets[mk].terms.push(t);
        });
    });
    var arr = Object.keys(buckets).map(function (k) { return buckets[k]; });
    arr.forEach(function (b) { b.terms.sort(function (a, c) { return String(a.term_en || '').localeCompare(String(c.term_en || '')); }); });
    arr.sort(function (a, b) { return b.terms.length - a.terms.length; }); // cluster ใหญ่ก่อน
    window.APP._glossaryClusters = { clusters: arr, noRoot: noRoot };
    window.APP._glossaryClustersVersion = ver;
    return window.APP._glossaryClusters;
};

// §2.6: วาด grid ดัชนีรากศัพท์ (แต่ละ cell reuse popup renderer เดียวกัน)
window.renderGlossaryClusters = function () {
    var $c = $('#glossary-cluster-container');
    if (!$c.length) return;
    var terms = window.APP.glossaryTerms || [];
    if (!terms.length) {
        $c.html('<div style="color:var(--color-text-muted);font-style:italic;font-size:0.9rem;">' +
            (window.APP._glossaryLoaded ? 'ยังไม่มีศัพท์ในวิชานี้'
                : (window.APP._glossaryLoadFailed ? 'โหลดไม่สำเร็จ — ปิดแล้วเปิดคลังศัพท์ใหม่เพื่อลองอีกครั้ง' : 'กำลังโหลด...')) + '</div>');
        return;
    }
    var data = window.buildGlossaryClusters();
    var esc = function (s) { return $('<div>').text(s == null ? '' : String(s)).html(); };
    var cellsFor = function (list) {
        return list.map(function (t) {
            var badge = (t.status === 'auto') ? ' <span style="font-size:0.6rem;background:#fff3cd;color:#856404;padding:0 4px;border-radius:4px;">AI</span>' : '';
            var gkey = window.normalizeGlossaryKey(t.term_en) || window.normalizeGlossaryKey(t.term_th);
            return '<button type="button" class="glossary-cluster-cell" data-gkey="' + esc(gkey) + '" ' +
                'style="font-size:0.78rem;margin:3px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border-soft);background:var(--color-surface);cursor:pointer;">' +
                esc(t.term_en) + badge + '</button>';
        }).join('');
    };
    var html = data.clusters.map(function (b) {
        var glossTxt = b.gloss ? ' <span style="color:var(--color-text-muted);font-weight:400;">(' + esc(b.gloss) + ')</span>' : '';
        return '<div style="margin-bottom:12px;">' +
            '<div style="font-weight:800;color:var(--color-primary);font-size:0.95rem;margin-bottom:4px;">' +
            esc(b.morpheme) + glossTxt +
            ' <span style="color:var(--color-text-muted);font-weight:400;font-size:0.8rem;">×' + b.terms.length + '</span></div>' +
            '<div>' + cellsFor(b.terms) + '</div></div>';
    }).join('');
    if (data.noRoot.length) {
        html += '<div style="margin-bottom:12px;">' +
            '<div style="font-weight:800;color:var(--color-text-muted);font-size:0.95rem;margin-bottom:4px;">อื่นๆ</div>' +
            '<div>' + cellsFor(data.noRoot) + '</div></div>';
    }
    $c.html(html || '<div style="color:var(--color-text-muted);font-style:italic;">ไม่มีข้อมูลรากศัพท์</div>');
};

/* ---- Delegated handlers (bind ONCE ที่ document — ห้าม bind ใน render ไม่งั้นซ้อนกันยิงหลายครั้ง) ---- */

// selection ในเขต → โชว์ชิป (ยิง LLM เฉพาะตอนคลิกชิป). ข้าม target ที่เป็นชิปเอง (กัน re-trigger ทับ spinner)
$(document).on('mouseup touchend', function (e) {
    if (e.target && e.target.closest && e.target.closest('#glossary-translate-chip')) return;
    setTimeout(window._glossaryHandleSelection, 10); // ให้ selection settle ก่อนอ่าน (โดยเฉพาะ touchend)
});

// mousedown บนชิป: กัน selection หาย + กัน bubble ไปโดน outside-hide ด้านล่าง
$(document).on('mousedown', '#glossary-translate-chip', function (e) { e.preventDefault(); e.stopPropagation(); });

// คลิกชิป "แปล" → resolve จาก pending ที่จับไว้ตอน show (ไม่อ่าน selection ใหม่ตอนนี้ — มันอาจ collapse ไปแล้ว)
$(document).on('click', '#glossary-translate-chip', function (e) {
    e.preventDefault();
    if (window.APP._glossaryPending) window.resolveGlossaryTerm(window.APP._glossaryPending);
});

// คลิกนอก popup/ชิป → ปิดทั้งคู่ (ชิปมี stopPropagation จึงไม่โดนเอง)
$(document).on('mousedown', function (e) {
    if (!$(e.target).closest('#glossary-popup, #glossary-translate-chip').length) {
        window.hideGlossaryPopup();
        window.hideGlossaryChip();
    }
});

$(document).on('click', '.glossary-popup-close', function () { window.hideGlossaryPopup(); });
// qid chip: .rag-cite-chip handler (quiz.js:1325) ทำหน้าที่ jump; ตัวนี้แค่ปิด popup ตามหลัง
$(document).on('click', '.glossary-qid-chip', function () { window.hideGlossaryPopup(); });

// สลับแท็บรายการ/ดัชนีรากศัพท์
$(document).on('click', '.glossary-tab-btn', function () {
    var tab = this.dataset.gtab;
    $('.glossary-tab-btn').removeClass('active');
    $(this).addClass('active');
    if (tab === 'cluster') {
        $('#glossary-tab-list').hide();
        $('#glossary-tab-cluster').show();
        window.renderGlossaryClusters();
    } else {
        $('#glossary-tab-cluster').hide();
        $('#glossary-tab-list').show();
        window.renderGlossaryList();
    }
});

$(document).on('input', '#glossary-search', function () { window.renderGlossaryList(); });

// คลิกแถวรายการ/เซลล์ในดัชนี → เปิด popup เดียวกัน (anchor ที่ element ที่คลิก)
$(document).on('click', '.glossary-row, .glossary-cluster-cell', function () {
    var term = window.APP.glossaryMap && window.APP.glossaryMap[this.dataset.gkey];
    if (!term) return;
    var r = this.getBoundingClientRect();
    window.renderGlossaryPopup(term, { left: r.left, top: r.top, bottom: r.bottom, right: r.right });
});

// Onboarding hint (English, dismissible) — โชว์จนกด × แล้วจำใน localStorage; display:flex เพราะ CSS จัด layout ด้วย flex
window.initGlossaryTapHint = function () {
    try { if (localStorage.getItem('glossary_tip_dismissed_v1')) return; } catch (e) { }
    $('#glossary-tap-hint').css('display', 'flex');
};
$(document).on('click', '#glossary-tap-hint-close', function () {
    $('#glossary-tap-hint').hide();
    try { localStorage.setItem('glossary_tip_dismissed_v1', '1'); } catch (e) { }
});
$(function () { window.initGlossaryTapHint(); });

// เปลี่ยนข้อ → ปิด popup/ชิปที่ค้าง (chips อ้าง currentQuestions ของข้อเดิม)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') return;
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        window.hideGlossaryPopup();
        window.hideGlossaryChip();
        // preload glossary ครั้งเดียวต่อวิชา — hit-path (0 network) ต้องมี map ก่อนผู้ใช้แตะคำ; throttle 60s กันยิงรัวตอน backend ล่ม
        if (!window.APP._glossaryLoaded && !window.APP._glossaryLoading &&
            (!window.APP._glossaryLastAttempt || Date.now() - window.APP._glossaryLastAttempt > 60000)) {
            window.loadGlossary(new URLSearchParams(location.search).get('subject') || '');
        }
    };
})();
