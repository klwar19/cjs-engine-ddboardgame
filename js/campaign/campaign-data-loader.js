// campaign-data-loader.js
// Small read-only facade over DataStore for Campaign Mode side content.

window.CJS = window.CJS || {};

window.CJS.CampaignDataLoader = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;

  function _currentWorld() {
    return CS().getState()?.currentWorld || CS().getCurrentCampaign()?.world || 'haven';
  }

  function _matchesWorld(record, worldId) {
    const world = worldId || _currentWorld();
    return !world || record.world === world || record._world === world;
  }

  function _matchesZone(record, zoneId) {
    return !zoneId || record.zone === zoneId || (record.tags || []).includes(zoneId);
  }

  function _matchesHub(record, hubId) {
    return !hubId || record.hubId === hubId || (record.aliases || []).includes(hubId);
  }

  function _byIdOrAlias(type, id) {
    if (!id) return null;
    const exact = DS().get(type, id);
    if (exact) return exact;
    return DS().getAllAsArray(type).find((record) => (record.aliases || []).includes(id)) || null;
  }

  function getSideContentPacks(worldId, zoneId, hubId) {
    return DS().getAllAsArray('sideContentPacks')
      .filter((pack) => _matchesWorld(pack, worldId) && _matchesZone(pack, zoneId) && _matchesHub(pack, hubId));
  }

  function getSideContentPack(worldId, zoneId, hubId) {
    const campaign = CS().getCurrentCampaign();
    const preferredIds = campaign?.sideContentPacks || [];
    for (const id of preferredIds) {
      const pack = _byIdOrAlias('sideContentPacks', id);
      if (pack && _matchesWorld(pack, worldId) && _matchesZone(pack, zoneId) && _matchesHub(pack, hubId)) return pack;
    }
    return getSideContentPacks(worldId, zoneId, hubId)[0] || null;
  }

  function getHubDefinition(hubId) {
    if (hubId) return _byIdOrAlias('campaignHubs', hubId);
    const campaign = CS().getCurrentCampaign();
    const preferred = campaign?.hubs?.[0];
    if (preferred) return _byIdOrAlias('campaignHubs', preferred);
    return DS().getAllAsArray('campaignHubs').find((hub) => _matchesWorld(hub)) || null;
  }

  function getQuestChainSets(worldId, zoneId, hubId) {
    return DS().getAllAsArray('questChains')
      .filter((set) => _matchesWorld(set, worldId) && _matchesZone(set, zoneId) && _matchesHub(set, hubId));
  }

  function getQuestChainTemplates(worldId, zoneId, hubId) {
    return getQuestChainSets(worldId, zoneId, hubId).flatMap((set) =>
      (set.chains || set.templates || []).map((chain) => ({
        ...chain,
        sourceSetId: set.id,
        world: chain.world || set.world,
        zone: chain.zone || set.zone,
        hubId: chain.hubId || set.hubId
      }))
    );
  }

  function getQuestChainTemplate(templateId) {
    return getQuestChainTemplates().find((chain) => chain.id === templateId) || null;
  }

  function getBattleSetCards(worldId, zoneId, hubId) {
    return DS().getAllAsArray('battleSets')
      .filter((set) => _matchesWorld(set, worldId) && _matchesZone(set, zoneId) && _matchesHub(set, hubId))
      .flatMap((set) => (set.cards || []).map((card) => ({ ...card, sourceSetId: set.id, world: card.world || set.world, zone: card.zone || set.zone, hubId: card.hubId || set.hubId })));
  }

  function getBattleSetCard(cardId) {
    return getBattleSetCards().find((card) => card.id === cardId) || null;
  }

  function getMapSeeds(worldId, zoneId, hubId) {
    return DS().getAllAsArray('mapSeeds')
      .filter((set) => _matchesWorld(set, worldId) && _matchesZone(set, zoneId) && _matchesHub(set, hubId))
      .flatMap((set) => (set.seeds || set.cards || []).map((seed) => ({ ...seed, sourceSetId: set.id, world: seed.world || set.world, zone: seed.zone || set.zone, hubId: seed.hubId || set.hubId })));
  }

  function getMapSeed(seedId) {
    return getMapSeeds().find((seed) => seed.id === seedId) || null;
  }

  function getOracleTables(worldId, zoneId, hubId) {
    return DS().getAllAsArray('oracleTables')
      .filter((table) => _matchesWorld(table, worldId) && _matchesZone(table, zoneId) && _matchesHub(table, hubId));
  }

  function getOracleTable(tableId) {
    if (tableId) return _byIdOrAlias('oracleTables', tableId);
    return getOracleTables()[0] || null;
  }

  function getStoryDirectorPacks(worldId, zoneId, hubId) {
    return DS().getAllAsArray('storyDirectorPacks')
      .filter((pack) => _matchesWorld(pack, worldId) && _matchesZone(pack, zoneId) && _matchesHub(pack, hubId));
  }

  function getStoryDirectorPack(packId, worldId, zoneId, hubId) {
    if (packId) return _byIdOrAlias('storyDirectorPacks', packId);
    const campaign = CS().getCurrentCampaign();
    const preferredIds = campaign?.storyDirectorPacks || [];
    for (const id of preferredIds) {
      const pack = _byIdOrAlias('storyDirectorPacks', id);
      if (pack && _matchesWorld(pack, worldId) && _matchesZone(pack, zoneId) && _matchesHub(pack, hubId)) return pack;
    }
    return getStoryDirectorPacks(worldId, zoneId, hubId)[0] || null;
  }

  return Object.freeze({
    getSideContentPacks,
    getSideContentPack,
    getHubDefinition,
    getQuestChainSets,
    getQuestChainTemplates,
    getQuestChainTemplate,
    getBattleSetCards,
    getBattleSetCard,
    getMapSeeds,
    getMapSeed,
    getOracleTables,
    getOracleTable,
    getStoryDirectorPacks,
    getStoryDirectorPack
  });
})();
