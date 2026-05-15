// push-box.js
// Sokoban-style crate puzzle. Player pushes boxes onto goal tiles.
// Cannot pull. Only one box pushed at a time. Win when all goals covered.

(function () {
  'use strict';

  const META = {
    id: 'push_box',
    title: 'Push Box',
    theme: 'guild_storehouse',
    description: 'Push every crate onto a glowing rune. No pulling.',
    actions: ['up', 'down', 'left', 'right'],
    supportsUndo: true,
    supportsHint: true
  };

  const DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]
  };

  function createPushBox({ canvas, stage, level, options, onUpdate, onComplete }) {
    const ctx = canvas.getContext('2d');
    const state = freshState(level);
    const history = [];
    let resizeObserver = null;
    let solveCache = null;

    function freshState(lvl) {
      return {
        player: [lvl.player[0], lvl.player[1]],
        boxes: (lvl.boxes || []).map((b) => [b[0], b[1]]),
        moves: 0,
        pushes: 0,
        hintsUsed: 0,
        status: 'play'
      };
    }

    function isWallTile(x, y) {
      if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
      return (level.walls || []).some((w) => w[0] === x && w[1] === y);
    }

    function isGoal(x, y) {
      return (level.goals || []).some((g) => g[0] === x && g[1] === y);
    }

    function boxAt(s, x, y) {
      return s.boxes.findIndex((b) => b[0] === x && b[1] === y);
    }

    function snapshot(s) {
      return { player: [s.player[0], s.player[1]], boxes: s.boxes.map((b) => [b[0], b[1]]), moves: s.moves, pushes: s.pushes, hintsUsed: s.hintsUsed, status: s.status };
    }

    function restore(s, snap) {
      s.player = [snap.player[0], snap.player[1]];
      s.boxes = snap.boxes.map((b) => [b[0], b[1]]);
      s.moves = snap.moves;
      s.pushes = snap.pushes;
      s.hintsUsed = snap.hintsUsed;
      s.status = snap.status;
    }

    function isWin(s) {
      const goals = level.goals || [];
      if (!goals.length) return false;
      return goals.every((g) => s.boxes.some((b) => b[0] === g[0] && b[1] === g[1]));
    }

    function step(s, dir) {
      if (s.status !== 'play') return false;
      const [dx, dy] = DIRS[dir] || [0, 0];
      if (dx === 0 && dy === 0) return false;
      const nx = s.player[0] + dx;
      const ny = s.player[1] + dy;
      if (isWallTile(nx, ny)) return false;
      const bIdx = boxAt(s, nx, ny);
      if (bIdx >= 0) {
        const bx = nx + dx;
        const by = ny + dy;
        if (isWallTile(bx, by)) return false;
        if (boxAt(s, bx, by) >= 0) return false;
        s.boxes[bIdx] = [bx, by];
        s.pushes += 1;
      }
      s.player = [nx, ny];
      s.moves += 1;
      if (isWin(s)) s.status = 'win';
      return true;
    }

    function deadlockBoxes(s) {
      const flagged = [];
      for (const b of s.boxes) {
        if (isGoal(b[0], b[1])) continue;
        if (isCornerDeadlock(b[0], b[1])) flagged.push(b);
        else if (isWallLineDeadlock(b[0], b[1])) flagged.push(b);
      }
      return flagged;
    }

    function isCornerDeadlock(x, y) {
      const up = isWallTile(x, y - 1);
      const dn = isWallTile(x, y + 1);
      const lt = isWallTile(x - 1, y);
      const rt = isWallTile(x + 1, y);
      return (up && lt) || (up && rt) || (dn && lt) || (dn && rt);
    }

    function isWallLineDeadlock(x, y) {
      const lineHasGoal = (orient) => {
        if (orient === 'h') {
          for (let i = 0; i < level.width; i++) if (isGoal(i, y) && !isWallTile(i, y)) return true;
        } else {
          for (let i = 0; i < level.height; i++) if (isGoal(x, i) && !isWallTile(x, i)) return true;
        }
        return false;
      };
      if (isWallTile(x, y - 1) || isWallTile(x, y + 1)) {
        let blocked = true;
        for (let i = 0; i < level.width; i++) {
          if (i === x) continue;
          const sideUp = isWallTile(i, y - 1);
          const sideDn = isWallTile(i, y + 1);
          if (!(sideUp || sideDn) && !isWallTile(i, y)) { blocked = false; break; }
        }
        if (blocked && !lineHasGoal('h')) return true;
      }
      if (isWallTile(x - 1, y) || isWallTile(x + 1, y)) {
        let blocked = true;
        for (let j = 0; j < level.height; j++) {
          if (j === y) continue;
          const sideLt = isWallTile(x - 1, j);
          const sideRt = isWallTile(x + 1, j);
          if (!(sideLt || sideRt) && !isWallTile(x, j)) { blocked = false; break; }
        }
        if (blocked && !lineHasGoal('v')) return true;
      }
      return false;
    }

    function handleAction(action) {
      if (state.status !== 'play') return;
      if (!DIRS[action]) return;
      const snap = snapshot(state);
      if (!step(state, action)) return;
      history.push(snap);
      solveCache = null;
      render();
      onUpdate?.({ turns: state.moves, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
      if (state.status !== 'play') finalize();
    }

    function statusLabel() {
      if (state.status === 'win') return 'Cleared!';
      if (state.status === 'fail') return 'Stuck';
      return 'In play';
    }

    function finalize() {
      onComplete?.({
        status: state.status,
        turns: state.moves,
        pushes: state.pushes,
        hintsUsed: state.hintsUsed
      });
    }

    function undo() {
      if (!history.length) return;
      const snap = history.pop();
      restore(state, snap);
      solveCache = null;
      render();
      onUpdate?.({ turns: state.moves, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
    }

    function reset() {
      Object.assign(state, freshState(level));
      history.length = 0;
      solveCache = null;
      render();
      onUpdate?.({ turns: 0, hintsUsed: 0, statusLabel: 'In play' });
    }

    function hint() {
      if (state.status !== 'play') return;
      const next = solveNext(state);
      if (!next) {
        flashHint('No solution from here. Try Undo or Reset.');
        return;
      }
      state.hintsUsed += 1;
      flashHint(`Try: ${next.toUpperCase()}`);
      onUpdate?.({ turns: state.moves, hintsUsed: state.hintsUsed, statusLabel: statusLabel() });
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

    function pushBoxKey(s) {
      const sorted = s.boxes.map((b) => `${b[0]},${b[1]}`).sort().join(';');
      return `${s.player[0]},${s.player[1]}|${sorted}`;
    }

    function solveNext(fromState) {
      if (solveCache?.fromKey === pushBoxKey(fromState)) return solveCache.action;
      const start = snapshot(fromState);
      const startKey = pushBoxKey(start);
      const seen = new Set([startKey]);
      const queue = [{ s: start, first: null, depth: 0 }];
      const maxStates = 60000;
      while (queue.length) {
        const node = queue.shift();
        for (const action of Object.keys(DIRS)) {
          const copy = snapshot(node.s);
          if (!step(copy, action)) continue;
          if (copy.status === 'win') {
            const result = node.first || action;
            solveCache = { fromKey: startKey, action: result };
            return result;
          }
          if (deadlockBoxes(copy).length > 0) continue;
          const key = pushBoxKey(copy);
          if (seen.has(key)) continue;
          seen.add(key);
          if (seen.size > maxStates) {
            solveCache = { fromKey: startKey, action: node.first || action };
            return node.first || action;
          }
          queue.push({ s: copy, first: node.first || action, depth: node.depth + 1 });
        }
      }
      solveCache = { fromKey: startKey, action: null };
      return null;
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

    const COLORS = {
      floor: '#1f1b16',
      floorAlt: '#2a241c',
      wall: '#4a3c28',
      wallTop: '#6e573a',
      goal: '#7c5cff',
      box: '#a5763d',
      boxOnGoal: '#7cc77a',
      player: '#5fb0ff',
      deadlock: '#c14848'
    };

    function render() {
      computeTileSize();
      const w = level.width, h = level.height;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          drawTile(x, y);
        }
      }
      for (const g of (level.goals || [])) drawGoal(g[0], g[1]);
      const dead = deadlockBoxes(state);
      for (const b of state.boxes) {
        const onGoal = isGoal(b[0], b[1]);
        const isDead = dead.some((d) => d[0] === b[0] && d[1] === b[1]);
        drawBox(b[0], b[1], onGoal, isDead);
      }
      drawPlayer(state.player[0], state.player[1]);
    }

    function drawTile(x, y) {
      const px = x * tilePx, py = y * tilePx;
      if (isWallTile(x, y)) {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(px, py, tilePx, tilePx);
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(px + 2, py + 2, tilePx - 4, Math.max(2, Math.floor(tilePx * 0.2)));
        ctx.strokeStyle = '#1a160d';
        ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        ctx.fillRect(px, py, tilePx, tilePx);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
      }
    }

    function drawGoal(x, y) {
      const px = x * tilePx, py = y * tilePx;
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      ctx.strokeStyle = COLORS.goal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tilePx * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - tilePx * 0.18, cy);
      ctx.lineTo(cx + tilePx * 0.18, cy);
      ctx.moveTo(cx, cy - tilePx * 0.18);
      ctx.lineTo(cx, cy + tilePx * 0.18);
      ctx.stroke();
    }

    function drawBox(x, y, onGoal, isDead) {
      const px = x * tilePx, py = y * tilePx;
      ctx.fillStyle = onGoal ? COLORS.boxOnGoal : (isDead ? COLORS.deadlock : COLORS.box);
      ctx.fillRect(px + 4, py + 4, tilePx - 8, tilePx - 8);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 4.5, py + 4.5, tilePx - 9, tilePx - 9);
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 4);
      ctx.lineTo(px + tilePx - 4, py + tilePx - 4);
      ctx.moveTo(px + tilePx - 4, py + 4);
      ctx.lineTo(px + 4, py + tilePx - 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.stroke();
    }

    function drawPlayer(x, y) {
      const px = x * tilePx, py = y * tilePx;
      const cx = px + tilePx / 2, cy = py + tilePx / 2;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(cx, cy - tilePx * 0.12, tilePx * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + tilePx * 0.3, py + tilePx * 0.42, tilePx * 0.4, tilePx * 0.35);
      ctx.fillStyle = '#1a1f2c';
      ctx.fillRect(px + tilePx * 0.32, py + tilePx * 0.62, tilePx * 0.12, tilePx * 0.18);
      ctx.fillRect(px + tilePx * 0.56, py + tilePx * 0.62, tilePx * 0.12, tilePx * 0.18);
    }

    function mount() {
      stage.classList.add('minigame-stage--push');
      computeTileSize();
      render();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => render());
        resizeObserver.observe(stage);
      }
    }

    function unmount() {
      try { resizeObserver?.disconnect(); } catch (_) {}
      stage.classList.remove('minigame-stage--push');
    }

    return {
      mount,
      unmount,
      handleAction,
      undo,
      reset,
      hint,
      getTurns: () => state.moves,
      getHintsUsed: () => state.hintsUsed,
      getState: () => snapshot(state),
      _solveNext: solveNext,
      _meta: META
    };
  }

  if (window.CJS && window.CJS.MinigameRegistry) {
    window.CJS.MinigameRegistry.register(META, createPushBox);
  } else {
    window.CJS = window.CJS || {};
    window.CJS._pendingMinigames = window.CJS._pendingMinigames || [];
    window.CJS._pendingMinigames.push([META, createPushBox]);
  }
})();
