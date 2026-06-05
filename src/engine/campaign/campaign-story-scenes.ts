// campaign-story-scenes.ts — Tier 3 TS port of js/campaign/campaign-story-scenes.js
// (engine cluster: campaign). Full-screen VN scenes and deferred scenario-node
// entry handling: scene rendering, choice availability/preview, pending-node
// entry, and after-battle node capture. Reads window.CJS.* lazily.
//
// Exports `CampaignStoryScenes` and installs window.CJS.CampaignStoryScenes. Body
// verbatim from the legacy IIFE; only `: any` / DOM casts added where tsc
// (strict:false) requires them.

window.CJS = window.CJS || {};

export const CampaignStoryScenes = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const DS = () => window.CJS.DataStore;

  const _ui = {
    overlay: null,
    active: false,
    typingTimer: 0,
    autoTimer: 0,
    lineIndex: 0,
    scene: null,
    pendingId: null,
    autoPlay: false,
    history: [],
    historyOpen: false
  };

  const ONCE_KINDS = new Set(['reward', 'exit', 'resource', 'campfire', 'rest']);

  // A "small" event has no real VN content — just summary text or a quick
  // log line. We surface those inline (toast / event log) instead of taking
  // over the screen with a fullscreen VN window.
  function _isSmallEvent(scene) {
    const lines = Array.isArray(scene?.lines) ? scene.lines : [];
    const choices = Array.isArray(scene?.choices) ? scene.choices : [];
    if (choices.length > 0) return false;
    if (lines.length === 0) return true;
    if (lines.length === 1) {
      const single = lines[0];
      const text = String(single?.text || '').trim();
      // One short terminal/system line counts as small.
      if (!single?.speaker && text.length <= 120) return true;
      if (String(single?.style || '').toLowerCase() === 'terminal' && text.length <= 160) return true;
    }
    return false;
  }

  function _showSmallEvent(scene, context: any = {}) {
    const lines = Array.isArray(scene.lines) ? scene.lines : [];
    const text = lines.map((line) => {
      const speaker = (line.speaker || '').trim();
      const body = (line.text || '').trim();
      if (!body) return '';
      return speaker ? `${speaker}: ${body}` : body;
    }).filter(Boolean).join(' / ');
    const summary = text || scene.title || 'A small event passes.';
    if (window.CJS.UI?.toast) window.CJS.UI.toast(summary, 'info');
    Ops().apply({ op: 'log', text: summary }, { source: 'story_scene_small' });
    if (context.pendingId) {
      finishPendingNodeEntry({ reason: 'small_event' });
    } else {
      _completeStandaloneScene(context, { reason: 'small_event', sceneId: scene.id });
    }
  }

  function normalizeScene(scene: any = {}) {
    const lines = Array.isArray(scene.lines) ? scene.lines : (Array.isArray(scene.story_sequence) ? scene.story_sequence : []);
    const choices = Array.isArray(scene.choices) ? scene.choices : [];
    return {
      ...CS().clone(scene || {}),
      id: scene.id || '',
      title: scene.title || scene.name || scene.id || 'Story Scene',
      background: scene.background || scene.backdrop || '',
      lines: lines.map((line) => ({
        speaker: line.speaker || line.name || '',
        speakerId: line.speakerId || line.characterId || line.id || '',
        text: line.text || line.line || '',
        portrait: line.portrait || '',
        sprite: line.sprite || line.spriteId || '',
        expression: line.expression || line.emotion || '',
        pose: line.pose || '',
        variant: line.variant || '',
        side: line.side || 'left',
        style: line.style || '',
        mood: line.mood || ''
      })).filter((line) => line.text || line.speaker),
      choices: choices.map((choice, index) => ({
        ...choice,
        id: choice.id || `choice_${index + 1}`,
        label: choice.label || choice.text || `Choice ${index + 1}`,
        ops: _asOps(choice.ops || choice.operations || choice.effects),
        successOps: _asOps(choice.successOps || choice.passOps || choice.success),
        failOps: _asOps(choice.failOps || choice.failureOps || choice.fail),
        jpCost: Number(choice.jpCost || choice.cost?.jp || 0)
      })),
      onStartOps: _asOps(scene.onStartOps || scene.onStart),
      onEndOps: _asOps(scene.onEndOps || scene.onEnd),
      fallbackOps: _asOps(scene.fallbackOps || scene.fallback)
    };
  }

  function getScene(sceneId) {
    if (!sceneId) return null;
    const scene = DS().get?.('stories', sceneId)
      || CS().getContent?.().stories?.[sceneId]
      || null;
    return scene ? normalizeScene(scene) : null;
  }

  function playScene(sceneInput, options: any = {}) {
    if (_ui.active || typeof document === 'undefined' || !document.body) return false;
    const scene = typeof sceneInput === 'string' ? getScene(sceneInput) : normalizeScene(sceneInput);
    if (!scene) return false;
    // Small events skip the fullscreen VN window and surface inline.
    if (!options.forceFullscreen && _isSmallEvent(scene)) {
      _showSmallEvent(scene, { ...options, pendingId: options.pendingId || null });
      return true;
    }
    _showScene(scene, { ...options, pendingId: options.pendingId || null });
    return true;
  }

  function playSceneById(sceneId, options: any = {}) {
    return playScene(getScene(sceneId), options);
  }

  function shouldDeferNodeEntry(node: any = {}, mapId = '') {
    if (!node?.id) return false;
    if (!_nodeHasEntryFlow(node)) return false;
    if (_entryPolicy(node) === 'repeat') return true;
    return !isNodeEntryResolved(mapId, node.id, node);
  }

  function prepareNodeEntry(node: any = {}, map: any = {}, options: any = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const mapId = options.mapId || run?.mapId || map?.id;
    if (!run || !mapId || !shouldDeferNodeEntry(node, mapId)) return false;

    const pendingId = `node_entry_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    CS().mutate((next) => {
      const active = next.activeScenarioRun;
      if (!active) return;
      active.pendingNodeEntry = {
        id: pendingId,
        mapId,
        nodeId: node.id,
        storySceneId: node.storySceneId || node.campfire?.storySceneId || node.capture?.storySceneId || null,
        status: 'pending',
        source: options.source || 'node_entry',
        createdAt: new Date().toISOString(),
        started: false,
        startOpsApplied: false,
        nodeEffectsApplied: false
      };
    }, { source: 'node_entry_pending' });
    return true;
  }

  function openPendingNodeEntry() {
    if (_ui.active || typeof document === 'undefined' || !document.body) return false;
    const pending = CS().getState()?.activeScenarioRun?.pendingNodeEntry;
    if (!pending || pending.status === 'finalizing') return false;

    const node = _nodeForPending(pending);
    if (!node) {
      _clearPendingNodeEntry('missing_node');
      return false;
    }

    const scene = _sceneForPending(pending, node);
    if (!scene) {
      if (pending.storySceneId) {
        Ops().apply({ op: 'log', text: `Story scene missing: ${pending.storySceneId}; continuing node flow.` }, { source: 'story_scene_missing' });
      }
      finishPendingNodeEntry({ reason: 'missing_scene' });
      return false;
    }

    _markPendingStarted(pending, scene);
    _showScene(scene, { pendingId: pending.id });
    return true;
  }

  function finishPendingNodeEntry(options: any = {}) {
    const pending = CS().getState()?.activeScenarioRun?.pendingNodeEntry;
    if (!pending) return false;
    const node = _nodeForPending(pending);
    if (!node) {
      _clearPendingNodeEntry('missing_node');
      return false;
    }

    CS().mutate((state) => {
      const active = state.activeScenarioRun;
      if (active?.pendingNodeEntry?.id === pending.id) {
        active.pendingNodeEntry.status = 'finalizing';
      }
    }, { source: 'node_entry_finalizing' });

    if (!options.skipNodeEffects && !pending.nodeEffectsApplied) {
      _processNodeEntry(node, pending);
    }

    CS().mutate((state) => {
      const active = state.activeScenarioRun;
      if (!active?.pendingNodeEntry || active.pendingNodeEntry.id !== pending.id) return;
      const mapState = _ensureMapState(state, pending.mapId);
      if (_entryPolicy(node) !== 'repeat') {
        mapState.entryResolved[node.id] = {
          at: new Date().toISOString(),
          source: pending.storySceneId || pending.source || 'node_entry'
        };
      }
      if (node.campfire) {
        mapState.campfires[node.id] = true;
      }
      active.pendingNodeEntry = null;
    }, { source: 'node_entry_complete' });
    return true;
  }

  function choiceAvailability(choice: any = {}, state = CS().getState()) {
    const reasons = [];
    const flags = state?.flags || {};
    for (const flag of _flagList(choice.requiresFlags || choice.requiresFlag)) {
      if (!flags[flag]) reasons.push(`Requires ${flag}`);
    }
    for (const flag of _flagList(choice.blocksFlags || choice.blockFlags || choice.excludesFlags || choice.excludesFlag)) {
      if (flags[flag]) reasons.push(`Blocked by ${flag}`);
    }
    // Persona gates: requiresPersonas / blocksPersonas. Author beats with a
    // choice that's only visible when Bin is wearing his Survivor Leader skin,
    // for example. requiresPersonas[] passes if ANY active persona matches.
    const requiresPersonas = _flagList(choice.requiresPersonas || choice.requiresPersona);
    const blocksPersonas = _flagList(choice.blocksPersonas || choice.blocksPersona);
    if (requiresPersonas.length || blocksPersonas.length) {
      const active = new Set();
      for (const member of Object.values<any>(state?.party || {})) {
        if (member.activePersona) active.add(member.activePersona);
      }
      if (requiresPersonas.length && !requiresPersonas.some((pid) => active.has(pid))) {
        reasons.push(`Requires persona ${requiresPersonas.join(' or ')}`);
      }
      for (const pid of blocksPersonas) {
        if (active.has(pid)) reasons.push(`Blocked while ${pid} is active`);
      }
    }
    const cost = Number(choice.jpCost || choice.cost?.jp || 0);
    if (cost > _jp(state)) reasons.push(`Needs ${cost} JP`);
    return { ok: reasons.length === 0, reasons };
  }

  function previewChoiceOps(sceneInput: any = {}, choiceInput: any = {}) {
    const scene = normalizeScene(sceneInput);
    const choice = normalizeScene({ choices: [choiceInput] }).choices[0] || choiceInput;
    return _choiceOps(scene, choice);
  }

  function captureNodeAfterBattle(state, pending: any = {}, outcome = 'victory') {
    if (String(outcome || '').toLowerCase() !== 'victory') return false;
    const nodeId = pending.nodeId;
    const mapId = pending.mapId || state.activeScenarioRun?.mapId;
    if (!nodeId || !mapId) return false;
    const node = _findNodeForState(state, mapId, nodeId);
    const mapState = _ensureMapState(state, mapId);
    mapState.cleared[nodeId] = true;
    if (!node?.capture) return false;
    return _captureNodeMutable(state, mapId, node, { source: 'battle_victory' });
  }

  function _showScene(scene, context: any = {}) {
    const normalized = normalizeScene(scene);
    _ui.active = true;
    _ui.scene = normalized;
    _ui.pendingId = context.pendingId || null;
    _ui.lineIndex = 0;
    _ui.history = [];
    _ui.historyOpen = false;
    _ui.autoPlay = false;

    document.body.classList.add('vn-window-open');

    const overlay = document.createElement('div');
    overlay.className = 'campaign-vn-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="campaign-vn-stage">
        <div class="campaign-vn-backdrop"></div>
        <div class="campaign-vn-topline">
          <span>${_esc(normalized.title)}</span>
          <div>
            <button type="button" data-vn-auto aria-pressed="false">Auto</button>
            <button type="button" data-vn-skip>Skip</button>
            <button type="button" data-vn-log>Log</button>
          </div>
        </div>
        <button type="button" class="campaign-vn-close" data-vn-close aria-label="Close scene">×</button>
        <div class="campaign-vn-portraits">
          <div class="campaign-vn-portrait is-left" data-vn-portrait-left></div>
          <div class="campaign-vn-portrait is-right" data-vn-portrait-right></div>
        </div>
        <section class="campaign-vn-dialogue">
          <div class="campaign-vn-speaker" data-vn-speaker></div>
          <p data-vn-text></p>
          <small data-vn-hint>Click or press Space to continue</small>
        </section>
        <section class="campaign-vn-choices" data-vn-choices hidden></section>
      </div>
    `;

    const backdrop = overlay.querySelector('.campaign-vn-backdrop');
    const bg = normalized.background || _storyThemeBackdrop();
    if (bg) (backdrop as HTMLElement).style.backgroundImage = `url('${_cssUrl(bg)}')`;

    document.body.appendChild(overlay);
    _ui.overlay = overlay;

    const advance = () => _advanceSceneLine(normalized, context);
    overlay.querySelector('[data-vn-skip]').addEventListener('click', (event) => {
      event.stopPropagation();
      _skipTypingOrChoices(normalized, context);
    });
    const autoBtn = overlay.querySelector('[data-vn-auto]');
    autoBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      _ui.autoPlay = !_ui.autoPlay;
      autoBtn.setAttribute('aria-pressed', _ui.autoPlay ? 'true' : 'false');
      if (_ui.autoPlay) _scheduleAutoAdvance(normalized, context);
      else _cancelAutoAdvance();
    });
    overlay.querySelector('[data-vn-log]').addEventListener('click', (event) => {
      event.stopPropagation();
      _toggleHistoryPanel(normalized);
    });
    const closeBtn = overlay.querySelector('[data-vn-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        _closeOverlay();
        if (context.pendingId) {
          finishPendingNodeEntry({ reason: 'user_closed' });
        } else {
          _completeStandaloneScene(context, { reason: 'user_closed', sceneId: normalized.id });
        }
      });
    }
    overlay.addEventListener('click', (event) => {
      const t = event.target as HTMLElement;
      if (t.closest('button')) return;
      if (t.closest('.campaign-vn-choices')) return;
      if (t.closest('.campaign-vn-history')) return;
      advance();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        advance();
      }
      if (event.key === 'Escape') {
        if (_ui.historyOpen) _toggleHistoryPanel(normalized);
        else _skipTypingOrChoices(normalized, context);
      }
    });
    overlay.tabIndex = -1;
    overlay.focus();
    _renderLine(normalized, 0, context);
  }

  function _scheduleAutoAdvance(scene, context) {
    _cancelAutoAdvance();
    _ui.autoTimer = setTimeout(() => {
      if (!_ui.autoPlay) return;
      _advanceSceneLine(scene, context);
    }, 2800);
  }

  function _cancelAutoAdvance() {
    if (_ui.autoTimer) { clearTimeout(_ui.autoTimer); _ui.autoTimer = 0; }
  }

  function _toggleHistoryPanel(scene) {
    const overlay = _ui.overlay;
    if (!overlay) return;
    const existing = overlay.querySelector('.campaign-vn-history');
    if (existing) {
      existing.parentNode.removeChild(existing);
      _ui.historyOpen = false;
      return;
    }
    _ui.historyOpen = true;
    const panel = document.createElement('div');
    panel.className = 'campaign-vn-history';
    const lines = _ui.history.length
      ? _ui.history.map((entry) => `
          <div class="campaign-vn-history-line">
            <strong>${_esc(entry.speaker || 'Narrator')}</strong>
            <span>${_esc(entry.text)}</span>
          </div>
        `).join('')
      : '<div class="campaign-empty">No lines yet.</div>';
    panel.innerHTML = `
      <h3>Scene Log — ${_esc(scene.title || 'Story')}</h3>
      <button type="button" class="campaign-vn-history-close" data-vn-history-close aria-label="Close log">×</button>
      <div class="campaign-vn-history-list">${lines}</div>
    `;
    overlay.querySelector('.campaign-vn-stage').appendChild(panel);
    panel.querySelector('[data-vn-history-close]').addEventListener('click', () => _toggleHistoryPanel(scene));
  }

  function _renderLine(scene, index, context) {
    const line = scene.lines[index];
    if (!line) return _renderChoices(scene, context);
    const overlay = _ui.overlay;
    const speaker = overlay.querySelector('[data-vn-speaker]');
    const text = overlay.querySelector('[data-vn-text]');
    const choices = overlay.querySelector('[data-vn-choices]');
    const box = overlay.querySelector('.campaign-vn-dialogue');
    choices.hidden = true;
    choices.innerHTML = '';

    box.classList.toggle('is-terminal', _lineStyle(line) === 'terminal');
    speaker.textContent = line.speaker || (_lineStyle(line) === 'terminal' ? 'System' : '');
    _renderPortrait(line, scene);
    _typeText(text, line.text || '');
    _ui.history.push({ speaker: line.speaker || (_lineStyle(line) === 'terminal' ? 'System' : ''), text: line.text || '' });
    if (_ui.autoPlay) _scheduleAutoAdvance(scene, context);
  }

  function _advanceSceneLine(scene, context) {
    if (_finishTyping()) return;
    _ui.lineIndex += 1;
    if (_ui.lineIndex >= scene.lines.length) return _renderChoices(scene, context);
    _renderLine(scene, _ui.lineIndex, context);
  }

  function _skipTypingOrChoices(scene, context) {
    if (_finishTyping()) return;
    _ui.lineIndex = scene.lines.length;
    _renderChoices(scene, context);
  }

  function _renderChoices(scene, context) {
    const overlay = _ui.overlay;
    const choicesEl = overlay.querySelector('[data-vn-choices]');
    const text = overlay.querySelector('[data-vn-text]');
    const speaker = overlay.querySelector('[data-vn-speaker]');
    const box = overlay.querySelector('.campaign-vn-dialogue');
    _finishTyping();
    box.classList.remove('is-terminal');
    speaker.textContent = scene.title || 'Story';
    text.textContent = scene.choicePrompt || 'Choose how this moment resolves.';
    choicesEl.hidden = false;

    const choices = scene.choices.length ? scene.choices : [{ id: 'continue', label: 'Continue', ops: [] }];
    choicesEl.innerHTML = choices.map((choice, index) => {
      const availability = choiceAvailability(choice);
      const ops = _choiceOps(scene, choice);
      const desc = Ops().describe ? Ops().describe(ops).filter(Boolean) : [];
      const disabled = availability.ok ? '' : 'disabled';
      const reason = availability.ok ? '' : availability.reasons.join('; ');
      return `
        <button type="button" class="campaign-vn-choice" data-vn-choice="${index}" ${disabled} title="${_escAttr(reason)}">
          <strong>${_esc(choice.label)}</strong>
          <span>${_esc(desc.join(' | ') || reason || 'Story choice')}</span>
        </button>
      `;
    }).join('');

    choicesEl.querySelectorAll('[data-vn-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = choices[Number(btn.dataset.vnChoice || 0)];
        _applySceneChoice(scene, choice, context);
      });
    });
  }

  function _applySceneChoice(scene, choice: any = {}, context: any = {}) {
    const availability = choiceAvailability(choice);
    if (!availability.ok) return;
    const ops = _choiceOps(scene, choice);
    if (ops.length) Ops().apply(ops, { source: 'story_scene_choice' });
    _recordStoryChoice(scene, choice);
    _closeOverlay();

    if (choice.nextSceneId) {
      if (context.pendingId) {
        CS().mutate((state) => {
          const pending = state.activeScenarioRun?.pendingNodeEntry;
          if (pending && (!context.pendingId || pending.id === context.pendingId)) {
            pending.storySceneId = choice.nextSceneId;
            pending.status = 'pending';
            pending.started = false;
            pending.startOpsApplied = false;
          }
        }, { source: 'story_scene_next' });
        setTimeout(() => openPendingNodeEntry(), 0);
      } else {
        setTimeout(() => playSceneById(choice.nextSceneId, context), 0);
      }
      return;
    }

    if (context.pendingId) finishPendingNodeEntry({ reason: 'choice' });
    else _completeStandaloneScene(context, { reason: 'choice', sceneId: scene.id, choiceId: choice.id || '' });
  }

  function _choiceOps(scene, choice: any = {}) {
    const ops = [];
    const cost = Number(choice.jpCost || choice.cost?.jp || 0);
    if (cost > 0) ops.push({ op: 'take_jp', amount: cost });
    ops.push(..._asOps(choice.ops));
    if (choice.statCheck) {
      const check = choice.statCheck;
      ops.push({
        op: check.type === 'qte_or_dice' ? 'run_qte_or_dice' : 'roll_check',
        stat: check.stat || 'C',
        dc: check.dc || check.target || 10,
        success: _asOps(choice.successOps || check.success),
        fail: _asOps(choice.failOps || check.fail)
      });
    } else {
      ops.push(..._asOps(choice.successOps));
    }
    if (choice.nextAction?.op) ops.push(choice.nextAction);
    ops.push(..._asOps(scene.onEndOps));
    return ops.filter(Boolean);
  }

  function _processNodeEntry(node, pending) {
    CS().mutate((state) => {
      const active = state.activeScenarioRun;
      if (active?.pendingNodeEntry?.id === pending.id) active.pendingNodeEntry.nodeEffectsApplied = true;
    }, { source: 'node_entry_effects' });

    if (Array.isArray(node.onEnter) && node.onEnter.length) {
      Ops().apply(node.onEnter, { source: 'node_enter' });
    }

    _setSpecificEvent(node, pending);

    if (node.trap?.check) {
      CS().mutate((state) => {
        state.lastEvent = {
          type: 'trap',
          title: node.trap.title || node.title,
          prompt: node.trap.prompt || '',
          suggested: [_checkToOperation(node.trap.check)]
        };
      }, { source: 'trap' });
    }

    _queueNodeBattle(node, pending);
    _captureOnEntryIfSafe(node, pending);
    _autoPartyChat(node, pending);
    _logObjectiveIfReached(node, pending);
  }

  function _setSpecificEvent(node, pending) {
    const ids = [..._asArray(node.eventIds), ..._asArray(node.events)];
    const event = ids.length ? _findEventById(ids) : null;
    if (event) {
      CS().mutate((state) => {
        state.lastEvent = event;
        if (state.activeScenarioRun) state.activeScenarioRun.eventsUsed = (state.activeScenarioRun.eventsUsed || 0) + 1;
      }, { source: 'node_event' });
      return;
    }
    const tableIds = _asArray(node.eventTableIds);
    if (tableIds.length && window.CJS.CampaignEvents?.roll) {
      window.CJS.CampaignEvents.roll(tableIds[0], {
        world: CS().getState()?.currentWorld,
        tags: node.tags || [],
        locationKind: node.kind || ''
      });
      CS().mutate((state) => {
        if (state.activeScenarioRun && state.lastEvent) state.activeScenarioRun.eventsUsed = (state.activeScenarioRun.eventsUsed || 0) + 1;
      }, { source: 'node_event' });
    }
    void pending;
  }

  function _queueNodeBattle(node, pending) {
    const state = CS().getState();
    const mapState = state.mapState?.[pending.mapId] || {};
    if (state.pendingBattle || mapState.cleared?.[node.id] || mapState.captured?.[node.id]) return;
    if (node.randomBattle) {
      window.CJS.ScenarioRunner?.maybeTriggerRandomBattle?.(node.randomBattle);
      return;
    }
    const battleSetId = node.battleSetIds?.[0] || null;
    const encounterId = node.encounterIds?.[0] || node.encounterId || null;
    if (battleSetId || encounterId) {
      Ops().apply({
        op: 'start_battle',
        battleSetId,
        encounterId,
        label: node.battleLabel || node.title || encounterId || battleSetId,
        nodeId: node.id,
        source: 'node'
      }, { source: 'node_battle' });
    }
  }

  function _captureOnEntryIfSafe(node, pending) {
    if (!node.capture) return;
    if (_nodeHasBattle(node) && node.capture.captureOnEnter !== true) return;
    Ops().apply({
      op: 'capture_node',
      mapId: pending.mapId,
      nodeId: node.id,
      title: node.capture.title || node.title,
      incomeOps: node.capture.incomeOps || node.capture.dailyOps || [],
      notes: node.capture.notes || ''
    }, { source: 'node_capture' });
  }

  function _captureNodeMutable(state, mapId, node, meta: any = {}) {
    const mapState = _ensureMapState(state, mapId);
    if (mapState.captured?.[node.id]) return false;
    const capture = node.capture || {};
    const key = capture.id || `${mapId}:${node.id}`;
    const record = {
      id: key,
      mapId,
      nodeId: node.id,
      title: capture.title || node.title || node.id,
      incomeOps: _asOps(capture.incomeOps || capture.dailyOps),
      capturedAt: new Date().toISOString(),
      source: meta.source || 'capture'
    };
    mapState.captured[node.id] = record;
    mapState.entryResolved[node.id] = mapState.entryResolved[node.id] || { at: record.capturedAt, source: 'capture' };
    state.pocketHaven = state.pocketHaven || {};
    state.pocketHaven.incomeNodes = state.pocketHaven.incomeNodes || {};
    state.pocketHaven.incomeNodes[key] = record;
    _pushLog(state, `Captured resource node: ${record.title}.`);
    if (record.incomeOps.length) _pushLog(state, `${record.title} will produce income each phase.`);
    return true;
  }

  function _autoPartyChat(node, pending) {
    const scenario = CS().getActiveScenario?.();
    window.CJS.CampaignPartyChat?.auto?.({
      world: scenario?.world || CS().getState()?.currentWorld,
      situation: node.campfire ? 'campfire' : 'scenario',
      scenarioId: CS().getState()?.activeScenarioRun?.scenarioId || '',
      mapId: pending.mapId,
      questId: CS().getState()?.activeScenarioRun?.questId || '',
      storyId: pending.storySceneId || '',
      locationKind: node.kind || '',
      tags: [...(node.tags || []), ...(scenario?.tags || [])]
    }, { chance: node.campfire ? 0.85 : 0.35 });
  }

  function _logObjectiveIfReached(node, pending: any = {}) {
    return window.CJS.ScenarioRunner?.handleLocationEntry?.('node', node, {
      mapId: pending.mapId,
      nodeId: node.id
    });
  }

  function _completeStandaloneScene(context: any = {}, details: any = {}) {
    if (typeof context.onComplete !== 'function') return;
    try {
      context.onComplete({
        reason: details.reason || 'complete',
        sceneId: details.sceneId || '',
        choiceId: details.choiceId || ''
      });
    } catch (error) {
      console.error('Story scene completion callback failed:', error);
    }
  }

  function _recordStoryChoice(scene, choice: any = {}) {
    CS().mutate((state) => {
      state.storyChoices = state.storyChoices || [];
      state.storyChoices.unshift({
        id: `story_choice_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        sceneId: scene.sourceId || scene.id,
        runtimeSceneId: scene.id,
        title: scene.title,
        choiceId: choice.id || '',
        label: choice.label || '',
        phase: state.phase?.number || 1,
        world: state.currentWorld,
        at: new Date().toISOString()
      });
      state.storyChoices = state.storyChoices.slice(0, 100);
    }, { source: 'story_choice' });
  }

  function _markPendingStarted(pending, scene) {
    CS().mutate((state) => {
      const active = state.activeScenarioRun;
      const entry = active?.pendingNodeEntry;
      if (!entry || entry.id !== pending.id) return;
      entry.status = 'playing';
      entry.started = true;
      entry.sceneTitle = scene.title;
      if (!entry.startOpsApplied && scene.onStartOps?.length) {
        entry.startOpsApplied = true;
      }
    }, { source: 'story_scene_start' });
    if (!pending.startOpsApplied && scene.onStartOps?.length) {
      Ops().apply(scene.onStartOps, { source: 'story_scene_start' });
    }
  }

  function _sceneForPending(pending, node) {
    const scene = getScene(pending.storySceneId);
    if (scene) return scene;
    if (node.campfire && !pending.storySceneId) return _campfireScene(node);
    return null;
  }

  function _campfireScene(node: any = {}) {
    return normalizeScene({
      id: `campfire_${node.id}`,
      title: node.title || 'Campfire',
      lines: [
        { speaker: 'System', style: 'terminal', text: 'CAMPFIRE NODE DETECTED. Morale, questionable stew, and bad plans are now available.' },
        { speaker: 'Bin', speakerId: 'bin', text: 'Nobody say "quick rest." That is how tutorials summon wolves.' }
      ],
      choices: [
        { label: 'Take a cautious rest', ops: [{ op: 'camp_rest', dangerChange: 1 }] },
        { label: 'Just warm up and keep moving', ops: [{ op: 'log', text: 'The party used the campfire without spending a rest.' }] }
      ]
    });
  }

  function _nodeHasEntryFlow(node: any = {}) {
    return !!(
      node.storySceneId ||
      node.entryPolicy ||
      ONCE_KINDS.has(node.kind) ||
      node.campfire ||
      node.capture ||
      _asArray(node.eventIds).length ||
      _asArray(node.eventTableIds).length
    );
  }

  function _entryPolicy(node: any = {}) {
    return node.entryPolicy || ((node.capture || node.storySceneId || ONCE_KINDS.has(node.kind)) ? 'once' : 'repeat');
  }

  function isNodeEntryResolved(mapId, nodeId, node: any = {}, state = CS().getState()) {
    if (!mapId || !nodeId) return false;
    if (_entryPolicy(node) === 'repeat') return false;
    const mapState = state?.mapState?.[mapId] || {};
    return !!(mapState.entryResolved?.[nodeId] || mapState.captured?.[nodeId]);
  }

  function _nodeHasBattle(node: any = {}) {
    return !!(node.randomBattle || node.battleSetIds?.length || node.encounterIds?.length || node.encounterId);
  }

  function _nodeForPending(pending) {
    const state = CS().getState();
    return _findNodeForState(state, pending.mapId, pending.nodeId);
  }

  function _findNodeForState(state, mapId, nodeId) {
    const run = state?.activeScenarioRun;
    const map = run?.proceduralMap && (run.mapId === mapId || run.proceduralMap.id === mapId)
      ? run.proceduralMap
      : CS().getScenarioMapById?.(mapId);
    return (map?.nodes || []).find((entry) => entry.id === nodeId) || null;
  }

  function _ensureMapState(state, mapId) {
    state.mapState = state.mapState || {};
    const map = state.mapState[mapId] = state.mapState[mapId] || {};
    map.visited = map.visited || {};
    map.revealed = map.revealed || {};
    map.locked = map.locked || {};
    map.cleared = map.cleared || {};
    map.notes = map.notes || {};
    map.entryResolved = map.entryResolved || {};
    map.captured = map.captured || {};
    map.campfires = map.campfires || {};
    return map;
  }

  function _findEventById(ids: any[] = []) {
    const wanted = new Set(ids.filter(Boolean));
    for (const table of Object.values<any>(CS().getContent?.().campaignEvents || {})) {
      for (const entry of table.entries || []) {
        if (!wanted.has(entry.id)) continue;
        return {
          ...CS().clone(entry),
          tableId: table.id,
          tableName: table.name || table.id,
          rolledAt: new Date().toISOString()
        };
      }
    }
    return null;
  }

  function _clearPendingNodeEntry(reason) {
    CS().mutate((state) => {
      if (state.activeScenarioRun) state.activeScenarioRun.pendingNodeEntry = null;
    }, { source: reason || 'node_entry_clear' });
  }

  function _renderPortrait(line, scene) {
    const side = line.side === 'right' ? 'right' : 'left';
    const other = side === 'right' ? 'left' : 'right';
    const overlay = _ui.overlay;
    const target = overlay.querySelector(`[data-vn-portrait-${side}]`);
    const inactive = overlay.querySelector(`[data-vn-portrait-${other}]`);
    inactive.classList.remove('is-active');
    if (_lineStyle(line) === 'terminal') {
      target.innerHTML = `<div class="campaign-vn-terminal-mark">CJS</div>`;
      target.classList.add('is-active', 'is-system');
      return;
    }
    target.classList.remove('is-system');
    const character = _characterForLine(line);
    const portrait = _portraitForLine(line, character);
    target.dataset.expression = String(line.expression || line.mood || '').trim().toLowerCase();
    target.dataset.pose = String(line.pose || '').trim().toLowerCase();
    target.dataset.variant = String(line.variant || '').trim().toLowerCase();
    target.innerHTML = portrait
      ? `<img src="${_escAttr(portrait)}" alt=""><span>${_esc(line.speaker || character?.name || '')}</span>`
      : `<div class="campaign-vn-avatar-fallback">${_esc(character?.icon || (line.speaker || '?').slice(0, 1))}</div><span>${_esc(line.speaker || character?.name || '')}</span>`;
    target.classList.add('is-active');
    void scene;
  }

  function _portraitForLine(line: any = {}, character = null) {
    if (line.portrait) return line.portrait;
    const spriteId = String(line.sprite || '').trim();
    const expression = String(line.expression || line.mood || '').trim();
    const pose = String(line.pose || '').trim();
    const variant = String(line.variant || '').trim();
    const candidateKeys = [variant, expression, pose, spriteId].filter(Boolean);
    const pools = [
      character?.storySprites,
      character?.dialogueSprites,
      character?.expressionPortraits,
      character?.portraits,
      character?.expressions
    ].filter((pool) => pool && typeof pool === 'object');

    for (const pool of pools) {
      const resolved = _portraitFromPool(pool, candidateKeys, { expression, pose, variant, spriteId });
      if (resolved) return resolved;
    }
    return character?.portrait || '';
  }

  function _portraitFromPool(pool: any = {}, candidateKeys: any[] = [], context: any = {}) {
    for (const key of candidateKeys) {
      if (typeof pool[key] === 'string') return pool[key];
      const nested = pool[key];
      if (nested && typeof nested === 'object') {
        const nestedResolved = _portraitFromPool(nested, candidateKeys.filter((candidate) => candidate !== key), context);
        if (nestedResolved) return nestedResolved;
      }
    }
    for (const key of ['default', 'neutral', context.spriteId]) {
      if (!key) continue;
      if (typeof pool[key] === 'string') return pool[key];
      const nested = pool[key];
      if (nested && typeof nested === 'object') {
        const nestedResolved = _portraitFromPool(nested, candidateKeys, context);
        if (nestedResolved) return nestedResolved;
      }
    }
    return '';
  }

  function _characterForLine(line) {
    if (line.speakerId) return DS().get?.('characters', line.speakerId);
    const speaker = String(line.speaker || '').toLowerCase();
    if (!speaker) return null;
    return DS().getAllAsArray?.('characters')?.find((entry) =>
      String(entry.id || '').toLowerCase() === speaker ||
      String(entry.name || '').toLowerCase() === speaker
    ) || null;
  }

  function _typeText(el, value) {
    _finishTyping();
    const text = String(value || '');
    el.dataset.fullText = text;
    if (_prefersReducedMotion() || text.length < 12) {
      el.textContent = text;
      el.dataset.typing = 'false';
      return;
    }
    el.textContent = '';
    el.dataset.typing = 'true';
    let index = 0;
    _ui.typingTimer = setInterval(() => {
      index += 2;
      el.textContent = text.slice(0, index);
      if (index >= text.length) _finishTyping();
    }, 14);
  }

  function _finishTyping() {
    const overlay = _ui.overlay;
    const text = overlay?.querySelector?.('[data-vn-text]');
    if (!text || text.dataset.typing !== 'true') return false;
    clearInterval(_ui.typingTimer);
    _ui.typingTimer = 0;
    text.textContent = text.dataset.fullText || text.textContent || '';
    text.dataset.typing = 'false';
    return true;
  }

  function _closeOverlay() {
    clearInterval(_ui.typingTimer);
    _ui.typingTimer = 0;
    _cancelAutoAdvance();
    if (_ui.overlay) {
      _ui.overlay.classList.add('is-closing');
      const overlay = _ui.overlay;
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
    }
    _ui.overlay = null;
    _ui.active = false;
    _ui.scene = null;
    _ui.pendingId = null;
    _ui.history = [];
    _ui.historyOpen = false;
    _ui.autoPlay = false;
    document.body.classList.remove('vn-window-open');
  }

  function _prefersReducedMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function _storyThemeBackdrop() {
    const world = CS().getCurrentWorld?.();
    const worldId = world?.id || world?.storyModeTheme?.id || '';
    return _worldThemeImage(worldId, world?.storyModeTheme?.backdrop || '');
  }

  function _worldThemeImage(worldId, path = '') {
    const text = String(path || '').trim();
    const clean = text.split('?')[0].split('#')[0].replace(/^\.?\//, '').toLowerCase();
    if (String(worldId || '').toLowerCase() === 'earth' && clean === 'images/story-mode/earth/earth-theme.webp') {
      return 'images/story-mode/earth/earth-map.webp';
    }
    return text;
  }

  function _lineStyle(line: any = {}) {
    return String(line.style || '').toLowerCase();
  }

  function _checkToOperation(check: any = {}) {
    return {
      op: check.type === 'qte_or_dice' ? 'run_qte_or_dice' : 'roll_check',
      stat: check.stat,
      dc: check.dc,
      success: check.success,
      fail: check.fail
    };
  }

  function _pushLog(state, text) {
    state.log = state.log || [];
    state.log.unshift({
      id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      at: new Date().toISOString(),
      phase: state.phase?.number || 1,
      world: state.currentWorld,
      text,
      op: 'story_scene'
    });
    state.log = state.log.slice(0, 500);
  }

  function _jp(state = CS().getState()) {
    return Number(state?.currencies?.jp || state?.currencies?.jester_points || 0);
  }

  function _flagList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') return [value];
    if (typeof value === 'object') return Object.entries<any>(value).filter(([, enabled]) => !!enabled).map(([flag]) => flag);
    return [];
  }

  function _asOps(value) {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).filter(Boolean);
  }

  function _asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  }

  function _cssUrl(value) {
    return String(value || '').replace(/'/g, "\\'");
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({
    normalizeScene,
    getScene,
    playScene,
    playSceneById,
    shouldDeferNodeEntry,
    isNodeEntryResolved,
    prepareNodeEntry,
    openPendingNodeEntry,
    finishPendingNodeEntry,
    choiceAvailability,
    previewChoiceOps,
    captureNodeAfterBattle
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignStoryScenes = CampaignStoryScenes;
