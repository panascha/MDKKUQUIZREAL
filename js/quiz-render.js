// REFACTOR/js/quiz-render.js — Markdown & media rendering

window.renderExplainMediaInQuiz = function (explainRaw, containerSelector) {
    const $container = $(containerSelector);
    $container.empty();
    if (!explainRaw) return;

    const parsed = window.parseExplain(explainRaw);

    // 1. Text Explanation
    if (parsed.text) {
        $container.append(`<div class="explain-text-content" style="margin-top: 10px; font-weight: 500; font-size: 1.15rem; line-height: 1.6; color: var(--color-text);">${parsed.text}</div>`);
    }

    // 2. Media container
    if (parsed.media && parsed.media.length > 0) {
        const $mediaDiv = $('<div class="explain-media-group" style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px; width: 100%;"></div>');

        let images = [];
        let pdfs = [];
        let svgs = [];

        parsed.media.forEach(url => {
            const type = window.getMediaType(url);
            if (type === 'pdf') pdfs.push(url);
            else if (type === 'svg') svgs.push(url);
            else images.push(url);
        });

        // SVG rendering
        svgs.forEach(svg => {
            $mediaDiv.append(`<div class="svg-render-area" onclick="viewFullImageSVG(this, event)" style="cursor: pointer; max-height: 200px; width: auto; background: white; border: 1px solid var(--color-border); border-radius: 8px;">${svg}</div>`);
        });

        // Images as simple list/gallery
        if (images.length > 0) {
            const $imgGallery = $('<div class="explain-image-gallery"></div>');
            images.forEach(img => {
                const transformed = window.transformUrl(img);
                $imgGallery.append(`<img src="${transformed}" class="explain-img-thumb" onclick="viewFullImage('${transformed}', event)">`);
            });
            $mediaDiv.append($imgGallery);
        }

        // PDFs as prominent buttons
        pdfs.forEach(pdf => {
            const transformed = window.transformUrl(pdf);
            $mediaDiv.append(`
                <a href="${transformed}" target="_blank" class="btn btn-outline-primary btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; font-size: 1.1rem; padding: 8px 16px; border-radius: 8px; text-decoration: none; border: 1.5px solid var(--color-primary); color: var(--color-primary); background: var(--color-primary-pale); transition: all 0.15s;">
                    <i class="fas fa-file-pdf text-danger" style="font-size: 1.4rem;"></i> 📄 เปิดดูเอกสาร PDF ประกอบคำอธิบาย
                </a>
            `);
        });

        $container.append($mediaDiv);
    }
};

/*
   =========================================
   AI Study Assistant — KKU IntelSphere Shared Pool
   (Idea/interested-using-kkuintel.md — v7: per-question only, no RAG)
   =========================================
*/

// แปลง Markdown จาก AI เป็น HTML แบบปลอดภัย (whitelist tags, ไม่มี attribute ใดๆ)
// ลำดับสำคัญ: ดึง code ออกก่อน → ดึงสูตรคณิต ($...$) → escape ทั้งหมด → parse markdown → คืน code/math กลับ
window.renderMarkdownSafe = function (mdText) {
    if (mdText == null) return '';
    var text = String(mdText).replace(/\r\n/g, '\n');

    var escapeHtml = function (s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    var codeStore = [];
    var mathStore = [];

    text = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, function (_m, code) {
        codeStore.push({ block: true, code: code.replace(/\n$/, '') });
        return '\u0000C' + (codeStore.length - 1) + '\u0000';
    });
    text = text.replace(/`([^`\n]+)`/g, function (_m, code) {
        codeStore.push({ block: false, code: code });
        return '\u0000C' + (codeStore.length - 1) + '\u0000';
    });
    // เก็บสูตรทั้ง delimiter ไว้ — KaTeX (renderAllMath) จะอ่านจาก textContent หลัง insert
    text = text.replace(/\$\$[\s\S]+?\$\$/g, function (m) {
        mathStore.push(m);
        return '\u0000M' + (mathStore.length - 1) + '\u0000';
    });
    text = text.replace(/\$[^$\n]+?\$/g, function (m) {
        mathStore.push(m);
        return '\u0000M' + (mathStore.length - 1) + '\u0000';
    });

    text = escapeHtml(text);

    var inlineMd = function (s) {
        return s
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/(^|\s)_([^_\n]+)_/g, '$1<em>$2</em>')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    };

    var lines = text.split('\n');
    var out = [];
    var para = [];
    var flushPara = function () {
        if (para.length) out.push('<p>' + inlineMd(para.join('<br>')) + '</p>');
        para = [];
    };

    var i = 0;
    while (i < lines.length) {
        var trimmed = lines[i].trim();

        if (!trimmed) { flushPara(); i++; continue; }

        // code block ที่อยู่บรรทัดเดี่ยว — วางนอก <p> กัน nesting เพี้ยน
        var soloCode = trimmed.match(/^\u0000C(\d+)\u0000$/);
        if (soloCode && codeStore[+soloCode[1]].block) { flushPara(); out.push(trimmed); i++; continue; }

        if (/^#{1,3}\s+/.test(trimmed)) {
            flushPara();
            var tag = trimmed.match(/^(#{1,3})/)[1].length >= 3 ? 'h5' : 'h4';
            out.push('<' + tag + '>' + inlineMd(trimmed.replace(/^#{1,3}\s+/, '')) + '</' + tag + '>');
            i++; continue;
        }
        if (/^---+$/.test(trimmed)) { flushPara(); out.push('<hr>'); i++; continue; }
        if (/^&gt;\s?/.test(trimmed)) {
            flushPara();
            var bq = [];
            while (i < lines.length && /^&gt;\s?/.test(lines[i].trim())) {
                bq.push(lines[i].trim().replace(/^&gt;\s?/, ''));
                i++;
            }
            out.push('<blockquote>' + inlineMd(bq.join('<br>')) + '</blockquote>');
            continue;
        }
        if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
            flushPara();
            var ordered = /^\d+[.)]\s+/.test(trimmed);
            var itemRe = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
            var items = [];
            while (i < lines.length && itemRe.test(lines[i].trim())) {
                items.push('<li>' + inlineMd(lines[i].trim().replace(itemRe, '')) + '</li>');
                i++;
            }
            out.push(ordered ? '<ol>' + items.join('') + '</ol>' : '<ul>' + items.join('') + '</ul>');
            continue;
        }
        if (/^\|.*\|$/.test(trimmed)) {
            flushPara();
            var rows = [];
            while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
                rows.push(lines[i].trim());
                i++;
            }
            var hasSep = rows.length > 1 && /^\|[\s:|-]+\|$/.test(rows[1]);
            var tableHtml = '<table>';
            rows.forEach(function (row, idx) {
                if (hasSep && idx === 1) return;
                var cellTag = (hasSep && idx === 0) ? 'th' : 'td';
                tableHtml += '<tr>' + row.slice(1, -1).split('|').map(function (c) {
                    return '<' + cellTag + '>' + inlineMd(c.trim()) + '</' + cellTag + '>';
                }).join('') + '</tr>';
            });
            out.push(tableHtml + '</table>');
            continue;
        }

        para.push(trimmed);
        i++;
    }
    flushPara();

    var html = out.join('');
    html = html.replace(/\u0000C(\d+)\u0000/g, function (_m, n) {
        var c = codeStore[+n];
        return c.block
            ? '<pre><code>' + escapeHtml(c.code) + '</code></pre>'
            : '<code>' + escapeHtml(c.code) + '</code>';
    });
    // escape entities ใน math ด้วย — textContent ใน DOM จะกลับเป็นอักขระจริงให้ KaTeX เอง
    html = html.replace(/\u0000M(\d+)\u0000/g, function (_m, n) {
        return escapeHtml(mathStore[+n]);
    });
    return html;
};

// จำแนกประเภทคำถามนิสิต (keyword heuristic ไทย/อังกฤษ) → ใช้เลือกโมเดลอัตโนมัติ
