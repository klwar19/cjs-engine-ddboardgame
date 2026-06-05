// minigame-registry.js
// Tier 3 TS port -> src/engine/minigames/minigame-registry.ts (exports MinigameRegistry + installs window.CJS.MinigameRegistry). Body verbatim.
// Registry of mini-game factories. Games self-register on script load.

window.CJS = window.CJS || {};

export const MinigameRegistry = (() => {
  'use strict';

  const games = new Map();

  function register(meta, factory) {
    if (!meta || !meta.id) throw new Error('Minigame meta requires id');
    if (typeof factory !== 'function') throw new Error('Minigame factory must be a function');
    games.set(meta.id, { meta, factory });
  }

  function getGame(gameId) {
    return games.get(gameId) || null;
  }

  function listGames() {
    return Array.from(games.values()).map((entry) => ({ ...entry.meta }));
  }

  function has(gameId) {
    return games.has(gameId);
  }

  return { register, getGame, listGames, has };
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.MinigameRegistry = MinigameRegistry;
