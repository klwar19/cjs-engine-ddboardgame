// scene-player.js
// Lightweight fixed-size video overlay for brief campaign/combat cut-ins.

window.CJS = window.CJS || {};

window.CJS.ScenePlayer = (() => {
  'use strict';

  const MANIFEST_URL = 'data/scene-manifest.json';
  const THROTTLE_MS = 1500;
  const DEFAULT_TIMEOUT_MS = 6000;
  const DEFAULT_HOLD_AFTER_ERROR_MS = 80;

  const _state = {
    manifest: null,
    manifestPromise: null,
    overlay: null,
    box: null,
    video: null,
    closeBtn: null,
    activeTimer: 0,
    hideTimer: 0,
    lastPlayAt: 0,
    pending: false,
    enabled: true,
    campaignUnsub: null,
    combatUnsub: null
  };

  const DEFAULT_CAMPAIGN_SOURCE_TO_SCENE = Object.freeze({
    event_roll: 'campaign.roll_event',
    oracle: 'campaign.oracle',
    random_battle: 'campaign.random_battle',
    random_battle_fallback: 'campaign.random_battle'
  });

  const DEFAULT_COMBAT_TYPE_TO_SCENE = Object.freeze({
    hit: 'combat.attack'
  });

  function _prefersReducedMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function _canShow() {
    return _state.enabled && !_prefersReducedMotion();
  }

  function setEnabled(flag) {
    _state.enabled = !!flag;
    if (!_state.enabled) stop();
  }

  function isEnabled() {
    return _state.enabled;
  }

  async function loadManifest() {
    if (_state.manifest) return _state.manifest;
    if (_state.manifestPromise) return _state.manifestPromise;
    _state.manifestPromise = fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        _state.manifest = (json && typeof json === 'object') ? json : {};
        return _state.manifest;
      })
      .catch(() => {
        _state.manifest = {};
        return _state.manifest;
      });
    return _state.manifestPromise;
  }

  function _entrySources(entry) {
    if (!entry) return [];
    if (typeof entry === 'string') return [{ src: entry, type: '' }];
    const sources = [];
    if (Array.isArray(entry.sources)) {
      for (const source of entry.sources) {
        if (typeof source === 'string') sources.push({ src: source, type: '' });
        else if (source?.src) sources.push({ src: source.src, type: source.type || '' });
      }
    }
    if (entry.src) sources.push({ src: entry.src, type: entry.type || '' });
    if (entry.fallback) sources.push({ src: entry.fallback, type: entry.fallbackType || '' });
    return sources.filter((source) => source.src);
  }

  function _sceneConfig(manifest, sceneKey) {
    if (!manifest || !sceneKey) return null;
    if (manifest.scenes?.[sceneKey]) return manifest.scenes[sceneKey];
    if (manifest[sceneKey]) return { clips: manifest[sceneKey] };
    return null;
  }

  function _entryWorldValues(entry) {
    const values = [];
    if (entry?.world) values.push(entry.world);
    if (Array.isArray(entry?.worlds)) values.push(...entry.worlds);
    return values.map((item) => String(item).toLowerCase()).filter(Boolean);
  }

  function _entryMatchesWorld(entry, world) {
    const values = _entryWorldValues(entry);
    if (!world || !values.length || values.includes('any')) return true;
    return values.includes(world);
  }

  function _entryTargetsWorld(entry, world) {
    if (!world) return false;
    return _entryWorldValues(entry).includes(world);
  }

  function _sceneEntries(manifest, sceneKey, context = {}) {
    const cfg = _sceneConfig(manifest, sceneKey);
    const raw = Array.isArray(cfg?.clips) ? cfg.clips : (Array.isArray(cfg?.entries) ? cfg.entries : []);
    const world = String(context.world || context.state?.currentWorld || '').toLowerCase();
    const matches = raw
      .filter((entry) => entry && entry.enabled !== false)
      .filter((entry) => _entryMatchesWorld(entry, world))
      .sort((a, b) => Number(a.sort ?? a.order ?? 0) - Number(b.sort ?? b.order ?? 0));
    const worldSpecific = matches.filter((entry) => _entryTargetsWorld(entry, world));
    return worldSpecific.length ? worldSpecific : matches;
  }

  function _pickSceneEntry(entries) {
    const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!list.length) return null;
    const weighted = list
      .map((entry) => ({ entry, weight: Math.max(0, Number(entry.weight ?? 1)) }))
      .filter((item) => item.weight > 0);
    if (!weighted.length) return list[0];
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.random() * total;
    for (const item of weighted) {
      cursor -= item.weight;
      if (cursor <= 0) return item.entry;
    }
    return weighted[weighted.length - 1].entry;
  }

  function _sceneFit(manifest, sceneKey, entry) {
    const cfg = _sceneConfig(manifest, sceneKey);
    return entry?.fit || cfg?.fit || manifest?.defaults?.fit || 'cover';
  }

  function _campaignSceneForSource(manifest, source) {
    const key = String(source || '');
    return manifest?.triggers?.campaignSources?.[key]
      || DEFAULT_CAMPAIGN_SOURCE_TO_SCENE[key]
      || null;
  }

  function _combatSceneForEntry(manifest, entry) {
    if (!entry || entry.actor?.team !== 'player') return null;
    return manifest?.triggers?.combatLogTypes?.[entry.type]
      || DEFAULT_COMBAT_TYPE_TO_SCENE[entry.type]
      || null;
  }

  function _ensureDom() {
    if (_state.overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'scene-player-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const box = document.createElement('div');
    box.className = 'scene-player-box';

    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('playsinline', '');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'scene-player-close';
    closeBtn.setAttribute('aria-label', 'Close scene');
    closeBtn.textContent = 'x';

    closeBtn.addEventListener('click', () => stop());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) stop();
    });
    video.addEventListener('ended', () => stop());
    video.addEventListener('error', () => {
      window.setTimeout(() => stop(), DEFAULT_HOLD_AFTER_ERROR_MS);
    });

    box.appendChild(video);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    _state.overlay = overlay;
    _state.box = box;
    _state.video = video;
    _state.closeBtn = closeBtn;
  }

  function _clearVideoSources(video) {
    while (video.firstChild) video.removeChild(video.firstChild);
    video.removeAttribute('src');
  }

  function _applyEntryToVideo(video, entry, manifest, sceneKey) {
    _clearVideoSources(video);
    if (entry?.poster) video.poster = entry.poster;
    else video.removeAttribute('poster');
    video.style.objectFit = _sceneFit(manifest, sceneKey, entry);

    const sources = _entrySources(entry);
    if (!sources.length) return false;

    if (sources.length === 1) {
      video.src = sources[0].src;
      return true;
    }

    for (const source of sources) {
      const el = document.createElement('source');
      el.src = source.src;
      if (source.type) el.type = source.type;
      video.appendChild(el);
    }
    return true;
  }

  function _waitForVideoReady(video, timeoutMs) {
    if (video.readyState >= 1) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        resolve(ok);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(false), timeoutMs || 2500);
      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
      try { video.load(); } catch (_) { finish(false); }
    });
  }

  async function play(sceneKey, context = {}, opts = {}) {
    if (!_canShow() || !sceneKey) return false;

    const now = performance.now();
    const throttleMs = Number(opts.throttleMs ?? THROTTLE_MS);
    if (!opts.force && (now - _state.lastPlayAt) < throttleMs) return false;
    if (!opts.force && _state.pending) return false;
    if (!opts.force && _state.overlay?.classList.contains('is-visible')) return false;

    _state.lastPlayAt = now;
    _state.pending = true;

    try {
      const manifest = await loadManifest();
      const entry = _pickSceneEntry(_sceneEntries(manifest, sceneKey, context));
      if (!entry) return false;

      _ensureDom();
      const video = _state.video;
      const hasSource = _applyEntryToVideo(video, entry, manifest, sceneKey);
      if (!hasSource) return false;

      const ready = await _waitForVideoReady(video, Number(opts.readyTimeoutMs || entry.readyTimeoutMs || 2500));
      if (!ready) {
        _clearVideoSources(video);
        return false;
      }

      clearTimeout(_state.activeTimer);
      clearTimeout(_state.hideTimer);
      _state.overlay.dataset.sceneKey = sceneKey;
      _state.overlay.setAttribute('aria-hidden', 'false');
      _state.overlay.classList.add('is-visible');

      const timeoutMs = Math.max(1000, Number(opts.timeoutMs || entry.timeoutMs || DEFAULT_TIMEOUT_MS));
      _state.activeTimer = window.setTimeout(() => stop(), timeoutMs);

      try {
        video.currentTime = 0;
      } catch (_) {}

      try {
        await video.play();
      } catch (_) {
        stop();
        return false;
      }

      void context;
      return true;
    } finally {
      _state.pending = false;
    }
  }

  function stop() {
    clearTimeout(_state.activeTimer);
    clearTimeout(_state.hideTimer);
    _state.activeTimer = 0;
    if (!_state.overlay) return;

    try { _state.video.pause(); } catch (_) {}
    _state.overlay.classList.remove('is-visible');
    _state.overlay.setAttribute('aria-hidden', 'true');
    _state.hideTimer = window.setTimeout(() => {
      if (_state.video) {
        _clearVideoSources(_state.video);
        try { _state.video.load(); } catch (_) {}
      }
    }, 180);
  }

  async function preload(sceneKeys = []) {
    const manifest = await loadManifest();
    for (const key of sceneKeys) {
      const entry = _pickSceneEntry(_sceneEntries(manifest, key));
      const first = _entrySources(entry)[0];
      if (!first?.src) continue;
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = first.src;
      try { video.load(); } catch (_) {}
    }
  }

  async function playForCampaignSource(source, context = {}) {
    const manifest = await loadManifest();
    const sceneKey = _campaignSceneForSource(manifest, source);
    return sceneKey ? play(sceneKey, { ...context, functionKey: source }) : false;
  }

  function wireCampaign() {
    if (_state.campaignUnsub) return _state.campaignUnsub;
    const CS = window.CJS.CampaignState;
    if (!CS?.subscribe) return () => {};

    _state.campaignUnsub = CS.subscribe((nextState, change = {}) => {
      playForCampaignSource(change.source, {
        change,
        state: nextState,
        world: nextState?.currentWorld
      });
    });
    return _state.campaignUnsub;
  }

  async function playForCombatLog(entry = {}) {
    const manifest = await loadManifest();
    const sceneKey = _combatSceneForEntry(manifest, entry);
    return sceneKey ? play(sceneKey, { entry, functionKey: entry.type }) : false;
  }

  function wireCombat() {
    if (_state.combatUnsub) return _state.combatUnsub;
    const Log = window.CJS.CombatLog;
    if (!Log?.subscribe) return () => {};

    _state.combatUnsub = Log.subscribe((entry = {}) => {
      playForCombatLog(entry);
    });
    return _state.combatUnsub;
  }

  function dispose() {
    try { _state.campaignUnsub?.(); } catch (_) {}
    try { _state.combatUnsub?.(); } catch (_) {}
    _state.campaignUnsub = null;
    _state.combatUnsub = null;
    stop();
    if (_state.overlay) {
      try { _state.overlay.remove(); } catch (_) {}
    }
    _state.overlay = null;
    _state.box = null;
    _state.video = null;
    _state.closeBtn = null;
  }

  return Object.freeze({
    loadManifest,
    play,
    playForCampaignSource,
    playForCombatLog,
    stop,
    preload,
    setEnabled,
    isEnabled,
    wireCampaign,
    wireCombat,
    dispose
  });
})();
