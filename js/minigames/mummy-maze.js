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

  function normalizeMummyLevel(raw) {
    if (!raw?.layout) return raw;
    const layout = raw.layout.map((row) => String(row));
    const width = raw.width || layout.reduce((max, row) => Math.max(max, row.length), 0);
    const height = raw.height || layout.length;
    const parsed = { walls: [], player: null, exit: null, mummies: [], keys: [], gates: [], traps: [] };
    let keyCount = 0;
    let mummyCount = 0;
    for (let y = 0; y < height; y++) {
      const row = layout[y] || '';
      for (let x = 0; x < width; x++) {
        const ch = row[x] || ' ';
        if (ch === '#') parsed.walls.push([x, y]);
        else if (ch === '@') parsed.player = [x, y];
        else if (ch === 'E') parsed.exit = [x, y];
        else if (ch === 'T') parsed.traps.push({ pos: [x, y] });
        else if (ch === 'K') parsed.keys.push({ id: `k${++keyCount}`, pos: [x, y] });
        else if (ch === 'G') parsed.gates.push({ requires: null, pos: [x, y] });
        else if ('MmVv'.includes(ch)) {
          mummyCount += 1;
          parsed.mummies.push({
            id: `m${mummyCount}`,
            pos: [x, y],
            speed: ch === 'M' || ch === 'V' ? 2 : 1,
            priority: ch === 'V' || ch === 'v' ? 'vertical' : 'horizontal'
          });
        }
      }
    }
    const firstKey = parsed.keys[0]?.id || raw.keys?.[0]?.id || null;
    parsed.gates = parsed.gates.map((g) => ({ ...g, requires: raw.gateRequires || firstKey }));
    return {
      ...raw,
      width,
      height,
      player: raw.player || parsed.player || [0, height - 1],
      exit: raw.exit || parsed.exit || [width - 1, 0],
      walls: mergeCells(parsed.walls, raw.walls),
      mummies: [...parsed.mummies, ...(raw.mummies || [])],
      keys: [...parsed.keys, ...(raw.keys || [])],
      gates: [...parsed.gates, ...(raw.gates || [])],
      traps: [...parsed.traps, ...(raw.traps || [])]
    };
  }

  function mergeCells(a = [], b = []) {
    const seen = new Set();
    const out = [];
    for (const cell of [...a, ...b]) {
      if (!Array.isArray(cell) || cell.length < 2) continue;
      const key = `${cell[0]},${cell[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([cell[0], cell[1]]);
    }
    return out;
  }

  function createMummyMaze({ canvas, stage, level, options, onUpdate, onComplete }) {
    level = normalizeMummyLevel(level);
    const ctx = canvas.getContext('2d');
    const state = freshState(level);
    const history = [];
    let mounted = false;
    let resizeObserver = null;
    let motion = null;
    let animationFrame = null;
    const moveAnimMs = 210;

    function freshState(lvl) {
      return {
        player: [lvl.player[0], lvl.player[1]],
        playerDir: 'down',
        animTick: 0,
        mummies: (lvl.mummies || []).map((m, i) => ({
          id: m.id || `m${i + 1}`,
          pos: [m.pos[0], m.pos[1]],
          speed: Number.isFinite(m.speed) ? m.speed : 2,
          priority: m.priority === 'vertical' ? 'vertical' : 'horizontal',
          dir: m.priority === 'vertical' ? 'down' : 'left',
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
        playerDir: s.playerDir,
        animTick: s.animTick,
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
      s.playerDir = dir;
      s.player = [nx, ny];
      pickupAtPlayer(s);
      return true;
    }

    function pickupAtPlayer(s) {
      activateKeyAt(s, s.player[0], s.player[1]);
      const trap = s.traps.find((t) => t.armed && t.pos[0] === s.player[0] && t.pos[1] === s.player[1]);
      if (trap) {
        trap.armed = false;
        s.status = 'fail';
      }
    }

    function activateKeyAt(s, x, y) {
      for (const key of s.keys) {
        if (key.taken || key.pos[0] !== x || key.pos[1] !== y) continue;
        key.taken = true;
        const keyId = key.id || 'key';
        if (!s.carrying.includes(keyId)) s.carrying.push(keyId);
        for (const gate of s.gates) {
          if (!gate.open && (!gate.requires || gate.requires === keyId)) gate.open = true;
        }
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
          if (mummyWalkable(s, nx, my)) {
            mummy.dir = Math.sign(dx) > 0 ? 'right' : 'left';
            mummy.pos = [nx, my];
            activateKeyAt(s, nx, my);
            return true;
          }
        } else if (axis === 'v' && dy !== 0) {
          const ny = my + Math.sign(dy);
          if (mummyWalkable(s, mx, ny)) {
            mummy.dir = Math.sign(dy) > 0 ? 'down' : 'up';
            mummy.pos = [mx, ny];
            activateKeyAt(s, mx, ny);
            return true;
          }
        }
      }
      return false;
    }

    function resolveMummyCollisions(s) {
      const byCell = new Map();
      for (const mummy of s.mummies) {
        if (!mummy.alive) continue;
        const key = mummy.pos.join(',');
        const group = byCell.get(key) || [];
        group.push(mummy);
        byCell.set(key, group);
      }
      for (const group of byCell.values()) {
        if (group.length < 2) continue;
        group
          .sort((a, b) => (b.speed || 0) - (a.speed || 0) || String(a.id).localeCompare(String(b.id)))
          .slice(1)
          .forEach((m) => { m.alive = false; });
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
      s.animTick = (s.animTick || 0) + 1;
      if (checkCatch(s)) { s.status = 'fail'; return true; }
      if (s.status === 'fail') return true;
      for (const mummy of s.mummies) {
        if (!mummy.alive) continue;
        for (let step = 0; step < mummy.speed; step++) {
          mummyMoveStep(s, mummy);
          resolveMummyCollisions(s);
          if (!mummy.alive) break;
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
      const beforePlayer = [state.player[0], state.player[1]];
      const beforeMummies = state.mummies.map((m) => ({ id: m.id, pos: [m.pos[0], m.pos[1]], alive: m.alive }));
      if (!step(state, action)) return;
      beginMotion(action, beforePlayer, beforeMummies);
      history.push(snap);
      render();
      requestAnimation();
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
      motion = null;
      render();
      onUpdate?.({ turns: state.turns, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
    }

    function reset() {
      Object.assign(state, freshState(level));
      history.length = 0;
      motion = null;
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
      const scripted = level.solution?.[fromState.turns || 0];
      if (scripted && DIRS[scripted]) {
        const check = snapshot(fromState);
        if (step(check, scripted)) return scripted;
      }
      const start = snapshot(fromState);
      const seen = new Set();
      const queue = [{ s: start, first: null, depth: 0 }];
      seen.add(stateKey(start));
      const maxDepth = Number.isFinite(level.maxSolverDepth) ? level.maxSolverDepth : 56;
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
          if (seen.size > 120000) return node.first || action;
          queue.push({ s: sim, first: node.first || action, depth: node.depth + 1 });
        }
      }
      return null;
    }

    function stateKey(s) {
      return [
        s.player.join(','),
        s.mummies.map((m) => `${m.alive ? '1' : '0'}:${m.pos.join(',')}`).join('|'),
        s.keys.map((k) => k.taken ? '1' : '0').join(''),
        s.gates.map((g) => g.open ? '1' : '0').join('')
      ].join('#');
    }

    function beginMotion(action, beforePlayer, beforeMummies) {
      const mummyMoves = [];
      for (const before of beforeMummies) {
        const current = state.mummies.find((m) => m.id === before.id);
        if (!current) continue;
        if (before.pos[0] === current.pos[0] && before.pos[1] === current.pos[1] && before.alive === current.alive) continue;
        mummyMoves.push({
          id: before.id,
          from: before.pos,
          to: [current.pos[0], current.pos[1]],
          aliveFrom: before.alive,
          aliveTo: current.alive
        });
      }
      motion = {
        dir: action,
        started: performance.now(),
        playerFrom: beforePlayer,
        playerTo: [state.player[0], state.player[1]],
        mummyMoves
      };
    }

    function motionProgress() {
      if (!motion) return 1;
      const t = Math.min(1, (performance.now() - motion.started) / moveAnimMs);
      if (t >= 1) motion = null;
      return easeOut(t);
    }

    function isMotionActive() {
      return !!motion && performance.now() - motion.started < moveAnimMs;
    }

    function easeOut(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function lerpCell(from, to, t) {
      if (!from || !to) return to || from || [0, 0];
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    }

    function requestAnimation() {
      if (!mounted || animationFrame) return;
      animationFrame = requestAnimationFrame(function tick() {
        animationFrame = null;
        render();
        if (isMotionActive()) requestAnimation();
      });
    }

    let tilePx = 48;
    function computeTileSize() {
      const rect = stage.getBoundingClientRect();
      const usableW = Math.max(160, (rect.width || 320) - 16);
      const usableH = Math.max(160, (rect.height || 320) - 16);
      const px = Math.floor(Math.min(usableW / level.width, usableH / level.height));
      tilePx = Math.max(22, Math.min(64, px));
      const nextW = tilePx * level.width;
      const nextH = tilePx * level.height;
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
    }

    const SPRITE_COLORS = {
      floor: '#473722',
      floorAlt: '#554127',
      wall: '#6b4b29',
      wallTop: '#967143',
      exit: '#f0c674',
      player: '#5fb0ff',
      mummy: '#c9b070',
      key: '#f7e26b',
      gate: '#8f5a2c',
      trap: '#a23838'
    };

    let sprites = null;
    (window.CJS?.MinigameSprites?.get?.('mummy_maze') || Promise.resolve(null))
      .then((api) => { sprites = api; render(); requestAnimation(); })
      .catch(() => { sprites = null; });

    function render() {
      computeTileSize();
      const w = level.width, h = level.height;
      const progress = motionProgress();
      drawBoardBackplate();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) drawTile(x, y);
      }
      drawExit(level.exit[0], level.exit[1]);
      for (const trap of state.traps) if (trap.armed) drawTrap(trap.pos[0], trap.pos[1]);
      for (const gate of state.gates) if (!gate.open) drawGate(gate.pos[0], gate.pos[1]);
      for (const key of state.keys) if (!key.taken) drawKey(key.pos[0], key.pos[1]);
      const playerPos = motion ? lerpCell(motion.playerFrom, motion.playerTo, progress) : state.player;
      drawPlayer(playerPos[0], playerPos[1], progress);
      for (const m of state.mummies) {
        if (!m.alive && !motion?.mummyMoves?.some((move) => move.id === m.id && move.aliveFrom)) continue;
        const move = motion?.mummyMoves?.find((entry) => entry.id === m.id);
        const pos = move ? lerpCell(move.from, move.to, progress) : m.pos;
        if (move && !move.aliveTo && progress > 0.75) continue;
        drawMummy(m, pos[0], pos[1], progress);
      }
      drawBoardVignette();
    }

    function drawSpriteOrFallback(name, x, y, fallback) {
      const px = x * tilePx, py = y * tilePx;
      if (sprites?.has?.(name) && sprites.draw(ctx, name, px, py, tilePx, tilePx)) return true;
      fallback(px, py);
      return false;
    }

    function drawBoardBackplate() {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#2d2116');
      grad.addColorStop(0.52, '#4f3b22');
      grad.addColorStop(1, '#1b1410');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawBoardVignette() {
      const cx = canvas.width * 0.48;
      const cy = canvas.height * 0.44;
      const grad = ctx.createRadialGradient(cx, cy, tilePx * 1.5, cx, cy, Math.max(canvas.width, canvas.height) * 0.78);
      grad.addColorStop(0, 'rgba(255,245,192,0.02)');
      grad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawTile(x, y) {
      if (isWallTile(x, y)) {
        const used = drawSpriteOrFallback('wall', x, y, (px, py) => {
          ctx.fillStyle = SPRITE_COLORS.wall;
          ctx.fillRect(px, py, tilePx, tilePx);
          ctx.fillStyle = SPRITE_COLORS.wallTop;
          ctx.fillRect(px + 2, py + 2, tilePx - 4, Math.max(2, Math.floor(tilePx * 0.18)));
          ctx.strokeStyle = '#1a160d';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
        });
        const px = x * tilePx, py = y * tilePx;
        if (used) {
          ctx.fillStyle = 'rgba(255,210,117,0.12)';
          ctx.fillRect(px + 2, py + 2, tilePx - 4, Math.max(2, tilePx * 0.18));
        }
        ctx.strokeStyle = 'rgba(35,20,10,0.72)';
        ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
      } else {
        const altName = ((x + y) % 2 === 0) ? 'floor' : 'floor_alt';
        const used = drawSpriteOrFallback(altName, x, y, (px, py) => {
          ctx.fillStyle = (x + y) % 2 === 0 ? SPRITE_COLORS.floor : SPRITE_COLORS.floorAlt;
          ctx.fillRect(px, py, tilePx, tilePx);
          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
        });
        const px = x * tilePx, py = y * tilePx;
        if (used) {
          ctx.fillStyle = (x + y) % 2 === 0 ? 'rgba(123,86,42,0.16)' : 'rgba(230,181,85,0.08)';
          ctx.fillRect(px, py, tilePx, tilePx);
        }
        ctx.strokeStyle = 'rgba(255,235,171,0.055)';
        ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
        if ((x * 13 + y * 7) % 6 === 0) {
          ctx.strokeStyle = 'rgba(72,43,22,0.32)';
          ctx.beginPath();
          ctx.moveTo(px + tilePx * 0.2, py + tilePx * 0.34);
          ctx.lineTo(px + tilePx * 0.48, py + tilePx * 0.28);
          ctx.lineTo(px + tilePx * 0.72, py + tilePx * 0.42);
          ctx.stroke();
        }
      }
    }

    function drawExit(x, y) {
      const px = x * tilePx, py = y * tilePx;
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      const glow = ctx.createRadialGradient(cx, cy, tilePx * 0.08, cx, cy, tilePx * 0.55);
      glow.addColorStop(0, 'rgba(255,219,123,0.42)');
      glow.addColorStop(1, 'rgba(255,219,123,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(px, py, tilePx, tilePx);
      drawSpriteOrFallback('exit', x, y, (px, py) => {
        ctx.fillStyle = SPRITE_COLORS.exit;
        ctx.fillRect(px + 4, py + 4, tilePx - 8, tilePx - 8);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(px + 6, py + 6 + i * Math.floor((tilePx - 12) / 4), tilePx - 12, 2);
        }
      });
    }

    function drawPlayer(x, y, progress) {
      const dir = state.playerDir || 'down';
      const frame = motion ? Math.min(3, Math.floor(progress * 4)) : 0;
      const spriteName = `player_${dir}_${frame}`;
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(px + tilePx * 0.5, py + tilePx * 0.84, tilePx * 0.25, tilePx * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      const drawn = drawSpriteOrFallback(spriteName, x, y, (px, py) => {
        const cx = px + tilePx / 2, cy = py + tilePx / 2;
        ctx.fillStyle = SPRITE_COLORS.player;
        ctx.beginPath();
        ctx.arc(cx, cy - tilePx * 0.12, tilePx * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(px + tilePx * 0.3, py + tilePx * 0.42, tilePx * 0.4, tilePx * 0.35);
        ctx.fillStyle = '#1a1f2c';
        ctx.fillRect(px + tilePx * 0.32, py + tilePx * 0.62, tilePx * 0.12, tilePx * 0.18);
        ctx.fillRect(px + tilePx * 0.56, py + tilePx * 0.62, tilePx * 0.12, tilePx * 0.18);
      });
      if (!drawn) return;
      ctx.strokeStyle = 'rgba(117,215,208,0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px + tilePx * 0.5, py + tilePx * 0.55, tilePx * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawMummy(mummy, x, y, progress) {
      if (!mummy.alive && !motion) return;
      const dir = mummy.dir || (mummy.priority === 'vertical' ? 'down' : 'left');
      const frame = motion ? Math.min(3, Math.floor(progress * 4)) : 0;
      const spriteName = `mummy_${dir}_${frame}`;
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(px + tilePx * 0.5, py + tilePx * 0.82, tilePx * 0.34, tilePx * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSpriteOrFallback(spriteName, x, y, (px, py) => {
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
      });
      ctx.fillStyle = mummy.priority === 'vertical' ? 'rgba(221,106,100,0.86)' : 'rgba(117,215,208,0.86)';
      ctx.beginPath();
      ctx.arc(px + tilePx * 0.78, py + tilePx * 0.22, Math.max(3, tilePx * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }

    function drawKey(x, y) {
      const px = x * tilePx, py = y * tilePx;
      if (sprites?.has?.('key') && sprites.draw(ctx, 'key', px, py, tilePx, tilePx)) return;
      ctx.fillStyle = 'rgba(247,226,107,0.15)';
      ctx.beginPath();
      ctx.arc(px + tilePx * 0.5, py + tilePx * 0.5, tilePx * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SPRITE_COLORS.key;
      ctx.beginPath();
      ctx.arc(px + tilePx * 0.35, py + tilePx * 0.5, tilePx * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + tilePx * 0.45, py + tilePx * 0.46, tilePx * 0.35, tilePx * 0.08);
      ctx.fillRect(px + tilePx * 0.7, py + tilePx * 0.54, tilePx * 0.04, tilePx * 0.12);
    }

    function drawGate(x, y) {
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px + 4, py + 4, tilePx - 8, tilePx - 8);
      drawSpriteOrFallback('gate', x, y, (px, py) => {
        ctx.fillStyle = SPRITE_COLORS.gate;
        ctx.fillRect(px + 4, py + 4, tilePx - 8, tilePx - 8);
        ctx.fillStyle = '#3b2715';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(px + 6, py + 8 + i * Math.floor((tilePx - 12) / 3), tilePx - 12, 2);
        }
      });
      ctx.strokeStyle = 'rgba(240,198,116,0.48)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 5, py + 5, tilePx - 10, tilePx - 10);
    }

    function drawTrap(x, y) {
      const px = x * tilePx, py = y * tilePx;
      if (sprites?.has?.('trap') && sprites.draw(ctx, 'trap', px, py, tilePx, tilePx)) return;
      ctx.fillStyle = SPRITE_COLORS.trap;
      ctx.beginPath();
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      const r = tilePx * 0.28;
      ctx.fillStyle = 'rgba(162,56,56,0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, tilePx * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SPRITE_COLORS.trap;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rx = cx + Math.cos(a) * r;
        const ry = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5b1a1a';
      ctx.lineWidth = 1;
      ctx.stroke();
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
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
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
