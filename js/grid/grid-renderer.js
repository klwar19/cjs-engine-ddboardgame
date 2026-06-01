// grid-renderer.js
// Draws the combat grid, units, terrain, movement highlights, AoE
// previews, and handles click/tap for movement and targeting.
//
// Uses a <canvas> element for rendering. Manages its own animation
// loop for smooth highlight pulsing and unit hover effects.
//
// Reads: GridEngine (spatial data), constants.js (terrain/element colors)
// Used by: combat-ui.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.GridRenderer = (() => {
  'use strict';

  const GE = () => window.CJS.GridEngine;
  const C  = () => window.CJS.CONST;

  // ── STATE ──────────────────────────────────────────────────────────
  let _canvas = null;
  let _ctx = null;
  let _cellSize = 64;
  let _baseCellSize = 64;      // size before zoom multiplier (auto-fit)
  let _zoom = 1.0;             // user-controlled zoom multiplier
  let _width = 8;
  let _height = 8;
  let _animFrame = null;
  let _hoverCell = null;       // { r, c } under cursor
  let _selectedUnit = null;    // unit instanceId
  let _highlights = new Map(); // "r,c" → { color, alpha, type }
  let _onCellClick = null;     // callback(r, c, event)
  let _onCellHover = null;     // callback(r, c)
  let _pulsePhase = 0;         // 0–2π for pulsing highlights
  let _lastDamageFloats = [];  // [{ x, y, text, color, birth, dur }]
  let _ready = false;          // true after resize() — safe to render
  let _themeImg = null;        // optional themed backdrop image
  let _decorSeed = 0x9E3779B1; // PRNG seed for stable per-cell decorations
  let _detachGestures = null;  // touch-gestures detach handle
  let _pinchUpHandler = null;  // pointerup listener that resets pinch state
  let _tileAtlasImg = null;    // generated combat terrain atlas
  let _tileAtlasReady = false;
  let _tileAtlasFailed = false;
  let _loopPaused = false;

  const TILE_ATLAS_SRC = 'assets/combat/combat_tile_atlas.png';
  const TILE_ATLAS_MAP = {
    empty: [0, 0], floor: [0, 0], stone: [0, 0], path: [0, 0],
    grass: [1, 0], forest: [1, 0], tree: [1, 0],
    water: [2, 0], river: [2, 0],
    wall: [3, 0], obstacle: [3, 0], pillar: [3, 0],
    high_ground: [0, 1], cliff: [1, 1], pit: [1, 1],
    barrel: [2, 1], lava: [3, 1], fire_zone: [3, 1],
    ice_zone: [0, 2], ice: [0, 2], snow: [0, 2],
    poison_zone: [1, 2], swamp: [1, 2],
    heal_zone: [2, 2], holy: [2, 2],
    dark: [3, 2],
    mud: [0, 3], dirt: [0, 3],
    thorns: [1, 3],
    electric: [2, 3], lightning: [2, 3],
    wind: [3, 3]
  };

  // Movement animations. Keyed by instanceId. When set, the unit is drawn
  // at an interpolated position between `from` and `to` until `endTs`.
  // After that the entry is removed and the unit is drawn at its real
  // logical position again. We never write back to the unit — this is
  // purely visual.
  const _moveAnims = new Map(); // instanceId → { from:[r,c], to:[r,c], startTs, endTs }

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.15;

  // ── INIT ──────────────────────────────────────────────────────────
  function init(canvasEl, opts) {
    _canvas = canvasEl;
    _ctx = _canvas.getContext('2d');
    _cellSize = opts?.cellSize || 64;
    _baseCellSize = _cellSize;
    _zoom = 1.0;
    _onCellClick = opts?.onCellClick || null;
    _onCellHover = opts?.onCellHover || null;
    _loopPaused = false;
    _ensureTileAtlas();

    // Attach events
    _canvas.addEventListener('click', _handleClick);
    _canvas.addEventListener('mousemove', _handleHover);
    _canvas.addEventListener('mouseleave', () => { _hoverCell = null; });
    _canvas.addEventListener('touchstart', _handleTouch, { passive: false });

    // Touch gestures: pinch-zoom on iPad / phone. We only opt in if the
    // helper module is present; otherwise we still support the legacy
    // tap-to-click path. Tap is handled by 'click' fallback through the
    // browser's synthetic click event.
    _detachGestures = null;
    _pinchUpHandler = null;
    const TG = window.CJS.TouchGestures;
    if (TG?.attach) {
      _canvas.classList.add('cjs-touch-grid');
      let pinchAccumulator = 1.0;
      let pinchActive = false;
      _detachGestures = TG.attach(_canvas, {
        onPinch: ({ scale }) => {
          if (!pinchActive) {
            pinchAccumulator = _zoom;
            pinchActive = true;
          }
          pinchAccumulator *= scale;
          setZoom(pinchAccumulator);
        },
        onDoubleTap: () => {
          // Quick reset zoom on double-tap (common iPad expectation).
          resetZoom();
        }
      });
      _pinchUpHandler = () => { pinchActive = false; };
      _canvas.addEventListener('pointerup', _pinchUpHandler);
    }

    _startLoop();
  }

  function resize() {
    const dims = GE().getDims();
    _width = dims.width;
    _height = dims.height;

    // Determine the auto-fit base cell size from the container.
    // Zoom is applied as a multiplier on top so the user can zoom past auto-fit.
    const container = _canvas.parentElement;
    if (container) {
      const maxW = container.clientWidth - 4;
      const maxH = container.clientHeight - 4;
      let fit = Math.floor(Math.min(maxW / _width, maxH / _height, 80));
      fit = Math.max(fit, 32); // minimum
      _baseCellSize = fit;
    }

    _applyCellSize();
  }

  function _applyCellSize() {
    if (!_canvas || !_ctx) return;
    _cellSize = Math.max(16, Math.floor(_baseCellSize * _zoom));
    const dpr = window.devicePixelRatio || 1;
    _canvas.width = _width * _cellSize * dpr;
    _canvas.height = _height * _cellSize * dpr;
    _canvas.style.width = (_width * _cellSize) + 'px';
    _canvas.style.height = (_height * _cellSize) + 'px';
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _ready = true;
  }

  function setZoom(value) {
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(value) || 1));
    if (Math.abs(next - _zoom) < 0.001) return _zoom;
    _zoom = next;
    _applyCellSize();
    return _zoom;
  }

  function zoomIn() { return setZoom(_zoom + ZOOM_STEP); }
  function zoomOut() { return setZoom(_zoom - ZOOM_STEP); }
  function resetZoom() { return setZoom(1.0); }
  function getZoom() { return _zoom; }
  function getZoomBounds() { return { min: ZOOM_MIN, max: ZOOM_MAX, step: ZOOM_STEP }; }

  function destroy() {
    setPaused(true);
    if (_canvas) {
      _canvas.removeEventListener('click', _handleClick);
      _canvas.removeEventListener('mousemove', _handleHover);
      _canvas.removeEventListener('touchstart', _handleTouch);
    }
    if (_detachGestures) {
      try { _detachGestures(); } catch (e) {}
      _detachGestures = null;
    }
    if (_pinchUpHandler && _canvas) {
      _canvas.removeEventListener('pointerup', _pinchUpHandler);
      _pinchUpHandler = null;
    }
    _canvas = null;
    _ctx = null;
    _ready = false;
    _loopPaused = false;
    _moveAnims.clear();
  }

  function setPaused(paused) {
    const next = !!paused;
    if (next) {
      _loopPaused = true;
      if (_animFrame) {
        cancelAnimationFrame(_animFrame);
        _animFrame = null;
      }
      return;
    }
    if (!_loopPaused && _animFrame) return;
    _loopPaused = false;
    _startLoop();
  }

  function isPaused() {
    return _loopPaused;
  }

  // ── HIGHLIGHT API ─────────────────────────────────────────────────
  function setHighlights(cells, color, type) {
    // cells: [{ r, c }] or Set of "r,c" strings
    clearHighlights(type);
    if (!cells) return;
    const arr = cells instanceof Set
      ? [...cells].map(s => { const [r,c] = s.split(','); return { r: +r, c: +c }; })
      : Array.isArray(cells) ? cells : [];
    for (const { r, c } of arr) {
      _highlights.set(`${r},${c}`, { color, alpha: 0.35, type: type || 'generic' });
    }
  }

  function clearHighlights(type) {
    if (!type) { _highlights.clear(); return; }
    for (const [key, val] of _highlights) {
      if (val.type === type) _highlights.delete(key);
    }
  }

  function setSelectedUnit(unitId) {
    _selectedUnit = unitId;
  }

  // ── MOVEMENT ANIMATION ─────────────────────────────────────────────
  // Tell the renderer that a unit is sliding from `from` to `to` over
  // `durationMs`. Until the animation ends the unit is drawn at the
  // interpolated position regardless of its logical pos. Idempotent: a
  // second call replaces any in-flight animation for the same unit.
  function animateUnitMove(unitId, from, to, durationMs) {
    if (!unitId || !Array.isArray(from) || !Array.isArray(to)) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dur = Math.max(40, Number(durationMs) || 320);
    _moveAnims.set(unitId, {
      from: [Number(from[0]), Number(from[1])],
      to:   [Number(to[0]),   Number(to[1])],
      startTs: now,
      endTs: now + dur
    });
  }

  function _activeMovePos(unitId, ts) {
    const anim = _moveAnims.get(unitId);
    if (!anim) return null;
    if (ts >= anim.endTs) {
      _moveAnims.delete(unitId);
      return null;
    }
    const raw = (ts - anim.startTs) / (anim.endTs - anim.startTs);
    const t = Math.max(0, Math.min(1, raw));
    // ease-in-out (smoothstep) so the step doesn't look mechanical
    const e = t * t * (3 - 2 * t);
    return [
      anim.from[0] + (anim.to[0] - anim.from[0]) * e,
      anim.from[1] + (anim.to[1] - anim.from[1]) * e,
      e
    ];
  }

  function clearMoveAnimations() {
    _moveAnims.clear();
  }

  // ── DAMAGE FLOATS ─────────────────────────────────────────────────
  function addDamageFloat(r, c, text, color) {
    const x = c * _cellSize + _cellSize / 2;
    const y = r * _cellSize + _cellSize / 4;
    _lastDamageFloats.push({
      x, y, text: String(text), color: color || '#ff4444',
      birth: performance.now(), dur: 1200
    });
  }

  // ── RENDER LOOP ───────────────────────────────────────────────────
  function _startLoop() {
    if (_loopPaused || _animFrame || !_canvas) return;
    function frame(ts) {
      _animFrame = null;
      if (_loopPaused || !_canvas) return;
      _pulsePhase = (ts / 600) % (Math.PI * 2);
      _render(ts);
      _animFrame = requestAnimationFrame(frame);
    }
    _animFrame = requestAnimationFrame(frame);
  }

  function _render(ts) {
    if (!_ctx || !_canvas || !_ready) return;
    const ctx = _ctx;
    const cs = _cellSize;

    ctx.clearRect(0, 0, _width * cs, _height * cs);

    // ── BACKGROUND ─────────────────────────────────────────────────
    // Themed atmospheric backdrop painted under everything.
    if (_themeImg && _themeImg.complete && _themeImg.naturalWidth > 0) {
      ctx.globalAlpha = 0.38;
      ctx.drawImage(_themeImg, 0, 0, _width * cs, _height * cs);
      ctx.globalAlpha = 1;
    } else {
      // Soft gradient fallback so we never sit on flat black.
      const grad = ctx.createRadialGradient(_width * cs / 2, _height * cs / 2, cs, _width * cs / 2, _height * cs / 2, _width * cs);
      grad.addColorStop(0, '#1d2532');
      grad.addColorStop(1, '#0a0e16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, _width * cs, _height * cs);
    }

    // ── TERRAIN ─────────────────────────────────────────────────────
    // Two passes so elevation drop-shadows always paint UNDER the raised
    // neighbour, never on top of it. First pass paints the terrain proper;
    // second pass overlays edge bevels + elevation cast shadows + icons.
    for (let r = 0; r < _height; r++) {
      for (let c = 0; c < _width; c++) {
        const terrain = GE().getTerrain(r, c);
        const tData = C().TERRAIN_TYPES[terrain] || C().TERRAIN_TYPES.empty;
        const x = c * cs;
        const y = r * cs;
        const seed = _cellRand(r, c);

        // Cell background — vertical gradient gives subtle depth so cells
        // feel like physical tiles rather than flat swatches.
        const bg = tData.color || '#1a1a2e';
        _paintCellBase(ctx, x, y, cs, bg, terrain);

        // Procedural decoration per terrain kind. This is what makes
        // the grid feel like an RPG floor instead of a chess board.
        _drawTerrainDecor(ctx, terrain, x, y, cs, seed, ts);
      }
    }

    // Second pass: bevels + elevation cast shadows + glyph overlay.
    for (let r = 0; r < _height; r++) {
      for (let c = 0; c < _width; c++) {
        const terrain = GE().getTerrain(r, c);
        const tData = C().TERRAIN_TYPES[terrain] || C().TERRAIN_TYPES.empty;
        const x = c * cs;
        const y = r * cs;
        _paintCellEdges(ctx, x, y, cs, tData);
        _paintElevationShadow(ctx, r, c, x, y, cs);

        // Terrain icon glyph (kept for clarity beside the decoration).
        // Hidden for the brand-new "atmospheric" terrains where the
        // drawn art already carries the read.
        if (tData.icon && !_iconHiddenForTerrain(terrain)) {
          ctx.font = `${Math.floor(cs * 0.3)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#fff';
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 3;
          ctx.fillText(tData.icon, x + cs / 2, y + cs * 0.5);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }
    }

    // ── HIGHLIGHTS ──────────────────────────────────────────────────
    const pulse = 0.2 + Math.sin(_pulsePhase) * 0.15;
    for (const [key, hl] of _highlights) {
      const [r, c] = key.split(',').map(Number);
      const x = c * cs;
      const y = r * cs;
      ctx.fillStyle = hl.color;
      ctx.globalAlpha = hl.type === 'move' ? pulse : hl.alpha;
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ctx.globalAlpha = 1;
    }

    // ── HOVER CELL ──────────────────────────────────────────────────
    if (_hoverCell) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(_hoverCell.c * cs + 1, _hoverCell.r * cs + 1, cs - 2, cs - 2);
    }

    // ── UNITS ───────────────────────────────────────────────────────
    const allUnits = GE().getAllUnits();
    for (const unit of allUnits) {
      if (!unit.pos || unit.currentHP <= 0) continue;
      _drawUnit(ctx, unit, ts);
    }

    // ── DAMAGE FLOATS ───────────────────────────────────────────────
    const now = performance.now();
    _lastDamageFloats = _lastDamageFloats.filter(f => now - f.birth < f.dur);
    for (const f of _lastDamageFloats) {
      const progress = (now - f.birth) / f.dur;
      const alpha = 1 - progress;
      const yOff = progress * 30;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${Math.floor(cs * 0.3)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y - yOff);
      ctx.globalAlpha = 1;
    }
  }

  function _drawUnit(ctx, unit, ts) {
    const cs = _cellSize;
    const fp = C().UNIT_SIZES[unit.size || '1x1'] || { w: 1, h: 1 };

    // Pull the drawn position from the active move animation when present
    // so the unit slides between cells. The unit's logical pos already
    // reflects the destination — we only override the screen position.
    let drawR = unit.pos[0];
    let drawC = unit.pos[1];
    let moveT = 0;
    const animPos = _activeMovePos(unit.instanceId, ts);
    if (animPos) {
      drawR = animPos[0];
      drawC = animPos[1];
      moveT = animPos[2];
    }

    const px = drawC * cs;
    const py = drawR * cs;
    const pw = fp.w * cs;
    const ph = fp.h * cs;

    // Subtle vertical bob during the slide so it feels like a step, not a glide.
    const bob = moveT > 0 ? -Math.sin(moveT * Math.PI) * cs * 0.06 : 0;
    const py2 = py + bob;

    // Selection ring (drawn at the logical pos when animating to avoid jitter
    // following the bob).
    const isSelected = unit.instanceId === _selectedUnit;
    if (isSelected) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 2, py2 + 2, pw - 4, ph - 4);
    }

    // Team color background
    const teamColor = unit.team === 'player'
      ? 'rgba(59, 130, 246, 0.3)'
      : 'rgba(239, 68, 68, 0.3)';
    ctx.fillStyle = teamColor;
    ctx.fillRect(px + 3, py2 + 3, pw - 6, ph - 6);

    const PP = window.CJS.PortraitPicker;
    let drewPortrait = false;
    if (unit.portrait && PP) {
      const img = PP.getCachedImage(unit.portrait);
      if (img && img.complete && img.naturalWidth > 0) {
        const pad = 4;
        ctx.save();
        ctx.beginPath();
        ctx.rect(px + pad, py2 + pad, pw - (pad * 2), ph - (pad * 2));
        ctx.clip();
        const drew = PP.drawPortraitToCanvas
          ? PP.drawPortraitToCanvas(ctx, img, px + pad, py2 + pad, pw - (pad * 2), ph - (pad * 2), unit.portraitFocus)
          : false;
        if (!drew) {
          ctx.drawImage(img, px + pad, py2 + pad, pw - (pad * 2), ph - (pad * 2));
        }
        ctx.restore();
        drewPortrait = true;
      }
    }

    if (!drewPortrait) {
      const icon = unit.icon || (unit.team === 'player' ? '🟦' : '🟥');
      const fontSize = Math.floor(Math.min(pw, ph) * 0.55);
      ctx.font = `${fontSize}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, px + pw / 2, py2 + ph / 2);
    }

    // ── FACING CHEVRON ────────────────────────────────────────────
    // Drawn AFTER the portrait so the indicator sits on top of the
    // unit art. This is functional: players read flank arcs from it.
    _drawFacingChevron(ctx, unit, px, py2, pw, ph, cs);

    // Name label
    ctx.font = `bold ${Math.floor(cs * 0.17)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(
      (unit.name || unit.baseId || '?').substring(0, 8),
      px + pw / 2, py2 + ph - cs * 0.1
    );

    // HP bar
    const barW = pw - 8;
    const barH = Math.max(4, cs * 0.06);
    const barX = px + 4;
    const barY = py2 + 3;
    const hpRatio = Math.max(0, Math.min(1, unit.currentHP / (unit.maxHP || 1)));

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, barY, barW, barH);

    const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.2 ? '#eab308' : '#ef4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    // MP bar (smaller, below HP)
    if (unit.maxMP > 0) {
      const mpBarY = barY + barH + 1;
      const mpRatio = Math.max(0, Math.min(1, (unit.currentMP || 0) / unit.maxMP));
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, mpBarY, barW, barH - 1);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(barX, mpBarY, barW * mpRatio, barH - 1);
    }

    // Status icons (small emojis along bottom)
    if (unit.activeStatuses?.length > 0) {
      const statusSize = Math.floor(cs * 0.22);
      ctx.font = `${statusSize}px serif`;
      ctx.textAlign = 'left';
      const maxShow = Math.floor(pw / statusSize) - 1;
      for (let i = 0; i < Math.min(unit.activeStatuses.length, maxShow); i++) {
        const st = unit.activeStatuses[i];
        const sIcon = _statusIcon(st.statusId);
        ctx.fillText(sIcon, px + 2 + i * (statusSize + 1), py2 + ph - cs * 0.22);
      }
    }
  }

  // ── PROCEDURAL TERRAIN DECORATION ────────────────────────────────
  // Each terrain kind gets simple geometric drawing that hints at its
  // material (grass tufts, water ripples, cracked stone, fire flickers,
  // …). We use a stable per-cell PRNG so the pattern doesn't crawl
  // across animation frames.
  function _drawTerrainDecor(ctx, terrain, x, y, cs, seed, ts) {
    const flicker = (Math.sin((ts || 0) / 320 + seed * 6) + 1) * 0.5;
    switch (terrain) {
      case 'grass':
      case 'forest': {
        // Denser tufts than other terrains so grass reads as a continuous
        // flammable carpet — important because Fire damage on this tile
        // converts it to fire_zone, so the player needs to recognize it.
        ctx.strokeStyle = 'rgba(120, 200, 95, 0.7)';
        ctx.lineWidth = Math.max(1, cs * 0.035);
        const tuftCount = 7;
        for (let i = 0; i < tuftCount; i++) {
          // Stable per-cell jitter so tufts don't crawl between frames.
          const sx = x + cs * (0.1 + ((seed * 13 + i * 23) % 80) / 100);
          const sy = y + cs * (0.45 + ((seed * 7 + i * 31) % 50) / 100);
          ctx.beginPath();
          ctx.moveTo(sx, sy + cs * 0.06);
          ctx.lineTo(sx - cs * 0.04, sy - cs * 0.14);
          ctx.moveTo(sx, sy + cs * 0.06);
          ctx.lineTo(sx,             sy - cs * 0.18);
          ctx.moveTo(sx, sy + cs * 0.06);
          ctx.lineTo(sx + cs * 0.04, sy - cs * 0.14);
          ctx.stroke();
        }
        // Tiny scatter of darker blades for depth.
        ctx.strokeStyle = 'rgba(60, 110, 50, 0.55)';
        for (let i = 0; i < 4; i++) {
          const sx = x + cs * (0.2 + ((seed * 19 + i * 11) % 60) / 100);
          const sy = y + cs * (0.6 + ((seed * 23 + i * 7) % 30) / 100);
          ctx.beginPath();
          ctx.moveTo(sx, sy + cs * 0.05);
          ctx.lineTo(sx + cs * 0.03, sy - cs * 0.1);
          ctx.stroke();
        }
        break;
      }
      case 'cliff': {
        // Pit / sheer drop: dark inside with a jagged crack pattern so it
        // reads as bottomless, not just a dark tile. Players need to see
        // immediately that this is a fall-to-your-death cell.
        const cx = x + cs / 2;
        const cy = y + cs / 2;
        // Deep void in the middle.
        const g = ctx.createRadialGradient(cx, cy, cs * 0.06, cx, cy, cs * 0.5);
        g.addColorStop(0,  '#000000');
        g.addColorStop(0.7,'#08080c');
        g.addColorStop(1,  'rgba(8, 8, 12, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + cs * 0.08, y + cs * 0.08, cs * 0.84, cs * 0.84);
        // Cracked lip — pale edges so the pit's outline is clear.
        ctx.strokeStyle = 'rgba(200, 200, 210, 0.45)';
        ctx.lineWidth = Math.max(1, cs * 0.04);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a0 = (i / 5) * Math.PI * 2 + (seed * 1.7);
          const a1 = a0 + (Math.PI * 2) / 5;
          const r0 = cs * (0.32 + ((seed * 11 + i * 5) % 8) / 100);
          const r1 = cs * (0.32 + ((seed * 7  + i * 9) % 8) / 100);
          ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
          ctx.lineTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
        }
        ctx.stroke();
        // Skull tick in the centre — small, clear danger glyph.
        ctx.fillStyle = 'rgba(220, 220, 220, 0.5)';
        ctx.font = `${Math.floor(cs * 0.38)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', cx, cy);
        break;
      }
      case 'barrel': {
        // Cylindrical wooden barrel with a metal band — distinct silhouette
        // so the player recognises a kickable object at a glance.
        const cx = x + cs / 2;
        const baseTop = y + cs * 0.22;
        const baseBot = y + cs * 0.86;
        const halfW = cs * 0.28;
        // Body
        const body = ctx.createLinearGradient(x, 0, x + cs, 0);
        body.addColorStop(0,    '#3a2410');
        body.addColorStop(0.5,  '#7a4f29');
        body.addColorStop(1,    '#3a2410');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(cx - halfW, baseTop);
        ctx.quadraticCurveTo(cx - halfW * 1.18, (baseTop + baseBot) / 2, cx - halfW, baseBot);
        ctx.lineTo(cx + halfW, baseBot);
        ctx.quadraticCurveTo(cx + halfW * 1.18, (baseTop + baseBot) / 2, cx + halfW, baseTop);
        ctx.closePath();
        ctx.fill();
        // Top oval (the open / lid)
        ctx.fillStyle = '#2a190a';
        ctx.beginPath();
        ctx.ellipse(cx, baseTop, halfW, cs * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a0e05';
        ctx.lineWidth = Math.max(1, cs * 0.02);
        ctx.stroke();
        // Metal bands
        ctx.strokeStyle = 'rgba(40, 40, 40, 0.85)';
        ctx.lineWidth = Math.max(1.5, cs * 0.045);
        for (const yy of [baseTop + cs * 0.12, (baseTop + baseBot) / 2, baseBot - cs * 0.06]) {
          ctx.beginPath();
          ctx.moveTo(cx - halfW * 1.08, yy);
          ctx.quadraticCurveTo(cx, yy + cs * 0.025, cx + halfW * 1.08, yy);
          ctx.stroke();
        }
        // Stave seams
        ctx.strokeStyle = 'rgba(20, 12, 4, 0.55)';
        ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * halfW * 0.4, baseTop + cs * 0.02);
          ctx.lineTo(cx + i * halfW * 0.4, baseBot - cs * 0.04);
          ctx.stroke();
        }
        // Tiny "danger" warning so the player knows it's interactive.
        ctx.fillStyle = 'rgba(255, 200, 0, 0.85)';
        ctx.beginPath();
        ctx.arc(cx + halfW * 0.55, baseTop + cs * 0.05, Math.max(1.5, cs * 0.05), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'water':
      case 'mud': {
        const tint = terrain === 'mud' ? 'rgba(140, 95, 60, 0.55)' : 'rgba(110, 190, 230, 0.55)';
        ctx.strokeStyle = tint;
        ctx.lineWidth = Math.max(1, cs * 0.04);
        const phase = ((ts || 0) / 600 + seed) % 1;
        for (let i = 0; i < 3; i++) {
          const py = y + cs * (0.25 + i * 0.25 + phase * 0.05);
          ctx.beginPath();
          ctx.moveTo(x + cs * 0.1, py);
          ctx.bezierCurveTo(x + cs * 0.3, py - cs * 0.05, x + cs * 0.5, py + cs * 0.05, x + cs * 0.9, py);
          ctx.stroke();
        }
        break;
      }
      case 'wall': {
        // Stacked-brick wall — clearly a constructed barrier.
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const rows = 3;
        for (let i = 0; i < rows; i++) {
          const py = y + (cs / rows) * i;
          const offset = i % 2 === 0 ? 0 : cs * 0.25;
          ctx.fillRect(x + offset, py, cs - offset, cs / rows);
          ctx.beginPath();
          ctx.moveTo(x, py + cs / rows);
          ctx.lineTo(x + cs, py + cs / rows);
          ctx.stroke();
          if (offset > 0) {
            ctx.beginPath();
            ctx.moveTo(x + offset, py);
            ctx.lineTo(x + offset, py + cs / rows);
            ctx.stroke();
          }
        }
        // Top edge highlight so the wall reads as solid stone.
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, y, cs, Math.max(2, cs * 0.06));
        break;
      }
      case 'obstacle': {
        // Lumpy boulder — softer outline than a wall, more "thing in the way".
        const cx = x + cs / 2;
        const cy = y + cs * 0.58;
        ctx.fillStyle = 'rgba(120, 120, 130, 0.55)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, cs * 0.36, cs * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(70, 70, 80, 0.55)';
        ctx.beginPath();
        ctx.ellipse(cx - cs * 0.1, cy + cs * 0.08, cs * 0.18, cs * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Highlight glint
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.ellipse(cx - cs * 0.12, cy - cs * 0.16, cs * 0.1, cs * 0.04, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rubble': {
        // Scatter of broken stones — passable but expensive.
        ctx.fillStyle = 'rgba(140, 130, 115, 0.55)';
        for (let i = 0; i < 5; i++) {
          const rx = x + cs * (0.15 + ((seed * 11 + i * 13) % 70) / 100);
          const ry = y + cs * (0.35 + ((seed * 17 + i * 7) % 50) / 100);
          const rs = cs * (0.08 + ((seed * 5 + i * 3) % 8) / 100);
          ctx.beginPath();
          ctx.ellipse(rx, ry, rs, rs * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 0; i < 5; i++) {
          const rx = x + cs * (0.15 + ((seed * 11 + i * 13) % 70) / 100);
          const ry = y + cs * (0.35 + ((seed * 17 + i * 7) % 50) / 100) + cs * 0.04;
          ctx.fillRect(rx - cs * 0.04, ry, cs * 0.08, 1);
        }
        break;
      }
      case 'pillar': {
        // Round column with capital — vertical structure, distinct from wall.
        const cx = x + cs / 2;
        ctx.fillStyle = 'rgba(190, 180, 160, 0.55)';
        ctx.fillRect(cx - cs * 0.16, y + cs * 0.18, cs * 0.32, cs * 0.6);
        // Capital and base flair
        ctx.fillStyle = 'rgba(220, 210, 180, 0.6)';
        ctx.fillRect(cx - cs * 0.22, y + cs * 0.14, cs * 0.44, cs * 0.06);
        ctx.fillRect(cx - cs * 0.22, y + cs * 0.78, cs * 0.44, cs * 0.06);
        // Fluting (vertical lines)
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * cs * 0.08, y + cs * 0.2);
          ctx.lineTo(cx + i * cs * 0.08, y + cs * 0.78);
          ctx.stroke();
        }
        break;
      }
      case 'tree': {
        // Trunk first, foliage clusters on top — a touch more dimensional.
        ctx.fillStyle = 'rgba(75, 50, 30, 0.85)';
        ctx.fillRect(x + cs * 0.46, y + cs * 0.52, cs * 0.08, cs * 0.36);
        ctx.fillStyle = 'rgba(40, 80, 40, 0.7)';
        ctx.beginPath();
        ctx.arc(x + cs * 0.5, y + cs * 0.4, cs * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 110, 60, 0.7)';
        ctx.beginPath();
        ctx.arc(x + cs * 0.36, y + cs * 0.34, cs * 0.18, 0, Math.PI * 2);
        ctx.arc(x + cs * 0.64, y + cs * 0.34, cs * 0.18, 0, Math.PI * 2);
        ctx.arc(x + cs * 0.5, y + cs * 0.22, cs * 0.16, 0, Math.PI * 2);
        ctx.fill();
        // Shadow under the tree so it reads as standing on the floor.
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(x + cs * 0.5, y + cs * 0.92, cs * 0.22, cs * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'high_ground': {
        // Stepped plateau — short shadow at the foot, lighter cap on top.
        ctx.fillStyle = 'rgba(255, 235, 180, 0.14)';
        ctx.fillRect(x + cs * 0.08, y + cs * 0.18, cs * 0.84, cs * 0.42);
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(x + cs * 0.08, y + cs * 0.6, cs * 0.84, cs * 0.06);
        // Up arrow
        ctx.strokeStyle = 'rgba(255, 220, 150, 0.85)';
        ctx.lineWidth = Math.max(1, cs * 0.04);
        const cxh = x + cs / 2;
        ctx.beginPath();
        ctx.moveTo(cxh, y + cs * 0.3);
        ctx.lineTo(cxh, y + cs * 0.52);
        ctx.moveTo(cxh - cs * 0.1, y + cs * 0.38);
        ctx.lineTo(cxh, y + cs * 0.28);
        ctx.lineTo(cxh + cs * 0.1, y + cs * 0.38);
        ctx.stroke();
        break;
      }
      case 'electric': {
        // Animated lightning glyph that pulses with `flicker`.
        const cxe = x + cs / 2;
        const cye = y + cs / 2;
        ctx.strokeStyle = `rgba(255, 236, 124, ${0.55 + flicker * 0.4})`;
        ctx.lineWidth = Math.max(1.5, cs * 0.05);
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(cxe - cs * 0.12, cye - cs * 0.28);
        ctx.lineTo(cxe + cs * 0.04, cye - cs * 0.04);
        ctx.lineTo(cxe - cs * 0.06, cye + cs * 0.02);
        ctx.lineTo(cxe + cs * 0.14, cye + cs * 0.28);
        ctx.stroke();
        // Tiny sparks
        ctx.fillStyle = `rgba(255, 248, 196, ${0.4 + flicker * 0.5})`;
        for (let i = 0; i < 3; i++) {
          const px = x + cs * (0.2 + i * 0.3);
          const py = y + cs * (0.78 + Math.sin((ts || 0) / 180 + i + seed) * 0.04);
          ctx.fillRect(px, py, Math.max(1, cs * 0.04), Math.max(1, cs * 0.04));
        }
        break;
      }
      case 'wind': {
        // Curling gust lines that drift across the cell.
        const phase = ((ts || 0) / 700 + seed) % 1;
        ctx.strokeStyle = 'rgba(220, 245, 240, 0.55)';
        ctx.lineWidth = Math.max(1, cs * 0.035);
        for (let i = 0; i < 3; i++) {
          const py = y + cs * (0.3 + i * 0.2);
          const off = (phase + i * 0.33) * cs * 0.5;
          ctx.beginPath();
          ctx.moveTo(x + cs * 0.1 - off * 0.3, py);
          ctx.bezierCurveTo(
            x + cs * 0.35 - off * 0.2, py - cs * 0.05,
            x + cs * 0.6 - off * 0.1, py + cs * 0.05,
            x + cs * 0.9, py
          );
          ctx.stroke();
        }
        break;
      }
      case 'fire_zone':
      case 'lava': {
        ctx.fillStyle = `rgba(255, 140, 60, ${0.45 + flicker * 0.3})`;
        ctx.beginPath();
        ctx.arc(x + cs / 2, y + cs * (0.6 - flicker * 0.05), cs * (0.18 + flicker * 0.06), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 240, 180, ${0.6 + flicker * 0.3})`;
        ctx.beginPath();
        ctx.arc(x + cs / 2, y + cs * (0.62 - flicker * 0.04), cs * (0.08 + flicker * 0.03), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ice_zone': {
        ctx.strokeStyle = `rgba(180, 230, 255, ${0.6 + flicker * 0.2})`;
        ctx.lineWidth = Math.max(1, cs * 0.04);
        const cx = x + cs / 2;
        const cy = y + cs / 2;
        for (let a = 0; a < 3; a++) {
          const rad = (a * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(rad) * cs * 0.25, cy - Math.sin(rad) * cs * 0.25);
          ctx.lineTo(cx + Math.cos(rad) * cs * 0.25, cy + Math.sin(rad) * cs * 0.25);
          ctx.stroke();
        }
        break;
      }
      case 'thorns': {
        ctx.strokeStyle = 'rgba(200, 100, 100, 0.7)';
        ctx.lineWidth = Math.max(1, cs * 0.03);
        for (let i = 0; i < 4; i++) {
          const px = x + cs * 0.2 + (cs * 0.6 / 4) * i;
          ctx.beginPath();
          ctx.moveTo(px, y + cs * 0.85);
          ctx.lineTo(px, y + cs * 0.4);
          ctx.lineTo(px + cs * 0.04, y + cs * 0.55);
          ctx.moveTo(px, y + cs * 0.55);
          ctx.lineTo(px - cs * 0.04, y + cs * 0.7);
          ctx.stroke();
        }
        break;
      }
      case 'poison_zone': {
        ctx.fillStyle = `rgba(180, 110, 220, ${0.35 + flicker * 0.25})`;
        for (let i = 0; i < 3; i++) {
          const px = x + cs * (0.25 + i * 0.25);
          ctx.beginPath();
          ctx.arc(px, y + cs * (0.55 + Math.sin(flicker + i) * 0.05), cs * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'heal_zone':
      case 'holy': {
        ctx.strokeStyle = `rgba(180, 255, 200, ${0.5 + flicker * 0.3})`;
        ctx.lineWidth = Math.max(1, cs * 0.04);
        const cx = x + cs / 2;
        const cy = y + cs / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - cs * 0.22);
        ctx.lineTo(cx, cy + cs * 0.22);
        ctx.moveTo(cx - cs * 0.22, cy);
        ctx.lineTo(cx + cs * 0.22, cy);
        ctx.stroke();
        break;
      }
      case 'dark': {
        ctx.fillStyle = `rgba(20, 20, 50, ${0.4 + flicker * 0.2})`;
        ctx.beginPath();
        ctx.arc(x + cs / 2, y + cs / 2, cs * 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        // Stone floor — subtle speckle + faint hairline cracks. Kept low
        // contrast so units and effects always dominate the read.
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 5; i++) {
          const sx = x + cs * ((seed * 11 + i * 7) % 100) / 100;
          const sy = y + cs * ((seed * 17 + i * 13) % 100) / 100;
          ctx.fillRect(sx, sy, Math.max(1, cs * 0.03), Math.max(1, cs * 0.03));
        }
        // One short hairline crack per cell (different angle/position per seed).
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        const cx0 = x + cs * (0.15 + ((seed * 19) % 70) / 100);
        const cy0 = y + cs * (0.25 + ((seed * 23) % 50) / 100);
        const ang = (seed * Math.PI) % (Math.PI * 2);
        const len = cs * (0.12 + ((seed * 13) % 18) / 100);
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx0 + Math.cos(ang) * len, cy0 + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
  }

  function _cellRand(r, c) {
    let h = _decorSeed ^ ((r * 374761393) | 0) ^ ((c * 668265263) | 0);
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 0xFFFFFFFF;
  }

  // ── CELL PAINTING HELPERS ─────────────────────────────────────────
  function _ensureTileAtlas() {
    if (_tileAtlasImg || _tileAtlasFailed || typeof Image === 'undefined') return;
    const img = new Image();
    img.onload = () => { _tileAtlasReady = true; };
    img.onerror = () => { _tileAtlasReady = false; _tileAtlasFailed = true; };
    img.src = TILE_ATLAS_SRC;
    _tileAtlasImg = img;
  }

  function _drawAtlasTile(ctx, x, y, cs, terrainKey) {
    if (!_tileAtlasReady || !_tileAtlasImg || !_tileAtlasImg.naturalWidth) return false;
    const coord = TILE_ATLAS_MAP[terrainKey] || TILE_ATLAS_MAP.empty;
    if (!coord) return false;
    const cols = 4;
    const rows = 4;
    const sw = Math.floor(_tileAtlasImg.naturalWidth / cols);
    const sh = Math.floor(_tileAtlasImg.naturalHeight / rows);
    const [col, row] = coord;
    ctx.save();
    ctx.globalAlpha = _atlasTileAlpha(terrainKey);
    ctx.drawImage(_tileAtlasImg, col * sw, row * sh, sw, sh, x, y, cs, cs);
    ctx.restore();
    return true;
  }

  function _atlasTileAlpha(terrainKey) {
    if (terrainKey === 'empty' || terrainKey === 'floor') return 0.72;
    if (terrainKey === 'water' || terrainKey === 'lava' || terrainKey === 'fire_zone') return 0.86;
    if (terrainKey === 'wall' || terrainKey === 'cliff' || terrainKey === 'high_ground') return 0.88;
    return 0.8;
  }

  // Paint the base of one cell with a vertical gradient so tiles read as
  // physical surfaces (slight lift at the top, slight pool of shadow at
  // the bottom). Different terrain families get tuned tones.
  function _paintCellBase(ctx, x, y, cs, color, terrainKey) {
    // Build a per-terrain top/bottom shade so the gradient direction
    // matches the material (stone = light top, water = light middle, etc.)
    const shade = _shadeForTerrain(terrainKey, color);
    const grad = ctx.createLinearGradient(x, y, x, y + cs);
    grad.addColorStop(0,    shade.top);
    grad.addColorStop(0.55, shade.mid);
    grad.addColorStop(1,    shade.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, cs, cs);
    if (_drawAtlasTile(ctx, x, y, cs, terrainKey)) {
      const glaze = ctx.createLinearGradient(x, y, x, y + cs);
      glaze.addColorStop(0, 'rgba(255,255,255,0.08)');
      glaze.addColorStop(0.6, 'rgba(0,0,0,0)');
      glaze.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = glaze;
      ctx.fillRect(x, y, cs, cs);
    }
  }

  function _shadeForTerrain(terrain, baseColor) {
    // Generic darker-bottom / lighter-top for every tile, with per-terrain
    // overrides for ones whose materials read differently.
    const overrides = {
      water:      { top: '#2a64c4', mid: '#1d4cae', bottom: '#0e2f8a' },
      ice_zone:   { top: '#a7d8ff', mid: '#5d9ed8', bottom: '#2e5f9c' },
      lava:       { top: '#f59e0b', mid: '#b8480a', bottom: '#6b1a07' },
      fire_zone:  { top: '#c2410c', mid: '#7f1d1d', bottom: '#3f0a0a' },
      grass:      { top: '#3a6f37', mid: '#27502a', bottom: '#173317' },
      high_ground:{ top: '#7c5b3a', mid: '#5b3f25', bottom: '#3a2515' },
      cliff:      { top: '#16161e', mid: '#08080c', bottom: '#000000' },
      barrel:     { top: '#7a4f29', mid: '#5b3a1d', bottom: '#3a2410' },
      wall:       { top: '#605854', mid: '#44403c', bottom: '#23211f' },
      heal_zone:  { top: '#107a52', mid: '#064e3b', bottom: '#04321f' },
      holy:       { top: '#fff4c2', mid: '#fde68a', bottom: '#caa645' },
      dark:       { top: '#1e1b4b', mid: '#0f0a2a', bottom: '#05030f' },
      mud:        { top: '#8a572c', mid: '#5d3416', bottom: '#3a200c' },
      poison_zone:{ top: '#1f6b3e', mid: '#14532d', bottom: '#072614' },
      empty:      { top: '#1f2839', mid: '#171d2b', bottom: '#0c111c' }
    };
    if (overrides[terrain]) return overrides[terrain];
    const rgb = _hexToRgb(baseColor) || { r: 30, g: 30, b: 46 };
    return {
      top:    `rgb(${Math.min(255, rgb.r + 18)}, ${Math.min(255, rgb.g + 18)}, ${Math.min(255, rgb.b + 18)})`,
      mid:    `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      bottom: `rgb(${Math.max(0, rgb.r - 22)}, ${Math.max(0, rgb.g - 22)}, ${Math.max(0, rgb.b - 22)})`
    };
  }

  function _hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const m = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // Outer + inner edge bevel. Two-tone so each cell reads as raised
  // even at small zoom levels. The bevel is consistent across terrains
  // (the gradient sells the material; the bevel sells the tile shape).
  function _paintCellEdges(ctx, x, y, cs, tData) {
    // Bottom + right outer line — darker, gives weight.
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + cs - 0.5, y + 0.5);
    ctx.lineTo(x + cs - 0.5, y + cs - 0.5);
    ctx.lineTo(x + 0.5,      y + cs - 0.5);
    ctx.stroke();
    // Top + left inner highlight — brighter, gives lift.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + cs - 1.5);
    ctx.lineTo(x + 0.5, y + 0.5);
    ctx.lineTo(x + cs - 1.5, y + 0.5);
    ctx.stroke();
  }

  // Cast a soft shadow into a neighbouring cell when this cell is raised
  // (high_ground → +1) and the neighbour is lower. For pits (cliff), do
  // the opposite — the cell itself sinks below the surrounding floor.
  function _paintElevationShadow(ctx, r, c, x, y, cs) {
    const here = GE().getTerrain(r, c);
    const hereData = C().TERRAIN_TYPES[here] || {};
    const elevHere = Number(hereData.elevation || 0);
    const isPit = !!hereData.lethal && hereData.passable === false; // cliff

    if (elevHere > 0) {
      // Lighten the highlight on the top + left edges; this cell sits up.
      ctx.strokeStyle = 'rgba(255, 235, 180, 0.35)';
      ctx.lineWidth = Math.max(1, cs * 0.04);
      ctx.beginPath();
      ctx.moveTo(x + 1, y + cs - 2);
      ctx.lineTo(x + 1, y + 1);
      ctx.lineTo(x + cs - 2, y + 1);
      ctx.stroke();
      // Bottom + right gets a heavier drop shadow into the neighbour
      // cells, simulating a step down.
      const grad = ctx.createLinearGradient(x, y + cs - cs * 0.25, x, y + cs);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y + cs - Math.max(2, cs * 0.18), cs, Math.max(2, cs * 0.18));
    }

    if (isPit) {
      // Pit — inset shadow ring so the cell looks recessed.
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = Math.max(2, cs * 0.06);
      ctx.strokeRect(x + cs * 0.08, y + cs * 0.08, cs * 0.84, cs * 0.84);
      // Inner darker rim so you can SEE the drop.
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + cs * 0.08, y + cs * 0.08, cs * 0.84, Math.max(2, cs * 0.08));
    }
  }

  // Terrains whose drawn art already carries the read — don't double up
  // with the small emoji glyph.
  function _iconHiddenForTerrain(terrain) {
    return terrain === 'grass'
        || terrain === 'cliff'
        || terrain === 'barrel'
        || terrain === 'wall'
        || terrain === 'obstacle'
        || terrain === 'tree'
        || terrain === 'pillar'
        || terrain === 'high_ground';
  }

  // ── FACING CHEVRON ────────────────────────────────────────────────
  // Solid arrowhead drawn on the front edge of the unit's footprint.
  // This is FUNCTIONAL — players need it to read which side of an enemy
  // counts as "rear" for flanking. Sized so it sits right at the cell
  // border, half on the portrait, half on the cell edge — readable at
  // any zoom level without dominating the unit art.
  function _drawFacingChevron(ctx, unit, px, py, pw, ph, cs) {
    const facing = unit.facing;
    if (!facing) return;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    // Tip sits right at the cell edge of the unit footprint.
    const half = Math.min(pw, ph) * 0.5;
    const tipDist = half - Math.max(1, cs * 0.02);
    const halfBase = Math.max(3, cs * 0.13);
    const arrowLen = halfBase * 1.55;

    // Direction vector (canvas: x=col,+right ; y=row,+down)
    const vec = {
      N:  [ 0, -1], NE: [ Math.SQRT1_2, -Math.SQRT1_2],
      E:  [ 1,  0], SE: [ Math.SQRT1_2,  Math.SQRT1_2],
      S:  [ 0,  1], SW: [-Math.SQRT1_2,  Math.SQRT1_2],
      W:  [-1,  0], NW: [-Math.SQRT1_2, -Math.SQRT1_2]
    }[String(facing).toUpperCase()];
    if (!vec) return;
    const [vx, vy] = vec;
    // Perpendicular vector (rotated 90°) for the base of the triangle.
    const perpX = -vy, perpY = vx;

    const tipX = cx + vx * tipDist;
    const tipY = cy + vy * tipDist;
    // Base sits a notch behind the tip — gives the arrow head shape.
    const baseDist = tipDist - arrowLen;
    const baseCx = cx + vx * baseDist;
    const baseCy = cy + vy * baseDist;
    const blX = baseCx + perpX * halfBase;
    const blY = baseCy + perpY * halfBase;
    const brX = baseCx - perpX * halfBase;
    const brY = baseCy - perpY * halfBase;

    // Team-tinted, with a contrast outline so it reads on any cell colour.
    const fill = unit.team === 'player' ? '#60a5fa' : '#fca5a5';
    ctx.fillStyle = fill;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = Math.max(1.2, cs * 0.028);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(blX, blY);
    ctx.lineTo(brX, brY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function setTheme(opts = {}) {
    if (opts.image) {
      const img = new Image();
      img.onload = () => { _themeImg = img; };
      img.onerror = () => { _themeImg = null; };
      img.src = opts.image;
    } else if (opts.image === null) {
      _themeImg = null;
    }
    if (opts.seed != null) _decorSeed = Number(opts.seed) || _decorSeed;
  }

  function _statusIcon(statusId) {
    const map = {
      burn: '🔥', poison: '☠️', bleed: '🩸', frostbite: '🥶',
      shock: '⚡', stun: '💫', freeze: '🧊', sleep: '💤',
      silence: '🤐', blind: '🌑', confuse: '😵', fear: '😨',
      regen: '💚', shield: '🛡️', haste: '⚡', berserk: '😡',
      slow: '🐌', root: '🌿', taunt: '😤', charm: '💕',
      stealth: '👤', doom: '💀', petrify: '🪨', weakness: '📉',
      protect: '🛡️', counter: '⚔️'
    };
    return map[statusId] || '✦';
  }

  // ── EVENT HANDLERS ────────────────────────────────────────────────
  function _cellFromEvent(e) {
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const c = Math.floor(mx / _cellSize);
    const r = Math.floor(my / _cellSize);
    if (r < 0 || r >= _height || c < 0 || c >= _width) return null;
    return { r, c };
  }

  function _handleClick(e) {
    const cell = _cellFromEvent(e);
    if (cell && _onCellClick) _onCellClick(cell.r, cell.c, e);
  }

  function _handleHover(e) {
    const cell = _cellFromEvent(e);
    _hoverCell = cell;
    if (cell && _onCellHover) _onCellHover(cell.r, cell.c);
  }

  function _handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const cell = _cellFromEvent(touch);
    if (cell && _onCellClick) _onCellClick(cell.r, cell.c, e);
  }

  // ── QUERIES ───────────────────────────────────────────────────────
  function getCellSize() { return _cellSize; }

  // ── PUBLIC API ────────────────────────────────────────────────────
  return Object.freeze({
    init, resize, destroy,
    setHighlights, clearHighlights, setSelectedUnit,
    addDamageFloat,
    getCellSize,
    setTheme,
    setZoom, zoomIn, zoomOut, resetZoom, getZoom, getZoomBounds,
    setPaused, isPaused,
    animateUnitMove, clearMoveAnimations
  });
})();
