// campaign-quest-pulse.ts — Tier 3 TS port of js/campaign/campaign-quest-pulse.js
// (engine cluster: campaign). Converts combat + phase facts into light quest
// progress: repeatable-quest prep/reset + variant picking, combat-pulse tag
// extraction, quest-objective trigger matching, and battle-context builders.
// DOM-free; reads window.CJS.* (CampaignState/DataStore/Conditions/Tags) lazily.
//
// Exports `CampaignQuestPulse` and installs window.CJS.CampaignQuestPulse. Body
// verbatim from the legacy IIFE; only `: any` added to the {}/null/destructured
// default params (and Object.values<any> where the element is read).

window.CJS = window.CJS || {};

export const CampaignQuestPulse = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;
  const Conditions = () => window.CJS.CampaignConditions;
  const Tags = () => window.CJS.CampaignTags;

  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function prepareQuest(rawQuest, state = null) {
    const quest = clone(rawQuest) || {};
    if (!quest.id) quest.id = `quest_${Date.now()}`;
    if (isRepeatable(quest)) {
      if (!quest.repeatBaseObjectives && quest.objectives) quest.repeatBaseObjectives = clone(quest.objectives);
      if (!quest.repeatBaseTags) quest.repeatBaseTags = clone(quest.tags || []);
      if (!quest.repeatBaseContextTags) quest.repeatBaseContextTags = clone(quest.contextTags || []);
      if (!quest.repeatBaseMonsterTags) quest.repeatBaseMonsterTags = clone(quest.monsterTags || []);
      quest.repeatCycle = Number(quest.repeatCycle || 0);
      quest.activeVariant = pickVariant(quest, state || CS()?.getState?.());
      applyVariant(quest, quest.activeVariant);
    }
    quest.contextTags = uniqueTags([...(quest.contextTags || []), ...(quest.activeVariant?.contextTags || [])]);
    quest.monsterTags = uniqueTags([...(quest.monsterTags || []), ...(quest.activeVariant?.monsterTags || [])]);
    return quest;
  }

  function isRepeatable(quest: any = {}) {
    const repeat = quest.repeat || {};
    return !!(quest.repeatable || repeat.reset || repeat.resetOnPhase || repeat.frequency || repeat.variants?.length || quest.repeatVariants?.length);
  }

  function resetRepeatableQuests(state) {
    const summaries = [];
    if (!state?.quests) return summaries;
    for (const quest of Object.values<any>(state.quests)) {
      if (!isRepeatable(quest)) continue;
      const repeat = quest.repeat || {};
      const reset = String(repeat.reset || repeat.resetOnPhase || repeat.frequency || '').toLowerCase();
      if (!['phase', 'pass_phase', 'daily', 'repeat'].includes(reset)) continue;
      const resolved = ['complete', 'completed', 'failed'].includes(String(quest.status || 'active'));
      if (!resolved && !repeat.refreshActive) continue;

      quest.status = 'active';
      quest.repeatCycle = Number(quest.repeatCycle || 0) + 1;
      const baseObjectives = clone(quest.repeatBaseObjectives || repeat.baseObjectives || quest.objectives || []);
      quest.objectives = baseObjectives.map((objective) => ({
        ...objective,
        current: Number(objective.start ?? 0)
      }));
      quest.tags = clone(quest.repeatBaseTags || quest.tags || []);
      quest.contextTags = clone(quest.repeatBaseContextTags || quest.contextTags || []);
      quest.monsterTags = clone(quest.repeatBaseMonsterTags || quest.monsterTags || []);
      if (quest.timer) {
        const phases = repeat.phasesRemaining || repeat.timerPhases || quest.timer.startingPhases || quest.timer.initialPhases || quest.timer.phasesMax;
        if (phases) quest.timer.phasesRemaining = Number(phases);
      }
      quest.activeVariant = pickVariant(quest, state);
      applyVariant(quest, quest.activeVariant);
      summaries.push(`${quest.title || quest.id}${quest.activeVariant?.label ? `: ${quest.activeVariant.label}` : ''}`);
    }
    return summaries;
  }

  function pickVariant(quest: any = {}, state: any = null) {
    const variants = [
      ...(quest.repeat?.variants || []),
      ...(quest.repeatVariants || [])
    ];
    if (!variants.length) return null;
    const context = {
      tags: uniqueTags([...(quest.tags || []), ...(quest.contextTags || [])]),
      quest
    };
    const weighted = variants.map((variant, index) => {
      const result = variant.conditions
        ? Conditions()?.evaluate?.(variant.conditions, state || {}, context)
        : { ok: true, score: 0 };
      if (result && !result.ok) return null;
      const phase = Number(state?.phase?.number || 1);
      const cycle = Number(quest.repeatCycle || 0);
      const seed = hash(`${quest.id}:${phase}:${cycle}:${variant.id || index}`);
      return {
        variant,
        weight: Math.max(1, Number(variant.weight || 1) + Number(result?.score || 0)),
        seed
      };
    }).filter(Boolean);
    if (!weighted.length) return variants[0] || null;
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = weighted.reduce((sum, entry) => sum + entry.seed, 0) % total;
    for (const entry of weighted) {
      pick -= entry.weight;
      if (pick < 0) return clone(entry.variant);
    }
    return clone(weighted[0].variant);
  }

  function applyVariant(quest: any = {}, variant: any = null) {
    if (!variant) return quest;
    if (variant.summary) quest.variantSummary = variant.summary;
    if (variant.dialogue) quest.variantDialogue = variant.dialogue;
    quest.tags = uniqueTags([...(quest.tags || []), ...(variant.tags || [])]);
    quest.contextTags = uniqueTags([...(quest.contextTags || []), ...(variant.contextTags || [])]);
    quest.monsterTags = uniqueTags([...(quest.monsterTags || []), ...(variant.monsterTags || [])]);
    for (const override of variant.objectiveOverrides || []) {
      const objective = (quest.objectives || []).find((entry) => entry.id === override.id);
      if (objective) Object.assign(objective, override);
    }
    return quest;
  }

  function buildCombatPulse({ request = {}, combatState = {}, entries = [] }: any = {}) {
    const tags = new Set();
    const playerActionTags = new Set();
    const skillUse = {};
    const statusIds = new Set();
    const defeatedEnemies = [];

    addTags(tags, request.tags);
    addTags(tags, request.questContext?.tags);
    addTags(tags, request.questContext?.contextTags);
    addTags(tags, request.questContext?.monsterTags);
    addTags(tags, request.battleSetCard?.tags?.map((tag) => `battle_tag:${tag}`));
    if (request.battleSetId) tags.add(`battle_set:${request.battleSetId}`);
    if (request.encounterId) tags.add(`encounter:${request.encounterId}`);
    if (combatState?.winner) tags.add(`outcome:${combatState.winner === 'player' ? 'victory' : combatState.winner === 'enemy' ? 'defeat' : 'draw'}`);

    for (const entry of entries || []) {
      addTags(tags, entry.tags);
      if (isPlayerEntry(entry)) addTags(playerActionTags, entry.tags);
      if ((entry.type === 'skill_used' || entry.tags?.includes('skill_used')) && isPlayerEntry(entry)) {
        const skillId = entry.data?.skill || fromTag(entry.tags, 'skill_');
        if (skillId) skillUse[skillId] = (skillUse[skillId] || 0) + 1;
        addTags(playerActionTags, entry.data?.skillTags);
        addTags(playerActionTags, entry.data?.questBehaviorTags);
      }
      if (entry.type === 'status_applied' || entry.tags?.includes('status_applied')) {
        const statusId = entry.data?.statusId || fromTag(entry.tags, 'status_');
        if (statusId) statusIds.add(statusId);
      }
    }

    const units = Object.values<any>(combatState?.units || {});
    for (const unit of units.filter((entry) => entry.team === 'enemy' && Number(entry.currentHP || 0) <= 0)) {
      const id = unit.baseId || unit.id || unit.instanceId;
      const monster = DS()?.get?.('monsters', id) || {};
      const defeated = {
        id,
        name: unit.name || monster.name || id,
        type: unit.type || monster.type || '',
        rank: unit.rank || monster.rank || 'F',
        tags: monsterTags(Object.keys(monster || {}).length ? monster : unit)
      };
      defeatedEnemies.push(defeated);
      tags.add(`defeated:${defeated.id}`);
      if (defeated.type) tags.add(`defeated_type:${defeated.type}`);
      for (const tag of defeated.tags) tags.add(`defeated_tag:${tag}`);
    }

    for (const [skillId, count] of Object.entries<any>(skillUse)) {
      tags.add(`skill:${skillId}`);
      tags.add(`skill_${skillId}`);
      const skill = DS()?.get?.('skills', skillId);
      addTags(tags, skill?.questBehaviorTags?.map((tag) => `behavior:${tag}`));
      addTags(tags, skill?.tags?.map((tag) => `skill_tag:${tag}`));
      if (count > 1) tags.add(`skill_repeat:${skillId}`);
    }
    for (const statusId of statusIds) {
      tags.add(`status:${statusId}`);
      tags.add(`status_${statusId}`);
    }

    return {
      tags: Array.from(tags).map(cleanTag).filter(Boolean),
      playerActionTags: Array.from(playerActionTags).map(cleanTag).filter(Boolean),
      skillUse,
      statusIds: Array.from(statusIds),
      defeatedEnemies,
      questContext: request.questContext || null,
      battleSetId: request.battleSetId || null,
      encounterId: request.encounterId || null,
      summary: pulseSummary({ tags, skillUse, statusIds, defeatedEnemies })
    };
  }

  function opsForCombatResult(state, result: any = {}) {
    const pulse = result.combatPulse || result.pulse || {};
    const pulseTags = new Set((pulse.tags || []).map(cleanTag));
    if (result.result) pulseTags.add(`outcome:${String(result.result).toLowerCase()}`);
    const ops = [];
    const progressed = new Set();

    for (const quest of Object.values<any>(state?.quests || {})) {
      if (!quest || ['complete', 'completed', 'failed'].includes(String(quest.status || 'active'))) continue;
      for (const objective of quest.objectives || []) {
        if ((objective.current || 0) >= (objective.required || 1)) continue;
        for (const trigger of objective.progressTriggers || []) {
          const match = triggerMatches(trigger, { pulse, pulseTags, result, state, quest, objective });
          if (!match.ok) continue;
          const key = `${quest.id}:${objective.id}:${trigger.id || trigger.label || ops.length}`;
          if (progressed.has(key)) continue;
          progressed.add(key);
          ops.push({
            op: 'update_quest_progress',
            questId: quest.id,
            objectiveId: objective.id,
            amount: Number(trigger.amount || 1)
          });
          for (const tag of trigger.addTags || []) ops.push({ op: 'tag_add', tag, scope: 'quest', targetType: 'quest', targetId: quest.id, source: 'quest_pulse' });
          for (const tag of trigger.resolveTags || []) ops.push({ op: 'tag_resolve', tag, scope: 'quest', targetType: 'quest', targetId: quest.id, source: 'quest_pulse' });
          for (const extra of trigger.ops || []) ops.push(extra);
          ops.push({ op: 'log', text: trigger.log || `Quest pulse: ${quest.title || quest.id} - ${objective.label || objective.id}.` });
          break;
        }
      }
    }

    for (const chain of Object.values<any>(state?.sideContent?.activeQuestChains || {})) {
      if (!chain || String(chain.status || 'active') !== 'active') continue;
      const quest = state.quests?.[chain.questId];
      const objective = quest?.objectives?.find((entry) => entry.id === chain.currentStepId);
      if (!objective?.progressTriggers?.length) continue;
      if ((objective.current || 0) >= (objective.required || 1)) continue;
      if (!objective.progressTriggers.some((trigger) => trigger.advanceStep !== false && triggerMatches(trigger, { pulse, pulseTags, result, state, quest, objective }).ok)) continue;
      ops.push({ op: 'advance_quest_chain_step', templateId: chain.templateId, applyRewards: false });
    }

    return ops;
  }

  function triggerMatches(trigger: any = {}, ctx: any = {}) {
    const { pulse, pulseTags, result, state, quest, objective } = ctx;
    const blockers = [];
    if (trigger.outcome && String(trigger.outcome).toLowerCase() !== String(result.result || '').toLowerCase()) blockers.push('outcome');
    requireAll(pulseTags, trigger.requiresTags || trigger.allTags, blockers);
    requireAny(pulseTags, trigger.requiresAnyTags || trigger.anyTags, blockers);
    blockAny(pulseTags, trigger.blocksTags, blockers);
    requireAny(new Set(Object.keys(pulse.skillUse || {})), trigger.skillIds, blockers);
    requireAny(new Set(pulse.statusIds || []), trigger.statusIds, blockers);
    requireAny(new Set((pulse.defeatedEnemies || []).map((enemy) => enemy.id)), trigger.defeatedMonsterIds, blockers);
    requireAny(new Set((pulse.defeatedEnemies || []).map((enemy) => enemy.type).filter(Boolean)), trigger.defeatedTypes, blockers);
    if (trigger.onlyPlayerActionTags?.length) {
      const allowed = new Set(trigger.onlyPlayerActionTags.map(cleanTag));
      const playerTags = (pulse.playerActionTags || []).filter((tag) => /^skill_|^skill:|^behavior:|^basic_attack|^attack$/.test(tag));
      if (playerTags.some((tag) => !allowed.has(tag) && !String(tag).startsWith('type_') && !String(tag).startsWith('phase_'))) blockers.push('player actions');
    }
    if (trigger.conditions) {
      const resultEval = Conditions()?.evaluate?.(trigger.conditions, state, { quest, objective, tags: Array.from(pulseTags) });
      if (resultEval && !resultEval.ok) blockers.push(...resultEval.blockers);
    }
    return { ok: blockers.length === 0, blockers };
  }

  function battleContextForQuest(quest: any = {}) {
    return {
      questId: quest.id || null,
      questTitle: quest.title || quest.id || '',
      questChainId: quest.chainTemplateId || null,
      tags: uniqueTags(['quest', quest.id, ...(quest.tags || [])]),
      contextTags: uniqueTags([...(quest.contextTags || []), ...(quest.activeVariant?.contextTags || [])]),
      monsterTags: uniqueTags([...(quest.monsterTags || []), ...(quest.activeVariant?.monsterTags || [])]),
      variant: quest.activeVariant || null
    };
  }

  function battleContextForPending(state: any = null, pendingBattle: any = null) {
    state = state || CS()?.getState?.() || {};
    pendingBattle = pendingBattle || state.pendingBattle || {};
    const questId = pendingBattle.questId || state.activeScenarioRun?.questId || pendingBattle.questContext?.questId;
    const quest = questId ? state.quests?.[questId] : null;
    const base = quest ? battleContextForQuest(quest) : { tags: [], contextTags: [], monsterTags: [] };
    return {
      ...base,
      tags: uniqueTags([...(base.tags || []), ...(pendingBattle.tags || []), ...(pendingBattle.questContext?.tags || [])]),
      contextTags: uniqueTags([...(base.contextTags || []), ...(pendingBattle.contextTags || []), ...(pendingBattle.questContext?.contextTags || [])]),
      monsterTags: uniqueTags([...(base.monsterTags || []), ...(pendingBattle.monsterTags || []), ...(pendingBattle.questContext?.monsterTags || [])]),
      objectiveId: pendingBattle.objectiveId || state.activeScenarioRun?.questObjectiveId || null,
      battleSetId: pendingBattle.battleSetId || null
    };
  }

  function pulseSummary({ tags, skillUse, statusIds, defeatedEnemies }: any) {
    const bits = [];
    const skills = Object.keys(skillUse || {});
    if (skills.length) bits.push(`Skills: ${skills.slice(0, 3).join(', ')}`);
    if (statusIds?.size || statusIds?.length) bits.push(`Statuses: ${Array.from(statusIds).slice(0, 3).join(', ')}`);
    if (defeatedEnemies?.length) bits.push(`Defeated: ${defeatedEnemies.map((enemy) => enemy.name || enemy.id).slice(0, 3).join(', ')}`);
    const behavior = Array.from(tags || []).filter((tag) => String(tag).startsWith('behavior:')).slice(0, 3);
    if (behavior.length) bits.push(`Behavior: ${behavior.map((tag: any) => tag.replace('behavior:', '')).join(', ')}`);
    return bits.join(' | ') || 'Combat facts recorded.';
  }

  function monsterTags(monster: any = {}) {
    const text = [monster.id, monster.name, monster.type, monster.rank, monster.description, ...(monster.tags || [])].join(' ');
    return uniqueTags([
      ...(monster.tags || []),
      monster.type,
      ...String(text || '').toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length > 2)
    ]);
  }

  function fromTag(tags = [], prefix) {
    const found = tags.find((tag) => String(tag).startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  }

  function isPlayerEntry(entry: any = {}) {
    return entry.actor?.team === 'player' || (entry.tags || []).includes('actor_team_player');
  }

  function requireAll(active, tags, blockers) {
    for (const tag of asArray(tags).map(cleanTag).filter(Boolean)) if (!active.has(tag)) blockers.push(tag);
  }

  function requireAny(active, tags, blockers) {
    const list = asArray(tags).map(cleanTag).filter(Boolean);
    if (list.length && !list.some((tag) => active.has(tag))) blockers.push(list.join('/'));
  }

  function blockAny(active, tags, blockers) {
    for (const tag of asArray(tags).map(cleanTag).filter(Boolean)) if (active.has(tag)) blockers.push(tag);
  }

  function addTags(target, tags) {
    for (const tag of asArray(tags)) {
      const cleaned = cleanTag(tag);
      if (cleaned) target.add(cleaned);
    }
  }

  function uniqueTags(tags) {
    return Array.from(new Set(asArray(tags).map(cleanTag).filter(Boolean)));
  }

  function asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function cleanTag(value) {
    return Tags()?.cleanTag?.(value)
      || String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function hash(value) {
    let out = 0;
    for (const ch of String(value || '')) out = ((out << 5) - out + ch.charCodeAt(0)) | 0;
    return Math.abs(out);
  }

  return Object.freeze({
    prepareQuest,
    isRepeatable,
    resetRepeatableQuests,
    buildCombatPulse,
    opsForCombatResult,
    battleContextForQuest,
    battleContextForPending,
    triggerMatches,
    monsterTags
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignQuestPulse = CampaignQuestPulse;
