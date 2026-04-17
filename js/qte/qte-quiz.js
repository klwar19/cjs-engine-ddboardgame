// qte-quiz.js
// "Quiz" — English C1/C2 grammar multiple choice question. Pick the right
// answer before the timer runs out. Thematic fit for "wisdom"-themed skills,
// or when the attacker has Silence / Confuse status.
//
// Difficulty:
//   EASY:   15s timer
//   MEDIUM: 12s
//   HARD:   8s
//   INSANE: 5s
//
// Grade:
//   Perfect: correct in first 40% of time
//   Good:    correct answer
//   OK:      (not applicable)
//   Fail:    wrong or timed out
//
// Questions live in data/quiz-bank.json, loaded via DataStore.
// Used by: qte-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.QteQuiz = (() => {
  'use strict';

  const DIFFICULTY = {
    EASY:   { timeMs: 15000 },
    MEDIUM: { timeMs: 12000 },
    HARD:   { timeMs:  8000 },
    INSANE: { timeMs:  5000 }
  };

  // Track recently used question IDs to avoid repeats within a combat
  const _recentIds = new Set();
  const RECENT_LIMIT = 30;

  function start(opts) {
    return new Promise((resolve) => {
      const { container, difficulty = 'EASY', skill, attacker } = opts;
      const cfg = DIFFICULTY[difficulty] || DIFFICULTY.EASY;

      // Silence status: auto-fail
      if (attacker && attacker.activeStatuses?.some(s => s.statusId === 'silence')) {
        resolve({
          grade: 'fail', multiplier: 0.75, qteType: 'quiz',
          breakdown: { reason: 'silenced' }
        });
        return;
      }

      const question = _pickQuestion(difficulty);
      if (!question) {
        // No quiz bank loaded — fall back to "ok" with a warning
        console.warn('QteQuiz: quiz-bank empty, skipping with OK grade');
        resolve({ grade: 'ok', multiplier: 1.0, qteType: 'quiz',
          breakdown: { reason: 'no_quiz_bank' } });
        return;
      }

      const root = _buildUI(container, skill, cfg, question);
      const timerEl = root.querySelector('.qte-quiz-timer');
      const optionEls = root.querySelectorAll('.qte-quiz-option');

      const startTime = performance.now();
      let cleanedUp = false;
      let timer = null;
      let rafId = null;
      let keyHandler = null;

      function tick() {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, cfg.timeMs - elapsed);
        timerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
        if (remaining > 0 && !cleanedUp) {
          rafId = requestAnimationFrame(tick);
        }
      }
      rafId = requestAnimationFrame(tick);

      function finish(grade, chosenIndex, isCorrect) {
        if (cleanedUp) return;
        cleanedUp = true;

        // Visual feedback: highlight chosen + correct
        if (chosenIndex !== null && optionEls[chosenIndex]) {
          optionEls[chosenIndex].classList.add(isCorrect ? 'correct' : 'wrong');
        }
        if (!isCorrect && optionEls[question.correct]) {
          optionEls[question.correct].classList.add('correct');
        }

        if (rafId) cancelAnimationFrame(rafId);
        if (timer) clearTimeout(timer);
        if (keyHandler) document.removeEventListener('keydown', keyHandler);

        const multiplier = { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade];

        // Record question so we don't repeat immediately
        _recentIds.add(question.id);
        if (_recentIds.size > RECENT_LIMIT) {
          const first = _recentIds.values().next().value;
          _recentIds.delete(first);
        }

        // Brief delay so user can see the feedback
        setTimeout(() => {
          if (root.parentNode) root.parentNode.removeChild(root);
          resolve({
            grade, multiplier, qteType: 'quiz',
            breakdown: {
              questionId: question.id,
              correct: isCorrect,
              chosen: chosenIndex,
              answer: question.correct,
              explanation: question.explanation,
              timeMs: performance.now() - startTime
            }
          });
        }, 1500);
      }

      function answer(index) {
        if (cleanedUp) return;
        const elapsed = performance.now() - startTime;
        const correct = index === question.correct;

        let grade;
        if (!correct)                      grade = 'fail';
        else if (elapsed < cfg.timeMs * 0.40) grade = 'perfect';
        else                               grade = 'good';

        finish(grade, index, correct);
      }

      optionEls.forEach((el, i) => {
        el.addEventListener('click', () => answer(i));
      });

      keyHandler = (e) => {
        // 1-4 number keys pick options
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 4) {
          e.preventDefault();
          answer(n - 1);
        }
      };
      document.addEventListener('keydown', keyHandler);

      timer = setTimeout(() => finish('fail', null, false), cfg.timeMs);
    });
  }

  // ── QUESTION SELECTION ─────────────────────────────────────────────
  function _pickQuestion(difficulty) {
    const DS = window.CJS.DataStore;
    if (!DS) return null;
    const bank = DS.getAllAsArray('quizBank');
    if (!bank?.length) return null;

    // For INSANE, prefer harder tiers (C2); otherwise mixed.
    let pool = bank.filter(q => !_recentIds.has(q.id));
    if (difficulty === 'INSANE') {
      const c2 = pool.filter(q => q.difficulty === 'C2');
      if (c2.length) pool = c2;
    }
    if (!pool.length) pool = bank;  // all used → reset

    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── UI ─────────────────────────────────────────────────────────────
  function _buildUI(container, skill, cfg, question) {
    const root = document.createElement('div');
    root.className = 'qte-overlay qte-quiz';
    const optionsHtml = question.options.map((opt, i) => `
      <button class="qte-quiz-option" data-index="${i}">
        <b>${['A','B','C','D'][i]}.</b> ${_esc(opt)}
      </button>
    `).join('');
    root.innerHTML = `
      <div class="qte-dialog" style="min-width:520px">
        <div class="qte-title">${skill?.icon || '📚'} ${skill?.name || 'Wisdom Strike'}</div>
        <div class="qte-subtitle">
          ${_categoryLabel(question.category)} · <span class="qte-quiz-timer">${(cfg.timeMs/1000).toFixed(1)}s</span>
        </div>
        <div class="qte-quiz-question">${_esc(question.sentence)}</div>
        <div class="qte-quiz-options">${optionsHtml}</div>
      </div>
    `;
    container.appendChild(root);
    return root;
  }

  function _categoryLabel(cat) {
    return {
      phrasal_verb:      'Phrasal Verb',
      collocation:       'Collocation',
      advanced_grammar:  'Advanced Grammar',
      confusing_pair:    'Confusing Pair'
    }[cat] || 'Grammar';
  }

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function resetHistory() { _recentIds.clear(); }

  return Object.freeze({ start, DIFFICULTY, resetHistory });
})();
