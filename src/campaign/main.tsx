import { createRoot } from "react-dom/client";
import "../engine/core/constants";
import "../engine/core/formulas";
import "../engine/core/dice";
import "../engine/core/undo-manager";
import "../engine/core/state-tools";
import "../engine/core/data-store";
import "../persistence/indexedDb";
import "../../js/core/save-manager.js";
import "../engine/core/content-manager";
import "../engine/core/skill-resolver";
import "../../js/services/persona-service.js";
import "../engine/services/content-validator";
import "../../js/services/data-hot-reload.js";
import "../dev/data-hot-reload-client"; // dev-only: re-ingest changed data/*.json (stripped in prod)
import "../../js/services/dev-console.js";
import "../../js/ui/touch-gestures.js";
import "../../js/ui/ui-helpers.js";
import "../../js/ui/ui-icons.js";
import "../../js/ui/portrait-picker.js";
import "../../js/ui/scene-player.js";
import "../engine/campaign/campaign-state";
import "../../js/campaign/farming-mode.js";
import "../engine/campaign/campaign-data-loader";
import "../engine/campaign/campaign-tags";
import "../engine/campaign/relationship-tiers";
import "../engine/campaign/campaign-alignment";
import "../engine/campaign/campaign-conditions";
import "../engine/campaign/campaign-quest-pulse";
import "../engine/campaign/campaign-ops";
import "../../js/campaign/campaign-save.js";
import "../engine/campaign/campaign-events";
import "../engine/campaign/campaign-world-events";
import "../engine/campaign/campaign-story-branch";
import "../engine/campaign/campaign-combat-popup";
import "../engine/campaign/campaign-objective-banner";
import "../engine/campaign/campaign-story-scenes";
import "../engine/campaign/campaign-sequence-runner";
import "../../js/campaign/campaign-sequence-vn.js";
import "../engine/campaign/campaign-oracle";
import "../../js/campaign/campaign-combat-bridge.js";
import "../engine/campaign/campaign-party-chat";
import "../../js/campaign/campaign-map.js";
import "../engine/campaign/pocket-haven-facilities";
import "../engine/campaign/pocket-haven";
import "../../js/campaign/guild-trivia.js";
import "../../js/campaign/scenario-runner.js";
import "../engine/campaign/campaign-side-content";
import "../../js/campaign/campaign-story-director.js";
import "../engine/campaign/campaign-hub";
import "../engine/campaign/campaign-quest-chains";
import "../engine/campaign/campaign-battle-set-forge";
import "../engine/campaign/campaign-map-seed-forge";
import "../../js/campaign/campaign-scenario-generator.js";
import "../engine/campaign/campaign-idea-forge";
import "../../js/campaign/campaign-world-map.js";
// The minigame + QTE engine (js/minigames/*, js/qte/*) is no longer imported
// here — it is deferred behind ./lazy-minigames (Tier 1 perf) so cjs-minigames
// + cjs-qte drop out of the campaign page's eager modulepreload set. It is
// warmed in the background after boot (below) and awaited by the launch action
// handlers (minigame.ts / mg-test.ts / farm openFishing).
// Phase H.4 — leaf util helpers ported to TS. The TS modules install
// the same `window.CJS.CampaignUIInternal.<Namespace>` surface so
// vanilla JS callers (campaign-ui.js + the other cui-*.js helpers)
// keep working without changes.
import "./util/cui-utils";
import "./util/cui-portraits";
import "./util/cui-modals";
import "./util/cui-options";
// cui-controls is a pure util now (purpose taxonomy + display-only inline
// blurb) — no namespace to install — so it's pulled in via named imports by
// the typed data builders (tabs/data/hub.ts, tabs/data/resultPanels.ts)
// rather than eager-imported here.
import "./util/cui-equipment";
import "./util/cui-log";
import "./util/cui-tabs-registry";
import "./util/cui-party-tab";
import "./util/cui-hub-tab";
import "./util/cui-world-map-tab";
import "./util/cui-react-bridge";
// chrome-state + story-context install their window.CJS bridges; the boot
// owner reads them. (They're imported directly by shell/boot.ts too, so
// this is just an explicit ordering anchor.)
import "./chrome-state";
import "./story-context";
// Phase H.4 — campaign-ui.js is gone. The campaign shell orchestration
// (init / render loop, combat-result return flow, drawer body, quest
// narrative modal, action + chrome dispatch) now lives in TypeScript and
// installs the same `window.CJS.CampaignUI` surface for the React shell +
// the remaining JS callers (pocket-haven / scenario-runner / hot-reload).
import "./shell/boot";
import "../../js/ui/audio-manager.js";
import "../../js/ui/l2d-avatar.js";
import "../../js/ui/l2d-companion.js";
// Phase H.3 — installs window.CJS.CampaignActionsRuntime so the action
// dispatch seam (boot.ts handleAction) routes every action to its TS
// handler. Loads after the boot install above, before the React app mounts.
import "./action-handlers/registry";
import { markEmbeddedIfNeeded } from "../shared/embed";
import { ensureMinigameEngine } from "./lazy-minigames";
import { CampaignPage } from "./CampaignPage";

markEmbeddedIfNeeded();

const container = document.getElementById("campaign-mount");
if (!container) {
  throw new Error("Campaign mount node #campaign-mount not found");
}

// Plain root (no StrictMode): CampaignUI.init binds events and subscribes
// to CampaignState imperatively, which would double-fire under
// StrictMode's dev double-mount.
createRoot(container).render(<CampaignPage />);

// Warm the deferred minigame + QTE engine in the background once the shell has
// painted (Tier 1 perf): it is off the boot path now, so kick the dynamic
// import after first paint and re-render when ready, so the minigame-test tab's
// game list fills in if that tab is already open. Action handlers await the
// same promise before launching, so this is purely a head start.
window.setTimeout(() => {
  void ensureMinigameEngine().then(() => {
    (window as unknown as { CJS?: { CampaignUI?: { render?: () => void } } }).CJS?.CampaignUI?.render?.();
  });
}, 0);
