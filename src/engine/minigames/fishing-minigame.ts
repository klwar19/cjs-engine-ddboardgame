// fishing-minigame.js
// Tier 3 TS port -> src/engine/minigames/fishing-minigame.ts (exports FishingMinigame + installs window.CJS.FishingMinigame). Body verbatim.
// Full fishing minigame (distinct from the in-combat QTE). Three-step loop:
//   1. CAST — quickpress QTE to land the lure in the strike zone
//   2. WAIT — visualised bobber; random bite delay
//   3. REEL — fishing QTE bar to land the catch (or sustained mash for rare)
//
// Pulls fish from DataStore.fishCatalog filtered by biome. Higher difficulty
// pool is gated behind the player having a "good" rod or a Fish Run event.
// Legendary catches are recorded in state.fishingCollection.caught for later
// "Trophy Wall" display.
//
// Rod tiers (item.tags includes one of):
//   fishing_rod        — basic (Easy/Medium fish only)
//   fishing_rod_silver — adds Hard fish
//   fishing_rod_gold   — adds Insane / legendary catches
//
// Buffs from cooking: once the legendary or rare catch is cooked at a
// station, the produced food carries a CookedBuff that applies in combat
// via the existing add_buff op.
//
// Used by: campaign-ui (Fishing activity tile), pocket-haven station

window.CJS = window.CJS || {};

export const FishingMinigame = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const WE = () => window.CJS.CampaignWorldEvents;
  const QM = () => window.CJS.QteManager;

  const DIFFICULTY_RANK = { EASY: 0, MEDIUM: 1, HARD: 2, INSANE: 3 };
  const ROD_TIERS = {
    fishing_rod:        { tier: 1, maxDifficulty: 'MEDIUM',  name: 'Basic Rod',  bonus: 1.0 },
    fishing_rod_silver: { tier: 2, maxDifficulty: 'HARD',    name: 'Silver Rod', bonus: 1.1 },
    fishing_rod_gold:   { tier: 3, maxDifficulty: 'INSANE',  name: 'Gold Rod',   bonus: 1.25 }
  };

  function _findEquippedRod(state) {
    // Search inventory + party equipment for any fishing rod tag.
    const inv = state?.inventory?.items || {};
    let best = null;
    for (const itemId of Object.keys(inv)) {
      if (!inv[itemId]) continue;
      const def = DS()?.get?.('items', itemId);
      const tags = (def?.tags || []).map((t) => String(t).toLowerCase());
      for (const rodTag of Object.keys(ROD_TIERS)) {
        if (tags.includes(rodTag)) {
          const tier = ROD_TIERS[rodTag];
          if (!best || tier.tier > best.tier) best = { ...tier, itemId, tag: rodTag };
        }
      }
    }
    // Also check explicitly tagged inventory entry under a 'tools' bucket.
    const tools = state?.inventory?.tools || {};
    for (const itemId of Object.keys(tools)) {
      if (!tools[itemId]) continue;
      const def = DS()?.get?.('items', itemId);
      const tags = (def?.tags || []).map((t) => String(t).toLowerCase());
      for (const rodTag of Object.keys(ROD_TIERS)) {
        if (tags.includes(rodTag)) {
          const tier = ROD_TIERS[rodTag];
          if (!best || tier.tier > best.tier) best = { ...tier, itemId, tag: rodTag };
        }
      }
    }
    return best;
  }

  /** All fish definitions available in the given biome, filtered by rod tier. */
  function getAvailableFish(biome, rod) {
    const all = DS()?.getAllAsArray?.('fishCatalog') || [];
    const b = String(biome || '').toLowerCase();
    const maxDiff = rod?.maxDifficulty || 'MEDIUM';
    const maxRank = DIFFICULTY_RANK[maxDiff] ?? DIFFICULTY_RANK.MEDIUM;
    return all.filter((fish) => {
      const biomes = (fish.biomes || []).map((x) => String(x).toLowerCase());
      if (!biomes.includes(b)) return false;
      const fishRank = DIFFICULTY_RANK[String(fish.difficulty || 'EASY').toUpperCase()] ?? 0;
      return fishRank <= maxRank;
    });
  }

  // Weighted pick across rarity tiers.
  function pickFish(pool) {
    if (!pool.length) return null;
    const RARITY_WEIGHT = { common: 60, uncommon: 25, rare: 10, legendary: 2 };
    const fishingBonus = WE()?.getFishingBonus?.() || 1.0;
    const total = pool.reduce((sum, fish) => {
      const base = RARITY_WEIGHT[String(fish.rarity || 'common').toLowerCase()] || 10;
      // Fishing-bonus events boost rare/legendary chance disproportionately.
      const tier = String(fish.rarity || 'common').toLowerCase();
      const boost = (tier === 'rare' || tier === 'legendary') ? fishingBonus : 1.0;
      return sum + base * boost;
    }, 0);
    let cursor = Math.random() * total;
    for (const fish of pool) {
      const base = RARITY_WEIGHT[String(fish.rarity || 'common').toLowerCase()] || 10;
      const tier = String(fish.rarity || 'common').toLowerCase();
      const boost = (tier === 'rare' || tier === 'legendary') ? fishingBonus : 1.0;
      cursor -= base * boost;
      if (cursor <= 0) return fish;
    }
    return pool[pool.length - 1];
  }

  /**
   * Open the full fishing UI. Promise resolves with { caught, fish, qte } once
   * the player either lands a fish, fails the QTE, or exits.
   *
   * @param {{ biome?: string, container?: HTMLElement }} opts
   * @returns {Promise<{ caught: boolean, fish?: object, reason?: string, message?: string, qte?: object, error?: string }>}
   */
  async function open(opts: any = {}) {
    const state = CS()?.getState?.() || {};
    const biome = String(opts.biome || _inferBiome(state) || 'lake').toLowerCase();
    const rod = _findEquippedRod(state);
    if (!rod) {
      return { caught: false, reason: 'no_rod', message: 'You need a fishing rod first.' };
    }
    const pool = getAvailableFish(biome, rod);
    if (!pool.length) {
      return { caught: false, reason: 'no_fish', message: `No fish bite in ${biome}.` };
    }
    const container = opts.container || _ensureRootContainer();
    const overlay: any = _buildOverlay(container, { biome, rod, pool });

    try {
      // ── Step 1: cast (quickpress) ─────────────────────────────────
      overlay.setPhase('cast');
      const castResult = await _castQte(overlay);
      if (castResult.grade === 'fail') {
        overlay.message('The line snags. No bite this time.');
        await _wait(900);
        overlay.destroy();
        return { caught: false, reason: 'cast_fail' };
      }

      // ── Step 2: wait for bite ──────────────────────────────────────
      overlay.setPhase('wait');
      const biteDelay = 800 + Math.random() * 1800;
      const fish = pickFish(pool);
      await _waitBite(overlay, biteDelay);

      // ── Step 3: reel (fishing-bar QTE) ─────────────────────────────
      overlay.setPhase('reel', fish);
      const reelDifficulty = fish.difficulty || 'EASY';
      const reelResult = await _reelQte(overlay, reelDifficulty);
      if (reelResult.grade === 'fail') {
        overlay.message(`${fish.name} escaped!`);
        await _wait(1100);
        overlay.destroy();
        _logFishingAttempt(fish, false);
        return { caught: false, reason: 'reel_fail', fish };
      }

      // Success — grant the catch and reward
      overlay.message(`Landed: ${fish.icon || '🐟'} ${fish.name}! (${reelResult.grade})`);
      _grantCatch(fish, reelResult, rod);
      await _wait(1200);
      overlay.destroy();
      return { caught: true, fish, qte: reelResult };
    } catch (err) {
      overlay.destroy();
      return { caught: false, reason: 'error', error: err?.message || 'unknown' };
    }
  }

  function _logFishingAttempt(fish, success) {
    if (!Ops()?.apply) return;
    Ops().apply({ op: 'log', text: success ? `Caught ${fish.name}.` : `${fish.name} got away.` }, { source: 'fishing' });
  }

  function _grantCatch(fish, reelResult, rod) {
    const produces = fish.produces || {};
    const grade = reelResult?.grade || 'good';
    const gradeBonus = grade === 'perfect' ? 1.5 : grade === 'good' ? 1.0 : 0.75;
    const rodBonus = rod?.bonus || 1.0;
    const baseQty = Number(produces.qty || 1);
    const qty = Math.max(1, Math.round(baseQty * gradeBonus * rodBonus));

    const ops = [];
    if (produces.food) {
      ops.push({ op: 'give_food', id: produces.food, qty });
    }
    if (produces.material && produces.materialQty) {
      ops.push({ op: 'give_material', id: produces.material, qty: Number(produces.materialQty || 1) });
    }
    ops.push({ op: 'log', text: `🎣 Caught ${qty}× ${fish.icon || ''} ${fish.name} (${grade}).` });
    Ops()?.apply?.(ops, { source: 'fishing' });

    // Collection / legendary tracking.
    CS()?.mutate?.((state) => {
      state.fishingCollection = state.fishingCollection || { caught: {}, legendary: {}, totalCatches: 0, bestPerSpecies: {} };
      const col = state.fishingCollection;
      col.caught[fish.id] = (col.caught[fish.id] || 0) + 1;
      col.totalCatches = (col.totalCatches || 0) + 1;
      // Best grade per species.
      const rank = { perfect: 3, good: 2, ok: 1, fail: 0 };
      const prev = rank[col.bestPerSpecies?.[fish.id]?.grade] || 0;
      const next = rank[grade] || 0;
      if (next > prev) {
        col.bestPerSpecies[fish.id] = { grade, weightKg: _rollWeight(fish), at: new Date().toISOString() };
      }
      if (fish.legendary) {
        col.legendary[fish.id] = (col.legendary[fish.id] || 0) + 1;
      }
    }, { source: 'fishing_collection' });

    // If the fish defines a cookedBuff, also register a recipe-friendly note
    // so cooking stations can grant the buff later. The actual buff
    // application is handled by existing add_buff op when the cooked food
    // is consumed.
    if (fish.cookedBuff?.statusId) {
      CS()?.mutate?.((state) => {
        state.cookingUnlocks = state.cookingUnlocks || {};
        state.cookingUnlocks[produces.food || fish.id] = {
          fishId: fish.id,
          statusId: fish.cookedBuff.statusId,
          duration: fish.cookedBuff.duration || 3,
          summary: fish.cookedBuff.summary || ''
        };
      }, { source: 'fishing_unlock' });
    }
  }

  function _rollWeight(fish) {
    const [lo, hi] = Array.isArray(fish.weightKg) && fish.weightKg.length >= 2 ? fish.weightKg : [1, 2];
    return Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
  }

  function _inferBiome(state) {
    // Best effort: look at the current world's biome metadata.
    const world = state?.currentWorld;
    if (!world) return 'lake';
    const def = DS()?.get?.('worlds', world);
    if (def?.fishingBiome) return def.fishingBiome;
    if (def?.biome) return def.biome;
    return world;
  }

  // ── QTE helpers ──────────────────────────────────────────────────

  function _castQte(overlay) {
    const skill = { name: 'Cast', icon: '🎣', qte: 'quickpress' };
    if (!QM()?.trigger) return Promise.resolve({ grade: 'good', multiplier: 1, qteType: 'quickpress' });
    return QM().trigger({
      skill,
      attacker: null,
      areaRank: 'F',
      container: overlay.qteRoot()
    });
  }

  function _reelQte(overlay, difficulty) {
    const skill = { name: 'Reel In', icon: '🐟', qte: 'fishing' };
    if (!QM()?.trigger) return Promise.resolve({ grade: 'good', multiplier: 1, qteType: 'fishing' });
    return QM().trigger({
      skill,
      attacker: null,
      forceDifficulty: difficulty,
      container: overlay.qteRoot()
    });
  }

  function _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function _waitBite(overlay, ms) {
    overlay.startBobber();
    return new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        if (now - start >= ms) {
          overlay.bobberDive();
          setTimeout(resolve, 200);
        } else {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
    });
  }

  // ── UI overlay construction ──────────────────────────────────────

  function _ensureRootContainer() {
    let root = document.getElementById('cjs-fishing-host');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cjs-fishing-host';
      document.body.appendChild(root);
    }
    return root;
  }

  function _buildOverlay(host, ctx) {
    const root = document.createElement('div');
    root.className = 'cjs-fishing-overlay';
    root.innerHTML = `
      <div class="cjs-fishing-scene" data-biome="${_esc(ctx.biome)}">
        <div class="cjs-fishing-sky"></div>
        <div class="cjs-fishing-water">
          <div class="cjs-fishing-ripple cjs-fishing-ripple-1"></div>
          <div class="cjs-fishing-ripple cjs-fishing-ripple-2"></div>
        </div>
        <div class="cjs-fishing-figure" aria-hidden="true">🎣</div>
        <div class="cjs-fishing-line"></div>
        <div class="cjs-fishing-bobber" style="left: 60%; bottom: 32%;">🟤</div>
        <div class="cjs-fishing-panel">
          <div class="cjs-fishing-header">
            <div class="cjs-fishing-biome">🌊 ${_esc(ctx.biome.toUpperCase())}</div>
            <div class="cjs-fishing-rod">${_esc(ctx.rod?.name || 'Basic Rod')}</div>
          </div>
          <div class="cjs-fishing-phase-label">Ready</div>
          <div class="cjs-fishing-message"></div>
          <div class="cjs-fishing-qte-host"></div>
          <button type="button" class="cjs-fishing-bail btn">Leave</button>
        </div>
      </div>
    `;
    host.appendChild(root);

    const phaseLabel = /** @type {HTMLElement} */ (root.querySelector<any>('.cjs-fishing-phase-label'));
    const message = /** @type {HTMLElement} */ (root.querySelector<any>('.cjs-fishing-message'));
    const bobber = /** @type {HTMLElement} */ (root.querySelector<any>('.cjs-fishing-bobber'));
    const qteHost = /** @type {HTMLElement} */ (root.querySelector<any>('.cjs-fishing-qte-host'));
    const scene = /** @type {HTMLElement} */ (root.querySelector<any>('.cjs-fishing-scene'));
    let bobberAnim = null;
    let bailHandler = null;

    const api = {
      setPhase(phase, fish) {
        if (phase === 'cast') {
          phaseLabel.textContent = 'Cast your line — tap when prompted!';
          scene.dataset.phase = 'cast';
          bobber.style.opacity = '0.4';
        } else if (phase === 'wait') {
          phaseLabel.textContent = 'Waiting for a bite…';
          scene.dataset.phase = 'wait';
          bobber.style.opacity = '1';
        } else if (phase === 'reel') {
          phaseLabel.textContent = `Reel in: ${fish?.icon || '🐟'} ${fish?.name || 'Fish'}!`;
          scene.dataset.phase = 'reel';
        }
      },
      message(text) { message.textContent = text || ''; },
      qteRoot() { return qteHost; },
      startBobber() {
        if (bobberAnim) clearInterval(bobberAnim);
        let phase = 0;
        bobberAnim = setInterval(() => {
          phase = (phase + 1) % 2;
          bobber.style.transform = `translateY(${phase ? -3 : 0}px)`;
        }, 350);
      },
      bobberDive() {
        if (bobberAnim) clearInterval(bobberAnim);
        bobberAnim = null;
        bobber.style.transition = 'transform 0.18s ease';
        bobber.style.transform = 'translateY(14px)';
      },
      destroy() {
        if (bobberAnim) clearInterval(bobberAnim);
        if (bailHandler) root.removeEventListener('click', bailHandler);
        try { root.remove(); } catch (e) {}
      }
    };

    bailHandler = (ev) => {
      if (ev.target?.classList?.contains('cjs-fishing-bail')) {
        api.destroy();
      }
    };
    root.addEventListener('click', bailHandler);

    return api;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function getCollection() {
    return CS()?.getState?.()?.fishingCollection || { caught: {}, legendary: {}, totalCatches: 0, bestPerSpecies: {} };
  }

  return Object.freeze({
    open,
    getAvailableFish,
    pickFish,
    getCollection,
    ROD_TIERS
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.FishingMinigame = FishingMinigame;
