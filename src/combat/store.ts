// Combat store — single subscribable source of truth for the React combat
// shell. Mirrors what the vanilla engine modules (CombatManager, CombatLog,
// NarratorEngine, AudioManager) already emit, and re-exposes them through
// React-friendly hooks so components can pick the slice they need.
//
// The store does NOT own combat state — the engine still does. The store
// just multiplexes the engine subscriptions, dedupes refresh notifies, and
// gives React a stable "version" counter to react to.

import { useEffect, useState, useSyncExternalStore } from "react";

export interface LogEntry {
  readonly type?: string;
  readonly turn?: number;
  readonly actor?: { name?: string; baseId?: string; pos?: readonly number[] };
  readonly target?: { name?: string; baseId?: string; pos?: readonly number[] };
  readonly data?: Record<string, unknown>;
  readonly tags?: readonly string[];
  readonly message?: string;
}

export interface BgmState {
  readonly playing?: boolean;
  readonly currentId?: string | null;
  readonly error?: string | null;
}

interface CjsAny {
  CombatManager?: {
    subscribe?: (cb: (state: unknown) => void) => () => void;
    getState?: () => unknown;
  };
  CombatLog?: {
    subscribe?: (cb: (entry: LogEntry) => void) => () => void;
  };
  NarratorEngine?: {
    subscribe?: (cb: (text: string) => void) => () => void;
  };
  NarratorData?: {
    isLoaded?: () => boolean;
  };
  AudioManager?: {
    subscribe?: (cb: () => void) => () => void;
    getBgmState?: () => BgmState;
    isMuted?: () => boolean;
  };
  CombatSettings?: {
    getDiceMode?: () => string;
    setDiceMode?: (mode: string) => void;
    queueDice?: (values: number[]) => void;
    setDicePromptFn?: (fn: ((expr: string, source: string) => number | null) | null) => void;
    getAnimationsEnabled?: () => boolean;
    setAnimationsEnabled?: (flag: boolean) => void;
    isAutoActive?: () => boolean;
    getAutoScope?: () => string | null;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

type Listener = () => void;

interface StoreShape {
  combatVersion: number;
  logVersion: number;
  logEntries: LogEntry[];
  narratorVersion: number;
  narratorLines: string[];
  bgmVersion: number;
}

class CombatStore {
  private state: StoreShape = {
    combatVersion: 0,
    logVersion: 0,
    logEntries: [],
    narratorVersion: 0,
    narratorLines: [],
    bgmVersion: 0
  };
  private snapshot: StoreShape = this.state;
  private listeners: Set<Listener> = new Set();
  private unsubCm: (() => void) | null = null;
  private unsubLog: (() => void) | null = null;
  private unsubNarrator: (() => void) | null = null;
  private unsubBgm: (() => void) | null = null;
  private rafScheduled = false;

  attach(): void {
    this.detach();
    const c = cjs();
    if (c.CombatManager?.subscribe) {
      this.unsubCm = c.CombatManager.subscribe(() => this.bumpCombat());
    }
    if (c.CombatLog?.subscribe) {
      this.unsubLog = c.CombatLog.subscribe((entry) => this.pushLog(entry));
    }
    if (c.AudioManager?.subscribe) {
      this.unsubBgm = c.AudioManager.subscribe(() => this.bumpBgm());
    }
    // Narrator subscription is rebuilt every startCombat — managed via attachNarrator()
  }

  attachNarrator(): void {
    this.detachNarrator();
    const c = cjs();
    if (c.NarratorEngine?.subscribe) {
      this.unsubNarrator = c.NarratorEngine.subscribe((text) => this.pushNarration(text));
    }
  }

  detachNarrator(): void {
    if (this.unsubNarrator) {
      try { this.unsubNarrator(); } catch { /* ignore */ }
      this.unsubNarrator = null;
    }
  }

  detach(): void {
    if (this.unsubCm) {
      try { this.unsubCm(); } catch { /* ignore */ }
      this.unsubCm = null;
    }
    if (this.unsubLog) {
      try { this.unsubLog(); } catch { /* ignore */ }
      this.unsubLog = null;
    }
    if (this.unsubBgm) {
      try { this.unsubBgm(); } catch { /* ignore */ }
      this.unsubBgm = null;
    }
    this.detachNarrator();
  }

  resetFeed(): void {
    this.state = {
      ...this.state,
      logVersion: this.state.logVersion + 1,
      logEntries: [],
      narratorVersion: this.state.narratorVersion + 1,
      narratorLines: []
    };
    this.commit();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StoreShape => {
    return this.snapshot;
  };

  bumpCombat(): void {
    this.state = { ...this.state, combatVersion: this.state.combatVersion + 1 };
    this.scheduleCommit();
  }

  bumpBgm(): void {
    this.state = { ...this.state, bgmVersion: this.state.bgmVersion + 1 };
    this.scheduleCommit();
  }

  pushLog(entry: LogEntry): void {
    if (!entry) return;
    const next = [...this.state.logEntries, entry];
    while (next.length > 200) next.shift();
    this.state = {
      ...this.state,
      logVersion: this.state.logVersion + 1,
      logEntries: next
    };
    this.scheduleCommit();
  }

  pushNarration(text: string): void {
    if (!text) return;
    // [CJS] editorial lines belong to the L2D companion's speech bubble,
    // not the battle report. Strip them here so the panel stays a
    // clean blow-by-blow.
    const lines = text.split("\n").filter((line) => !/^\s*\[CJS\]/.test(line));
    if (!lines.length) return;
    const joined = lines.join("\n");
    const next = [...this.state.narratorLines, joined];
    while (next.length > 60) next.shift();
    this.state = {
      ...this.state,
      narratorVersion: this.state.narratorVersion + 1,
      narratorLines: next
    };
    this.scheduleCommit();
  }

  private scheduleCommit(): void {
    if (this.rafScheduled) return;
    this.rafScheduled = true;
    queueMicrotask(() => {
      this.rafScheduled = false;
      this.commit();
    });
  }

  private commit(): void {
    this.snapshot = this.state;
    for (const listener of this.listeners) {
      try { listener(); } catch (err) { console.error("CombatStore listener:", err); }
    }
  }
}

export const combatStore = new CombatStore();

// Backwards-compatible refresh shim. The vanilla data-hot-reload module
// calls window.CJS.CombatUI?.refresh() after content edits so the UI
// pulls fresh skill names / item icons; React doesn't auto-rerender on
// DataStore writes, so we route those calls back into the store's
// version counter. Only `refresh` is implemented — init/destroy are
// no-ops since React owns the lifecycle now.
(() => {
  const win = window as unknown as {
    CJS?: { CombatUI?: { refresh: () => void; init?: () => void; destroy?: () => void } };
  };
  const root = (win.CJS = win.CJS || {});
  if (!root.CombatUI) {
    root.CombatUI = {
      refresh: () => combatStore.bumpCombat(),
      init: () => {},
      destroy: () => {}
    };
  }
})();

export function useCombatStore<T>(selector: (state: StoreShape) => T): T {
  return useSyncExternalStore(
    combatStore.subscribe,
    () => selector(combatStore.getSnapshot()),
    () => selector(combatStore.getSnapshot())
  );
}

export function useCombatVersion(): number {
  return useCombatStore((s) => s.combatVersion);
}

export function useLogEntries(): readonly LogEntry[] {
  return useCombatStore((s) => s.logEntries);
}

export function useNarratorLines(): readonly string[] {
  return useCombatStore((s) => s.narratorLines);
}

export function useBgmVersion(): number {
  return useCombatStore((s) => s.bgmVersion);
}

// Ergonomic hook: state-snapshot + version-bound rerenders. Pass a selector
// over the live CombatManager state. Returns null until combat has started.
export function useCombatSelector<T>(selector: (state: unknown) => T): T | null {
  const version = useCombatVersion();
  const [value, setValue] = useState<T | null>(() => {
    const s = cjs().CombatManager?.getState?.();
    return s ? selector(s) : null;
  });
  useEffect(() => {
    const s = cjs().CombatManager?.getState?.();
    setValue(s ? selector(s) : null);
    // We deliberately re-run on version change to pick up engine mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return value;
}
