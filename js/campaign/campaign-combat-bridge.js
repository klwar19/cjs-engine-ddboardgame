// campaign-combat-bridge.js
// Handoff between campaign.html and combat.html.

window.CJS = window.CJS || {};

window.CJS.CampaignCombatBridge = (() => {
  'use strict';

  const REQUEST_KEY = 'cjs.campaign.battle.request.v1';
  const RESULT_KEY = 'cjs.campaign.battle.result.v1';
  const RESULT_EVENT = 'cjs-campaign-battle-result';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;

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
    const partyEntries = Object.entries(state.party || {});
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

  function _calcSkillApAward(skillId, entry = {}) {
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
    for (const [skillId, entry] of Object.entries(log)) {
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

  function _campaignUnitSnapshot(id, member = {}) {
    const baseId = member.baseCharacterId || id;
    const base = DS().get('characters', baseId) || {};
    const stats = { ...(base.stats || {}) };
    // statOverrides already accumulate char-level + job-level + manual deltas.
    for (const [stat, amount] of Object.entries(member.statOverrides || {})) {
      stats[stat] = Number(stats[stat] || 0) + Number(amount || 0);
    }

    // Filter to only the EQUIPPED skills the player has selected. The pool
    // may include base.skills, learnedSkills, and job grants; equippedSkills
    // (set by campaign-ops + auto-fill normalization) is the player's
    // chosen subset. Item-granted skills are layered in by stat-compiler at
    // combat time; they don't need a slot.
    const equippedSkillIds = new Set(member.equippedSkills || []);
    const fullSkills = _mergeSkillEntries(base.skills || [], member.learnedSkills || []);
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

    // Equipped passives — same idea. Innate passives count against slots
    // but auto-fill pre-selects them, so existing characters keep their
    // innate behavior.
    const passives = (member.equippedPassives || []).slice();
    const passiveRanks = {};
    for (const pid of passives) {
      passiveRanks[pid] = Math.max(1, Number(member.passiveProgress?.[pid]?.rank || 1));
    }
    return {
      ..._clone(base),
      id,
      baseTemplateId: baseId,
      campaignPartyId: id,
      name: member.name || base.name || id,
      icon: member.icon || base.icon || '',
      portrait: member.portrait || base.portrait || '',
      team: 'player',
      level: Number(member.level || base.level || 1),
      rank: member.rank || base.rank || 'F',
      stats,
      skills,
      innatePassives: passives,
      passiveRanks,
      allowedWeaponTypes: _mergeIds(base.allowedWeaponTypes || [], member.allowedWeaponTypes || []),
      allowedArmorTypes: _mergeIds(base.allowedArmorTypes || [], member.allowedArmorTypes || []),
      equipment: Array.isArray(member.equipment) ? _clone(member.equipment) : _clone(base.equipment || []),
      equipmentSlots: _clone(member.equipmentSlots || {}),
      battleSfx: member.battleSfx || base.battleSfx || {},
      // Carryovers for combat to render & for telemetry to be reattached on result.
      currentJob: member.currentJob || null,
      jobLevel: member.currentJob ? Number(member.jobProgress?.[member.currentJob]?.level || 1) : 0
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

  function _installCampaignPartyUnits(request = {}) {
    for (const patch of Object.values(request.partyOverlay || {})) {
      if (patch?.unit?.id) DS().replace('characters', patch.unit.id, _clone(patch.unit));
    }
  }

  function _mergeSkillEntries(baseSkills = [], learnedSkills = []) {
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

  function createRuntimeEncounterFromRequest(request) {
    _installCampaignPartyUnits(request);
    const base = request?.encounterId ? DS().get('encounters', request.encounterId) : null;
    if (!base) return _createProceduralEncounterFromRequest(request);
    const runtimeId = `campaign_runtime_${request.encounterId}`;
    const overlay = request.partyOverlay || {};
    const excluded = new Set((request.excludedParty || []).map((entry) => entry.id));
    const clone = JSON.parse(JSON.stringify(base));
    clone.id = runtimeId;
    clone.name = `${base.name || request.encounterId} (Campaign)`;
    clone._runtime = true;
    clone._scope = 'runtime';
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

  function _fallbackPlayerPos(encounter = {}, index = 0) {
    const width = Math.max(2, Number(encounter.width || 8));
    const height = Math.max(2, Number(encounter.height || 8));
    return [width - 2, Math.min(height - 1, 1 + index)];
  }

  function _createProceduralEncounterFromRequest(request = {}) {
    _installCampaignPartyUnits(request);
    const card = request.battleSetCard || _battleSetCard(request.battleSetId);
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
    const enemyPlacements = window.CJS.MapGenerator.placeUnitsInZone(enemyIds, generated.spawnZones.enemy, unitData, generated.grid);
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
      _battleTheme: generated.themeId
    });
    return runtimeId;
  }

  function buildResultFromCombat(request, combatState) {
    const units = Object.values(combatState?.units || {});
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
        skillUseLog: _cloneSkillUseLog(unit.skillUseLog)
      };
    }

    const enemies = units.filter((entry) => entry.team === 'enemy');
    const defeatedEnemies = enemies
      .filter((unit) => Number(unit.currentHP || 0) <= 0)
      .map((unit) => ({
        id: unit.baseId || unit.id || unit.instanceId,
        name: unit.name || '',
        rank: unit.rank || 'F'
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

  function _enemyIdsForRequest(card, request = {}) {
    const explicit = (request.monsterIds || []).filter((id) => DS().exists('monsters', id));
    return explicit.length ? explicit : _enemyIdsFromBattleCard(card, request);
  }

  function _enemyIdsFromBattleCard(card, request = {}) {
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

  function _monsterIdForMix(mix = {}) {
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

  function _fallbackEnemyIds(card, request = {}) {
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

  function _monsterScore(monster, card = {}, request = {}) {
    const text = _normalize([
      request.setting,
      request.label,
      card?.name,
      card?.objective,
      card?.gimmick,
      ...(card?.tags || [])
    ].join(' '));
    const mon = _normalize(`${monster.id} ${monster.name || ''} ${monster.type || ''} ${monster.rank || ''} ${monster.description || ''}`);
    let score = 1;
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
    if (/\bb\b|\bc\b|boss|chimera|yeti|oni|kumiho/.test(mon) && !/boss|preview|danger|mountain|arena/.test(text)) score -= 2;
    return score;
  }

  function _battleMapConfig(card = {}, request = {}) {
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
    for (const [id, member] of Object.entries(result.partyAfter || {})) {
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
      for (const status of member.statuses || []) ops.push({ op: 'add_status', target: id, status: status.id, duration: status.duration || 'battle', stacks: status.stacks || 1 });

      // Per-skill AP gains based on actual usage in this battle. Job XP is
      // also awarded a small amount per skill use; character XP is awarded
      // a small amount per skill use plus an outcome bonus below.
      let skillUseTotal = 0;
      for (const [skillId, entry] of Object.entries(member.skillUseLog || {})) {
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

  function _allowResultRecovery(outcome, result = {}, pending = {}) {
    if (!['defeat', 'draw'].includes(outcome)) return false;
    return !(result.defeatNoRecovery || result.noDefeatRecovery || pending.defeatNoRecovery || pending.noDefeatRecovery);
  }

  function _resultRecoveryHp(member = {}, outcome) {
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

  function normalizeAvailability(member = {}) {
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
