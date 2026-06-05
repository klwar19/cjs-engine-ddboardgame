// campaign-sequence-vn.js
// Fullscreen visual-novel renderer for sequence files.
//
// Sequences (data/campaigns/<world>/sequences/...) are state-machine JSON.
// Until now they rendered as a plain inline panel with a "Continue" button —
// not a visual novel. This module wraps a fullscreen overlay around the
// sequence runner so story/event/quest sequences play as proper VN scenes:
// background image, portrait of the speaker (with expression), typed text,
// choice buttons, Auto/Skip/Log controls.
//
// The actual state machine still lives in CampaignSequences. This file only
// presents the current node and translates clicks into advance() calls.
//
// Reads:   CampaignSequences (active node + sequence), DataStore (character
//          portraits + expressions), CampaignState (current world).
// Writes:  Nothing in state. All state mutations go through CampaignSequences
//          and Ops. The overlay is rebuilt every time the active node changes.

// Tier 3 TS port of js/campaign/campaign-sequence-vn.js (engine cluster:
// campaign). Fullscreen visual-novel renderer wrapping the sequence runner
// (background, speaker portrait/expression, typed text, choice buttons, Auto/
// Skip/Log). Exports `CampaignSequenceVN` and installs window.CJS.CampaignSequenceVN.
// Body verbatim from the legacy IIFE; ': any' / DOM casts added for tsc.
window.CJS = window.CJS || {};

export const CampaignSequenceVN = (() => {
  'use strict';

  const Seq = () => window.CJS.CampaignSequences;
  const CS  = () => window.CJS.CampaignState;
  const DS  = () => window.CJS.DataStore;
  const Ops = () => window.CJS.CampaignOps;
  const UI  = () => window.CJS.UI;

  const ROOT_CLASS = 'campaign-seq-vn-overlay';

  let _overlay = null;
  let _activeKey = '';            // sequenceId:nodeId — used to detect node changes
  let _typingTimer = 0;
  let _typingFinished = true;
  let _enabled = true;            // user can toggle to fall back to inline
  let _busy = false;              // suppress advance during async work
  let _autoPlay = false;
  let _autoTimer = 0;
  let _history = [];
  let _historyOpen = false;
  let _renderingNodeKey = '';

  function init() {
    if (typeof document === 'undefined') return;
    if (!CS()?.subscribe) return;
    CS().subscribe(() => _syncFromState());
    document.addEventListener('keydown', _onKey);
    _syncFromState();
  }

  function setEnabled(value) {
    _enabled = !!value;
    if (!_enabled) _close();
    else _syncFromState();
  }

  function isEnabled() { return _enabled; }

  function close() { _close(); }

  function _syncFromState() {
    if (!_enabled) return;
    const state = CS()?.getState?.();
    const active = Seq()?.active?.(state);
    if (!active) { _close(); return; }
    const sequence = Seq().cachedSequence?.(active.sequenceId, state?.currentWorld);
    if (!sequence) { return; }   // still loading; render() will be called again on next state tick
    const node = Seq().findNode?.(sequence, active.nodeId);
    if (!node) return;
    const key = `${active.sequenceId}::${node.id}`;
    if (key === _activeKey && _overlay) return;  // already showing
    _activeKey = key;
    _render(sequence, node, active);
  }

  function _render(sequence, node, active) {
    if (!_overlay) _ensureOverlay(sequence);
    _renderingNodeKey = `${sequence.id}::${node.id}`;
    _updateBackdrop(sequence, node);
    _updateTopline(sequence, active);
    _updateBody(sequence, node, active);
  }

  function _ensureOverlay(sequence) {
    const root = document.body;
    if (!root) return null;
    const div = document.createElement('div');
    div.className = ROOT_CLASS;
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.innerHTML = `
      <div class="campaign-seq-vn-backdrop" data-vn-backdrop></div>
      <div class="campaign-seq-vn-vignette" aria-hidden="true"></div>
      <header class="campaign-seq-vn-topline">
        <div class="campaign-seq-vn-title-block">
          <span class="campaign-seq-vn-kicker" data-vn-kicker></span>
          <span class="campaign-seq-vn-title" data-vn-title></span>
        </div>
        <div class="campaign-seq-vn-controls">
          <button type="button" class="campaign-seq-vn-btn" data-vn-auto aria-pressed="false">Auto</button>
          <button type="button" class="campaign-seq-vn-btn" data-vn-log>Log</button>
          <button type="button" class="campaign-seq-vn-btn" data-vn-toggle title="Switch to inline panel">Panel</button>
          <button type="button" class="campaign-seq-vn-btn is-danger" data-vn-end title="End the sequence">End</button>
        </div>
      </header>
      <div class="campaign-seq-vn-stage">
        <div class="campaign-seq-vn-portrait is-left" data-vn-portrait-left></div>
        <div class="campaign-seq-vn-portrait is-right" data-vn-portrait-right></div>
      </div>
      <section class="campaign-seq-vn-dialogue" data-vn-dialogue>
        <div class="campaign-seq-vn-speaker" data-vn-speaker></div>
        <p class="campaign-seq-vn-text" data-vn-text></p>
        <small class="campaign-seq-vn-hint" data-vn-hint>Tap or press Space to continue</small>
        <div class="campaign-seq-vn-choices" data-vn-choices hidden></div>
        <div class="campaign-seq-vn-meta" data-vn-meta></div>
      </section>
      <div class="campaign-seq-vn-history" data-vn-history hidden>
        <header>
          <strong>Scene Log</strong>
          <button type="button" class="campaign-seq-vn-btn" data-vn-history-close>Close</button>
        </header>
        <div class="campaign-seq-vn-history-list" data-vn-history-list></div>
      </div>
    `;
    root.appendChild(div);
    _overlay = div;
    document.body.classList.add('vn-window-open');

    div.querySelector('[data-vn-auto]').addEventListener('click', _toggleAuto);
    div.querySelector('[data-vn-log]').addEventListener('click', _toggleHistory);
    div.querySelector('[data-vn-toggle]').addEventListener('click', () => setEnabled(false));
    div.querySelector('[data-vn-end]').addEventListener('click', _confirmEnd);
    div.querySelector('[data-vn-history-close]').addEventListener('click', _toggleHistory);

    div.addEventListener('click', (event) => {
      const t = event.target as HTMLElement;
      if (t.closest('button')) return;
      if (t.closest('.campaign-seq-vn-choices')) return;
      if (t.closest('.campaign-seq-vn-history')) return;
      _onAdvanceClick();
    });

    void sequence;
    return div;
  }

  function _updateBackdrop(sequence, node) {
    const backdrop = _overlay?.querySelector('[data-vn-backdrop]');
    if (!backdrop) return;
    const bg = node.background || sequence.background || _defaultBackdrop();
    if (bg) backdrop.style.backgroundImage = `url('${_cssUrl(bg)}')`;
    else backdrop.style.backgroundImage = '';
  }

  function _updateTopline(sequence, active) {
    const kicker = _overlay?.querySelector('[data-vn-kicker]');
    const title = _overlay?.querySelector('[data-vn-title]');
    if (!kicker || !title) return;
    const meta = Seq()?.storyMeta?.(sequence, CS()?.getState?.()?.currentWorld) || {};
    const chapterLabel = meta.chapterLabel || active?.chapterLabel || '';
    const scope = String(sequence.scope || active?.scope || 'scene').toUpperCase();
    kicker.textContent = chapterLabel ? `${scope} · Chapter ${chapterLabel}` : scope;
    title.textContent = sequence.title || active?.title || sequence.id || 'Story';
  }

  function _updateBody(sequence, node, active) {
    if (!_overlay) return;
    const type = String(node.type || 'narration').toLowerCase();
    const speakerEl = _overlay.querySelector('[data-vn-speaker]');
    const textEl = _overlay.querySelector('[data-vn-text]');
    const hintEl = _overlay.querySelector('[data-vn-hint]');
    const choicesEl = _overlay.querySelector('[data-vn-choices]');
    const metaEl = _overlay.querySelector('[data-vn-meta]');
    const dialogue = _overlay.querySelector('[data-vn-dialogue]');

    choicesEl.innerHTML = '';
    choicesEl.hidden = true;
    metaEl.innerHTML = '';

    const speaker = node.speaker || '';
    const portraitLine = {
      speaker,
      speakerId: node.speakerId || _normalizeId(speaker) || (node.portrait || ''),
      portrait: typeof node.portrait === 'string' ? node.portrait : '',
      expression: node.expression || node.mood || '',
      pose: node.pose || '',
      side: node.side || _guessSide(node, sequence)
    };

    _renderPortrait(portraitLine);

    // Sync the speaker chip's avatar with the active character so the dialogue
    // box has a tiny but recognizable identity marker, not just a name tag.
    const character = _characterFor(portraitLine);
    const avatar = _speakerAvatar(portraitLine, character);
    if (avatar) speakerEl.style.setProperty('--seq-vn-speaker-avatar', `url('${_cssUrl(avatar)}')`);
    else speakerEl.style.removeProperty('--seq-vn-speaker-avatar');

    speakerEl.textContent = speaker || (type === 'narration' ? 'Narrator' : (sequence.title || ''));
    speakerEl.classList.toggle('is-narrator', !speaker);

    const text = String(node.text || node.prompt || node.summary || '').trim();
    _typeText(textEl, text || _typeFallback(type, node, sequence));
    _history.push({ at: Date.now(), speaker: speaker || (type === 'narration' ? 'Narrator' : ''), text });
    if (_history.length > 200) _history = _history.slice(-200);
    if (_historyOpen) _renderHistory();

    const replay = active?.applyConsequences === false;

    if (type === 'choice') {
      hintEl.textContent = 'Choose how this moment resolves.';
      const choices = Array.isArray(node.choices) ? node.choices : [];
      _renderChoices(choices, node);
      return;
    }
    if (type === 'stat_check') {
      hintEl.textContent = `Stat check · ${node.actor || 'Bin'} rolls ${node.stat || '?'} vs ${node.difficulty || node.dc || '?'}`;
      const buttons = [
        { label: 'Pass', action: 'pass', kind: 'primary' },
        { label: 'Fail', action: 'fail', kind: 'danger' }
      ];
      _renderActionButtons(buttons, node);
      return;
    }
    if (type === 'combat') {
      hintEl.textContent = 'Combat encounter';
      _renderActionButtons([
        replay ? null : { label: 'Queue Battle', action: 'queue', kind: 'primary' },
        { label: replay ? 'Continue as Win' : 'Manual Win', action: 'win' },
        { label: replay ? 'Continue as Loss' : 'Manual Loss', action: 'lose', kind: 'danger' }
      ].filter(Boolean), node);
      return;
    }
    if (type === 'minigame') {
      const gameId = node.minigame?.gameId || node.minigameId || node.gameId || '';
      hintEl.textContent = `Mini-game · ${gameId || 'play and resolve'}`;
      _renderActionButtons([
        replay ? null : { label: 'Play Mini-Game', action: 'play_minigame', kind: 'primary' },
        { label: replay ? 'Continue as Clear' : 'Manual Clear', action: 'win' },
        { label: replay ? 'Continue as Fail' : 'Manual Fail', action: 'lose', kind: 'danger' }
      ].filter(Boolean), node);
      return;
    }
    if (type === 'scenario') {
      hintEl.textContent = 'Exploration run · launch the map or resolve manually';
      _renderActionButtons([
        replay ? null : { label: 'Start Exploration', action: 'next', kind: 'primary' },
        { label: 'Continue as Success', action: 'win' },
        { label: 'Continue as Failure', action: 'lose', kind: 'danger' },
        { label: 'Abort Run', action: 'abort' }
      ].filter(Boolean), node);
      return;
    }
    if (type === 'end') {
      hintEl.textContent = 'This sequence is ready to close.';
      _renderActionButtons([{ label: 'Complete Sequence', action: 'complete', kind: 'primary' }], node);
      return;
    }
    if (type === 'condition') {
      hintEl.textContent = 'Branching on world state…';
      _renderActionButtons([{ label: 'Resolve', action: 'resolve', kind: 'primary' }], node);
      return;
    }
    if (type === 'ops') {
      hintEl.textContent = replay ? 'Story bookkeeping' : 'Apply story bookkeeping and continue';
      _renderActionButtons([{ label: replay ? 'Continue' : 'Apply & Continue', action: 'next', kind: 'primary' }], node);
      return;
    }

    // narration / dialogue / default
    hintEl.textContent = 'Tap or press Space to continue';
    dialogue.classList.toggle('is-narration', type === 'narration');

    if (Array.isArray(node.tags) && node.tags.length) {
      metaEl.innerHTML = node.tags.slice(0, 6).map((tag) => `<span class="campaign-seq-vn-chip">${_esc(_label(tag))}</span>`).join('');
    }
  }

  function _renderPortrait(line) {
    if (!_overlay) return;
    const side = line.side === 'right' ? 'right' : 'left';
    const other = side === 'right' ? 'left' : 'right';
    const active = _overlay.querySelector(`[data-vn-portrait-${side}]`);
    const inactive = _overlay.querySelector(`[data-vn-portrait-${other}]`);
    if (!active || !inactive) return;

    inactive.classList.remove('is-active');

    if (!line.speaker && !line.portrait && !line.speakerId) {
      active.classList.remove('is-active');
      active.innerHTML = '';
      return;
    }

    const character = _characterFor(line);
    const portrait = _portraitFor(line, character);
    active.classList.add('is-active');
    // The VN portrait shows the full character sprite (object-fit: contain),
    // not a cropped headshot — portraitFocus is intentionally not applied here.
    if (portrait) {
      active.innerHTML = `
        <img src="${_escAttr(portrait)}" alt="" onerror="this.style.display='none'">
        <span class="campaign-seq-vn-portrait-name">${_esc(line.speaker || character?.name || '')}</span>
      `;
    } else {
      const initial = (line.speaker || character?.name || '?').slice(0, 1).toUpperCase();
      active.innerHTML = `
        <div class="campaign-seq-vn-portrait-placeholder">${_esc(initial)}</div>
        <span class="campaign-seq-vn-portrait-name">${_esc(line.speaker || character?.name || '')}</span>
      `;
    }
  }

  function _portraitFor(line, character) {
    if (line.portrait && line.portrait.includes('/')) return line.portrait;
    const exp = String(line.expression || '').toLowerCase().trim();
    if (character?.expressionPortraits) {
      const pool = character.expressionPortraits;
      if (exp && pool[exp]) return pool[exp];
      if (pool.default) return pool.default;
      if (pool.neutral) return pool.neutral;
    }
    if (line.portrait && typeof line.portrait === 'string' && character?.expressionPortraits?.[line.portrait]) {
      return character.expressionPortraits[line.portrait];
    }
    return character?.portrait || '';
  }

  // Small image used in the speaker chip. Prefer the neutral portrait
  // (full-body works fine when scaled into a 22px circle showing only the
  // top), then any expression portrait, finally nothing.
  function _speakerAvatar(line, character) {
    if (character?.expressionPortraits?.neutral) return character.expressionPortraits.neutral;
    if (character?.expressionPortraits?.default) return character.expressionPortraits.default;
    if (character?.portrait) return character.portrait;
    if (line?.portrait && line.portrait.includes('/')) return line.portrait;
    return '';
  }

  function _characterFor(line) {
    const tryId = (id) => DS()?.get?.('characters', id) || null;
    if (line.speakerId) {
      const found = tryId(line.speakerId);
      if (found) return found;
    }
    const portraitId = String(line.portrait || '').toLowerCase();
    if (portraitId && !portraitId.includes('/')) {
      const found = tryId(portraitId);
      if (found) return found;
    }
    const speaker = String(line.speaker || '').toLowerCase();
    if (!speaker) return null;
    const all = DS()?.getAllAsArray?.('characters') || [];
    return all.find((entry) =>
      String(entry.id || '').toLowerCase() === speaker
      || String(entry.name || '').toLowerCase() === speaker
      || String(entry.name || '').toLowerCase().split(' ')[0] === speaker
    ) || null;
  }

  function _renderChoices(choices: any[] = [], node: any = {}) {
    const el = _overlay?.querySelector('[data-vn-choices]');
    if (!el) return;
    el.hidden = false;
    const state = CS()?.getState?.() || {};
    el.innerHTML = choices.map((choice, index) => {
      const eligibility = Seq()?.choiceEligibility?.(choice, node, state) || { ok: true, blockers: [], hidden: false };
      if (eligibility.hidden) return '';
      const id = choice.id || `choice_${index + 1}`;
      const label = choice.label || choice.text || id;
      const alignmentHint = window.CJS.CampaignAlignment?.describeDeltas?.(
        choice.alignment ?? choice.karma ?? choice.consequencePoints ?? choice.alignmentDelta
      );
      const summary = eligibility.ok
        ? (choice.summary || choice.hint || alignmentHint || '')
        : (eligibility.blockers || []).join(' | ');
      const tone = choice.kind || choice.tone || (index === 0 ? 'primary' : '');
      const className = [
        'campaign-seq-vn-choice',
        tone === 'primary' ? 'is-primary' : '',
        tone === 'danger' || tone === 'risk' ? 'is-danger' : '',
        eligibility.ok ? '' : 'is-locked'
      ].filter(Boolean).join(' ');
      return `
        <button type="button" class="${className}" data-vn-choice="${_escAttr(id)}" aria-label="${_escAttr(label)}" ${eligibility.ok ? '' : 'disabled'}>
          <span class="campaign-seq-vn-choice-index">${index + 1}</span>
          <span class="campaign-seq-vn-choice-copy">
            <strong>${_esc(label)}</strong>
            ${summary ? `<small>${_esc(summary)}</small>` : ''}
          </span>
        </button>
      `;
    }).join('');
    el.querySelectorAll('[data-vn-choice]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (btn.disabled) return;
        if (_busy) return;
        _busy = true;
        try {
          await Seq()?.advance?.('choice', btn.dataset.vnChoice);
        } finally {
          _busy = false;
        }
      });
    });
  }

  function _renderActionButtons(buttons: any[] = [], node) {
    const el = _overlay?.querySelector('[data-vn-choices]');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = buttons.map((b) => `
      <button type="button" class="campaign-seq-vn-choice ${b.kind === 'danger' ? 'is-danger' : (b.kind === 'primary' ? 'is-primary' : '')}" data-vn-action="${_escAttr(b.action)}">
        <span class="campaign-seq-vn-choice-index">›</span>
        <span class="campaign-seq-vn-choice-copy"><strong>${_esc(b.label)}</strong></span>
      </button>
    `).join('');
    el.querySelectorAll('[data-vn-action]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (_busy) return;
        _busy = true;
        const action = btn.dataset.vnAction;
        try {
          if (action === 'complete') {
            await Seq()?.complete?.('manual');
          } else if (action === 'play_minigame') {
            // Defer to the ported sequence-play-minigame action runtime;
            // falls through to sequence advance when the action handlers
            // aren't loaded yet (test sandboxes, etc.).
            const runtime = window.CJS.CampaignActionsRuntime;
            if (runtime?.has?.('sequence-play-minigame')) runtime.run('sequence-play-minigame');
            else await Seq()?.advance?.('next');
          } else {
            await Seq()?.advance?.(action);
          }
        } finally {
          _busy = false;
        }
      });
    });
    void node;
  }

  function _onAdvanceClick() {
    if (_busy) return;
    if (!_typingFinished) { _finishTyping(); return; }
    const state = CS()?.getState?.();
    const active = Seq()?.active?.(state);
    if (!active) return;
    const sequence = Seq().cachedSequence?.(active.sequenceId, state?.currentWorld);
    const node = sequence ? Seq().findNode?.(sequence, active.nodeId) : null;
    if (!node) return;
    const type = String(node.type || 'narration').toLowerCase();
    if (type === 'choice' || type === 'stat_check' || type === 'combat' || type === 'minigame' || type === 'scenario' || type === 'end') return;
    _busy = true;
    Promise.resolve(Seq()?.advance?.(type === 'condition' ? 'resolve' : 'next')).finally(() => { _busy = false; });
  }

  function _onKey(event) {
    if (!_overlay || !_enabled) return;
    if (event.key === ' ' || event.key === 'Enter') {
      const target = event.target;
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      _onAdvanceClick();
    }
    if (event.key === 'Escape' && _historyOpen) {
      event.preventDefault();
      _toggleHistory();
    }
  }

  function _toggleAuto() {
    _autoPlay = !_autoPlay;
    const btn = _overlay?.querySelector('[data-vn-auto]');
    if (btn) btn.setAttribute('aria-pressed', _autoPlay ? 'true' : 'false');
    if (_autoPlay) _scheduleAuto();
    else _cancelAuto();
  }

  function _scheduleAuto() {
    _cancelAuto();
    _autoTimer = setTimeout(() => {
      if (!_autoPlay) return;
      _onAdvanceClick();
      if (_autoPlay) _scheduleAuto();
    }, 2600);
  }

  function _cancelAuto() {
    if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = 0; }
  }

  function _toggleHistory() {
    const panel = _overlay?.querySelector('[data-vn-history]');
    if (!panel) return;
    _historyOpen = !_historyOpen;
    panel.hidden = !_historyOpen;
    if (_historyOpen) _renderHistory();
  }

  function _renderHistory() {
    const list = _overlay?.querySelector('[data-vn-history-list]');
    if (!list) return;
    list.innerHTML = _history.length
      ? _history.map((entry) => `
        <div class="campaign-seq-vn-history-line">
          <strong>${_esc(entry.speaker || 'Narrator')}</strong>
          <span>${_esc(entry.text || '')}</span>
        </div>
      `).join('')
      : '<div class="campaign-seq-vn-empty">No lines yet.</div>';
  }

  function _confirmEnd() {
    if (typeof window.confirm === 'function') {
      if (!window.confirm('End this sequence now?')) return;
    }
    Seq()?.complete?.('manual');
  }

  function _typeText(el, value) {
    if (!el) return;
    clearInterval(_typingTimer);
    const text = String(value || '');
    el.dataset.fullText = text;
    if (_prefersReducedMotion() || text.length < 12) {
      el.textContent = text;
      _typingFinished = true;
      return;
    }
    el.textContent = '';
    _typingFinished = false;
    let index = 0;
    _typingTimer = setInterval(() => {
      index += 2;
      el.textContent = text.slice(0, index);
      if (index >= text.length) {
        clearInterval(_typingTimer);
        _typingTimer = 0;
        _typingFinished = true;
      }
    }, 14);
  }

  function _finishTyping() {
    const el = _overlay?.querySelector('[data-vn-text]');
    if (!el) return;
    clearInterval(_typingTimer);
    _typingTimer = 0;
    el.textContent = el.dataset.fullText || el.textContent || '';
    _typingFinished = true;
  }

  function _typeFallback(type, node, sequence) {
    if (type === 'end') return node.text || 'The sequence reaches its conclusion.';
    if (type === 'condition') return 'The world checks itself…';
    if (type === 'ops') return node.summary || 'Bookkeeping moves the story forward.';
    return sequence.title || '...';
  }

  function _guessSide(node, sequence) {
    const speaker = String(node.speaker || '').toLowerCase();
    const id = String(node.speakerId || node.portrait || '').toLowerCase();
    const leftIds = sequence._vnLayout?.left || [];
    const rightIds = sequence._vnLayout?.right || [];
    if (leftIds.includes(id) || leftIds.includes(speaker)) return 'left';
    if (rightIds.includes(id) || rightIds.includes(speaker)) return 'right';
    if (speaker === 'bin' || id === 'bin') return 'left';
    if (speaker.includes('narrator')) return 'left';
    return 'right';
  }

  function _defaultBackdrop() {
    return 'images/story-mode/haven/frostwood-vn.png';
  }

  function _close() {
    _activeKey = '';
    _typingFinished = true;
    clearInterval(_typingTimer);
    _typingTimer = 0;
    _cancelAuto();
    _autoPlay = false;
    _history = [];
    _historyOpen = false;
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    document.body.classList.remove('vn-window-open');
  }

  function _prefersReducedMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function _cssUrl(value) {
    return String(value || '').replace(/'/g, "\\'");
  }

  function _esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) { return _esc(value); }

  function _label(value) {
    return String(value || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function _normalizeId(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  return Object.freeze({ init, setEnabled, isEnabled, close });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignSequenceVN = CampaignSequenceVN;
