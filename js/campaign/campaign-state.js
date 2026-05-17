// campaign-state.js
// Campaign save state, authored campaign content index, and pub/sub.

window.CJS = window.CJS || {};

window.CJS.CampaignState = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const F = () => window.CJS.Formulas;
  const PS = () => window.CJS.PersonaService;

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
      storyDirectorPacks: {},
      stories: {},
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
      storyDirectorPacks: DS().getAll('storyDirectorPacks'),
      stories: DS().getAll('stories'),
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
      tagLedger: {
        entries: {}
      },
      questPulse: {
        recent: [],
        settings: {
          autoApplyCombat: true
        }
      },
      legacy: {
        traits: {},
        majorChoices: [],
        unlockedEchoes: []
      },
      activeScenarioRun: null,
      scenarioHistory: [],
      mapState: {},
      worldArchive: {},
      pocketHaven: {
        enabled: true,
        notes: [],
        incomeNodes: {},
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
      storyChoices: [],
      clocks: {},
      memoryShards: {},
      bonds: {},
      // Relationship "Activity" budget — small per-phase pool that lets
      // the player spend a turn doing something casual with a companion
      // (hang out, train, listen, help, compete). Resets on phase pass.
      // Future: extend with theme-specific activities, scene unlocks,
      // and persona-gated options.
      relationshipActs: {
        remaining: 3,
        max: 3,
        lastResetPhase: 1,
        history: []
      },
      storyDirector: {
        mode: 'solo_gm',
        activeStageId: null,
        storyQueue: {},
        clueLedger: {},
        revealedFacts: {},
        threadStatus: {},
        metrics: {},
        lastBeatIds: [],
        sideQuestSync: {}
      },
      storyMode: {
        currentArcId: null,
        currentChapterId: null,
        currentChapterLabel: null,
        currentChapterOrderKey: null,
        currentPartId: null,
        completedParts: {},
        defaultedParts: {},
        revealedChapters: {},
        partResults: {},
        manualSummaryEntries: []
      },
      sequenceRuntime: {
        active: null,
        history: []
      },
      eventLog: {
        entries: []
      },
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
      // Ultimate meter persists across battles via campaign state.
      // Combat startup hydrates compiled unit ultimateMeter from this; battle
      // end writes back into state.party[id].ultimateMeter.
      ultimateMeter: 0,
      ultimateMax: Number(base.ultimateMax || 100),
      ultimateSkillId: base.ultimateSkillId || null,
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
      passiveProgress: _initialPassiveProgress(base),
      currentJob: base.defaultJob || null,
      unlockedJobs: clone(base.availableJobs || (base.defaultJob ? [base.defaultJob] : [])),
      jobProgress: {},
      availableBranches: clone(base.availableBranches || []),
      baseAvailableJobs: clone(base.availableJobs || []),
      maxJobs: Number(base.maxJobs || PROG.maxJobsDefault || 3),
      weaponSlots: Number(base.weaponSlots || PROG.weaponSlotsDefault || 2),
      // Skill / passive selection budgets — auto-filled below.
      skillSlots:    Number(base.skillSlots ?? PROG.defaultSkillSlots ?? 4),
      passiveSlots:  Number(base.passiveSlots ?? PROG.defaultPassiveSlots ?? 3),
      skillPoints:   Number(base.skillPoints ?? PROG.defaultSkillPoints ?? 4),
      passivePoints: Number(base.passivePoints ?? PROG.defaultPassivePoints ?? 3),
      equippedSkills: [],
      equippedPassives: [],
      // Personas: world-specific skins. activePersona seeds the loadout for
      // this member; personaProgress stores per-persona saved loadouts so
      // switching between personas preserves each persona's progression.
      activePersona: null,
      unlockedPersonas: [],
      personaProgress: {}
    };
    if (initial.currentJob) {
      initial.jobProgress[initial.currentJob] = { xp: 0, level: 1 };
      _persistJobGrants(initial, base, initial.currentJob);
    }
    // Auto-fill the equipped sets so a freshly recruited member is combat-ready.
    _autoFillEquipped(initial, base);
    return initial;
  }

  // Greedy fill of equippedSkills / equippedPassives from the member's pool
  // so brand-new members and legacy saves enter combat with sensible loadouts.
  // Stops adding when either the slot cap or the SP budget is reached.
  function _autoFillEquipped(member, base, persona = null) {
    const F = window.CJS.Formulas;
    if (!F) return;
    const slotCapSkills   = F.calcEffectiveSkillSlots ? F.calcEffectiveSkillSlots(member, base) : (member.skillSlots || 4);
    const slotCapPassives = F.calcEffectivePassiveSlots ? F.calcEffectivePassiveSlots(member, base) : (member.passiveSlots || 3);
    const spCapSkills     = F.calcEffectiveSkillPoints ? F.calcEffectiveSkillPoints(member, base) : (member.skillPoints || 4);
    const spCapPassives   = F.calcEffectivePassivePoints ? F.calcEffectivePassivePoints(member, base) : (member.passivePoints || 3);

    if (!Array.isArray(member.equippedSkills) || !member.equippedSkills.length) {
      const pool = _skillPoolIds(member, base, persona);
      member.equippedSkills = _greedyFill(pool, 'skills', slotCapSkills, spCapSkills, F);
    }
    if (!Array.isArray(member.equippedPassives) || !member.equippedPassives.length) {
      const pool = _passivePoolIds(member, base, persona);
      member.equippedPassives = _greedyFill(pool, 'passives', slotCapPassives, spCapPassives, F);
    }
  }

  function _greedyFill(poolIds, type, slotCap, spCap, F) {
    const out = [];
    let used = 0;
    for (const id of poolIds) {
      if (out.length >= slotCap) break;
      const rec = DS().get(type, id);
      const cost = rec ? (F?.calcSpCost ? F.calcSpCost(rec) : 1) : 1;
      if (used + cost > spCap) continue;
      out.push(id);
      used += cost;
    }
    return out;
  }

  function _activePersonaForPool(member = {}, persona = null) {
    if (persona) return persona;
    if (member.activePersona && PS()) return PS().getPersona(member.activePersona);
    return null;
  }

  function _skillPoolIds(member = {}, base = {}, persona = null) {
    const activePersona = _activePersonaForPool(member, persona);
    const ids = new Set();
    const authoredSkills = activePersona && Array.isArray(activePersona.skills)
      ? activePersona.skills
      : (base.skills || []);
    for (const e of authoredSkills) {
      const id = typeof e === 'string' ? e : e?.skillId;
      if (id) ids.add(id);
    }
    for (const e of member.learnedSkills || []) {
      const id = typeof e === 'string' ? e : e?.skillId;
      if (id) ids.add(id);
    }
    // Job-granted skills
    if (member.currentJob && window.CJS.Formulas?.collectJobGrants) {
      const job = DS().get('jobs', member.currentJob);
      const lvl = Math.max(1, Number(member.jobProgress?.[member.currentJob]?.level || 1));
      const grants = window.CJS.Formulas.collectJobGrants(job || {}, lvl);
      for (const id of grants.skills || []) ids.add(id);
    }
    return Array.from(ids);
  }

  function _passivePoolIds(member = {}, base = {}, persona = null) {
    const activePersona = _activePersonaForPool(member, persona);
    const ids = new Set();
    const authoredPassives = activePersona && Array.isArray(activePersona.innatePassives)
      ? activePersona.innatePassives
      : (base.innatePassives || []);
    for (const id of authoredPassives) if (id) ids.add(id);
    for (const id of member.learnedPassives || []) if (id) ids.add(id);
    if (member.currentJob && window.CJS.Formulas?.collectJobGrants) {
      const job = DS().get('jobs', member.currentJob);
      const lvl = Math.max(1, Number(member.jobProgress?.[member.currentJob]?.level || 1));
      const grants = window.CJS.Formulas.collectJobGrants(job || {}, lvl);
      for (const id of grants.passives || []) ids.add(id);
    }
    return Array.from(ids);
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

  function _initialPassiveProgress(base = {}) {
    const out = {};
    for (const id of base.innatePassives || []) {
      if (id) out[id] = { rank: 1 };
    }
    return out;
  }

  function _ensureSkillProgress(member, skillId, level = 1) {
    if (!skillId) return;
    member.skillProgress = member.skillProgress || {};
    if (!member.skillProgress[skillId]) {
      member.skillProgress[skillId] = { ap: 0, level: Math.max(1, Number(level || 1)) };
    } else {
      member.skillProgress[skillId].ap = Number(member.skillProgress[skillId].ap || 0);
      member.skillProgress[skillId].level = Math.max(1, Number(member.skillProgress[skillId].level || level || 1));
    }
  }

  function _ensurePassiveProgress(member, passiveId, rank = 1) {
    if (!passiveId) return;
    member.passiveProgress = member.passiveProgress || {};
    if (!member.passiveProgress[passiveId]) {
      member.passiveProgress[passiveId] = { rank: Math.max(1, Number(rank || 1)) };
    } else {
      member.passiveProgress[passiveId].rank = Math.max(1, Number(member.passiveProgress[passiveId].rank || rank || 1));
    }
  }

  function _persistJobGrants(member, base = {}, jobId) {
    if (!member || !jobId || !window.CJS.Formulas?.collectJobGrants) return;
    const job = DS().get('jobs', jobId);
    const level = Math.max(1, Number(member.jobProgress?.[jobId]?.level || 1));
    const grants = window.CJS.Formulas.collectJobGrants(job || {}, level);

    member.learnedSkills = Array.isArray(member.learnedSkills) ? member.learnedSkills : [];
    const baseSkillIds = new Set((base.skills || []).map((entry) => typeof entry === 'string' ? entry : entry?.skillId).filter(Boolean));
    const learnedSkillIds = new Set(member.learnedSkills.map((entry) => typeof entry === 'string' ? entry : entry?.skillId).filter(Boolean));
    for (const sid of grants.skills || []) {
      if (!sid) continue;
      if (!baseSkillIds.has(sid) && !learnedSkillIds.has(sid)) {
        member.learnedSkills.push({ skillId: sid, level: 1, source: `job:${jobId}` });
        learnedSkillIds.add(sid);
      }
      _ensureSkillProgress(member, sid, 1);
    }

    member.learnedPassives = Array.isArray(member.learnedPassives) ? member.learnedPassives : [];
    const passiveIds = new Set([...(base.innatePassives || []), ...member.learnedPassives].filter(Boolean));
    for (const pid of grants.passives || []) {
      if (!pid) continue;
      if (!passiveIds.has(pid)) {
        member.learnedPassives.push(pid);
        passiveIds.add(pid);
      }
      _ensurePassiveProgress(member, pid, 1);
    }
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
    next.tagLedger = next.tagLedger || {};
    next.tagLedger.entries = next.tagLedger.entries || {};
    next.questPulse = next.questPulse || {};
    next.questPulse.recent = next.questPulse.recent || [];
    next.questPulse.settings = {
      autoApplyCombat: true,
      ...(next.questPulse.settings || {})
    };
    next.legacy = next.legacy || {};
    next.legacy.traits = next.legacy.traits || {};
    next.legacy.majorChoices = next.legacy.majorChoices || [];
    next.legacy.unlockedEchoes = next.legacy.unlockedEchoes || [];
    next.scenarioHistory = next.scenarioHistory || [];
    next.mapState = next.mapState || {};
    for (const map of Object.values(next.mapState)) {
      map.visited = map.visited || {};
      map.revealed = map.revealed || {};
      map.locked = map.locked || {};
      map.cleared = map.cleared || {};
      map.notes = map.notes || {};
      map.entryResolved = map.entryResolved || {};
      map.captured = map.captured || {};
      map.campfires = map.campfires || {};
    }
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
    next.relationshipActs = next.relationshipActs || {};
    next.relationshipActs.remaining = Number.isFinite(next.relationshipActs.remaining)
      ? next.relationshipActs.remaining : 3;
    next.relationshipActs.max = Number.isFinite(next.relationshipActs.max)
      ? next.relationshipActs.max : 3;
    next.relationshipActs.lastResetPhase = Number.isFinite(next.relationshipActs.lastResetPhase)
      ? next.relationshipActs.lastResetPhase : (next.phase?.number || 1);
    next.relationshipActs.history = Array.isArray(next.relationshipActs.history)
      ? next.relationshipActs.history : [];
    next.storyDirector = next.storyDirector || {};
    next.storyDirector.mode = next.storyDirector.mode || 'solo_gm';
    next.storyDirector.activeStageId = next.storyDirector.activeStageId || null;
    next.storyDirector.storyQueue = next.storyDirector.storyQueue || {};
    next.storyDirector.clueLedger = next.storyDirector.clueLedger || {};
    next.storyDirector.revealedFacts = next.storyDirector.revealedFacts || {};
    next.storyDirector.threadStatus = next.storyDirector.threadStatus || {};
    next.storyDirector.metrics = next.storyDirector.metrics || {};
    next.storyDirector.lastBeatIds = next.storyDirector.lastBeatIds || [];
    next.storyDirector.sideQuestSync = next.storyDirector.sideQuestSync || {};
    next.storyMode = next.storyMode || {};
    next.storyMode.currentArcId = next.storyMode.currentArcId || null;
    next.storyMode.currentChapterId = next.storyMode.currentChapterId || null;
    next.storyMode.currentChapterLabel = next.storyMode.currentChapterLabel || null;
    next.storyMode.currentChapterOrderKey = next.storyMode.currentChapterOrderKey || null;
    next.storyMode.currentPartId = next.storyMode.currentPartId || null;
    next.storyMode.completedParts = next.storyMode.completedParts || {};
    next.storyMode.defaultedParts = next.storyMode.defaultedParts || {};
    next.storyMode.revealedChapters = next.storyMode.revealedChapters || {};
    next.storyMode.partResults = next.storyMode.partResults || {};
    next.storyMode.manualSummaryEntries = Array.isArray(next.storyMode.manualSummaryEntries) ? next.storyMode.manualSummaryEntries : [];
    next.sequenceRuntime = next.sequenceRuntime || {};
    next.sequenceRuntime.active = next.sequenceRuntime.active || null;
    next.sequenceRuntime.history = Array.isArray(next.sequenceRuntime.history) ? next.sequenceRuntime.history : [];
    next.eventLog = next.eventLog || {};
    next.eventLog.entries = Array.isArray(next.eventLog.entries) ? next.eventLog.entries : [];
    next.reputation = next.reputation || {};
    next.unlockedRecipes = next.unlockedRecipes || {};
    next.pocketHaven = next.pocketHaven || { enabled: true, notes: [], incomeNodes: {}, farm: { plots: [] }, stations: [] };
    next.pocketHaven.notes = next.pocketHaven.notes || [];
    if (Array.isArray(next.pocketHaven.incomeNodes)) {
      next.pocketHaven.incomeNodes = Object.fromEntries(next.pocketHaven.incomeNodes.map((entry) => [entry.id || `${entry.mapId || 'map'}:${entry.nodeId || Date.now()}`, entry]));
    } else {
      next.pocketHaven.incomeNodes = next.pocketHaven.incomeNodes || {};
    }
    next.pocketHaven.farm = next.pocketHaven.farm || { plots: [] };
    next.pocketHaven.farm.plots = next.pocketHaven.farm.plots || [];
    if (window.CJS.FarmingMode?.normalizeFarm) {
      const rule = Object.values(_content.pocketHavenRules || {})[0] || {};
      next.pocketHaven.farm = window.CJS.FarmingMode.normalizeFarm(next.pocketHaven.farm, {
        rule,
        world: next.currentWorld
      });
    }
    next.pocketHaven.stations = next.pocketHaven.stations || [];
    next.storyChoices = Array.isArray(next.storyChoices) ? next.storyChoices : [];
    if (next.activeScenarioRun) {
      next.activeScenarioRun.completedBeats = next.activeScenarioRun.completedBeats || [];
      next.activeScenarioRun.completedBattles = next.activeScenarioRun.completedBattles || [];
      next.activeScenarioRun.notes = next.activeScenarioRun.notes || [];
      next.activeScenarioRun.pendingNodeEntry = next.activeScenarioRun.pendingNodeEntry || null;
      next.activeScenarioRun.objectiveState = next.activeScenarioRun.objectiveState || null;
      next.activeScenarioRun.progressTriggerState = next.activeScenarioRun.progressTriggerState || {};
      next.activeScenarioRun.sequenceLink = next.activeScenarioRun.sequenceLink || null;
    }
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
      // Refresh portrait & icon from the base character so older saves (or saves
      // taken before a portrait was published) pick up the latest art automatically.
      if (!member.portrait && base.portrait) member.portrait = base.portrait;
      if (!member.icon && base.icon) member.icon = base.icon;
      if (!member.name && base.name) member.name = base.name;
      member.allowedWeaponTypes = Array.isArray(member.allowedWeaponTypes) ? member.allowedWeaponTypes : clone(base.allowedWeaponTypes || []);
      member.allowedArmorTypes = Array.isArray(member.allowedArmorTypes) ? member.allowedArmorTypes : clone(base.allowedArmorTypes || []);
      member.equipment = Array.isArray(member.equipment) ? member.equipment : clone(base.equipment || []);
      member.equipmentSlots = _normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
      member.equipment = _equipmentListFromSlots(member.equipmentSlots);
      member.notes = member.notes || [];
      member.availability = normalizeAvailability(member.availability, member);
      _normalizeProgression(member, base);
      _normalizePersona(member, base, next);
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
    member.passiveProgress = (member.passiveProgress && typeof member.passiveProgress === 'object')
      ? member.passiveProgress
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
      _ensureSkillProgress(member, sid, 1);
    }

    const knownPassives = new Set([...(base.innatePassives || []), ...(member.learnedPassives || [])].filter(Boolean));
    for (const pid of knownPassives) {
      _ensurePassiveProgress(member, pid, 1);
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
    _persistJobGrants(member, base, member.currentJob);

    // SP / slot budgets — fall back to base char's authored values, then to
    // PROGRESSION defaults. Re-compute on every load so editing the base
    // values pushes through to existing saves automatically.
    if (member.skillSlots == null)    member.skillSlots    = Number(base.skillSlots    ?? PROG.defaultSkillSlots    ?? 4);
    if (member.passiveSlots == null)  member.passiveSlots  = Number(base.passiveSlots  ?? PROG.defaultPassiveSlots  ?? 3);
    if (member.skillPoints == null)   member.skillPoints   = Number(base.skillPoints   ?? PROG.defaultSkillPoints   ?? 4);
    if (member.passivePoints == null) member.passivePoints = Number(base.passivePoints ?? PROG.defaultPassivePoints ?? 3);

    // Equipped sets: drop ids that are no longer in the pool. If the field
    // was missing entirely (legacy save), auto-fill from the pool so the
    // member is combat-ready out of the gate. If the player previously
    // chose an empty list, that empty list is respected.
    const activePersona = _activePersonaForPool(member);
    const skillPool = new Set(_skillPoolIds(member, base, activePersona));
    const skillsMissing = !Array.isArray(member.equippedSkills);
    member.equippedSkills = (Array.isArray(member.equippedSkills) ? member.equippedSkills : [])
      .filter((id) => id && skillPool.has(id));

    const passivePool = new Set(_passivePoolIds(member, base, activePersona));
    const passivesMissing = !Array.isArray(member.equippedPassives);
    member.equippedPassives = (Array.isArray(member.equippedPassives) ? member.equippedPassives : [])
      .filter((id) => id && passivePool.has(id));

    if (skillsMissing || passivesMissing) {
      // Only auto-fill the side(s) that were missing.
      const before = {
        equippedSkills: skillsMissing ? null : member.equippedSkills,
        equippedPassives: passivesMissing ? null : member.equippedPassives
      };
      if (skillsMissing) member.equippedSkills = [];
      if (passivesMissing) member.equippedPassives = [];
      _autoFillEquipped(member, base, activePersona);
      // Restore any side that was already explicitly authored (untouched).
      if (before.equippedSkills) member.equippedSkills = before.equippedSkills;
      if (before.equippedPassives) member.equippedPassives = before.equippedPassives;
    }
  }

  // ── Persona normalization ────────────────────────────────────────
  // Backfills persona fields on save load: ensures unlockedPersonas,
  // personaProgress, activePersona are all valid. If a member has no
  // active persona but personas exist for their base character in the
  // current world, the first qualifying default-unlocked persona is
  // auto-activated and seeded so existing characters smoothly adopt
  // a Haven/Zombie/etc. skin without breaking older saves.
  function _normalizePersona(member, base = {}, save = {}) {
    if (!PS()) return;
    const charId = member.baseCharacterId || base.id;
    const allPersonas = PS().personasForCharacter(charId);
    if (!allPersonas.length) {
      // No personas authored for this character. Keep fields tidy but inert.
      member.activePersona = member.activePersona || null;
      member.unlockedPersonas = Array.isArray(member.unlockedPersonas) ? member.unlockedPersonas : [];
      member.personaProgress = (member.personaProgress && typeof member.personaProgress === 'object') ? member.personaProgress : {};
      return;
    }
    if (!Array.isArray(member.unlockedPersonas)) member.unlockedPersonas = [];
    if (!member.personaProgress || typeof member.personaProgress !== 'object') member.personaProgress = {};

    // Refresh unlocks from the current save state. Conditions that are now
    // satisfied (phase, chapter, flag) auto-add personas; previously unlocked
    // personas stay unlocked (`evaluateUnlocks` seeds from existing list).
    const evaluated = PS().evaluateUnlocks(member, save);
    member.unlockedPersonas = Array.from(new Set([...member.unlockedPersonas, ...evaluated]));

    // If there's no active persona, pick a sensible default: a persona whose
    // world matches the save's currentWorld and is unlocked.
    const currentWorld = save.currentWorld || '';
    if (!member.activePersona) {
      const preferred = allPersonas.find((p) => p.world === currentWorld && member.unlockedPersonas.includes(p.id))
                     || allPersonas.find((p) => member.unlockedPersonas.includes(p.id));
      if (preferred) {
        const seeded = PS().seedLoadoutFromPersona(preferred, base);
        // Inherit member's existing live progression as the persona's initial
        // captured snapshot, so legacy saves don't lose their job/skill state.
        const existing = PS().captureLoadoutFromMember(member);
        member.personaProgress._legacy = member.personaProgress._legacy || existing;
        member.personaProgress[preferred.id] = _mergePersonaSeedWithExisting(seeded, existing);
        PS().applyLoadoutToMember(member, member.personaProgress[preferred.id], preferred, base);
        _syncEquipmentSlots(member);
        if (member.currentJob) _persistJobGrants(member, base, member.currentJob);
        _autoFillEquipped(member, base, preferred);
        _syncPartyMaxHp(charId, member);
      }
    }

    // Make sure every unlocked persona has a progress slot. We seed missing
    // ones from the persona template so the player can switch in cleanly.
    for (const pid of member.unlockedPersonas) {
      if (member.personaProgress[pid]) continue;
      const persona = PS().getPersona(pid);
      if (!persona) continue;
      member.personaProgress[pid] = PS().seedLoadoutFromPersona(persona, base);
    }
  }

  // Public helpers for ops:
  //
  //   PersonaService is the runtime brain; CampaignState exposes a switch
  //   helper that updates the live member fields and the persona progress
  //   slots in one step. This lives here (not in PersonaService) because it
  //   needs to call into the same auto-fill / progression normalization the
  //   roster relies on.
  function switchPersona(member, nextPersonaId, save) {
    if (!member || !PS()) return false;
    const base = DS().get('characters', member.baseCharacterId || member.id) || {};
    const persona = PS().getPersona(nextPersonaId);

    // Capture the live loadout under the OUTGOING persona (or _legacy for
    // members that never activated a persona).
    const outgoingId = member.activePersona || '_legacy';
    member.personaProgress = member.personaProgress || {};
    member.personaProgress[outgoingId] = PS().captureLoadoutFromMember(member);

    if (!nextPersonaId) {
      const slot = member.personaProgress._legacy || _baseLoadoutFromCharacter(base);
      PS().applyLoadoutToMember(member, slot, null, base);
      member.activePersona = null;
      member.personaIcon = '';
      member.personaPortrait = '';
      _syncEquipmentSlots(member);
      if (member.currentJob) _persistJobGrants(member, base, member.currentJob);
      if ((member.equippedSkills || []).length === 0 || (member.equippedPassives || []).length === 0) {
        _autoFillEquipped(member, base, null);
      }
      _syncPartyMaxHp(member.baseCharacterId || base.id, member);
      return true;
    }

    if (!persona) return false;

    // Activate the new persona — restore saved slot, or seed from template.
    const slot = member.personaProgress[nextPersonaId] || PS().seedLoadoutFromPersona(persona, base);
    PS().applyLoadoutToMember(member, slot, persona, base);
    _syncEquipmentSlots(member);

    // Re-merge job grants + auto-fill if needed.
    if (member.currentJob) _persistJobGrants(member, base, member.currentJob);
    if ((member.equippedSkills || []).length === 0 || (member.equippedPassives || []).length === 0) {
      _autoFillEquipped(member, base, persona);
    }
    _syncPartyMaxHp(member.baseCharacterId || base.id, member);
    return true;
  }

  function _mergePersonaSeedWithExisting(seeded = {}, existing = {}) {
    const statOverrides = { ...(seeded.statOverrides || {}) };
    for (const [stat, value] of Object.entries(existing.statOverrides || {})) {
      statOverrides[stat] = Number(statOverrides[stat] || 0) + Number(value || 0);
    }
    const seededEquipment = Array.isArray(seeded.equipment) ? seeded.equipment.filter(Boolean) : [];
    const existingEquipment = Array.isArray(existing.equipment) ? existing.equipment.filter(Boolean) : [];
    const seededWeaponTypes = Array.isArray(seeded.allowedWeaponTypes) ? seeded.allowedWeaponTypes.filter(Boolean) : [];
    const existingWeaponTypes = Array.isArray(existing.allowedWeaponTypes) ? existing.allowedWeaponTypes.filter(Boolean) : [];
    const seededArmorTypes = Array.isArray(seeded.allowedArmorTypes) ? seeded.allowedArmorTypes.filter(Boolean) : [];
    const existingArmorTypes = Array.isArray(existing.allowedArmorTypes) ? existing.allowedArmorTypes.filter(Boolean) : [];
    return {
      ...seeded,
      currentJob: seeded.currentJob || existing.currentJob || null,
      jobProgress: { ...(seeded.jobProgress || {}), ...(existing.jobProgress || {}) },
      learnedSkills: clone(existing.learnedSkills || []),
      learnedPassives: clone(existing.learnedPassives || []),
      statOverrides,
      equipment: clone(seededEquipment.length ? seededEquipment : existingEquipment),
      equipmentSlots: clone(seededEquipment.length ? (seeded.equipmentSlots || {}) : (existing.equipmentSlots || seeded.equipmentSlots || {})),
      equippedSkills: clone(seeded.equippedSkills || []),
      equippedPassives: clone(seeded.equippedPassives || []),
      allowedWeaponTypes: clone(seededWeaponTypes.length ? seededWeaponTypes : existingWeaponTypes),
      allowedArmorTypes: clone(seededArmorTypes.length ? seededArmorTypes : existingArmorTypes),
      skillProgress: { ...(seeded.skillProgress || {}), ...(existing.skillProgress || {}) },
      passiveProgress: { ...(seeded.passiveProgress || {}), ...(existing.passiveProgress || {}) }
    };
  }

  function _syncEquipmentSlots(member = {}) {
    member.equipmentSlots = _normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    member.equipment = _equipmentListFromSlots(member.equipmentSlots);
  }

  function _baseLoadoutFromCharacter(base = {}) {
    const PROG = window.CJS.CONST?.PROGRESSION || {};
    const currentJob = base.defaultJob || null;
    const jobProgress = {};
    for (const jid of base.availableJobs || (currentJob ? [currentJob] : [])) {
      jobProgress[jid] = { xp: 0, level: 1 };
    }
    if (currentJob && !jobProgress[currentJob]) jobProgress[currentJob] = { xp: 0, level: 1 };
    return {
      currentJob,
      jobProgress,
      learnedSkills: [],
      learnedPassives: [],
      statOverrides: {},
      equipment: clone(base.equipment || []),
      equipmentSlots: _equipmentSlotsFromList(base.equipment || []),
      equippedSkills: [],
      equippedPassives: [],
      allowedWeaponTypes: clone(base.allowedWeaponTypes || []),
      allowedArmorTypes: clone(base.allowedArmorTypes || []),
      skillProgress: _initialSkillProgress(base),
      passiveProgress: _initialPassiveProgress(base),
      skillSlots: Number(base.skillSlots ?? PROG.defaultSkillSlots ?? 4),
      passiveSlots: Number(base.passiveSlots ?? PROG.defaultPassiveSlots ?? 3),
      skillPoints: Number(base.skillPoints ?? PROG.defaultSkillPoints ?? 4),
      passivePoints: Number(base.passivePoints ?? PROG.defaultPassivePoints ?? 3)
    };
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
    skillPoolIds: _skillPoolIds,
    passivePoolIds: _passivePoolIds,
    autoFillEquipped: _autoFillEquipped,
    switchPersona,
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
