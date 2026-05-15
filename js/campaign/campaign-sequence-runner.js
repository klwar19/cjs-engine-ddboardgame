// campaign-sequence-runner.js
// Lightweight state-machine runtime for Story/Event/Quest sequence files.

window.CJS = window.CJS || {};

window.CJS.CampaignSequences = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Cond = () => window.CJS.CampaignConditions;

  const _indexes = {};
  const _sequenceCache = {};
  let _activeWorld = 'haven';

  function _clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  async function loadWorld(world = 'haven') {
    _activeWorld = world || 'haven';
    if (_indexes[_activeWorld]) return _indexes[_activeWorld];
    const path = `data/campaigns/${_activeWorld}/sequences/_sequence_index.json`;
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const index = await response.json();
      index._basePath = `data/campaigns/${_activeWorld}/sequences/`;
      _indexes[_activeWorld] = index;
      return index;
    } catch (error) {
      console.warn('Campaign sequence index unavailable:', path, error);
      _indexes[_activeWorld] = { id: `${_activeWorld}_empty_sequence_index`, entries: [], _basePath: `data/campaigns/${_activeWorld}/sequences/` };
      return _indexes[_activeWorld];
    }
  }

  function index(world = _activeWorld) {
    return _indexes[world] || _indexes[_activeWorld] || { entries: [] };
  }

  function list(scope = null, world = _activeWorld) {
    const entries = index(world).entries || [];
    return scope ? entries.filter((entry) => entry.scope === scope || entry.kind === scope) : entries;
  }

  function entry(sequenceId, world = _activeWorld) {
    return (index(world).entries || []).find((item) => item.id === sequenceId) || null;
  }

  function cachedSequence(sequenceId, world = _activeWorld) {
    return _sequenceCache[`${world}:${sequenceId}`] || null;
  }

  async function loadSequence(sequenceId, world = _activeWorld) {
    if (!sequenceId) return null;
    const idx = await loadWorld(world);
    const entry = (idx.entries || []).find((item) => item.id === sequenceId);
    if (!entry) return null;
    const cacheKey = `${world}:${sequenceId}`;
    if (_sequenceCache[cacheKey]) return _sequenceCache[cacheKey];
    const response = await fetch(`${idx._basePath}${entry.file}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load sequence ${sequenceId}`);
    const sequence = await response.json();
    sequence._indexEntry = entry;
    sequence._file = entry.file;
    _sequenceCache[cacheKey] = sequence;
    return sequence;
  }

  async function start(sequenceId, options = {}) {
    const state = CS()?.getState?.();
    const world = options.world || state?.currentWorld || _activeWorld || 'haven';
    const sequence = await loadSequence(sequenceId, world);
    if (!sequence) return null;
    const startNode = sequence.startNode || sequence.nodes?.[0]?.id || 'start';
    CS().mutate((next) => {
      next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      next.sequenceRuntime.active = {
        sequenceId: sequence.id || sequenceId,
        title: sequence.title || sequenceId,
        scope: sequence.scope || options.scope || sequence._indexEntry?.scope || 'event',
        file: sequence._file || '',
        nodeId: startNode,
        startedAt: new Date().toISOString(),
        log: []
      };
      if ((sequence.scope || sequence._indexEntry?.scope) === 'story') {
        next.storyMode = next.storyMode || {};
        next.storyMode.currentArcId = sequence.arcId || sequence._indexEntry?.arcId || next.storyMode.currentArcId || null;
        next.storyMode.currentChapterId = sequence.chapterId || sequence._indexEntry?.chapterId || next.storyMode.currentChapterId || null;
        next.storyMode.currentPartId = sequence.partId || sequence.id || next.storyMode.currentPartId || null;
      }
    }, { source: 'sequence_start' });
    return sequence;
  }

  function active(state = CS()?.getState?.()) {
    return state?.sequenceRuntime?.active || null;
  }

  async function activeBundle(state = CS()?.getState?.()) {
    const current = active(state);
    if (!current) return null;
    const sequence = await loadSequence(current.sequenceId, state?.currentWorld || _activeWorld || 'haven');
    if (!sequence) return null;
    return {
      active: current,
      sequence,
      node: findNode(sequence, current.nodeId)
    };
  }

  function findNode(sequence = {}, nodeId) {
    return (sequence.nodes || []).find((node) => node.id === nodeId) || null;
  }

  async function advance(action = 'next', value = null) {
    const state = CS()?.getState?.();
    const bundle = await activeBundle(state);
    if (!bundle?.node) return { ok: false, reason: 'no_active_node' };
    const { active: current, sequence, node } = bundle;
    const transition = _resolveTransition(node, action, value, state);
    if (transition.ops?.length) Ops()?.apply?.(transition.ops, { source: 'sequence_runtime' });
    if (transition.queueBattle) {
      Ops()?.apply?.(transition.queueBattle, { source: 'sequence_runtime' });
      return { ok: true, queued: true };
    }
    if (transition.complete || !transition.next) {
      return complete(transition.result || node.result || action || 'complete');
    }
    const nextNode = findNode(sequence, transition.next);
    if (!nextNode) return complete('missing_next');
    CS().mutate((next) => {
      const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      if (!runtime.active || runtime.active.sequenceId !== current.sequenceId) return;
      runtime.active.log = runtime.active.log || [];
      runtime.active.log.push(_nodeLog(node, action, value, transition));
      runtime.active.nodeId = nextNode.id;
    }, { source: 'sequence_advance' });
    if (nextNode.type === 'ops' && nextNode.auto !== false) {
      return advance('next');
    }
    return { ok: true, nodeId: nextNode.id };
  }

  function _resolveTransition(node, action, value, state) {
    const type = String(node.type || '').toLowerCase();
    if (type === 'choice') {
      const choice = (node.choices || []).find((item) => item.id === value) || (node.choices || [])[Number(value || 0)] || null;
      return { next: choice?.next || node.next || null, ops: choice?.ops || [], result: choice?.id || action };
    }
    if (type === 'stat_check') {
      return { next: action === 'pass' ? (node.pass || node.next) : (node.fail || node.next), ops: action === 'pass' ? (node.passOps || []) : (node.failOps || []), result: action };
    }
    if (type === 'condition') {
      const result = Cond()?.evaluate?.(node.conditions || {}, state || {}, { tags: node.tags || [] });
      return { next: result?.ok ? (node.pass || node.next) : (node.fail || node.next), result: result?.ok ? 'pass' : 'fail' };
    }
    if (type === 'ops') {
      return { next: node.next || null, ops: node.ops || [], result: 'ops' };
    }
    if (type === 'combat') {
      if (action === 'queue') {
        return {
          queueBattle: {
            op: 'start_battle',
            encounterId: node.encounterId,
            battleSetId: node.battleSetId || null,
            label: node.label || node.title || node.encounterId || node.battleSetId || 'Sequence Battle',
            tags: node.tags || [],
            contextTags: node.contextTags || [],
            monsterTags: node.monsterTags || [],
            source: `sequence:${node.id}`
          }
        };
      }
      if (action === 'lose' || action === 'fail') return { next: node.onLose || node.lose || node.fail || node.next, ops: node.loseOps || [], result: 'lose' };
      return { next: node.onWin || node.win || node.pass || node.next, ops: node.winOps || [], result: 'win' };
    }
    if (type === 'map_move') {
      const ops = [];
      if (node.nodeId) ops.push({ op: 'goto_node', nodeId: node.nodeId });
      if (node.mapId && node.nodeId) ops.push({ op: 'reveal_node', mapId: node.mapId, nodeId: node.nodeId });
      return { next: node.next || null, ops, result: 'map_move' };
    }
    if (type === 'quest_update') {
      const ops = [];
      if (node.questId && node.objectiveId) {
        ops.push({ op: 'update_quest_progress', questId: node.questId, objectiveId: node.objectiveId, amount: Number(node.amount || 1) });
      }
      return { next: node.next || null, ops, result: 'quest_update' };
    }
    if (type === 'minigame') {
      const resultKey = action === 'fail' || action === 'lose' ? 'fail' : 'win';
      const ops = resultKey === 'win' ? (node.winOps || []) : (node.failOps || []);
      return { next: resultKey === 'win' ? (node.onWin || node.win || node.next) : (node.onLose || node.fail || node.next), ops, result: resultKey };
    }
    if (type === 'end') return { complete: true, result: node.result || 'complete' };
    return { next: node.next || null, ops: node.ops || [], result: action };
  }

  function _nodeLog(node, action, value, transition) {
    return {
      at: new Date().toISOString(),
      nodeId: node.id,
      type: node.type || '',
      action,
      value,
      result: transition.result || '',
      summary: node.summary || node.text || node.title || node.id
    };
  }

  function complete(result = 'complete') {
    const state = CS()?.getState?.();
    const current = active(state);
    if (!current) return { ok: false, reason: 'no_active_sequence' };
    CS().mutate((next) => {
      const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      const activeRun = runtime.active || current;
      const record = {
        ..._clone(activeRun),
        result,
        completedAt: new Date().toISOString()
      };
      runtime.history = Array.isArray(runtime.history) ? runtime.history : [];
      runtime.history.unshift(record);
      runtime.history = runtime.history.slice(0, 80);
      runtime.active = null;
      if (record.scope === 'story') {
        next.storyMode = next.storyMode || {};
        next.storyMode.completedParts = next.storyMode.completedParts || {};
        next.storyMode.partResults = next.storyMode.partResults || {};
        const partId = record.sequenceId;
        next.storyMode.completedParts[partId] = true;
        next.storyMode.partResults[partId] = record;
      }
    }, { source: 'sequence_complete' });
    Ops()?.apply?.({ op: 'log', text: `Sequence complete: ${current.title || current.sequenceId} (${result}).` }, { source: 'sequence_runtime' });
    return { ok: true, complete: true };
  }

  return Object.freeze({
    loadWorld,
    index,
    list,
    entry,
    cachedSequence,
    loadSequence,
    start,
    active,
    activeBundle,
    findNode,
    advance,
    complete
  });
})();
