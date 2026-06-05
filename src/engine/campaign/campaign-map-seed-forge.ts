// campaign-map-seed-forge.ts — Tier 3 TS port of
// js/campaign/campaign-map-seed-forge.js (engine cluster: campaign). Node-map
// seed lookup + idea helpers (getSeeds/getSeed/saveSeed). DOM-free; reads
// window.CJS.* lazily. Exports `CampaignMapSeedForge` and installs
// window.CJS.CampaignMapSeedForge. Body verbatim from the legacy IIFE.

window.CJS = window.CJS || {};

export const CampaignMapSeedForge = (() => {
  'use strict';

  const Loader = () => window.CJS.CampaignDataLoader;
  const Side = () => window.CJS.CampaignSideContent;

  function getSeeds(filters: any = {}) {
    return Loader().getMapSeeds(filters.world, filters.zone, filters.hubId)
      .filter((seed) => !filters.risk || Side().risk(seed.canonRisk) === Side().risk(filters.risk))
      .filter((seed) => !filters.tag || (seed.tags || []).includes(filters.tag));
  }

  function getSeed(seedId) {
    return Loader().getMapSeed(seedId);
  }

  function saveSeed(seedId) {
    const seed = getSeed(seedId);
    if (!seed) return;
    Side().saveCard({
      ...seed,
      id: `idea_${seed.id}`,
      mapSeedId: seed.id,
      type: 'map_seed',
      title: seed.name || seed.title
    }, { status: 'saved', source: 'map_seed_forge' });
  }

  return Object.freeze({
    getSeeds,
    getSeed,
    saveSeed
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignMapSeedForge = CampaignMapSeedForge;
