import { createRoot } from "react-dom/client";
import "../../js/core/constants.js";
import "../../js/core/formulas.js";
import "../../js/core/dice.js";
import "../../js/core/undo-manager.js";
import "../../js/core/state-tools.js";
import "../../js/core/data-store.js";
import "../../js/core/save-manager.js";
import "../../js/core/content-manager.js";
import "../../js/core/skill-resolver.js";
import "../../js/services/persona-service.js";
import "../../js/services/content-validator.js";
import "../../js/services/data-hot-reload.js";
import "../dev/data-hot-reload-client"; // dev-only: re-ingest changed data/*.json (stripped in prod)
import "../../js/services/dev-console.js";
import "../../js/ui/touch-gestures.js";
import "../../js/ui/ui-helpers.js";
import "../../js/ui/ui-icons.js";
import "../../js/ui/portrait-picker.js";
import "../../js/ui/scene-player.js";
import "../../js/campaign/campaign-state.js";
import "../../js/campaign/farming-mode.js";
import "../../js/campaign/campaign-data-loader.js";
import "../../js/campaign/campaign-tags.js";
import "../../js/campaign/relationship-tiers.js";
import "../../js/campaign/campaign-alignment.js";
import "../../js/campaign/campaign-conditions.js";
import "../../js/campaign/campaign-quest-pulse.js";
import "../../js/campaign/campaign-ops.js";
import "../../js/campaign/campaign-save.js";
import "../../js/campaign/campaign-events.js";
import "../../js/campaign/campaign-world-events.js";
import "../../js/campaign/campaign-story-branch.js";
import "../../js/campaign/campaign-combat-popup.js";
import "../../js/campaign/campaign-objective-banner.js";
import "../../js/campaign/campaign-story-scenes.js";
import "../../js/campaign/campaign-sequence-runner.js";
import "../../js/campaign/campaign-sequence-vn.js";
import "../../js/campaign/campaign-oracle.js";
import "../../js/campaign/campaign-combat-bridge.js";
import "../../js/campaign/campaign-party-chat.js";
import "../../js/campaign/campaign-map.js";
import "../../js/campaign/campaign-inventory.js";
import "../../js/campaign/campaign-economy.js";
import "../../js/campaign/pocket-haven-facilities.js";
import "../../js/campaign/pocket-haven.js";
import "../../js/campaign/guild-trivia.js";
import "../../js/campaign/scenario-runner.js";
import "../../js/campaign/campaign-side-content.js";
import "../../js/campaign/campaign-story-director.js";
import "../../js/campaign/campaign-hub.js";
import "../../js/campaign/campaign-quest-chains.js";
import "../../js/campaign/campaign-battle-set-forge.js";
import "../../js/campaign/campaign-map-seed-forge.js";
import "../../js/campaign/campaign-scenario-generator.js";
import "../../js/campaign/campaign-idea-forge.js";
import "../../js/campaign/campaign-world-map.js";
import "../../js/minigames/minigame-registry.js";
import "../../js/minigames/minigame-sprites.js";
import "../../js/minigames/mummy-maze.js";
import "../../js/minigames/push-box.js";
import "../../js/qte/qte-quickpress.js";
import "../../js/qte/qte-mash.js";
import "../../js/qte/qte-fishing.js";
import "../../js/qte/qte-rhythm.js";
import "../../js/qte/qte-quiz.js";
import "../../js/qte/qte-manager.js";
import "../../js/minigames/fishing-minigame.js";
import "../../js/minigames/cooking-minigame.js";
import "../../js/minigames/minigame-host.js";
import "../../js/ui/relationships-tab.js";
// Phase H.4 — leaf util helpers ported to TS. The TS modules install
// the same `window.CJS.CampaignUIInternal.<Namespace>` surface so
// vanilla JS callers (campaign-ui.js + the other cui-*.js helpers)
// keep working without changes.
import "./util/cui-utils";
import "./util/cui-portraits";
import "./util/cui-modals";
import "./util/cui-options";
import "./util/cui-controls";
import "./util/cui-equipment";
import "./util/cui-log";
import "./util/cui-tabs-registry";
import "../../js/campaign/ui/tabs/cui-party-tab.js";
import "../../js/campaign/ui/tabs/cui-hub-tab.js";
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
