// campaign-conditions.ts — Tier 3 TS port of js/campaign/campaign-conditions.js
// (engine cluster: campaign). Shared campaign-side condition evaluator for story
// and quest availability: tags / personas / flags / story parts / world+rank /
// chapter / bonds / metrics / alignment / cross-world milestones+pressures /
// stat checks. DOM-free; reads window.CJS.* (CampaignState/Tags/Sequences/
// Alignment/PersonaService/RelationshipTiers/Formulas/DataStore) lazily.
//
// Exports `CampaignConditions` and installs window.CJS.CampaignConditions. Body
// verbatim from the legacy IIFE; only `: any` annotations added to the
// `{}`/`null`-default params so tsc accepts the property reads.

window.CJS = window.CJS || {};

export const CampaignConditions = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Tags = () => window.CJS.CampaignTags;
  const Seq = () => window.CJS.CampaignSequences;

  function evaluate(conditions: any = {}, state: any = null, context: any = {}) {
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
      ...(window.CJS.CampaignAlignment?.tagsForState?.(state) || []),
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
    requireStoryParts(state, cond.requiresStoryParts, blockers);
    blockStoryParts(state, cond.blocksStoryParts, blockers);

    if (cond.world && state.currentWorld !== cond.world) blockers.push(`Needs world ${cond.world}.`);
    if (cond.locationIds?.length) {
      const progress = state.worldProgress?.[state.currentWorld] || {};
      if (!cond.locationIds.includes(progress.currentLocation)) blockers.push('Needs a different location.');
    }
    if (cond.phaseTypes?.length && !cond.phaseTypes.includes(state.phase?.type)) blockers.push(`Needs phase ${cond.phaseTypes.join(', ')}.`);
    if (cond.worldMinRank) {
      const F = window.CJS.Formulas;
      const DS = window.CJS.DataStore;
      const worldRec = DS?.get?.('worlds', state.currentWorld) || {};
      const ceiling = worldRec.ceiling || 'F';
      if (F && !F.meetsRank(ceiling, cond.worldMinRank)) {
        blockers.push(`Needs a world ranked ${cond.worldMinRank} or higher (here: ${ceiling}).`);
      }
    }
    if (cond.memberRankMin) {
      const F = window.CJS.Formulas;
      const party = Object.values(state.party || {});
      const anyMeets = party.some((member: any) => F?.meetsRank?.(member.adventurer?.rank || member.rank, cond.memberRankMin));
      if (!anyMeets) blockers.push(`Needs a party member at rank ${cond.memberRankMin} or higher.`);
    }
    if (cond.chapterMin != null && Number(state.currentChapter || 1) < Number(cond.chapterMin)) blockers.push(`Needs chapter ${cond.chapterMin}.`);
    if (cond.chapterMax != null && Number(state.currentChapter || 1) > Number(cond.chapterMax)) blockers.push(`Past chapter ${cond.chapterMax}.`);
    requireStoryOrder(state, cond.storyOrderMin || cond.chapterOrderMin, blockers, 'min');
    requireStoryOrder(state, cond.storyOrderMax || cond.chapterOrderMax, blockers, 'max');

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
      const npcId = check.npcId || check.id;
      const bondEntry = state.bonds?.[npcId] || {};

      // Tier check (e.g. tierMin: 'friend') — uses RelationshipTiers helper.
      const tierMin = check.tierMin || check.tier;
      if (tierMin) {
        const RT = window.CJS.RelationshipTiers;
        if (RT && !RT.meetsTier(bondEntry, tierMin)) {
          blockers.push(`Needs ${npcId} at ${tierMin} tier.`);
        }
        continue;
      }

      const value = Number(bondEntry[check.field || 'trust'] || 0);
      const target = Number(check.value ?? check.min ?? 0);
      const op = check.op || '>=';
      let ok;
      switch (op) {
        case '<':  ok = value <  target; break;
        case '<=': ok = value <= target; break;
        case '==': ok = value === target; break;
        case '!=': ok = value !== target; break;
        case '>':  ok = value >  target; break;
        case '>=': default: ok = value >= target; break;
      }
      if (!ok) blockers.push(`Needs bond ${npcId} ${op} ${target}.`);
    }

    for (const [metric, min] of Object.entries(cond.metricMin || {})) {
      if (Number(state.storyDirector?.metrics?.[metric] || 0) < Number(min)) blockers.push(`Needs metric ${metric} ${min}.`);
    }

    const alignmentResult = window.CJS.CampaignAlignment?.evaluateConditions?.(cond, state, context);
    if (alignmentResult) {
      blockers.push(...(alignmentResult.blockers || []));
      reasons.push(...(alignmentResult.reasons || []));
      score += alignmentResult.score || 0;
    }

    for (const id of asArray(cond.requiresMilestones || cond.requiresCrossMilestones)) {
      if (!state.crossWorld?.milestones?.[id]?.value) blockers.push(`Needs milestone ${id}.`);
    }
    for (const id of asArray(cond.blocksMilestones || cond.blocksCrossMilestones)) {
      if (state.crossWorld?.milestones?.[id]?.value) blockers.push(`Blocked by milestone ${id}.`);
    }
    for (const [pressureId, min] of Object.entries(cond.pressureMin || cond.crossPressureMin || {})) {
      const value = Number(state.crossWorld?.pressures?.[pressureId]?.value || 0);
      if (value < Number(min)) blockers.push(`Needs pressure ${pressureId} ${min}.`);
    }
    for (const [pressureId, max] of Object.entries(cond.pressureMax || cond.crossPressureMax || {})) {
      const value = Number(state.crossWorld?.pressures?.[pressureId]?.value || 0);
      if (value > Number(max)) blockers.push(`Pressure ${pressureId} above ${max}.`);
    }
    for (const [worldId, chapter] of Object.entries(cond.worldChapterMin || {})) {
      const value = Number(state.worldProgress?.[worldId]?.currentChapter || 1);
      if (value < Number(chapter)) blockers.push(`Needs ${worldId} chapter ${chapter}.`);
    }
    for (const [worldId, arcId] of Object.entries(cond.worldCompletedArc || {})) {
      const arcs = state.worldProgress?.[worldId]?.completedArcs || [];
      if (!arcs.includes(arcId)) blockers.push(`Needs ${worldId} arc ${arcId}.`);
    }

    const statResults = evaluateStatChecks(cond.statChecks || cond.statMin, state, context);
    blockers.push(...statResults.blockers);
    score += statResults.score;
    reasons.push(...statResults.reasons);

    if (!blockers.length && cond.reason) reasons.push(cond.reason);
    return { ok: blockers.length === 0, score, reasons, blockers };
  }

  function evaluateStatChecks(statChecks, state: any = {}, context: any = {}) {
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

  function requireStoryParts(state, partIds, blockers) {
    for (const partId of asArray(partIds)) {
      if (!state.storyMode?.partResults?.[partId]) blockers.push(`Needs story part ${partId}.`);
    }
  }

  function blockStoryParts(state, partIds, blockers) {
    for (const partId of asArray(partIds)) {
      if (state.storyMode?.partResults?.[partId]) blockers.push(`Blocked by story part ${partId}.`);
    }
  }

  function requireStoryOrder(state, targetOrder, blockers, mode = 'min') {
    if (!targetOrder) return;
    const currentOrder = state.storyMode?.currentChapterOrderKey || state.storyMode?.currentChapterLabel || state.currentChapter || 1;
    const compare = Seq()?.compareOrderKeys
      ? Seq().compareOrderKeys(String(currentOrder), String(targetOrder))
      : _compareOrderFallback(String(currentOrder), String(targetOrder));
    if (mode === 'min' && compare < 0) blockers.push(`Needs story order ${targetOrder}.`);
    if (mode === 'max' && compare > 0) blockers.push(`Past story order ${targetOrder}.`);
  }

  function _compareOrderFallback(left = '', right = '') {
    const a = String(left || '').split(/[^a-zA-Z0-9]+/g).filter(Boolean);
    const b = String(right || '').split(/[^a-zA-Z0-9]+/g).filter(Boolean);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      if (a[i] == null) return -1;
      if (b[i] == null) return 1;
      const numA = /^\d+$/.test(a[i]) ? Number(a[i]) : null;
      const numB = /^\d+$/.test(b[i]) ? Number(b[i]) : null;
      if (numA != null && numB != null) {
        if (numA < numB) return -1;
        if (numA > numB) return 1;
        continue;
      }
      const textA = String(a[i]).toLowerCase();
      const textB = String(b[i]).toLowerCase();
      if (textA < textB) return -1;
      if (textA > textB) return 1;
    }
    return 0;
  }

  function personaIds(state: any = {}) {
    return new Set(Object.values(state.party || {})
      .map((member: any) => member.activePersona)
      .filter(Boolean)
      .map(cleanTag));
  }

  function personaTags(state: any = {}) {
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

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignConditions = CampaignConditions;
