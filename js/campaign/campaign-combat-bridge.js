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

  function consumeResult() {
    try {
      const raw = _session()?.getItem(RESULT_KEY) || _local()?.getItem(RESULT_KEY);
      if (!raw) return null;
      _session()?.removeItem(RESULT_KEY);
      _local()?.removeItem(RESULT_KEY);
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
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
      label: pendingBattle?.label || pendingBattle?.encounterId,
      mode: 'campaign',
      returnUrl: 'campaign.html',
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
    window.open('combat.html?campaignBattle=1', '_blank');
    return request;
  }

  function createRuntimeEncounterFromRequest(request) {
    if (!request?.encounterId) return null;
    const base = DS().get('encounters', request.encounterId);
    if (!base) return null;
    const runtimeId = `campaign_runtime_${request.encounterId}`;
    const overlay = request.partyOverlay || {};
    const available = new Set(request.availablePartyIds || Object.keys(overlay));
    const excluded = new Set((request.excludedParty || []).map((entry) => entry.id));
    const clone = JSON.parse(JSON.stringify(base));
    clone.id = runtimeId;
    clone.name = `${base.name || request.encounterId} (Campaign)`;
    clone._runtime = true;
    clone._scope = 'runtime';
    clone.units = (clone.units || []).filter((placement) => {
      const character = DS().get('characters', placement.id);
      const isPlayer = placement.team === 'player' || character?.team === 'player' || overlay[placement.id] || excluded.has(placement.id);
      return !isPlayer || available.has(placement.id);
    }).map((placement) => {
      const patch = overlay[placement.id];
      if (!patch) return placement;
      return {
        ...placement,
        currentHP: patch.currentHP,
        currentMP: patch.currentMP,
        activeStatuses: patch.statuses || []
      };
    });
    DS().replace('encounters', runtimeId, clone);
    return runtimeId;
  }

  function buildResultFromCombat(request, combatState) {
    const units = Object.values(combatState?.units || {});
    const partyAfter = {};
    for (const unit of units.filter((entry) => entry.team === 'player')) {
      const id = unit.baseId || unit.id || unit.instanceId;
      partyAfter[id] = {
        currentHp: unit.currentHP,
        currentMp: unit.currentMP,
        statuses: (unit.activeStatuses || []).map((status) => ({
          id: status.statusId || status.id,
          duration: 'battle',
          stacks: status.stacks || 1
        }))
      };
    }

    const enemies = units.filter((entry) => entry.team === 'enemy');
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
      encounterId: request?.encounterId || combatState?.encounter?.id || null,
      result: combatState?.winner === 'player' ? 'victory' : combatState?.winner === 'enemy' ? 'defeat' : 'draw',
      rounds: combatState?.roundNumber || 0,
      partyAfter,
      loot,
      notes: 'Combat app result imported.',
      completedAt: new Date().toISOString()
    };
  }

  function applyResult(result) {
    const Ops = window.CJS.CampaignOps;
    if (!result || !Ops) return;
    const ops = [];
    for (const [id, member] of Object.entries(result.partyAfter || {})) {
      const current = CS().getState().party[id];
      if (!current) continue;
      const hpLoss = Math.max(0, current.currentHp - member.currentHp);
      if (hpLoss) ops.push({ op: 'damage_character', target: id, amount: hpLoss });
      if (member.currentHp > current.currentHp) ops.push({ op: 'heal_character', target: id, amount: member.currentHp - current.currentHp });
      const mpDelta = (member.currentMp || 0) - (current.currentMp || 0);
      if (mpDelta) ops.push({ op: mpDelta >= 0 ? 'restore_mp' : 'spend_mp', target: id, amount: Math.abs(mpDelta) });
      for (const status of member.statuses || []) ops.push({ op: 'add_status', target: id, status: status.id, duration: status.duration || 'battle', stacks: status.stacks || 1 });
    }
    for (const drop of result.loot || []) {
      if (drop.type === 'money') ops.push({ op: 'give_money', currency: drop.currency || 'haven_gold', amount: drop.amount || drop.qty || 0 });
      else if (drop.type === 'jp') ops.push({ op: 'give_jp', amount: drop.amount || drop.qty || 0 });
      else if (drop.type === 'material') ops.push({ op: 'give_material', id: drop.id, qty: drop.qty || 1 });
      else ops.push({ op: 'give_item', id: drop.id, qty: drop.qty || 1 });
    }
    ops.push({ op: 'manual_battle_result', result: result.result, encounterId: result.encounterId, summary: result.notes || 'Combat bridge result applied.' });
    Ops.apply(ops, { source: 'combat_bridge' });
  }

  function _maxPartyLuck(units) {
    return units
      .filter((unit) => unit.team === 'player' && unit.currentHP > 0)
      .reduce((max, unit) => Math.max(max, unit.compiledStats?.L || 5), 5);
  }

  function isMemberBattleReady(member) {
    const availability = normalizeAvailability(member);
    return availability.status === 'available' && Number(member?.currentHp ?? 1) > 0;
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
