// l2d-avatar.js
// Tier 3 TS port -> src/engine/ui/l2d-avatar.ts (exports L2DAvatar + installs window.CJS.L2DAvatar). Body verbatim.
// Live2D Cubism 4 viewer wrapper. Lazy-loads PIXI v6 + Live2D Cubism Core +
// pixi-live2d-display from CDN, mounts the model into a target element, and
// exposes a tiny imperative API:
//
//   const av = await window.CJS.L2DAvatar.create(targetEl, { model: 'peri' });
//   av.setExpression('happy');
//   av.playMotion('idle');
//   av.say('Hi there!');         // animates mouth while text is showing
//   av.dispose();
//
// Reads:  assets/live2d/registry.json
// Used by: js/ui/l2d-companion.js (single consumer)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

export const L2DAvatar = (() => {
  'use strict';

  const CDN = {
    pixi:    'https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js',
    core:    'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    display: 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js'
  };

  let _registry = null;
  let _registryPromise = null;
  let _libsPromise = null;

  // ── Library loaders ─────────────────────────────────────────────
  function _loadScript(src) {
    return new Promise<void>((resolve, reject) => {
      // Re-use existing tag if present
      const existing = document.querySelector(`script[data-l2d-src="${src}"]`);
      if (existing && (existing as any).dataset.l2dLoaded === '1') return resolve();
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('script load failed: ' + src)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.l2dSrc = src;
      s.addEventListener('load', () => { s.dataset.l2dLoaded = '1'; resolve(); });
      s.addEventListener('error', () => reject(new Error('script load failed: ' + src)));
      document.head.appendChild(s);
    });
  }

  async function _loadLibs() {
    if (_libsPromise) return _libsPromise;
    _libsPromise = (async () => {
      // PIXI must exist before pixi-live2d-display is parsed.
      await _loadScript(CDN.pixi);
      await _loadScript(CDN.core);
      await _loadScript(CDN.display);
      if (!(window as any).PIXI) throw new Error('PIXI failed to load');
      if (!(window as any).Live2DCubismCore) throw new Error('Live2D Cubism Core failed to load');
      const Live2DModel = (window as any).PIXI.live2d?.Live2DModel;
      if (!Live2DModel) throw new Error('pixi-live2d-display failed to load');
      // pixi-live2d-display ticker registration
      Live2DModel.registerTicker((window as any).PIXI.Ticker);
      return { PIXI: (window as any).PIXI, Live2DModel };
    })();
    return _libsPromise;
  }

  // ── Registry ────────────────────────────────────────────────────
  async function _loadRegistry() {
    if (_registry) return _registry;
    if (_registryPromise) return _registryPromise;
    _registryPromise = fetch('assets/live2d/registry.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('registry http ' + r.status)))
      .then(j => (_registry = j))
      .catch((err) => { console.warn('[L2D] registry load failed:', err.message); _registry = null; throw err; });
    return _registryPromise;
  }

  function getRegistrySync() { return _registry; }

  function _applyStageBackground(targetEl, cfg) {
    targetEl.classList.remove('has-l2d-background');
    targetEl.style.removeProperty('--l2d-background-image');
    targetEl.style.removeProperty('background-position');
    targetEl.style.removeProperty('background-size');

    const src = cfg?.backgroundImage;
    if (!src) return;

    const resolvedSrc = new URL(src, document.baseURI).href;
    const img = new Image();
    img.onload = () => {
      const safeSrc = String(img.currentSrc || img.src || resolvedSrc).replace(/"/g, '\\"');
      targetEl.style.setProperty('--l2d-background-image', `url("${safeSrc}")`);
      targetEl.style.backgroundPosition = cfg.backgroundPosition || 'center';
      targetEl.style.backgroundSize = cfg.backgroundFit || 'cover';
      targetEl.classList.add('has-l2d-background');
    };
    img.src = resolvedSrc;
  }

  // ── Public: create() returns an instance bound to a DOM target ──
  async function create(targetEl, opts: any = {}) {
    if (!targetEl) throw new Error('L2DAvatar.create: targetEl required');

    const reg = await _loadRegistry();
    const modelKey = opts.model || reg.default;
    const cfg = reg.models[modelKey];
    if (!cfg) throw new Error('L2D model not found: ' + modelKey);

    const { PIXI, Live2DModel } = await _loadLibs();

    // Build canvas + Pixi app sized to the target.
    _applyStageBackground(targetEl, cfg);
    const canvas = document.createElement('canvas');
    canvas.className = 'l2d-canvas';
    targetEl.innerHTML = '';
    targetEl.appendChild(canvas);

    const app = new PIXI.Application({
      view: canvas,
      autoStart: true,
      resizeTo: targetEl,
      backgroundAlpha: 0,
      antialias: true,
      powerPreference: 'low-power'
    });

    let model = null;
    let disposed = false;

    try {
      model = await Live2DModel.from(cfg.path, { autoInteract: false });
    } catch (err) {
      console.error('[L2D] model load failed:', err);
      throw err;
    }

    if (disposed) { try { model.destroy(); } catch (_) {} return _stubInstance(); }

    app.stage.addChild(model);

    const initialParameters = cfg.initialParameters || {};
    const lockedParameters = cfg.lockedParameters || {};
    const hasInitialParameters = initialParameters && typeof initialParameters === 'object' && Object.keys(initialParameters).length > 0;
    const hasLockedParameters = lockedParameters && typeof lockedParameters === 'object' && Object.keys(lockedParameters).length > 0;

    function applyParameters(parameters) {
      if (!parameters || typeof parameters !== 'object') return;
      const coreModel = model.internalModel?.coreModel;
      for (const [id, value] of Object.entries<any>(parameters)) {
        const n = Number(value);
        if (coreModel && Number.isFinite(n)) {
          try { coreModel.setParameterValueById(id, n); } catch (_) {}
        }
      }
    }
    function applyConfiguredParameters() {
      applyParameters(initialParameters);
      applyParameters(lockedParameters);
    }
    const applyLockedParameters = () => applyParameters(lockedParameters);
    applyConfiguredParameters();
    if (hasInitialParameters || hasLockedParameters) {
      requestAnimationFrame(applyConfiguredParameters);
      setTimeout(applyConfiguredParameters, 150);
    }
    if (hasLockedParameters) {
      const priority = (window as any).PIXI.UPDATE_PRIORITY?.LOW ?? -25;
      app.ticker.add(applyLockedParameters, undefined, priority);
      (window as any).PIXI.Ticker.shared.add(applyLockedParameters, undefined, priority);
    }

    // Layout: scale model so its height ~= 95% of target height, anchored to
    // bottom-center so feet sit at the dock floor.
    function layoutModel() {
      if (!model || !targetEl) return;
      const w = targetEl.clientWidth || 280;
      const h = targetEl.clientHeight || 480;
      const baseScale = (cfg.scale || 0.18) * (opts.scaleMultiplier || 1.0);
      // Try to make the model fit by using its internal width/height if
      // available; otherwise just trust the configured scale.
      const mw = model.internalModel?.width || model.width || 1024;
      const mh = model.internalModel?.height || model.height || 1024;
      const fit = Math.min(w / mw, h / mh) * (opts.fitBoost || 1.6);
      const s = Math.max(0.05, Math.min(baseScale, fit || baseScale));
      model.scale.set(s);
      model.anchor.set(0.5, 1.0);
      const offsetX = opts.offsetX ?? cfg.offsetX ?? 0;
      const offsetY = opts.offsetY ?? cfg.offsetY ?? 0;
      model.x = w / 2 + offsetX * w;
      model.y = h * (1.0 + offsetY);
    }
    layoutModel();
    const ro = new ResizeObserver(layoutModel);
    ro.observe(targetEl);

    // Eye-tracking the mouse pointer (on the page).
    function onPointerMove(e) {
      if (!model) return;
      const rect = targetEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / Math.max(1, window.innerWidth / 2);
      const dy = (e.clientY - cy) / Math.max(1, window.innerHeight / 2);
      try { model.focus?.(dx, dy); } catch (_) {}
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // ── Expression / motion / mouth helpers ────────────────────────
    const expressionMap = cfg.expressions || {};
    const motionMap = cfg.motions || {};

    function setExpression(key) {
      try {
        const id = expressionMap[key];
        if (id == null) {
          // null = neutral; reset
          model.internalModel?.motionManager?.expressionManager?.resetExpression?.();
        } else {
          model.expression(id);
        }
      } catch (e) { console.warn('[L2D] setExpression failed:', e); }
      applyConfiguredParameters();
    }

    function playMotion(key) {
      try {
        const m = motionMap[key];
        if (!m) return;
        model.motion(m.group ?? '', m.index ?? 0, (window as any).PIXI.live2d.MotionPriority?.NORMAL ?? 2);
      } catch (e) { console.warn('[L2D] playMotion failed:', e); }
      applyConfiguredParameters();
    }

    // ── Manual lip-sync: bob ParamMouthOpenY while a phrase is "speaking" ──
    let _mouthRaf = null;
    let _mouthEndAt = 0;
    function _drawMouth(open) {
      try {
        const cm = model.internalModel?.coreModel;
        if (!cm) return;
        if (typeof cm.setParameterValueById === 'function') {
          cm.setParameterValueById('ParamMouthOpenY', open);
          cm.setParameterValueById('ParamMouthForm', 0.5 + open * 0.4);
        }
      } catch (_) {}
    }
    function speakFor(ms) {
      if (_mouthRaf) cancelAnimationFrame(_mouthRaf);
      const start = performance.now();
      _mouthEndAt = start + ms;
      const tick = (now) => {
        if (now >= _mouthEndAt) { _drawMouth(0); _mouthRaf = null; return; }
        const elapsed = now - start;
        const remaining = Math.max(0, _mouthEndAt - now);
        const fade = Math.min(1, elapsed / 180, remaining / 220);
        const syllable = 0.5 + 0.5 * Math.sin((elapsed / 185) * Math.PI * 2);
        const softVariation = 0.5 + 0.5 * Math.sin((elapsed / 430) * Math.PI * 2 + 0.8);
        const open = fade * (0.08 + syllable * 0.42 + softVariation * 0.12);
        _drawMouth(open);
        _mouthRaf = requestAnimationFrame(tick);
      };
      _mouthRaf = requestAnimationFrame(tick);
    }
    function silence() {
      if (_mouthRaf) { cancelAnimationFrame(_mouthRaf); _mouthRaf = null; }
      _drawMouth(0);
    }

    function dispose() {
      disposed = true;
      try { ro.disconnect(); } catch (_) {}
      window.removeEventListener('pointermove', onPointerMove);
      if (hasLockedParameters) {
        try { app.ticker.remove(applyLockedParameters); } catch (_) {}
        try { (window as any).PIXI.Ticker.shared.remove(applyLockedParameters); } catch (_) {}
      }
      silence();
      try { app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch (_) {}
      try { targetEl.innerHTML = ''; } catch (_) {}
    }

    // Optional click reaction
    targetEl.addEventListener('click', () => {
      const reactions = cfg.reactions || {};
      if (!reactions.click) return;
      try { window.dispatchEvent(new CustomEvent('l2d:click')); } catch (_) {}
    });

    return Object.freeze({
      cfg,
      app,
      model,
      setExpression,
      playMotion,
      speakFor,
      silence,
      relayout: layoutModel,
      dispose
    });
  }

  function _stubInstance() {
    return Object.freeze({
      cfg: null, app: null, model: null,
      setExpression() {}, playMotion() {}, speakFor() {}, silence() {},
      relayout() {}, dispose() {}
    });
  }

  return Object.freeze({ create, getRegistrySync, _loadRegistry: _loadRegistry });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.L2DAvatar = L2DAvatar;
