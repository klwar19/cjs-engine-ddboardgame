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

    // Attach events
    _canvas.addEventListener('click', _handleClick);
    _canvas.addEventListener('mousemove', _handleHover);
    _canvas.addEventListener('mouseleave', () => { _hoverCell = null; });
    _canvas.addEventListener('touchstart', _handleTouch, { passive: false });

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
    if (_animFrame) cancelAnimationFrame(_animFrame);
    if (_canvas) {
      _canvas.removeEventListener('click', _handleClick);
      _canvas.removeEventListener('mousemove', _handleHover);
      _canvas.removeEventListener('touchstart', _handleTouch);
    }
    _canvas = null;
    _ctx = null;
    _moveAnims.clear();
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
    function frame(ts) {
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
    for (let r = 0; r < _height; r++) {
      for (let c = 0; c < _width; c++) {
        const terrain = GE().getTerrain(r, c);
        const tData = C().TERRAIN_TYPES[terrain] || C().TERRAIN_TYPES.empty;
        const x = c * cs;
        const y = r * cs;
        const seed = _cellRand(r, c);

        // Cell background with subtle per-cell variation
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = tData.color || '#1a1a2e';
        ctx.fillRect(x, y, cs, cs);
        ctx.globalAlpha = 1;

        // Procedural decoration per terrain kind. This is what makes
        // the grid feel like an RPG floor instead of a chess board.
        _drawTerrainDecor(ctx, terrain, x, y, cs, seed, ts);

        // Inner cell border — slight bevel so cells read as tiles
        ctx.strokeStyle = 'rgba(0,0,0,0.32)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y + cs - 0.5);
        ctx.lineTo(x + 0.5, y + 0.5);
        ctx.lineTo(x + cs - 0.5, y + 0.5);
        ctx.stroke();

        // Terrain icon glyph (kept for clarity beside the decoration)
        if (tData.icon) {
          ctx.font = `${Math.floor(cs * 0.32)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#fff';
          ctx.fillText(tData.icon, x + cs / 2, y + cs / 2);
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
        ctx.strokeStyle = 'rgba(140, 220, 130, 0.55)';
        ctx.lineWidth = Math.max(1, cs * 0.04);
        for (let i = 0; i < 4; i++) {
          const px = x + cs * ((seed * 13 + i * 17) % 100) / 100;
          const py = y + cs * 0.55 + cs * ((seed * 7 + i * 29) % 60) / 100;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - cs * 0.04, py - cs * 0.18);
          ctx.moveTo(px, py);
          ctx.lineTo(px + cs * 0.04, py - cs * 0.16);
          ctx.stroke();
        }
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
        // Stone floor — subtle speckle
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (let i = 0; i < 5; i++) {
          const sx = x + cs * ((seed * 11 + i * 7) % 100) / 100;
          const sy = y + cs * ((seed * 17 + i * 13) % 100) / 100;
          ctx.fillRect(sx, sy, Math.max(1, cs * 0.03), Math.max(1, cs * 0.03));
        }
      }
    }
  }

  function _cellRand(r, c) {
    let h = _decorSeed ^ ((r * 374761393) | 0) ^ ((c * 668265263) | 0);
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 0xFFFFFFFF;
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
    animateUnitMove, clearMoveAnimations
  });
})();
