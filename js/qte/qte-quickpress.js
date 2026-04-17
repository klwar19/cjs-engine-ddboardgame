// qte-quickpress.js
// "Quick Press" — a highlighted button appears; tap it before the timer
// expires. Deliberately lenient — this is the "easy" QTE for basic attacks
// and low-cost skills.
//
// Difficulty:
//   EASY:   1 button, 2.5s window
//   MEDIUM: 1 button, 2.0s window
//   HARD:   2 buttons sequential, 1.5s each
//   INSANE: 3 buttons sequential, 1.0s each
//
// Grade:
//   Perfect: pressed in first 30% of window
//   Good:    first 60%
//   OK:      before expiry
//   Fail:    didn't press in time (or pressed wrong key in HARD/INSANE)
//
// Used by: qte-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.QteQuickPress = (() => {
  'use strict';

  const DIFFICULTY = {
    EASY:   { buttons: 1, windowMs: 2500 },
    MEDIUM: { buttons: 1, windowMs: 2000 },
    HARD:   { buttons: 2, windowMs: 1500 },
    INSANE: { buttons: 3, windowMs: 1000 }
  };

  const KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'];

  function start(opts) {
    return new Promise((resolve) => {
      const { container, difficulty = 'EASY', skill } = opts;
      const cfg = DIFFICULTY[difficulty] || DIFFICULTY.EASY;

      // Pick N random keys (no repeats in a single sequence)
      const sequence = _pickKeys(cfg.buttons);
      let pressedCount = 0;
      const results = [];   // per-button { grade, timeMs }

      // Build UI
      const root = _buildUI(container, skill, cfg, sequence);
      const now = () => performance.now();
      const startTime = now();
      let buttonStart = startTime;
      let timer = null;
      let keyHandler = null;
      let cleanedUp = false;

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        if (timer) clearTimeout(timer);
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        // Fade out
        setTimeout(() => {
          if (root.parentNode) root.parentNode.removeChild(root);
        }, 300);
      }

      function finish(grade) {
        cleanup();
        const multiplier = _multiplier(grade);
        resolve({ grade, multiplier, qteType: 'quickpress', breakdown: results });
      }

      function nextButton() {
        if (pressedCount >= sequence.length) {
          // All pressed successfully — aggregate grade
          finish(_aggregate(results));
          return;
        }
        buttonStart = now();
        _highlightButton(root, sequence[pressedCount]);

        // Arm the timeout for this button
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          // Timed out
          results.push({ grade: 'fail', timeMs: cfg.windowMs });
          finish('fail');
        }, cfg.windowMs);
      }

      keyHandler = (e) => {
        const pressedKey = e.key.toUpperCase();
        const expected = sequence[pressedCount];

        if (pressedKey !== expected) {
          // Wrong key — fail on HARD/INSANE, ignore on EASY/MEDIUM
          if (cfg.buttons >= 2) {
            results.push({ grade: 'fail', timeMs: now() - buttonStart, wrongKey: pressedKey });
            finish('fail');
          }
          return;
        }

        const elapsed = now() - buttonStart;
        const pct = elapsed / cfg.windowMs;
        let grade;
        if (pct < 0.30)      grade = 'perfect';
        else if (pct < 0.60) grade = 'good';
        else                 grade = 'ok';
        results.push({ grade, timeMs: elapsed });
        pressedCount++;
        nextButton();
      };

      document.addEventListener('keydown', keyHandler);

      // Also support tap/click on the button itself (for mobile/touch)
      root.querySelectorAll('.qte-qp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const syntheticKey = btn.dataset.key;
          if (keyHandler) keyHandler({ key: syntheticKey });
        });
      });

      // Start the first button
      nextButton();
    });
  }

  // ── HELPERS ────────────────────────────────────────────────────────
  function _pickKeys(n) {
    const shuffled = [...KEYS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  function _multiplier(grade) {
    return { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade] || 1.0;
  }

  function _aggregate(results) {
    if (!results.length) return 'fail';
    if (results.some(r => r.grade === 'fail')) return 'fail';
    if (results.every(r => r.grade === 'perfect')) return 'perfect';
    if (results.every(r => r.grade === 'perfect' || r.grade === 'good')) return 'good';
    return 'ok';
  }

  function _buildUI(container, skill, cfg, sequence) {
    const root = document.createElement('div');
    root.className = 'qte-overlay qte-quickpress';
    root.innerHTML = `
      <div class="qte-dialog">
        <div class="qte-title">${skill?.icon || '⚡'} ${skill?.name || 'Strike'}</div>
        <div class="qte-subtitle">Quick Press — tap the highlighted key!</div>
        <div class="qte-buttons-row">
          ${sequence.map(k => `
            <button class="qte-qp-btn" data-key="${k}">${k}</button>
          `).join('')}
        </div>
        <div class="qte-timer-bar"><div class="qte-timer-fill"></div></div>
      </div>
    `;
    container.appendChild(root);
    _injectStyles();

    // Animate the timer bar from 100% → 0% over windowMs
    const fill = root.querySelector('.qte-timer-fill');
    fill.style.transition = `width ${cfg.windowMs}ms linear`;
    // Trigger reflow then animate
    requestAnimationFrame(() => { fill.style.width = '0%'; });

    return root;
  }

  function _highlightButton(root, key) {
    root.querySelectorAll('.qte-qp-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.key === key);
    });
    // Reset the timer bar animation for the next button
    const fill = root.querySelector('.qte-timer-fill');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    requestAnimationFrame(() => {
      fill.style.transition = `width ${fill.dataset.duration || 2000}ms linear`;
      fill.style.width = '0%';
    });
  }

  // Styles are injected once and shared across all QTE modules.
  let _stylesInjected = false;
  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      .qte-overlay {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
        animation: qte-fade-in 0.25s ease-out;
      }
      @keyframes qte-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .qte-dialog {
        background: #1a1a2e; border: 2px solid #a855f7;
        border-radius: 12px; padding: 28px 36px; min-width: 360px;
        color: #e0e0f0; text-align: center;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      }
      .qte-title { font-size: 1.4em; font-weight: bold; color: #f59e0b; margin-bottom: 4px; }
      .qte-subtitle { font-size: 0.9em; color: #8888aa; margin-bottom: 20px; }
      .qte-buttons-row { display: flex; gap: 12px; justify-content: center; margin-bottom: 20px; }
      .qte-qp-btn {
        width: 64px; height: 64px; font-size: 1.8em; font-weight: bold;
        background: #222240; color: #8888aa; border: 2px solid #333355;
        border-radius: 10px; cursor: pointer; transition: all 0.15s ease;
        font-family: inherit;
      }
      .qte-qp-btn.active {
        background: #f59e0b; color: #1a1a2e; border-color: #fbbf24;
        transform: scale(1.15); box-shadow: 0 0 20px rgba(245, 158, 11, 0.6);
      }
      .qte-qp-btn:hover:not(.active) { background: #333355; color: #e0e0f0; }
      .qte-timer-bar {
        height: 6px; background: #333355; border-radius: 3px; overflow: hidden;
      }
      .qte-timer-fill {
        height: 100%; width: 100%; background: linear-gradient(90deg, #22c55e, #eab308, #ef4444);
      }

      /* Shared styles for other QTE types */
      .qte-fishing-bar {
        position: relative; width: 320px; height: 48px;
        background: #222240; border: 2px solid #333355; border-radius: 24px;
        margin: 20px auto; overflow: hidden;
      }
      .qte-fishing-zone {
        position: absolute; top: 0; height: 100%;
        background: linear-gradient(180deg, rgba(34,197,94,0.3), rgba(34,197,94,0.15));
        border-left: 2px solid #22c55e; border-right: 2px solid #22c55e;
      }
      .qte-fishing-zone-perfect {
        position: absolute; top: 0; height: 100%;
        background: rgba(245, 158, 11, 0.5);
      }
      .qte-fishing-marker {
        position: absolute; top: 4px; bottom: 4px; width: 6px;
        background: #e0e0f0; border-radius: 3px;
        box-shadow: 0 0 8px rgba(255,255,255,0.8);
      }
      .qte-btn-primary {
        margin-top: 14px; padding: 10px 28px; font-size: 1em; font-weight: bold;
        background: #a855f7; color: white; border: none; border-radius: 8px;
        cursor: pointer; font-family: inherit; transition: all 0.15s ease;
      }
      .qte-btn-primary:hover { background: #9333ea; transform: translateY(-1px); }

      /* Mash button */
      .qte-mash-btn {
        width: 160px; height: 160px; font-size: 1.4em; font-weight: bold;
        background: #ef4444; color: white; border: 4px solid #fbbf24;
        border-radius: 50%; cursor: pointer; margin: 18px auto; display: block;
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5); transition: transform 0.05s ease;
        font-family: inherit;
      }
      .qte-mash-btn:active { transform: scale(0.92); }
      .qte-mash-counter { font-size: 2em; font-weight: bold; color: #fbbf24; margin: 8px 0; }
      .qte-fill-meter { height: 12px; background: #333355; border-radius: 6px; overflow: hidden; margin: 10px 0; }
      .qte-fill-meter > div { height: 100%; background: linear-gradient(90deg, #ef4444, #fbbf24, #22c55e); width: 0%; transition: width 0.1s ease-out; }

      /* Rhythm */
      .qte-rhythm-track {
        position: relative; height: 120px; background: #0f0f1a;
        border: 2px solid #333355; border-radius: 8px; overflow: hidden;
        margin: 20px auto; width: 400px;
      }
      .qte-rhythm-hitline { position: absolute; left: 60px; top: 0; bottom: 0; width: 3px; background: #fbbf24; box-shadow: 0 0 12px #fbbf24; }
      .qte-rhythm-note {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 44px; height: 44px; background: #a855f7; color: white;
        border-radius: 8px; display: flex; align-items: center; justify-content: center;
        font-weight: bold; font-size: 1.2em;
      }
      .qte-rhythm-note.hit { background: #22c55e; animation: qte-pop 0.2s ease-out; }
      .qte-rhythm-note.miss { background: #374151; opacity: 0.4; }
      @keyframes qte-pop { 50% { transform: translateY(-50%) scale(1.4); } }

      /* Quiz */
      .qte-quiz-question { font-size: 1.1em; margin-bottom: 16px; padding: 14px; background: #222240; border-radius: 8px; color: #e0e0f0; text-align: left; }
      .qte-quiz-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .qte-quiz-option {
        padding: 12px 16px; background: #222240; color: #e0e0f0;
        border: 2px solid #333355; border-radius: 8px; cursor: pointer;
        text-align: left; transition: all 0.15s ease; font-family: inherit;
      }
      .qte-quiz-option:hover { background: #333355; border-color: #a855f7; }
      .qte-quiz-option.correct { background: #064e3b; border-color: #22c55e; color: white; }
      .qte-quiz-option.wrong { background: #7f1d1d; border-color: #ef4444; color: white; }

      /* Result banner */
      .qte-result { font-size: 2em; font-weight: bold; margin-top: 16px; }
      .qte-result.perfect { color: #fbbf24; text-shadow: 0 0 20px rgba(251, 191, 36, 0.6); }
      .qte-result.good { color: #22c55e; }
      .qte-result.ok { color: #8888aa; }
      .qte-result.fail { color: #ef4444; }
    `;
    document.head.appendChild(s);
  }

  return Object.freeze({ start, DIFFICULTY });
})();
