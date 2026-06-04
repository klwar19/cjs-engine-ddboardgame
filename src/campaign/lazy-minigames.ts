// lazy-minigames.ts — defer the minigame + QTE engine off the campaign boot
// path (Tier 1 perf).
//
// The js/minigames/* + js/qte/* modules are side-effect IIFEs that register on
// window.CJS. They are only needed when a minigame / QTE / fishing session
// actually runs (a user action), never at first paint — but importing them
// statically in main.tsx pulled cjs-minigames + cjs-qte into the campaign
// page's eager modulepreload set. Behind this single memoized dynamic import
// they drop out of the initial download; main.tsx warms them in the background
// once the shell has painted, and the launch action handlers await this first
// so a session never opens against an unloaded engine.
let pending: Promise<unknown> | null = null;

export function ensureMinigameEngine(): Promise<unknown> {
  if (!pending) pending = import("./minigames-bundle");
  return pending;
}
