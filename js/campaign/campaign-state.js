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
    _state = normalizeSave(_state);
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
    return run ? getScenarioById(run.scenarioId) : null;
  }

  function getActiveMap() {
    const run = _state?.activeScenarioRun;
    if (!run) return null;
    if (run.proceduralMap) return run.proceduralMap;
    return getScenarioMapById(run.mapId);
  }

  function getScenarioById(scenarioId) {
    if (!scenarioId) return null;
    return _content.scenarios[scenarioId]
      || _state?.sideContent?.generatedScenarios?.[scenarioId]
      || null;
  }

  function getScenarioMapById(mapId) {
    if (!mapId) return null;
    return _content.scenarioMaps[mapId]
      || _state?.sideContent?.generatedMaps?.[mapId]
      || null;
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
        generatedScenarios: {},
        generatedMaps: {},
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
    const maxHp = F().calcMaxHP(stats, rank, _partyHpContext(base, charId));
    const maxMp = F().calcMaxMP(stats, rank);

    const PROG = (window.CJS.CONST?.PROGRESSION) || {};
    const initial = {
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
      learnedSkills: [],
      learnedPassives: [],
      allowedWeaponTypes: clone(base.allowedWeaponTypes || []),
      allowedArmorTypes: clone(base.allowedArmorTypes || []),
      statuses: [],
      buffs: [],
      injuries: [],
      rosterRole: 'active',
      availability: {
        status: 'available',
        reason: '',
        source: 'default',
        expires: null
      },
      equipment: clone(base.equipment || []),
      equipmentSlots: _equipmentSlotsFromList(base.equipment || []),
      notes: [],
      xp: 0,
      // Progression: per-skill AP/level + jobs
      skillProgress: _initialSkillProgress(base),
      currentJob: base.defaultJob || null,
      unlockedJobs: clone(base.availableJobs || (base.defaultJob ? [base.defaultJob] : [])),
      jobProgress: {},
      availableBranches: clone(base.availableBranches || []),
      baseAvailableJobs: clone(base.availableJobs || []),
      maxJobs: Number(base.maxJobs || PROG.maxJobsDefault || 3),
      weaponSlots: Number(base.weaponSlots || PROG.weaponSlotsDefault || 2)
    };
    if (initial.currentJob) {
      initial.jobProgress[initial.currentJob] = { xp: 0, level: 1 };
    }
    return initial;
  }

  // Build a baseline skillProgress map from the character's authored skill
  // list. Each skill starts at level 1 with 0 AP and is auto-extended later
  // when new skills are learned in campaign mode.
  function _initialSkillProgress(base = {}) {
    const out = {};
    for (const entry of base.skills || []) {
      const id = typeof entry === 'string' ? entry : entry?.skillId;
      const level = (entry && typeof entry === 'object' && entry.level) ? Number(entry.level || 1) : 1;
      if (id) out[id] = { ap: 0, level: Math.max(1, level) };
    }
    return out;
  }

  function _partyHpContext(base = {}, id = '') {
    return {
      team: base.team || 'player',
      type: base.type || 'humanoid',
      id: base.id || id,
      plotArmor: base.plotArmor !== false
    };
  }

  function _syncPartyMaxHp(id, member = {}) {
    const store = DS();
    if (!store?.get || !F()?.calcMaxHP || !F()?.calcMaxMP) return;
    const base = store.get('characters', member.baseCharacterId || id);
    if (!base) return;
    const stats = _partyStats(base, member);
    const rank = member.rank || base.rank || 'F';
    _syncResource(member, 'maxHp', 'currentHp', F().calcMaxHP(stats, rank, _partyHpContext(base, id)));
    _syncResource(member, 'maxMp', 'currentMp', F().calcMaxMP(stats, rank));
  }

  function _partyStats(base = {}, member = {}) {
    const stats = { ...(base.stats || {}) };
    const overrides = member.statOverrides || {};
    for (const [stat, amount] of Object.entries(overrides)) {
      stats[stat] = Number(stats[stat] || 0) + Number(amount || 0);
    }
    return stats;
  }

  function _syncResource(member, maxKey, currentKey, expectedMax) {
    const expected = Math.max(1, Number(expectedMax || 1));
    const priorMax = Number(member[maxKey] || 0);
    const priorCurrent = Number(member[currentKey] ?? (priorMax || expected));
    member[maxKey] = expected;
    if (!priorMax || priorCurrent >= priorMax) {
      member[currentKey] = expected;
    } else {
      member[currentKey] = Math.max(0, Math.min(expected, priorCurrent));
    }
  }

  function _normalizeEquipmentSlots(rawSlots, equipment = []) {
    const slots = {
      weapon: rawSlots?.weapon || null,
      armor: rawSlots?.armor || null,
      accessory1: rawSlots?.accessory1 || null,
      accessory2: rawSlots?.accessory2 || null
    };
    const used = new Set(Object.values(slots).filter(Boolean));
    for (const itemId of equipment || []) {
      if (!itemId || used.has(itemId)) continue;
      const item = DS().get('items', itemId);
      const kind = _equipmentKind(item);
      if (kind === 'weapon' && !slots.weapon) slots.weapon = itemId;
      else if (kind === 'armor' && !slots.armor) slots.armor = itemId;
      else if (kind === 'accessory' && !slots.accessory1) slots.accessory1 = itemId;
      else if (kind === 'accessory' && !slots.accessory2) slots.accessory2 = itemId;
      used.add(itemId);
    }
    return slots;
  }

  function _equipmentSlotsFromList(equipment = []) {
    return _normalizeEquipmentSlots({}, equipment);
  }

  function _equipmentListFromSlots(slots = {}) {
    return [slots.weapon, slots.armor, slots.accessory1, slots.accessory2].filter(Boolean);
  }

  function _equipmentKind(item = {}) {
    const slot = item?.slot || '';
    if (item?.equipmentCategory) return item.equipmentCategory;
    if (slot === 'weapon' || slot === 'offhand') return 'weapon';
    if (['armor', 'head', 'body', 'legs', 'feet'].includes(slot)) return 'armor';
    if (['accessory', 'accessory1', 'accessory2'].includes(slot)) return 'accessory';
    return '';
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
    next.sideContent.generatedScenarios = next.sideContent.generatedScenarios || {};
    next.sideContent.generatedMaps = next.sideContent.generatedMaps || {};
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
    for (const [id, member] of Object.entries(next.party || {})) {
      member.baseCharacterId = member.baseCharacterId || id;
      member.level = Number(member.level || 1);
      member.xp = Number(member.xp || 0);
      member.rosterRole = member.rosterRole === 'bench' || member.benched ? 'bench' : 'active';
      member.statuses = member.statuses || [];
      member.buffs = member.buffs || [];
      member.injuries = member.injuries || [];
      member.statOverrides = member.statOverrides || {};
      member.learnedSkills = Array.isArray(member.learnedSkills) ? member.learnedSkills.filter(Boolean) : [];
      member.learnedPassives = Array.isArray(member.learnedPassives) ? member.learnedPassives.filter(Boolean) : [];
      const base = DS().get('characters', member.baseCharacterId || id) || {};
      member.allowedWeaponTypes = Array.isArray(member.allowedWeaponTypes) ? member.allowedWeaponTypes : clone(base.allowedWeaponTypes || []);
      member.allowedArmorTypes = Array.isArray(member.allowedArmorTypes) ? member.allowedArmorTypes : clone(base.allowedArmorTypes || []);
      member.equipment = Array.isArray(member.equipment) ? member.equipment : clone(base.equipment || []);
      member.equipmentSlots = _normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
      member.equipment = _equipmentListFromSlots(member.equipmentSlots);
      member.notes = member.notes || [];
      member.availability = normalizeAvailability(member.availability, member);
      _normalizeProgression(member, base);
      _syncPartyMaxHp(id, member);
    }
    next.lastUpdated = next.lastUpdated || nowIso();
    return next;
  }

  function normalizeAvailability(raw = {}, member = {}) {
    const status = String(raw.status || raw.state || (member.available === false ? 'unavailable' : 'available')).toLowerCase();
    const valid = ['available', 'unavailable', 'busy', 'injured', 'story_locked'];
    return {
      status: valid.includes(status) ? status : 'available',
      reason: raw.reason || member.unavailableReason || '',
      source: raw.source || '',
      expires: raw.expires || null,
      updatedAt: raw.updatedAt || null
    };
  }

  // Backfill skillProgress / job fields onto a party member loaded from
  // an existing save (or freshly-recruited). Existing data is preserved;
  // only missing entries are added so old saves keep working.
  function _normalizeProgression(member, base = {}) {
    const PROG = (window.CJS.CONST?.PROGRESSION) || {};
    member.skillProgress = (member.skillProgress && typeof member.skillProgress === 'object')
      ? member.skillProgress
      : {};

    // Make sure every authored + learned skill has a progress entry.
    const known = new Set();
    for (const entry of base.skills || []) {
      const sid = typeof entry === 'string' ? entry : entry?.skillId;
      if (sid) known.add(sid);
    }
    for (const entry of member.learnedSkills || []) {
      const sid = typeof entry === 'string' ? entry : entry?.skillId;
      if (sid) known.add(sid);
    }
    for (const sid of known) {
      if (!member.skillProgress[sid]) {
        member.skillProgress[sid] = { ap: 0, level: 1 };
      } else {
        member.skillProgress[sid].ap = Number(member.skillProgress[sid].ap || 0);
        member.skillProgress[sid].level = Math.max(1, Number(member.skillProgress[sid].level || 1));
      }
    }

    // Branches / job allow-list / slot caps (from char base when missing)
    if (!Array.isArray(member.availableBranches)) {
      member.availableBranches = clone(base.availableBranches || []);
    }
    if (!Array.isArray(member.baseAvailableJobs)) {
      member.baseAvailableJobs = clone(base.availableJobs || []);
    }
    if (member.maxJobs == null) {
      member.maxJobs = Number(base.maxJobs || PROG.maxJobsDefault || 3);
    }
    if (member.weaponSlots == null) {
      member.weaponSlots = Number(base.weaponSlots || PROG.weaponSlotsDefault || 2);
    }

    // Job state
    if (!Array.isArray(member.unlockedJobs)) {
      member.unlockedJobs = clone(base.availableJobs || []);
    }
    if (member.currentJob === undefined) {
      member.currentJob = base.defaultJob || null;
      if (member.currentJob && !member.unlockedJobs.includes(member.currentJob)) {
        member.unlockedJobs.push(member.currentJob);
      }
    }
    if (!member.jobProgress || typeof member.jobProgress !== 'object') {
      member.jobProgress = {};
    }
    for (const jid of member.unlockedJobs) {
      if (!member.jobProgress[jid]) {
        member.jobProgress[jid] = { xp: 0, level: 1 };
      } else {
        member.jobProgress[jid].xp = Number(member.jobProgress[jid].xp || 0);
        member.jobProgress[jid].level = Math.max(1, Number(member.jobProgress[jid].level || 1));
      }
    }
    if (member.currentJob && !member.jobProgress[member.currentJob]) {
      member.jobProgress[member.currentJob] = { xp: 0, level: 1 };
    }
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

  function getGeneratedScenarios() {
    return Object.values(_state?.sideContent?.generatedScenarios || {});
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
    getScenarioById,
    getScenarioMapById,
    createNewSave,
    buildInitialSave,
    buildPartyMember,
    buildInitialHubState,
    normalizeAvailability,
    normalizeSave,
    syncPartyMember: _syncPartyMaxHp,
    snapshotState,
    getHubState,
    getActiveHubProblems,
    getNpcMood,
    getGeneratedIdeas,
    getSavedIdeas,
    getGeneratedScenarios,
    getActiveQuestChains,
    getSideContentHistory
  });
})();
