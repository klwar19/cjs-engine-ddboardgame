// registry.ts — Phase H.3 campaign action registry.
//
// Each entry here replaces a `case` in the vanilla `_handleAction`
// switch in `js/campaign/campaign-ui.js`. That switch consults this
// registry FIRST (through `window.CJS.CampaignActionsRuntime`), so a
// registered name is the single source of truth for that action across
// every dispatch path:
//   • React onClick → `dispatchCampaignAction` → `CampaignUI.handleAction`
//   • the shell `<main>` + drawer click forwarders
//   • internal delegated callers in campaign-ui.js (e.g. the party-sheet
//     modal's own click delegate)
//
// Porting an action = add it here + delete its `case` from the switch.
// `test_actions_bridge.js` cross-checks that the union of switch cases
// and registry keys exactly covers `CampaignActionName`, and that the
// two sets are disjoint (no dead duplicate).
//
// The handler receives the same camelCase `data` payload the switch case
// read (`data.id`, `data.choice`, `data.worldId`, …), sourced from a DOM
// `dataset` or the `dispatchCampaignAction` payload.

import type { CampaignActionName } from "../actionNames";
import * as Actions from "../actions";

export type ActionData = Record<string, string | number | undefined>;
export type ActionHandler = (data: ActionData) => unknown;

function str(value: string | number | undefined): string {
  return value == null ? "" : String(value);
}

const HANDLERS: Partial<Record<CampaignActionName, ActionHandler>> = {
  // ── Save management ───────────────────────────────────────────────
  "new-save": () => Actions.newSave(),
  "save-slot": () => Actions.quickSave(),
  "fork-save": () => Actions.forkSave(),
  "export-save": () => Actions.exportSave(),
  "import-save": () => Actions.importSavePicker(),
  "push-github": () => Actions.pushToGitHub(),
  "load-slot": (d) => Actions.loadSlot(str(d.id)),
  "delete-slot": (d) => Actions.deleteSlot(str(d.id)),
  "delete-all-saves": () => Actions.deleteAllSaves(),
  "export-slot": (d) => Actions.exportSlot(str(d.id)),
  // ── Log management ────────────────────────────────────────────────
  "export-log": () => Actions.exportLog(),
  "clear-log": () => Actions.clearLog(),
  "export-event-log": () => Actions.exportEventLog(),
  "clear-event-log": () => Actions.clearEventLog()
};

export function hasHandler(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

export function runHandler(name: string, data: ActionData = {}): unknown {
  const fn = HANDLERS[name as CampaignActionName];
  return fn ? fn(data) : undefined;
}

// The keys ported so far — exported for introspection / tests.
export const REGISTERED_ACTION_NAMES: readonly CampaignActionName[] =
  Object.keys(HANDLERS) as CampaignActionName[];

// Install the runtime bridge the vanilla `_handleAction` switch reads.
// campaign-ui.js looks this up lazily at call time, so import order only
// has to guarantee this module runs before the first user action —
// `src/campaign/main.tsx` imports it during bootstrap.
interface ActionsRuntime {
  has: (name: string) => boolean;
  run: (name: string, data?: ActionData) => unknown;
}
interface RuntimeCjs {
  CampaignActionsRuntime?: ActionsRuntime;
  [key: string]: unknown;
}

const globalCjs = (window as unknown as { CJS?: RuntimeCjs });
globalCjs.CJS = globalCjs.CJS || ({} as RuntimeCjs);
globalCjs.CJS.CampaignActionsRuntime = { has: hasHandler, run: runHandler };
