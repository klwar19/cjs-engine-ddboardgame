// campaign-map-seed-forge.js
// Node-map seed lookup and idea helpers.

window.CJS = window.CJS || {};

window.CJS.CampaignMapSeedForge = (() => {
  'use strict';

  const Loader = () => window.CJS.CampaignDataLoader;
  const Side = () => window.CJS.CampaignSideContent;

  function getSeeds(filters = {}) {
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
