// REFACTOR/js/meq.js — MEQ Mode: hidden choices + free-recall textarea before reveal
// Default OFF. Answered questions (revisit via index panel) always skip hiding.

// Session-only, in-memory, per-questionId (throwaway v1, per plan doc — not localStorage/backend).
window._meqRecallText = window._meqRecallText || {};
window._meqRevealed = window._meqRevealed || {};

window.applyMeqModeUi = function (shouldFocus) {
    var q = window.APP.current_question;
    var qid = q && q.questionId;
    var revealed = qid !== undefined && !!window._meqRevealed[qid];
    var savedText = qid !== undefined && window._meqRecallText[qid];
    // "relevant" = show the recall panel at all: normal unanswered flow, or an answered
    // question the student left a note on (read-only review — notes shouldn't vanish once submitted).
    var relevant = window.APP.meqMode && q && (!q.state || !!savedText);
    var hide = window.APP.meqMode && q && !q.state && !revealed;

    // toggleClass/toggle/show/hide are no-ops when the element is already in the target
    // state, so this is safe to run unconditionally (incl. meqMode fully OFF) and also
    // cleans up correctly if the user flips the toggle mid-question (choices stuck hidden
    // would otherwise persist, since the "OFF" case wouldn't run any cleanup).
    $('#choices').toggleClass('meq-hidden', hide);
    $('#meq-recall-panel').toggle(relevant);

    if (hide) {
        $('#meq-recall-input-wrap').show();
        $('#meq-recall-collapsed').hide();
        $('#meq-recall-textarea').val((qid !== undefined && window._meqRecallText[qid]) || '');
        $('#submit-btn').hide();
        // choices are hidden so the original choices-focus (quiz-core.js) is a no-op — redirect focus here instead
        if (shouldFocus) $('#meq-recall-textarea').trigger('focus');
    } else if (relevant) {
        // revealed-but-unanswered, or answered-with-a-note: collapsed read-only view
        $('#meq-recall-input-wrap').hide();
        if (savedText) {
            $('#meq-recall-collapsed-text').text(savedText);
            $('#meq-recall-collapsed').show();
        } else {
            $('#meq-recall-collapsed').hide();
        }
        if (!window.APP.isShowingAllAnswers) $('#submit-btn').show();
    } else if (!window.APP.isShowingAllAnswers) {
        $('#submit-btn').show();
    }
};

window.revealMeqChoices = function () {
    var q = window.APP.current_question;
    var qid = q && q.questionId;
    var typed = $('#meq-recall-textarea').val().trim();
    if (qid !== undefined) {
        window._meqRevealed[qid] = true;
        window._meqRecallText[qid] = typed;
    }
    $('#meq-recall-input-wrap').hide();
    if (typed) {
        $('#meq-recall-collapsed-text').text(typed);
        $('#meq-recall-collapsed').show();
    }
    $('#choices').removeClass('meq-hidden');
    if (!window.APP.isShowingAllAnswers) $('#submit-btn').show();
};

window.updateMeqModeButtonUI = function () {
    var $btn = $('#toggle-meq-mode-btn');
    if (window.APP.meqMode) {
        $btn.html('<i class="fas fa-brain"></i> โหมด MEQ (ตอบก่อนดูตัวเลือก): เปิด').css({
            'background-color': 'var(--color-primary)',
            'color': 'white',
            'border-color': 'var(--color-primary)'
        });
    } else {
        $btn.html('<i class="fas fa-brain"></i> โหมด MEQ (ตอบก่อนดูตัวเลือก): ปิด').css({
            'background-color': 'var(--color-surface)',
            'color': 'var(--color-text)',
            'border-color': 'var(--color-border)'
        });
    }
};

// Hook showQuestion: apply/clear hidden-choices UI on every render (decorator pattern, mirrors chatbot.js/glossary.js)
(function () {
    var _orig = window.showQuestion;
    if (typeof _orig !== 'function') {
        console.warn('[MEQ] window.showQuestion not found at hook time — hidden-choices mode will not apply');
        return;
    }
    window.showQuestion = function (shouldFocus) {
        _orig.call(this, shouldFocus);
        window.applyMeqModeUi(shouldFocus === undefined ? true : shouldFocus); // matches quiz-core.js's own shouldFocus=true default
    };
})();

$(function () {
    window.updateMeqModeButtonUI();

    $('#toggle-meq-mode-btn').on('click', function () {
        window.APP.meqMode = !window.APP.meqMode;
        try { localStorage.setItem('mdkku_meq_mode', window.APP.meqMode ? '1' : '0'); } catch (e) { }
        window.updateMeqModeButtonUI();
        window.showQuestion(false);
    });

    $('#meq-reveal-btn').on('click', function () {
        window.revealMeqChoices();
    });

    // Save typed recall text as the student types, so it survives nav-away before reveal.
    $(document).on('input', '#meq-recall-textarea', function () {
        var q = window.APP.current_question;
        if (q && q.questionId !== undefined) {
            window._meqRecallText[q.questionId] = $(this).val();
        }
    });

    // Enter (no shift) in textarea → reveal. Delegated on document: panel markup is static, never re-created, so one binding is enough — no leak to guard against.
    $(document).on('keydown', '#meq-recall-textarea', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window.revealMeqChoices();
        }
    });

    // Spacebar reveal when NOT typing in an input/textarea — desktop convenience only, mobile always uses the button.
    $(document).on('keydown', function (e) {
        if (!window.APP.meqMode) return;
        if (!$('#meq-recall-input-wrap').is(':visible')) return;
        if (e.code !== 'Space' && e.key !== ' ') return;
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        e.preventDefault();
        window.revealMeqChoices();
    });
});
