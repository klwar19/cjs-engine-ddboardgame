// campaign-combat-bridge.ts — Tier 3 TS port of js/campaign/campaign-combat-bridge.js
// (engine cluster: campaign). Handoff between campaign.html and combat.html:
// battle request/result read+write, build-result-from-combat, apply-result,
// member battle-readiness, loot summary. Reads window.CJS.* lazily. Exports
// `CampaignCombatBridge` and installs window.CJS.CampaignCombatBridge. Body verbatim.

window.CJS = window.CJS || {};

export const CampaignCombatBridge = (() => {
  'use strict';

  const REQUEST_KEY = 'cjs.campaign.battle.request.v1';
  const RESULT_KEY = 'cjs.campaign.battle.result.v1';
  const RESULT_EVENT = 'cjs-campaign-battle-result';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;
  const PS = () => window.CJS.PersonaService;

  function _session() {
    try { return window.sessionStorage; }
    catch (_) { return null; }
  }

  function _local() {
    try { return window.localStorage; }
    catch (_) { return null; }
  }

  function _channel() {
    try {
      return 'BroadcastChannel' in window ? new BroadcastChannel(RESULT_EVENT) : null;
    } catch (_) {
      return null;
    }
  }

  function writeRequest(request) {
    const payload = JSON.stringify(request || {});
    _session()?.setItem(REQUEST_KEY, payload);
    _local()?.setItem(REQUEST_KEY, payload);
  }

  function readRequest() {
    try {
      const raw = _session()?.getItem(REQUEST_KEY) || _local()?.getItem(REQUEST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearRequest() {
    _session()?.removeItem(REQUEST_KEY);
    _local()?.removeItem(REQUEST_KEY);
  }

  function writeResult(result) {
    const payload = JSON.stringify(result || {});
    _session()?.setItem(RESULT_KEY, payload);
    _local()?.setItem(RESULT_KEY, payload);
    const channel = _channel();
    if (channel) {
      try { channel.postMessage(result || {}); }
      finally { channel.close(); }
    }
    try {
      window.opener?.postMessage?.({ type: RESULT_EVENT, result }, window.location.origin);
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: result }));
    } catch (_) {}
  }

  function readResult() {
    try {
      const raw = _session()?.getItem(RESULT_KEY) || _local()?.getItem(RESULT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearResult() {
    _session()?.removeItem(RESULT_KEY);
    _local()?.removeItem(RESULT_KEY);
  }

  function consumeResult() {
    const result = readResult();
    if (result) clearResult();
    return result;
  }

  function onResult(listener) {
    if (typeof listener !== 'function') return () => {};
    const channel = _channel();
    const handle = (result) => {
      if (!result) return;
      listener(result);
    };
    const onStorage = (event) => {
      if (event.key !== RESULT_KEY || !event.newValue) return;
      try { handle(JSON.parse(event.newValue)); } catch (_) {}
    };
    const onMessage = (event) => {
      if (event.origin && event.origin !== window.location.origin) return;
      if (event.data?.type === RESULT_EVENT) handle(event.data.result);
    };
    const onCustom = (event) => handle(event.detail);
    if (channel) channel.onmessage = (event) => handle(event.data);
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    window.addEventListener(RESULT_EVENT, onCustom);
    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
      window.removeEventListener(RESULT_EVENT, onCustom);
    };
  }

  function buildRequestFromState(pendingBattle) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const partyEntries = Object.entries<any>(state.party || {});
    const availableParty = partyEntries.filter(([, member]) => isMemberBattleReady(member));
    const excludedParty = partyEntries.filter(([, member]) => !isMemberBattleReady(member));
    return {
      campaignId: state.campaignId,
      saveId: state.saveId,
      world: state.currentWorld,
      currency: `${state.currentWorld || 'haven'}_gold`,
      scenarioRunId: run?.runId || null,
      nodeId: pendingBattle?.nodeId || run?.currentNode || null,
      encounterId: pendingBattle?.encounterId,
      battleSetId: pendingBattle?.battleSetId || null,
      battleSetCard: _battleSetCard(pendingBattle?.battleSetId),
      monsterIds: (pendingBattle?.monsterIds || []).filter(Boolean),
      tags: pendingBattle?.tags || [],
      questContext: _battleQuestContext(state, pendingBattle),
      battleMap: pendingBattle?.battleMap || null,
      setting: pendingBattle?.setting || CS().getActiveScenario?.()?.setting || '',
      defeatOps: pendingBattle?.defeatOps || pendingBattle?.lossOps || [],
      drawOps: pendingBattle?.drawOps || [],
      badEndingOps: pendingBattle?.badEndingOps || [],
      badEndingOnDefeat: !!pendingBattle?.badEndingOnDefeat,
      badEndingFlag: pendingBattle?.badEndingFlag || null,
      defeatOutcome: pendingBattle?.defeatOutcome || null,
      defeatMode: pendingBattle?.defeatMode || null,
      defeatNoRecovery: !!(pendingBattle?.defeatNoRecovery || pendingBattle?.noDefeatRecovery),
      label: pendingBattle?.label || pendingBattle?.encounterId,
      mode: 'campaign',
      returnUrl: 'campaign.html?combatReturn=1',
      requestedAt: new Date().toISOString(),
      availablePartyIds: availableParty.map(([id]) => id),
      excludedParty: excludedParty.map(([id, member]) => ({
        id,
        name: member.name || id,
        reason: availabilityLabel(member)
      })),
      partyOverlay: Object.fromEntries(availableParty.map(([id, member]) => [id, {
        currentHP: member.currentHp,
        currentMP: member.currentMp,
        unit: _campaignUnitSnapshot(id, member),
        statuses: (member.statuses || []).map((status) => ({
          statusId: status.id,
          duration: status.duration === 'battle' ? 1 : 99,
          stacks: status.stacks || 1
        }))
      }]))
    };
  }

  function openBattle(pendingBattle) {
    const request = buildRequestFromState(pendingBattle);
    writeRequest(request);
    window.location.href = 'combat.html?campaignBattle=1';
    return request;
  }

  function _calcSkillApAward(skillId, entry: any = {}) {
    const skill = DS().get('skills', skillId);
    if (!skill) return 0;
    const F = window.CJS.Formulas;
    if (!F?.calcSkillApGainPerUse) {
      // Fallback: use the authored apGain as flat per-use amount.
      const flat = Math.max(0, Number(skill.apGain ?? 1));
      return flat * Number(entry?.count || 0);
    }
    const counts = entry.qteCounts || {};
    let total = 0;
    for (const grade of ['perfect', 'good', 'ok', 'fail']) {
      const n = Number(counts[grade] || 0);
      if (!n) continue;
      total += F.calcSkillApGainPerUse(skill, grade) * n;
    }
    // Fallback for older logs without qteCounts breakdown.
    if (!total && entry.count) {
      total = F.calcSkillApGainPerUse(skill, 'ok') * Number(entry.count);
    }
    return Math.max(0, Math.round(total));
  }

  function _cloneSkillUseLog(log) {
    if (!log || typeof log !== 'object') return {};
    const out = {};
    for (const [skillId, entry] of Object.entries<any>(log)) {
      if (!entry) continue;
      out[skillId] = {
        count: Number(entry.count || 0),
        qteCounts: {
          perfect: Number(entry.qteCounts?.perfect || 0),
          good: Number(entry.qteCounts?.good || 0),
          ok: Number(entry.qteCounts?.ok || 0),
          fail: Number(entry.qteCounts?.fail || 0)
        }
      };
    }
    return out;
  }

  function _campaignUnitSnapshot(id, member: any = {}) {
    const baseId = member.baseCharacterId || id;
    const base = DS().get('characters', baseId) || {};
    const currentWorld = CS()?.getState?.()?.currentWorld || '';
    const persona = PS()?.getActivePersona?.(member) || null;
    // Stats: base + statOverrides + persona cross-world penalty (if any).
    // PersonaService is the single source for cross-world adjustments so the
    // logic stays consistent with the editor preview and any future UI.
    const stats = PS()?.computeSnapshotStats
      ? PS().computeSnapshotStats(base.stats || {}, member, currentWorld)
      : (() => {
          const s = { ...(base.stats || {}) };
          for (const [stat, amount] of Object.entries<any>(member.statOverrides || {})) {
            s[stat] = Number(s[stat] || 0) + Number(amount || 0);
          }
          return s;
        })();

    // Filter to only the EQUIPPED skills the player has selected. The pool
    // may include base.skills (or persona.skills if a persona is active),
    // learnedSkills, and job grants; equippedSkills (set by campaign-ops +
    // auto-fill normalization) is the player's chosen subset. Item-granted
    // skills are layered in by stat-compiler at combat time; they don't
    // need a slot.
    const equippedSkillIds = new Set(member.equippedSkills || []);
    // When a persona is active, its authored skill list replaces the base
    // character's skill list as the pool's foundation. Universal carry-over
    // skills (base.skills) are still tracked under member.learnedSkills if
    // they were preserved from before the switch.
    const poolBaseSkills = persona && Array.isArray(persona.skills) && persona.skills.length
      ? persona.skills
      : (base.skills || []);
    const fullSkills = _mergeSkillEntries(poolBaseSkills, member.learnedSkills || []);
    const ultimateSkillId = member.ultimateSkillId || persona?.ultimateSkillId || base.ultimateSkillId || null;
    const F = window.CJS.Formulas;

    // Job-granted skills can be equipped if the player picked them; they get
    // the player's progress level, same as any other skill.
    if (member.currentJob && F?.collectJobGrants) {
      const job = DS().get('jobs', member.currentJob);
      const lvl = Math.max(1, Number(member.jobProgress?.[member.currentJob]?.level || 1));
      const grants = F.collectJobGrants(job || {}, lvl);
      for (const sid of grants.skills || []) {
        if (!fullSkills.some((entry) => (typeof entry === 'string' ? entry : entry.skillId) === sid)) {
          fullSkills.push({ skillId: sid, overrides: {}, level: 1 });
        }
      }
    }
    _applySkillProgressLevels(fullSkills, member.skillProgress || {});

    const skills = fullSkills.filter((entry) => {
      const sid = typeof entry === 'string' ? entry : entry?.skillId;
      return equippedSkillIds.has(sid);
    });
    if (ultimateSkillId && !skills.some((entry) => (typeof entry === 'string' ? entry : entry?.skillId) === ultimateSkillId)) {
      skills.push({ skillId: ultimateSkillId, overrides: {}, level: 1, source: 'ultimate' });
    }

    // Equipped passives — same idea. Innate passives count against slots
    // but auto-fill pre-selects them, so existing characters keep their
    // innate behavior.
    const passives = (member.equippedPassives || []).slice();
    const passiveRanks = {};
    for (const pid of passives) {
      passiveRanks[pid] = Math.max(1, Number(member.passiveProgress?.[pid]?.rank || 1));
    }
    const damageMods = PS()?.crossWorldDamageMods?.(member, currentWorld) || { dealt: 1, taken: 1 };
    const personaPortrait = persona?.portrait || member.personaPortrait || '';
    const personaPortraitFocus = persona?.portrait
      ? (persona.portraitFocus || null)
      : (member.personaPortrait ? (member.personaPortraitFocus || null) : null);
    const personaIcon = persona?.icon || member.personaIcon || '';
    // Pick the focus that travels with whichever portrait source we end up
    // using below, so the crop tracks the picture.
    let chosenPortraitFocus = null;
    if (personaPortrait) chosenPortraitFocus = personaPortraitFocus;
    else if (member.portrait) chosenPortraitFocus = member.portraitFocus || null;
    else chosenPortraitFocus = base.portraitFocus || null;
    return {
      ..._clone(base),
      id,
      baseTemplateId: baseId,
      campaignPartyId: id,
      name: member.name || base.name || id,
      // Persona icon/portrait take precedence so combat shows the correct
      // world-skin avatar without the editor needing to fork the base record.
      icon: personaIcon || member.icon || base.icon || '',
      portrait: personaPortrait || member.portrait || base.portrait || '',
      portraitFocus: chosenPortraitFocus,
      team: 'player',
      level: Number(member.level || base.level || 1),
      rank: persona?.rank || member.rank || base.rank || 'F',
      stats,
      skills,
      innatePassives: passives,
      passiveRanks,
      allowedWeaponTypes: _mergeIds(persona?.allowedWeaponTypes || base.allowedWeaponTypes || [], member.allowedWeaponTypes || []),
      allowedArmorTypes: _mergeIds(persona?.allowedArmorTypes || base.allowedArmorTypes || [], member.allowedArmorTypes || []),
      equipment: Array.isArray(member.equipment) ? _clone(member.equipment) : _clone(persona?.equipment || base.equipment || []),
      equipmentSlots: _clone(member.equipmentSlots || {}),
      battleSfx: member.battleSfx || base.battleSfx || {},
      // Carryovers for combat to render & for telemetry to be reattached on result.
      currentJob: member.currentJob || null,
      jobLevel: member.currentJob ? Number(member.jobProgress?.[member.currentJob]?.level || 1) : 0,
      // Persona info — combat HUD + damage-calc both read these.
      activePersona: persona?.id || null,
      personaName: persona?.name || '',
      personaWorld: persona?.world || '',
      personaOutOfWorld: !!(persona && persona.world && persona.world !== currentWorld),
      damageDealtMultiplier: Number(damageMods.dealt || 1),
      damageTakenMultiplier: Number(damageMods.taken || 1),
      ultimateMeter: Number(member.ultimateMeter || 0),
      ultimateMax: Number(member.ultimateMax || base.ultimateMax || 100),
      ultimateSkillId
    };
  }

  // Walk the skill list and bump each entry.level to the campaign-tracked
  // value (or leave as-authored when no progress entry exists).
  function _applySkillProgressLevels(skills, skillProgress) {
    for (let i = 0; i < skills.length; i++) {
      const entry = skills[i];
      const skillId = typeof entry === 'string' ? entry : entry?.skillId;
      if (!skillId) continue;
      const prog = skillProgress[skillId];
      if (!prog) continue;
      if (typeof entry === 'string') {
        skills[i] = { skillId, overrides: {}, level: Math.max(1, Number(prog.level || 1)) };
      } else {
        skills[i] = { ...entry, level: Math.max(1, Number(prog.level || 1)) };
      }
    }
  }

  function _installCampaignPartyUnits(request: any = {}) {
    for (const patch of Object.values<any>(request.partyOverlay || {})) {
      if (patch?.unit?.id) DS().replace('characters', patch.unit.id, _clone(patch.unit));
    }
  }

  function _mergeSkillEntries(baseSkills: any[] = [], learnedSkills: any[] = []) {
    const out = [];
    const seen = new Set();
    for (const entry of [...baseSkills, ...learnedSkills]) {
      const id = _skillId(entry);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(typeof entry === 'string' ? entry : _clone(entry));
    }
    return out;
  }

  function _skillId(entry) {
    return typeof entry === 'string' ? entry : entry?.skillId || null;
  }

  function _mergeIds(...sets) {
    const out = [];
    for (const set of sets) {
      for (const id of set || []) {
        if (id && !out.includes(id)) out.push(id);
      }
    }
    return out;
  }

  function _clone(value) {
    return JSON.parse(JSON.stringify(value || (Array.isArray(value) ? [] : {})));
  }

  function _mergeTags(...groups) {
    const seen = new Set();
    const out = [];
    for (const group of groups) {
      for (const tag of Array.isArray(group) ? group : [group]) {
        if (!tag) continue;
        const value = String(tag);
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
      }
    }
    return out;
  }

  function _requestCombatContext(request: any = {}, base: any = {}, card = null) {
    const questContext = request.questContext || {};
    const tags = _mergeTags(
      base.tags || [],
      card?.tags || [],
      request.tags || [],
      questContext.tags || [],
      request.battleSetId ? 'battle_set' : '',
      request.scenarioRunId ? 'scenario' : '',
      questContext.questId ? 'quest' : '',
      questContext.questId ? 'story' : ''
    );
    return {
      tags,
      contextTags: _mergeTags(base.contextTags || [], request.contextTags || [], questContext.contextTags || []),
      monsterTags: _mergeTags(base.monsterTags || [], request.monsterTags || [], questContext.monsterTags || []),
      procModifierChance: _procModifierChanceForRequest(request, tags),
      procModifierMax: _procModifierMaxForRequest(request, tags)
    };
  }

  function _procModifierChanceForRequest(request: any = {}, tags: any[] = []) {
    if (request.procModifierChance != null) return Number(request.procModifierChance);
    const set = new Set((tags || []).map((tag) => String(tag).toLowerCase()));
    if (set.has('story') || set.has('quest')) return 0.16;
    if (set.has('moving_threat') || set.has('random') || set.has('horde')) return 0.24;
    return null;
  }

  function _procModifierMaxForRequest(request: any = {}, tags: any[] = []) {
    if (request.procModifierMax != null) return Number(request.procModifierMax);
    const set = new Set((tags || []).map((tag) => String(tag).toLowerCase()));
    if (set.has('story') || set.has('quest')) return 1;
    return null;
  }

  function createRuntimeEncounterFromRequest(request) {
    _installCampaignPartyUnits(request);
    const base = request?.encounterId ? DS().get('encounters', request.encounterId) : null;
    if (!base) return _createProceduralEncounterFromRequest(request);
    const runtimeContext = _requestCombatContext(request, base, request.battleSetCard || _battleSetCard(request.battleSetId));
    const runtimeId = `campaign_runtime_${request.encounterId}`;
    const overlay = request.partyOverlay || {};
    const excluded = new Set((request.excludedParty || []).map((entry) => entry.id));
    const clone = JSON.parse(JSON.stringify(base));
    clone.id = runtimeId;
    clone.name = `${base.name || request.encounterId} (Campaign)`;
    clone._runtime = true;
    clone._scope = 'runtime';
    clone.tags = runtimeContext.tags;
    clone.contextTags = runtimeContext.contextTags;
    clone.monsterTags = runtimeContext.monsterTags;
    clone.setting = request.setting || clone.setting || '';
    clone.biome = clone.biome || request.setting || '';
    if (runtimeContext.procModifierChance != null) clone.procModifierChance = runtimeContext.procModifierChance;
    if (runtimeContext.procModifierMax != null) clone.procModifierMax = runtimeContext.procModifierMax;
    const sourceUnits = clone.units || [];
    const playerSlots = sourceUnits.filter((placement) => {
      const character = DS().get('characters', placement.id);
      const isPlayer = placement.team === 'player' || character?.team === 'player' || overlay[placement.id] || excluded.has(placement.id);
      return isPlayer;
    });
    const enemies = sourceUnits.filter((placement) => !playerSlots.includes(placement));
    const partyIds = request.availablePartyIds || Object.keys(overlay);
    const players = partyIds.map((id, index) => {
      const slot = playerSlots[index] || playerSlots[index % Math.max(playerSlots.length, 1)] || {};
      const patch = overlay[id] || {};
      return {
        ...slot,
        id,
        pos: slot.pos || _fallbackPlayerPos(clone, index),
        team: 'player',
        currentHP: patch.currentHP,
        currentMP: patch.currentMP,
        activeStatuses: patch.statuses || []
      };
    });
    clone.units = [...players, ...enemies];
    DS().replace('encounters', runtimeId, clone);
    return runtimeId;
  }

  function _fallbackPlayerPos(encounter: any = {}, index = 0) {
    const width = Math.max(2, Number(encounter.width || 8));
    const height = Math.max(2, Number(encounter.height || 8));
    return [width - 2, Math.min(height - 1, 1 + index)];
  }

  function _createProceduralEncounterFromRequest(request: any = {}) {
    _installCampaignPartyUnits(request);
    const card = request.battleSetCard || _battleSetCard(request.battleSetId);
    const runtimeContext = _requestCombatContext(request, {}, card);
    const overlay = request.partyOverlay || {};
    const partyIds = request.availablePartyIds || Object.keys(overlay);
    if (!partyIds.length) return null;

    const enemyIds = _enemyIdsForRequest(card, request);
    if (!enemyIds.length) return null;

    const mapConfig = _battleMapConfig(card, request);
    const generated = window.CJS.MapGenerator?.generate?.({
      theme: mapConfig.theme,
      width: mapConfig.width,
      height: mapConfig.height
    });
    if (!generated) return null;

    const unitData = {};
    for (const id of partyIds) unitData[id] = DS().get('characters', id);
    for (const id of enemyIds) unitData[id] = DS().get('monsters', id);

    const playerPlacements = window.CJS.MapGenerator.placeUnitsInZone(partyIds, generated.spawnZones.player, unitData, generated.grid)
      .map((placement) => {
        const patch = overlay[placement.id] || {};
        return {
          ...placement,
          currentHP: patch.currentHP,
          currentMP: patch.currentMP,
          activeStatuses: patch.statuses || []
        };
      });
    const enemyPlacements = window.CJS.MapGenerator.placeUnitsInZone(enemyIds, generated.spawnZones.enemy, unitData, generated.grid)
      .map((placement) => _attachMonsterLevel(placement, unitData[placement.id], request));
    const runtimeId = `campaign_runtime_${request.battleSetId || request.requestedAt || Date.now()}`;

    DS().replace('encounters', runtimeId, {
      id: runtimeId,
      name: `${card?.name || request.label || 'Campaign Battle'} (${generated.themeName})`,
      width: generated.width,
      height: generated.height,
      grid: generated.grid,
      units: [...playerPlacements, ...enemyPlacements],
      _runtime: true,
      _scope: 'runtime',
      _world: request.world || card?.world || null,
      _origin: request.monsterIds?.length ? 'runtime:campaign-monster-pool' : 'runtime:campaign-battle-set',
      _battleSetId: request.battleSetId || card?.id || null,
      _battleTheme: generated.themeId,
      setting: request.setting || generated.themeId || '',
      biome: request.setting || generated.themeId || '',
      tags: runtimeContext.tags,
      contextTags: runtimeContext.contextTags,
      monsterTags: runtimeContext.monsterTags,
      procModifierChance: runtimeContext.procModifierChance,
      procModifierMax: runtimeContext.procModifierMax
    });
    return runtimeId;
  }

  function buildResultFromCombat(request, combatState) {
    const units = Object.values<any>(combatState?.units || {});
    const partyAfter = {};
    for (const unit of units.filter((entry) => entry.team === 'player')) {
      const id = unit.campaignPartyId || unit.baseId || unit.id || unit.instanceId;
      partyAfter[id] = {
        currentHp: unit.currentHP,
        currentMp: unit.currentMP,
        statuses: (unit.activeStatuses || []).map((status) => ({
          id: status.statusId || status.id,
          duration: 'battle',
          stacks: status.stacks || 1
        })),
        skillUseLog: _cloneSkillUseLog(unit.skillUseLog),
        ultimateMeter: unit.ultimateMeter,
        ultimateMax: unit.ultimateMax,
        ultimateSkillId: unit.ultimateSkillId || null
      };
    }

    const enemies = units.filter((entry) => entry.team === 'enemy');
    const defeatedEnemies = enemies
      .filter((unit) => Number(unit.currentHP || 0) <= 0)
      .map((unit) => ({
        id: unit.baseId || unit.id || unit.instanceId,
        name: unit.name || '',
        rank: unit.rank || 'F',
        level: Math.max(1, Number(unit.level || 1)),
        levelScale: Number(unit.levelScale || 1)
      }));
    const loot = [];
    if (window.CJS.LootRoller && combatState?.winner === 'player') {
      const drops = window.CJS.LootRoller.rollLoot(enemies, _maxPartyLuck(units));
      for (const drop of drops) {
        if (drop.isGold) loot.push({ type: 'money', currency: request?.currency || `${request?.world || 'haven'}_gold`, amount: drop.quantity });
        else if (drop.isJP) loot.push({ type: 'jp', amount: drop.quantity });
        else loot.push({
          type: DS().exists('materials', drop.itemId) ? 'material' : 'item',
          id: drop.itemId,
          qty: drop.quantity || 1,
          name: drop.name || drop.itemId
        });
      }
    }

    return {
      requestId: request?.requestedAt || '',
      campaignId: request?.campaignId || '',
      saveId: request?.saveId || '',
      scenarioRunId: request?.scenarioRunId || null,
      nodeId: request?.nodeId || null,
      currency: request?.currency || `${request?.world || 'haven'}_gold`,
      encounterId: request?.encounterId || combatState?.encounter?.id || null,
      result: combatState?.winner === 'player' ? 'victory' : combatState?.winner === 'enemy' ? 'defeat' : 'draw',
      rounds: combatState?.roundNumber || 0,
      partyAfter,
      loot,
      defeatedEnemies,
      combatPulse: window.CJS.CampaignQuestPulse?.buildCombatPulse?.({
        request,
        combatState,
        entries: window.CJS.CombatLog?.getAll?.() || []
      }) || null,
      questContext: request?.questContext || null,
      defeatOps: request?.defeatOps || [],
      drawOps: request?.drawOps || [],
      badEndingOps: request?.badEndingOps || [],
      badEndingOnDefeat: !!request?.badEndingOnDefeat,
      badEndingFlag: request?.badEndingFlag || null,
      defeatOutcome: request?.defeatOutcome || null,
      defeatMode: request?.defeatMode || null,
      defeatNoRecovery: !!request?.defeatNoRecovery,
      notes: 'Combat app result imported.',
      completedAt: new Date().toISOString()
    };
  }

  function _battleSetCard(cardId) {
    if (!cardId) return null;
    const fromLoader = window.CJS.CampaignDataLoader?.getBattleSetCard?.(cardId);
    if (fromLoader) return fromLoader;
    for (const set of DS().getAllAsArray('battleSets') || []) {
      const card = (set.cards || []).find((entry) => entry.id === cardId);
      if (card) return { ...card, sourceSetId: set.id, world: card.world || set.world, zone: card.zone || set.zone, hubId: card.hubId || set.hubId };
    }
    return null;
  }

  function _battleQuestContext(state: any = {}, pendingBattle: any = {}) {
    const run = state.activeScenarioRun || {};
    const questId = pendingBattle?.questId || pendingBattle?.questContext?.questId || run.questId || null;
    const quest = questId ? state.quests?.[questId] : null;
    const base = quest ? window.CJS.CampaignQuestPulse?.battleContextForQuest?.(quest) || {} : {};
    const card = _battleSetCard(pendingBattle?.battleSetId);
    const cardTags = card?.tags || [];
    return {
      questId,
      questTitle: quest?.title || pendingBattle?.questContext?.questTitle || run.questTitle || '',
      questChainId: pendingBattle?.questChainId || pendingBattle?.questContext?.questChainId || run.questChainId || quest?.chainTemplateId || null,
      objectiveId: pendingBattle?.objectiveId || pendingBattle?.questContext?.objectiveId || run.questObjectiveId || null,
      tags: _uniqueTags([
        ...(base.tags || []),
        ...(pendingBattle?.tags || []),
        ...(pendingBattle?.questContext?.tags || []),
        ...cardTags
      ]),
      contextTags: _uniqueTags([
        ...(base.contextTags || []),
        ...(pendingBattle?.contextTags || []),
        ...(pendingBattle?.questContext?.contextTags || []),
        run.questTask?.location || '',
        card?.objective || ''
      ]),
      monsterTags: _uniqueTags([
        ...(base.monsterTags || []),
        ...(pendingBattle?.monsterTags || []),
        ...(pendingBattle?.questContext?.monsterTags || []),
        ...cardTags
      ]),
      variant: base.variant || quest?.activeVariant || null
    };
  }

  function _enemyIdsForRequest(card, request: any = {}) {
    const explicit = (request.monsterIds || []).filter((id) => DS().exists('monsters', id));
    return explicit.length ? explicit : _enemyIdsFromBattleCard(card, request);
  }

  // Pick a monster's spawn level using party state + the destination
  // world's ceiling rank. Honoured by stat-compiler at compile time so
  // HP/stats/skills/RP all scale together. Called once per enemy
  // placement; deterministic given the same inputs except for the
  // built-in danger jitter.
  function _attachMonsterLevel(placement, monster, request: any = {}) {
    if (!placement) return placement;
    // If a placement already carries a level (e.g. authored encounter),
    // respect it — story battles often hand-tune monster levels.
    if (Number(placement.level || 0) > 0) return placement;
    const F = window.CJS.Formulas;
    if (!F?.pickMonsterLevel) return placement;
    const state = CS()?.getState?.() || {};
    const world = DS().get('worlds', request.world || state.currentWorld) || {};
    const partyLevels = Object.values<any>(state.party || {})
      .filter((m) => (m.rosterRole || 'active') !== 'bench')
      .map((m) => Number(m.level || 1));
    const partyAvg = partyLevels.length
      ? partyLevels.reduce((s, l) => s + l, 0) / partyLevels.length
      : 1;
    const danger = Number(state.activeScenarioRun?.danger || 0);
    // Soft-recommendedRank penalty: party hasn't met the recommendation,
    // monsters skew toward the top of the band.
    let recPenalty = 0;
    const recRank = world.recommendedRank;
    if (recRank) {
      const partyTop = Object.values<any>(state.party || {}).reduce((best, m) => {
        const r = m.adventurer?.rank || m.rank || 'F';
        return (F.rankIndex(r) > F.rankIndex(best)) ? r : best;
      }, 'F');
      if (!F.meetsRank(partyTop, recRank)) recPenalty = 2;
    }
    const level = F.pickMonsterLevel(monster || {}, {
      partyAvgLevel: partyAvg,
      danger,
      recommendedPenalty: recPenalty,
      worldCeiling: world.ceiling || null
    });
    return { ...placement, level };
  }

  function _enemyIdsFromBattleCard(card, request: any = {}) {
    const ids = [];
    for (const mix of card?.enemyMix || []) {
      if (mix.optional && Math.random() < 0.5) continue;
      const id = _monsterIdForMix(mix);
      if (!id) continue;
      const qty = Math.max(1, Math.min(8, Number(mix.qty || mix.count || 1)));
      for (let i = 0; i < qty; i++) ids.push(id);
    }
    return ids.length ? ids : _fallbackEnemyIds(card, request);
  }

  function _monsterIdForMix(mix: any = {}) {
    if (mix.id && DS().exists('monsters', mix.id)) return mix.id;
    const label = _normalize([mix.id, mix.name, mix.label].filter(Boolean).join(' '));
    if (!label) return null;
    const exact = DS().getAllAsArray('monsters').find((monster) => _normalize(monster.name || monster.id) === label);
    if (exact) return exact.id;
    const partial = DS().getAllAsArray('monsters').find((monster) => {
      const name = _normalize(`${monster.id} ${monster.name || ''} ${monster.type || ''}`);
      return label.includes(name) || name.includes(label);
    });
    if (partial) return partial.id;

    const aliases = [
      ['wolf', 'wolf'],
      ['bear', 'bear'],
      ['sprite', 'sprite'],
      ['rat', 'runner'],
      ['bandit', 'runner'],
      ['trapper', 'climber'],
      ['undead', 'walker'],
      ['brute', 'brute'],
      ['necromancer', 'necromancer'],
      ['chimera', 'chimera'],
      ['yeti', 'yeti'],
      ['oni', 'oni']
    ];
    const alias = aliases.find(([needle]) => label.includes(needle))?.[1];
    if (!alias) return null;
    return DS().getAllAsArray('monsters').find((monster) => _normalize(`${monster.id} ${monster.name || ''} ${monster.type || ''}`).includes(alias))?.id || null;
  }

  function _fallbackEnemyIds(card, request: any = {}) {
    const world = request.world || card?.world || '';
    const monsters = DS().getAllAsArray('monsters')
      .filter((monster) => !world || !monster._world || monster._world === world)
      .map((monster) => ({ monster, score: _monsterScore(monster, card, request) }))
      .sort((a, b) => b.score - a.score);
    if (!monsters.length) return [];
    const partyCount = Math.max(1, (request.availablePartyIds || []).length);
    const count = Math.max(2, Math.min(5, partyCount + 1));
    const pool = monsters.slice(0, Math.min(5, monsters.length)).map(({ monster }) => monster.id);
    return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
  }

  function _monsterScore(monster, card: any = {}, request: any = {}) {
    const context = request.questContext || {};
    const text = _normalize([
      request.setting,
      request.label,
      ...(request.tags || []),
      ...(context.tags || []),
      ...(context.contextTags || []),
      ...(context.monsterTags || []),
      card?.name,
      card?.objective,
      card?.gimmick,
      ...(card?.tags || [])
    ].join(' '));
    const mon = _normalize(`${monster.id} ${monster.name || ''} ${monster.type || ''} ${monster.rank || ''} ${monster.description || ''}`);
    let score = 1;
    const desiredMonsterTags = (context.monsterTags || []).map(_normalize).filter(Boolean);
    for (const tag of desiredMonsterTags) {
      if (tag && mon.includes(tag)) score += 6;
      if (tag && String(monster.type || '').toLowerCase() === tag) score += 4;
    }
    const profile = {
      outdoor: ['wolf', 'bear', 'sprite', 'beast', 'forest', 'snow'],
      forest: ['wolf', 'bear', 'sprite', 'beast', 'forest'],
      dungeon: ['walker', 'brute', 'necromancer', 'sprite', 'undead', 'cave'],
      cave: ['bear', 'wolf', 'brute', 'walker', 'undead'],
      sewer: ['runner', 'walker', 'brute', 'undead'],
      ruins: ['sprite', 'walker', 'brute', 'necromancer', 'undead'],
      temple: ['sprite', 'walker', 'necromancer', 'undead'],
      urban: ['runner', 'climber', 'sprite'],
      house: ['runner', 'walker', 'sprite'],
      tavern: ['runner', 'walker', 'sprite'],
      mountain: ['bear', 'yeti', 'oni', 'wolf'],
      arena: ['chimera', 'oni', 'runner', 'wolf']
    }[_areaFromText(text)] || ['wolf', 'bear', 'sprite', 'walker'];
    for (const token of profile) if (mon.includes(token) || text.includes(token)) score += 4;
    for (const token of text.split(/\s+/)) if (token && mon.includes(token)) score += 1;
    if (/\bb\b|\bc\b|boss|chimera|yeti|oni|kumiho/.test(mon) && !/boss|preview|danger|mountain|arena|elite/.test(text)) score -= 2;
    return score;
  }

  function _uniqueTags(tags) {
    return Array.from(new Set((tags || [])
      .flat()
      .map((tag) => String(tag || '').trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, ''))
      .filter(Boolean)));
  }

  function _battleMapConfig(card: any = {}, request: any = {}) {
    card = card || {};
    const source = request.battleMap || card.battleMap || {};
    const grid = card.grid || {};
    const width = Number(source.width || grid.width || 8);
    const height = Number(source.height || grid.height || 8);
    return {
      theme: source.theme || _themeFromText(_normalize([request.setting, request.label, card.name, card.objective, card.gimmick, ...(card.tags || [])].join(' '))),
      width: Math.max(8, Math.min(12, width)),
      height: Math.max(8, Math.min(12, height))
    };
  }

  function _themeFromText(text) {
    if (/temple|shrine|holy/.test(text)) return 'temple';
    if (/ruins|relic|pillar/.test(text)) return 'ruins';
    if (/cave|cellar|sewer|underground|tunnel|den/.test(text)) return 'cave';
    if (/snow|ice|frost|mountain|ridge|tundra/.test(text)) return 'tundra';
    if (/arena|spar|training|guild|tavern|house|urban|street/.test(text)) return 'arena';
    if (/swamp|poison|marsh/.test(text)) return 'swamp';
    return 'forest';
  }

  function _areaFromText(text) {
    if (/forest|wood|grove|creek/.test(text)) return 'forest';
    if (/cave|hollow|den/.test(text)) return 'cave';
    if (/sewer|drain|canal/.test(text)) return 'sewer';
    if (/ruins|relic/.test(text)) return 'ruins';
    if (/temple|shrine|bell/.test(text)) return 'temple';
    if (/house|hut|cellar/.test(text)) return 'house';
    if (/tavern|kitchen|pantry|mug/.test(text)) return 'tavern';
    if (/mountain|ridge|summit|slope/.test(text)) return 'mountain';
    if (/arena|training|spar/.test(text)) return 'arena';
    if (/urban|town|city|street|guild/.test(text)) return 'urban';
    if (/dungeon|vault|crypt|floor/.test(text)) return 'dungeon';
    return 'outdoor';
  }

  function _normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, ' ').trim();
  }

  function applyResult(result) {
    const Ops = window.CJS.CampaignOps;
    if (!result || !Ops) return;
    const state = CS().getState();
    if (!state?.party) return;
    const pending = state?.pendingBattle || {};
    const outcome = _resultOutcome(result);
    const allowRecovery = _allowResultRecovery(outcome, result, pending);
    const ops = [];
    for (const [id, member] of Object.entries<any>(result.partyAfter || {})) {
      const current = state.party[id];
      if (!current) continue;
      const importedHp = Number(member.currentHp ?? current.currentHp ?? 0);
      const importedMp = Number(member.currentMp ?? current.currentMp ?? 0);
      const hpLoss = Math.max(0, current.currentHp - importedHp);
      if (hpLoss) ops.push({ op: 'damage_character', target: id, amount: hpLoss });
      if (importedHp > current.currentHp) ops.push({ op: 'heal_character', target: id, amount: importedHp - current.currentHp });
      if (allowRecovery && importedHp <= 0) {
        const recoveryHp = _resultRecoveryHp(current, outcome);
        if (recoveryHp > importedHp) ops.push({ op: 'heal_character', target: id, amount: recoveryHp - Math.max(0, importedHp) });
      }
      const mpDelta = importedMp - (current.currentMp || 0);
      if (mpDelta) ops.push({ op: mpDelta >= 0 ? 'restore_mp' : 'spend_mp', target: id, amount: Math.abs(mpDelta) });
      if (member.ultimateMeter !== undefined) {
        ops.push({
          op: 'set_ultimate_meter',
          target: id,
          amount: member.ultimateMeter,
          max: member.ultimateMax,
          skillId: member.ultimateSkillId
        });
      }
      for (const status of member.statuses || []) ops.push({ op: 'add_status', target: id, status: status.id, duration: status.duration || 'battle', stacks: status.stacks || 1 });

      // Per-skill AP gains based on actual usage in this battle. Job XP is
      // also awarded a small amount per skill use; character XP is awarded
      // a small amount per skill use plus an outcome bonus below.
      let skillUseTotal = 0;
      for (const [skillId, entry] of Object.entries<any>(member.skillUseLog || {})) {
        const apAmount = _calcSkillApAward(skillId, entry);
        if (apAmount > 0) {
          ops.push({ op: 'gain_skill_ap', target: id, skillId, amount: apAmount });
        }
        skillUseTotal += Number(entry?.count || 0);
      }
      if (skillUseTotal > 0) {
        const xpAward = Math.max(1, Math.round(skillUseTotal * 5));
        ops.push({ op: 'add_xp', target: id, amount: xpAward });
        // Job XP (only if the member has a current job; ops handler will skip otherwise).
        ops.push({ op: 'gain_job_xp', target: id, amount: Math.max(1, Math.round(skillUseTotal * 3)) });
      }
    }
    // XP per defeated enemy, split across surviving active members.
    // This is the "killing the enemy gives XP / Job XP" the user asked for —
    // separate from the per-skill-use XP awarded above.
    const PROG = window.CJS.CONST?.PROGRESSION || {};
    const xpTable = PROG.xpPerEnemyRank || {};
    const jobXpTable = PROG.jobXpPerEnemyRank || {};
    const defeatedList = Array.isArray(result.defeatedEnemies) ? result.defeatedEnemies : [];
    const totalEnemyXp = defeatedList.reduce((s, e) => s + (xpTable[e.rank || 'F'] || 0), 0);
    const totalEnemyJobXp = defeatedList.reduce((s, e) => s + (jobXpTable[e.rank || 'F'] || 0), 0);
    const eligibleIds = Object.keys(result.partyAfter || {}).filter((id) => {
      const cur = state.party[id];
      if (!cur) return false;
      // Reward only members who survived the battle (importedHp > 0). Match the
      // partyAfter snapshot directly since current state has been updated above.
      const after = (result.partyAfter || {})[id] || {};
      return Number(after.currentHp || 0) > 0;
    });
    if (eligibleIds.length && (totalEnemyXp > 0 || totalEnemyJobXp > 0)) {
      const xpPer = Math.max(1, Math.floor(totalEnemyXp / eligibleIds.length));
      const jobXpPer = Math.max(1, Math.floor(totalEnemyJobXp / eligibleIds.length));
      for (const id of eligibleIds) {
        if (xpPer > 0) ops.push({ op: 'add_xp', target: id, amount: xpPer });
        if (jobXpPer > 0) ops.push({ op: 'gain_job_xp', target: id, amount: jobXpPer });
      }
    }
    // RP per defeated enemy, awarded to each surviving member. We dispatch
    // one op per (member, enemy) so the world-ceiling taper applied inside
    // add_rank_points sees each member's effective rank separately. Solo
    // and small parties still benefit since taper, not split, gates RP.
    const rpTable = PROG.rpPerEnemyRank || {};
    if (eligibleIds.length) {
      for (const enemy of defeatedList) {
        const base = Number(rpTable[enemy.rank || 'F'] || 0);
        if (base <= 0) continue;
        for (const id of eligibleIds) {
          ops.push({
            op: 'add_rank_points',
            target: id,
            amount: base,
            sourceRank: enemy.rank || 'F',
            levelScale: Number(enemy.levelScale || 1),
            source: 'combat'
          });
        }
      }
    }
    // Small flat victory bonus (kept as a participation reward, on top of
    // enemy-specific XP). Helps short fights still feel rewarding.
    if (outcome === 'victory') {
      const winnerIds = Object.keys(result.partyAfter || {}).filter((id) => state.party[id]);
      if (winnerIds.length) {
        const bonusPerMember = 10 + Math.round((result.rounds || 0) * 2);
        for (const id of winnerIds) {
          ops.push({ op: 'add_xp', target: id, amount: bonusPerMember });
        }
      }
    }
    if (outcome === 'victory') {
      for (const drop of result.loot || []) {
        if (drop.type === 'money') ops.push({ op: 'give_money', currency: drop.currency || 'haven_gold', amount: drop.amount || drop.qty || 0 });
        else if (drop.type === 'jp') ops.push({ op: 'give_jp', amount: drop.amount || drop.qty || 0 });
        else if (drop.type === 'material') ops.push({ op: 'give_material', id: drop.id, qty: drop.qty || 1 });
        else ops.push({ op: 'give_item', id: drop.id, qty: drop.qty || 1 });
      }
    }
    for (const op of window.CJS.CampaignQuestPulse?.opsForCombatResult?.(state, result) || []) ops.push(op);
    ops.push({
      op: 'manual_battle_result',
      result: outcome,
      requestId: result.requestId || '',
      resultKey: [
        result.requestId,
        result.saveId,
        result.scenarioRunId,
        result.encounterId,
        result.completedAt,
        outcome
      ].filter(Boolean).join('|'),
      encounterId: result.encounterId,
      rounds: result.rounds || 0,
      loot: result.loot || [],
      completedAt: result.completedAt || new Date().toISOString(),
      summary: result.notes || 'Combat bridge result applied.',
      combatPulse: result.combatPulse || null,
      questContext: result.questContext || pending.questContext || null,
      questPulseApplied: true,
      currency: result.currency || `${state.currentWorld || 'haven'}_gold`,
      defeatOps: result.defeatOps || pending.defeatOps || [],
      drawOps: result.drawOps || pending.drawOps || [],
      badEndingOps: result.badEndingOps || pending.badEndingOps || [],
      badEndingOnDefeat: !!(result.badEndingOnDefeat || pending.badEndingOnDefeat),
      badEndingFlag: result.badEndingFlag || pending.badEndingFlag || null,
      defeatOutcome: result.defeatOutcome || pending.defeatOutcome || null,
      defeatMode: result.defeatMode || pending.defeatMode || null,
      defeatNoRecovery: !!(result.defeatNoRecovery || pending.defeatNoRecovery || pending.noDefeatRecovery)
    });
    Ops.apply(ops, { source: 'combat_bridge' });
  }

  function _resultOutcome(result) {
    const outcome = String(result?.result || 'draw').toLowerCase();
    return ['victory', 'defeat', 'draw'].includes(outcome) ? outcome : 'draw';
  }

  function _allowResultRecovery(outcome, result: any = {}, pending: any = {}) {
    if (!['defeat', 'draw'].includes(outcome)) return false;
    return !(result.defeatNoRecovery || result.noDefeatRecovery || pending.defeatNoRecovery || pending.noDefeatRecovery);
  }

  function _resultRecoveryHp(member: any = {}, outcome) {
    const maxHp = Math.max(1, Number(member.maxHp || 1));
    const rate = outcome === 'draw' ? 0.25 : 0.10;
    return Math.max(1, Math.floor(maxHp * rate));
  }

  function _maxPartyLuck(units) {
    return units
      .filter((unit) => unit.team === 'player' && unit.currentHP > 0)
      .reduce((max, unit) => Math.max(max, unit.compiledStats?.L || 5), 5);
  }

  function isMemberBattleReady(member) {
    const availability = normalizeAvailability(member);
    return (member?.rosterRole || 'active') !== 'bench' && availability.status === 'available' && Number(member?.currentHp ?? 1) > 0;
  }

  function normalizeAvailability(member: any = {}) {
    const raw = member.availability || {};
    const status = String(raw.status || raw.state || (member.available === false ? 'unavailable' : 'available')).toLowerCase();
    return {
      status: ['available', 'unavailable', 'benched', 'busy', 'injured', 'story_locked'].includes(status) && status !== 'benched'
        ? status
        : status === 'benched' ? 'unavailable' : 'available',
      reason: raw.reason || member.unavailableReason || ''
    };
  }

  function availabilityLabel(member) {
    const availability = normalizeAvailability(member);
    if ((member?.rosterRole || 'active') === 'bench') return 'Bench';
    if (Number(member?.currentHp ?? 1) <= 0) return '0 HP';
    return availability.reason || availability.status || 'unavailable';
  }

  function summarizeLoot(result) {
    const drops = result?.loot || [];
    if (!drops.length) return 'No loot';
    return drops.map((drop) => {
      if (drop.type === 'money') return `${drop.amount || drop.qty || 0} ${drop.currency || 'gold'}`;
      if (drop.type === 'jp') return `${drop.amount || drop.qty || 0} JP`;
      return `${drop.qty || 1}x ${drop.name || drop.id || drop.type}`;
    }).join(', ');
  }

  return Object.freeze({
    writeRequest,
    readRequest,
    clearRequest,
    writeResult,
    readResult,
    clearResult,
    consumeResult,
    onResult,
    buildRequestFromState,
    openBattle,
    createRuntimeEncounterFromRequest,
    buildResultFromCombat,
    applyResult,
    isMemberBattleReady,
    normalizeAvailability,
    availabilityLabel,
    summarizeLoot
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignCombatBridge = CampaignCombatBridge;
