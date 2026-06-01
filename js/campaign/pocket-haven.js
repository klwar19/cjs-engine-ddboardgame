// pocket-haven.js
// Pocket Haven farm, crafting, cooking, and notes UI helpers.

window.CJS = window.CJS || {};

window.CJS.PocketHaven = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

  function renderFarm() {
    if (window.CJS.FarmingMode?.renderFarm) return window.CJS.FarmingMode.renderFarm();
    const plots = CS().getState().pocketHaven?.farm?.plots || [];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>Farm</h3>
          <button class="campaign-action" data-farm-tick="1">Tick Growth</button>
        </div>
        ${plots.length ? plots.map(_renderPlot).join('') : '<div class="campaign-empty">No plots yet.</div>'}
      </section>
    `;
  }

  function _renderPlot(plot) {
    const pct = Math.round(((plot.progress || 0) / (plot.required || 1)) * 100);
    return `
      <div class="campaign-row">
        <div>
          <strong>${_esc(plot.id)}</strong>
          <div class="campaign-muted">${plot.seedId ? _esc(_name('crops', plot.seedId)) : 'Empty plot'}</div>
          <div class="campaign-meter"><span style="width:${Math.min(100, pct)}%"></span></div>
        </div>
        <div class="campaign-row-actions">
          ${plot.ready ? `<button class="campaign-action" data-harvest-plot="${_escAttr(plot.id)}">Harvest</button>` : ''}
          <button class="campaign-action" data-plant-seed-plot="${_escAttr(plot.id)}">Plant</button>
        </div>
      </div>
    `;
  }

  function renderCraft() {
    const state = CS().getState();
    const recipes = DS().getAllAsArray('crafting').filter((recipe) => !recipe._world || recipe._world === state.currentWorld);
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h3>Craft</h3></div>
        ${recipes.length ? recipes.map((recipe) => _renderRecipeRow(state, recipe, 'craft-recipe', 'recipe')).join('') : '<div class="campaign-empty">No recipes yet. Use GM Override for manual crafting.</div>'}
      </section>
    `;
  }

  function renderCook() {
    const foods = DS().getAllAsArray('food');
    const state = CS().getState();
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h3>Cook</h3></div>
        ${foods.length ? foods.map((food) => _renderRecipeRow(state, food, 'cook-food', 'food')).join('') : '<div class="campaign-empty">No food data yet. Use GM Override for manual cooking.</div>'}
      </section>
    `;
  }

  // Shared row renderer for Cook + Craft. Surfaces required ingredients
  // and disables the action button when the player is short.
  function _renderRecipeRow(state, recipe, actionId, idAttr) {
    const inputs = recipe.inputs || {};
    const reqLine = _renderIngredientLine(state, inputs);
    const outputLine = _renderOutputLine(recipe.outputs || {});
    const buff = recipe.buff
      ? `<div class="campaign-muted">Buff: ${_esc(recipe.buff.stat || '')} +${recipe.buff.amount || 0} (${_esc(recipe.duration || 'next_battle')})</div>`
      : '';
    const canMake = _bundleAvailable(state, inputs);
    const dataAttr = idAttr === 'food'
      ? `data-cook-food-id="${_escAttr(recipe.id)}"`
      : `data-craft-recipe-id="${_escAttr(recipe.id)}"`;
    const btn = canMake
      ? `<button class="campaign-action" ${dataAttr}>${actionId === 'cook-food' ? 'Cook' : 'Craft'}</button>`
      : `<button class="campaign-action" disabled title="Missing ingredients">Need Ingredients</button>`;
    return `
      <div class="campaign-row">
        <div>
          <strong>${_esc(recipe.icon || '')} ${_esc(recipe.name || recipe.id)}</strong>
          <div class="campaign-muted">${_esc(recipe.description || '')}</div>
          ${buff}
          ${reqLine}
          ${outputLine}
        </div>
        ${btn}
      </div>
    `;
  }

  function _renderIngredientLine(state, inputs = {}) {
    const parts = [];
    for (const [id, qty] of Object.entries(inputs.materials || {})) {
      const have = state.inventory?.materials?.[id] || 0;
      const ok = have >= qty;
      parts.push(`<span style="color:${ok ? 'var(--green)' : 'var(--red)'}">${_esc(_name('materials', id))} ${have}/${qty}</span>`);
    }
    for (const [id, qty] of Object.entries(inputs.items || {})) {
      const have = state.inventory?.items?.[id] || 0;
      const ok = have >= qty;
      parts.push(`<span style="color:${ok ? 'var(--green)' : 'var(--red)'}">${_esc(_name('items', id))} ${have}/${qty}</span>`);
    }
    for (const [id, qty] of Object.entries(inputs.currencies || {})) {
      const have = state.currencies?.[id] || 0;
      const ok = have >= qty;
      parts.push(`<span style="color:${ok ? 'var(--green)' : 'var(--red)'}">${_esc(id)} ${have}/${qty}</span>`);
    }
    if (!parts.length) return '<div class="campaign-muted" style="font-size:0.8em">No ingredients required.</div>';
    return `<div class="campaign-muted" style="font-size:0.85em">Needs: ${parts.join(' · ')}</div>`;
  }

  function _renderOutputLine(outputs = {}) {
    const parts = [];
    for (const [id, qty] of Object.entries(outputs.items || {})) parts.push(`${qty} ${_name('items', id)}`);
    for (const [id, qty] of Object.entries(outputs.materials || {})) parts.push(`${qty} ${_name('materials', id)}`);
    for (const [id, qty] of Object.entries(outputs.food || {})) parts.push(`${qty} ${_name('food', id)}`);
    for (const [id, qty] of Object.entries(outputs.seeds || {})) parts.push(`${qty} ${_name('crops', id)}`);
    for (const [id, qty] of Object.entries(outputs.farmFertilizer || {})) parts.push(`${qty} ${_name('materials', id)}`);
    if (!parts.length) return '';
    return `<div class="campaign-muted" style="font-size:0.85em">Makes: ${_esc(parts.join(' | '))}</div>`;
  }

  function _bundleAvailable(state, bundle = {}) {
    for (const [id, qty] of Object.entries(bundle.currencies || {})) {
      if ((state.currencies?.[id] || 0) < Number(qty || 0)) return false;
    }
    for (const bucket of ['items', 'materials', 'food', 'questItems']) {
      for (const [id, qty] of Object.entries(bundle[bucket] || {})) {
        if ((state.inventory?.[bucket]?.[id] || 0) < Number(qty || 0)) return false;
      }
    }
    for (const [id, qty] of Object.entries(bundle.seeds || {})) {
      if ((state.pocketHaven?.farm?.seedStock?.[id] || 0) < Number(qty || 0)) return false;
    }
    for (const [id, qty] of Object.entries(bundle.farmFertilizer || {})) {
      if ((state.pocketHaven?.farm?.fertilizerStock?.[id] || 0) < Number(qty || 0)) return false;
    }
    return true;
  }

  function renderPocket() {
    const haven = CS().getState().pocketHaven || {};
    return `
      <div class="campaign-tab-grid">
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Stations</h3></div>
          ${(haven.stations || []).map((station) => `<div class="campaign-row"><strong>${_esc(station.name || station.id)}</strong><span class="campaign-pill">${_esc(station.kind || 'station')}</span></div>`).join('') || '<div class="campaign-empty">No stations yet.</div>'}
        </section>
        ${renderFacilities()}
        ${renderMiniGames()}
        <section class="campaign-panel">
          <div class="campaign-panel-head">
            <h3>Notes</h3>
            <button class="campaign-action" data-add-pocket-note="1">Add Note</button>
          </div>
          ${(haven.notes || []).map((note) => `<div class="campaign-log-line">${_esc(note.text || note)}</div>`).join('') || '<div class="campaign-empty">No Pocket Haven notes.</div>'}
        </section>
        ${renderFarm()}
        ${renderFishing()}
      </div>
    `;
  }

  // ── Mini-games & Tavern (trivia) ──────────────────────────────────
  // Surfaces the puzzle games (Mummy Maze, Push Box) and the Guild
  // Trivia Night event directly in Pocket Haven. Each tile launches
  // through the existing host with `source: 'pocket_haven'` so the
  // result payload is logged in the campaign event log and the
  // contextual buffs the levels declare apply automatically.
  function renderMiniGames() {
    const MG = window.CJS.Minigames;
    const state = CS().getState();
    const games = MG?.listGames?.() || [];
    const triviaAvailable = !!window.CJS.GuildTrivia;
    if (!games.length && !triviaAvailable) return '';
    const gameTiles = games.map((g) => `
      <div class="campaign-row">
        <div>
          <strong>${_esc(g.title || g.id)}</strong>
          <div class="campaign-muted">${_esc(g.description || 'Pocket Haven training drill.')}</div>
        </div>
        <button class="campaign-action primary" data-haven-play-minigame="${_escAttr(g.id)}">Play</button>
      </div>
    `).join('');
    const triviaTile = triviaAvailable ? `
      <div class="campaign-row">
        <div>
          <strong>🍺 Guild Trivia Night</strong>
          <div class="campaign-muted">Tavern event. Answer lore and history questions for JP and relationship points.</div>
        </div>
        <button class="campaign-action primary" data-haven-open-trivia="${_escAttr(state.currentWorld || 'haven')}">Host Round</button>
      </div>
    ` : '';
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h3>Mini-Games & Tavern</h3></div>
        ${triviaTile}
        ${gameTiles || '<div class="campaign-empty">No mini-games registered.</div>'}
        <div class="campaign-muted" style="font-size:0.78em;margin-top:8px;padding:4px 8px">
          Winning a Pocket Haven mini-game grants a contextual buff for your next battle. Higher difficulty = stronger buff.
        </div>
      </section>
    `;
  }

  // ── Facilities: training ground, advanced craft, ranch ────────────
  function renderFacilities() {
    const PHF = window.CJS.PocketHavenFacilities;
    if (!PHF) return '';
    const state = CS().getState();
    const catalog = PHF.listFacilities();
    if (!catalog.length) return '';

    const rows = catalog.map((def) => {
      const inst = PHF.getInstance(state, def.id);
      const built = !!inst;
      const level = inst?.level || 0;
      const uses = inst?.usesRemaining ?? 0;
      const cap = inst?.capacity ?? def.capacity ?? 0;
      const buildCost = PHF.describeCost(def.buildCost || {});
      const upgradeCosts = Array.isArray(def.upgradeCost) ? def.upgradeCost : [def.upgradeCost];
      const nextUpgradeIdx = Math.max(0, (level || 1) - 1);
      const upgradeCost = upgradeCosts[nextUpgradeIdx] ? PHF.describeCost(upgradeCosts[nextUpgradeIdx]) : 'maxed';
      const maxedOut = level >= (def.maxLevel || 1);
      const action = built
        ? (maxedOut
            ? '<span class="campaign-pill">Maxed</span>'
            : `<button class="campaign-action" data-haven-upgrade-facility="${_escAttr(def.id)}" title="Cost: ${_escAttr(upgradeCost)}">Upgrade (${_esc(upgradeCost)})</button>`)
        : `<button class="campaign-action primary" data-haven-build-facility="${_escAttr(def.id)}" title="Cost: ${_escAttr(buildCost)}">Build (${_esc(buildCost)})</button>`;
      const useBtn = _facilityActionButtons(def, inst);
      const usageLine = built
        ? `<div class="campaign-muted" style="font-size:0.82em">Lv ${level} · Uses left this phase: ${uses}${cap ? ` · Capacity: ${cap}` : ''}</div>`
        : '';
      const description = _esc(def.description || def.summary || '');
      return `
        <div class="campaign-row">
          <div>
            <strong>${_esc(def.icon || '')} ${_esc(def.name)}</strong>
            <div class="campaign-muted">${description}</div>
            ${usageLine}
            ${_renderRanchAssignments(state, def, inst)}
          </div>
          <div class="campaign-row-actions" style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
            ${action}
            ${useBtn}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h3>Facilities</h3></div>
        ${rows}
      </section>
    `;
  }

  function _facilityActionButtons(def, inst) {
    if (!inst) return '';
    if (def.kind === 'training') {
      const disabled = (inst.usesRemaining || 0) <= 0 ? 'disabled' : '';
      return `<button class="campaign-action" data-haven-train-skill="${_escAttr(def.id)}" ${disabled}>Train Skill</button>`;
    }
    if (def.kind === 'ranch') {
      const collectDisabled = (inst.usesRemaining || 0) <= 0 ? 'disabled' : '';
      return `
        <button class="campaign-action" data-haven-ranch-assign="${_escAttr(def.id)}">Assign</button>
        <button class="campaign-action" data-haven-ranch-collect="${_escAttr(def.id)}" ${collectDisabled}>Collect</button>
      `;
    }
    if (def.kind === 'craft') {
      return `<span class="campaign-pill">+Recipes ×L${inst.level || 1}</span>`;
    }
    return '';
  }

  function _renderRanchAssignments(state, def, inst) {
    if (def.kind !== 'ranch' || !inst) return '';
    const assigned = inst.assigned || [];
    if (!assigned.length) return '<div class="campaign-muted" style="font-size:0.82em">No beasts assigned.</div>';
    const lines = assigned.map((beastId) => {
      const beast = DS().get('monsters', beastId);
      return `<span class="campaign-pill">${_esc(beast?.icon || '🐾')} ${_esc(beast?.name || beastId)}</span>`;
    });
    return `<div class="campaign-chip-row" style="margin-top:4px">${lines.join(' ')}</div>`;
  }

  // ── Fishing ────────────────────────────────────────────────────────
  // Surfaces the fishing minigame via Pocket Haven. The actual minigame
  // overlay is owned by js/minigames/fishing-minigame.js — this just
  // describes the player's collection progress and exposes a launch button.
  function renderFishing() {
    const FM = window.CJS.FishingMinigame;
    if (!FM) return '';
    const collection = FM.getCollection?.() || { caught: {}, legendary: {}, totalCatches: 0, bestPerSpecies: {} };
    const state = CS().getState();
    const biomeText = _detectBiome(state);
    const rod = _detectRod(state);
    const total = Object.keys(collection.caught || {}).length;
    const catalogTotal = (DS().getAllAsArray('fishCatalog') || []).length;
    const legendaryCount = Object.keys(collection.legendary || {}).length;
    const buttonDisabled = !rod ? 'disabled title="You need a fishing rod (buy from a shop)"' : '';
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>🎣 Fishing</h3>
          <button class="campaign-action" data-open-fishing="1" ${buttonDisabled}>Cast Line</button>
        </div>
        <div class="campaign-row">
          <div>
            <div><strong>Biome:</strong> ${_esc(biomeText)}</div>
            <div class="campaign-muted">${rod ? `Equipped: ${_esc(rod.name)} (tier ${rod.tier})` : 'No fishing rod equipped.'}</div>
            <div class="campaign-muted">Collection: ${total} / ${catalogTotal} species · ${legendaryCount} legendary</div>
            ${total ? `<details class="campaign-muted"><summary>Catch log</summary>${_renderCollectionLog(collection)}</details>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  function _renderCollectionLog(collection) {
    const lines = [];
    for (const id of Object.keys(collection.caught || {})) {
      const def = DS().get('fishCatalog', id);
      const count = collection.caught[id];
      const best = collection.bestPerSpecies?.[id]?.grade || 'good';
      const weight = collection.bestPerSpecies?.[id]?.weightKg || 0;
      lines.push(`<div class="campaign-log-line">${_esc(def?.icon || '🐟')} ${_esc(def?.name || id)} x${count} · best ${best}${weight ? `, ${weight}kg` : ''}${def?.legendary ? ' ⭐' : ''}</div>`);
    }
    return lines.join('') || '<div class="campaign-empty">No catches yet.</div>';
  }

  function _detectBiome(state) {
    const world = state?.currentWorld || '';
    const def = DS().get('worlds', world);
    return def?.fishingBiome || def?.biome || world || 'lake';
  }

  function _detectRod(state) {
    const FM = window.CJS.FishingMinigame;
    if (!FM?.ROD_TIERS) return null;
    const inv = state?.inventory?.items || {};
    let best = null;
    for (const id of Object.keys(inv)) {
      if (!inv[id]) continue;
      const def = DS().get('items', id);
      const tags = (def?.tags || []).map((t) => String(t).toLowerCase());
      for (const rodTag of Object.keys(FM.ROD_TIERS)) {
        if (tags.includes(rodTag)) {
          const tier = FM.ROD_TIERS[rodTag];
          if (!best || tier.tier > best.tier) best = { ...tier, itemId: id, tag: rodTag };
        }
      }
    }
    return best;
  }

  async function openFishing() {
    const FM = window.CJS.FishingMinigame;
    if (!FM?.open) return;
    const biome = _detectBiome(CS().getState());
    const result = await FM.open({ biome });
    // Re-render the campaign UI to reflect collection changes.
    window.CJS.CampaignUI?.render?.();
    return result;
  }

  function plantSeed(plotId, seedId) {
    const crop = DS().get('crops', seedId);
    CS().mutate((state) => {
      const plot = (state.pocketHaven.farm.plots || []).find((entry) => entry.id === plotId);
      if (!plot) return;
      plot.seedId = seedId;
      plot.cropId = crop?.cropId || seedId;
      plot.progress = 0;
      plot.required = crop?.growthTicks || 3;
      plot.ready = false;
    }, { source: 'pocket_haven' });
    window.CJS.CampaignOps.apply({ op: 'log', text: `Planted ${seedId} in ${plotId}.` }, { source: 'pocket_haven' });
  }

  function harvestPlot(plotId) {
    const plot = (CS().getState().pocketHaven.farm.plots || []).find((entry) => entry.id === plotId);
    if (!plot || !plot.ready) return;
    const crop = DS().get('crops', plot.seedId);
    const outputs = crop?.harvest || { materials: { [plot.cropId || plot.seedId]: 1 } };
    window.CJS.CampaignOps.apply({ op: 'craft_basic', label: `Harvest ${plot.seedId}`, inputs: {}, outputs }, { source: 'pocket_haven' });
    CS().mutate((state) => {
      const target = state.pocketHaven.farm.plots.find((entry) => entry.id === plotId);
      if (!target) return;
      target.seedId = null;
      target.cropId = null;
      target.progress = 0;
      target.ready = false;
    }, { source: 'pocket_haven' });
  }

  function _name(type, id) {
    return DS().get(type, id)?.name || id;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function _escAttr(value) { return _esc(value); }

  return Object.freeze({
    renderFarm,
    renderCraft,
    renderCook,
    renderFishing,
    renderFacilities,
    renderMiniGames,
    renderPocket,
    plantSeed,
    harvestPlot,
    openFishing
  });
})();
