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

  // WebAudio fallback: when the manifest has no MP3 for a key, synthesize
  // a short tone instead so the system is audible out of the box.
  let _audioCtx = null;
  let _emptyManifestNoticeShown = false;

  // Built-in fallback tones. Each entry is either:
  //   { f, d, t }                       — single oscillator
  //   { multi: [{f,d,t,delay?,slide?}] } — multi-osc layered/sequenced
  //   { noise: { d, hp, lp, decay } }   — noise burst (for slashes/etc)
  // Keys match the SFX keys playSfx() resolves.
  const FALLBACK_TONES = {
    // ── Weapon strikes by physical damageType ──
    weapon_slash:         { noise: { d: 130, hp: 1800, lp: 6000, decay: 110 } },
    weapon_pierce:        { f: 1400, d: 70,  t: 'square',   slide: 600 },
    weapon_blunt:         { f: 90,   d: 180, t: 'sine',     bend: -30 },
    weapon_hit_physical:  { f: 220,  d: 90,  t: 'square'   },

    // ── Weapon strikes by element ──
    weapon_hit_fire:      { multi: [
                            { noise: { d: 90, hp: 600, lp: 4000, decay: 80 } },
                            { f: 380, d: 110, t: 'sawtooth', delay: 20 }] },
    weapon_hit_ice:       { f: 1400, d: 110, t: 'triangle', bend: -800 },
    weapon_hit_lightning: { multi: [
                            { f: 2400, d: 40, t: 'sawtooth' },
                            { noise: { d: 120, hp: 4000, lp: 9000, decay: 100 }, delay: 10 }] },
    weapon_hit_water:     { f: 520,  d: 110, t: 'sine',     bend: -200 },
    weapon_hit_wind:      { noise: { d: 220, hp: 800, lp: 3000, decay: 200 } },
    weapon_hit_earth:     { f: 70,   d: 220, t: 'square',   bend: -20 },
    weapon_hit_holy:      { multi: [
                            { f: 880,  d: 200, t: 'sine' },
                            { f: 1320, d: 200, t: 'sine', delay: 30 },
                            { f: 1760, d: 200, t: 'sine', delay: 60 }] },
    weapon_hit_dark:      { multi: [
                            { f: 110,  d: 240, t: 'sawtooth' },
                            { f: 138,  d: 240, t: 'sawtooth', delay: 20 }] },

    // ── Magic ──
    magic_cast:           { multi: [
                            { f: 440, d: 200, t: 'triangle' },
                            { f: 660, d: 200, t: 'triangle', delay: 60 },
                            { f: 990, d: 200, t: 'triangle', delay: 120 }] },
    magic_hit:            { f: 990, d: 160, t: 'triangle', bend: 200 },
    magic_fire:           { multi: [
                            { noise: { d: 180, hp: 200, lp: 3000, decay: 160 } },
                            { f: 220, d: 200, t: 'sawtooth', delay: 30, bend: 100 }] },
    magic_ice:            { multi: [
                            { f: 1760, d: 200, t: 'triangle' },
                            { f: 1320, d: 200, t: 'triangle', delay: 50 }] },
    magic_lightning:      { multi: [
                            { noise: { d: 60,  hp: 4000, lp: 9000, decay: 50 } },
                            { f: 3000, d: 50,  t: 'sawtooth', delay: 0 },
                            { noise: { d: 180, hp: 1500, lp: 6000, decay: 160 }, delay: 70 }] },
    magic_holy:           { multi: [
                            { f: 1320, d: 320, t: 'sine' },
                            { f: 1760, d: 320, t: 'sine', delay: 80 },
                            { f: 2640, d: 320, t: 'sine', delay: 160 }] },
    magic_dark:           { multi: [
                            { f: 220,  d: 280, t: 'sawtooth' },
                            { f: 165,  d: 280, t: 'sawtooth', delay: 60 },
                            { f: 110,  d: 280, t: 'sawtooth', delay: 120 }] },

    // ── Combat events ──
    critical:             { multi: [
                            { f: 1500, d: 90, t: 'square' },
                            { f: 2000, d: 90, t: 'square', delay: 30 },
                            { f: 2500, d: 90, t: 'square', delay: 60 }] },
    miss:                 { f: 600,  d: 100, t: 'sine',     bend: -300 },
    dodge:                { noise: { d: 90, hp: 2000, lp: 7000, decay: 80 } },
    defend:               { f: 200,  d: 140, t: 'square',   bend: 80 },
    heal:                 { multi: [
                            { f: 660,  d: 220, t: 'sine' },
                            { f: 990,  d: 220, t: 'sine', delay: 60 }] },
    victory:              { multi: [
                            { f: 523,  d: 180, t: 'square' },
                            { f: 659,  d: 180, t: 'square', delay: 100 },
                            { f: 784,  d: 240, t: 'square', delay: 200 },
                            { f: 1047, d: 320, t: 'square', delay: 320 }] },
    defeat:               { multi: [
                            { f: 330,  d: 280, t: 'sawtooth' },
                            { f: 247,  d: 280, t: 'sawtooth', delay: 100 },
                            { f: 165,  d: 360, t: 'sawtooth', delay: 220 }] },
    level_up:             { multi: [
                            { f: 784,  d: 100, t: 'square' },
                            { f: 988,  d: 100, t: 'square', delay: 60 },
                            { f: 1175, d: 100, t: 'square', delay: 120 },
                            { f: 1568, d: 200, t: 'square', delay: 180 }] },

    // ── Items + statuses ──
    item_use:             { f: 740, d: 140, t: 'sine'   },
    item_potion:          { multi: [
                            { f: 660, d: 90, t: 'sine' },
                            { f: 880, d: 90, t: 'sine', delay: 70 }] },
    item_buff:            { multi: [
                            { f: 440, d: 80, t: 'triangle' },
                            { f: 660, d: 80, t: 'triangle', delay: 60 },
                            { f: 880, d: 80, t: 'triangle', delay: 120 }] },
    item_throw:           { noise: { d: 200, hp: 400, lp: 2500, decay: 180 } },
    ko:                   { f: 110, d: 280, t: 'sawtooth', bend: -50 },
    status_apply:         { f: 540, d: 120, t: 'square'  },
    status_buff:          { f: 660, d: 120, t: 'triangle', bend: 200 },
    status_debuff:        { f: 220, d: 140, t: 'sawtooth', bend: -80 },

    // ── UI ──
    ui_click:             { f: 1200, d: 40, t: 'sine'   },
    ui_cursor:            { f: 800,  d: 30, t: 'sine'   },
    ui_confirm:           { multi: [
                            { f: 880,  d: 60, t: 'square' },
                            { f: 1320, d: 60, t: 'square', delay: 40 }] },
    ui_cancel:            { f: 440,  d: 80, t: 'square', bend: -150 },
    ui_error:             { multi: [
                            { f: 200, d: 80, t: 'square' },
                            { f: 200, d: 80, t: 'square', delay: 90 }] }
  };

  function _ensureAudioCtx() {
    if (_audioCtx) return _audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { _audioCtx = new Ctor(); } catch (e) { _audioCtx = null; }
    return _audioCtx;
  }

  function _playToneVoice(ctx, voice, baseTime, gainScale) {
    const peakRaw = _clamp01(_sfxVolume * (gainScale || 1)) * 0.18;
    const start = baseTime + (voice.delay || 0) / 1000;

    if (voice.noise) {
      // Noise burst with band-pass-ish shaping
      const n = voice.noise;
      const dur = n.d / 1000;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = n.hp || 800;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = n.lp || 6000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peakRaw, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (n.decay || n.d) / 1000);
      src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
      src.start(start);
      src.stop(start + dur + 0.05);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = voice.t || 'sine';
    osc.frequency.setValueAtTime(voice.f, start);
    if (voice.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.slide), start + voice.d / 1000);
    if (voice.bend)  osc.frequency.linearRampToValueAtTime(Math.max(20, voice.f + voice.bend), start + voice.d / 1000);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakRaw, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.d / 1000);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + voice.d / 1000 + 0.05);
  }

  function _playFallbackTone(key, gainScale) {
    const tone = FALLBACK_TONES[key];
    if (!tone) return;
    const ctx = _ensureAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (tone.multi) {
        for (const v of tone.multi) _playToneVoice(ctx, v, now, gainScale);
      } else {
        _playToneVoice(ctx, tone, now, gainScale);
      }
    } catch (e) { /* swallow */ }
  }

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
  // fallback chain. If no MP3 is registered, plays a synthesized
  // WebAudio tone so the system is audible without uploaded files.
  function playSfx(key, opts) {
    if (_muted) return;
    const candidates = [key, ...(Array.isArray(opts?.fallbacks) ? opts.fallbacks : [])];
    const path = _resolveSfxPath(candidates);
    if (path && typeof Audio !== 'undefined') {
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
      return;
    }
    // Fallback: synthesize a tone for the first candidate that has one.
    _showEmptyManifestNoticeOnce();
    for (const k of candidates) {
      if (FALLBACK_TONES[k]) { _playFallbackTone(k, opts?.volume ?? 1); return; }
    }
  }

  function _resolveSfxPath(candidates) {
    if (!candidates) return null;
    for (const k of candidates) {
      if (!k) continue;
      const p = _manifest.sfx?.[k];
      if (p) return p;
    }
    return null;
  }

  function _showEmptyManifestNoticeOnce() {
    if (_emptyManifestNoticeShown) return;
    const sfxCount = Object.keys(_manifest.sfx || {}).length;
    const bgmCount = Object.keys(_manifest.bgm || {}).length;
    if (sfxCount === 0 && bgmCount === 0) {
      _emptyManifestNoticeShown = true;
      console.info(
        '[CJS Audio] No MP3s registered in data/audio-manifest.json — '
        + 'using synthesized fallback tones. Upload your own MP3s via '
        + 'Editor → Audio Library to replace them.'
      );
    }
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
