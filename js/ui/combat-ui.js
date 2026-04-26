// combat-ui.js
// Combat screen UI controller. Binds CombatManager, GridRenderer,
// NarratorEngine, and QTE modules into a cohesive combat experience.

window.CJS = window.CJS || {};

window.CJS.CombatUI = (() => {
  'use strict';

  const CM = () => window.CJS.CombatManager;
  const GE = () => window.CJS.GridEngine;
  const GR = () => window.CJS.GridRenderer;
  const AH = () => window.CJS.ActionHandler;
  const NE = () => window.CJS.NarratorEngine;
  const ND = () => window.CJS.NarratorData;
  const DS = () => window.CJS.DataStore;
  const QM = () => window.CJS.QteManager;
  const CS = () => window.CJS.CombatSettings;
  const Log = () => window.CJS.CombatLog;
  const AM = () => window.CJS.AudioManager;
  const AB = () => window.CJS.AnimationBus;

  let _container = null;
  let _bgmUnsubs = [];
  let _animUnsubs = [];
  let $bgmControls = null;
  let $fxLayer = null;
  let _callbacks = {};
  let _mode = 'idle';
  let _pendingAction = null;
  let _lastEncounterId = null;

  let _unsubCM = null;
  let _unsubLog = null;
  let _unsubNarrator = null;
  let _keyboardBound = false;
  let _resizeBound = false;
  let _activeFx = [];
  let _activeBanner = null;
  let _bannerTimer = 0;

  const MAX_ACTIVE_FX = 18;

  let $grid = null;
  let $log = null;
  let $actions = null;
  let $initiative = null;
  let $unitInfo = null;
  let $narrator = null;
  let $qteOverlay = null;
  let $diceModal = null;

  function init(containerEl, options = {}) {
    destroy();
    _container = containerEl;
    _callbacks = { ...options };
    _mode = 'idle';
    _pendingAction = null;

    _buildLayout();
    _bindEvents();
    _bindWindowEvents();
    _bindBgmControls();
    _bindAnimationBus();

    if (CS()) {
      _setDiceMode(CS().getDiceMode ? CS().getDiceMode() : 'auto');
    }
  }

  // ── BGM / SFX CONTROLS ─────────────────────────────────────────────
  function _detachBgmSubscriptions() {
    for (const off of _bgmUnsubs) { try { off(); } catch (e) {} }
    _bgmUnsubs = [];
  }

  function _refreshBgmControls() {
    if (!_container || !AM()) return;
    const trackSel  = _container.querySelector('#bgm-track-select');
    const toggleBtn = _container.querySelector('#btn-bgm-toggle');
    const muteBtn   = _container.querySelector('#btn-bgm-mute');
    const statusEl  = _container.querySelector('#bgm-status');
    const state = AM().getBgmState ? AM().getBgmState() : null;

    if (muteBtn) {
      muteBtn.classList.toggle('active', AM().isMuted());
      muteBtn.innerHTML = AM().isMuted() ? '&#128263;' : '&#128266;';
    }
    if (toggleBtn) {
      toggleBtn.innerHTML = state?.playing ? '&#10074;&#10074;' : '&#9658;';
    }
    if (trackSel && state?.currentId && trackSel.value !== state.currentId) {
      trackSel.value = state.currentId;
    }
    if (statusEl) {
      if (state?.error === 'autoplay_blocked' && state.currentId) {
        statusEl.textContent = `Ready: ${state.currentId} (click play)`;
      } else if (state?.error === 'load_error' && state.currentId) {
        statusEl.textContent = `Could not load: ${state.currentId}`;
      } else if (state?.playing && state.currentId) {
        statusEl.textContent = `Now playing: ${state.currentId}`;
      } else if (state?.currentId) {
        statusEl.textContent = `Loaded: ${state.currentId}`;
      } else {
        statusEl.textContent = 'No BGM loaded';
      }
    }
  }

  function _bindBgmControls() {
    if (!_container || !AM()) return;

    AM().loadManifest().catch(() => {});

    const trackSel  = _container.querySelector('#bgm-track-select');
    const toggleBtn = _container.querySelector('#btn-bgm-toggle');
    const muteBtn   = _container.querySelector('#btn-bgm-mute');
    const bgmVol    = _container.querySelector('#bgm-volume');
    const sfxVol    = _container.querySelector('#sfx-volume');
    const animChk   = _container.querySelector('#anim-toggle');

    // Populate track select once manifest is loaded.
    AM().loadManifest().then(() => {
      if (!trackSel) return;
      const bgm = AM().getManifest().bgm || {};
      trackSel.innerHTML = '<option value="">-- none --</option>';
      for (const id of Object.keys(bgm)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        trackSel.appendChild(opt);
      }
      _refreshBgmControls();
    }).catch(() => {});

    // Initialize sliders from persisted prefs.
    if (bgmVol)  bgmVol.value = Math.round((AM().getVolume('bgm') || 0) * 100);
    if (sfxVol)  sfxVol.value = Math.round((AM().getVolume('sfx') || 0) * 100);
    if (animChk && CS()?.getAnimationsEnabled) animChk.checked = CS().getAnimationsEnabled();
    document.body.classList.toggle('no-anim', !(animChk?.checked ?? true));
    _refreshBgmControls();
    _detachBgmSubscriptions();
    if (AM().subscribe) {
      _bgmUnsubs.push(AM().subscribe(() => _refreshBgmControls()));
    }

    if (trackSel) {
      trackSel.addEventListener('change', () => {
        const id = trackSel.value;
        if (!id) AM().stopBgm({ fadeMs: 180 });
        else AM().playBgm(id, { fadeMs: 260 });
        _refreshBgmControls();
      });
    }
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (AM().isBgmPlaying()) {
          AM().stopBgm({ fadeMs: 180 });
        } else {
          const next = trackSel?.value || AM().getCurrentBgmId();
          if (next) AM().playBgm(next, { fadeMs: 260 });
        }
        _refreshBgmControls();
      });
    }
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        AM().mute(!AM().isMuted());
        _refreshBgmControls();
      });
    }
    if (bgmVol) {
      bgmVol.addEventListener('input', () => {
        AM().setVolume('bgm', (parseInt(bgmVol.value, 10) || 0) / 100);
        _refreshBgmControls();
      });
    }
    if (sfxVol) {
      sfxVol.addEventListener('input', () => {
        AM().setVolume('sfx', (parseInt(sfxVol.value, 10) || 0) / 100);
      });
    }
    if (animChk) {
      animChk.addEventListener('change', () => {
        const flag = !!animChk.checked;
        if (CS()?.setAnimationsEnabled) CS().setAnimationsEnabled(flag);
        document.body.classList.toggle('no-anim', !flag);
      });
    }
  }

  // ── ANIMATION BUS ──────────────────────────────────────────────────
  function _bindAnimationBus() {
    if (!AB()) return;

    _animUnsubs.push(AB().on('damage',     _animDamageFlash));
    _animUnsubs.push(AB().on('unit_ko',    _animKoFade));
    _animUnsubs.push(AB().on('skill_cast', _animSkillCast));
    _animUnsubs.push(AB().on('unit_move',  _animUnitMove));
    _animUnsubs.push(AB().on('turn_start', _animTurnBanner));
  }

  function _detachAnimationBus() {
    for (const off of _animUnsubs) { try { off(); } catch (e) {} }
    _animUnsubs = [];
  }

  function _animEnabled() {
    return CS()?.getAnimationsEnabled ? CS().getAnimationsEnabled() : true;
  }

  function _removeFxEntry(entry) {
    if (!entry) return;
    try { clearTimeout(entry.timer); } catch (e) {}
    try { entry.el.remove(); } catch (e) {}
    _activeFx = _activeFx.filter((item) => item !== entry);
  }

  function _clearPresentationFx() {
    for (const entry of _activeFx.slice()) {
      _removeFxEntry(entry);
    }
    _activeFx = [];
    if (_bannerTimer) {
      clearTimeout(_bannerTimer);
      _bannerTimer = 0;
    }
    if (_activeBanner) {
      try { _activeBanner.remove(); } catch (e) {}
      _activeBanner = null;
    }
  }

  function _themeVars(kind) {
    const key = String(kind || 'physical').toLowerCase();
    const map = {
      physical:  { accent: 'rgba(255, 112, 112, 0.94)', glow: 'rgba(255, 72, 72, 0.34)', ring: 'rgba(255,255,255,0.16)' },
      fire:      { accent: 'rgba(255, 140, 82, 0.96)', glow: 'rgba(255, 102, 54, 0.42)', ring: 'rgba(255, 214, 170, 0.22)' },
      ice:       { accent: 'rgba(138, 220, 255, 0.96)', glow: 'rgba(96, 184, 255, 0.36)', ring: 'rgba(224, 246, 255, 0.22)' },
      lightning: { accent: 'rgba(255, 236, 124, 0.98)', glow: 'rgba(255, 214, 64, 0.42)', ring: 'rgba(255, 248, 196, 0.22)' },
      water:     { accent: 'rgba(110, 188, 255, 0.95)', glow: 'rgba(72, 152, 255, 0.34)', ring: 'rgba(196, 232, 255, 0.20)' },
      magic:     { accent: 'rgba(194, 148, 255, 0.94)', glow: 'rgba(156, 110, 255, 0.36)', ring: 'rgba(240, 222, 255, 0.22)' },
      dark:      { accent: 'rgba(160, 104, 224, 0.92)', glow: 'rgba(92, 42, 168, 0.36)', ring: 'rgba(220, 196, 255, 0.20)' },
      light:     { accent: 'rgba(255, 244, 168, 0.98)', glow: 'rgba(255, 226, 124, 0.38)', ring: 'rgba(255, 252, 224, 0.26)' },
      ko:        { accent: 'rgba(34, 39, 49, 0.86)', glow: 'rgba(0, 0, 0, 0.42)', ring: 'rgba(210, 222, 255, 0.12)' },
      move:      { accent: 'rgba(136, 214, 255, 0.76)', glow: 'rgba(96, 180, 255, 0.26)', ring: 'rgba(220, 245, 255, 0.16)' }
    };
    const chosen = map[key] || map.physical;
    return {
      '--cjs-fx-accent': chosen.accent,
      '--cjs-fx-glow': chosen.glow,
      '--cjs-fx-ring': chosen.ring
    };
  }

  function _spawnFx(cls, pos, ttl, opts = {}) {
    if (!_animEnabled() || !$fxLayer || !pos) return;
    const cell = GR()?.getCellSize ? GR().getCellSize() : 0;
    if (!cell) return;
    const canvas = _container?.querySelector('#cbt-canvas');
    // Canvas is centered inside .combat-grid-wrap (flex centering), so FX
    // overlays must use canvas.offsetLeft/offsetTop to land on the cells.
    const ox = canvas?.offsetLeft || 0;
    const oy = canvas?.offsetTop  || 0;
    const [r, c] = pos;
    const el = document.createElement('div');
    const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
    el.className = `cjs-fx-cell ${cls}${extra}`;
    el.style.left   = (c * cell + ox) + 'px';
    el.style.top    = (r * cell + oy) + 'px';
    el.style.width  = cell + 'px';
    el.style.height = cell + 'px';
    const vars = opts.vars || {};
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }

    const key = opts.dedupeKey || `${cls}:${r}:${c}`;
    const existing = _activeFx.find((entry) => entry.key === key);
    if (existing) _removeFxEntry(existing);
    while (_activeFx.length >= (opts.maxActive || MAX_ACTIVE_FX)) {
      _removeFxEntry(_activeFx[0]);
    }

    $fxLayer.appendChild(el);
    const entry = { el, key, timer: 0 };
    entry.timer = setTimeout(() => _removeFxEntry(entry), ttl || 700);
    _activeFx.push(entry);
    return el;
  }

  function _animDamageFlash(payload) {
    const id = payload?.target?.instanceId || payload?.target?.id || payload?.target?.baseId || 'target';
    _spawnFx('cjs-fx-damage', payload?.target?.pos, payload?.isCritical ? 360 : 280, {
      dedupeKey: `hit:${id}`,
      extraClass: payload?.isCritical ? 'is-crit' : '',
      vars: _themeVars(payload?.element || payload?.damageType || 'physical')
    });
  }

  function _animKoFade(payload) {
    const id = payload?.unit?.instanceId || payload?.unit?.id || payload?.unit?.baseId || 'unit';
    _spawnFx('cjs-fx-ko', payload?.unit?.pos, 700, {
      dedupeKey: `ko:${id}`,
      vars: _themeVars('ko')
    });
  }

  function _animSkillCast(payload) {
    const skill = payload?.skill || {};
    const tone = skill.element || skill.damageType || 'magic';
    const id = payload?.unit?.instanceId || payload?.unit?.id || payload?.unit?.baseId || 'caster';
    _spawnFx('cjs-fx-cast', payload?.unit?.pos, 480, {
      dedupeKey: `cast:${id}`,
      vars: _themeVars(tone)
    });
  }

  function _animUnitMove(payload) {
    const from = payload?.from;
    const to = payload?.to;
    const cell = GR()?.getCellSize ? GR().getCellSize() : 0;
    if (!from || !to || !cell) return;
    const dx = (to[1] - from[1]) * cell;
    const dy = (to[0] - from[0]) * cell;
    _spawnFx('cjs-fx-move-trail', from, 340, {
      dedupeKey: `move:${from.join(',')}->${to.join(',')}`,
      vars: {
        ..._themeVars('move'),
        '--cjs-travel-x': `${dx}px`,
        '--cjs-travel-y': `${dy}px`
      }
    });
    _spawnFx('cjs-fx-move-arrive', to, 280, {
      dedupeKey: `move-arrive:${to.join(',')}`,
      vars: _themeVars('move')
    });
  }

  function _animTurnBanner(payload) {
    if (!_animEnabled() || !$grid) return;
    const unit = payload?.unit;
    if (!unit) return;
    if (_bannerTimer) {
      clearTimeout(_bannerTimer);
      _bannerTimer = 0;
    }
    if (_activeBanner) {
      try { _activeBanner.remove(); } catch (e) {}
      _activeBanner = null;
    }
    const banner = document.createElement('div');
    banner.className = 'cjs-turn-banner team-' + (unit.team === 'player' ? 'player' : 'enemy');
    banner.textContent = `Round ${payload?.round || 1} • ${(unit.name || 'Unit')}'s turn`;
    $grid.appendChild(banner);
    _activeBanner = banner;
    _bannerTimer = setTimeout(() => {
      if (_activeBanner === banner) _activeBanner = null;
      try { banner.remove(); } catch (e) {}
      _bannerTimer = 0;
    }, 1200);
  }

  function _buildLayout() {
    if (!_container) return;

    _container.innerHTML = `
      <div class="combat-screen">
        <div class="combat-top">
          <div id="cbt-initiative" class="initiative-bar"></div>
        </div>
        <div class="combat-middle">
          <div class="combat-grid-wrap">
            <canvas id="cbt-canvas"></canvas>
            <div id="cbt-fx-layer" class="cjs-fx-layer"></div>
          </div>
          <div class="combat-sidebar">
            <div id="cbt-bgm-controls" class="bgm-controls">
              <div class="bgm-row">
                <span class="bgm-label">BGM</span>
                <select id="bgm-track-select"><option value="">-- none --</option></select>
                <button id="btn-bgm-toggle" class="btn btn-sm bgm-btn" title="Play/Pause BGM">&#9658;</button>
                <button id="btn-bgm-mute" class="btn btn-sm bgm-btn" title="Mute all">&#128263;</button>
              </div>
              <div class="bgm-row">
                <span class="bgm-label">Music</span>
                <input type="range" id="bgm-volume" min="0" max="100" value="50">
              </div>
              <div class="bgm-row">
                <span class="bgm-label">SFX</span>
                <input type="range" id="sfx-volume" min="0" max="100" value="70">
              </div>
              <div class="bgm-row">
                <label class="bgm-label" style="display:flex;align-items:center;gap:4px;cursor:pointer">
                  <input type="checkbox" id="anim-toggle" checked> <span>Animations</span>
                </label>
              </div>
              <div class="bgm-row bgm-status-row">
                <span id="bgm-status" class="bgm-status">No BGM loaded</span>
              </div>
            </div>
            <div id="cbt-unit-info" class="unit-info-panel"></div>
            <div id="cbt-actions" class="action-panel"></div>
            <div class="dice-controls">
              <div class="dice-mode-row">
                <span class="dice-label">Dice:</span>
                <button id="btn-dice-auto" class="btn btn-sm dice-mode-btn active">Auto</button>
                <button id="btn-dice-manual" class="btn btn-sm dice-mode-btn">Manual</button>
              </div>
              <div id="dice-queue-row" class="dice-queue-row" style="display:none">
                <input type="text" id="dice-queue-input" placeholder="Pre-queue: 14,7,3,18" class="dice-queue-field">
                <button id="btn-dice-queue" class="btn btn-sm">Queue</button>
              </div>
            </div>
            <div class="auto-controls">
              <button id="btn-auto-turn" class="btn btn-sm">Auto Turn</button>
              <button id="btn-auto-round" class="btn btn-sm">Auto Round</button>
              <button id="btn-auto-all" class="btn btn-sm">Auto All</button>
              <button id="btn-stop-auto" class="btn btn-sm btn-danger" style="display:none">Stop</button>
            </div>
          </div>
        </div>
        <div class="combat-bottom">
          <div id="cbt-narrator" class="narrator-panel"></div>
          <div id="cbt-log" class="battle-log-panel"></div>
        </div>
        <div id="cbt-qte-overlay" class="qte-overlay" style="display:none"></div>
        <div id="cbt-dice-modal" class="dice-modal-overlay" style="display:none">
          <div class="dice-modal">
            <div class="dice-modal-title" id="dice-modal-title">Roll</div>
            <div class="dice-modal-source" id="dice-modal-source"></div>
            <div class="dice-modal-range" id="dice-modal-range"></div>
            <input type="number" id="dice-modal-input" class="dice-modal-field" placeholder="Enter value...">
            <div class="dice-modal-buttons">
              <button id="dice-modal-random" class="btn btn-sm">Random</button>
              <button id="dice-modal-confirm" class="btn btn-primary btn-sm">Confirm</button>
            </div>
            <div class="dice-modal-error" id="dice-modal-error"></div>
          </div>
        </div>
      </div>
    `;

    $grid = _container.querySelector('.combat-grid-wrap');
    $log = _container.querySelector('#cbt-log');
    $actions = _container.querySelector('#cbt-actions');
    $initiative = _container.querySelector('#cbt-initiative');
    $unitInfo = _container.querySelector('#cbt-unit-info');
    $narrator = _container.querySelector('#cbt-narrator');
    $qteOverlay = _container.querySelector('#cbt-qte-overlay');
    $diceModal = _container.querySelector('#cbt-dice-modal');
    $bgmControls = _container.querySelector('#cbt-bgm-controls');
    $fxLayer = _container.querySelector('#cbt-fx-layer');

    const canvas = _container.querySelector('#cbt-canvas');
    GR().init(canvas, {
      cellSize: 64,
      onCellClick: _onCellClick,
      onCellHover: _onCellHover
    });
  }

  function _bindEvents() {
    _container.querySelector('#btn-dice-auto')?.addEventListener('click', () => {
      _setDiceMode('auto');
    });

    _container.querySelector('#btn-dice-manual')?.addEventListener('click', () => {
      _setDiceMode('prompt');
    });

    _container.querySelector('#btn-dice-queue')?.addEventListener('click', () => {
      const input = _container.querySelector('#dice-queue-input');
      const values = (input?.value || '')
        .split(/[,\s]+/)
        .map(Number)
        .filter((value) => !Number.isNaN(value) && value > 0);

      if (values.length > 0 && CS()) {
        CS().queueDice(values);
        input.value = '';
        _addLogMessage(`Queued ${values.length} dice: [${values.join(', ')}]`, 'note');
      }
    });

    if (CS()) {
      CS().setDicePromptFn((expression, source) => {
        const Dice = window.CJS.Dice;
        const parsed = Dice.parse(expression);
        const minVal = Dice.min(parsed);
        const maxVal = Dice.max(parsed);

        const input = window.prompt(
          `Roll: ${expression} (for: ${source || 'roll'})\n`
          + `Range: ${minVal} - ${maxVal}\n\n`
          + 'Enter a value, or leave blank for random:'
        );

        if (input === null || input.trim() === '') return null;

        const value = parseInt(input, 10);
        if (Number.isNaN(value) || value < minVal || value > maxVal) return null;
        return value;
      });
    }

    _container.querySelector('#btn-auto-turn')?.addEventListener('click', () => {
      CM().autoOneTurn();
      _refresh();
    });

    _container.querySelector('#btn-auto-round')?.addEventListener('click', () => {
      CM().autoOneRound();
      _refresh();
    });

    _container.querySelector('#btn-auto-all')?.addEventListener('click', () => {
      _container.querySelector('#btn-stop-auto').style.display = '';
      CM().autoUntilStop();
      _refresh();
    });

    _container.querySelector('#btn-stop-auto')?.addEventListener('click', () => {
      CM().stopAuto();
      _container.querySelector('#btn-stop-auto').style.display = 'none';
      _refresh();
    });
  }

  function _bindWindowEvents() {
    if (!_keyboardBound) {
      document.addEventListener('keydown', _handleKeydown);
      _keyboardBound = true;
    }

    if (!_resizeBound) {
      window.addEventListener('resize', _handleResize);
      _resizeBound = true;
    }
  }

  function _detachSubscriptions() {
    if (_unsubCM) {
      _unsubCM();
      _unsubCM = null;
    }
    if (_unsubLog) {
      _unsubLog();
      _unsubLog = null;
    }
    if (_unsubNarrator) {
      _unsubNarrator();
      _unsubNarrator = null;
    }
  }

  function _clearFeedPanels() {
    if ($log) $log.innerHTML = '';
    if ($narrator) $narrator.innerHTML = '';
  }

  function startCombat(encounterId) {
    if (!_container) {
      throw new Error('CombatUI.init must be called before startCombat.');
    }

    _lastEncounterId = encounterId;
    _mode = 'idle';
    _pendingAction = null;
    _clearModeHint();
    _clearFeedPanels();
    _clearPresentationFx();

    _detachSubscriptions();
    try { NE().destroy(); } catch (_) {}

    try {
      if (ND().isLoaded()) {
        NE().init();
        _unsubNarrator = NE().subscribe(_onNarration);
      }
    } catch (error) {
      console.warn('Narrator init failed (non-fatal):', error.message);
    }

    _unsubLog = Log().subscribe(_onLogEntry);

    CM().startEncounter(encounterId);
    _unsubCM = CM().subscribe(_onStateChange);
    GR().resize();

    const portraitPicker = window.CJS.PortraitPicker;
    if (portraitPicker) {
      for (const unit of CM().getUnits()) {
        if (unit?.portrait) portraitPicker.preloadImage(unit.portrait);
      }
    }

    _startEncounterBgm();

    const phase = CM().runUntilInput();
    _refresh();
    return phase;
  }

  // Resolve and play BGM for the current encounter.
  // Priority: encounter.bgm (string or array) → CombatSettings default pool.
  function _startEncounterBgm() {
    if (!AM()) return;
    AM().loadManifest().then(() => {
      const enc = CM().getState()?.encounter || {};
      let pick = enc.bgm;
      if ((!pick || (Array.isArray(pick) && !pick.length)) && CS()?.getDefaultBgmPool) {
        const pool = CS().getDefaultBgmPool();
      if (pool && pool.length) pick = pool;
      }
      if (!pick || (Array.isArray(pick) && !pick.length)) return;
      AM().playBgm(pick, { fadeMs: 300 });
      _refreshBgmControls();
    }).catch(() => {});
  }

  function _onStateChange() {
    _refresh();
  }

  function _refresh() {
    const state = CM().getState();
    if (!state) return;

    _renderInitiative(state);
    _renderUnitInfo(state);
    _renderActions(state);
    _updateAutoButtons(state);

    const unit = CM().getCurrentUnit();
    GR().setSelectedUnit(unit?.instanceId || null);

    if (state.phase === 'battle_end') {
      _showBattleEnd(state);
    }
  }

  function _renderInitiative(state) {
    const order = CM().getInitiativeOrder();
    let html = '';

    for (const unit of order) {
      if (!unit) continue;

      const active = unit.instanceId === state.currentUnitId;
      const dead = unit.currentHP <= 0;
      const teamClass = unit.team === 'player' ? 'init-player' : 'init-enemy';
      const classes = `init-unit ${teamClass}${active ? ' init-active' : ''}${dead ? ' init-dead' : ''}`;
      const hpPct = Math.round((unit.currentHP / (unit.maxHP || 1)) * 100);
      const portraitHtml = _renderPortraitMarkup(unit.portrait, 'init-portrait', 'init-icon', unit.icon || '?');

      html += `
        <div class="${classes}" title="${_escAttr(unit.name || unit.baseId || '?')} (${unit.currentHP}/${unit.maxHP} HP)">
          ${portraitHtml}
          <span class="init-name">${_escHtml((unit.name || unit.baseId || '?').substring(0, 6))}</span>
          <div class="init-hp-bar"><div class="init-hp-fill" style="width:${hpPct}%"></div></div>
        </div>
      `;
    }

    $initiative.innerHTML = html;
  }

  function _renderUnitInfo() {
    const unit = CM().getCurrentUnit();
    if (!unit) {
      $unitInfo.innerHTML = '<div class="unit-info-empty">Waiting...</div>';
      return;
    }

    const turnState = unit.turnState || {};
    const hpPct = Math.round((unit.currentHP / (unit.maxHP || 1)) * 100);
    const mpPct = unit.maxMP ? Math.round(((unit.currentMP || 0) / unit.maxMP) * 100) : 0;

    const statusHtml = unit.activeStatuses?.length
      ? `<div class="unit-statuses">${unit.activeStatuses.map((status) => (
          `<span class="status-chip" title="${_escAttr(`${status.statusId} (${status.duration}t, ${status.stacks}stk)`)}">${_escHtml(_statusIcon(status.statusId))} ${status.duration}t</span>`
        )).join('')}</div>`
      : '';

    const portraitHtml = _renderPortraitMarkup(unit.portrait, 'unit-portrait', 'unit-icon-lg', unit.icon || '?');

    $unitInfo.innerHTML = `
      <div class="unit-card ${_escAttr(unit.team || 'player')}">
        <div class="unit-header">
          ${portraitHtml}
          <div>
            <div class="unit-name">${_escHtml(unit.name || unit.baseId || '?')}</div>
            <div class="unit-rank">Rank ${_escHtml(unit.rank || '?')} ${_escHtml(unit.type || '')}</div>
          </div>
        </div>
        <div class="resource-bars">
          <div class="bar-row">
            <span class="bar-label">HP</span>
            <div class="bar-track hp"><div class="bar-fill" style="width:${hpPct}%"></div></div>
            <span class="bar-num">${unit.currentHP}/${unit.maxHP}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">MP</span>
            <div class="bar-track mp"><div class="bar-fill" style="width:${mpPct}%"></div></div>
            <span class="bar-num">${unit.currentMP || 0}/${unit.maxMP || 0}</span>
          </div>
        </div>
        <div class="turn-state">
          <span class="${turnState.hasMoved ? 'used' : 'available'}">Move: ${turnState.hasMoved ? 'Used' : 'Ready'}</span>
          <span class="${turnState.mainActionUsed ? 'used' : 'available'}">Action: ${turnState.mainActionUsed ? 'Used' : 'Ready'}</span>
          <span>AP: ${turnState.apRemaining || 0}</span>
        </div>
        ${statusHtml}
      </div>
    `;
  }

  function _renderActions(state) {
    if (state.phase === 'battle_end') {
      return;
    }

    if (!CM().isAwaitingInput() && state.phase !== 'action') {
      $actions.innerHTML = '<div class="action-wait">Processing...</div>';
      return;
    }

    const unit = CM().getCurrentUnit();
    if (!unit) {
      $actions.innerHTML = '';
      return;
    }

    if (!CM().isManualTurn()) {
      $actions.innerHTML = '<div class="action-wait">AI is thinking...</div>';
      return;
    }

    const available = CM().getAvailableActionsForCurrent();
    if (!available) {
      $actions.innerHTML = '';
      return;
    }

    let html = '<div class="action-buttons">';

    if (available.move) {
      html += '<button class="btn btn-action btn-move" data-action="move">Move</button>';
    }

    if (available.attack) {
      html += '<button class="btn btn-action btn-attack" data-action="attack">Attack</button>';
    }

    if (available.defend) {
      html += '<button class="btn btn-action btn-defend" data-action="defend">Defend</button>';
    }

    if (available.skills?.length > 0) {
      html += '<div class="skill-list">';
      for (const skillEntry of available.skills) {
        const skillName = skillEntry.skill?.name || skillEntry.id;
        const skillIcon = skillEntry.skill?.icon || '*';
        const disabled = !skillEntry.usable ? 'disabled' : '';
        const reason = skillEntry.cooldown > 0 ? `title="Cooldown: ${skillEntry.cooldown} turns"` : '';
        html += `
          <button class="btn btn-action btn-skill" data-action="skill" data-skill="${_escAttr(skillEntry.id)}" ${disabled} ${reason}>
            ${_escHtml(skillIcon)} ${_escHtml(skillName)}
            <span class="skill-cost">${skillEntry.apCost || 0}AP ${skillEntry.mpCost || 0}MP</span>
          </button>
        `;
      }
      html += '</div>';
    }

    if (available.items?.length > 0) {
      html += '<div class="item-list">';
      for (const itemEntry of available.items) {
        const itemName = itemEntry.item?.name || itemEntry.id;
        html += `
          <button class="btn btn-action btn-item" data-action="item" data-item="${_escAttr(itemEntry.id)}">
            Item ${_escHtml(itemName)}
          </button>
        `;
      }
      html += '</div>';
    }

    html += '<button class="btn btn-action btn-end-turn" data-action="end_turn">End Turn</button>';
    html += '</div>';
    $actions.innerHTML = html;

    $actions.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => _onActionClick(button));
    });
  }

  function _onActionClick(button) {
    const type = button.dataset.action;
    const unit = CM().getCurrentUnit();
    if (!unit) return;

    switch (type) {
      case 'move':
        _enterMoveMode(unit);
        break;
      case 'attack':
        _enterTargetMode(unit, { type: 'attack' });
        break;
      case 'defend':
        _submitDirectAction({ type: 'defend' });
        break;
      case 'skill': {
        const skillId = button.dataset.skill;
        const resolver = window.CJS.SkillResolver;
        const skill = resolver ? resolver.resolveUnitSkill(unit, skillId) : DS().get('skills', skillId);
        if (skill?.aoe && skill.aoe !== 'none') {
          _enterAoETargetMode(unit, skill);
        } else {
          _enterTargetMode(unit, { type: 'skill', skillId });
        }
        break;
      }
      case 'item':
        _enterTargetMode(unit, { type: 'item', itemId: button.dataset.item });
        break;
      case 'end_turn':
        _submitDirectAction({ type: 'end_turn' });
        break;
      default:
        break;
    }
  }

  function _enterMoveMode(unit) {
    _mode = 'move';
    const moves = GE().getValidMoves(unit.instanceId);
    const cells = Array.isArray(moves) ? moves.map(([r, c]) => ({ r, c })) : [];
    GR().setHighlights(cells, 'rgba(59,130,246,0.4)', 'move');
    _setModeHint('Click a blue cell to move, or press Esc to cancel.');
  }

  function _enterTargetMode(unit, action) {
    _mode = 'target_single';
    _pendingAction = action;

    let range = 1 + (unit.rangeBonus || 0);
    if (action.type !== 'attack') {
      const resolver = window.CJS.SkillResolver;
      const skill = resolver ? resolver.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
      range = (skill?.range || 1) + (unit.rangeBonus || 0);
    } else if (AH() && AH().getAttackRange) {
      range = AH().getAttackRange(unit);
    }

    const targets = GE().getUnitsInRange(unit.pos[0], unit.pos[1], range, { excludeId: unit.instanceId });
    const cells = [];

    for (const entry of targets) {
      const target = entry.unit;
      if (target.currentHP > 0) {
        cells.push({ r: target.pos[0], c: target.pos[1] });
      }
    }

    GR().setHighlights(cells, 'rgba(239,68,68,0.4)', 'target');
    _setModeHint('Click a valid target, or press Esc to cancel.');
  }

  function _enterAoETargetMode(unit, skill) {
    _mode = 'target_aoe';
    _pendingAction = { type: 'skill', skillId: skill.id };

    const range = (skill.range || 3) + (unit.rangeBonus || 0);
    const rawCells = GE().getCellsInRange(unit.pos[0], unit.pos[1], range);
    const cells = rawCells.map(([r, c]) => ({ r, c }));
    GR().setHighlights(cells, 'rgba(168,85,247,0.3)', 'target');
    _setModeHint('Click a cell for the AoE center, or press Esc to cancel.');
  }

  function _onCellClick(r, c) {
    if (_mode === 'move') {
      const result = CM().submitAction({ type: 'move', targetPos: [r, c] });
      if (result.success) {
        GR().clearHighlights('move');
        _mode = 'idle';
        _clearModeHint();
        CM().runUntilInput();
      }
      return;
    }

    if (_mode !== 'target_single' && _mode !== 'target_aoe') {
      return;
    }

    const unitAt = GE().getUnitAt(r, c);
    const action = { ..._pendingAction };

    if (_mode === 'target_single') {
      if (!unitAt) return;
      action.targetId = unitAt.instanceId || unitAt;
    } else {
      action.aoeCenter = [r, c];
      if (unitAt) action.targetId = unitAt.instanceId || unitAt;
    }

    if (action.type === 'skill') {
      const resolver = window.CJS.SkillResolver;
      const unit = CM().getCurrentUnit();
      const skill = (resolver && unit) ? resolver.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
      if (skill?.qte && skill.qte !== 'none' && QM()) {
        _runQTE(skill, action);
        return;
      }
    }

    GR().clearHighlights('target');
    _mode = 'idle';
    _pendingAction = null;
    _clearModeHint();

    const result = CM().submitAction(action);
    _handleActionResult(result);
    CM().runUntilInput();
  }

  function _onCellHover() {
    // Reserved for future hover previews.
  }

  async function _runQTE(skill, action) {
    _mode = 'qte';
    $qteOverlay.style.display = 'flex';

    try {
      const unit = CM().getCurrentUnit();
      const result = await QM().trigger({ skill, attacker: unit, container: $qteOverlay });
      action.qteResult = result;
    } catch (_) {
      action.qteResult = { grade: 'ok', multiplier: 1.0 };
    }

    $qteOverlay.style.display = 'none';
    $qteOverlay.innerHTML = '';
    GR().clearHighlights('target');

    _mode = 'idle';
    _pendingAction = null;
    _clearModeHint();

    const result = CM().submitAction(action);
    _handleActionResult(result);
    CM().runUntilInput();
  }

  function _submitDirectAction(action) {
    _mode = 'idle';
    _pendingAction = null;
    GR().clearHighlights();
    _clearModeHint();

    const result = CM().submitAction(action);
    _handleActionResult(result);
    CM().runUntilInput();
  }

  function _handleActionResult(result) {
    if (!result.success) {
      _addLogMessage(`Action failed: ${result.reason}`, 'error');
      return;
    }

    if (result.damage && result.targetUnit?.pos) {
      const color = result.isCritical ? '#fbbf24' : '#ff4444';
      GR().addDamageFloat(result.targetUnit.pos[0], result.targetUnit.pos[1], result.damage, color);
    }

    if (result.healing && result.targetUnit?.pos) {
      GR().addDamageFloat(result.targetUnit.pos[0], result.targetUnit.pos[1], `+${result.healing}`, '#22c55e');
    }

    _refresh();
  }

  function _onLogEntry(entry) {
    if (!entry) return;

    let message = '';
    const actor = entry.actor?.name || entry.actor?.baseId || 'Someone';
    const target = entry.target?.name || entry.target?.baseId || 'Target';

    switch (entry.type) {
      case 'hit':
        message = `${actor} hits ${target} for ${entry.data?.damage || '?'} damage${entry.tags?.includes('crit') ? ' (crit)' : ''}.`;
        break;
      case 'miss':
        message = `${actor} misses ${target}.`;
        break;
      case 'dodge':
        message = `${actor} dodges.`;
        break;
      case 'kill':
        message = `${target} is defeated.`;
        break;
      case 'heal':
        message = `${target} heals for ${entry.data?.amount || '?'} HP.`;
        break;
      case 'status_applied':
        message = `${entry.data?.statusId} applied to ${target}.`;
        break;
      case 'status_tick':
        message = `${entry.data?.statusId} ticks on ${target} (${entry.data?.amount || '?'}).`;
        break;
      case 'status_removed':
        message = `${entry.data?.statusId} removed from ${target}.`;
        break;
      case 'move':
        message = `${actor} moves.`;
        break;
      case 'skill_used':
        message = `${actor} uses ${entry.data?.skill || 'a skill'}.`;
        break;
      case 'qte_result':
        message = `QTE: ${entry.data?.grade || 'ok'} (${entry.data?.multiplier || 1}x).`;
        break;
      case 'turn_start':
        message = `Turn ${entry.data?.turn}: ${actor}'s turn.`;
        break;
      case 'battle_start':
        message = 'Battle start.';
        break;
      case 'battle_end':
        message = `Battle end: ${entry.data?.winner || 'unknown'} wins.`;
        break;
      case 'terrain_effect':
        message = `${target} is affected by ${entry.data?.terrain || 'terrain'}.`;
        break;
      default:
        message = entry.message || entry.type;
        break;
    }

    if (message) _addLogMessage(message, entry.type);

    if (entry.type === 'hit' && entry.target?.pos) {
      GR().addDamageFloat(
        entry.target.pos[0],
        entry.target.pos[1],
        entry.data?.damage || '?',
        entry.tags?.includes('crit') ? '#fbbf24' : '#ff4444'
      );
    }

    if (entry.type === 'heal' && entry.target?.pos) {
      GR().addDamageFloat(entry.target.pos[0], entry.target.pos[1], `+${entry.data?.amount || '?'}`, '#22c55e');
    }

    if (entry.type === 'status_tick' && entry.target?.pos && entry.data?.amount) {
      GR().addDamageFloat(entry.target.pos[0], entry.target.pos[1], entry.data.amount, '#c084fc');
    }
  }

  function _onNarration(text) {
    if (!text || !$narrator) return;

    const block = document.createElement('div');
    block.className = 'narrator-line';

    for (const line of text.split('\n')) {
      const paragraph = document.createElement('p');
      if (line.startsWith('[CJS]')) {
        paragraph.className = 'narrator-cjs';
      }
      paragraph.textContent = line;
      block.appendChild(paragraph);
    }

    $narrator.appendChild(block);
    $narrator.scrollTop = $narrator.scrollHeight;

    while ($narrator.children.length > 60) {
      $narrator.removeChild($narrator.firstChild);
    }
  }

  function _addLogMessage(text, type) {
    if (!$log) return;

    const div = document.createElement('div');
    div.className = `log-entry log-${type || 'note'}`;
    div.textContent = text;
    $log.appendChild(div);
    $log.scrollTop = $log.scrollHeight;

    while ($log.children.length > 200) {
      $log.removeChild($log.firstChild);
    }
  }

  function _setDiceMode(mode) {
    if (!CS()) return;

    CS().setDiceMode(mode);

    const btnAuto = _container.querySelector('#btn-dice-auto');
    const btnManual = _container.querySelector('#btn-dice-manual');
    const queueRow = _container.querySelector('#dice-queue-row');

    btnAuto?.classList.toggle('active', mode === 'auto');
    btnManual?.classList.toggle('active', mode === 'prompt');
    if (queueRow) {
      queueRow.style.display = mode === 'prompt' ? '' : 'none';
    }
  }

  function _setModeHint(text) {
    let hint = _container.querySelector('.mode-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'mode-hint';
      $actions.parentElement.insertBefore(hint, $actions.nextSibling);
    }

    hint.textContent = text;
    hint.style.display = 'block';
  }

  function _clearModeHint() {
    const hint = _container?.querySelector('.mode-hint');
    if (hint) hint.style.display = 'none';
  }

  function _showBattleEnd(state) {
    const showReturnButton = typeof _callbacks.onReturnToSetup === 'function';

    $actions.innerHTML = `
      <div class="battle-end-panel ${state.winner === 'player' ? 'victory' : 'defeat'}">
        <h2>${state.winner === 'player' ? 'Victory' : 'Defeat'}</h2>
        <p>Round ${state.roundNumber}</p>
        <div class="battle-end-buttons">
          <button class="btn btn-primary" id="btn-show-loot">${state.winner === 'player' ? 'Collect Loot' : 'Summary'}</button>
          <button class="btn" id="btn-restart-combat">Restart</button>
          ${showReturnButton ? '<button class="btn" id="btn-return-setup">Back to Setup</button>' : ''}
        </div>
      </div>
    `;

    _container.querySelector('#btn-show-loot')?.addEventListener('click', () => {
      if (window.CJS.LootRoller && state.winner === 'player') {
        const enemies = CM().getUnits().filter((unit) => unit.team === 'enemy');
        window.CJS.LootRoller.rollAndDisplay(enemies, $actions);
      }
    });

    _container.querySelector('#btn-restart-combat')?.addEventListener('click', () => {
      _restartCombat();
    });

    _container.querySelector('#btn-return-setup')?.addEventListener('click', () => {
      _callbacks.onReturnToSetup?.();
    });
  }

  function _restartCombat() {
    if (!_lastEncounterId) return;
    startCombat(_lastEncounterId);
  }

  function _updateAutoButtons(state) {
    const stopBtn = _container.querySelector('#btn-stop-auto');
    if (!stopBtn) return;

    stopBtn.style.display = state.phase === 'battle_end' ? 'none' : stopBtn.style.display;
  }

  function _handleResize() {
    if (_container && CM().getState()) {
      GR().resize();
    }
  }

  function _handleKeydown(event) {
    if (event.key !== 'Escape') return;

    if (_mode !== 'idle' && _mode !== 'qte') {
      _mode = 'idle';
      _pendingAction = null;
      GR().clearHighlights();
      _clearModeHint();
      _refresh();
    }
  }

  function _statusIcon(id) {
    const icons = {
      burn: 'B',
      poison: 'P',
      bleed: 'L',
      stun: 'S',
      freeze: 'F',
      sleep: 'Z',
      silence: 'Q',
      regen: '+',
      shield: '#',
      haste: 'H',
      berserk: '!',
      slow: '-',
      root: 'R',
      blind: 'O',
      confuse: '?',
      fear: '!',
      charm: 'C',
      doom: 'D',
      taunt: 'T',
      petrify: 'X'
    };
    return icons[id] || '*';
  }

  function _renderPortraitMarkup(path, imageClass, fallbackClass, icon) {
    if (!path) return `<span class="${fallbackClass}">${_escHtml(icon || '?')}</span>`;

    return `
      <img src="${_escAttr(path)}" class="${imageClass}" onerror="this.style.display='none';this.nextElementSibling.style.display=''" alt="">
      <span class="${fallbackClass}" style="display:none">${_escHtml(icon || '?')}</span>
    `;
  }

  function _escHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function _escAttr(value) {
    return _escHtml(value);
  }

  function destroy() {
    _detachSubscriptions();
    _detachBgmSubscriptions();
    _detachAnimationBus();
    _clearPresentationFx();
    try { AM()?.stopBgm(); } catch (_) {}

    try { NE().destroy(); } catch (_) {}
    try { GR().destroy(); } catch (_) {}

    if (_keyboardBound) {
      document.removeEventListener('keydown', _handleKeydown);
      _keyboardBound = false;
    }

    if (_resizeBound) {
      window.removeEventListener('resize', _handleResize);
      _resizeBound = false;
    }

    _mode = 'idle';
    _pendingAction = null;
    _callbacks = {};

    if (_container) {
      _container.innerHTML = '';
    }

    _container = null;
    $grid = null;
    $log = null;
    $actions = null;
    $initiative = null;
    $unitInfo = null;
    $narrator = null;
    $qteOverlay = null;
    $diceModal = null;
    $bgmControls = null;
    $fxLayer = null;
  }

  return Object.freeze({
    init,
    startCombat,
    destroy
  });
})();
