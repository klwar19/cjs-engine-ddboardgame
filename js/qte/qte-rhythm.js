// qte-rhythm.js
// "Rhythm" — notes scroll right-to-left toward a hit line. Player presses
// the matching key when the note is near the line.
//
// Difficulty:
//   EASY:   3 notes,  slow scroll, ±300ms window
//   MEDIUM: 5 notes,  medium,      ±200ms
//   HARD:   7 notes,  fast,        ±120ms
//   INSANE: 10 notes, very fast,   ±80ms
//
// Grade:
//   Perfect: all notes hit within ±50ms
//   Good:    ≥80% hit
//   OK:      ≥50% hit
//   Fail:    <50% hit
//
// Used by: qte-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.QteRhythm = (() => {
  'use strict';

  const DIFFICULTY = {
    EASY:   { noteCount: 3,  scrollMs: 2000, windowMs: 300, perfectWindowMs: 120 },
    MEDIUM: { noteCount: 5,  scrollMs: 1600, windowMs: 200, perfectWindowMs: 80  },
    HARD:   { noteCount: 7,  scrollMs: 1200, windowMs: 120, perfectWindowMs: 50  },
    INSANE: { noteCount: 10, scrollMs: 900,  windowMs: 80,  perfectWindowMs: 35  }
  };

  const KEYS = ['A', 'S', 'D', 'F'];

  function start(opts) {
    return new Promise((resolve) => {
      const { container, difficulty = 'EASY', skill } = opts;
      const cfg = DIFFICULTY[difficulty] || DIFFICULTY.EASY;

      // Generate the note sequence with even spacing
      const notes = [];
      const spacingMs = cfg.scrollMs * 0.4;  // gap between notes as they cross the hit line
      for (let i = 0; i < cfg.noteCount; i++) {
        notes.push({
          key:      KEYS[Math.floor(Math.random() * KEYS.length)],
          hitTime:  1000 + i * spacingMs,  // 1s grace before first note
          hit:      false,
          missed:   false,
          hitGrade: null,  // 'perfect' | 'good' | 'miss'
          timingMs: null
        });
      }

      const totalMs = notes[notes.length - 1].hitTime + cfg.scrollMs + 500;

      const root = _buildUI(container, skill, cfg, notes);
      const track = root.querySelector('.qte-rhythm-track');
      const noteEls = {};
      // Create DOM for each note
      notes.forEach((note, i) => {
        const el = document.createElement('div');
        el.className = 'qte-rhythm-note';
        el.textContent = note.key;
        el.style.left = `${track.clientWidth + 60}px`;
        track.appendChild(el);
        noteEls[i] = el;
      });

      const trackWidth = track.clientWidth;
      const hitLineX = 60;  // see .qte-rhythm-hitline CSS
      const startTime = performance.now();

      let cleanedUp = false;
      let keyHandler = null;
      let rafId = null;

      function frame(now) {
        if (cleanedUp) return;
        const elapsed = now - startTime;

        // Position each note: at hitTime, note is at hitLineX.
        // So at time t, note.leftPx = hitLineX + ((hitTime - t) / scrollMs) * (trackWidth - hitLineX)
        notes.forEach((note, i) => {
          if (note.hit) return;
          const msUntilHit = note.hitTime - elapsed;
          const travelFraction = msUntilHit / cfg.scrollMs;
          const x = hitLineX + travelFraction * (trackWidth - hitLineX);
          noteEls[i].style.left = `${x}px`;

          // Mark as missed if it has passed the line by more than the window
          if (!note.missed && msUntilHit < -cfg.windowMs) {
            note.missed = true;
            note.hitGrade = 'miss';
            noteEls[i].classList.add('miss');
          }
        });

        // End condition: all notes hit or missed, OR total time elapsed
        const allDone = notes.every(n => n.hit || n.missed);
        if (allDone || elapsed >= totalMs) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(frame);
      }
      rafId = requestAnimationFrame(frame);

      function registerKey(pressedKey) {
        const elapsed = performance.now() - startTime;
        // Find the earliest unhit note matching this key, within window
        for (let i = 0; i < notes.length; i++) {
          const note = notes[i];
          if (note.hit || note.missed) continue;
          if (note.key !== pressedKey) continue;
          const diff = Math.abs(note.hitTime - elapsed);
          if (diff <= cfg.windowMs) {
            note.hit = true;
            note.timingMs = diff;
            note.hitGrade = diff <= cfg.perfectWindowMs ? 'perfect' : 'good';
            noteEls[i].classList.add('hit');
            return;
          }
        }
        // No matching note in range — ignore (don't fail outright for stray keys)
      }

      keyHandler = (e) => {
        const k = e.key.toUpperCase();
        if (KEYS.includes(k)) {
          e.preventDefault();
          registerKey(k);
        }
      };
      document.addEventListener('keydown', keyHandler);

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        if (rafId) cancelAnimationFrame(rafId);
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 400);
      }

      function finish() {
        if (cleanedUp) return;
        const totalHits    = notes.filter(n => n.hit).length;
        const perfectHits  = notes.filter(n => n.hitGrade === 'perfect').length;
        const hitPct       = totalHits / notes.length;
        const perfectPct   = perfectHits / notes.length;

        let grade;
        if (perfectPct >= 0.9)   grade = 'perfect';
        else if (hitPct >= 0.8)  grade = 'good';
        else if (hitPct >= 0.5)  grade = 'ok';
        else                     grade = 'fail';

        const multiplier = { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade];
        cleanup();
        resolve({
          grade, multiplier, qteType: 'rhythm',
          breakdown: { hits: totalHits, perfectHits, total: notes.length, hitPct, perfectPct }
        });
      }
    });
  }

  function _buildUI(container, skill, cfg, notes) {
    const root = document.createElement('div');
    root.className = 'qte-overlay qte-rhythm';
    const keyLabels = [...new Set(notes.map(n => n.key))].join(', ');
    root.innerHTML = `
      <div class="qte-dialog" style="min-width:480px">
        <div class="qte-title">${skill?.icon || '🎵'} ${skill?.name || 'Combo Strike'}</div>
        <div class="qte-subtitle">Press the keys (${keyLabels}) as notes reach the gold line</div>
        <div class="qte-rhythm-track">
          <div class="qte-rhythm-hitline"></div>
        </div>
      </div>
    `;
    container.appendChild(root);
    return root;
  }

  return Object.freeze({ start, DIFFICULTY });
})();
