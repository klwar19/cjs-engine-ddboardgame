// minigame-host.js
// Hosts a mini-game instance inside a modal overlay (or any container) and
// translates the game's onComplete callback into the shared CJS result object.

window.CJS = window.CJS || {};

window.CJS.Minigames = (() => {
  'use strict';

  const Registry = () => window.CJS.MinigameRegistry;

  let activeSession = null;

  function listGames() {
    return Registry().listGames();
  }

  function getGame(gameId) {
    const entry = Registry().getGame(gameId);
    return entry ? { ...entry.meta } : null;
  }

  async function loadLevels(gameId, manifest) {
    if (manifest && manifest[gameId]) return manifest[gameId];
    const path = `data/minigames/${gameId}_levels.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data?.levels) ? data.levels : [];
    } catch (err) {
      console.warn(`Minigames: failed to load levels for ${gameId}`, err);
      return [];
    }
  }

  function pickLevel(levels, opts) {
    if (!levels.length) return null;
    if (opts.levelId) {
      const found = levels.find((l) => l.id === opts.levelId);
      if (found) return found;
    }
    if (opts.difficulty != null) {
      const byDiff = levels.filter((l) => Number(l.difficulty) === Number(opts.difficulty));
      if (byDiff.length) return seededPick(byDiff, opts.seed);
    }
    return seededPick(levels, opts.seed);
  }

  function seededPick(arr, seed) {
    if (!arr.length) return null;
    if (seed == null) return arr[Math.floor(Math.random() * arr.length)];
    let h = 0;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return arr[Math.abs(h) % arr.length];
  }

  function buildScaffold(gameMeta, level, opts) {
    const root = document.createElement('div');
    root.className = 'minigame-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', `${gameMeta.title || gameMeta.id} mini-game`);

    const shell = document.createElement('div');
    shell.className = `minigame-shell minigame-theme-${opts.theme || level?.theme || gameMeta.theme || 'tomb'}`;

    shell.innerHTML = `
      <header class="minigame-header">
        <div class="minigame-title">
          <span class="minigame-badge">Mini-Game</span>
          <h2>${escapeHtml(gameMeta.title || gameMeta.id)}</h2>
          <p class="minigame-sub" data-mg="level-title">${escapeHtml(level?.title || '')}</p>
        </div>
        <div class="minigame-stats">
          <span data-mg="turns">Turns: 0</span>
          <span data-mg="hints">Hints: 0</span>
          <span data-mg="status">In play</span>
        </div>
      </header>
      <main class="minigame-stage" data-mg="stage" tabindex="0">
        <canvas data-mg="canvas" width="320" height="320" aria-label="Mini-game board"></canvas>
        <div class="minigame-touchpad" data-mg="touchpad">
          <button data-act="up" aria-label="Move up">▲</button>
          <div class="minigame-touchrow">
            <button data-act="left" aria-label="Move left">◀</button>
            <button data-act="wait" aria-label="Wait">●</button>
            <button data-act="right" aria-label="Move right">▶</button>
          </div>
          <button data-act="down" aria-label="Move down">▼</button>
        </div>
      </main>
      <footer class="minigame-controls">
        <button data-act="undo">Undo</button>
        <button data-act="reset">Reset</button>
        <button data-act="hint">Hint</button>
        <button data-act="giveup" class="minigame-danger">Give Up</button>
        <button data-act="exit" class="minigame-ghost">Exit</button>
      </footer>
      <div class="minigame-result" data-mg="result" hidden>
        <h3 data-mg="result-title">—</h3>
        <pre data-mg="result-json"></pre>
        <div class="minigame-result-actions">
          <button data-act="result-retry">Retry</button>
          <button data-act="result-close">Close</button>
        </div>
      </div>
    `;
    root.appendChild(shell);
    return root;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function buildResult(gameMeta, level, summary, opts) {
    const status = summary.status; // 'win' | 'fail' | 'giveup'
    const tags = [
      `minigame:${gameMeta.id}`,
      `puzzle:${level?.theme || gameMeta.theme || 'tomb'}`,
      `result:${status}`
    ];
    if (level?.difficulty != null) tags.push(`difficulty:${level.difficulty}`);
    const suggestedOps = [];
    if (status === 'win') {
      if (opts.questId || opts.objectiveId) {
        suggestedOps.push({
          op: 'update_quest_progress',
          questId: opts.questId || null,
          objectiveId: opts.objectiveId || null,
          amount: 1
        });
      }
      suggestedOps.push({ op: 'log', text: `Mini-game cleared: ${gameMeta.title || gameMeta.id}.` });
      if (Array.isArray(opts.onWinOps)) suggestedOps.push(...opts.onWinOps);
    } else if (status === 'fail' || status === 'giveup') {
      suggestedOps.push({ op: 'log', text: `Mini-game ${status === 'giveup' ? 'abandoned' : 'failed'}: ${gameMeta.title || gameMeta.id}.` });
      if (Array.isArray(opts.onLoseOps)) suggestedOps.push(...opts.onLoseOps);
    }
    return {
      gameId: gameMeta.id,
      levelId: level?.id || null,
      status,
      turns: summary.turns || 0,
      hintsUsed: summary.hintsUsed || 0,
      score: scoreOf(summary, level),
      tags,
      suggestedOps,
      source: opts.source || null,
      questId: opts.questId || null,
      eventId: opts.eventId || null,
      mapId: opts.mapId || null,
      nodeId: opts.nodeId || null
    };
  }

  function scoreOf(summary, level) {
    if (summary.status !== 'win') return 0;
    const base = 100;
    const optimal = level?.optimalTurns || level?.optimalMoves || summary.turns || 1;
    const ratio = optimal / Math.max(summary.turns || 1, 1);
    const hintPenalty = Math.min(40, (summary.hintsUsed || 0) * 8);
    return Math.max(10, Math.round(base * Math.min(1, ratio) - hintPenalty));
  }

  async function openMiniGame(opts = {}) {
    if (activeSession) {
      try { activeSession.close(); } catch (_) {}
      activeSession = null;
    }
    const reg = Registry();
    const gameId = opts.gameId;
    const entry = reg && reg.getGame(gameId);
    if (!entry) {
      console.warn(`Minigames: unknown gameId "${gameId}"`);
      if (typeof opts.onComplete === 'function') {
        opts.onComplete({
          gameId, levelId: opts.levelId || null, status: 'error',
          turns: 0, hintsUsed: 0, score: 0,
          tags: [`minigame:${gameId}`, 'result:error'],
          suggestedOps: [{ op: 'log', text: `Unknown mini-game: ${gameId}` }]
        });
      }
      return null;
    }

    const levels = await loadLevels(gameId, opts.levelsManifest);
    const level = pickLevel(levels, opts);
    if (!level) {
      if (typeof opts.onComplete === 'function') {
        opts.onComplete({
          gameId, levelId: opts.levelId || null, status: 'error',
          turns: 0, hintsUsed: 0, score: 0,
          tags: [`minigame:${gameId}`, 'result:error'],
          suggestedOps: [{ op: 'log', text: `No level data for ${gameId}` }]
        });
      }
      return null;
    }

    const container = opts.container || document.body;
    const root = buildScaffold(entry.meta, level, opts);
    container.appendChild(root);

    const stage = root.querySelector('[data-mg="stage"]');
    const canvas = root.querySelector('[data-mg="canvas"]');
    const turnsEl = root.querySelector('[data-mg="turns"]');
    const hintsEl = root.querySelector('[data-mg="hints"]');
    const statusEl = root.querySelector('[data-mg="status"]');
    const resultPane = root.querySelector('[data-mg="result"]');
    const resultTitle = root.querySelector('[data-mg="result-title"]');
    const resultJson = root.querySelector('[data-mg="result-json"]');

    function setStats(s) {
      if (turnsEl) turnsEl.textContent = `Turns: ${s.turns || 0}`;
      if (hintsEl) hintsEl.textContent = `Hints: ${s.hintsUsed || 0}`;
      if (statusEl) statusEl.textContent = s.statusLabel || 'In play';
    }

    const game = entry.factory({
      canvas,
      stage,
      level,
      options: opts,
      onUpdate: (state) => setStats(state),
      onComplete: (summary) => finalize(summary)
    });

    let finalized = false;
    let lastResult = null;

    function finalize(summary) {
      if (finalized) return;
      finalized = true;
      lastResult = buildResult(entry.meta, level, summary, opts);
      setStats({ ...summary, statusLabel: summary.status === 'win' ? 'Cleared!' : summary.status === 'fail' ? 'Failed' : 'Abandoned' });
      if (resultPane) {
        resultPane.hidden = false;
        resultTitle.textContent =
          summary.status === 'win' ? 'Cleared!' :
          summary.status === 'fail' ? 'You were caught!' :
          'Given up.';
        resultJson.textContent = JSON.stringify(lastResult, null, 2);
      }
      if (typeof opts.onComplete === 'function') {
        try { opts.onComplete(lastResult); } catch (err) { console.error('onComplete error', err); }
      }
    }

    function close() {
      try { game.unmount && game.unmount(); } catch (_) {}
      try { root.remove(); } catch (_) {}
      activeSession = null;
    }

    function closeActive(reason) {
      if (!finalized) finalize({ status: reason || 'giveup', turns: game.getTurns?.() || 0, hintsUsed: game.getHintsUsed?.() || 0 });
      close();
    }

    root.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.dataset.act;
      if (!act) return;
      if (['up','down','left','right','wait'].includes(act)) {
        game.handleAction?.(act);
      } else if (act === 'undo') {
        game.undo?.();
      } else if (act === 'reset') {
        game.reset?.();
      } else if (act === 'hint') {
        game.hint?.();
      } else if (act === 'giveup') {
        closeActive('giveup');
      } else if (act === 'exit') {
        closeActive('giveup');
      } else if (act === 'result-retry') {
        resultPane.hidden = true;
        finalized = false;
        lastResult = null;
        game.reset?.();
      } else if (act === 'result-close') {
        close();
      }
    });

    stage.addEventListener('keydown', (ev) => {
      const key = ev.key;
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', a: 'left', s: 'down', d: 'right',
        W: 'up', A: 'left', S: 'down', D: 'right',
        ' ': 'wait', '.': 'wait',
        z: 'undo', Z: 'undo', u: 'undo',
        r: 'reset', R: 'reset',
        h: 'hint', H: 'hint',
        Escape: 'giveup'
      };
      const act = map[key];
      if (!act) return;
      ev.preventDefault();
      if (act === 'undo') game.undo?.();
      else if (act === 'reset') game.reset?.();
      else if (act === 'hint') game.hint?.();
      else if (act === 'giveup') closeActive('giveup');
      else game.handleAction?.(act);
    });

    setTimeout(() => stage.focus(), 0);

    game.mount();
    setStats({ turns: 0, hintsUsed: 0 });

    activeSession = {
      close,
      get result() { return lastResult; }
    };
    return activeSession;
  }

  return { listGames, getGame, openMiniGame };
})();
