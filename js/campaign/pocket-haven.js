// pocket-haven.js
// Pocket Haven farm body + the seed / harvest / fishing operations the campaign
// action handlers call. Craft + Cook moved to React JSX (CampaignCraftCookTabs);
// the unwired facility / mini-game / fishing / notes panels were retired with
// the htmlIslandActions migration. Only the farm render (still vanilla until the
// FarmingMode tab port) and the op helpers remain here.

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

  // ── Fishing ────────────────────────────────────────────────────────
  // The fishing minigame overlay is owned by js/minigames/fishing-minigame.js;
  // openFishing is invoked by the campaign farm action handler.
  function _detectBiome(state) {
    const world = state?.currentWorld || '';
    const def = DS().get('worlds', world);
    return def?.fishingBiome || def?.biome || world || 'lake';
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
    plantSeed,
    harvestPlot,
    openFishing
  });
})();
