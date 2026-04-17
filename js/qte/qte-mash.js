// qte-mash.js
// "Quick Repeated Hit" — mash a button N times within a time window.
// Thematic fit for power skills, charge attacks, berserker abilities.
//
// Difficulty:
//   EASY:    8 taps / 4s    (2.0 taps/sec)
//   MEDIUM:  12 taps / 4s   (3.0 taps/sec)
//   HARD:    16 taps / 4s   (4.0 taps/sec)
//   INSANE:  22 taps / 4s   (5.5 taps/sec)
//
// Grade:
//   Perfect: 120%+ of target taps (over-mash bonus!)
//   Good:    100-119%
//   OK:      70-99%
//   Fail:    <70%
//
// Used by: qte-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.QteMash = (() => {
  'use strict';

  const DIFFICULTY = {
    EASY:   { targetTaps:  8, windowMs: 4000 },
    MEDIUM: { targetTaps: 12, windowMs: 4000 },
    HARD:   { targetTaps: 16, windowMs: 4000 },
    INSANE: { targetTaps: 22, windowMs: 4000 }
  };

  function start(opts) {
    return new Promise((resolve) => {
      const { container, difficulty = 'EASY', skill } = opts;
      const cfg = DIFFICULTY[difficulty] || DIFFICULTY.EASY;

      let tapCount = 0;
      let cleanedUp = false;
      let timer = null;
      let keyHandler = null;

      const root = _buildUI(container, skill, cfg);
      const counterEl = root.querySelector('.qte-mash-counter');
      const fillEl    = root.querySelector('.qte-fill-meter > div');
      const btn       = root.querySelector('.qte-mash-btn');
      const timerEl   = root.querySelector('.qte-mash-time');

      const startTime = performance.now();

      function updateDisplay() {
        counterEl.textContent = `${tapCount} / ${cfg.targetTaps}`;
        const pct = Math.min(150, (tapCount / cfg.targetTaps) * 100);
        fillEl.style.width = `${pct}%`;
      }

      function tick() {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, cfg.windowMs - elapsed);
        timerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
        if (remaining <= 0) {
          finish();
        } else if (!cleanedUp) {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);

      function registerTap() {
        tapCount++;
        updateDisplay();
        // Tactile feedback
        btn.style.transform = 'scale(0.88)';
        setTimeout(() => { if (btn) btn.style.transform = ''; }, 50);
      }

      keyHandler = (e) => {
        // Any letter/space key counts
        if (e.key === ' ' || /^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault();
          registerTap();
        }
      };
      document.addEventListener('keydown', keyHandler);
      btn.addEventListener('click', registerTap);
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); registerTap(); }, { passive: false });

      // Hard stop at end of window
      timer = setTimeout(finish, cfg.windowMs + 50);

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        if (timer) clearTimeout(timer);
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 300);
      }

      function finish() {
        if (cleanedUp) return;
        const pct = (tapCount / cfg.targetTaps) * 100;
        let grade;
        if (pct >= 120)      grade = 'perfect';
        else if (pct >= 100) grade = 'good';
        else if (pct >= 70)  grade = 'ok';
        else                 grade = 'fail';

        const multiplier = { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade];
        cleanup();
        resolve({
          grade, multiplier, qteType: 'mash',
          breakdown: { taps: tapCount, target: cfg.targetTaps, pct: Math.round(pct) }
        });
      }

      updateDisplay();
    });
  }

  function _buildUI(container, skill, cfg) {
    const root = document.createElement('div');
    root.className = 'qte-overlay qte-mash';
    root.innerHTML = `
      <div class="qte-dialog">
        <div class="qte-title">${skill?.icon || '💥'} ${skill?.name || 'Power Strike'}</div>
        <div class="qte-subtitle">MASH any key or tap the button — <b>${cfg.targetTaps}+ taps</b> in <span class="qte-mash-time">${(cfg.windowMs/1000).toFixed(1)}s</span></div>
        <div class="qte-mash-counter">0 / ${cfg.targetTaps}</div>
        <div class="qte-fill-meter"><div></div></div>
        <button class="qte-mash-btn">MASH!</button>
      </div>
    `;
    container.appendChild(root);
    return root;
  }

  return Object.freeze({ start, DIFFICULTY });
})();
