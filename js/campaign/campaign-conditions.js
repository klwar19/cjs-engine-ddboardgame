// campaign-conditions.js
// Shared campaign-side condition evaluator for story and quest availability.

window.CJS = window.CJS || {};

window.CJS.CampaignConditions = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Tags = () => window.CJS.CampaignTags;

  function evaluate(conditions = {}, state = null, context = {}) {
    state = state || CS()?.getState?.() || {};
    const cond = Array.isArray(conditions) ? { all: conditions } : (conditions || {});
    const reasons = [];
    const blockers = [];
    let score = 0;

    for (const child of cond.all || []) {
      const result = evaluate(child, state, context);
      score += result.score || 0;
      reasons.push(...result.reasons);
      blockers.push(...result.blockers);
    }
    const any = cond.any || cond.anyOf || [];
    if (any.length) {
      const results = any.map((child) => evaluate(child, state, context));
      if (!results.some((entry) => entry.ok)) blockers.push(cond.reason || 'No alternate condition matched.');
      const best = results.sort((a, b) => (b.score || 0) - (a.score || 0))[0] || {};
      score += best.score || 0;
      reasons.push(...(best.reasons || []));
    }

    const activeTags = new Set([
      ...Array.from(Tags()?.tagSet?.(state) || []),
      ...personaTags(state),
      ...asArray(context.tags),
      ...asArray(context.contextTags)
    ].map(cleanTag).filter(Boolean));

    requireAll(activeTags, cond.requiresTags || cond.allTags, blockers, 'Needs tag');
    requireAny(activeTags, cond.requiresAnyTags || cond.anyTags, blockers, 'Needs one tag');
    blockAny(activeTags, cond.blocksTags || cond.blockedByTags, blockers, 'Blocked by tag');
    score += countMatches(activeTags, cond.preferredTags) * 2;

    const activePersonas = personaIds(state);
    requireAny(activePersonas, cond.requiresPersonas || cond.requiresPersona, blockers, 'Needs persona');
    blockAny(activePersonas, cond.blocksPersonas || cond.blocksPersona, blockers, 'Blocked by persona');

    requireFlags(state, cond.requiresFlags || cond.flags, blockers);
    blockFlags(state, cond.blocksFlags || cond.blockedByFlags, blockers);

    if (cond.world && state.currentWorld !== cond.world) blockers.push(`Needs world ${cond.world}.`);
    if (cond.phaseTypes?.length && !cond.phaseTypes.includes(state.phase?.type)) blockers.push(`Needs phase ${cond.phaseTypes.join(', ')}.`);
    if (cond.chapterMin != null && Number(state.currentChapter || 1) < Number(cond.chapterMin)) blockers.push(`Needs chapter ${cond.chapterMin}.`);
    if (cond.chapterMax != null && Number(state.currentChapter || 1) > Number(cond.chapterMax)) blockers.push(`Past chapter ${cond.chapterMax}.`);

    if (cond.storyStageIds?.length) {
      const stage = state.storyDirector?.activeStageId;
      if (!cond.storyStageIds.includes(stage)) blockers.push('Needs a different story stage.');
    }

    if (cond.requiresQuestStatus) {
      for (const [questId, status] of Object.entries(cond.requiresQuestStatus)) {
        if (String(state.quests?.[questId]?.status || '') !== String(status)) blockers.push(`Quest ${questId} must be ${status}.`);
      }
    }

    for (const check of asArray(cond.bondMin)) {
      const value = Number(state.bonds?.[check.npcId || check.id]?.[check.field || 'trust'] || 0);
      if (value < Number(check.value ?? check.min ?? 0)) blockers.push(`Needs bond ${check.npcId || check.id}.`);
    }

    for (const [metric, min] of Object.entries(cond.metricMin || {})) {
      if (Number(state.storyDirector?.metrics?.[metric] || 0) < Number(min)) blockers.push(`Needs metric ${metric} ${min}.`);
    }

    const statResults = evaluateStatChecks(cond.statChecks || cond.statMin, state, context);
    blockers.push(...statResults.blockers);
    score += statResults.score;
    reasons.push(...statResults.reasons);

    if (!blockers.length && cond.reason) reasons.push(cond.reason);
    return { ok: blockers.length === 0, score, reasons, blockers };
  }

  function evaluateStatChecks(statChecks, state = {}, context = {}) {
    const checks = Array.isArray(statChecks)
      ? statChecks
      : Object.entries(statChecks || {}).map(([stat, min]) => ({ stat, min }));
    const party = context.party || state.party || {};
    const fallbackStats = context.stats || {};
    const blockers = [];
    const reasons = [];
    let score = 0;

    for (const check of checks) {
      const stat = check.stat || check.id;
      if (!stat) continue;
      const targetId = check.characterId || check.target || context.characterId || null;
      const member = targetId ? party[targetId] : Object.values(party)[0];
      const value = Number(
        check.value
        ?? member?.stats?.[stat]
        ?? member?.compiledStats?.[stat]
        ?? fallbackStats[stat]
        ?? 0
      ) + Number(check.modifier || 0);
      const min = Number(check.min ?? check.dc ?? 0);
      if (value < min) blockers.push(`${stat} ${value}/${min}`);
      else {
        score += Math.max(1, value - min + 1);
        reasons.push(`${stat} check met`);
      }
    }
    return { blockers, reasons, score };
  }

  function requireAll(activeTags, tags, blockers, prefix) {
    for (const tag of asArray(tags).map(cleanTag).filter(Boolean)) {
      if (!activeTags.has(tag)) blockers.push(`${prefix}: ${tag}.`);
    }
  }

  function requireAny(activeTags, tags, blockers, prefix) {
    const list = asArray(tags).map(cleanTag).filter(Boolean);
    if (list.length && !list.some((tag) => activeTags.has(tag))) blockers.push(`${prefix}: ${list.join(' or ')}.`);
  }

  function blockAny(activeTags, tags, blockers, prefix) {
    for (const tag of asArray(tags).map(cleanTag).filter(Boolean)) {
      if (activeTags.has(tag)) blockers.push(`${prefix}: ${tag}.`);
    }
  }

  function requireFlags(state, flags, blockers) {
    for (const flag of asArray(flags)) {
      if (!state.flags?.[flag]) blockers.push(`Needs flag ${flag}.`);
    }
  }

  function blockFlags(state, flags, blockers) {
    for (const flag of asArray(flags)) {
      if (state.flags?.[flag]) blockers.push(`Blocked by flag ${flag}.`);
    }
  }

  function countMatches(activeTags, tags) {
    return asArray(tags).map(cleanTag).filter((tag) => tag && activeTags.has(tag)).length;
  }

  function personaIds(state = {}) {
    return new Set(Object.values(state.party || {})
      .map((member) => member.activePersona)
      .filter(Boolean)
      .map(cleanTag));
  }

  function personaTags(state = {}) {
    const PS = window.CJS.PersonaService;
    if (!PS) return [];
    const currentWorld = state.currentWorld || '';
    const out = [];
    for (const member of Object.values(state.party || {})) {
      const persona = PS.getActivePersona?.(member);
      if (!persona) continue;
      out.push(...(persona.tags || []), persona.id);
      const rel = PS.relationshipModifier?.(member, currentWorld);
      out.push(...(rel?.tags || []));
      if (PS.isOutOfWorld?.(member, currentWorld)) {
        out.push(...(persona.crossWorldPenalty?.tags || []), 'persona_out_of_world');
      }
    }
    return out;
  }

  function asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function cleanTag(value) {
    return window.CJS.CampaignTags?.cleanTag?.(value)
      || String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_');
  }

  return Object.freeze({
    evaluate,
    evaluateStatChecks
  });
})();
