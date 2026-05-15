// mummy-maze.js
// Turn-based tomb chase. Inspired by Theseus and the Minotaur / Mummy Maze
// Deluxe. The player moves one orthogonal step or waits, then every mummy
// moves up to "speed" steps using a greedy axis-first AI.

(function () {
  'use strict';

  const META = {
    id: 'mummy_maze',
    title: 'Mummy Maze',
    theme: 'tomb',
    description: 'Outwit a tomb mummy that moves twice for every step you take.',
    actions: ['up', 'down', 'left', 'right', 'wait'],
    supportsUndo: true,
    supportsHint: true
  };

  const DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0]
  };

  function createMummyMaze({ canvas, stage, level, options, onUpdate, onComplete }) {
    const ctx = canvas.getContext('2d');
    const state = freshState(level);
    const history = [];
    let mounted = false;
    let resizeObserver = null;

    function freshState(lvl) {
      return {
        player: [lvl.player[0], lvl.player[1]],
        mummies: (lvl.mummies || []).map((m, i) => ({
          id: m.id || `m${i + 1}`,
          pos: [m.pos[0], m.pos[1]],
          speed: Number.isFinite(m.speed) ? m.speed : 2,
          priority: m.priority === 'vertical' ? 'vertical' : 'horizontal',
          alive: true
        })),
        keys: (lvl.keys || []).map((k) => ({ pos: [k.pos[0], k.pos[1]], id: k.id || null, taken: false })),
        gates: (lvl.gates || []).map((g) => ({ pos: [g.pos[0], g.pos[1]], requires: g.requires || null, open: false })),
        traps: (lvl.traps || []).map((t) => ({ pos: [t.pos[0], t.pos[1]], armed: true })),
        carrying: [],
        turns: 0,
        hintsUsed: 0,
        status: 'play'
      };
    }

    function isWallTile(x, y) {
      if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
      return (level.walls || []).some((w) => w[0] === x && w[1] === y);
    }

    function isGateBlocked(s, x, y) {
      const gate = s.gates.find((g) => g.pos[0] === x && g.pos[1] === y);
      if (!gate || gate.open) return false;
      if (!gate.requires) return s.carrying.length === 0;
      return !s.carrying.includes(gate.requires);
    }

    function walkable(s, x, y) {
      if (isWallTile(x, y)) return false;
      if (isGateBlocked(s, x, y)) return false;
      return true;
    }

    function mummyWalkable(s, x, y) {
      if (isWallTile(x, y)) return false;
      const gate = s.gates.find((g) => g.pos[0] === x && g.pos[1] === y);
      if (gate && !gate.open) return false;
      return true;
    }

    function snapshot(s) {
      return JSON.parse(JSON.stringify({
        player: s.player,
        mummies: s.mummies,
        keys: s.keys,
        gates: s.gates,
        traps: s.traps,
        carrying: s.carrying,
        turns: s.turns,
        hintsUsed: s.hintsUsed,
        status: s.status
      }));
    }

    function restore(s, snap) {
      Object.assign(s, JSON.parse(JSON.stringify(snap)));
    }

    function applyPlayerMove(s, dir) {
      const [dx, dy] = DIRS[dir] || [0, 0];
      const nx = s.player[0] + dx;
      const ny = s.player[1] + dy;
      if (dx === 0 && dy === 0) return true;
      if (!walkable(s, nx, ny)) return false;
      s.player = [nx, ny];
      pickupAtPlayer(s);
      return true;
    }

    function pickupAtPlayer(s) {
      for (const key of s.keys) {
        if (!key.taken && key.pos[0] === s.player[0] && key.pos[1] === s.player[1]) {
          key.taken = true;
          if (key.id) s.carrying.push(key.id);
          else s.carrying.push('key');
        }
      }
      for (const gate of s.gates) {
        if (!gate.open && gate.pos[0] === s.player[0] && gate.pos[1] === s.player[1]) {
          gate.open = true;
        }
      }
      const trap = s.traps.find((t) => t.armed && t.pos[0] === s.player[0] && t.pos[1] === s.player[1]);
      if (trap) {
        trap.armed = false;
        s.status = 'fail';
      }
    }

    function mummyMoveStep(s, mummy) {
      const [mx, my] = mummy.pos;
      const [px, py] = s.player;
      const dx = px - mx;
      const dy = py - my;
      const order = mummy.priority === 'vertical' ? ['v', 'h'] : ['h', 'v'];
      for (const axis of order) {
        if (axis === 'h' && dx !== 0) {
          const nx = mx + Math.sign(dx);
          if (mummyWalkable(s, nx, my)) { mummy.pos = [nx, my]; return; }
        } else if (axis === 'v' && dy !== 0) {
          const ny = my + Math.sign(dy);
          if (mummyWalkable(s, mx, ny)) { mummy.pos = [mx, ny]; return; }
        }
      }
    }

    function checkCatch(s) {
      for (const m of s.mummies) {
        if (!m.alive) continue;
        if (m.pos[0] === s.player[0] && m.pos[1] === s.player[1]) return true;
      }
      return false;
    }

    function step(s, dir) {
      if (s.status !== 'play') return false;
      const ok = applyPlayerMove(s, dir);
      if (!ok) return false;
      s.turns += 1;
      if (checkCatch(s)) { s.status = 'fail'; return true; }
      if (s.status === 'fail') return true;
      for (const mummy of s.mummies) {
        if (!mummy.alive) continue;
        for (let step = 0; step < mummy.speed; step++) {
          mummyMoveStep(s, mummy);
          if (checkCatch(s)) { s.status = 'fail'; return true; }
        }
      }
      if (s.player[0] === level.exit[0] && s.player[1] === level.exit[1]) {
        s.status = 'win';
      }
      return true;
    }

    function handleAction(action) {
      if (state.status !== 'play') return;
      if (!DIRS[action]) return;
      const snap = snapshot(state);
      if (!step(state, action)) return;
      history.push(snap);
      render();
      onUpdate?.({ turns: state.turns, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
      if (state.status !== 'play') finalize();
    }

    function statusLabel() {
      if (state.status === 'win') return 'Cleared!';
      if (state.status === 'fail') return 'Caught!';
      return 'In play';
    }

    function finalize() {
      onComplete?.({
        status: state.status,
        turns: state.turns,
        hintsUsed: state.hintsUsed
      });
    }

    function undo() {
      if (!history.length) return;
      const snap = history.pop();
      restore(state, snap);
      render();
      onUpdate?.({ turns: state.turns, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
    }

    function reset() {
      Object.assign(state, freshState(level));
      history.length = 0;
      render();
      onUpdate?.({ turns: 0, hintsUsed: 0, statusLabel: 'In play' });
    }

    function hint() {
      if (state.status !== 'play') return;
      const next = solveNext(state);
      if (!next) {
        flashHint('No safe move found.');
        return;
      }
      state.hintsUsed += 1;
      flashHint(`Try: ${next.toUpperCase()}`);
      onUpdate?.({ turns: state.turns, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
    }

    let hintBubble = null;
    function flashHint(text) {
      if (!hintBubble) {
        hintBubble = document.createElement('div');
        hintBubble.className = 'minigame-hint-bubble';
        stage.appendChild(hintBubble);
      }
      hintBubble.textContent = text;
      hintBubble.classList.add('is-visible');
      clearTimeout(flashHint._t);
      flashHint._t = setTimeout(() => hintBubble?.classList.remove('is-visible'), 1800);
    }

    function solveNext(fromState) {
      const start = snapshot(fromState);
      const seen = new Set();
      const queue = [{ s: start, first: null, depth: 0 }];
      seen.add(stateKey(start));
      const maxDepth = 30;
      while (queue.length) {
        const node = queue.shift();
        if (node.depth > maxDepth) continue;
        for (const action of Object.keys(DIRS)) {
          const copy = JSON.parse(JSON.stringify(node.s));
          const sim = Object.assign({}, copy);
          const moved = step(sim, action);
          if (!moved) continue;
          if (sim.status === 'win') return node.first || action;
          if (sim.status === 'fail') continue;
          const key = stateKey(sim);
          if (seen.has(key)) continue;
          seen.add(key);
          if (seen.size > 80000) return node.first || action;
          queue.push({ s: sim, first: node.first || action, depth: node.depth + 1 });
        }
      }
      return null;
    }

    function stateKey(s) {
      return [
        s.player.join(','),
        s.mummies.map((m) => m.pos.join(',')).join('|'),
        s.keys.map((k) => k.taken ? '1' : '0').join(''),
        s.gates.map((g) => g.open ? '1' : '0').join('')
      ].join('#');
    }

    let tilePx = 48;
    function computeTileSize() {
      const rect = stage.getBoundingClientRect();
      const usableW = Math.max(160, (rect.width || 320) - 16);
      const usableH = Math.max(160, (rect.height || 320) - 16);
      const px = Math.floor(Math.min(usableW / level.width, usableH / level.height));
      tilePx = Math.max(24, Math.min(64, px));
      canvas.width = tilePx * level.width;
      canvas.height = tilePx * level.height;
    }

    const SPRITE_COLORS = {
      floor: '#1d2231',
      floorAlt: '#252a3a',
      wall: '#3a3221',
      wallTop: '#5e4a2c',
      exit: '#f0c674',
      player: '#5fb0ff',
      mummy: '#c9b070',
      key: '#f7e26b',
      gate: '#8f5a2c',
      trap: '#a23838'
    };

    function render() {
      computeTileSize();
      const w = level.width, h = level.height;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          drawTile(x, y);
        }
      }
      const ex = level.exit[0], ey = level.exit[1];
      drawExit(ex, ey);
      for (const trap of state.traps) {
        if (trap.armed) drawTrap(trap.pos[0], trap.pos[1]);
      }
      for (const gate of state.gates) {
        if (!gate.open) drawGate(gate.pos[0], gate.pos[1]);
      }
      for (const key of state.keys) {
        if (!key.taken) drawKey(key.pos[0], key.pos[1]);
      }
      drawPlayer(state.player[0], state.player[1]);
      for (const m of state.mummies) drawMummy(m.pos[0], m.pos[1]);
    }

    function drawTile(x, y) {
      const px = x * tilePx, py = y * tilePx;
      if (isWallTile(x, y)) {
        ctx.fillStyle = SPRITE_COLORS.wall;
        ctx.fillRect(px, py, tilePx, tilePx);
        ctx.fillStyle = SPRITE_COLORS.wallTop;
        ctx.fillRect(px + 2, py + 2, tilePx - 4, Math.max(2, Math.floor(tilePx * 0.18)));
        ctx.strokeStyle = '#1a160d';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? SPRITE_COLORS.floor : SPRITE_COLORS.floorAlt;
        ctx.fillRect(px, py, tilePx, tilePx);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
      }
    }

    function drawExit(x, y) {
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = SPRITE_COLORS.exit;
      ctx.fillRect(px + 4, py + 4, tilePx - 8, tilePx - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 6, py + 6 + i * Math.floor((tilePx - 12) / 4), tilePx - 12, 2);
      }
    }

    function drawPlayer(x, y) {
      const px = x * tilePx, py = y * tilePx;
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      ctx.fillStyle = SPRITE_COLORS.player;
      ctx.beginPath();
      ctx.arc(cx, cy - tilePx * 0.12, tilePx * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + tilePx * 0.3, py + tilePx * 0.42, tilePx * 0.4, tilePx * 0.35);
      ctx.fillStyle = '#1a1f2c';
      ctx.fillRect(px + tilePx * 0.32, py + tilePx * 0.62, tilePx * 0.12, tilePx * 0.18);
      ctx.fillRect(px + tilePx * 0.56, py + tilePx * 0.62, tilePx * 0.12, tilePx * 0.18);
    }

    function drawMummy(x, y) {
      const px = x * tilePx, py = y * tilePx;
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      ctx.fillStyle = SPRITE_COLORS.mummy;
      ctx.beginPath();
      ctx.arc(cx, cy - tilePx * 0.12, tilePx * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + tilePx * 0.28, py + tilePx * 0.4, tilePx * 0.44, tilePx * 0.4);
      ctx.strokeStyle = '#7c6533';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + tilePx * 0.28, py + tilePx * 0.5);
      ctx.lineTo(px + tilePx * 0.72, py + tilePx * 0.55);
      ctx.moveTo(px + tilePx * 0.3, py + tilePx * 0.66);
      ctx.lineTo(px + tilePx * 0.7, py + tilePx * 0.62);
      ctx.stroke();
      ctx.fillStyle = '#1a1f2c';
      ctx.fillRect(cx - tilePx * 0.12, cy - tilePx * 0.18, tilePx * 0.06, tilePx * 0.06);
      ctx.fillRect(cx + tilePx * 0.06, cy - tilePx * 0.18, tilePx * 0.06, tilePx * 0.06);
    }

    function drawKey(x, y) {
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = SPRITE_COLORS.key;
      ctx.beginPath();
      ctx.arc(px + tilePx * 0.35, py + tilePx * 0.5, tilePx * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + tilePx * 0.45, py + tilePx * 0.46, tilePx * 0.35, tilePx * 0.08);
      ctx.fillRect(px + tilePx * 0.7, py + tilePx * 0.54, tilePx * 0.04, tilePx * 0.12);
    }

    function drawGate(x, y) {
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = SPRITE_COLORS.gate;
      ctx.fillRect(px + 4, py + 4, tilePx - 8, tilePx - 8);
      ctx.fillStyle = '#3b2715';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + 6, py + 8 + i * Math.floor((tilePx - 12) / 3), tilePx - 12, 2);
      }
    }

    function drawTrap(x, y) {
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = SPRITE_COLORS.trap;
      ctx.beginPath();
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      const r = tilePx * 0.25;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rx = cx + Math.cos(a) * r;
        const ry = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
    }

    function mount() {
      mounted = true;
      stage.classList.add('minigame-stage--mummy');
      computeTileSize();
      render();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => render());
        resizeObserver.observe(stage);
      }
    }

    function unmount() {
      mounted = false;
      try { resizeObserver?.disconnect(); } catch (_) {}
      stage.classList.remove('minigame-stage--mummy');
    }

    return {
      mount,
      unmount,
      handleAction,
      undo,
      reset,
      hint,
      getTurns: () => state.turns,
      getHintsUsed: () => state.hintsUsed,
      getState: () => snapshot(state),
      _solveNext: solveNext,
      _meta: META
    };
  }

  if (window.CJS && window.CJS.MinigameRegistry) {
    window.CJS.MinigameRegistry.register(META, createMummyMaze);
  } else {
    window.CJS = window.CJS || {};
    window.CJS._pendingMinigames = window.CJS._pendingMinigames || [];
    window.CJS._pendingMinigames.push([META, createMummyMaze]);
  }
})();
