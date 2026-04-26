// audio-manager.js
// Singleton audio layer for combat SFX + BGM. Mirrors PortraitPicker:
// loads a manifest, caches assets, exposes play/stop/volume helpers.
// Audio is presentation-only — combat math never depends on it, and a
// missing file or unsupported browser must never break gameplay.
//
// Reads: data/audio-manifest.json
// Used by: combat-ui.js, action-handler.js, damage-calc.js,
//          combat-manager.js, status-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AudioManager = (() => {
  'use strict';

  const SFX_POOL_SIZE = 6;
  const LS_SFX_VOL = 'cjs.audio.sfxVol';
  const LS_BGM_VOL = 'cjs.audio.bgmVol';
  const LS_MUTED   = 'cjs.audio.muted';

  let _manifest = { sfx: {}, bgm: {} };
  let _loaded = false;

  let _sfxPool = [];
  let _sfxIdx  = 0;
  let _bgmEl   = null;
  let _bgmCurrentId = null;

  let _sfxVolume = _readVol(LS_SFX_VOL, 0.7);
  let _bgmVolume = _readVol(LS_BGM_VOL, 0.5);
  let _muted     = _readBool(LS_MUTED, false);

  // ── INIT ──────────────────────────────────────────────────────────
  async function loadManifest() {
    if (_loaded) return _manifest;
    try {
      const response = await fetch('data/audio-manifest.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      _manifest = _normalize(await response.json());
    } catch (error) {
      console.warn('Audio manifest unavailable (non-fatal):', error.message);
      _manifest = _normalize();
    }
    _loaded = true;
    return _manifest;
  }

  function getManifest() { return _manifest; }

  function _normalize(value) {
    return {
      sfx: (value && typeof value.sfx === 'object' && value.sfx) ? { ...value.sfx } : {},
      bgm: (value && typeof value.bgm === 'object' && value.bgm) ? { ...value.bgm } : {}
    };
  }

  function _ensureSfxPool() {
    if (_sfxPool.length) return;
    if (typeof Audio === 'undefined') return;
    for (let i = 0; i < SFX_POOL_SIZE; i++) {
      const a = new Audio();
      a.preload = 'auto';
      _sfxPool.push(a);
    }
  }

  function _ensureBgmEl() {
    if (_bgmEl) return _bgmEl;
    if (typeof Audio === 'undefined') return null;
    _bgmEl = new Audio();
    _bgmEl.loop = true;
    _bgmEl.preload = 'auto';
    return _bgmEl;
  }

  // ── SFX ───────────────────────────────────────────────────────────
  // playSfx(key) → tries the explicit key, then any caller-supplied
  // fallback chain. Silent (no-throw) if no file resolves.
  function playSfx(key, opts) {
    if (_muted) return;
    if (typeof Audio === 'undefined') return;
    const path = _resolveSfxPath(key, opts && opts.fallbacks);
    if (!path) return;
    _ensureSfxPool();
    const slot = _sfxPool[_sfxIdx];
    _sfxIdx = (_sfxIdx + 1) % _sfxPool.length;
    try {
      slot.src = path;
      slot.volume = _clamp01(_sfxVolume * (opts?.volume ?? 1));
      slot.currentTime = 0;
      const p = slot.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* never throw from audio */ }
  }

  function _resolveSfxPath(key, fallbacks) {
    if (!key) return null;
    const keys = [key, ...(Array.isArray(fallbacks) ? fallbacks : [])];
    for (const k of keys) {
      const p = _manifest.sfx?.[k];
      if (p) return p;
    }
    return null;
  }

  // ── BGM ───────────────────────────────────────────────────────────
  // playBgm(idOrPool, { fadeMs, volume })
  //   idOrPool: string id, or array — array picks one entry at random.
  function playBgm(idOrPool, opts) {
    if (typeof Audio === 'undefined') return;
    opts = opts || {};
    const id = _pickBgmId(idOrPool);
    if (!id) { stopBgm(opts); return; }
    const path = _manifest.bgm?.[id];
    if (!path) {
      console.warn('AudioManager: bgm id not found in manifest:', id);
      return;
    }
    if (id === _bgmCurrentId && _bgmEl && !_bgmEl.paused) return;
    const el = _ensureBgmEl();
    if (!el) return;
    _bgmCurrentId = id;
    try {
      el.src = path;
      el.volume = _muted ? 0 : _clamp01(_bgmVolume * (opts.volume ?? 1));
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { /* autoplay policy: needs user gesture; will retry on next gesture */ });
      }
    } catch (e) { /* swallow */ }
  }

  function _pickBgmId(idOrPool) {
    if (!idOrPool) return null;
    if (Array.isArray(idOrPool)) {
      if (!idOrPool.length) return null;
      return idOrPool[Math.floor(Math.random() * idOrPool.length)];
    }
    return String(idOrPool);
  }

  function stopBgm(opts) {
    if (!_bgmEl) return;
    try {
      _bgmEl.pause();
      _bgmEl.currentTime = 0;
    } catch (e) { /* swallow */ }
    _bgmCurrentId = null;
  }

  function getCurrentBgmId() { return _bgmCurrentId; }
  function isBgmPlaying() {
    return !!(_bgmEl && !_bgmEl.paused && !_bgmEl.ended && _bgmCurrentId);
  }

  // ── VOLUME / MUTE ─────────────────────────────────────────────────
  function setVolume(channel, value) {
    const v = _clamp01(value);
    if (channel === 'sfx') {
      _sfxVolume = v;
      _writeNum(LS_SFX_VOL, v);
    } else if (channel === 'bgm') {
      _bgmVolume = v;
      _writeNum(LS_BGM_VOL, v);
      if (_bgmEl) _bgmEl.volume = _muted ? 0 : v;
    }
  }

  function getVolume(channel) {
    return channel === 'sfx' ? _sfxVolume : _bgmVolume;
  }

  function mute(flag) {
    _muted = !!flag;
    _writeBool(LS_MUTED, _muted);
    if (_bgmEl) _bgmEl.volume = _muted ? 0 : _bgmVolume;
  }

  function isMuted() { return _muted; }

  // ── HELPERS ───────────────────────────────────────────────────────
  function _clamp01(v) {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function _readVol(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (raw == null) return fallback;
      const n = parseFloat(raw);
      return isFinite(n) ? _clamp01(n) : fallback;
    } catch (e) { return fallback; }
  }

  function _readBool(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (raw == null) return fallback;
      return raw === '1' || raw === 'true';
    } catch (e) { return fallback; }
  }

  function _writeNum(key, value) {
    try { window.localStorage?.setItem(key, String(value)); } catch (e) { /* private mode */ }
  }

  function _writeBool(key, value) {
    try { window.localStorage?.setItem(key, value ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  return Object.freeze({
    loadManifest,
    getManifest,
    playSfx,
    playBgm,
    stopBgm,
    getCurrentBgmId,
    isBgmPlaying,
    setVolume,
    getVolume,
    mute,
    isMuted
  });
})();
