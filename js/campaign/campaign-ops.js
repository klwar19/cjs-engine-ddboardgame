// campaign-ops.js
// Shared operation dispatcher for Campaign Mode state changes.

window.CJS = window.CJS || {};

window.CJS.CampaignOps = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const D = () => window.CJS.Dice;
  const DS = () => window.CJS.DataStore;

  const INVENTORY_BUCKETS = {
    give_item: 'items',
    take_item: 'items',
    give_material: 'materials',
    take_material: 'materials',
    give_food: 'food',
    take_food: 'food',
    give_quest_item: 'questItems',
    take_quest_item: 'questItems'
  };

  function apply(input, options = {}) {
    const ops = Array.isArray(input) ? input : [input];
    const applied = [];
    CS().mutate((state) => {
      for (const op of ops.filter(Boolean)) {
        _applyOne(state, op, options);
        applied.push(op);
      }
    }, { source: options.source || 'ops', detail: applied });
    return applied;
  }

  function describe(input) {
    const ops = Array.isArray(input) ? input : [input];
    return ops.filter(Boolean).map((op) => {
      switch (op.op) {
        case 'give_money': return `Give ${op.amount || 0} ${op.currency || 'money'}`;
        case 'take_money': return `Take ${op.amount || 0} ${op.currency || 'money'}`;
        case 'give_jp': return `Give ${op.amount || 0} JP`;
        case 'take_jp': return `Take ${op.amount || 0} JP`;
        case 'give_item': return `Give ${op.qty || 1} ${op.id}`;
        case 'take_item': return `Take ${op.qty || 1} ${op.id}`;
        case 'give_material': return `Give ${op.qty || 1} ${op.id}`;
        case 'take_material': return `Take ${op.qty || 1} ${op.id}`;
        case 'damage_character': return `Damage ${op.target || op.characterId} for ${op.amount || 0}`;
        case 'heal_character': return `Heal ${op.target || op.characterId} for ${op.amount || 0}`;
        case 'add_status': return `Add ${op.status || op.id} to ${op.target || 'target'}`;
        case 'set_party_availability': return `Set ${op.target || op.characterId || 'party member'} availability`;
        case 'clear_party_availability': return `Clear ${op.target || op.characterId || 'party member'} availability`;
        case 'danger': return `Danger ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}`;
        case 'reputation_change': return `Reputation ${op.target || op.id} ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}`;
        case 'hub_problem_add': return `Add hub problem ${op.problemId || op.id}`;
        case 'hub_problem_remove': return `Resolve hub problem ${op.problemId || op.id}`;
        case 'hub_stat_change': return `Hub ${op.stat} ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}`;
        case 'add_rumor': return `Add rumor: ${op.text || op.id || 'rumor'}`;
        case 'side_idea_save': return `Save side idea ${op.contentCard?.title || op.contentCard?.id || op.contentId || ''}`;
        case 'side_idea_reject': return `Reject side idea ${op.contentId || op.id || ''}`;
        case 'start_quest_chain': return `Start quest chain ${op.templateId || op.id}`;
        case 'advance_quest_chain_step': return `Advance quest chain ${op.templateId || op.id}`;
        case 'complete_quest_chain': return `Complete quest chain ${op.templateId || op.id}`;
        case 'clock_tick': return `Clock ${op.clockId || op.id} ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}`;
        case 'log': return op.text || 'Log entry';
        default: return op.op || 'operation';
      }
    });
  }

  function _applyOne(state, op, options) {
    if (!op || !op.op) return;

    switch (op.op) {
      case 'log': return _log(state, op.text || '', op);
      case 'set_flag': return _setFlag(state, op.flag || op.id, true, op.value);
      case 'clear_flag': return _setFlag(state, op.flag || op.id, false);
      case 'goto_node': return _gotoNode(state, op.nodeId || op.to);
      case 'reveal_node': return _setNodeFlag(state, op.mapId, op.nodeId, 'revealed', true);
      case 'lock_node': return _setNodeFlag(state, op.mapId, op.nodeId, 'locked', true);
      case 'unlock_node': return _setNodeFlag(state, op.mapId, op.nodeId, 'locked', false);
      case 'pass_phase': return passPhase(state, op);
      case 'start_scenario': return window.CJS.ScenarioRunner?.startScenario(op.scenarioId || op.id);
      case 'end_scenario': return window.CJS.ScenarioRunner?.endScenario(op.outcome || 'manual');
      case 'start_battle': return _startBattle(state, op);
      case 'roll_random_battle': return _rollRandomBattle(state, op);
      case 'manual_battle_result': return _manualBattleResult(state, op, options);
      case 'roll_event': return _rollEvent(state, op);
      case 'roll_check': return _rollCheck(state, op);
      case 'run_qte_or_dice': return _rollCheck(state, { ...op, type: 'qte_or_dice' });
      case 'give_money': return _money(state, op.currency || _worldCurrency(state), op.amount || 0);
      case 'take_money': return _money(state, op.currency || _worldCurrency(state), -(op.amount || 0));
      case 'give_jp': return _money(state, 'jp', op.amount || 0);
      case 'take_jp': return _money(state, 'jp', -(op.amount || 0));
      case 'give_item':
      case 'take_item':
      case 'give_material':
      case 'take_material':
      case 'give_food':
      case 'take_food':
      case 'give_quest_item':
      case 'take_quest_item':
        return _inventory(state, INVENTORY_BUCKETS[op.op], op.id, _signedQty(op));
      case 'damage_character': return _hp(state, op.target || op.characterId, -(op.amount || 0));
      case 'heal_character': return _hp(state, op.target || op.characterId, op.amount || 0);
      case 'restore_mp': return _mp(state, op.target || op.characterId, op.amount || 0);
      case 'spend_mp': return _mp(state, op.target || op.characterId, -(op.amount || 0));
      case 'set_party_availability': return _setPartyAvailability(state, op);
      case 'clear_party_availability': return _clearPartyAvailability(state, op);
      case 'damage_party': return _partyEach(state, (id) => _hp(state, id, -(op.amount || 0), false), `Party took ${op.amount || 0} HP damage.`);
      case 'heal_party': return _partyEach(state, (id) => _hp(state, id, op.amount || 0, false), `Party healed ${op.amount || 0} HP.`);
      case 'add_status': return _addStatus(state, op);
      case 'remove_status': return _removeStatus(state, op);
      case 'add_buff': return _addBuff(state, op);
      case 'remove_buff': return _removeBuff(state, op);
      case 'change_stat': return _changeStat(state, op);
      case 'set_stat_override': return _setStatOverride(state, op);
      case 'add_xp': return _addXp(state, op);
      case 'add_level': return _addLevel(state, op);
      case 'add_quest': return _addQuest(state, op.quest || op, options);
      case 'update_quest_progress': return _questProgress(state, op);
      case 'complete_quest': return _completeQuest(state, op.questId || op.id, options);
      case 'fail_quest': return _setQuestStatus(state, op.questId || op.id, 'failed');
      case 'reputation_change': return _reputationChange(state, op);
      case 'unlock_recipe': return _unlockRecipe(state, op);
      case 'danger': return _danger(state, op.amount || 0);
      case 'camp_rest': return _campRest(state, op);
      case 'full_rest': return _fullRest(state, op);
      case 'shop_buy': return _shopBuy(state, op);
      case 'shop_sell': return _shopSell(state, op);
      case 'craft_basic': return _craftBasic(state, op);
      case 'cook_basic': return _cookBasic(state, op);
      case 'farm_tick': return _farmTick(state, op.amount || 1);
      case 'world_transition': return _worldTransition(state, op);
      case 'chapter_transition': return _chapterTransition(state, op);
      case 'reset_campaign_state': return _resetCampaignState(state, op);
      case 'carryover_state': return _carryoverState(state, op);
      case 'hub_problem_add': return _hubProblemAdd(state, op);
      case 'hub_problem_remove': return _hubProblemRemove(state, op);
      case 'hub_service_unlock': return _hubService(state, op, true);
      case 'hub_service_lock': return _hubService(state, op, false);
      case 'hub_mood_set': return _hubMoodSet(state, op);
      case 'hub_stat_change': return _hubStatChange(state, op);
      case 'npc_mood_set': return _npcMoodSet(state, op);
      case 'add_rumor': return _addRumor(state, op);
      case 'resolve_rumor': return _resolveRumor(state, op);
      case 'side_idea_save': return _sideIdeaSave(state, op);
      case 'side_idea_reject': return _sideIdeaStatus(state, op, 'rejected');
      case 'side_idea_archive': return _sideIdeaStatus(state, op, 'archived');
      case 'side_idea_promote': return _sideIdeaPromote(state, op, options);
      case 'side_pack_import': return _sidePackImport(state, op);
      case 'review_queue_add': return _reviewQueueAdd(state, op);
      case 'review_queue_resolve': return _reviewQueueResolve(state, op);
      case 'start_quest_chain': return _startQuestChain(state, op);
      case 'advance_quest_chain_step': return _advanceQuestChain(state, op);
      case 'complete_quest_chain_step': return _completeQuestChainStep(state, op);
      case 'complete_quest_chain': return _completeQuestChain(state, op);
      case 'fail_quest_chain': return _failQuestChain(state, op);
      case 'clock_add': return _clockAdd(state, op);
      case 'clock_tick': return _clockTick(state, op);
      case 'clock_reset': return _clockReset(state, op);
      case 'clock_complete': return _clockComplete(state, op);
      case 'memory_shard_add': return _memoryShardAdd(state, op);
      case 'bond_change': return _bondChange(state, op);
      default:
        return _log(state, `Unknown operation ignored: ${op.op}`, op);
    }
  }

  function passPhase(state, op = {}) {
    const rule = CS().getPhaseRule(op.toType || state.phase.type);
    state.phase.number = (state.phase.number || 1) + 1;
    if (op.toType) {
      const nextRule = CS().getPhaseRule(op.toType);
      state.phase.type = op.toType;
      state.phase.name = nextRule?.name || op.toType;
    } else if (rule) {
      state.phase.name = rule.name || state.phase.name;
    }

    const activeRule = CS().getPhaseRule(state.phase.type);
    if (activeRule?.questTimersAdvance !== false) _tickQuestTimers(state);
    if (activeRule?.farmGrowth) _farmTick(state, activeRule.farmGrowth, false);
    _clearDuration(state, 'phase');
    state.eventCharges = { ...(activeRule?.eventCharges || {}) };
    _log(state, `Phase ${state.phase.number}: ${state.phase.name || state.phase.type}.`);
  }

  function _signedQty(op) {
    const qty = Number(op.qty ?? op.amount ?? 1) || 0;
    return op.op.startsWith('take_') ? -qty : qty;
  }

  function _worldCurrency(state) {
    return `${state.currentWorld || 'haven'}_gold`;
  }

  function _log(state, text, op = {}) {
    if (!text) return;
    state.log.unshift({
      id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      at: new Date().toISOString(),
      phase: state.phase?.number || 1,
      world: state.currentWorld,
      text,
      op: op.op || 'log'
    });
    state.log = state.log.slice(0, 500);
  }

  function _setFlag(state, flag, enabled, value) {
    if (!flag) return;
    if (enabled) state.flags[flag] = value === undefined ? true : value;
    else delete state.flags[flag];
    _log(state, `${enabled ? 'Set' : 'Cleared'} flag ${flag}.`);
  }

  function _mapState(state, mapId) {
    const id = mapId || state.activeScenarioRun?.mapId || 'freeform';
    state.mapState[id] = state.mapState[id] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
    return state.mapState[id];
  }

  function _setNodeFlag(state, mapId, nodeId, key, value) {
    if (!nodeId) return;
    const map = _mapState(state, mapId);
    map[key] = map[key] || {};
    map[key][nodeId] = value;
    if (state.activeScenarioRun && key === 'revealed') {
      state.activeScenarioRun.revealedNodes = state.activeScenarioRun.revealedNodes || [];
      if (value && !state.activeScenarioRun.revealedNodes.includes(nodeId)) state.activeScenarioRun.revealedNodes.push(nodeId);
      if (!value) state.activeScenarioRun.revealedNodes = state.activeScenarioRun.revealedNodes.filter((id) => id !== nodeId);
    }
    _log(state, `${key} ${nodeId}: ${value ? 'yes' : 'no'}.`);
  }

  function _gotoNode(state, nodeId) {
    if (!state.activeScenarioRun || !nodeId) return;
    state.activeScenarioRun.currentNode = nodeId;
    const map = _mapState(state, state.activeScenarioRun.mapId);
    map.visited[nodeId] = true;
    map.revealed[nodeId] = true;
    if (!state.activeScenarioRun.visitedNodes.includes(nodeId)) state.activeScenarioRun.visitedNodes.push(nodeId);
    if (!state.activeScenarioRun.revealedNodes.includes(nodeId)) state.activeScenarioRun.revealedNodes.push(nodeId);
    _revealNodeNeighborhood(state, nodeId);
    _log(state, `Moved to ${nodeId}.`);
  }

  function _revealNodeNeighborhood(state, nodeId) {
    const mapDef = CS().getActiveMap();
    if (!mapDef || !nodeId) return;
    const run = state.activeScenarioRun;
    const map = _mapState(state, run?.mapId || mapDef.id);
    const reveal = new Set([nodeId]);
    const node = (mapDef.nodes || []).find((entry) => entry.id === nodeId);
    for (const exit of node?.exits || []) reveal.add(exit.to);
    for (const other of mapDef.nodes || []) {
      if ((other.exits || []).some((exit) => exit.to === nodeId)) reveal.add(other.id);
    }
    run.revealedNodes = run.revealedNodes || [];
    for (const id of reveal) {
      map.revealed[id] = true;
      if (!run.revealedNodes.includes(id)) run.revealedNodes.push(id);
    }
  }

  function _money(state, currency, amount) {
    if (!currency || !amount) return;
    state.currencies[currency] = Math.max(0, (state.currencies[currency] || 0) + amount);
    _log(state, `${amount >= 0 ? 'Gained' : 'Spent'} ${Math.abs(amount)} ${currency}.`);
  }

  function _inventory(state, bucket, id, qty) {
    if (!bucket || !id || !qty) return;
    state.inventory[bucket] = state.inventory[bucket] || {};
    state.inventory[bucket][id] = Math.max(0, (state.inventory[bucket][id] || 0) + qty);
    if (state.inventory[bucket][id] <= 0) delete state.inventory[bucket][id];
    _log(state, `${qty >= 0 ? 'Added' : 'Removed'} ${Math.abs(qty)} ${id} (${bucket}).`);
  }

  function _resolveTargets(state, target) {
    if (target === 'party') return Object.keys(state.party);
    if (target === 'party_random') {
      const ids = Object.keys(state.party);
      return ids.length ? [ids[Math.floor(Math.random() * ids.length)]] : [];
    }
    if (state.party[target]) return [target];
    return [];
  }

  function _hp(state, target, delta, log = true) {
    for (const id of _resolveTargets(state, target)) {
      const member = state.party[id];
      member.currentHp = Math.max(0, Math.min(member.maxHp || 1, (member.currentHp || 0) + delta));
      if (log) _log(state, `${member.name || id} ${delta >= 0 ? 'healed' : 'lost'} ${Math.abs(delta)} HP.`);
    }
  }

  function _mp(state, target, delta, log = true) {
    for (const id of _resolveTargets(state, target)) {
      const member = state.party[id];
      member.currentMp = Math.max(0, Math.min(member.maxMp || 0, (member.currentMp || 0) + delta));
      if (log) _log(state, `${member.name || id} ${delta >= 0 ? 'restored' : 'spent'} ${Math.abs(delta)} MP.`);
    }
  }

  function _setPartyAvailability(state, op) {
    const status = String(op.status || op.state || 'unavailable').toLowerCase();
    const normalized = ['available', 'unavailable', 'busy', 'injured', 'story_locked'].includes(status) ? status : 'unavailable';
    for (const id of _resolveTargets(state, op.target || op.characterId || op.id)) {
      const member = state.party[id];
      member.availability = {
        status: normalized,
        reason: op.reason || '',
        source: op.source || 'manual',
        expires: op.expires || null,
        updatedAt: new Date().toISOString()
      };
      _log(state, `${member.name || id} availability: ${normalized}${op.reason ? ` - ${op.reason}` : ''}.`);
    }
  }

  function _clearPartyAvailability(state, op) {
    for (const id of _resolveTargets(state, op.target || op.characterId || op.id)) {
      const member = state.party[id];
      member.availability = {
        status: 'available',
        reason: '',
        source: op.source || 'manual',
        expires: null,
        updatedAt: new Date().toISOString()
      };
      _log(state, `${member.name || id} returned to the active party.`);
    }
  }

  function _partyEach(state, fn, message) {
    for (const id of Object.keys(state.party)) fn(id);
    if (message) _log(state, message);
  }

  function _addStatus(state, op) {
    const statusId = op.status || op.statusId || op.id;
    if (!statusId) return;
    for (const id of _resolveTargets(state, op.target || op.characterId)) {
      const member = state.party[id];
      const existing = member.statuses.find((s) => s.id === statusId && s.duration === (op.duration || 'manual'));
      if (existing) existing.stacks = (existing.stacks || 1) + (op.stacks || 1);
      else member.statuses.push({
        id: statusId,
        label: op.label || statusId,
        duration: op.duration || 'manual',
        stacks: op.stacks || 1,
        notes: op.notes || ''
      });
      _log(state, `${member.name || id} gained status ${statusId}.`);
    }
  }

  function _removeStatus(state, op) {
    const statusId = op.status || op.statusId || op.id;
    for (const id of _resolveTargets(state, op.target || op.characterId)) {
      const member = state.party[id];
      member.statuses = member.statuses.filter((status) => status.id !== statusId);
      _log(state, `${member.name || id} removed status ${statusId}.`);
    }
  }

  function _addBuff(state, op) {
    for (const id of _resolveTargets(state, op.target || op.characterId)) {
      state.party[id].buffs.push({
        id: op.id || op.buff || `buff_${Date.now()}`,
        label: op.label || op.buff || 'Buff',
        duration: op.duration || 'manual',
        stat: op.stat || null,
        amount: Number(op.amount || 0),
        notes: op.notes || ''
      });
      _log(state, `${state.party[id].name || id} gained buff ${op.label || op.buff || op.id}.`);
    }
  }

  function _removeBuff(state, op) {
    for (const id of _resolveTargets(state, op.target || op.characterId)) {
      state.party[id].buffs = state.party[id].buffs.filter((buff) => buff.id !== (op.id || op.buff));
      _log(state, `${state.party[id].name || id} removed buff ${op.id || op.buff}.`);
    }
  }

  function _changeStat(state, op) {
    const stat = op.stat;
    if (!stat) return;
    for (const id of _resolveTargets(state, op.target || op.characterId)) {
      const member = state.party[id];
      member.statOverrides[stat] = (member.statOverrides[stat] || 0) + Number(op.amount || 0);
      _log(state, `${member.name || id} ${stat} changed by ${op.amount || 0}.`);
    }
  }

  function _setStatOverride(state, op) {
    const stat = op.stat;
    if (!stat) return;
    for (const id of _resolveTargets(state, op.target || op.characterId)) {
      state.party[id].statOverrides[stat] = Number(op.value || 0);
      _log(state, `${state.party[id].name || id} ${stat} override set to ${op.value || 0}.`);
    }
  }

  function _addXp(state, op) {
    for (const id of _resolveTargets(state, op.target || op.characterId || 'party')) {
      state.party[id].xp = (state.party[id].xp || 0) + Number(op.amount || 0);
    }
    _log(state, `Added ${op.amount || 0} XP.`);
  }

  function _addLevel(state, op) {
    for (const id of _resolveTargets(state, op.target || op.characterId || 'party')) {
      state.party[id].level = (state.party[id].level || 1) + Number(op.amount || 1);
    }
    _log(state, `Level changed by ${op.amount || 1}.`);
  }

  function _addQuest(state, quest) {
    if (!quest.id) quest.id = `quest_${Date.now()}`;
    state.quests[quest.id] = {
      status: 'active',
      objectives: [],
      notes: '',
      ...CS().clone(quest)
    };
    _log(state, `Quest added: ${quest.title || quest.id}.`);
  }

  function _questProgress(state, op) {
    const quest = state.quests[op.questId];
    if (!quest) return;
    const objective = (quest.objectives || []).find((entry) => entry.id === op.objectiveId) || quest.objectives?.[0];
    if (!objective) return;
    objective.current = Math.max(0, (objective.current || 0) + Number(op.amount || 1));
    _log(state, `Quest progress: ${quest.title || quest.id} - ${objective.label || objective.id} ${objective.current}/${objective.required || 1}.`);
    if ((quest.objectives || []).every((entry) => (entry.current || 0) >= (entry.required || 1))) {
      _completeQuest(state, quest.id, { source: 'quest_auto' });
    }
  }

  function _completeQuest(state, questId, options = {}) {
    const quest = state.quests[questId];
    if (!quest || quest.status === 'complete') return;
    quest.status = 'complete';
    _log(state, `Quest complete: ${quest.title || quest.id}.`);
    if (options.applyRewards !== false) {
      for (const reward of quest.rewards || []) _applyOne(state, reward, { source: 'quest_reward' });
    }
  }

  function _setQuestStatus(state, questId, status) {
    if (!state.quests[questId]) return;
    state.quests[questId].status = status;
    _log(state, `Quest ${questId} marked ${status}.`);
  }

  function _danger(state, amount) {
    if (!state.activeScenarioRun) return _log(state, `Danger change ignored outside scenario (${amount}).`);
    const run = state.activeScenarioRun;
    run.danger = Math.max(0, Math.min(run.dangerMax || 10, (run.danger || 0) + Number(amount || 0)));
    _log(state, `Scenario danger ${amount >= 0 ? '+' : ''}${amount}; now ${run.danger}.`);
  }

  function _clearDuration(state, duration) {
    for (const member of Object.values(state.party)) {
      member.statuses = (member.statuses || []).filter((status) => status.duration !== duration);
      member.buffs = (member.buffs || []).filter((buff) => buff.duration !== duration);
      if (member.availability?.expires === duration) {
        member.availability = { status: 'available', reason: '', source: 'duration_clear', expires: null, updatedAt: new Date().toISOString() };
      }
    }
  }

  function _tickQuestTimers(state) {
    for (const quest of Object.values(state.quests)) {
      if (!quest.timer || quest.status !== 'active') continue;
      quest.timer.phasesRemaining = Math.max(0, (quest.timer.phasesRemaining || 0) - 1);
      if (quest.timer.phasesRemaining === 0 && quest.failureConsequence) {
        quest.status = 'failed';
        _log(state, `Quest timer expired: ${quest.title || quest.id}.`);
      }
    }
  }

  function _campRest(state, op) {
    const run = state.activeScenarioRun;
    if (run) {
      const limit = op.maxUsesPerScenario || run.limits?.campRests || 1;
      if ((run.usedCampRests || 0) >= limit && !op.ignoreLimit) {
        _log(state, 'Camp rest skipped: scenario limit reached.');
        return;
      }
      run.usedCampRests = (run.usedCampRests || 0) + 1;
    }
    if (op.consumeItem) _inventory(state, 'items', op.consumeItem, -1);
    const hpPercent = Number(op.hpPercent ?? 50) / 100;
    const mpPercent = Number(op.mpPercent ?? 35) / 100;
    for (const member of Object.values(state.party)) {
      member.currentHp = Math.min(member.maxHp, member.currentHp + Math.ceil((member.maxHp - member.currentHp) * hpPercent));
      member.currentMp = Math.min(member.maxMp, member.currentMp + Math.ceil((member.maxMp - member.currentMp) * mpPercent));
    }
    if (op.dangerChange) _danger(state, op.dangerChange);
    _log(state, 'Camp rest used.');
  }

  function _fullRest(state, op = {}) {
    for (const member of Object.values(state.party)) {
      member.currentHp = member.maxHp;
      member.currentMp = member.maxMp;
      member.statuses = (member.statuses || []).filter((status) => ['campaign', 'manual'].includes(status.duration));
      member.buffs = (member.buffs || []).filter((buff) => ['campaign', 'manual'].includes(buff.duration));
    }
    _log(state, 'Full rest completed.');
    if (op.passPhase) passPhase(state, {});
  }

  function _shopBuy(state, op) {
    const currency = op.currency || _worldCurrency(state);
    const qty = Number(op.qty || 1);
    const price = Number(op.price || 0) * qty;
    const requires = _scaleBundle(op.requires || {}, qty);
    const costs = _scaleBundle(op.costs || op.costBundle || {}, qty);
    if (!_hasBundle(state, requires)) {
      _log(state, `Shop buy skipped: missing requirement for ${op.id}.`);
      return;
    }
    if (!_hasBundle(state, costs)) {
      _log(state, `Shop buy skipped: missing special cost for ${op.id}.`);
      return;
    }
    if ((state.currencies[currency] || 0) < price && !op.allowDebt) {
      _log(state, `Shop buy skipped: not enough ${currency}.`);
      return;
    }
    _money(state, currency, -price);
    if (op.consumeRequires) _consumeBundle(state, requires);
    _consumeBundle(state, costs);
    _inventory(state, op.bucket || _bucketForType(op.type), op.id, qty);
    _log(state, `Bought ${qty} ${op.id}.`);
  }

  function _shopSell(state, op) {
    const currency = op.currency || _worldCurrency(state);
    const qty = Number(op.qty || 1);
    _inventory(state, op.bucket || _bucketForType(op.type), op.id, -qty);
    _money(state, currency, Number(op.price || 0) * qty);
    _log(state, `Sold ${qty} ${op.id}.`);
  }

  function _bucketForType(type) {
    if (type === 'material') return 'materials';
    if (type === 'food') return 'food';
    if (type === 'questItem') return 'questItems';
    return 'items';
  }

  function _craftBasic(state, op) {
    _consumeBundle(state, op.inputs || {});
    _grantBundle(state, op.outputs || {});
    _log(state, `Crafted ${op.label || op.id || 'recipe'}.`);
  }

  function _cookBasic(state, op) {
    _consumeBundle(state, op.inputs || {});
    _grantBundle(state, op.outputs || { food: { [op.id || 'warm_stew']: op.qty || 1 } });
    _log(state, `Cooked ${op.label || op.id || 'food'}.`);
  }

  function _consumeBundle(state, bundle) {
    for (const [id, qty] of Object.entries(bundle.currencies || {})) _money(state, id, -qty);
    for (const [id, qty] of Object.entries(bundle.items || {})) _inventory(state, 'items', id, -qty);
    for (const [id, qty] of Object.entries(bundle.materials || {})) _inventory(state, 'materials', id, -qty);
    for (const [id, qty] of Object.entries(bundle.food || {})) _inventory(state, 'food', id, -qty);
    for (const [id, qty] of Object.entries(bundle.questItems || {})) _inventory(state, 'questItems', id, -qty);
  }

  function _grantBundle(state, bundle) {
    for (const [id, qty] of Object.entries(bundle.currencies || {})) _money(state, id, qty);
    for (const [id, qty] of Object.entries(bundle.items || {})) _inventory(state, 'items', id, qty);
    for (const [id, qty] of Object.entries(bundle.materials || {})) _inventory(state, 'materials', id, qty);
    for (const [id, qty] of Object.entries(bundle.food || {})) _inventory(state, 'food', id, qty);
    for (const [id, qty] of Object.entries(bundle.questItems || {})) _inventory(state, 'questItems', id, qty);
  }

  function _hasBundle(state, bundle) {
    for (const [id, qty] of Object.entries(bundle.currencies || {})) {
      if ((state.currencies[id] || 0) < Number(qty || 0)) return false;
    }
    for (const [bucket, records] of Object.entries({
      items: bundle.items || {},
      materials: bundle.materials || {},
      food: bundle.food || {},
      questItems: bundle.questItems || {}
    })) {
      for (const [id, qty] of Object.entries(records)) {
        if ((state.inventory?.[bucket]?.[id] || 0) < Number(qty || 0)) return false;
      }
    }
    return true;
  }

  function _scaleBundle(bundle, qty) {
    const out = {};
    for (const [bucket, records] of Object.entries(bundle || {})) {
      out[bucket] = {};
      for (const [id, amount] of Object.entries(records || {})) out[bucket][id] = Number(amount || 0) * qty;
    }
    return out;
  }

  function _farmTick(state, amount, log = true) {
    for (const plot of state.pocketHaven.farm.plots || []) {
      if (!plot.seedId || plot.ready) continue;
      plot.progress = Math.min(plot.required || 3, (plot.progress || 0) + Number(amount || 1));
      plot.ready = plot.progress >= (plot.required || 3);
    }
    if (log) _log(state, `Farm growth tick +${amount || 1}.`);
  }

  function _worldTransition(state, op) {
    const fromWorld = state.currentWorld;
    const toWorld = op.toWorld;
    if (!toWorld || toWorld === fromWorld) return;

    state.worldArchive[fromWorld] = {
      currencies: { ...state.currencies },
      inventory: CS().clone(state.inventory),
      quests: CS().clone(state.quests),
      mapState: CS().clone(state.mapState),
      activeScenarioRun: CS().clone(state.activeScenarioRun)
    };

    const archived = state.worldArchive[toWorld];
    const jp = state.currencies.jp || 0;
    if (archived && !op.fresh) {
      state.currencies = { ...archived.currencies, jp };
      state.inventory = archived.inventory || state.inventory;
      state.quests = archived.quests || {};
      state.mapState = archived.mapState || {};
      state.activeScenarioRun = null;
    } else {
      state.currencies = { jp, [`${toWorld}_gold`]: state.currencies[`${toWorld}_gold`] || 0 };
      state.quests = {};
      state.mapState = {};
      state.activeScenarioRun = null;
    }

    state.currentWorld = toWorld;
    state.currentChapter = op.toChapter || 1;
    state.phase = { number: 1, type: op.entryPhase || 'town_phase', name: op.entryPhaseName || 'Arrival Phase' };
    _clearDuration(state, 'scenario');
    _clearDuration(state, 'phase');
    _log(state, `World transition: ${fromWorld} to ${toWorld}.`);
  }

  function _chapterTransition(state, op) {
    state.currentChapter = op.toChapter || ((state.currentChapter || 1) + 1);
    if (op.entryPhase) state.phase = { number: 1, type: op.entryPhase, name: op.entryPhaseName || op.entryPhase };
    _log(state, `Chapter transition: chapter ${state.currentChapter}.`);
  }

  function _resetCampaignState(state, op) {
    const campaign = CS().getCurrentCampaign();
    const next = CS().buildInitialSave(campaign, { slotName: state.slotName, saveId: state.saveId });
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, next);
    _log(state, op.reason || 'Campaign state reset.');
  }

  function _carryoverState(state, op) {
    state.carryoverReview = {
      at: new Date().toISOString(),
      profileId: op.profileId || op.carryoverProfile || 'manual',
      notes: op.notes || ''
    };
    _log(state, `Carryover review recorded: ${state.carryoverReview.profileId}.`);
  }

  function _reputationChange(state, op) {
    const target = op.target || op.id;
    if (!target) return;
    state.reputation = state.reputation || {};
    state.reputation[target] = (state.reputation[target] || 0) + Number(op.amount || 0);
    _log(state, `Reputation ${target} ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}.`);
  }

  function _unlockRecipe(state, op) {
    const recipeId = op.recipeId || op.id;
    if (!recipeId) return;
    state.unlockedRecipes = state.unlockedRecipes || {};
    state.unlockedRecipes[recipeId] = true;
    _log(state, `Unlocked recipe ${recipeId}.`);
  }

  function _hubDefinition(hubId) {
    return DS().get('campaignHubs', hubId) || null;
  }

  function _hubState(state, hubId) {
    const id = hubId || Object.keys(state.hubState || {})[0] || DS().getAllAsArray('campaignHubs')[0]?.id || 'hub_manual';
    state.hubState = state.hubState || {};
    if (!state.hubState[id]) {
      const def = _hubDefinition(id) || {};
      const hubStats = {};
      for (const [stat, config] of Object.entries(def.hubStats || {})) {
        hubStats[stat] = Number(config.default || 0);
      }
      const npcMoods = {};
      for (const npc of def.npcs || []) npcMoods[npc.id] = npc.defaultMood || 'neutral';
      state.hubState[id] = {
        hubId: id,
        mood: def.defaultMood || 'neutral',
        ...hubStats,
        activeProblems: [...(def.startingProblems || [])],
        resolvedProblems: [],
        unlockedServices: (def.locations || []).flatMap((loc) => loc.services || []),
        shopModifiers: {},
        npcMoods,
        rumors: [],
        eventCooldowns: {},
        notes: []
      };
    }
    return state.hubState[id];
  }

  function _hubProblemAdd(state, op) {
    const hub = _hubState(state, op.hubId);
    const problemId = op.problemId || op.id;
    if (!problemId) return;
    hub.activeProblems = hub.activeProblems || [];
    if (!hub.activeProblems.includes(problemId)) hub.activeProblems.push(problemId);
    hub.resolvedProblems = (hub.resolvedProblems || []).filter((id) => id !== problemId);
    if (op.label || op.notes) {
      hub.problemNotes = hub.problemNotes || {};
      hub.problemNotes[problemId] = { label: op.label || problemId, notes: op.notes || '' };
    }
    _log(state, `Hub problem added: ${problemId}.`);
  }

  function _hubProblemRemove(state, op) {
    const hub = _hubState(state, op.hubId);
    const problemId = op.problemId || op.id;
    if (!problemId) return;
    hub.activeProblems = (hub.activeProblems || []).filter((id) => id !== problemId);
    hub.resolvedProblems = hub.resolvedProblems || [];
    if (!hub.resolvedProblems.includes(problemId)) hub.resolvedProblems.push(problemId);
    _log(state, `Hub problem resolved: ${problemId}.`);
  }

  function _hubService(state, op, enabled) {
    const hub = _hubState(state, op.hubId);
    const serviceId = op.serviceId || op.id;
    if (!serviceId) return;
    hub.unlockedServices = hub.unlockedServices || [];
    if (enabled && !hub.unlockedServices.includes(serviceId)) hub.unlockedServices.push(serviceId);
    if (!enabled) hub.unlockedServices = hub.unlockedServices.filter((id) => id !== serviceId);
    _log(state, `${enabled ? 'Unlocked' : 'Locked'} hub service ${serviceId}.`);
  }

  function _hubMoodSet(state, op) {
    const hub = _hubState(state, op.hubId);
    hub.mood = op.mood || 'neutral';
    _log(state, `Hub mood set: ${hub.hubId} -> ${hub.mood}.`);
  }

  function _hubStatChange(state, op) {
    const hub = _hubState(state, op.hubId);
    const stat = op.stat;
    if (!stat) return;
    const def = _hubDefinition(hub.hubId);
    const config = def?.hubStats?.[stat] || {};
    const min = Number(config.min ?? -99);
    const max = Number(config.max ?? 99);
    hub[stat] = Math.max(min, Math.min(max, Number(hub[stat] || 0) + Number(op.amount || 0)));
    _log(state, `Hub ${stat} ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}; now ${hub[stat]}.`);
  }

  function _npcMoodSet(state, op) {
    const hub = _hubState(state, op.hubId);
    const npcId = op.npcId || op.id;
    if (!npcId) return;
    hub.npcMoods = hub.npcMoods || {};
    hub.npcMoods[npcId] = op.mood || 'neutral';
    _log(state, `NPC mood set: ${npcId} -> ${hub.npcMoods[npcId]}.`);
  }

  function _addRumor(state, op) {
    const hub = _hubState(state, op.hubId);
    const rumor = {
      id: op.rumorId || op.id || `rumor_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      text: op.text || '',
      status: op.status || 'active',
      canonRisk: _risk(op.canonRisk),
      tags: op.tags || [],
      createdAtPhase: state.phase?.number || 1,
      source: op.source || 'campaign_ops'
    };
    hub.rumors = hub.rumors || [];
    hub.rumors.unshift(rumor);
    _log(state, `Rumor added: ${rumor.text || rumor.id}.`);
    if (rumor.canonRisk === 'red') {
      _reviewQueueAdd(state, { contentId: rumor.id, canonRisk: 'red', reason: 'Red-risk rumor requires GM review.' });
    }
  }

  function _resolveRumor(state, op) {
    const hub = _hubState(state, op.hubId);
    const rumorId = op.rumorId || op.id;
    const rumor = (hub.rumors || []).find((entry) => entry.id === rumorId);
    if (!rumor) return;
    rumor.status = op.status || 'resolved';
    rumor.resolvedAtPhase = state.phase?.number || 1;
    _log(state, `Rumor ${rumorId} marked ${rumor.status}.`);
  }

  function _risk(value) {
    const normalized = String(value || 'green').toLowerCase();
    if (normalized.includes('red')) return 'red';
    if (normalized.includes('yellow')) return 'yellow';
    return 'green';
  }

  function _sideContentState(state) {
    state.sideContent = state.sideContent || {};
    state.sideContent.generatedIdeas = state.sideContent.generatedIdeas || {};
    state.sideContent.generatedScenarios = state.sideContent.generatedScenarios || {};
    state.sideContent.generatedMaps = state.sideContent.generatedMaps || {};
    state.sideContent.activeQuestChains = state.sideContent.activeQuestChains || {};
    state.sideContent.contentHistory = state.sideContent.contentHistory || [];
    state.sideContent.reviewQueue = state.sideContent.reviewQueue || [];
    state.sideContent.importedPacks = state.sideContent.importedPacks || {};
    return state.sideContent;
  }

  function _history(state, type, title, result) {
    const sc = _sideContentState(state);
    sc.contentHistory.unshift({
      id: `hist_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      phase: state.phase?.number || 1,
      type,
      title,
      result,
      at: new Date().toISOString()
    });
    sc.contentHistory = sc.contentHistory.slice(0, 250);
  }

  function _sideIdeaSave(state, op) {
    const sc = _sideContentState(state);
    const card = CS().clone(op.contentCard || op.card || {});
    card.id = card.id || op.contentId || `idea_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    card.status = op.status || 'saved';
    card.canonRisk = _risk(card.canonRisk);
    card.createdAtPhase = card.createdAtPhase || state.phase?.number || 1;
    card.updatedAt = new Date().toISOString();
    sc.generatedIdeas[card.id] = { ...(sc.generatedIdeas[card.id] || {}), ...card };
    if (op.setLast !== false) state.lastSideContentCard = sc.generatedIdeas[card.id];
    _history(state, card.type || 'side_idea', card.title || card.name || card.id, 'saved');
    _log(state, `Saved side idea: ${card.title || card.name || card.id}.`);
    if (card.canonRisk === 'red') {
      _reviewQueueAdd(state, { contentId: card.id, canonRisk: 'red', reason: card.reviewReason || 'Red-risk side idea requires GM approval.' });
    }
  }

  function _sideIdeaStatus(state, op, status) {
    const sc = _sideContentState(state);
    const id = op.contentId || op.id;
    if (!id || !sc.generatedIdeas[id]) return;
    sc.generatedIdeas[id].status = status;
    sc.generatedIdeas[id].updatedAt = new Date().toISOString();
    if (status === 'rejected') {
      sc.generatedIdeas[id].rejectedReason = op.reason || '';
      sc.generatedIdeas[id].rejectedAtPhase = state.phase?.number || 1;
    }
    _history(state, sc.generatedIdeas[id].type || 'side_idea', sc.generatedIdeas[id].title || id, status);
    _log(state, `Side idea ${id} marked ${status}.`);
  }

  function _sideIdeaPromote(state, op, options = {}) {
    const sc = _sideContentState(state);
    const id = op.contentId || op.id;
    const idea = sc.generatedIdeas[id];
    if (!idea) return;
    idea.status = 'active';
    idea.promotedAtPhase = state.phase?.number || 1;
    idea.targetType = op.targetType || idea.type || 'note';

    if (idea.canonRisk === 'red' && !op.approved) {
      _reviewQueueAdd(state, { contentId: id, canonRisk: 'red', reason: 'Promotion of red-risk content needs GM approval.' });
      _log(state, `Promotion queued for review: ${idea.title || id}.`);
      return;
    }

    if (op.targetType === 'quest' || idea.type === 'quest') {
      _addQuest(state, {
        id: op.questId || `quest_${id}`,
        title: idea.title || idea.name || id,
        summary: idea.summary || idea.prompt || '',
        objectives: idea.objectives || [{ id: 'objective_1', label: 'Resolve the side idea', current: 0, required: 1 }],
        rewards: idea.rewardOps || idea.suggestedOps || []
      }, options);
    } else if (op.targetType === 'quest_chain' || idea.type === 'quest_chain') {
      _startQuestChain(state, { templateId: idea.templateId || id, template: idea.payload || idea });
    } else if (op.targetType === 'battle' || idea.type === 'battle_set') {
      state.pendingBattle = {
        encounterId: idea.encounterId || null,
        battleSetId: idea.battleSetId || id,
        label: idea.title || idea.name || id,
        source: 'side_content',
        defeatOps: idea.defeatOps || idea.lossOps || [],
        drawOps: idea.drawOps || [],
        badEndingOps: idea.badEndingOps || [],
        badEndingOnDefeat: !!idea.badEndingOnDefeat,
        badEndingFlag: idea.badEndingFlag || null,
        defeatOutcome: idea.defeatOutcome || null,
        defeatMode: idea.defeatMode || null,
        defeatNoRecovery: !!(idea.defeatNoRecovery || idea.noDefeatRecovery)
      };
    }

    _history(state, idea.type || 'side_idea', idea.title || id, 'promoted');
    _log(state, `Promoted side idea: ${idea.title || id}.`);
  }

  function _sidePackImport(state, op) {
    const sc = _sideContentState(state);
    const pack = CS().clone(op.pack || {});
    const id = pack.id || op.id || `imported_pack_${Date.now()}`;
    sc.importedPacks[id] = {
      ...pack,
      id,
      importedAt: new Date().toISOString()
    };
    _history(state, 'content_pack', pack.name || id, 'imported');
    _log(state, `Imported side content pack: ${pack.name || id}.`);
  }

  function _reviewQueueAdd(state, op) {
    const sc = _sideContentState(state);
    const contentId = op.contentId || op.id;
    if (!contentId) return;
    const existing = sc.reviewQueue.find((entry) => entry.contentId === contentId && entry.status === 'pending');
    if (existing) return;
    sc.reviewQueue.unshift({
      id: op.reviewId || `review_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      contentId,
      canonRisk: _risk(op.canonRisk || 'red'),
      reason: op.reason || '',
      status: 'pending',
      createdAtPhase: state.phase?.number || 1
    });
    _log(state, `Review queued: ${contentId}.`);
  }

  function _reviewQueueResolve(state, op) {
    const sc = _sideContentState(state);
    const reviewId = op.reviewId || op.id;
    const review = sc.reviewQueue.find((entry) => entry.id === reviewId || entry.contentId === op.contentId);
    if (!review) return;
    review.status = op.decision || 'approved';
    review.resolvedAtPhase = state.phase?.number || 1;
    review.notes = op.notes || review.notes || '';
    if (review.contentId && sc.generatedIdeas[review.contentId]) {
      sc.generatedIdeas[review.contentId].reviewStatus = review.status;
    }
    _log(state, `Review ${review.id} resolved: ${review.status}.`);
  }

  function _findQuestChainTemplate(templateId, override) {
    if (override) return CS().clone(override);
    for (const set of DS().getAllAsArray('questChains')) {
      if (set.id === templateId && (set.steps || set.title || set.name)) return CS().clone(set);
      const chain = (set.chains || set.templates || []).find((entry) => entry.id === templateId);
      if (chain) return CS().clone(chain);
    }
    return null;
  }

  function _startQuestChain(state, op) {
    const sc = _sideContentState(state);
    const templateId = op.templateId || op.id;
    const template = _findQuestChainTemplate(templateId, op.template);
    if (!templateId || !template) return _log(state, `Quest chain start skipped: missing ${templateId}.`);
    const firstStep = op.initialStepId || template.steps?.[0]?.id || 'step_1';
    sc.activeQuestChains[templateId] = {
      templateId,
      title: template.title || template.name || templateId,
      status: 'active',
      currentStepId: firstStep,
      completedSteps: [],
      startedAtPhase: state.phase?.number || 1,
      notes: [],
      rewardsApplied: false
    };
    _history(state, 'quest_chain', template.title || templateId, 'active');
    _log(state, `Started quest chain: ${template.title || templateId}.`);
  }

  function _chainState(state, templateId) {
    const sc = _sideContentState(state);
    return sc.activeQuestChains[templateId] || null;
  }

  function _completeQuestChainStep(state, op) {
    const templateId = op.templateId || op.id;
    const chain = _chainState(state, templateId);
    if (!chain) return;
    const stepId = op.stepId || chain.currentStepId;
    chain.completedSteps = chain.completedSteps || [];
    if (stepId && !chain.completedSteps.includes(stepId)) chain.completedSteps.push(stepId);
    _log(state, `Quest chain step complete: ${templateId} / ${stepId}.`);
  }

  function _advanceQuestChain(state, op) {
    const templateId = op.templateId || op.id;
    const chain = _chainState(state, templateId);
    if (!chain) return;
    const template = _findQuestChainTemplate(templateId, op.template);
    const current = op.completedStepId || chain.currentStepId;
    if (current) _completeQuestChainStep(state, { templateId, stepId: current });
    const steps = template?.steps || [];
    const nextId = op.stepId || steps[steps.findIndex((step) => step.id === current) + 1]?.id || null;
    if (nextId) {
      chain.currentStepId = nextId;
      _log(state, `Quest chain advanced: ${templateId} -> ${nextId}.`);
    } else {
      _completeQuestChain(state, { templateId, applyRewards: op.applyRewards });
    }
  }

  function _completeQuestChain(state, op) {
    const templateId = op.templateId || op.id;
    const chain = _chainState(state, templateId);
    if (!chain || chain.status === 'complete') return;
    const template = _findQuestChainTemplate(templateId, op.template);
    chain.status = 'complete';
    chain.completedAtPhase = state.phase?.number || 1;
    if (op.applyRewards !== false && !chain.rewardsApplied) {
      chain.rewardsApplied = true;
      const rewards = template?.rewardOps || template?.rewards || [];
      for (const reward of rewards) _applyOne(state, reward, { source: 'quest_chain_reward' });
    }
    _history(state, 'quest_chain', chain.title || templateId, 'complete');
    _log(state, `Quest chain complete: ${chain.title || templateId}.`);
  }

  function _failQuestChain(state, op) {
    const templateId = op.templateId || op.id;
    const chain = _chainState(state, templateId);
    if (!chain) return;
    const template = _findQuestChainTemplate(templateId, op.template);
    chain.status = 'failed';
    chain.failedAtPhase = state.phase?.number || 1;
    if (op.applyConsequences) {
      for (const consequence of template?.failureOps || template?.failureConsequences || []) _applyOne(state, consequence, { source: 'quest_chain_failure' });
    }
    _log(state, `Quest chain failed: ${chain.title || templateId}.`);
  }

  function _clockAdd(state, op) {
    const id = op.clockId || op.id;
    if (!id) return;
    state.clocks = state.clocks || {};
    state.clocks[id] = {
      label: op.label || id,
      current: Number(op.current || 0),
      max: Number(op.max || 6),
      status: op.status || 'active',
      notes: op.notes || '',
      ...(state.clocks[id] || {})
    };
    _log(state, `Clock added: ${state.clocks[id].label}.`);
  }

  function _clockTick(state, op) {
    const id = op.clockId || op.id;
    if (!id) return;
    if (!state.clocks?.[id]) _clockAdd(state, { clockId: id, label: op.label, max: op.max });
    const clock = state.clocks[id];
    clock.current = Math.max(0, Math.min(clock.max || 6, Number(clock.current || 0) + Number(op.amount || 1)));
    if (clock.current >= (clock.max || 6)) clock.status = op.completeStatus || 'complete';
    _log(state, `Clock ${id} ${Number(op.amount || 1) >= 0 ? '+' : ''}${op.amount || 1}; now ${clock.current}/${clock.max}.`);
  }

  function _clockReset(state, op) {
    const clock = state.clocks?.[op.clockId || op.id];
    if (!clock) return;
    clock.current = 0;
    clock.status = 'active';
    _log(state, `Clock reset: ${op.clockId || op.id}.`);
  }

  function _clockComplete(state, op) {
    const clock = state.clocks?.[op.clockId || op.id];
    if (!clock) return;
    clock.current = clock.max || 6;
    clock.status = op.status || 'complete';
    _log(state, `Clock complete: ${op.clockId || op.id}.`);
  }

  function _memoryShardAdd(state, op) {
    const id = op.shardId || op.id || `shard_${Date.now()}`;
    state.memoryShards = state.memoryShards || {};
    state.memoryShards[id] = {
      id,
      title: op.title || id,
      text: op.text || '',
      source: op.source || 'manual',
      canonRisk: _risk(op.canonRisk),
      status: op.status || 'candidate',
      createdAtPhase: state.phase?.number || 1
    };
    if (_risk(op.canonRisk) !== 'green') _reviewQueueAdd(state, { contentId: id, canonRisk: op.canonRisk, reason: 'Memory shard touches canon-sensitive material.' });
    _log(state, `Memory shard recorded: ${state.memoryShards[id].title}.`);
  }

  function _bondChange(state, op) {
    const npcId = op.npcId || op.target || op.id;
    const field = op.field || 'value';
    if (!npcId) return;
    state.bonds = state.bonds || {};
    state.bonds[npcId] = state.bonds[npcId] || {};
    state.bonds[npcId][field] = (state.bonds[npcId][field] || 0) + Number(op.amount || 0);
    _log(state, `Bond ${npcId}.${field} ${Number(op.amount || 0) >= 0 ? '+' : ''}${op.amount || 0}.`);
  }

  function _rollCheck(state, op) {
    const roll = D().d20 ? D().d20().total : Math.floor(Math.random() * 20) + 1;
    const stat = op.stat || 'L';
    const best = _bestPartyStat(state, stat);
    const total = roll + best.value;
    const dc = Number(op.dc || 10);
    const success = total >= dc;
    _log(state, `Check ${stat} DC ${dc}: ${roll}+${best.value} (${best.name}) = ${total}; ${success ? 'success' : 'fail'}.`);
    for (const child of (success ? op.success : op.fail) || []) _applyOne(state, child, { source: 'check' });
  }

  function _bestPartyStat(state, stat) {
    let best = { id: null, name: 'party', value: 0 };
    for (const [id, member] of Object.entries(state.party)) {
      const base = DS().get('characters', member.baseCharacterId || id);
      const value = (base?.stats?.[stat] || 0) + (member.statOverrides?.[stat] || 0);
      if (value > best.value) best = { id, name: member.name || id, value };
    }
    return best;
  }

  function _rollEvent(state, op) {
    const Events = window.CJS.CampaignEvents;
    if (!Events) return;
    const scenario = CS().getActiveScenario?.();
    const node = window.CJS.ScenarioRunner?.findCurrentNode?.();
    const cell = window.CJS.ScenarioRunner?.findCurrentCell?.();
    const context = {
      world: state.currentWorld,
      setting: scenario?.setting || op.setting || '',
      tags: [...(op.tags || []), ...(scenario?.tags || []), ...(node?.tags || []), ...(cell?.tags || [])],
      locationKind: node?.kind || cell?.kind || '',
      chance: op.chance,
      afterBattle: !!op.afterBattle
    };
    const tables = op.table ? [op.table] : (scenario?.eventTables || CS().getCurrentCampaign()?.eventTables || []);
    const tableId = Events.pickTable ? Events.pickTable(tables, context) : tables[0];
    const result = Events.roll(tableId, context);
    if (result) {
      state.lastEvent = result;
      _log(state, `Rolled event: ${result.title || result.id}.`);
    }
  }

  function _rollRandomBattle(state, op) {
    const result = window.CJS.ScenarioRunner?.rollRandomBattle(op.table);
    if (result) state.pendingBattle = result;
  }

  function _startBattle(state, op) {
    state.pendingBattle = {
      encounterId: op.encounterId,
      battleSetId: op.battleSetId || null,
      monsterIds: op.monsterIds || [],
      label: op.label || op.encounterId,
      nodeId: op.nodeId || state.activeScenarioRun?.currentNode || null,
      source: op.source || 'manual',
      rewardOps: op.rewardOps || [],
      defeatOps: op.defeatOps || op.lossOps || [],
      drawOps: op.drawOps || [],
      badEndingOps: op.badEndingOps || [],
      badEndingOnDefeat: !!op.badEndingOnDefeat,
      badEndingFlag: op.badEndingFlag || null,
      defeatOutcome: op.defeatOutcome || null,
      defeatMode: op.defeatMode || null,
      defeatNoRecovery: !!(op.defeatNoRecovery || op.noDefeatRecovery),
      notes: op.notes || '',
      objective: op.objective || '',
      battleMap: op.battleMap || null,
      setting: op.setting || null
    };
    _log(state, `Battle ready: ${state.pendingBattle.label}.`);
  }

  function _manualBattleResult(state, op, options = {}) {
    const outcome = String(op.result || 'victory').toLowerCase();
    const pending = state.pendingBattle || {};
    _log(state, `Manual battle result: ${outcome || 'resolved'}${op.summary ? ` - ${op.summary}` : ''}.`);
    for (const change of op.changes || []) _applyOne(state, change, { source: 'manual_battle' });
    _applyBattleSetback(state, outcome, op);
    if (outcome === 'victory' && op.applyRewards !== false) {
      for (const reward of pending.rewardOps || []) _applyOne(state, reward, { source: 'battle_set_reward' });
    }
    if (state.activeScenarioRun) {
      state.activeScenarioRun.completedBattles.push({
        at: new Date().toISOString(),
        result: outcome || 'manual',
        summary: op.summary || '',
        encounterId: op.encounterId || pending.encounterId || null
      });
    }
    state.lastCombatResult = {
      result: outcome || 'manual',
      summary: op.summary || '',
      encounterId: op.encounterId || pending.encounterId || null,
      battleSetId: pending.battleSetId || null,
      label: pending.label || op.encounterId || '',
      rounds: Number(op.rounds || 0),
      loot: Array.isArray(op.loot) ? op.loot : [],
      completedAt: op.completedAt || new Date().toISOString(),
      source: options.source || op.source || 'manual'
    };
    state.lastCombatResultKey = op.resultKey || op.requestId || [
      state.saveId,
      state.lastCombatResult.encounterId,
      state.lastCombatResult.completedAt,
      state.lastCombatResult.result
    ].filter(Boolean).join('|');
    state.pendingBattle = null;
  }

  function _applyBattleSetback(state, outcome, op = {}) {
    if (!['defeat', 'draw'].includes(outcome) || op.penaltyApplied || op.applyDefaultPenalty === false) return;
    const pending = state.pendingBattle || {};
    const badEnding = outcome === 'defeat' && _isBadEndingDefeat(op, pending);
    const customOps = outcome === 'defeat'
      ? _asOps((badEnding && (op.badEndingOps || pending.badEndingOps)) || op.defeatOps || op.lossOps || pending.defeatOps || pending.lossOps || [])
      : _asOps(op.drawOps || pending.drawOps || []);
    if (badEnding) _markBadEndingBranch(state, op, pending);
    if (customOps.length) {
      for (const change of customOps) _applyOne(state, change, { source: 'battle_setback' });
      return;
    }
    _applyDefaultBattleSetback(state, outcome, { ...pending, ...op });
  }

  function _asOps(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value];
  }

  function _isBadEndingDefeat(op = {}, pending = {}) {
    return !!(
      op.badEnding ||
      op.badEndingOnDefeat ||
      pending.badEndingOnDefeat ||
      op.defeatOutcome === 'bad_ending' ||
      pending.defeatOutcome === 'bad_ending' ||
      op.defeatMode === 'bad_ending' ||
      pending.defeatMode === 'bad_ending'
    );
  }

  function _markBadEndingBranch(state, op = {}, pending = {}) {
    const flag = op.badEndingFlag || pending.badEndingFlag || 'bad_ending_pending';
    _setFlag(state, flag, true, {
      encounterId: op.encounterId || pending.encounterId || null,
      battleSetId: pending.battleSetId || null,
      label: pending.label || op.summary || 'Battle defeat',
      at: new Date().toISOString()
    });
    _log(state, `Defeat opened a bad-ending branch: ${pending.label || op.encounterId || 'battle'}.`);
  }

  function _applyDefaultBattleSetback(state, outcome, op = {}) {
    const recovered = op.defeatNoRecovery || op.noDefeatRecovery ? 0 : _recoverPartyAfterSetback(state, outcome);
    const dangerApplied = !!state.activeScenarioRun;
    if (dangerApplied) _danger(state, outcome === 'draw' ? 1 : 2);
    const currency = op.currency || _worldCurrency(state);
    const balance = Number(state.currencies?.[currency] || 0);
    const lossRate = outcome === 'draw' ? 0.05 : 0.10;
    const moneyLoss = balance > 0 ? Math.max(1, Math.floor(balance * lossRate)) : 0;
    if (moneyLoss > 0) _money(state, currency, -moneyLoss);
    const recoveredText = recovered ? ` ${recovered} KO ally${recovered === 1 ? '' : 'ies'} recovered enough to move.` : '';
    const dangerText = dangerApplied ? 'danger rose' : 'no scenario danger changed';
    const moneyText = moneyLoss > 0 ? `${moneyLoss} ${currency} lost` : 'no currency was lost';
    _log(state, `${outcome === 'draw' ? 'Draw consequence' : 'Defeat penalty'}: ${dangerText}; ${moneyText}.${recoveredText}`);
  }

  function _recoverPartyAfterSetback(state, outcome) {
    let recovered = 0;
    for (const member of Object.values(state.party || {})) {
      if (Number(member.currentHp || 0) > 0) continue;
      member.currentHp = _setbackRecoveryHp(member, outcome);
      recovered += 1;
    }
    return recovered;
  }

  function _setbackRecoveryHp(member = {}, outcome) {
    const maxHp = Math.max(1, Number(member.maxHp || 1));
    const rate = outcome === 'draw' ? 0.25 : 0.10;
    return Math.max(1, Math.floor(maxHp * rate));
  }

  return Object.freeze({
    apply,
    describe,
    passPhase
  });
})();
