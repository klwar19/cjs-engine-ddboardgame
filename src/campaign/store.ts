import { useCallback, useRef, useSyncExternalStore } from "react";
import { shallowEqual } from "./util/equality";

// Minimal typed surface for the legacy CampaignState module living on
// window.CJS. The vanilla state object has dozens of fields; we type only
// what the React shell currently reads. Anything richer can be widened
// per-tab as those tabs migrate.
export interface CampaignStateSnapshot {
  readonly campaignId?: string;
  readonly currentWorld?: string;
  readonly activeAppMode?: string;
  readonly activeTab?: string;
  // Vanilla CampaignState stores session events under `log` (singular).
  readonly log?: readonly unknown[];
  readonly pendingBattle?: unknown;
  readonly [key: string]: unknown;
}

interface CampaignStateModule {
  readonly getState: () => CampaignStateSnapshot | null;
  readonly subscribe: (
    listener: (state: CampaignStateSnapshot, change: { type?: string; source?: string }) => void
  ) => () => void;
  readonly getCurrentCampaign: () => unknown;
  readonly getCurrentWorld: () => unknown;
}

interface Cjs {
  readonly CampaignState?: CampaignStateModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getCampaignState(): CampaignStateModule | null {
  return cjs().CampaignState ?? null;
}

// ── Store ────────────────────────────────────────────────────────────────
// Single subscribable source of truth for the React campaign shell. Mirrors
// `src/combat/store.ts`: a store class with a stable `subscribe`/`getSnapshot`
// pair, a `queueMicrotask` commit that dedupes a burst of signals into one
// notification, and `useSyncExternalStore`-backed hooks.
//
// Unlike the combat store (which owns thin version-counter snapshots with
// structural sharing), the campaign snapshot carries the engine's CampaignState
// object — which is fully re-cloned on every mutation. So slice selectors here
// take a value-equality comparator (see `useCampaignSelector`); reference
// equality alone never reports a deep-cloned slice as unchanged.
//
// Signals the store listens to:
//   • `campaign:state-tick` / `campaign:rendered` DOM events — the SUPERSET
//     signal. `boot.ts::render()` dispatches `state-tick` after every data
//     mutation (boot subscribes CampaignState → render) AND every chrome
//     change (setActiveMode/Tab/Panel → render). Dispatched on #campaign-root
//     with bubbles:false, so we listen on document in the CAPTURE phase, which
//     still observes a non-bubbling event on a descendant.
//   • `CampaignState.subscribe` — the direct data signal, attached with a
//     bounded retry (the engine module may not exist yet at first subscribe).
//     Strictly belt-and-suspenders given the DOM superset, but it matches the
//     pre-store `useCampaignState` exactly and seeds the snapshot the moment
//     the engine becomes readable.

export interface CampaignSnapshot {
  readonly state: CampaignStateSnapshot | null;
  // Monotonic counter, bumped once per committed change. `tick` is the public
  // name the shell has always seen; internally it is the store version.
  readonly tick: number;
}

type Listener = () => void;

class CampaignStore {
  private snapshot: CampaignSnapshot = { state: null, tick: 0 };
  private listeners = new Set<Listener>();
  private unsubState: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduled = false;
  private readonly domHandler = () => this.scheduleCommit();

  subscribe = (listener: Listener): (() => void) => {
    const first = this.listeners.size === 0;
    this.listeners.add(listener);
    if (first) this.attach();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.detach();
    };
  };

  getSnapshot = (): CampaignSnapshot => this.snapshot;

  getVersion = (): number => this.snapshot.tick;

  getState = (): CampaignStateSnapshot | null => this.snapshot.state;

  private attach(): void {
    document.addEventListener("campaign:state-tick", this.domHandler, true);
    document.addEventListener("campaign:rendered", this.domHandler, true);
    this.attachState(0);
    // Seed synchronously from whatever the engine holds right now, so the very
    // first render after subscribe reflects an already-booted engine without
    // waiting for the next tick.
    const state = getCampaignState()?.getState() ?? null;
    if (state !== this.snapshot.state) {
      this.snapshot = { state, tick: this.snapshot.tick };
    }
  }

  private attachState(tries: number): void {
    if (this.listeners.size === 0) return;
    const cs = getCampaignState();
    if (cs) {
      this.unsubState = cs.subscribe(() => this.scheduleCommit());
      // The engine just became readable — fold its current state in.
      this.scheduleCommit();
      return;
    }
    if (tries > 200) return;
    this.retryTimer = setTimeout(() => this.attachState(tries + 1), 40);
  }

  private detach(): void {
    document.removeEventListener("campaign:state-tick", this.domHandler, true);
    document.removeEventListener("campaign:rendered", this.domHandler, true);
    if (this.unsubState) {
      try { this.unsubState(); } catch { /* ignore */ }
      this.unsubState = null;
    }
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.scheduled = false;
  }

  // Coalesce a burst of synchronous signals (e.g. a data mutation's direct
  // CampaignState emit + the render()-driven state-tick that follows it) into
  // a single commit on the microtask. The commit reads the FINAL engine state,
  // which is also post-`normalizeForWorld` (render normalizes synchronously
  // before dispatching state-tick), so the shell never paints a transient
  // pre-normalize chrome.
  private scheduleCommit(): void {
    if (this.scheduled || this.listeners.size === 0) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.listeners.size === 0) return;
      this.commit();
    });
  }

  private commit(): void {
    const state = getCampaignState()?.getState() ?? null;
    this.snapshot = { state, tick: this.snapshot.tick + 1 };
    for (const listener of this.listeners) {
      try { listener(); } catch (err) { console.error("CampaignStore listener:", err); }
    }
  }
}

export const campaignStore = new CampaignStore();

// ── Hooks ──────────────────────────────────────────────────────────────────

// Whole-snapshot subscription. Returns `{ state, tick }` and re-renders on
// every committed change (chrome or data) — the contract the shell has always
// relied on. Reimplemented on the store: the previous hand-rolled subscribe +
// retry loop and the shell's separate state-tick listener now live in one
// place. `getSnapshot` returns a reference-stable object between commits, so
// `useSyncExternalStore` does not loop.
export function useCampaignState(): CampaignSnapshot {
  return useSyncExternalStore(
    campaignStore.subscribe,
    campaignStore.getSnapshot,
    campaignStore.getSnapshot
  );
}

// Tiny ready-gate: true once the engine has loaded a save and getState()
// returns a non-null snapshot.
export function useCampaignReady(): boolean {
  return useCampaignState().state != null;
}

// Slice subscription. Re-renders the consumer only when `selector(state)`
// changes by VALUE (`isEqual`, default `shallowEqual`). Because the engine
// re-clones the whole state on every change, the selected slice is a fresh
// object each commit; `isEqual` is what lets us keep the previous reference
// and skip the consumer's re-render when its data is unchanged.
//
// Implementation note: each hook instance keeps a per-instance cache keyed by
// the store version, and `getSelection` recomputes only when the version
// advances — that is what makes `getSnapshot` referentially stable within a
// commit (a hard requirement of `useSyncExternalStore`) even though the
// selector produces a new object each call. This mirrors what React's own
// `useSyncExternalStoreWithSelector` shim does, hand-rolled to add the
// value-equality the deep-clone reality demands and to avoid a dependency.
export function useCampaignSelector<T>(
  selector: (state: CampaignStateSnapshot | null) => T,
  isEqual: (a: T, b: T) => boolean = shallowEqual
): T {
  const cache = useRef<{ tick: number; value: T; has: boolean }>({
    tick: -1,
    value: undefined as unknown as T,
    has: false
  });

  const getSelection = useCallback((): T => {
    const snap = campaignStore.getSnapshot();
    const c = cache.current;
    if (c.has && c.tick === snap.tick) return c.value;
    const next = selector(snap.state);
    if (c.has && isEqual(c.value, next)) {
      c.tick = snap.tick;
      return c.value;
    }
    c.tick = snap.tick;
    c.value = next;
    c.has = true;
    return next;
  }, [selector, isEqual]);

  return useSyncExternalStore(campaignStore.subscribe, getSelection, getSelection);
}
