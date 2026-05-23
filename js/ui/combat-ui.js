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
  const GM = () => window.CJS.GMControls;

  let _container = null;
  let _bgmUnsubs = [];
  let _animUnsubs = [];
  let $bgmControls = null;
  let $fxLayer = null;
  let _callbacks = {};
  let _mode = 'idle';
  let _pendingAction = null;
  let _actionTab = 'attack';
  let _skillFilter = '';
  let _lastEncounterId = null;

  let _unsubCM = null;
  let _unsubLog = null;
  let _unsubNarrator = null;
  let _keyboardBound = false;
  let _resizeBound = false;
  let _activeFx = [];
  let _fxSeq = 0;
  let _activeBanner = null;
  let _bannerTimer = 0;

  const MAX_ACTIVE_FX = 24;
  const ACTION_TABS = [
    { id: 'move', label: 'Move' },
    { id: 'attack', label: 'Attack' },
    { id: 'skills', label: 'Skills' },
    { id: 'items', label: 'Items' },
    { id: 'guard', label: 'Guard' }
  ];

  let $grid = null;
  let $log = null;
  let $actions = null;
  let $initiative = null;
  let $unitInfo = null;
  let $weather = null;
  let $weatherFX = null;
  let _weatherFxId = null;  // last-rendered weather id, to skip rebuilds
  let $objective = null;
  let $narrator = null;
  let $qteOverlay = null;
  let $diceModal = null;

  function init(containerEl, options = {}) {
    destroy();
    _container = containerEl;
    _callbacks = { ...options };
    _mode = 'idle';
    _pendingAction = null;
    _actionTab = 'attack';
    _skillFilter = '';

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
    const summaryStatus = _container.querySelector('#bgm-summary-status');
    if (summaryStatus) {
      if (AM().isMuted()) summaryStatus.textContent = 'muted';
      else if (state?.playing) summaryStatus.textContent = 'playing';
      else if (state?.currentId) summaryStatus.textContent = 'paused';
      else summaryStatus.textContent = 'silent';
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
        if (!flag) _clearPresentationFx();
      });
    }
  }

  // ── ANIMATION BUS ──────────────────────────────────────────────────
  function _bindAnimationBus() {
    if (!AB()) return;

    _animUnsubs.push(AB().on('damage',     _animDamageFlash));
    _animUnsubs.push(AB().on('hit',        _animHit));
    _animUnsubs.push(AB().on('heal',       _animHealPulse));
    _animUnsubs.push(AB().on('miss',       _animMissCue));
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
    _fxSeq = 0;
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
      wind:      { accent: 'rgba(192, 255, 224, 0.92)', glow: 'rgba(122, 224, 176, 0.28)', ring: 'rgba(232, 255, 244, 0.22)' },
      earth:     { accent: 'rgba(224, 186, 126, 0.94)', glow: 'rgba(164, 120, 74, 0.30)', ring: 'rgba(255, 236, 208, 0.18)' },
      magic:     { accent: 'rgba(194, 148, 255, 0.94)', glow: 'rgba(156, 110, 255, 0.36)', ring: 'rgba(240, 222, 255, 0.22)' },
      dark:      { accent: 'rgba(160, 104, 224, 0.92)', glow: 'rgba(92, 42, 168, 0.36)', ring: 'rgba(220, 196, 255, 0.20)' },
      holy:      { accent: 'rgba(255, 244, 168, 0.98)', glow: 'rgba(255, 226, 124, 0.38)', ring: 'rgba(255, 252, 224, 0.26)' },
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

  function _getCellMetrics(pos) {
    if (!pos) return null;
    const cell = GR()?.getCellSize ? GR().getCellSize() : 0;
    if (!cell) return null;
    const canvas = _container?.querySelector('#cbt-canvas');
    const ox = canvas?.offsetLeft || 0;
    const oy = canvas?.offsetTop  || 0;
    const [r, c] = pos;
    const left = c * cell + ox;
    const top = r * cell + oy;
    return {
      cell,
      left,
      top,
      centerX: left + cell / 2,
      centerY: top + cell / 2
    };
  }

  function _spawnFx(cls, pos, ttl, opts = {}) {
    if (!_animEnabled() || !$fxLayer || !pos) return;
    const metrics = _getCellMetrics(pos);
    if (!metrics) return;
    const scale = typeof opts.scale === 'number' ? Math.max(0.2, opts.scale) : 1;
    const size = metrics.cell * scale;
    const inset = (metrics.cell - size) / 2;
    const el = document.createElement('div');
    const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
    el.className = `cjs-fx-cell ${cls}${extra}`;
    el.style.left   = (metrics.left + inset) + 'px';
    el.style.top    = (metrics.top + inset) + 'px';
    el.style.width  = size + 'px';
    el.style.height = size + 'px';
    const vars = opts.vars || {};
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }

    const key = opts.dedupeKey || `${cls}:${pos[0]}:${pos[1]}`;
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

  function _spawnLabelFx(text, pos, ttl, opts = {}) {
    if (!_animEnabled() || !$fxLayer || !pos || !text) return;
    const metrics = _getCellMetrics(pos);
    if (!metrics) return;
    const stackKey = opts.stackKey || `label:${pos[0]}:${pos[1]}`;
    const stackDepth = _activeFx.filter((entry) => String(entry.key).startsWith(stackKey)).length;
    while (_activeFx.length >= (opts.maxActive || MAX_ACTIVE_FX)) {
      _removeFxEntry(_activeFx[0]);
    }

    const el = document.createElement('div');
    const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
    el.className = `cjs-fx-label${extra}`;
    el.textContent = text;
    el.style.left = metrics.centerX + 'px';
    el.style.top = (metrics.centerY + (opts.offsetY || 0) - stackDepth * 14) + 'px';
    const vars = opts.vars || {};
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }

    $fxLayer.appendChild(el);
    const entry = { el, key: `${stackKey}:${++_fxSeq}`, timer: 0 };
    entry.timer = setTimeout(() => _removeFxEntry(entry), ttl || 720);
    _activeFx.push(entry);
    return el;
  }

  function _spawnTraceFx(from, to, ttl, opts = {}) {
    if (!_animEnabled() || !$fxLayer || !from || !to) return;
    const start = _getCellMetrics(from);
    const end = _getCellMetrics(to);
    if (!start || !end) return;
    const dx = end.centerX - start.centerX;
    const dy = end.centerY - start.centerY;
    const length = Math.hypot(dx, dy);
    if (!length) return;

    const key = opts.dedupeKey || `trace:${from.join(',')}->${to.join(',')}`;
    const existing = _activeFx.find((entry) => entry.key === key);
    if (existing) _removeFxEntry(existing);
    while (_activeFx.length >= (opts.maxActive || MAX_ACTIVE_FX)) {
      _removeFxEntry(_activeFx[0]);
    }

    const el = document.createElement('div');
    const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
    el.className = `cjs-fx-trace${extra}`;
    el.style.left = start.centerX + 'px';
    el.style.top = start.centerY + 'px';
    el.style.width = `${Math.max(18, length)}px`;
    el.style.transform = `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)`;
    const vars = opts.vars || {};
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }

    $fxLayer.appendChild(el);
    const entry = { el, key, timer: 0 };
    entry.timer = setTimeout(() => _removeFxEntry(entry), ttl || 280);
    _activeFx.push(entry);
    return el;
  }

  function _animDamageFlash(payload) {
    const id = payload?.target?.instanceId || payload?.target?.id || payload?.target?.baseId || 'target';
    const tone = payload?.element || payload?.damageType || 'physical';
    const theme = _themeVars(tone);
    if (payload?.attacker?.pos && payload?.target?.pos) {
      _spawnTraceFx(payload.attacker.pos, payload.target.pos, payload?.isCritical ? 320 : 250, {
        dedupeKey: `trace-hit:${id}`,
        extraClass: payload?.damageType === 'Magic' ? ' is-magic' : '',
        vars: theme
      });
    }
    if ((payload?.amount || 0) > 0) {
      _spawnFx('cjs-fx-damage', payload?.target?.pos, payload?.isCritical ? 360 : 280, {
        dedupeKey: `hit:${id}`,
        extraClass: payload?.isCritical ? 'is-crit' : '',
        vars: theme
      });
      _spawnLabelFx(`-${payload.amount}`, payload?.target?.pos, payload?.isCritical ? 760 : 680, {
        stackKey: `label-dmg:${id}`,
        extraClass: payload?.isCritical ? ' is-damage is-crit' : ' is-damage',
        vars: theme
      });
      if (payload?.isCritical) {
        _spawnLabelFx('CRIT', payload?.target?.pos, 680, {
          stackKey: `label-crit:${id}`,
          extraClass: ' is-crit-tag',
          vars: theme,
          offsetY: -18
        });
      }
    }
    if ((payload?.absorbed || 0) > 0) {
      _spawnFx('cjs-fx-guard', payload?.target?.pos, 380, {
        dedupeKey: `guard:${id}`,
        vars: _themeVars('light')
      });
      _spawnLabelFx(`BLOCK ${payload.absorbed}`, payload?.target?.pos, 660, {
        stackKey: `label-guard:${id}`,
        extraClass: ' is-guard',
        vars: _themeVars('light'),
        offsetY: 18
      });
    }
  }

  function _animHit(payload) {
    if (!_animEnabled() || !$fxLayer) return;
    const target = payload?.target;
    const attacker = payload?.attacker;
    if (!target?.pos) return;

    const id = target.instanceId || target.id || target.baseId || 'target';
    const targetTeam = target.team === 'player' ? 'player' : 'enemy';
    _spawnFx('cjs-fx-shake', target.pos, payload?.isCritical ? 420 : 360, {
      dedupeKey: `shake:${id}`,
      extraClass: `team-${targetTeam}${payload?.isCritical ? ' is-critical' : ''}`
    });

    if (attacker?.pos && (attacker.pos[0] !== target.pos[0] || attacker.pos[1] !== target.pos[1])) {
      const attackerTeam = attacker.team === 'player' ? 'player' : 'enemy';
      _spawnFx('cjs-fx-shake', attacker.pos, 220, {
        dedupeKey: `lunge:${id}`,
        extraClass: `team-${attackerTeam}`,
        scale: 0.68
      });
    }

    const angleDeg = _slashAngle(attacker?.pos, target.pos);
    const elementClass = _slashElementClass(payload?.element);
    const shapeClass = payload?.weaponShape === 'weapon_pierce'
      ? 'shape-pierce'
      : payload?.weaponShape === 'weapon_blunt'
        ? 'shape-blunt'
        : '';
    const extraClass = [elementClass, shapeClass].filter(Boolean).join(' ');
    _spawnSlash(target.pos, angleDeg, extraClass, `slash:${id}`);
  }

  function _slashAngle(fromPos, toPos) {
    if (!fromPos || !toPos) return -30;
    const dy = toPos[0] - fromPos[0];
    const dx = toPos[1] - fromPos[1];
    if (dx === 0 && dy === 0) return -30;
    return (Math.atan2(dy, dx) * 180 / Math.PI) - 30;
  }

  function _slashElementClass(element) {
    const e = String(element || '').toLowerCase();
    if (e === 'fire') return 'tone-fire';
    if (e === 'ice') return 'tone-ice';
    if (e === 'lightning') return 'tone-lightning';
    if (e === 'dark') return 'tone-dark';
    if (e === 'holy' || e === 'light') return 'tone-holy';
    return '';
  }

  function _spawnSlash(pos, angleDeg, extraClass, dedupeKey) {
    if (!_animEnabled() || !$fxLayer || !pos) return;
    const metrics = _getCellMetrics(pos);
    if (!metrics) return;

    const key = dedupeKey || `slash:${pos[0]}:${pos[1]}`;
    const existing = _activeFx.find((entry) => entry.key === key);
    if (existing) _removeFxEntry(existing);
    while (_activeFx.length >= MAX_ACTIVE_FX) {
      _removeFxEntry(_activeFx[0]);
    }

    const wrap = document.createElement('div');
    const classes = extraClass ? ` ${String(extraClass).trim()}` : '';
    wrap.className = `cjs-fx-cell cjs-fx-slash${classes}`;
    wrap.style.left = metrics.left + 'px';
    wrap.style.top = metrics.top + 'px';
    wrap.style.width = metrics.cell + 'px';
    wrap.style.height = metrics.cell + 'px';

    const streak = document.createElement('div');
    streak.className = 'cjs-slash-streak';
    streak.style.setProperty('--cjs-slash-angle', angleDeg + 'deg');
    wrap.appendChild(streak);
    $fxLayer.appendChild(wrap);

    const entry = { el: wrap, key, timer: 0 };
    entry.timer = setTimeout(() => _removeFxEntry(entry), 320);
    _activeFx.push(entry);
    return wrap;
  }

  function _animHealPulse(payload) {
    const id = payload?.target?.instanceId || payload?.target?.id || payload?.target?.baseId || 'target';
    const theme = {
      '--cjs-fx-accent': 'rgba(118, 235, 156, 0.96)',
      '--cjs-fx-glow': 'rgba(86, 214, 132, 0.34)',
      '--cjs-fx-ring': 'rgba(230, 255, 236, 0.22)'
    };
    _spawnFx('cjs-fx-heal', payload?.target?.pos, 420, {
      dedupeKey: `heal:${id}`,
      vars: theme
    });
    _spawnLabelFx(`+${payload?.amount || 0}`, payload?.target?.pos, 760, {
      stackKey: `label-heal:${id}`,
      extraClass: ' is-heal',
      vars: theme
    });
  }

  function _animMissCue(payload) {
    const id = payload?.target?.instanceId || payload?.target?.id || payload?.target?.baseId || 'target';
    const theme = {
      '--cjs-fx-accent': 'rgba(212, 220, 232, 0.96)',
      '--cjs-fx-glow': 'rgba(196, 208, 230, 0.22)',
      '--cjs-fx-ring': 'rgba(248, 252, 255, 0.20)'
    };
    if (payload?.attacker?.pos && payload?.target?.pos) {
      _spawnTraceFx(payload.attacker.pos, payload.target.pos, 240, {
        dedupeKey: `trace-miss:${id}`,
        extraClass: ' is-miss',
        vars: theme
      });
    }
    _spawnFx('cjs-fx-miss', payload?.target?.pos, 340, {
      dedupeKey: `miss:${id}`,
      vars: theme
    });
    _spawnLabelFx('MISS', payload?.target?.pos, 720, {
      stackKey: `label-miss:${id}`,
      extraClass: ' is-miss',
      vars: theme
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
      extraClass: skill.damageType === 'Magic' ? 'is-magic' : 'is-physical',
      vars: _themeVars(tone)
    });
  }

  function _animUnitMove(payload) {
    const from = payload?.from;
    const to = payload?.to;
    const cell = GR()?.getCellSize ? GR().getCellSize() : 0;
    if (!from || !to || !cell) return;

    // Slide the unit smoothly between cells. The grid renderer
    // interpolates the unit position until the animation ends; the
    // unit's logical pos is already at `to`, so this is purely visual.
    if (_animEnabled() && GR()?.animateUnitMove) {
      const dr = to[0] - from[0];
      const dc = to[1] - from[1];
      const steps = Math.max(Math.abs(dr), Math.abs(dc), 1);
      // ~120ms per cell of travel, with a floor so a 1-cell hop doesn't
      // feel snappy and a 6-cell dash doesn't feel sluggish.
      const dur = Math.max(220, Math.min(900, 120 * steps + 80));
      const unitId = payload?.unit?.instanceId;
      if (unitId) GR().animateUnitMove(unitId, from, to, dur);
    }

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

    const dr = to[0] - from[0];
    const dc = to[1] - from[1];
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    for (let i = 1; i < steps; i++) {
      const r = from[0] + Math.round(dr * (i / steps));
      const c = from[1] + Math.round(dc * (i / steps));
      setTimeout(() => {
        _spawnFx('cjs-fx-trail', [r, c], 260, {
          dedupeKey: `move-dot:${from.join(',')}->${to.join(',')}:${i}`,
          scale: 0.48
        });
      }, i * 55);
    }
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
    banner.textContent = `Round ${payload?.round || 1} | ${(unit.name || 'Unit')}'s turn`;
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
          <div id="cbt-weather" class="weather-banner" hidden></div>
          <div id="cbt-objective" class="combat-objective-banner" hidden></div>
          <div id="cbt-initiative" class="initiative-bar"></div>
        </div>
        <div class="combat-middle">
          <div class="combat-grid-wrap">
            <canvas id="cbt-canvas"></canvas>
            <div id="cbt-weather-fx" class="cjs-weather-fx" aria-hidden="true"></div>
            <div id="cbt-fx-layer" class="cjs-fx-layer"></div>
            <div class="combat-zoom-controls" role="group" aria-label="Board zoom">
              <button id="btn-zoom-out" type="button" class="combat-zoom-btn" title="Zoom out" aria-label="Zoom out">&minus;</button>
              <span id="cbt-zoom-level" class="combat-zoom-level" aria-live="polite">100%</span>
              <button id="btn-zoom-in" type="button" class="combat-zoom-btn" title="Zoom in" aria-label="Zoom in">+</button>
              <button id="btn-zoom-reset" type="button" class="combat-zoom-btn" title="Reset zoom" aria-label="Reset zoom">&#x21BA;</button>
            </div>
          </div>
          <div class="combat-sidebar">
            <details id="cbt-bgm-controls" class="bgm-controls">
              <summary class="bgm-summary"><span class="bgm-summary-icon">&#127925;</span><span class="bgm-summary-label">Audio &amp; Anim</span><span id="bgm-summary-status" class="bgm-summary-status">silent</span></summary>
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
            </details>
            <div id="cbt-unit-info" class="unit-info-panel"></div>
            <div id="cbt-actions" class="action-panel"></div>
            <section class="combat-assist-menu" open>
              <header class="combat-assist-summary">Battle Assist</header>
              <div class="combat-assist-panel">
                <div class="dice-controls">
                  <div class="dice-mode-row">
                    <span class="dice-label">Dice</span>
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
            </section>
            <details class="combat-assist-menu gm-menu">
              <summary class="combat-assist-summary">GM Controls</summary>
              <div id="cbt-gm-panel" class="combat-assist-panel"></div>
            </details>
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
    $weather = _container.querySelector('#cbt-weather');
    $weatherFX = _container.querySelector('#cbt-weather-fx');
    $objective = _container.querySelector('#cbt-objective');
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

    const gmHost = _container.querySelector('#cbt-gm-panel');
    if (gmHost && GM()) {
      GM().mount(gmHost, {
        onRefresh: _refresh,
        onHint: _setModeHint,
        onClearHint: _clearModeHint
      });
    }
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

    _bindZoomControls();
  }

  function _updateZoomLabel() {
    const label = _container?.querySelector('#cbt-zoom-level');
    if (!label) return;
    const z = GR().getZoom ? GR().getZoom() : 1;
    label.textContent = Math.round(z * 100) + '%';
    const bounds = GR().getZoomBounds ? GR().getZoomBounds() : { min: 0.5, max: 2.5 };
    const inBtn = _container.querySelector('#btn-zoom-in');
    const outBtn = _container.querySelector('#btn-zoom-out');
    if (inBtn) inBtn.disabled = z >= bounds.max - 0.001;
    if (outBtn) outBtn.disabled = z <= bounds.min + 0.001;
  }

  function _bindZoomControls() {
    const inBtn = _container.querySelector('#btn-zoom-in');
    const outBtn = _container.querySelector('#btn-zoom-out');
    const resetBtn = _container.querySelector('#btn-zoom-reset');
    inBtn?.addEventListener('click', () => { GR().zoomIn(); _updateZoomLabel(); });
    outBtn?.addEventListener('click', () => { GR().zoomOut(); _updateZoomLabel(); });
    resetBtn?.addEventListener('click', () => { GR().resetZoom(); _updateZoomLabel(); });
    _updateZoomLabel();
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
    GR().clearMoveAnimations?.();
    _updateZoomLabel();

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

    _renderWeather(state);
    _renderObjective(state);
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

  function _renderObjective(state) {
    if (!$objective) return;
    const tracker = state?.objective;
    const OBJ = window.CJS.CombatObjectives;
    if (!tracker || !OBJ) {
      $objective.hidden = true;
      $objective.innerHTML = '';
      return;
    }
    const info = OBJ.describe(tracker, state);
    const cls = info.broken ? ' is-contested' : '';
    $objective.hidden = false;
    $objective.className = `combat-objective-banner objective-${info.kind}${cls}`;
    const pct = Math.max(0, Math.min(100, Number(info.progressPct || 0)));
    $objective.innerHTML = `
      <span class="objective-icon" aria-hidden="true">${_escHtml(info.icon || '⚔')}</span>
      <div class="objective-body">
        <div class="objective-title">${_escHtml(info.title || '')}</div>
        ${info.detail ? `<div class="objective-detail">${_escHtml(info.detail)}</div>` : ''}
      </div>
      <div class="objective-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="objective-meter-fill" style="width:${pct}%"></div>
      </div>
    `;
  }

  function _renderWeather(state) {
    const env = state?.environment;
    const WX = window.CJS.Weather;
    const isActive = !!(env && env.id !== 'normal' && env.remaining > 0 && WX);
    const def = isActive ? (WX.getDef(env.id) || { id: env.id, name: env.id, icon: '🌫', description: '' }) : null;

    // Banner above initiative bar
    if ($weather) {
      if (!isActive) {
        $weather.hidden = true;
        $weather.innerHTML = '';
        $weather.className = 'weather-banner';
      } else {
        $weather.hidden = false;
        $weather.className = `weather-banner weather-${_escAttr(env.id)}`;
        $weather.innerHTML = `
          <span class="weather-icon" aria-hidden="true">${_escHtml(def.icon || '🌫')}</span>
          <span class="weather-name">${_escHtml(def.name || env.id)}</span>
          <span class="weather-remaining">${env.remaining} turn${env.remaining === 1 ? '' : 's'} left</span>
          <span class="weather-desc">${_escHtml(def.description || '')}</span>
        `;
      }
    }

    // Particle overlay above the canvas
    _renderWeatherFX(isActive ? env.id : null);
  }

  // Build the particle layer once per weather change; idempotent so each
  // refresh() doesn't churn the DOM. Caller passes the active weather id
  // (or null to clear).
  function _renderWeatherFX(weatherId) {
    if (!$weatherFX) return;
    if (_weatherFxId === weatherId) return;
    _weatherFxId = weatherId;

    if (!weatherId) {
      $weatherFX.classList.remove('is-active');
      $weatherFX.innerHTML = '';
      $weatherFX.removeAttribute('data-weather');
      return;
    }

    $weatherFX.setAttribute('data-weather', weatherId);
    $weatherFX.classList.add('is-active');
    $weatherFX.innerHTML = `
      <div class="cjs-weather-wash"></div>
      <div class="cjs-weather-particles">${_buildWeatherParticles(weatherId)}</div>
    `;
  }

  // Particle markup per weather. Counts and stagger tuned to look dense
  // without dropping frames on weaker devices.
  function _buildWeatherParticles(weatherId) {
    const rand = (min, max) => (Math.random() * (max - min) + min).toFixed(2);
    switch (weatherId) {
      case 'rain': {
        const drops = [];
        for (let i = 0; i < 60; i++) {
          const left = rand(0, 100);
          const delay = rand(0, 0.7);
          const dur = rand(0.55, 0.95);
          const op = rand(0.55, 1);
          drops.push(`<span class="cjs-rain-drop" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}"></span>`);
        }
        return drops.join('');
      }
      case 'blizzard': {
        const flakes = [];
        const glyphs = ['❄', '❅', '❆', '*'];
        for (let i = 0; i < 40; i++) {
          const left = rand(0, 100);
          const delay = rand(0, 5);
          const dur = rand(4, 7);
          const size = rand(8, 18);
          const op = rand(0.6, 1);
          const g = glyphs[i % glyphs.length];
          flakes.push(`<span class="cjs-snow-flake" style="left:${left}%;font-size:${size}px;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}">${g}</span>`);
        }
        return flakes.join('');
      }
      case 'sandstorm': {
        const streaks = [];
        for (let i = 0; i < 30; i++) {
          const top = rand(0, 100);
          const delay = rand(0, 1.4);
          const dur = rand(1.0, 1.8);
          const w = rand(60, 160);
          const op = rand(0.5, 0.95);
          streaks.push(`<span class="cjs-sand-streak" style="top:${top}%;width:${w}px;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}"></span>`);
        }
        return streaks.join('');
      }
      case 'acid_rain': {
        const drops = [];
        for (let i = 0; i < 35; i++) {
          const left = rand(0, 100);
          const delay = rand(0, 1.1);
          const dur = rand(0.9, 1.4);
          drops.push(`
            <span class="cjs-acid-drop" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s"></span>
            <span class="cjs-acid-splash" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s"></span>
          `);
        }
        return drops.join('');
      }
      case 'sunny': {
        const rays = [];
        for (let i = 0; i < 16; i++) {
          const left = rand(0, 100);
          const rot = rand(-8, 8);
          const delay = rand(0, 3);
          const dur = rand(2.4, 4.2);
          const op = rand(0.3, 0.7);
          rays.push(`<span class="cjs-sun-ray" style="left:${left}%;transform:rotate(${rot}deg);animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}"></span>`);
        }
        rays.push(`<span class="cjs-sun-shimmer"></span>`);
        return rays.join('');
      }
      default:
        return '';
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
      const portraitHtml = _renderPortraitMarkup(unit.portrait, 'init-portrait', 'init-icon', unit.icon || '?', unit.portraitFocus);

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
    const ultMax = Number(unit.ultimateMax || 100);
    const ultCur = Number(unit.ultimateMeter || 0);
    const ultPct = Math.max(0, Math.min(100, Math.round((ultCur / (ultMax || 1)) * 100)));
    const ultReady = ultCur >= ultMax;
    const ultRowHtml = (typeof unit.ultimateMeter === 'number' && unit.ultimateSkillId)
      ? `<div class="bar-row">
           <span class="bar-label">ULT</span>
           <div class="bar-track ultimate ${ultReady ? 'ultimate-ready' : ''}"><div class="bar-fill" style="width:${ultPct}%"></div></div>
           <span class="bar-num">${ultCur|0}/${ultMax|0}</span>
         </div>`
      : '';

    const statusHtml = unit.activeStatuses?.length
      ? `<div class="unit-statuses">${unit.activeStatuses.map((status) => (
          `<span class="status-chip" title="${_escAttr(`${status.statusId} (${status.duration}t, ${status.stacks}stk)`)}">${_escHtml(_statusIcon(status.statusId))} ${status.duration}t</span>`
        )).join('')}</div>`
      : '';

    const portraitHtml = _renderPortraitMarkup(unit.portrait, 'unit-portrait', 'unit-icon-lg', unit.icon || '?', unit.portraitFocus);

    // Persona chip: shown when this unit was snapshotted from a campaign party
    // member with an active persona. Out-of-world personas display the dealt /
    // taken multipliers so the player sees the penalty without opening a tab.
    let personaChipHtml = '';
    if (unit.activePersona) {
      const personaName = _escHtml(unit.personaName || unit.activePersona);
      const out = !!unit.personaOutOfWorld;
      const dealt = Number(unit.damageDealtMultiplier ?? 1);
      const taken = Number(unit.damageTakenMultiplier ?? 1);
      const tooltip = out
        ? `${personaName} (out of world: ${_escAttr(unit.personaWorld || '')}). Damage ×${dealt} dealt / ×${taken} taken.`
        : `${personaName} (${_escAttr(unit.personaWorld || '')})`;
      personaChipHtml = `<div class="unit-persona-chip" title="${tooltip}" style="font-size:0.74rem;margin-top:2px;color:${out ? '#f59e0b' : 'var(--text-mute)'}">
        🎭 ${personaName}${out ? ` ⚠ ×${dealt}/×${taken}` : ''}
      </div>`;
    }

    // Combo chip — chained QTE successes grant bonus damage on the
    // next swing. The chip shows the active multiplier when one is
    // pending so the player can see what their last good QTE earned.
    let comboChipHtml = '';
    const comboChain = unit.comboState?.chain || 0;
    if (comboChain >= 2) {
      const bonusPct = Math.round((window.CJS.ActionHandler?.getComboBonus?.(unit) || 0) * 100);
      comboChipHtml = `<div class="unit-combo-chip" title="Chain QTE successes for bonus damage. Breaks on QTE fail, defend, or item use." style="font-size:0.74rem;margin-top:2px;color:#f97316;font-weight:600">
        🔥 Combo x${comboChain} · +${bonusPct}% next hit
      </div>`;
    }

    // Procedural modifier chip — shows the random Diablo-style prefix
    // (Frozen / Rabid / Alpha / Swift / Tough / Hungry) so the player
    // immediately sees what makes this monster different.
    let modifierChipHtml = '';
    if (unit.procModifier && unit.team !== 'player' && unit.team !== 'ally') {
      const label = _escHtml(unit.procModifierLabel || unit.procModifier);
      const icon = _escHtml(unit.procModifierIcon || '✨');
      modifierChipHtml = `<div class="unit-modifier-chip" title="Procedural enemy modifier — random prefix giving this normal monster a twist." style="font-size:0.74rem;margin-top:2px;color:#a855f7;font-weight:600">
        ${icon} ${label}
      </div>`;
    }

    $unitInfo.innerHTML = `
      <div class="unit-card ${_escAttr(unit.team || 'player')}">
        <div class="unit-header">
          ${portraitHtml}
          <div>
            <div class="unit-name">${_escHtml(unit.name || unit.baseId || '?')}</div>
            <div class="unit-rank">Rank ${_escHtml(unit.rank || '?')} ${_escHtml(unit.type || '')}</div>
            ${personaChipHtml}
            ${modifierChipHtml}
            ${comboChipHtml}
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
          ${ultRowHtml}
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

    const tabs = _getActionTabs(available);
    _actionTab = _resolveActionTab(available, tabs);

    let html = '<div class="action-buttons combat-action-panel-v2">';
    html += '<div class="combat-action-tabs" role="tablist" aria-label="Combat actions">';
    for (const tab of tabs) {
      const active = tab.id === _actionTab;
      const disabled = !tab.enabled ? 'disabled aria-disabled="true"' : '';
      html += `
        <button type="button" class="combat-action-tab ${active ? 'is-active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" data-action-tab="${_escAttr(tab.id)}" ${disabled}>
          <span class="combat-action-tab-label">${_escHtml(tab.label)}</span>
          <span class="combat-action-tab-count">${tab.count}</span>
        </button>
      `;
    }
    html += '</div>';
    html += `<div class="combat-action-tab-panel" role="tabpanel" data-action-tab-panel="${_escAttr(_actionTab)}">`;
    html += _renderActionTabPanel(_actionTab, available, unit);
    html += '</div></div>';

    $actions.innerHTML = html;

    $actions.querySelectorAll('[data-action-tab]').forEach((button) => {
      button.addEventListener('click', () => _onActionTabClick(button));
    });

    $actions.querySelector('[data-action-skill-search]')?.addEventListener('input', (event) => {
      _onSkillSearchInput(event.target);
    });

    $actions.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => _onActionClick(button));
    });
  }

  function _getActionTabs(available) {
    const skills = available.skills || [];
    const items = available.items || [];
    return ACTION_TABS.map((tab) => {
      if (tab.id === 'move') return { ...tab, count: available.move ? 1 : 0, enabled: !!available.move };
      if (tab.id === 'attack') return { ...tab, count: available.attack ? 1 : 0, enabled: !!available.attack };
      if (tab.id === 'skills') return { ...tab, count: skills.length, enabled: skills.length > 0 };
      if (tab.id === 'items') return { ...tab, count: items.length, enabled: items.length > 0 };
      return { ...tab, count: (available.defend ? 1 : 0) + 1, enabled: true };
    });
  }

  function _resolveActionTab(available, tabs) {
    const current = tabs.find((tab) => tab.id === _actionTab && tab.enabled);
    if (current) return current.id;
    for (const id of ['attack', 'skills', 'items', 'move', 'guard']) {
      const tab = tabs.find((entry) => entry.id === id && entry.enabled);
      if (tab) return tab.id;
    }
    return 'guard';
  }

  function _renderActionTabPanel(tabId, available, unit) {
    switch (tabId) {
      case 'move':
        return available.move
          ? _renderCoreActionButton('move', 'Move', 'btn-move', 'Pick a reachable blue cell')
          : '<div class="combat-action-empty">Move is already used.</div>';
      case 'attack':
        return available.attack
          ? _renderCoreActionButton('attack', 'Attack', 'btn-attack', 'Choose an enemy in weapon range')
          : '<div class="combat-action-empty">Attack is unavailable.</div>';
      case 'skills':
        return _renderSkillsPanel(available.skills || [], unit);
      case 'items':
        return _renderItemsPanel(available.items || []);
      case 'guard':
      default:
        return _renderGuardPanel(available);
    }
  }

  function _renderCoreActionButton(action, label, className, meta) {
    return `
      <div class="combat-action-list">
        <button class="btn btn-action ${className}" data-action="${_escAttr(action)}">
          <span class="btn-action-copy">
            <span class="btn-action-name">${_escHtml(label)}</span>
            <span class="btn-action-meta">${_escHtml(meta || '')}</span>
          </span>
        </button>
      </div>
    `;
  }

  function _renderGuardPanel(available) {
    let html = '<div class="combat-action-list">';
    if (available.defend) {
      html += `
        <button class="btn btn-action btn-defend" data-action="defend">
          <span class="btn-action-copy">
            <span class="btn-action-name">Defend</span>
            <span class="btn-action-meta">Guard and end your main action</span>
          </span>
        </button>
      `;
    }
    html += `
      <button class="btn btn-action btn-end-turn" data-action="end_turn">
        <span class="btn-action-copy">
          <span class="btn-action-name">End Turn</span>
          <span class="btn-action-meta">Pass remaining actions</span>
        </span>
      </button>
    `;
    html += '</div>';
    return html;
  }

  function _renderSkillsPanel(skills, unit) {
    if (!skills.length) return '<div class="combat-action-empty">No skills available.</div>';
    const filter = _skillFilter.trim().toLowerCase();
    let visible = 0;
    let html = '';
    if (skills.length > 8) {
      html += `
        <label class="combat-action-search">
          <span>Search</span>
          <input type="search" data-action-skill-search value="${_escAttr(_skillFilter)}" placeholder="Filter skills">
        </label>
      `;
    }
    html += '<div class="combat-action-list combat-skill-list">';
    for (const skillEntry of skills) {
      const matches = _skillMatchesFilter(skillEntry, filter);
      if (matches) visible++;
      html += _renderSkillButton(skillEntry, unit, !matches);
    }
    html += '</div>';
    html += `<div class="combat-action-empty" data-skill-search-empty ${visible > 0 ? 'hidden' : ''}>No skills match that search.</div>`;
    return html;
  }

  function _renderSkillButton(skillEntry, unit, hidden) {
    const skill = skillEntry.skill || {};
    const skillName = skill.name || skillEntry.id;
    const disabled = !skillEntry.usable ? 'disabled aria-disabled="true"' : '';
    const reasonText = _skillDisabledReason(skillEntry, unit);
    const reason = reasonText ? `title="${_escAttr(reasonText)}"` : '';
    const iconHtml = _renderEntityIcon(skill, 'skill', 'sm');
    const meta = _skillMetaChips(skillEntry, unit);
    const qte = skill.qte && skill.qte !== 'none' ? `<span class="action-chip qte">QTE ${_escHtml(skill.qte)}</span>` : '';
    const searchText = _skillSearchText(skillEntry);
    return `
      <button class="btn btn-action btn-skill" data-action="skill" data-skill="${_escAttr(skillEntry.id)}" data-skill-search-text="${_escAttr(searchText)}" ${disabled} ${reason} ${hidden ? 'hidden' : ''}>
        ${iconHtml}
        <span class="btn-action-copy">
          <span class="btn-action-name">${_escHtml(skillName)}</span>
          <span class="btn-action-meta">${meta}${qte}</span>
          ${reasonText && !skillEntry.usable ? `<span class="btn-action-reason">${_escHtml(reasonText)}</span>` : ''}
        </span>
      </button>
    `;
  }

  function _renderItemsPanel(items) {
    if (!items.length) return '<div class="combat-action-empty">No consumable items available.</div>';
    let html = '<div class="combat-action-list combat-item-list">';
    for (const itemEntry of items) {
      const itemName = itemEntry.item?.name || itemEntry.id;
      const iconHtml = _renderEntityIcon(itemEntry.item, 'item', 'sm');
      html += `
        <button class="btn btn-action btn-item" data-action="item" data-item="${_escAttr(itemEntry.id)}">
          ${iconHtml}
          <span class="btn-action-copy">
            <span class="btn-action-name">${_escHtml(itemName)}</span>
            <span class="btn-action-meta">Consumable</span>
          </span>
        </button>
      `;
    }
    html += '</div>';
    return html;
  }

  function _skillMetaChips(skillEntry, unit) {
    const chips = [
      `<span class="action-chip">AP ${skillEntry.apCost || 0}</span>`
    ];
    if (skillEntry.mpCost) chips.push(`<span class="action-chip">MP ${skillEntry.mpCost}</span>`);
    if (skillEntry.cooldown > 0) chips.push(`<span class="action-chip cooldown">CD ${skillEntry.cooldown}</span>`);
    if (skillEntry.isUltimate) {
      const meter = Number(unit?.ultimateMeter || 0);
      const cost = Number(skillEntry.ultimateCost || 100);
      chips.push(`<span class="action-chip ultimate ${skillEntry.ultimateReady ? 'ready' : 'locked'}">ULT ${Math.min(meter, cost)}/${cost}</span>`);
    }
    return chips.join('');
  }

  function _skillDisabledReason(skillEntry, unit) {
    if (skillEntry.usable) return '';
    if (skillEntry.silenced) return 'Skills are blocked';
    if (!skillEntry.weaponReady && skillEntry.requiredWeaponTypes?.length) {
      return `Requires ${skillEntry.requiredWeaponTypes.map((type) => String(type).replace(/_/g, ' ')).join(' or ')}`;
    }
    if (skillEntry.cooldown > 0) return `Cooldown: ${skillEntry.cooldown} turns`;
    if ((unit?.currentMP || 0) < (skillEntry.mpCost || 0)) return `Needs ${skillEntry.mpCost || 0} MP`;
    if ((unit?.turnState?.apRemaining || 0) < (skillEntry.apCost || 0)) return `Needs ${skillEntry.apCost || 0} AP`;
    if (skillEntry.isUltimate && !skillEntry.ultimateReady) return `Ultimate not ready`;
    return 'Unavailable';
  }

  function _skillSearchText(skillEntry) {
    const skill = skillEntry.skill || {};
    return [
      skillEntry.id,
      skill.name,
      skill.description,
      skill.element,
      skill.damageType,
      skill.qte,
      ...(skill.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function _skillMatchesFilter(skillEntry, filter) {
    return !filter || _skillSearchText(skillEntry).includes(filter);
  }

  function _onActionTabClick(button) {
    if (button.disabled) return;
    _actionTab = button.dataset.actionTab || 'attack';
    const state = CM().getState ? CM().getState() : { phase: 'action' };
    _renderActions(state);
  }

  function _onSkillSearchInput(input) {
    _skillFilter = input?.value || '';
    const filter = _skillFilter.trim().toLowerCase();
    let visible = 0;
    $actions.querySelectorAll('[data-skill-search-text]').forEach((button) => {
      const matches = !filter || String(button.dataset.skillSearchText || '').includes(filter);
      button.hidden = !matches;
      if (matches) visible++;
    });
    const empty = $actions.querySelector('[data-skill-search-empty]');
    if (empty) empty.hidden = visible > 0;
  }

  function _onActionClick(button) {
    const type = button.dataset.action;
    const unit = CM().getCurrentUnit();
    if (!unit) return;

    // Clicking the active mode's button again cancels back to idle.
    if (type === 'move' && _mode === 'move') {
      _exitMode();
      return;
    }
    if ((type === 'attack' || type === 'skill' || type === 'item') &&
        (_mode === 'target_single' || _mode === 'target_aoe')) {
      const pending = _pendingAction || {};
      const sameAttack = type === 'attack' && pending.type === 'attack';
      const sameSkill = type === 'skill' && pending.type === 'skill' &&
                        pending.skillId === button.dataset.skill;
      const sameItem = type === 'item' && pending.type === 'item' &&
                       pending.itemId === button.dataset.item;
      if (sameAttack || sameSkill || sameItem) {
        _exitMode();
        return;
      }
    }

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

  function _exitMode() {
    _mode = 'idle';
    _pendingAction = null;
    GR().clearHighlights();
    _clearModeHint();
  }

  function _enterMoveMode(unit) {
    GR().clearHighlights();
    _pendingAction = null;
    _mode = 'move';
    const moves = GE().getValidMoves(unit.instanceId);
    const cells = Array.isArray(moves) ? moves.map(([r, c]) => ({ r, c })) : [];
    GR().setHighlights(cells, 'rgba(59,130,246,0.4)', 'move');
    _setModeHint('Click a blue cell to move, or click Move again / press Esc to cancel.');
  }

  function _enterTargetMode(unit, action) {
    GR().clearHighlights();
    _mode = 'target_single';
    _pendingAction = action;

    let range = 1;
    if (action.type !== 'attack') {
      const resolver = window.CJS.SkillResolver;
      const skill = resolver ? resolver.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
      range = Math.max(1, Number(skill?.range || 1) + Number(unit.rangeBonus || 0));
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

    // Attack mode also surfaces destructible environment (barrels) as
    // valid orange-tinted targets, so clicking one kicks it. Skills /
    // items don't get this — they target units (or AoE centers) only.
    if (action.type === 'attack') {
      const interactTargets = (AH()?.getAvailableActions?.(unit)?.interactTargets) || [];
      for (const t of interactTargets) {
        cells.push({ r: t.r, c: t.c });
      }
    }

    GR().setHighlights(cells, 'rgba(239,68,68,0.4)', 'target');
    _setModeHint('Click a valid target, or click the same action again / press Esc to cancel.');
  }

  function _enterAoETargetMode(unit, skill) {
    GR().clearHighlights();
    _mode = 'target_aoe';
    _pendingAction = { type: 'skill', skillId: skill.id };

    const range = Math.max(1, Number(skill.range || 3) + Number(unit.rangeBonus || 0));
    const rawCells = GE().getCellsInRange(unit.pos[0], unit.pos[1], range);
    const cells = rawCells.map(([r, c]) => ({ r, c }));
    GR().setHighlights(cells, 'rgba(168,85,247,0.3)', 'target');
    _setModeHint('Click a cell for the AoE center, or click the same skill again / press Esc to cancel.');
  }

  function _onCellClick(r, c) {
    // GM tool takes precedence over player input modes.
    if (GM()?.isToolActive() && GM().handleCellClick(r, c)) {
      return;
    }

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
      // Attack mode can fall through to barrel-kick when the targeted
      // cell holds a destructible tile instead of a unit.
      if (!unitAt) {
        if (action.type === 'attack' && GE().isDestructibleTerrain
            && GE().isDestructibleTerrain(r, c)) {
          GR().clearHighlights('target');
          _mode = 'idle';
          _pendingAction = null;
          _clearModeHint();
          const result = CM().submitAction({ type: 'interact', targetPos: [r, c] });
          _handleActionResult(result);
          CM().runUntilInput();
          return;
        }
        return;
      }
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

  function _onCellHover(r, c) {
    // Show flank / elevation context when previewing a single-target attack
    // or skill. We compute against the currently acting unit so the hint
    // reflects the attacker the player is about to commit.
    if (_mode !== 'target_single') return;
    const attacker = CM().getCurrentUnit();
    if (!attacker) return;
    const target = GE().getUnitAt(r, c);
    // Barrel-kick preview when attack mode is over a destructible cell.
    if (!target && _pendingAction?.type === 'attack'
        && GE().isDestructibleTerrain && GE().isDestructibleTerrain(r, c)) {
      const ENV = (window.CJS.CONST?.ENVIRONMENTAL_INTERACTIONS) || {};
      const radius = Number(ENV.barrelExplosionRadius || 1);
      _setModeHint(`💥 Kick barrel — Fire AoE radius ${radius}, costs ${ENV.barrelKickAPCost || 1} AP.`);
      return;
    }
    if (!target || target.team === attacker.team || (target.currentHP || 0) <= 0) {
      _setModeHint('Click a valid target, or click the same action again / press Esc to cancel.');
      return;
    }
    const parts = [`Target: ${target.name || target.baseId || '?'}`];

    // Flank
    try {
      if (GE().getFlankPosition) {
        const f = GE().getFlankPosition(attacker, target);
        if (f.position === 'rear') {
          parts.push(`🗡️ REAR (+${f.critBonus}% crit)`);
        } else if (f.position === 'side') {
          parts.push(f.critBonus > 0 ? `↙ SIDE (+${f.critBonus}% crit)` : '↙ Side');
        } else {
          parts.push('▲ Front');
        }
      }
    } catch (e) {}

    // Elevation
    try {
      if (GE().getUnitElevation) {
        const ae = GE().getUnitElevation(attacker);
        const te = GE().getUnitElevation(target);
        if (ae > te) {
          const E = (window.CJS.CONST?.ELEVATION) || {};
          const acc = (ae - te) * Number(E.accuracyBonusPerStep || 0);
          parts.push(`⬆ High ground (+${acc}% acc)`);
        } else if (te > ae) {
          parts.push('⬇ Target on higher ground');
        }
      }
    } catch (e) {}

    _setModeHint(parts.join('   ·   '));
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

    // [CJS] editorial lines belong to the L2D companion's speech bubble,
    // not the battle report. Strip them here so the left panel stays a
    // clean blow-by-blow.
    const lines = text.split('\n').filter(l => !/^\s*\[CJS\]/.test(l));
    if (!lines.length) return;

    const block = document.createElement('div');
    block.className = 'narrator-line';

    for (const line of lines) {
      const paragraph = document.createElement('p');
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
      _updateZoomLabel();
    }
  }

  function _handleKeydown(event) {
    if (event.key !== 'Escape') return;

    if (GM()?.isToolActive()) {
      GM().cancelTool();
      _refresh();
      return;
    }

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

  function _renderEntityIcon(entity, kind, size) {
    const I = window.CJS && window.CJS.UIIcons;
    if (I) return I.renderIcon(entity || {}, { kind, size });
    const fb = entity?.icon || (kind === 'item' ? '🎁' : '⚔️');
    return `<span class="cjs-icon cjs-icon-${size}">${_escHtml(fb)}</span>`;
  }

  function _renderPortraitMarkup(path, imageClass, fallbackClass, icon, focus) {
    if (!path) return `<span class="${fallbackClass}">${_escHtml(icon || '?')}</span>`;

    const PP = window.CJS && window.CJS.PortraitPicker;
    const src = PP && PP.bustedSrc ? PP.bustedSrc(path) : path;
    const style = PP && PP.focusStyle ? PP.focusStyle(focus) : '';
    return `
      <img src="${_escAttr(src)}" class="${imageClass}" style="${_escAttr(style)}" onerror="this.style.display='none';this.nextElementSibling.style.display=''" alt="">
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
    try { GM()?.unmount(); } catch (_) {}

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
    $weather = null;
    $weatherFX = null;
    $objective = null;
    $narrator = null;
    $qteOverlay = null;
    $diceModal = null;
    $bgmControls = null;
    $fxLayer = null;
  }

  // Public refresh hook for hot-reload + dev console. Safe to call when no
  // combat is active — _refresh() short-circuits if state is null.
  function refresh() { _refresh(); }

  return Object.freeze({
    init,
    startCombat,
    refresh,
    destroy
  });
})();
