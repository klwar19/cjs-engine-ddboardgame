// qte-fishing.js
// "Fishing" — a marker sweeps left-right along a bar. Player taps space
// (or clicks the bar) to stop it. Success depends on which zone it lands in.
//
// Difficulty:
//   EASY:   green zone 40%, slow marker (1.5s per sweep)
//   MEDIUM: green zone 25%, medium (1.2s)
//   HARD:   green zone 15%, fast (0.9s)
//   INSANE: green zone 8%,  very fast (0.7s), zone slowly drifts
//
// Grade:
//   Perfect: inner 30% of green zone (the "sweet spot")
//   Good:    anywhere in green
//   OK:      yellow "close" zone (±10% of green edges)
//   Fail:    outside all zones
//
// Used by: qte-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.QteFishing = (() => {
  'use strict';

  const DIFFICULTY = {
    EASY:   { zonePct: 0.40, sweepMs: 1500, driftPct: 0 },
    MEDIUM: { zonePct: 0.25, sweepMs: 1200, driftPct: 0 },
    HARD:   { zonePct: 0.15, sweepMs:  900, driftPct: 0 },
    INSANE: { zonePct: 0.08, sweepMs:  700, driftPct: 0.15 }
  };

  function start(opts) {
    return new Promise((resolve) => {
      const { container, difficulty = 'EASY', skill } = opts;
      const cfg = DIFFICULTY[difficulty] || DIFFICULTY.EASY;

      // Zone placement: randomly positioned but not at the edges
      let zoneCenter = 0.25 + Math.random() * 0.50;  // 0.25 – 0.75
      const zoneHalf = cfg.zonePct / 2;
      const okPadding = 0.03;  // ±3% outside green is OK zone

      const root = _buildUI(container, skill, cfg);
      const bar       = root.querySelector('.qte-fishing-bar');
      const zoneEl    = root.querySelector('.qte-fishing-zone');
      const perfectEl = root.querySelector('.qte-fishing-zone-perfect');
      const markerEl  = root.querySelector('.qte-fishing-marker');

      let cleanedUp = false;
      let keyHandler = null;
      let direction = 1;  // +1 = right, -1 = left
      let markerPct = 0;  // 0..1
      let lastFrame = performance.now();

      function updateZonePosition() {
        const leftPct = (zoneCenter - zoneHalf) * 100;
        zoneEl.style.left  = `${leftPct}%`;
        zoneEl.style.width = `${cfg.zonePct * 100}%`;
        // Perfect = inner 30% of green zone
        const pHalf = zoneHalf * 0.3;
        perfectEl.style.left  = `${(zoneCenter - pHalf) * 100}%`;
        perfectEl.style.width = `${pHalf * 2 * 100}%`;
      }
      updateZonePosition();

      function frame(now) {
        if (cleanedUp) return;
        const dt = now - lastFrame;
        lastFrame = now;

        // Marker moves at a constant speed: 100% per sweepMs
        const deltaPct = (dt / cfg.sweepMs) * direction;
        markerPct += deltaPct;
        if (markerPct >= 1) { markerPct = 1; direction = -1; }
        if (markerPct <= 0) { markerPct = 0; direction = 1; }

        // Zone drift (INSANE only)
        if (cfg.driftPct > 0) {
          const drift = (Math.sin(now / 600) * cfg.driftPct) * 0.5;
          zoneCenter = Math.max(zoneHalf + 0.05, Math.min(1 - zoneHalf - 0.05,
            zoneCenter + drift * (dt / 1000)));
          updateZonePosition();
        }

        markerEl.style.left = `${markerPct * 100}%`;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

      function resolvePress() {
        const dist = Math.abs(markerPct - zoneCenter);
        let grade;
        if (dist <= zoneHalf * 0.3) grade = 'perfect';
        else if (dist <= zoneHalf) grade = 'good';
        else if (dist <= zoneHalf + okPadding) grade = 'ok';
        else grade = 'fail';

        const multiplier = { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade];

        // Visual feedback
        markerEl.style.background = grade === 'perfect' ? '#fbbf24'
          : grade === 'good' ? '#22c55e'
          : grade === 'ok' ? '#eab308' : '#ef4444';
        markerEl.style.boxShadow = `0 0 20px ${markerEl.style.background}`;

        cleanup();
        resolve({
          grade, multiplier, qteType: 'fishing',
          breakdown: { markerPct, zoneCenter, zoneHalf, distance: dist }
        });
      }

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 400);
      }

      keyHandler = (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          resolvePress();
        }
      };
      document.addEventListener('keydown', keyHandler);
      bar.addEventListener('click', resolvePress);
      bar.style.cursor = 'pointer';
    });
  }

  function _buildUI(container, skill, cfg) {
    const root = document.createElement('div');
    root.className = 'qte-overlay qte-fishing';
    root.innerHTML = `
      <div class="qte-dialog">
        <div class="qte-title">${skill?.icon || '🎣'} ${skill?.name || 'Precision Strike'}</div>
        <div class="qte-subtitle">Press <b>SPACE</b> when the marker is in the green zone</div>
        <div class="qte-fishing-bar">
          <div class="qte-fishing-zone"></div>
          <div class="qte-fishing-zone-perfect"></div>
          <div class="qte-fishing-marker" style="left:0%"></div>
        </div>
      </div>
    `;
    container.appendChild(root);
    return root;
  }

  return Object.freeze({ start, DIFFICULTY });
})();
