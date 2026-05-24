// campaign-alignment.js
// Soft choice-consequence tracking for story branches, dialogue, NPC reactions,
// and future route planning.

window.CJS = window.CJS || {};

window.CJS.CampaignAlignment = (() => {
  'use strict';

  const DEFAULT_ACTOR = 'bin';
  const AXIS_LIMIT = 6;
  const HISTORY_LIMIT = 80;
  const POTENTIAL_LIMIT = 80;

  const AXES = Object.freeze({
    mercy: { id: 'mercy', label: 'Mercy', low: 'hard-edged', high: 'merciful' },
    resolve: { id: 'resolve', label: 'Resolve', low: 'cautious', high: 'bold' },
    wit: { id: 'wit', label: 'Wit', low: 'straight-faced', high: 'playful' },
    duty: { id: 'duty', label: 'Duty', low: 'free-agent', high: 'responsible' }
  });

  const CONDITION_KEYS = [
    'alignmentMin',
    'alignmentMax',
    'karmaMin',
    'karmaMax',
    'worldAlignmentMin',
    'worldAlignmentMax',
    'potentialAlignmentMin',
    'potentialAlignmentMax',
    'alignmentChecks'
  ];

  function initialState() {
    return {
      version: 1,
      actors: {
        [DEFAULT_ACTOR]: _emptyActor()
      },
      reactionQueue: [],
      futureHooks: []
    };
  }

  function normalizeState(state = {}) {
    state.choiceConsequences = _normalizeLedger(state.choiceConsequences || {});
    return state.choiceConsequences;
  }

  function _normalizeLedger(ledger = {}) {
    const next = {
      version: Number(ledger.version || 1),
      actors: ledger.actors && typeof ledger.actors === 'object' ? ledger.actors : {},
      reactionQueue: Array.isArray(ledger.reactionQueue) ? ledger.reactionQueue : [],
      futureHooks: Array.isArray(ledger.futureHooks) ? ledger.futureHooks : []
    };
    _actor(next, DEFAULT_ACTOR);
    for (const id of Object.keys(next.actors || {})) _normalizeActor(next.actors[id]);
    next.reactionQueue = next.reactionQueue.slice(0, HISTORY_LIMIT);
    next.futureHooks = next.futureHooks.slice(0, HISTORY_LIMIT);
    return next;
  }

  function _emptyActor() {
    return {
      axes: _zeroAxes(),
      worlds: {},
      history: [],
      potential: []
    };
  }

  function _normalizeActor(actor = {}) {
    actor.axes = _normalizeAxes(actor.axes);
    actor.worlds = actor.worlds && typeof actor.worlds === 'object' ? actor.worlds : {};
    actor.history = Array.isArray(actor.history) ? actor.history : [];
    actor.potential = Array.isArray(actor.potential) ? actor.potential : [];
    for (const worldState of Object.values(actor.worlds)) {
      worldState.axes = _normalizeAxes(worldState.axes);
      worldState.history = Array.isArray(worldState.history) ? worldState.history : [];
    }
    actor.history = actor.history.slice(0, HISTORY_LIMIT);
    actor.potential = actor.potential.slice(0, POTENTIAL_LIMIT);
    return actor;
  }

  function _zeroAxes() {
    return Object.fromEntries(Object.keys(AXES).map((axis) => [axis, 0]));
  }

  function _normalizeAxes(value = {}) {
    const axes = _zeroAxes();
    for (const axis of Object.keys(AXES)) {
      axes[axis] = _clamp(Number(value?.[axis] || 0));
    }
    return axes;
  }

  function _actor(ledger, actorId = DEFAULT_ACTOR) {
    const id = _cleanId(actorId) || DEFAULT_ACTOR;
    ledger.actors[id] = _normalizeActor(ledger.actors[id] || _emptyActor());
    return ledger.actors[id];
  }

  function _worldActor(actor, worldId = 'global') {
    const id = _cleanId(worldId) || 'global';
    actor.worlds[id] = actor.worlds[id] || { axes: _zeroAxes(), history: [] };
    actor.worlds[id].axes = _normalizeAxes(actor.worlds[id].axes);
    actor.worlds[id].history = Array.isArray(actor.worlds[id].history) ? actor.worlds[id].history : [];
    return actor.worlds[id];
  }

  function applyChange(state = {}, op = {}) {
    const ledger = normalizeState(state);
    const actorId = op.actor || op.characterId || op.target || DEFAULT_ACTOR;
    const world = op.world || state.currentWorld || 'global';
    const deltas = normalizeDeltas(op.alignment ?? op.karma ?? op.deltas ?? op.delta ?? _singleDelta(op));
    if (!_hasDeltas(deltas)) return null;

    const entry = _historyEntry({
      type: op.op || 'alignment_change',
      actor: actorId,
      world,
      label: op.label || op.title || op.reason || 'Alignment shift',
      summary: op.summary || op.text || '',
      deltas,
      tags: op.tags || [],
      source: op.source || op.op || 'alignment_change',
      sequenceId: op.sequenceId || '',
      nodeId: op.nodeId || '',
      choiceId: op.choiceId || ''
    });
    _commitDeltas(ledger, entry);
    _queueSideEffects(ledger, entry, op);
    return entry;
  }

  function recordChoice(state = {}, op = {}) {
    const ledger = normalizeState(state);
    const actorId = op.actor || op.characterId || DEFAULT_ACTOR;
    const world = op.world || state.currentWorld || 'global';
    const deltas = normalizeDeltas(op.alignment ?? op.karma ?? op.consequencePoints ?? op.alignmentDelta ?? op.deltas);
    const entry = _historyEntry({
      type: 'choice',
      actor: actorId,
      world,
      label: op.label || op.choiceLabel || op.choiceId || 'Choice',
      summary: op.summary || op.text || '',
      deltas,
      tags: op.tags || [],
      source: op.source || 'sequence_choice',
      sequenceId: op.sequenceId || '',
      nodeId: op.nodeId || '',
      choiceId: op.choiceId || op.id || ''
    });

    _commitDeltas(ledger, entry);
    _queueSideEffects(ledger, entry, op);
    if (op.potential || op.potentialAlignment) {
      addPotential(state, {
        actor: actorId,
        world,
        label: op.potentialLabel || `Future path from ${entry.label}`,
        source: 'choice_potential',
        sequenceId: entry.sequenceId,
        nodeId: entry.nodeId,
        choiceId: entry.choiceId,
        alignment: op.potentialAlignment || op.potential
      });
    }
    return entry;
  }

  function addPotential(state = {}, op = {}) {
    const ledger = normalizeState(state);
    const actorId = op.actor || op.characterId || DEFAULT_ACTOR;
    const world = op.world || state.currentWorld || 'global';
    const deltas = normalizeDeltas(op.alignment ?? op.karma ?? op.potential ?? op.deltas ?? _singleDelta(op));
    if (!_hasDeltas(deltas)) return null;
    const actor = _actor(ledger, actorId);
    const entry = {
      id: op.id || `potential_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      actor: _cleanId(actorId) || DEFAULT_ACTOR,
      world: _cleanId(world) || 'global',
      label: op.label || op.title || 'Future alignment option',
      summary: op.summary || op.text || '',
      deltas,
      source: op.source || 'manual',
      sequenceId: op.sequenceId || '',
      nodeId: op.nodeId || '',
      choiceId: op.choiceId || '',
      group: op.group || op.groupId || '',
      tags: _asArray(op.tags),
      active: op.active !== false,
      at: op.at || new Date().toISOString()
    };
    actor.potential.unshift(entry);
    actor.potential = actor.potential.slice(0, POTENTIAL_LIMIT);
    return entry;
  }

  function normalizeDeltas(value) {
    const deltas = _zeroAxes();
    if (!value) return deltas;
    if (Array.isArray(value)) {
      for (const entry of value) _mergeDelta(deltas, entry);
      return deltas;
    }
    if (typeof value === 'object') {
      if (value.axis || value.id) _mergeDelta(deltas, value);
      else {
        for (const [axis, amount] of Object.entries(value)) {
          if (AXES[axis]) deltas[axis] += _boundedStep(amount);
        }
      }
    }
    return deltas;
  }

  function snapshot(state = {}, options = {}) {
    const ledger = state.choiceConsequences || initialState();
    const actorId = options.actor || DEFAULT_ACTOR;
    const world = options.world || state.currentWorld || 'global';
    const actor = _normalizeActor((ledger.actors || {})[_cleanId(actorId) || DEFAULT_ACTOR] || _emptyActor());
    const worldState = _worldActor(actor, world);
    const potential = options.includePotential === false ? [] : collectPotential(state, { actor: actorId, world });
    const range = _potentialRange(actor.axes, potential);
    return {
      actor: _cleanId(actorId) || DEFAULT_ACTOR,
      world: _cleanId(world) || 'global',
      axes: { ...actor.axes },
      worldAxes: { ...worldState.axes },
      potential,
      range,
      recent: actor.history.slice(0, Number(options.recentLimit || 5)),
      reactionQueue: _asArray(ledger.reactionQueue).slice(0, 5),
      futureHooks: _asArray(ledger.futureHooks).slice(0, 5)
    };
  }

  function collectPotential(state = {}, options = {}) {
    const ledger = state.choiceConsequences || {};
    const actorId = _cleanId(options.actor || DEFAULT_ACTOR) || DEFAULT_ACTOR;
    const world = _cleanId(options.world || state.currentWorld || 'global') || 'global';
    const actor = _normalizeActor((ledger.actors || {})[actorId] || _emptyActor());
    const entries = [];

    for (const entry of actor.potential || []) {
      if (entry.active === false) continue;
      if (entry.world && entry.world !== world && entry.world !== 'global') continue;
      entries.push({ ...entry, reachable: true, sourceType: 'ledger' });
    }

    const Seq = window.CJS.CampaignSequences;
    const storyEntries = Seq?.list?.('story', world) || [];
    for (const indexEntry of storyEntries) {
      if (!indexEntry?.id || state.storyMode?.partResults?.[indexEntry.id]) continue;
      _pushPotential(entries, _entryPotential(indexEntry, world, state));
      const sequence = Seq?.cachedSequence?.(indexEntry.id, world);
      if (!sequence) continue;
      for (const node of sequence.nodes || []) {
        if (String(node.type || '').toLowerCase() !== 'choice') continue;
        for (const choice of node.choices || []) {
          const deltas = normalizeDeltas(choice.potentialAlignment ?? choice.potential ?? choice.alignment ?? choice.karma ?? choice.consequencePoints ?? choice.alignmentDelta);
          _pushPotential(entries, {
            actor: choice.actor || node.actor || DEFAULT_ACTOR,
            world,
            label: choice.label || choice.text || choice.id || 'Future choice',
            summary: choice.summary || node.prompt || node.text || '',
            deltas,
            source: 'sequence_choice',
            sourceType: 'sequence',
            sequenceId: sequence.id || indexEntry.id,
            nodeId: node.id || '',
            choiceId: choice.id || '',
            group: `${sequence.id || indexEntry.id}:${node.id || 'choice'}`,
            tags: [..._asArray(node.tags), ..._asArray(choice.tags)],
            reachable: _simpleReachable(indexEntry, state)
          });
        }
      }
    }

    return entries
      .filter((entry) => entry.actor === actorId || !entry.actor || entry.actor === DEFAULT_ACTOR)
      .filter((entry) => _hasDeltas(entry.deltas))
      .slice(0, POTENTIAL_LIMIT);
  }

  function formatForPrompt(state = {}, options = {}) {
    const snap = snapshot(state, options);
    const axisLine = Object.keys(AXES)
      .map((axis) => `${AXES[axis].label} ${_signed(snap.axes[axis])} (${_tone(axis, snap.axes[axis])})`)
      .join(', ');
    const worldLine = Object.keys(AXES)
      .map((axis) => `${AXES[axis].label} ${_signed(snap.worldAxes[axis])}`)
      .join(', ');
    const potentialLine = Object.keys(AXES)
      .map((axis) => {
        const range = snap.range[axis] || { min: snap.axes[axis], max: snap.axes[axis] };
        return `${AXES[axis].label} ${_signed(range.min)}..${_signed(range.max)}`;
      })
      .join(', ');
    const recent = snap.recent.length
      ? snap.recent.map((entry) => `- ${entry.label || entry.choiceId || 'Choice'}: ${_deltaText(entry.deltas) || 'tracked'}`).join('\n')
      : '- No recorded consequence choices yet.';
    const hooks = [...snap.futureHooks, ...snap.reactionQueue].slice(0, 5);
    const hookText = hooks.length
      ? hooks.map((entry) => `- ${entry.label || entry.npcId || entry.summary || entry.type || 'Hook'}${entry.summary ? `: ${entry.summary}` : ''}`).join('\n')
      : '- None queued.';
    const potentialHints = snap.potential.slice(0, 5).map((entry) =>
      `- ${entry.label || entry.choiceId || entry.sequenceId}: ${_deltaText(entry.deltas)}${entry.reachable === false ? ' (locked path)' : ''}`
    ).join('\n') || '- No authored potential points visible yet.';

    return [
      `Choice consequence tracker (${snap.actor}, ${snap.world}):`,
      `Current leanings: ${axisLine}.`,
      `This world only: ${worldLine}.`,
      `Reachable/potential range: ${potentialLine}.`,
      'Recent consequence choices:',
      recent,
      'Potential future points:',
      potentialHints,
      'NPC reactions and future hooks:',
      hookText,
      'Authoring keys: choices may use small alignment deltas like {"mercy":1}, and branches may use conditions.alignmentMin, worldAlignmentMin, or potentialAlignmentMin.'
    ].join('\n');
  }

  function evaluateConditions(cond = {}, state = {}, context = {}) {
    if (!CONDITION_KEYS.some((key) => cond[key] != null)) return null;
    const actorId = context.actor || cond.actor || cond.characterId || DEFAULT_ACTOR;
    const world = context.world || cond.world || state.currentWorld || 'global';
    const snap = snapshot(state, { actor: actorId, world });
    const blockers = [];
    const reasons = [];
    let score = 0;

    _checkMap(cond.alignmentMin || cond.karmaMin, snap.axes, blockers, reasons, 'Alignment', '>=');
    _checkMap(cond.alignmentMax || cond.karmaMax, snap.axes, blockers, reasons, 'Alignment', '<=');
    _checkMap(cond.worldAlignmentMin, snap.worldAxes, blockers, reasons, 'World alignment', '>=');
    _checkMap(cond.worldAlignmentMax, snap.worldAxes, blockers, reasons, 'World alignment', '<=');
    _checkPotential(cond.potentialAlignmentMin, snap.range, blockers, reasons, '>=');
    _checkPotential(cond.potentialAlignmentMax, snap.range, blockers, reasons, '<=');

    for (const check of _asArray(cond.alignmentChecks)) {
      const axis = check.axis || check.id;
      if (!AXES[axis]) continue;
      const scope = check.scope || 'global';
      const values = scope === 'world' ? snap.worldAxes : snap.axes;
      if (scope === 'potential') {
        _checkPotential({ [axis]: check.min ?? check.value }, snap.range, blockers, reasons, '>=');
        if (check.max != null) _checkPotential({ [axis]: check.max }, snap.range, blockers, reasons, '<=');
        continue;
      }
      if (check.min != null) _checkMap({ [axis]: check.min }, values, blockers, reasons, 'Alignment', '>=');
      if (check.max != null) _checkMap({ [axis]: check.max }, values, blockers, reasons, 'Alignment', '<=');
    }

    if (!blockers.length && CONDITION_KEYS.some((key) => cond[key] != null)) {
      score += 2;
      reasons.push('Alignment condition met');
    }
    return { ok: blockers.length === 0, score, reasons, blockers };
  }

  function tagsForState(state = {}) {
    const snap = snapshot(state, { includePotential: false });
    const tags = [];
    for (const [axis, meta] of Object.entries(AXES)) {
      _pushAxisTags(tags, `alignment:${axis}`, snap.axes[axis], meta);
      _pushAxisTags(tags, `world:${snap.world}:alignment:${axis}`, snap.worldAxes[axis], meta);
    }
    return tags;
  }

  function choiceEligibility(choice = {}, node = {}, state = {}, context = {}) {
    if (!choice) return { ok: false, blockers: ['Missing choice.'], reasons: [], hidden: true };
    const cond = _choiceConditions(choice);
    const hasConditions = Object.keys(cond).length > 0;
    if (!hasConditions) return { ok: true, blockers: [], reasons: [], hidden: false };
    const result = window.CJS.CampaignConditions?.evaluate
      ? window.CJS.CampaignConditions.evaluate(cond, state, {
        ...context,
        actor: choice.actor || node.actor || context.actor || DEFAULT_ACTOR,
        tags: [..._asArray(node.tags), ..._asArray(choice.tags), ..._asArray(context.tags)]
      })
      : evaluateConditions(cond, state, context);
    const blockers = result?.blockers || [];
    return {
      ok: blockers.length === 0,
      blockers,
      reasons: result?.reasons || [],
      hidden: !!choice.hiddenUntilMet && blockers.length > 0
    };
  }

  function describeDeltas(value) {
    return _deltaText(normalizeDeltas(value));
  }

  function _commitDeltas(ledger, entry) {
    const actor = _actor(ledger, entry.actor);
    const worldState = _worldActor(actor, entry.world);
    for (const axis of Object.keys(AXES)) {
      const amount = Number(entry.deltas?.[axis] || 0);
      if (!amount) continue;
      actor.axes[axis] = _clamp(Number(actor.axes[axis] || 0) + amount);
      worldState.axes[axis] = _clamp(Number(worldState.axes[axis] || 0) + amount);
    }
    actor.history.unshift(entry);
    actor.history = actor.history.slice(0, HISTORY_LIMIT);
    worldState.history.unshift(entry);
    worldState.history = worldState.history.slice(0, HISTORY_LIMIT);
  }

  function _queueSideEffects(ledger, entry, op = {}) {
    for (const reaction of _asArray(op.npcReactions || op.reactions)) {
      ledger.reactionQueue.unshift({
        id: reaction.id || `reaction_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        actor: entry.actor,
        world: entry.world,
        npcId: reaction.npcId || reaction.target || reaction.id || '',
        label: reaction.label || reaction.title || reaction.npcId || 'NPC reaction',
        summary: reaction.summary || reaction.text || reaction.note || '',
        sourceChoice: entry.choiceId || '',
        at: new Date().toISOString()
      });
    }
    for (const hook of _asArray(op.futureHooks || op.unlockHints || op.hooks)) {
      ledger.futureHooks.unshift({
        id: hook.id || hook.hookId || `hook_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        actor: entry.actor,
        world: entry.world,
        label: hook.label || hook.title || hook.id || 'Future hook',
        summary: hook.summary || hook.text || hook.note || '',
        sequenceId: hook.sequenceId || '',
        conditionHint: hook.conditionHint || hook.conditions || '',
        sourceChoice: entry.choiceId || '',
        at: new Date().toISOString()
      });
    }
    ledger.reactionQueue = ledger.reactionQueue.slice(0, HISTORY_LIMIT);
    ledger.futureHooks = ledger.futureHooks.slice(0, HISTORY_LIMIT);
  }

  function _historyEntry(input = {}) {
    return {
      id: input.id || `${input.type || 'alignment'}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      type: input.type || 'alignment',
      actor: _cleanId(input.actor) || DEFAULT_ACTOR,
      world: _cleanId(input.world) || 'global',
      label: input.label || 'Choice',
      summary: input.summary || '',
      deltas: normalizeDeltas(input.deltas),
      tags: _asArray(input.tags),
      source: input.source || '',
      sequenceId: input.sequenceId || '',
      nodeId: input.nodeId || '',
      choiceId: input.choiceId || '',
      at: input.at || new Date().toISOString()
    };
  }

  function _entryPotential(entry = {}, world, state = {}) {
    const deltas = normalizeDeltas(entry.potentialAlignment ?? entry.alignmentPotential ?? entry.karmaPotential);
    if (!_hasDeltas(deltas)) return null;
    return {
      actor: entry.actor || DEFAULT_ACTOR,
      world,
      label: entry.routeLabel || entry.title || entry.id || 'Future branch',
      summary: entry.summary || entry.hint || '',
      deltas,
      source: 'sequence_index',
      sourceType: 'index',
      sequenceId: entry.id || '',
      nodeId: '',
      choiceId: '',
      group: entry.id || '',
      tags: _asArray(entry.tags),
      reachable: _simpleReachable(entry, state)
    };
  }

  function _pushPotential(entries, entry) {
    if (!entry || !_hasDeltas(entry.deltas)) return;
    entries.push({
      id: entry.id || `${entry.source || 'potential'}_${entry.sequenceId || 'seq'}_${entry.nodeId || 'node'}_${entry.choiceId || 'choice'}`,
      actor: _cleanId(entry.actor) || DEFAULT_ACTOR,
      world: _cleanId(entry.world) || 'global',
      label: entry.label || 'Future option',
      summary: entry.summary || '',
      deltas: normalizeDeltas(entry.deltas),
      source: entry.source || '',
      sourceType: entry.sourceType || '',
      sequenceId: entry.sequenceId || '',
      nodeId: entry.nodeId || '',
      choiceId: entry.choiceId || '',
      group: entry.group || entry.groupId || entry.sequenceId || '',
      tags: _asArray(entry.tags),
      reachable: entry.reachable !== false
    });
  }

  function _simpleReachable(entry = {}, state = {}) {
    for (const flag of _asArray(entry.requiresFlags || entry.flags)) {
      if (!state.flags?.[flag]) return false;
    }
    const anyFlags = _asArray(entry.requiresAnyFlags || entry.requiresFlagAny);
    if (anyFlags.length && !anyFlags.some((flag) => !!state.flags?.[flag])) return false;
    for (const flag of _asArray(entry.blocksFlags || entry.blockFlags || entry.blockedByFlags)) {
      if (state.flags?.[flag]) return false;
    }
    for (const partId of _asArray(entry.requiresStoryParts)) {
      if (!state.storyMode?.partResults?.[partId]) return false;
    }
    const anyParts = _asArray(entry.requiresAnyStoryParts || entry.requiresStoryPartsAny);
    if (anyParts.length && !anyParts.some((partId) => !!state.storyMode?.partResults?.[partId])) return false;
    for (const partId of _asArray(entry.blocksStoryParts)) {
      if (state.storyMode?.partResults?.[partId]) return false;
    }
    return true;
  }

  function _potentialRange(currentAxes = {}, entries = []) {
    const grouped = {};
    for (const entry of entries) {
      if (entry.reachable === false) continue;
      const group = entry.group || `${entry.sequenceId || entry.source}:${entry.nodeId || entry.choiceId || entry.id}`;
      grouped[group] = grouped[group] || {};
      for (const axis of Object.keys(AXES)) {
        const amount = Number(entry.deltas?.[axis] || 0);
        if (!amount) continue;
        grouped[group][axis] = grouped[group][axis] || { min: 0, max: 0 };
        grouped[group][axis].min = Math.min(grouped[group][axis].min, amount);
        grouped[group][axis].max = Math.max(grouped[group][axis].max, amount);
      }
    }

    const range = {};
    for (const axis of Object.keys(AXES)) {
      let loss = 0;
      let gain = 0;
      for (const group of Object.values(grouped)) {
        loss += Number(group[axis]?.min || 0);
        gain += Number(group[axis]?.max || 0);
      }
      const current = Number(currentAxes[axis] || 0);
      range[axis] = {
        current,
        min: _clamp(current + loss),
        max: _clamp(current + gain),
        loss,
        gain
      };
    }
    return range;
  }

  function _checkMap(requirements, values, blockers, reasons, label, op) {
    for (const [axis, targetRaw] of Object.entries(requirements || {})) {
      if (!AXES[axis]) continue;
      const target = Number(targetRaw || 0);
      const value = Number(values?.[axis] || 0);
      const ok = op === '<=' ? value <= target : value >= target;
      if (ok) reasons.push(`${label} ${AXES[axis].label} ${op} ${target}`);
      else blockers.push(`${label} ${AXES[axis].label} ${value}/${target}.`);
    }
  }

  function _checkPotential(requirements, range, blockers, reasons, op) {
    for (const [axis, targetRaw] of Object.entries(requirements || {})) {
      if (!AXES[axis]) continue;
      const target = Number(targetRaw || 0);
      const value = op === '<=' ? Number(range?.[axis]?.min || 0) : Number(range?.[axis]?.max || 0);
      const ok = op === '<=' ? value <= target : value >= target;
      if (ok) reasons.push(`Potential ${AXES[axis].label} ${op} ${target}`);
      else blockers.push(`Potential ${AXES[axis].label} can reach ${value}, needs ${target}.`);
    }
  }

  function _choiceConditions(choice = {}) {
    const cond = { ...(choice.conditions || choice.requires || {}) };
    for (const key of CONDITION_KEYS) {
      if (choice[key] != null && cond[key] == null) cond[key] = choice[key];
    }
    for (const key of ['requiresFlags', 'requiresAnyFlags', 'blocksFlags', 'requiresTags', 'requiresAnyTags', 'blocksTags', 'requiresStoryParts', 'requiresAnyStoryParts', 'blocksStoryParts']) {
      if (choice[key] != null && cond[key] == null) cond[key] = choice[key];
    }
    return cond;
  }

  function _pushAxisTags(tags, prefix, value, meta) {
    if (value >= 3) tags.push(`${prefix}:high`, `${prefix}:${_tag(meta.high)}`);
    else if (value <= -3) tags.push(`${prefix}:low`, `${prefix}:${_tag(meta.low)}`);
    else if (value > 0) tags.push(`${prefix}:positive`);
    else if (value < 0) tags.push(`${prefix}:negative`);
    else tags.push(`${prefix}:neutral`);
  }

  function _mergeDelta(target, value) {
    if (!value) return;
    const axis = value.axis || value.id;
    if (!AXES[axis]) return;
    target[axis] += _boundedStep(value.amount ?? value.value ?? value.delta ?? 0);
  }

  function _singleDelta(op = {}) {
    if (!op.axis && !op.id) return null;
    return { axis: op.axis || op.id, amount: op.amount ?? op.value ?? op.delta ?? 0 };
  }

  function _boundedStep(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Math.max(-3, Math.min(3, Math.round(amount)));
  }

  function _clamp(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Math.max(-AXIS_LIMIT, Math.min(AXIS_LIMIT, amount));
  }

  function _hasDeltas(deltas = {}) {
    return Object.keys(AXES).some((axis) => Number(deltas?.[axis] || 0) !== 0);
  }

  function _deltaText(deltas = {}) {
    return Object.keys(AXES)
      .map((axis) => Number(deltas?.[axis] || 0) ? `${AXES[axis].label} ${_signed(deltas[axis])}` : '')
      .filter(Boolean)
      .join(', ');
  }

  function _tone(axis, value) {
    const amount = Number(value || 0);
    if (amount >= 3) return AXES[axis].high;
    if (amount <= -3) return AXES[axis].low;
    if (amount > 0) return `slightly ${AXES[axis].high}`;
    if (amount < 0) return `slightly ${AXES[axis].low}`;
    return 'balanced';
  }

  function _signed(value) {
    const amount = Number(value || 0);
    return `${amount >= 0 ? '+' : ''}${amount}`;
  }

  function _tag(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function _cleanId(value = '') {
    return String(value || '').trim();
  }

  function _asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  }

  // ── DEFERRED CONSEQUENCES ────────────────────────────────────────
  // The futureHooks queue records "spare the bandit → he comes back
  // later to help" style promises made during dialogue. Each hook
  // carries optional fire conditions (flag, chapter, world, phase,
  // story-part). The runtime checks all hooks each time state changes
  // and triggers eligible ones.
  //
  // A hook fires by setting flags and / or applying authored ops. To
  // make it idempotent we mark fired hooks with `firedAt` and refuse
  // to re-fire them unless explicitly reset.
  //
  // Op shape that produces a deferred hook:
  //   { op: 'record_consequence', choiceId, world?, actor?,
  //     label, summary, fireWhen: { chapterMin, partResolved, flag,
  //       worldOnly, phase }, fireOps: [ ... ], flagsToSet: [ ... ],
  //     tags: [ ... ] }
  function recordConsequenceHook(state = {}, op = {}) {
    const ledger = normalizeState(state);
    const id = op.id || op.hookId || `consequence_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const hook = {
      id,
      kind: 'consequence',
      actor: _cleanId(op.actor || op.characterId) || DEFAULT_ACTOR,
      world: _cleanId(op.world || state.currentWorld) || 'global',
      label: op.label || op.title || 'Future consequence',
      summary: op.summary || op.text || op.note || '',
      choiceId: op.choiceId || '',
      sequenceId: op.sequenceId || '',
      nodeId: op.nodeId || '',
      fireWhen: _normalizeFireWhen(op.fireWhen),
      fireOps: Array.isArray(op.fireOps) ? op.fireOps.slice(0, 20) : [],
      flagsToSet: Array.isArray(op.flagsToSet) ? op.flagsToSet.slice(0, 10) : [],
      tags: _asArray(op.tags),
      firedAt: null,
      at: new Date().toISOString()
    };
    ledger.futureHooks.unshift(hook);
    ledger.futureHooks = ledger.futureHooks.slice(0, HISTORY_LIMIT);
    return hook;
  }

  // Returns the list of hook ids that became eligible THIS check. The
  // caller (campaign-ops) is responsible for actually firing the ops.
  function dueConsequenceHooks(state = {}) {
    const ledger = normalizeState(state);
    const due = [];
    for (const hook of ledger.futureHooks || []) {
      if (!hook || hook.kind !== 'consequence') continue;
      if (hook.firedAt) continue;
      if (_isFireWhenMet(hook.fireWhen, state, hook)) due.push(hook);
    }
    return due;
  }

  // Mark a hook as fired so it won't repeat. Returns the updated hook.
  function markHookFired(state = {}, hookId, firedAt) {
    const ledger = normalizeState(state);
    const hook = (ledger.futureHooks || []).find((h) => h.id === hookId);
    if (!hook) return null;
    hook.firedAt = firedAt || new Date().toISOString();
    return hook;
  }

  function _normalizeFireWhen(input = {}) {
    if (!input || typeof input !== 'object') return {};
    const source = /** @type {any} */ (input);
    return {
      chapterMin: Number(source.chapterMin || 0) || 0,
      partResolved: source.partResolved || source.partId || '',
      flag: source.flag || '',
      excludesFlag: source.excludesFlag || '',
      worldOnly: source.worldOnly || '',
      phaseType: source.phaseType || '',
      phaseMin: Number(source.phaseMin || 0) || 0
    };
  }

  function _isFireWhenMet(when, state = {}, hook = {}) {
    if (!when) return false;
    if (when.chapterMin && (Number(state.currentChapter || 1) < when.chapterMin)) return false;
    if (when.partResolved && !state.storyMode?.partResults?.[when.partResolved]) return false;
    if (when.flag && !state.flags?.[when.flag]) return false;
    if (when.excludesFlag && state.flags?.[when.excludesFlag]) return false;
    if (when.worldOnly && state.currentWorld !== when.worldOnly && hook.world !== state.currentWorld) return false;
    if (when.phaseType && state.phase?.type !== when.phaseType) return false;
    if (when.phaseMin && (Number(state.phase?.number || 1) < when.phaseMin)) return false;
    return true;
  }

  return Object.freeze({
    AXES,
    axisLimit: AXIS_LIMIT,
    initialState,
    normalizeState,
    normalizeDeltas,
    describeDeltas,
    applyChange,
    recordChoice,
    addPotential,
    snapshot,
    collectPotential,
    formatForPrompt,
    evaluateConditions,
    tagsForState,
    choiceEligibility,
    // Deferred consequence hooks
    recordConsequenceHook,
    dueConsequenceHooks,
    markHookFired
  });
})();
