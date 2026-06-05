// pocket-haven.js
// The seed / harvest / fishing operations the campaign action handlers call.
// All Pocket Haven rendering (farm grid, craft, cook, the unwired facility /
// mini-game / fishing / notes panels) is now React JSX or was retired in the
// htmlIslandActions migration; only these state-mutating ops remain here.

// Tier 3 TS port of js/campaign/pocket-haven.js (engine cluster: campaign).
// The seed/harvest/fishing state-mutating ops the campaign farm action handlers
// call (rendering is React JSX). Exports `PocketHaven` and installs
// window.CJS.PocketHaven. Body verbatim from the legacy IIFE.
window.CJS = window.CJS || {};

export const PocketHaven = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

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

  return Object.freeze({
    plantSeed,
    harvestPlot,
    openFishing
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.PocketHaven = PocketHaven;
