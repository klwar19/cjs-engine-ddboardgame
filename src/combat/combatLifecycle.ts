// combatLifecycle — encapsulates the side effects that the original
// combat-ui.startCombat() performed: combat reset, narrator init,
// subscription wiring, BGM pick, portrait preload, grid resize.
// CombatPage calls these in place of CombatUI.init / startCombat /
// destroy so React owns the visual layer end-to-end.

import { combatStore } from "./store";

interface CjsAny {
  CombatManager?: {
    startEncounter?: (id: string) => void;
    runUntilInput?: () => unknown;
    reset?: () => void;
    notify?: () => void;
    getUnits?: () => Array<{ portrait?: string }>;
    getState?: () => { encounter?: { bgm?: string | string[] } } | null;
  };
  CombatSettings?: {
    reset?: () => void;
    setTeamControl?: (team: string, mode: string) => void;
    getDefaultBgmPool?: () => string[];
  };
  CombatLog?: {
    subscribe?: (cb: (entry: unknown) => void) => () => void;
  };
  NarratorEngine?: {
    init?: () => void;
    destroy?: () => void;
    subscribe?: (cb: (text: string) => void) => () => void;
  };
  NarratorData?: { isLoaded?: () => boolean };
  PortraitPicker?: { preloadImage?: (src: string) => void };
  AudioManager?: {
    loadManifest?: () => Promise<unknown>;
    playBgm?: (idOrPool: string | string[], opts?: { fadeMs?: number }) => void;
    stopBgm?: () => void;
  };
  GridRenderer?: {
    resize?: () => void;
    clearMoveAnimations?: () => void;
    destroy?: () => void;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

// Lifecycle is split into "ambient" subscriptions (CombatLog,
// AudioManager — exist as soon as the modules register) and
// "per-encounter" subscriptions (CombatManager — its subscribers list
// lives on the encounter's _state object and is reset each time
// startEncounter() builds a fresh state). We attach ambient channels
// once on CombatPage mount; per-encounter channels re-attach inside
// activateCombat() after the engine has built _state.

export function attachCombatSubscriptions(): void {
  combatStore.attach();
}

export function detachCombatSubscriptions(): void {
  combatStore.detach();
}

// Run before submitting a new encounter to the engine. Mirrors the
// teardown work the original combat-ui.startCombat did before subscribing.
export function prepareCombat(): void {
  combatStore.resetFeed();
  try { cjs().NarratorEngine?.destroy?.(); } catch { /* ignore */ }
}

// Run after CombatManager.startEncounter has been called. Wires the
// narrator (if the data is loaded), preloads portraits, starts the
// encounter's BGM, and primes the engine until it needs input.
//
// Critical: CombatManager.subscribe(fn) only succeeds when _state
// exists, and _state is rebuilt each startEncounter. The store's
// CombatManager subscription must re-attach here so the new _state's
// subscribers list contains it.
export function activateCombat(): void {
  // Re-attach all subscriptions so the CombatManager handle lives on
  // the new _state object.
  combatStore.attach();

  try {
    if (cjs().NarratorData?.isLoaded?.()) {
      cjs().NarratorEngine?.init?.();
      combatStore.attachNarrator();
    }
  } catch (error) {
    console.warn("Narrator init failed (non-fatal):", error);
  }

  const portraitPicker = cjs().PortraitPicker;
  if (portraitPicker?.preloadImage) {
    for (const unit of cjs().CombatManager?.getUnits?.() ?? []) {
      if (unit.portrait) portraitPicker.preloadImage(unit.portrait);
    }
  }

  startEncounterBgm();
  cjs().GridRenderer?.resize?.();
  cjs().CombatManager?.runUntilInput?.();
  // Force one notify so React refreshes with the freshly-built state
  // (subscribers attached *after* startEncounter haven't received the
  // initial _state yet).
  try { cjs().CombatManager?.notify?.(); } catch { /* ignore */ }
}

function startEncounterBgm(): void {
  const am = cjs().AudioManager;
  if (!am?.loadManifest || !am.playBgm) return;
  am.loadManifest()
    .then(() => {
      const enc = cjs().CombatManager?.getState?.()?.encounter || {};
      let pick: string | string[] | undefined = enc.bgm;
      if (
        (!pick || (Array.isArray(pick) && !pick.length)) &&
        cjs().CombatSettings?.getDefaultBgmPool
      ) {
        const pool = cjs().CombatSettings?.getDefaultBgmPool?.() ?? [];
        if (pool.length) pick = pool;
      }
      if (!pick || (Array.isArray(pick) && !pick.length)) return;
      am.playBgm!(pick, { fadeMs: 300 });
    })
    .catch(() => {});
}

// Tear down everything visual when leaving a battle (showSetup, etc.).
export function teardownCombat(): void {
  combatStore.detachNarrator();
  try { cjs().NarratorEngine?.destroy?.(); } catch { /* ignore */ }
  try { cjs().AudioManager?.stopBgm?.(); } catch { /* ignore */ }
  try { cjs().CombatManager?.reset?.(); } catch { /* ignore */ }
}
