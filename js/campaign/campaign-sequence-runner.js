// campaign-sequence-runner.js
// Lightweight state-machine runtime for Story/Event/Quest sequence files.

window.CJS = window.CJS || {};

window.CJS.CampaignSequences = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Cond = () => window.CJS.CampaignConditions;
  const Runner = () => window.CJS.ScenarioRunner;

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
      index.entries = (index.entries || []).map((entry, entryIndex) => ({
        ...entry,
        _index: entryIndex
      }));
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
    const filtered = scope ? entries.filter((entry) => entry.scope === scope || entry.kind === scope) : entries.slice();
    if (scope === 'story') return filtered.sort(_compareStoryEntries);
    return filtered;
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
    const indexEntry = (idx.entries || []).find((item) => item.id === sequenceId);
    if (!indexEntry) return null;
    const cacheKey = `${world}:${sequenceId}`;
    if (_sequenceCache[cacheKey]) return _sequenceCache[cacheKey];
    const response = await fetch(`${idx._basePath}${indexEntry.file}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load sequence ${sequenceId}`);
    const sequence = await response.json();
    sequence._indexEntry = indexEntry;
    sequence._file = indexEntry.file;
    _sequenceCache[cacheKey] = sequence;
    return sequence;
  }

  function storyMeta(value, world = _activeWorld) {
    const indexEntry = typeof value === 'string'
      ? entry(value, world)
      : (value?._indexEntry || value || {});
    const sequence = typeof value === 'string' ? cachedSequence(value, world) : value;
    const fallbackOrder = Number.isFinite(Number(indexEntry?._index))
      ? String(Number(indexEntry._index) + 1)
      : String(indexEntry?.id || sequence?.id || '');
    const chapterLabel = sequence?.chapterLabel
      || indexEntry?.chapterLabel
      || sequence?.chapterNumberLabel
      || indexEntry?.chapterNumberLabel
      || '';
    return {
      sequenceId: sequence?.id || indexEntry?.id || '',
      scope: sequence?.scope || indexEntry?.scope || '',
      arcId: sequence?.arcId || indexEntry?.arcId || '',
      chapterId: sequence?.chapterId || indexEntry?.chapterId || '',
      chapterLabel: chapterLabel || _labelFromId(sequence?.chapterId || indexEntry?.chapterId || ''),
      chapterNumber: _chapterNumber(sequence, indexEntry),
      chapterOrderKey: sequence?.chapterOrderKey || indexEntry?.chapterOrderKey || chapterLabel || '',
      partId: sequence?.partId || indexEntry?.partId || '',
      partLabel: sequence?.partLabel || indexEntry?.partLabel || _labelFromPart(sequence?.partId || indexEntry?.partId || ''),
      orderKey: sequence?.orderKey || indexEntry?.orderKey || sequence?.chapterOrderKey || indexEntry?.chapterOrderKey || chapterLabel || fallbackOrder,
      title: sequence?.title || indexEntry?.title || sequence?.id || indexEntry?.id || '',
      summary: sequence?.summary || indexEntry?.summary || null,
      deliveryStatus: _deliveryStatus(sequence?.deliveryStatus || indexEntry?.deliveryStatus),
      deliveryBlocked: _deliveryBlocked(sequence || indexEntry),
      deliveryNote: sequence?.deliveryNote || indexEntry?.deliveryNote || '',
      nextCandidates: _asArray(sequence?.nextCandidates ?? indexEntry?.nextCandidates),
      syncSummary: _summaryLines(sequence?.syncSummary ?? indexEntry?.syncSummary)
    };
  }

  function storyStatus(sequenceId, state = CS()?.getState?.(), world = _activeWorld) {
    const applied = state?.storyMode?.partResults?.[sequenceId] || null;
    const defaulted = state?.storyMode?.defaultedParts?.[sequenceId] || null;
    const completed = !!state?.storyMode?.completedParts?.[sequenceId];
    const meta = storyMeta(sequenceId, world);
    return {
      id: sequenceId,
      meta,
      record: applied || defaulted || null,
      applied: !!(applied || defaulted || completed),
      completed,
      defaulted: !!defaulted,
      replayOnly: !!(applied || defaulted || completed),
      deliveryStatus: meta.deliveryStatus || 'ready',
      deliveryBlocked: !!meta.deliveryBlocked,
      deliveryNote: meta.deliveryNote || ''
    };
  }

  async function start(sequenceId, options = {}) {
    const state = CS()?.getState?.();
    const world = options.world || state?.currentWorld || _activeWorld || 'haven';
    const indexEntry = entry(sequenceId, world);
    if (!indexEntry) return null;
    if (_deliveryBlocked(indexEntry) || !indexEntry.file) {
      return {
        blocked: true,
        reason: _deliveryStatus(indexEntry.deliveryStatus) || 'in_update',
        meta: storyMeta(indexEntry, world)
      };
    }
    const sequence = await loadSequence(sequenceId, world);
    if (!sequence) return null;
    if (_deliveryBlocked(sequence) || !sequence._file) {
      return {
        blocked: true,
        reason: _deliveryStatus(sequence.deliveryStatus) || 'in_update',
        meta: storyMeta(sequence, world)
      };
    }

    const scope = sequence.scope || options.scope || sequence._indexEntry?.scope || 'event';
    const meta = storyMeta(sequence, world);
    const prep = scope === 'story'
      ? await _prepareStoryStart(sequence, world, options)
      : { defaultedRecords: [], replayOnly: false };
    const startNode = sequence.startNode || sequence.nodes?.[0]?.id || 'start';
    const applyConsequences = scope === 'story'
      ? (options.applyConsequences != null ? !!options.applyConsequences : !prep.replayOnly)
      : true;

    CS().mutate((next) => {
      next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      next.sequenceRuntime.active = {
        sequenceId: sequence.id || sequenceId,
        title: sequence.title || sequenceId,
        scope,
        file: sequence._file || '',
        nodeId: startNode,
        startedAt: new Date().toISOString(),
        log: [],
        routeChoices: [],
        applyConsequences,
        startMode: scope === 'story' ? (prep.replayOnly ? 'replay' : 'played') : 'live',
        storyOrderKey: meta.orderKey || '',
        chapterLabel: meta.chapterLabel || '',
        chapterId: meta.chapterId || ''
      };
      if (scope === 'story') {
        next.storyMode = next.storyMode || {};
        next.storyMode.currentArcId = sequence.arcId || sequence._indexEntry?.arcId || next.storyMode.currentArcId || null;
        next.storyMode.currentChapterId = sequence.chapterId || sequence._indexEntry?.chapterId || next.storyMode.currentChapterId || null;
        next.storyMode.currentChapterLabel = meta.chapterLabel || next.storyMode.currentChapterLabel || null;
        next.storyMode.currentChapterOrderKey = meta.chapterOrderKey || meta.orderKey || next.storyMode.currentChapterOrderKey || null;
        next.storyMode.currentPartId = sequence.partId || sequence.id || next.storyMode.currentPartId || null;
        const chapterNumber = _chapterNumber(sequence, sequence._indexEntry);
        if (chapterNumber != null) next.currentChapter = chapterNumber;
        _revealChapter(next, {
          chapterId: meta.chapterId,
          chapterLabel: meta.chapterLabel,
          chapterOrderKey: meta.chapterOrderKey || meta.orderKey,
          partId: meta.partId || sequence.id
        });
      }
    }, { source: 'sequence_start' });

    return {
      sequence,
      defaulted: prep.defaultedRecords || [],
      replayOnly: !!prep.replayOnly,
      applyConsequences
    };
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
    if (current.applyConsequences !== false && transition.ops?.length) {
      Ops()?.apply?.(transition.ops, { source: 'sequence_runtime' });
    }
    if (transition.choice) {
      CS().mutate((next) => {
        const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
        if (!runtime.active || runtime.active.sequenceId !== current.sequenceId) return;
        runtime.active.routeChoices = Array.isArray(runtime.active.routeChoices) ? runtime.active.routeChoices : [];
        runtime.active.routeChoices.push({
          nodeId: node.id,
          choiceId: transition.choice.id || '',
          label: transition.choice.label || transition.choice.id || '',
          mode: runtime.active.startMode || 'played',
          at: new Date().toISOString()
        });
      }, { source: 'sequence_route_choice' });
    }
    if (transition.queueBattle) {
      if (current.applyConsequences === false) {
        return { ok: false, replayOnly: true, reason: 'replay_queue_blocked' };
      }
      Ops()?.apply?.(transition.queueBattle, { source: 'sequence_runtime' });
      return { ok: true, queued: true };
    }
    if (transition.startScenario) {
      if (current.applyConsequences === false) {
        return { ok: false, replayOnly: true, reason: 'replay_scenario_blocked' };
      }
      const run = Runner()?.startScenario?.(transition.startScenario.scenarioId, {
        sequenceLink: {
          sequenceId: current.sequenceId,
          nodeId: node.id,
          checkpointId: transition.startScenario.checkpointId || '',
          onSuccess: transition.startScenario.onSuccess || '',
          onFail: transition.startScenario.onFail || '',
          onAbort: transition.startScenario.onAbort || ''
        }
      });
      if (!run) return { ok: false, reason: 'scenario_start_failed' };
      CS().mutate((next) => {
        const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
        if (!runtime.active || runtime.active.sequenceId !== current.sequenceId) return;
        runtime.active.scenarioLink = {
          scenarioId: transition.startScenario.scenarioId,
          nodeId: node.id,
          runId: run.runId || '',
          checkpointId: transition.startScenario.checkpointId || '',
          startedAt: new Date().toISOString()
        };
      }, { source: 'sequence_scenario_start' });
      return { ok: true, scenarioStarted: true, scenarioId: transition.startScenario.scenarioId };
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

  async function resumeFromScenario(outcome = 'success', details = {}) {
    const state = CS()?.getState?.();
    const bundle = await activeBundle(state);
    if (!bundle?.node) return { ok: false, reason: 'no_active_node' };
    const { active: current, sequence, node } = bundle;
    if (String(node.type || '').toLowerCase() !== 'scenario') {
      return { ok: false, reason: 'active_node_not_scenario' };
    }
    const mapped = String(outcome || 'success').toLowerCase();
    const action = mapped === 'victory' || mapped === 'success'
      ? 'success'
      : (mapped === 'defeat' || mapped === 'fail' ? 'fail' : 'abort');
    const transition = _resolveTransition(node, action, details, CS()?.getState?.());
    if (current.applyConsequences !== false && transition.ops?.length) {
      Ops()?.apply?.(transition.ops, { source: 'sequence_runtime' });
    }
    if (transition.complete || !transition.next) {
      return complete(transition.result || action || 'complete');
    }
    const nextNode = findNode(sequence, transition.next);
    if (!nextNode) return complete('missing_next');
    CS().mutate((next) => {
      const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      if (!runtime.active || runtime.active.sequenceId !== current.sequenceId) return;
      runtime.active.log = runtime.active.log || [];
      runtime.active.log.push(_nodeLog(node, action, details, transition));
      runtime.active.nodeId = nextNode.id;
      runtime.active.scenarioLink = null;
      runtime.active.lastScenarioResult = {
        outcome: action,
        scenarioId: details.scenarioId || runtime.active.scenarioLink?.scenarioId || '',
        completedAt: new Date().toISOString()
      };
    }, { source: 'sequence_scenario_resume' });
    if (nextNode.type === 'ops' && nextNode.auto !== false) {
      return advance('next');
    }
    return { ok: true, nodeId: nextNode.id };
  }

  function handleBattleOutcome(outcome = 'victory', context = {}) {
    const state = CS()?.getState?.();
    const current = active(state);
    if (!current) return { ok: false, handled: false, reason: 'no_active_sequence' };
    const sequence = cachedSequence(current.sequenceId, state?.currentWorld || _activeWorld);
    const node = sequence ? findNode(sequence, current.nodeId) : null;
    if (!node || String(node.type || '').toLowerCase() !== 'combat') {
      return { ok: false, handled: false, reason: 'active_node_not_combat' };
    }
    const pendingSource = String(context?.pending?.source || '');
    if (pendingSource && pendingSource.startsWith('sequence:')) {
      const expected = `sequence:${node.id}`;
      if (pendingSource !== expected) return { ok: false, handled: false, reason: 'sequence_battle_mismatch' };
    }
    const mapped = String(outcome || 'victory').toLowerCase();
    if (mapped === 'defeat' || mapped === 'lose' || mapped === 'fail') return advance('lose');
    if (mapped === 'draw') return advance('draw');
    return advance('win');
  }

  function complete(result = 'complete') {
    const state = CS()?.getState?.();
    const current = active(state);
    if (!current) return { ok: false, reason: 'no_active_sequence' };
    const world = state?.currentWorld || _activeWorld || 'haven';
    const sequence = cachedSequence(current.sequenceId, world) || null;
    const meta = storyMeta(sequence || current.sequenceId, world);

    const record = {
      ..._clone(current),
      result,
      completedAt: new Date().toISOString(),
      mode: current.startMode || (current.applyConsequences === false ? 'replay' : 'played'),
      syncSummary: _syncSummary(sequence, meta, current.applyConsequences === false ? 'replay' : 'played'),
      deliveryStatus: meta.deliveryStatus || 'ready'
    };

    if (current.applyConsequences !== false) {
      const completionOps = _completionOps(sequence, 'played');
      if (completionOps.length) Ops()?.apply?.(completionOps, { source: 'sequence_completion' });
    }

    CS().mutate((next) => {
      const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      runtime.active = null;
    }, { source: 'sequence_complete' });

    if (record.scope === 'story') {
      _commitStoryRecord(record, { pushHistory: true });
    } else {
      CS().mutate((next) => {
        const runtime = next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
        runtime.history = Array.isArray(runtime.history) ? runtime.history : [];
        runtime.history.unshift(record);
        runtime.history = runtime.history.slice(0, 80);
        if (record.scope === 'event') {
          next.eventLog = next.eventLog || {};
          next.eventLog.entries = Array.isArray(next.eventLog.entries) ? next.eventLog.entries : [];
          next.eventLog.entries.unshift({
            id: `event_log_${record.sequenceId}_${Date.now()}`,
            at: record.completedAt,
            phase: next.phase?.number || 1,
            world: next.currentWorld,
            title: record.title || record.sequenceId,
            summary: (record.log || []).map((line) => line.summary).filter(Boolean).slice(-3).join(' | ') || record.result || 'Event sequence completed.',
            source: 'sequence',
            scope: 'event',
            relatedId: record.sequenceId,
            tags: ['sequence_event', record.result || 'complete'],
            consequences: []
          });
          next.eventLog.entries = next.eventLog.entries.slice(0, 300);
        }
      }, { source: 'sequence_complete' });
    }

    Ops()?.apply?.({ op: 'log', text: `Sequence complete: ${current.title || current.sequenceId} (${result}).` }, { source: 'sequence_runtime' });
    return { ok: true, complete: true };
  }

  async function _prepareStoryStart(sequence, world, options = {}) {
    const state = CS()?.getState?.() || {};
    const status = storyStatus(sequence.id, state, world);
    const defaultedRecords = [];
    if (!status.applied && options.skipDefaultPath !== true) {
      const earlier = await _defaultEarlierStoryParts(sequence, world);
      defaultedRecords.push(...earlier);
    }
    return {
      defaultedRecords,
      replayOnly: storyStatus(sequence.id, CS()?.getState?.(), world).applied
    };
  }

  async function _defaultEarlierStoryParts(targetSequence, world = _activeWorld) {
    const targetMeta = storyMeta(targetSequence, world);
    const targetKey = targetMeta.orderKey || '';
    const earlierEntries = list('story', world).filter((storyEntry) => {
      const candidate = storyMeta(storyEntry, world);
      return _compareOrderValues(candidate.orderKey, targetKey) < 0;
    });
    const records = [];
    for (const storyEntry of earlierEntries) {
      const state = CS()?.getState?.() || {};
      if (storyStatus(storyEntry.id, state, world).applied) continue;
      if (!_entryEligible(storyEntry, state)) continue;
      if (_deliveryBlocked(storyEntry) || !storyEntry.file) continue;
      const sequence = await loadSequence(storyEntry.id, world);
      if (!sequence) continue;
      const record = _playSequenceDefault(sequence, world);
      if (record) records.push(record);
    }
    return records;
  }

  function _playSequenceDefault(sequence, world = _activeWorld) {
    const state = CS()?.getState?.() || {};
    const meta = storyMeta(sequence, world);
    const startNode = sequence.startNode || sequence.nodes?.[0]?.id || 'start';
    let node = findNode(sequence, startNode);
    const visits = {};
    const log = [];
    const routeChoices = [];
    const startedAt = new Date().toISOString();

    while (node && Object.keys(visits).length < 200) {
      visits[node.id] = Number(visits[node.id] || 0) + 1;
      if (visits[node.id] > 4) break;

      const plan = _defaultPlan(node);
      const transition = _resolveTransition(node, plan.action, plan.value, state);
      if (transition.choice) {
        routeChoices.push({
          nodeId: node.id,
          choiceId: transition.choice.id || '',
          label: transition.choice.label || transition.choice.id || '',
          mode: 'defaulted',
          at: new Date().toISOString()
        });
      }
      if (transition.ops?.length) {
        Ops()?.apply?.(transition.ops, { source: 'sequence_default_path' });
      }
      log.push(_nodeLog(node, plan.action, plan.value, transition));
      if (transition.complete || !transition.next) break;
      node = findNode(sequence, transition.next);
    }

    const completionOps = _completionOps(sequence, 'defaulted');
    if (completionOps.length) {
      Ops()?.apply?.(completionOps, { source: 'sequence_default_completion' });
    }

    const record = {
      sequenceId: sequence.id,
      title: sequence.title || sequence.id,
      scope: 'story',
      file: sequence._file || '',
      startedAt,
      completedAt: new Date().toISOString(),
      result: 'defaulted',
      mode: 'defaulted',
      applyConsequences: true,
      log,
      routeChoices,
      storyOrderKey: meta.orderKey || '',
      chapterId: meta.chapterId || '',
      chapterLabel: meta.chapterLabel || '',
      summaryText: _storySummaryText(sequence, log, 'defaulted'),
      syncSummary: _syncSummary(sequence, meta, 'defaulted'),
      deliveryStatus: meta.deliveryStatus || 'ready'
    };

    _commitStoryRecord(record, { pushHistory: true });
    Ops()?.apply?.({ op: 'log', text: `Story defaulted: ${record.title}.` }, { source: 'sequence_default_path' });
    return record;
  }

  function _commitStoryRecord(record = {}, options = {}) {
    CS().mutate((next) => {
      next.storyMode = next.storyMode || {};
      next.storyMode.completedParts = next.storyMode.completedParts || {};
      next.storyMode.defaultedParts = next.storyMode.defaultedParts || {};
      next.storyMode.revealedChapters = next.storyMode.revealedChapters || {};
      next.storyMode.partResults = next.storyMode.partResults || {};
      next.sequenceRuntime = next.sequenceRuntime || { active: null, history: [] };
      next.sequenceRuntime.history = Array.isArray(next.sequenceRuntime.history) ? next.sequenceRuntime.history : [];

      if (options.pushHistory !== false) {
        next.sequenceRuntime.history.unshift(record);
        next.sequenceRuntime.history = next.sequenceRuntime.history.slice(0, 120);
      }

      const partId = record.sequenceId;
      if (record.mode === 'defaulted') {
        next.storyMode.defaultedParts[partId] = record;
      } else if (record.applyConsequences !== false) {
        next.storyMode.completedParts[partId] = true;
      }

      if (record.applyConsequences !== false || !next.storyMode.partResults[partId]) {
        next.storyMode.partResults[partId] = record;
      }

      _revealChapter(next, {
        chapterId: record.chapterId || '',
        chapterLabel: record.chapterLabel || '',
        chapterOrderKey: record.storyOrderKey || '',
        partId
      });
    }, { source: options.source || 'story_record_commit' });
  }

  function _revealChapter(state, { chapterId = '', chapterLabel = '', chapterOrderKey = '', partId = '' } = {}) {
    if (!chapterId && !chapterLabel) return;
    state.storyMode = state.storyMode || {};
    state.storyMode.revealedChapters = state.storyMode.revealedChapters || {};
    const key = chapterId || chapterLabel;
    const existing = state.storyMode.revealedChapters[key] || {};
    const partIds = Array.isArray(existing.partIds) ? existing.partIds.slice() : [];
    if (partId && !partIds.includes(partId)) partIds.push(partId);
    state.storyMode.revealedChapters[key] = {
      ...existing,
      id: key,
      chapterId: chapterId || existing.chapterId || '',
      chapterLabel: chapterLabel || existing.chapterLabel || '',
      chapterOrderKey: chapterOrderKey || existing.chapterOrderKey || '',
      partIds,
      updatedAt: new Date().toISOString()
    };
  }

  function _defaultPlan(node = {}) {
    const type = String(node.type || '').toLowerCase();
    if (type === 'choice') {
      const choice = _defaultChoice(node);
      return { action: 'choice', value: choice?.id || 0 };
    }
    if (type === 'stat_check') {
      const result = String(node.defaultResult || node.defaultOutcome || 'pass').toLowerCase();
      return { action: result === 'fail' || result === 'lose' ? 'fail' : 'pass', value: null };
    }
    if (type === 'combat' || type === 'minigame') {
      const result = String(node.defaultResult || node.defaultOutcome || 'win').toLowerCase();
      return { action: result === 'lose' || result === 'fail' ? 'lose' : 'win', value: null };
    }
    if (type === 'scenario') {
      const result = String(node.defaultResult || node.defaultOutcome || 'success').toLowerCase();
      if (result === 'fail' || result === 'lose' || result === 'defeat') return { action: 'fail', value: null };
      if (result === 'abort' || result === 'cancel') return { action: 'abort', value: null };
      return { action: 'success', value: null };
    }
    if (type === 'end') return { action: 'next', value: null };
    return { action: 'next', value: null };
  }

  function _defaultChoice(node = {}) {
    const choices = node.choices || [];
    if (!choices.length) return null;
    return choices.find((item) => item.id === node.defaultChoiceId)
      || choices.find((item) => item.default === true)
      || choices[0];
  }

  function _resolveTransition(node, action, value, state) {
    const type = String(node.type || '').toLowerCase();
    if (type === 'choice') {
      const choice = (node.choices || []).find((item) => item.id === value)
        || (node.choices || [])[Number(value || 0)]
        || _defaultChoice(node);
      return {
        next: choice?.next || node.next || null,
        ops: choice?.ops || [],
        result: choice?.id || action,
        choice: choice ? { id: choice.id || '', label: choice.label || choice.id || '' } : null
      };
    }
    if (type === 'stat_check') {
      const passed = action === 'pass' || action === 'win';
      return {
        next: passed ? (node.pass || node.next) : (node.fail || node.next),
        ops: passed ? (node.passOps || []) : (node.failOps || []),
        result: passed ? 'pass' : 'fail'
      };
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
      if (action === 'draw') return { next: node.onDraw || node.draw || node.onLose || node.lose || node.fail || node.next, ops: node.drawOps || node.loseOps || [], result: 'draw' };
      if (action === 'lose' || action === 'fail') return { next: node.onLose || node.lose || node.fail || node.next, ops: node.loseOps || [], result: 'lose' };
      return { next: node.onWin || node.win || node.pass || node.next, ops: node.winOps || [], result: 'win' };
    }
    if (type === 'scenario') {
      if (action === 'start' || action === 'queue' || action === 'enter' || action === 'next') {
        return {
          startScenario: {
            scenarioId: node.scenarioId || node.id || '',
            checkpointId: node.checkpointId || '',
            onSuccess: node.onSuccess || node.success || node.next || '',
            onFail: node.onFail || node.fail || node.next || '',
            onAbort: node.onAbort || node.abort || node.fail || node.next || ''
          },
          result: 'scenario'
        };
      }
      if (action === 'fail' || action === 'lose' || action === 'defeat') {
        return { next: node.onFail || node.fail || node.next, ops: node.failOps || node.loseOps || [], result: 'fail' };
      }
      if (action === 'abort' || action === 'cancel' || action === 'manual') {
        return { next: node.onAbort || node.abort || node.fail || node.next, ops: node.abortOps || [], result: 'abort' };
      }
      return { next: node.onSuccess || node.success || node.next, ops: node.successOps || node.winOps || [], result: 'success' };
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
    const type = String(node.type || '').toLowerCase();
    const defaultSummary = type === 'choice' && transition.choice
      ? `${node.prompt || node.text || node.title || node.id}: ${transition.choice.label || transition.choice.id}`
      : (node.summary || node.text || node.title || node.id);
    return {
      at: new Date().toISOString(),
      nodeId: node.id,
      type: node.type || '',
      action,
      value,
      result: transition.result || '',
      choiceId: transition.choice?.id || '',
      choiceLabel: transition.choice?.label || '',
      summary: defaultSummary
    };
  }

  function _storySummaryText(sequence = {}, log = [], mode = 'played') {
    if (mode === 'defaulted' && sequence.summary?.default) return sequence.summary.default;
    const short = (log || []).map((line) => line.summary).filter(Boolean).slice(-3).join(' | ');
    return short || sequence.summary?.short || sequence.summary?.default || sequence.title || sequence.id || 'Story part recorded.';
  }

  function _entryEligible(indexEntry = {}, state = CS()?.getState?.()) {
    if (!indexEntry || indexEntry.disabled) return false;
    if (indexEntry.conditions && Cond()?.evaluate && !Cond().evaluate(indexEntry.conditions, state || {}, {
      tags: indexEntry.tags || []
    }).ok) {
      return false;
    }
    const requiresFlags = _asArray(indexEntry.requiresFlags || indexEntry.flags);
    for (const flag of requiresFlags) {
      if (!state?.flags?.[flag]) return false;
    }
    const blocksFlags = _asArray(indexEntry.blocksFlags || indexEntry.blockFlags || indexEntry.blockedByFlags);
    for (const flag of blocksFlags) {
      if (state?.flags?.[flag]) return false;
    }
    const requiredParts = _asArray(indexEntry.requiresStoryParts);
    for (const partId of requiredParts) {
      if (!state?.storyMode?.partResults?.[partId]) return false;
    }
    const blockedParts = _asArray(indexEntry.blocksStoryParts);
    for (const partId of blockedParts) {
      if (state?.storyMode?.partResults?.[partId]) return false;
    }
    return true;
  }

  function _compareStoryEntries(a = {}, b = {}) {
    const aMeta = storyMeta(a);
    const bMeta = storyMeta(b);
    const byOrder = _compareOrderValues(aMeta.orderKey, bMeta.orderKey);
    if (byOrder !== 0) return byOrder;
    return Number(a._index || 0) - Number(b._index || 0);
  }

  function _compareOrderValues(left = '', right = '') {
    const a = _orderSegments(left);
    const b = _orderSegments(right);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      if (a[i] == null) return -1;
      if (b[i] == null) return 1;
      const segA = a[i];
      const segB = b[i];
      if (segA.kind === segB.kind) {
        if (segA.value < segB.value) return -1;
        if (segA.value > segB.value) return 1;
        continue;
      }
      if (segA.kind === 'number') return -1;
      if (segB.kind === 'number') return 1;
    }
    return 0;
  }

  function _orderSegments(value) {
    return String(value || '')
      .trim()
      .split(/[^a-zA-Z0-9]+/g)
      .filter(Boolean)
      .map((segment) => {
        if (/^\d+$/.test(segment)) return { kind: 'number', value: Number(segment) };
        return { kind: 'text', value: segment.toLowerCase() };
      });
  }

  function _chapterNumber(sequence = {}, indexEntry = {}) {
    sequence = sequence || {};
    indexEntry = indexEntry || {};
    const raw = sequence.chapterNumber
      ?? indexEntry.chapterNumber
      ?? sequence.chapterLabel
      ?? indexEntry.chapterLabel
      ?? sequence.chapterOrderKey
      ?? indexEntry.chapterOrderKey;
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function _labelFromId(value = '') {
    const match = String(value || '').match(/ch(?:apter)?[_-]?([a-z0-9.]+)/i);
    return match ? String(match[1]).replace(/_/g, '.') : '';
  }

  function _labelFromPart(value = '') {
    const match = String(value || '').match(/part[_-]?([a-z0-9.]+)/i);
    return match ? `Part ${String(match[1]).replace(/_/g, '.')}` : '';
  }

  function _deliveryStatus(value = '') {
    const normalized = String(value || 'ready').trim().toLowerCase().replace(/\s+/g, '_');
    return normalized || 'ready';
  }

  function _deliveryBlocked(value = {}) {
    const status = _deliveryStatus(value?.deliveryStatus);
    return status === 'in_update' || status === 'blocked';
  }

  function _completionOps(sequence = {}, mode = 'played') {
    if (!sequence) return [];
    const preferred = mode === 'defaulted'
      ? (sequence.defaultCompletionOps ?? sequence.completionOps)
      : sequence.completionOps;
    return _asArray(preferred);
  }

  function _syncSummary(sequence = {}, meta = {}, mode = 'played') {
    const preferred = mode === 'defaulted'
      ? (sequence?.defaultSyncSummary ?? sequence?.syncSummary ?? meta?.syncSummary)
      : (sequence?.syncSummary ?? meta?.syncSummary);
    return _summaryLines(preferred);
  }

  function _summaryLines(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((line) => String(line || '').trim()).filter(Boolean);
    if (typeof value === 'string') return [value].filter(Boolean);
    if (typeof value === 'object') {
      return Object.values(value).map((line) => String(line || '').trim()).filter(Boolean);
    }
    return [];
  }

  function _asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  }

  return Object.freeze({
    loadWorld,
    index,
    list,
    entry,
    storyMeta,
    storyStatus,
    compareOrderKeys: _compareOrderValues,
    cachedSequence,
    loadSequence,
    start,
    active,
    activeBundle,
    findNode,
    advance,
    resumeFromScenario,
    handleBattleOutcome,
    complete
  });
})();
