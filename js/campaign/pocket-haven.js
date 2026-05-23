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
          <button class="campaign-action" data-campaign-action="farm-tick">Tick Growth</button>
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
          ${plot.ready ? `<button class="campaign-action" data-campaign-action="harvest-plot" data-plot-id="${_escAttr(plot.id)}">Harvest</button>` : ''}
          <button class="campaign-action" data-campaign-action="plant-seed" data-plot-id="${_escAttr(plot.id)}">Plant</button>
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
      ? `data-food-id="${_escAttr(recipe.id)}"`
      : `data-recipe-id="${_escAttr(recipe.id)}"`;
    const btn = canMake
      ? `<button class="campaign-action" data-campaign-action="${actionId}" ${dataAttr}>${actionId === 'cook-food' ? 'Cook' : 'Craft'}</button>`
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
        <section class="campaign-panel">
          <div class="campaign-panel-head">
            <h3>Notes</h3>
            <button class="campaign-action" data-campaign-action="add-pocket-note">Add Note</button>
          </div>
          ${(haven.notes || []).map((note) => `<div class="campaign-log-line">${_esc(note.text || note)}</div>`).join('') || '<div class="campaign-empty">No Pocket Haven notes.</div>'}
        </section>
        ${renderFarm()}
        ${renderFishing()}
      </div>
    `;
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
          <button class="campaign-action" data-campaign-action="open-fishing" ${buttonDisabled}>Cast Line</button>
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
    renderPocket,
    plantSeed,
    harvestPlot,
    openFishing
  });
})();
