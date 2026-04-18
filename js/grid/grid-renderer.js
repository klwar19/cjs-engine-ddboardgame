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

  // ── INIT ──────────────────────────────────────────────────────────
  function init(canvasEl, opts) {
    _canvas = canvasEl;
    _ctx = _canvas.getContext('2d');
    _cellSize = opts?.cellSize || 64;
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

    // Determine cell size to fit container
    const container = _canvas.parentElement;
    if (container) {
      const maxW = container.clientWidth - 4;
      const maxH = container.clientHeight - 4;
      _cellSize = Math.floor(Math.min(maxW / _width, maxH / _height, 80));
      _cellSize = Math.max(_cellSize, 32); // minimum
    }

    const dpr = window.devicePixelRatio || 1;
    _canvas.width = _width * _cellSize * dpr;
    _canvas.height = _height * _cellSize * dpr;
    _canvas.style.width = (_width * _cellSize) + 'px';
    _canvas.style.height = (_height * _cellSize) + 'px';
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _ready = true;
  }

  function destroy() {
    if (_animFrame) cancelAnimationFrame(_animFrame);
    if (_canvas) {
      _canvas.removeEventListener('click', _handleClick);
      _canvas.removeEventListener('mousemove', _handleHover);
      _canvas.removeEventListener('touchstart', _handleTouch);
    }
    _canvas = null;
    _ctx = null;
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

    // ── TERRAIN ─────────────────────────────────────────────────────
    for (let r = 0; r < _height; r++) {
      for (let c = 0; c < _width; c++) {
        const terrain = GE().getTerrain(r, c);
        const tData = C().TERRAIN_TYPES[terrain] || C().TERRAIN_TYPES.empty;
        const x = c * cs;
        const y = r * cs;

        // Cell background
        ctx.fillStyle = tData.color || '#1a1a2e';
        ctx.fillRect(x, y, cs, cs);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);

        // Terrain icon
        if (tData.icon) {
          ctx.font = `${Math.floor(cs * 0.35)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.6;
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
    const px = unit.pos[1] * cs;
    const py = unit.pos[0] * cs;
    const pw = fp.w * cs;
    const ph = fp.h * cs;

    // Selection ring
    const isSelected = unit.instanceId === _selectedUnit;
    if (isSelected) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
    }

    // Team color background
    const teamColor = unit.team === 'player'
      ? 'rgba(59, 130, 246, 0.3)'
      : 'rgba(239, 68, 68, 0.3)';
    ctx.fillStyle = teamColor;
    ctx.fillRect(px + 3, py + 3, pw - 6, ph - 6);

    // Unit icon (emoji)
    const icon = unit.icon || (unit.team === 'player' ? '🟦' : '🟥');
    const fontSize = Math.floor(Math.min(pw, ph) * 0.55);
    ctx.font = `${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, px + pw / 2, py + ph / 2);

    // Name label
    ctx.font = `bold ${Math.floor(cs * 0.17)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(
      (unit.name || unit.baseId || '?').substring(0, 8),
      px + pw / 2, py + ph - cs * 0.1
    );

    // HP bar
    const barW = pw - 8;
    const barH = Math.max(4, cs * 0.06);
    const barX = px + 4;
    const barY = py + 3;
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
        ctx.fillText(sIcon, px + 2 + i * (statusSize + 1), py + ph - cs * 0.22);
      }
    }
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
    getCellSize
  });
})();
