import { useEffect, useState } from "react";

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

// Subscribe to the vanilla CampaignState. Returns the latest snapshot and a
// monotonically increasing tick so consumers that depend on identity-mutated
// fields still re-render on every emit.
export function useCampaignState(): {
  state: CampaignStateSnapshot | null;
  tick: number;
} {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<CampaignStateSnapshot | null>(() => {
    return getCampaignState()?.getState() ?? null;
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let tries = 0;

    const attach = () => {
      if (cancelled) return;
      const cs = getCampaignState();
      if (!cs) {
        tries += 1;
        if (tries > 200) {
          console.warn("useCampaignState: CJS.CampaignState never appeared");
          return;
        }
        window.setTimeout(attach, 40);
        return;
      }
      setState(cs.getState());
      setTick((t) => t + 1);
      unsubscribe = cs.subscribe((next) => {
        setState(next);
        setTick((t) => t + 1);
      });
    };

    attach();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { state, tick };
}

// Tiny ready-gate: returns true once the vanilla CampaignState has loaded
// a save and `getState()` returns a non-null snapshot.
export function useCampaignReady(): boolean {
  const { state } = useCampaignState();
  return state != null;
}
