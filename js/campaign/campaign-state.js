// campaign-state.js
// Campaign save state, authored campaign content index, and pub/sub.

window.CJS = window.CJS || {};

window.CJS.CampaignState = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const F = () => window.CJS.Formulas;

  let _state = null;
  let _content = _emptyContent();
  let _listeners = [];

  function _emptyContent() {
    return {
      campaigns: {},
      scenarios: {},
      scenarioMaps: {},
      campaignEvents: {},
      campaignQuests: {},
      campaignProfiles: {},
      pocketHavenRules: {},
      sideContentPacks: {},
      campaignHubs: {},
      questChains: {},
      battleSets: {},
      mapSeeds: {},
      oracleTables: {},
      worlds: {}
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function loadContentFromDataStore() {
    _content = {
      campaigns: DS().getAll('campaigns'),
      scenarios: DS().getAll('scenarios'),
      scenarioMaps: DS().getAll('scenarioMaps'),
      campaignEvents: DS().getAll('campaignEvents'),
      campaignQuests: DS().getAll('campaignQuests'),
      campaignProfiles: DS().getAll('campaignProfiles'),
      pocketHavenRules: DS().getAll('pocketHavenRules'),
      sideContentPacks: DS().getAll('sideContentPacks'),
      campaignHubs: DS().getAll('campaignHubs'),
      questChains: DS().getAll('questChains'),
      battleSets: DS().getAll('battleSets'),
      mapSeeds: DS().getAll('mapSeeds'),
      oracleTables: DS().getAll('oracleTables'),
      worlds: DS().getAll('worlds')
    };
    return getContent();
  }

  function getContent() {
    return _content;
  }

  function getState() {
    return _state;
  }

  function setState(nextState, meta = {}) {
    _state = normalizeSave(nextState);
    _emit({ type: meta.type || 'replace', source: meta.source || 'state' });
    return _state;
  }

  function mutate(mutator, meta = {}) {
    if (!_state) return null;
    mutator(_state);
    _state.lastUpdated = nowIso();
    _emit({ type: meta.type || 'mutate', source: meta.source || 'unknown', detail: meta.detail || null });
    return _state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    _listeners.push(listener);
    return () => {
      _listeners = _listeners.filter((entry) => entry !== listener);
    };
  }

  function _emit(change) {
    for (const listener of _listeners) {
      try { listener(_state, change); }
      catch (error) { console.error('CampaignState listener error:', error); }
    }
  }

  function getCurrentCampaign() {
    return _state ? _content.campaigns[_state.campaignId] || null : null;
  }

  function getCurrentWorld() {
    return _state ? _content.worlds[_state.currentWorld] || null : null;
  }

  function getPhaseRule(type) {
    const campaign = getCurrentCampaign();
    const phaseType = type || _state?.phase?.type || campaign?.startPhase || 'town_phase';
    return (campaign?.phaseRules || []).find((rule) => rule.id === phaseType) || null;
  }

  function getActiveScenario() {
    const run = _state?.activeScenarioRun;
    return run ? _content.scenarios[run.scenarioId] || null : null;
  }

  function getActiveMap() {
    const run = _state?.activeScenarioRun;
    return run ? _content.scenarioMaps[run.mapId] || null : null;
  }

  function createNewSave(campaignId, options = {}) {
    const campaign = _content.campaigns[campaignId] || Object.values(_content.campaigns)[0];
    if (!campaign) throw new Error('No campaign definitions loaded.');

    const save = buildInitialSave(campaign, options);
    setState(save, { source: 'new_save', type: 'replace' });
    return save;
  }

  function buildInitialSave(campaign, options = {}) {
    const start = campaign.startingState || {};
    const phaseRule = (campaign.phaseRules || []).find((rule) => rule.id === campaign.startPhase) || campaign.phaseRules?.[0] || null;
    const party = {};

    for (const charId of start.party || []) {
      const member = buildPartyMember(charId);
      if (member) party[charId] = member;
    }

    const rule = Object.values(_content.pocketHavenRules)[0] || {};
    const plotCount = rule.farm?.startingPlots || 1;

    return normalizeSave({
      saveVersion: 1,
      saveId: options.saveId || `save_${Date.now()}`,
      slotName: options.slotName || `${campaign.name || campaign.id} ${new Date().toLocaleDateString()}`,
      campaignId: campaign.id,
      currentWorld: campaign.world,
      currentChapter: campaign.startChapter || 1,
      phase: {
        number: 1,
        type: phaseRule?.id || campaign.startPhase || 'town_phase',
        name: phaseRule?.name || 'Town Phase'
      },
      mode: campaign.defaultMode || 'soft_limit',
      currencies: { ...(start.currencies || {}) },
      party,
      inventory: {
        items: { ...(start.items || {}) },
        materials: { ...(start.materials || {}) },
        food: { ...(start.food || {}) },
        questItems: { ...(start.questItems || {}) },
        equipment: {}
      },
      quests: {},
      flags: {},
      activeScenarioRun: null,
      scenarioHistory: [],
      mapState: {},
      worldArchive: {},
      pocketHaven: {
        enabled: true,
        notes: [],
        farm: {
          plots: Array.from({ length: plotCount }, (_, index) => ({
            id: `plot_${index + 1}`,
            seedId: null,
            cropId: null,
            progress: 0,
            required: rule.farm?.defaultGrowthTicks || 3,
            ready: false
          }))
        },
        stations: clone(rule.stations || [])
      },
      hubState: buildInitialHubState(campaign),
      sideContent: {
        generatedIdeas: {},
        activeQuestChains: {},
        contentHistory: [],
        reviewQueue: [],
        importedPacks: {}
      },
      clocks: {},
      memoryShards: {},
      bonds: {},
      pinnedNotes: [],
      log: [],
      settings: {
        confirmPhasePass: false
      },
      createdAt: nowIso(),
      lastUpdated: nowIso()
    });
  }

  function buildPartyMember(charId) {
    const base = DS().get('characters', charId);
    if (!base) return null;
    const stats = { ...(base.stats || {}) };
    const rank = base.rank || 'F';
    const maxHp = F().calcMaxHP(stats, rank);
    const maxMp = F().calcMaxMP(stats, rank);

    return {
      baseCharacterId: charId,
      name: base.name || charId,
      icon: base.icon || '',
      portrait: base.portrait || '',
      level: 1,
      rank,
      maxHp,
      maxMp,
      currentHp: maxHp,
      currentMp: maxMp,
      statOverrides: {},
      statuses: [],
      buffs: [],
      injuries: [],
      equipment: clone(base.equipment || []),
      notes: [],
      xp: 0
    };
  }

  function buildInitialHubState(campaign) {
    const result = {};
    const hubIds = campaign.hubs || Object.values(_content.campaignHubs)
      .filter((hub) => hub.world === campaign.world || hub._world === campaign.world)
      .map((hub) => hub.id);

    for (const hubId of hubIds) {
      const hub = _content.campaignHubs[hubId];
      if (!hub) continue;
      const hubStats = {};
      for (const [stat, config] of Object.entries(hub.hubStats || {})) {
        hubStats[stat] = Number(config.default || 0);
      }
      const npcMoods = {};
      for (const npc of hub.npcs || []) {
        npcMoods[npc.id] = npc.defaultMood || 'neutral';
      }
      result[hubId] = {
        hubId,
        mood: hub.defaultMood || 'neutral',
        ...hubStats,
        activeProblems: [...(hub.startingProblems || [])],
        resolvedProblems: [],
        unlockedServices: (hub.locations || []).flatMap((loc) => loc.services || []),
        shopModifiers: {},
        npcMoods,
        rumors: [],
        eventCooldowns: {},
        notes: []
      };
    }
    return result;
  }

  function normalizeSave(save) {
    const next = clone(save || {});
    next.saveVersion = next.saveVersion || 1;
    next.saveId = next.saveId || `save_${Date.now()}`;
    next.slotName = next.slotName || 'Campaign Save';
    next.currentChapter = next.currentChapter || 1;
    next.phase = next.phase || { number: 1, type: 'town_phase', name: 'Town Phase' };
    next.currencies = next.currencies || {};
    next.party = next.party || {};
    next.inventory = next.inventory || {};
    next.inventory.items = next.inventory.items || {};
    next.inventory.materials = next.inventory.materials || {};
    next.inventory.food = next.inventory.food || {};
    next.inventory.questItems = next.inventory.questItems || {};
    next.inventory.equipment = next.inventory.equipment || {};
    next.quests = next.quests || {};
    next.flags = next.flags || {};
    next.scenarioHistory = next.scenarioHistory || [];
    next.mapState = next.mapState || {};
    next.worldArchive = next.worldArchive || {};
    next.hubState = next.hubState || {};
    const campaign = _content.campaigns[next.campaignId];
    if (campaign) {
      const hubDefaults = buildInitialHubState(campaign);
      for (const [hubId, hubState] of Object.entries(hubDefaults)) {
        next.hubState[hubId] = {
          ...hubState,
          ...(next.hubState[hubId] || {}),
          npcMoods: { ...(hubState.npcMoods || {}), ...(next.hubState[hubId]?.npcMoods || {}) },
          activeProblems: next.hubState[hubId]?.activeProblems || hubState.activeProblems || [],
          resolvedProblems: next.hubState[hubId]?.resolvedProblems || [],
          unlockedServices: next.hubState[hubId]?.unlockedServices || hubState.unlockedServices || [],
          rumors: next.hubState[hubId]?.rumors || [],
          eventCooldowns: next.hubState[hubId]?.eventCooldowns || {},
          notes: next.hubState[hubId]?.notes || []
        };
      }
    }
    next.sideContent = next.sideContent || {};
    next.sideContent.generatedIdeas = next.sideContent.generatedIdeas || {};
    next.sideContent.activeQuestChains = next.sideContent.activeQuestChains || {};
    next.sideContent.contentHistory = next.sideContent.contentHistory || [];
    next.sideContent.reviewQueue = next.sideContent.reviewQueue || [];
    next.sideContent.importedPacks = next.sideContent.importedPacks || {};
    next.clocks = next.clocks || {};
    next.memoryShards = next.memoryShards || {};
    next.bonds = next.bonds || {};
    next.reputation = next.reputation || {};
    next.unlockedRecipes = next.unlockedRecipes || {};
    next.pocketHaven = next.pocketHaven || { enabled: true, notes: [], farm: { plots: [] }, stations: [] };
    next.pocketHaven.notes = next.pocketHaven.notes || [];
    next.pocketHaven.farm = next.pocketHaven.farm || { plots: [] };
    next.pocketHaven.farm.plots = next.pocketHaven.farm.plots || [];
    next.pocketHaven.stations = next.pocketHaven.stations || [];
    next.pinnedNotes = next.pinnedNotes || [];
    next.log = next.log || [];
    next.settings = next.settings || {};
    next.lastUpdated = next.lastUpdated || nowIso();
    return next;
  }

  function snapshotState() {
    return clone(_state);
  }

  function getHubState(hubId) {
    return _state?.hubState?.[hubId] || null;
  }

  function getActiveHubProblems(hubId) {
    return getHubState(hubId)?.activeProblems || [];
  }

  function getNpcMood(hubId, npcId) {
    return getHubState(hubId)?.npcMoods?.[npcId] || null;
  }

  function getGeneratedIdeas() {
    return Object.values(_state?.sideContent?.generatedIdeas || {});
  }

  function getSavedIdeas() {
    return getGeneratedIdeas().filter((idea) => idea.status === 'saved');
  }

  function getActiveQuestChains() {
    return Object.values(_state?.sideContent?.activeQuestChains || {});
  }

  function getSideContentHistory() {
    return _state?.sideContent?.contentHistory || [];
  }

  return Object.freeze({
    clone,
    nowIso,
    loadContentFromDataStore,
    getContent,
    getState,
    setState,
    mutate,
    subscribe,
    getCurrentCampaign,
    getCurrentWorld,
    getPhaseRule,
    getActiveScenario,
    getActiveMap,
    createNewSave,
    buildInitialSave,
    buildPartyMember,
    buildInitialHubState,
    normalizeSave,
    snapshotState,
    getHubState,
    getActiveHubProblems,
    getNpcMood,
    getGeneratedIdeas,
    getSavedIdeas,
    getActiveQuestChains,
    getSideContentHistory
  });
})();
