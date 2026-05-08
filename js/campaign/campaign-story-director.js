// campaign-story-director.js
// Table-driven story beat director for solo/GM play.

window.CJS = window.CJS || {};

window.CJS.CampaignStoryDirector = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Ops = () => window.CJS.CampaignOps;
  const Side = () => window.CJS.CampaignSideContent;

  const KIND_TO_FIELD = {
    scene: 'sceneBeats',
    peri: 'periInterruptions',
    memory: 'memoryShards',
    pressure: 'pressureTicks'
  };

  function getPack(packId) {
    const state = CS().getState();
    const world = state?.currentWorld || CS().getCurrentCampaign()?.world || 'haven';
    return Loader().getStoryDirectorPack(packId, world) || null;
  }

  function getStage(pack = getPack(), state = CS().getState()) {
    if (!pack) return null;
    const stages = pack.stages || [];
    const explicit = state?.storyDirector?.activeStageId;
    if (explicit) {
      const found = stages.find((stage) => stage.id === explicit);
      if (found) return found;
    }
    const chapter = Number(state?.currentChapter || 1);
    return stages.find((stage) =>
      chapter >= Number(stage.chapterMin || stage.chapter || 1) &&
      chapter <= Number(stage.chapterMax || stage.chapter || 999)
    ) || stages[0] || null;
  }

  function snapshot() {
    const state = CS().getState();
    const pack = getPack();
    const stage = getStage(pack, state);
    const sd = state?.storyDirector || {};
    return {
      pack,
      stage,
      mode: sd.mode || 'solo_gm',
      metrics: sd.metrics || {},
      queue: Object.values(sd.storyQueue || {}),
      clues: Object.values(sd.clueLedger || {}),
      facts: Object.values(sd.revealedFacts || {}),
      threads: Object.values(sd.threadStatus || {}),
      flow: sideQuestFlowForStage(stage?.id, pack),
      last: state?.lastStoryDirectorBeat || null
    };
  }

  function roll(kind = 'scene', options = {}) {
    const state = CS().getState();
    const pack = getPack(options.packId);
    const stage = getStage(pack, state);
    if (!pack || !stage) return null;
    const normalizedKind = KIND_TO_FIELD[kind] ? kind : 'scene';
    const source = pack[KIND_TO_FIELD[normalizedKind]] || [];
    const context = _context(pack, stage, state, normalizedKind, options);
    const pool = source.filter((entry) => _eligible(entry, context));
    const picked = _pickWeighted(_preferFresh(pool, state));
    if (!picked) return null;
    const card = _cardFromEntry(picked, normalizedKind, pack, stage, context);

    CS().mutate((next) => {
      _ensureStoryState(next);
      next.lastStoryDirectorBeat = card;
      const historyId = picked.id || card.id;
      next.storyDirector.lastBeatIds.unshift(historyId);
      next.storyDirector.lastBeatIds = next.storyDirector.lastBeatIds.slice(0, 12);
      next.log.unshift({
        id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        at: new Date().toISOString(),
        phase: next.phase?.number || 1,
        world: next.currentWorld,
        text: `Story Director rolled: ${card.title || card.id}.`,
        op: `story_${normalizedKind}`
      });
      next.log = next.log.slice(0, 500);
    }, { source: 'story_director_roll' });

    return card;
  }

  function saveLast(status = 'saved') {
    const card = CS().getState()?.lastStoryDirectorBeat;
    if (!card) return null;
    Ops().apply({ op: 'story_beat_save', beat: card, status }, { source: 'story_director' });
    return card;
  }

  function rejectLast() {
    const card = CS().getState()?.lastStoryDirectorBeat;
    if (!card) return null;
    Ops().apply({ op: 'story_beat_save', beat: card, status: 'rejected' }, { source: 'story_director' });
    CS().mutate((state) => { state.lastStoryDirectorBeat = null; }, { source: 'story_director_reject' });
    return card;
  }

  function applyChoice(cardId, choiceIndex = 0) {
    const state = CS().getState();
    const card = _findCard(state, cardId);
    if (!card) return { error: 'missing_card' };
    const risk = Side().risk(card.canonRisk);
    if (risk === 'red' && card.approved !== true) {
      Ops().apply([
        { op: 'story_beat_save', beat: card, status: 'review' },
        { op: 'side_idea_save', contentCard: Side().normalizeCard(card, { type: card.type || 'story_director' }), status: 'idea' },
        { op: 'review_queue_add', contentId: card.id, canonRisk: 'red', reason: card.reviewReason || 'Story Director beat touches protected canon.' }
      ], { source: 'story_director_review' });
      return { queued: true, card };
    }

    const choice = _choice(card, choiceIndex);
    const ops = [
      { op: 'story_beat_save', beat: card, status: 'active' },
      ...(choice.ops || []),
      { op: 'story_beat_resolve', beatId: card.id, status: 'resolved', resolution: choice.label || 'Applied' }
    ];
    Ops().apply(ops, { source: 'story_director_apply' });
    return { applied: true, card, choice };
  }

  function setStage(stageId) {
    Ops().apply({ op: 'story_stage_set', stageId }, { source: 'story_director' });
  }

  function sideQuestFlowForStage(stageId, pack = getPack()) {
    if (!pack || !stageId) return null;
    return (pack.sideQuestFlow || []).find((flow) => flow.stageId === stageId) || null;
  }

  function syncSideQuestFlow(stageId) {
    const state = CS().getState();
    const pack = getPack();
    const stage = stageId ? (pack?.stages || []).find((entry) => entry.id === stageId) : getStage(pack, state);
    const flow = sideQuestFlowForStage(stage?.id, pack);
    if (!flow) return { error: 'missing_flow' };
    const key = `${pack.id}:${flow.stageId}`;
    if (state.storyDirector?.sideQuestSync?.[key]) return { already: true, flow };
    Ops().apply(flow.ops || [], { source: 'story_director_side_flow' });
    CS().mutate((next) => {
      _ensureStoryState(next);
      next.storyDirector.sideQuestSync[key] = {
        syncedAtPhase: next.phase?.number || 1,
        syncedAt: new Date().toISOString()
      };
    }, { source: 'story_director_side_flow' });
    return { synced: true, flow };
  }

  function _ensureStoryState(state) {
    state.storyDirector = state.storyDirector || {};
    state.storyDirector.storyQueue = state.storyDirector.storyQueue || {};
    state.storyDirector.clueLedger = state.storyDirector.clueLedger || {};
    state.storyDirector.revealedFacts = state.storyDirector.revealedFacts || {};
    state.storyDirector.threadStatus = state.storyDirector.threadStatus || {};
    state.storyDirector.metrics = state.storyDirector.metrics || {};
    state.storyDirector.lastBeatIds = state.storyDirector.lastBeatIds || [];
    state.storyDirector.sideQuestSync = state.storyDirector.sideQuestSync || {};
  }

  function _context(pack, stage, state, kind, options = {}) {
    const activeScenario = CS().getActiveScenario?.();
    const activeMap = CS().getActiveMap?.();
    const run = state?.activeScenarioRun || null;
    const nodeId = run?.currentNode || null;
    const node = nodeId && activeMap?.nodes ? activeMap.nodes.find((entry) => entry.id === nodeId) : null;
    return {
      pack,
      stage,
      kind,
      world: state?.currentWorld,
      chapter: state?.currentChapter || 1,
      phaseType: state?.phase?.type || '',
      scenarioId: activeScenario?.id || '',
      locationKind: options.locationKind || node?.kind || '',
      tags: new Set([
        ...(stage.tags || []),
        ...(activeScenario?.tags || []),
        ...(node?.tags || []),
        ...(options.tags || [])
      ].map((tag) => String(tag).toLowerCase())),
      flags: state?.flags || {},
      story: state?.storyDirector || {},
      danger: state?.danger || 0
    };
  }

  function _eligible(entry, context) {
    if (!entry || entry.disabled) return false;
    if (entry.stageIds?.length && !entry.stageIds.includes(context.stage.id)) return false;
    if (entry.phaseTypes?.length && !entry.phaseTypes.includes(context.phaseType)) return false;
    if (entry.scenarioIds?.length && !entry.scenarioIds.includes(context.scenarioId)) return false;
    if (entry.locationKinds?.length && !entry.locationKinds.includes(context.locationKind)) return false;
    for (const flag of entry.requiresFlags || []) if (!context.flags[flag]) return false;
    for (const flag of entry.blocksFlags || []) if (context.flags[flag]) return false;
    for (const fact of entry.requiresFacts || []) if (!context.story.revealedFacts?.[fact]) return false;
    for (const fact of entry.blocksFacts || []) if (context.story.revealedFacts?.[fact]) return false;
    if (entry.tags?.length && context.tags.size) {
      const tags = entry.tags.map((tag) => String(tag).toLowerCase());
      if (!tags.some((tag) => context.tags.has(tag))) return false;
    }
    return true;
  }

  function _preferFresh(pool, state) {
    if (!pool.length) return pool;
    const recent = new Set(state?.storyDirector?.lastBeatIds || []);
    const fresh = pool.filter((entry) => !recent.has(entry.id));
    return fresh.length ? fresh : pool;
  }

  function _pickWeighted(pool) {
    if (!pool.length) return null;
    const total = pool.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight || 1)), 0);
    let rollValue = Math.random() * total;
    for (const entry of pool) {
      rollValue -= Math.max(1, Number(entry.weight || 1));
      if (rollValue <= 0) return entry;
    }
    return pool[pool.length - 1];
  }

  function _cardFromEntry(entry, kind, pack, stage, context) {
    const id = `story_${kind}_${entry.id || 'beat'}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const suggestedChoices = (entry.suggestedChoices || entry.choices || []).map((choice) => ({
      ...choice,
      ops: choice.ops || []
    }));
    return {
      ...CS().clone(entry),
      id,
      sourceId: entry.id || '',
      sourcePackId: pack.id,
      type: `story_${kind}`,
      kind,
      title: entry.title || entry.name || _label(kind),
      stageId: stage.id,
      stageName: stage.name || stage.id,
      world: context.world,
      phaseType: context.phaseType,
      canonRisk: Side().risk(entry.canonRisk || pack.defaultCanonRisk || 'green'),
      suggestedChoices,
      createdAtPhase: CS().getState()?.phase?.number || 1,
      rolledAt: new Date().toISOString()
    };
  }

  function _findCard(state, id) {
    if (!id) return state?.lastStoryDirectorBeat || null;
    if (state?.lastStoryDirectorBeat?.id === id) return state.lastStoryDirectorBeat;
    return state?.storyDirector?.storyQueue?.[id] || null;
  }

  function _choice(card, index) {
    const choices = card.suggestedChoices || card.choices || [];
    return choices[index] || {
      label: 'Accept as story note',
      ops: [{ op: 'log', text: card.prompt || card.text || card.summary || card.title || 'Story beat accepted.' }]
    };
  }

  function _label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  return Object.freeze({
    getPack,
    getStage,
    snapshot,
    roll,
    saveLast,
    rejectLast,
    applyChoice,
    setStage,
    sideQuestFlowForStage,
    syncSideQuestFlow
  });
})();
