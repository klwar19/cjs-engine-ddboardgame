// cooking-minigame.js
// Timing-based cooking minigame. Mirrors the fishing flow: a moving
// "heat marker" sweeps a temperature bar, and the player presses to
// stop it. Where the marker lands decides:
//   Burnt   — marker in red zones, food spoils (small or zero buff)
//   OK      — marker in yellow zones, food is edible (base buff)
//   Perfect — marker in the green sweet spot, food keeps full buff +
//             a bonus stat boost
//
// The minigame can ALSO discover new recipes: when the player cooks
// an unknown ingredient combination that maps to a hidden recipe in
// the food catalog, the recipe is added to state.unlockedRecipes and
// surfaced in the Cook tab.
//
// API:
//   await window.CJS.CookingMinigame.open({ foodId, inputs })
//
// Returns: { ok, grade, gradeMultiplier, foodId, buff, discoveredRecipe }
//
// Used by: campaign-ui (cook button), pocket-haven cooking station.

window.CJS = window.CJS || {};

window.CJS.CookingMinigame = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;

  let _sessionRoot = null;

  const GRADE_MULT = { burnt: 0.4, ok: 1.0, good: 1.25, perfect: 1.6 };
  const ZONE_TEMP = {
    burntLow:   { from: 0,   to: 14,  grade: 'burnt' },
    raw:        { from: 14,  to: 32,  grade: 'burnt' },
    ok:         { from: 32,  to: 46,  grade: 'ok'    },
    sweet:      { from: 46,  to: 54,  grade: 'perfect' },
    okHigh:     { from: 54,  to: 68,  grade: 'good'  },
    overcooked: { from: 68,  to: 86,  grade: 'ok'    },
    burntHigh:  { from: 86,  to: 100, grade: 'burnt' }
  };

  function open(opts = {}) {
    return new Promise((resolve) => {
      _close();
      const foodId = opts.foodId || '';
      const food = foodId ? DS().get('food', foodId) : null;
      const inputs = opts.inputs || food?.inputs || {};

      const root = _buildUI({
        title: food?.name || 'Cooking',
        icon: food?.icon || '🍳',
        description: food?.description || '',
        difficulty: opts.difficulty || 'NORMAL'
      });
      document.body.appendChild(root);
      _sessionRoot = root;

      const marker = root.querySelector('[data-cm="marker"]');
      const result = root.querySelector('[data-cm="result"]');
      const stopBtn = root.querySelector('[data-cm="stop"]');
      const cancelBtn = root.querySelector('[data-cm="cancel"]');

      // Animation: marker sweeps left → right and back. Single full
      // pass takes ~2.4s; speed ramps up for higher difficulties.
      const speed = opts.difficulty === 'HARD' ? 1.55 : opts.difficulty === 'EASY' ? 0.85 : 1.0;
      const period = 2400 / speed;
      const start = performance.now();
      let stopped = false;
      let raf = 0;

      function tick(now) {
        if (stopped) return;
        const elapsed = (now - start) % period;
        const half = period / 2;
        const phase = elapsed <= half ? (elapsed / half) : (1 - (elapsed - half) / half);
        const pct = Math.max(0, Math.min(100, phase * 100));
        marker.style.left = `${pct}%`;
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);

      function stop() {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(raf);
        const finalLeft = parseFloat(marker.style.left || '0');
        const zone = _zoneAt(finalLeft);
        const grade = zone.grade;
        const gradeMultiplier = GRADE_MULT[grade] || 1.0;
        const discovered = _maybeDiscoverRecipe(inputs);

        result.innerHTML = `
          <div class="cm-result-title">${_emoji(grade)} ${_label(grade)}</div>
          <div class="cm-result-detail">
            Heat ended at ${finalLeft.toFixed(0)}% · Buff potency ×${gradeMultiplier.toFixed(2)}
            ${discovered ? `<div class="cm-result-discovery">🔓 Discovered recipe: ${_esc(discovered.name || discovered.id)}</div>` : ''}
          </div>
          <div class="cm-result-actions">
            <button data-cm="close">Finish</button>
          </div>
        `;
        result.hidden = false;
        stopBtn.disabled = true;
        cancelBtn.disabled = true;

        // Apply the cook: consume inputs (if known recipe) and grant
        // food with a potency-scaled buff baked into the buff payload.
        const buff = _composeBuff(food?.buff, gradeMultiplier, grade);
        const ops = [];
        if (foodId && grade !== 'burnt') {
          ops.push({
            op: 'cook_basic',
            id: foodId,
            label: food?.name || foodId,
            inputs,
            outputs: { food: { [foodId]: 1 } }
          });
        } else if (grade === 'burnt') {
          // Still consume inputs even on a burn — the player learns to
          // time it. No food granted.
          ops.push({
            op: 'cook_basic',
            id: foodId || 'burnt_dish',
            label: 'Burnt ' + (food?.name || 'dish'),
            inputs,
            outputs: {}
          });
        }
        if (discovered) ops.push({ op: 'unlock_recipe', recipeId: discovered.id });
        if (ops.length) Ops().apply(ops, { source: 'cooking_minigame' });

        const payload = {
          ok: true, grade, gradeMultiplier,
          foodId: foodId || null,
          buff,
          discoveredRecipe: discovered ? discovered.id : null
        };
        result.querySelector('[data-cm="close"]')?.addEventListener('click', () => {
          _close();
          resolve(payload);
        });
      }

      function cancel() {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(raf);
        _close();
        resolve({ ok: false, grade: 'cancelled', gradeMultiplier: 0, foodId: foodId || null });
      }

      stopBtn.addEventListener('click', stop);
      cancelBtn.addEventListener('click', cancel);
      root.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      // Auto-focus so keyboard input works immediately.
      setTimeout(() => stopBtn.focus(), 0);
    });
  }

  function _close() {
    if (_sessionRoot && _sessionRoot.parentNode) {
      _sessionRoot.parentNode.removeChild(_sessionRoot);
    }
    _sessionRoot = null;
  }

  function _zoneAt(pct) {
    for (const zone of Object.values(ZONE_TEMP)) {
      if (pct >= zone.from && pct < zone.to) return zone;
    }
    return ZONE_TEMP.overcooked;
  }

  function _composeBuff(baseBuff, mult, grade) {
    if (!baseBuff) return null;
    const amount = Math.max(0, Math.round(Number(baseBuff.amount || 0) * mult));
    const out = { ...baseBuff, amount };
    if (grade === 'perfect') {
      out.bonus = 'Perfect: +1 to the buffed stat.';
      out.amount = amount + 1;
    } else if (grade === 'burnt') {
      out.amount = 0;
      out.note = 'Burnt — no buff';
    }
    return out;
  }

  // ── RECIPE DISCOVERY ─────────────────────────────────────────────
  // Walk the food catalog looking for a recipe that exactly matches
  // the provided inputs AND is not yet unlocked. If found, return it.
  // Authors flag discoverable recipes with `discoverable: true`.
  function _maybeDiscoverRecipe(inputs) {
    const state = CS().getState();
    const unlocked = state.unlockedRecipes || {};
    const all = DS().getAllAsArray('food') || [];
    for (const food of all) {
      if (!food?.discoverable) continue;
      if (unlocked[food.id]) continue;
      if (!_inputsMatch(food.inputs, inputs)) continue;
      return food;
    }
    return null;
  }

  function _inputsMatch(a = {}, b = {}) {
    const buckets = ['items', 'materials', 'food'];
    for (const bucket of buckets) {
      const aa = a[bucket] || {};
      const bb = b[bucket] || {};
      const aKeys = Object.keys(aa).sort();
      const bKeys = Object.keys(bb).sort();
      if (aKeys.length !== bKeys.length) return false;
      for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] !== bKeys[i]) return false;
        if (Number(aa[aKeys[i]]) !== Number(bb[bKeys[i]])) return false;
      }
    }
    return true;
  }

  function _emoji(grade) {
    return { burnt: '🔥', ok: '🍽️', good: '✨', perfect: '⭐' }[grade] || '🍳';
  }

  function _label(grade) {
    return { burnt: 'Burnt!', ok: 'OK', good: 'Tasty', perfect: 'Perfect!' }[grade] || 'Done';
  }

  // ── UI ─────────────────────────────────────────────────────────
  function _buildUI({ title, icon, description, difficulty }) {
    const root = document.createElement('div');
    root.className = 'qte-overlay cooking-overlay';
    root.tabIndex = 0;
    root.innerHTML = `
      <div class="qte-dialog cooking-dialog" style="min-width: 480px; max-width: 95vw">
        <div class="qte-title">${_esc(icon)} ${_esc(title)}</div>
        <div class="qte-subtitle">Tap STOP when the marker hits the green sweet spot · ${_esc(difficulty)}</div>
        ${description ? `<div class="cm-description">${_esc(description)}</div>` : ''}
        <div class="cm-heatbar" style="position:relative;margin:18px 0;height:32px;border-radius:8px;overflow:hidden;background:linear-gradient(to right,
            #ef4444 0%, #ef4444 14%,
            #f97316 14%, #f97316 32%,
            #facc15 32%, #facc15 46%,
            #22c55e 46%, #22c55e 54%,
            #facc15 54%, #facc15 68%,
            #fb923c 68%, #fb923c 86%,
            #b91c1c 86%, #b91c1c 100%);
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3);">
          <div class="cm-marker" data-cm="marker" style="position:absolute;top:-4px;left:0;width:6px;height:40px;background:#fff;border:1px solid #000;border-radius:3px;transform:translateX(-3px);"></div>
        </div>
        <div class="cm-zonelabels" style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-mute);margin-top:-12px;margin-bottom:8px">
          <span>Burnt</span><span>Raw</span><span>OK</span><span>★ Sweet ★</span><span>OK</span><span>Over</span><span>Burnt</span>
        </div>
        <div class="cm-controls" style="display:flex;gap:8px;justify-content:center">
          <button data-cm="stop" class="campaign-action primary" style="min-width:120px">STOP</button>
          <button data-cm="cancel" class="campaign-action">Cancel</button>
        </div>
        <div class="cm-result" data-cm="result" hidden style="margin-top:12px;padding:8px;background:rgba(0,0,0,0.25);border-radius:8px;text-align:center"></div>
      </div>
    `;
    return root;
  }

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  return Object.freeze({ open, GRADE_MULT });
})();
