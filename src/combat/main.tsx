import { createRoot } from "react-dom/client";
import "../engine/core/constants";
import "../engine/core/formulas";
import "../engine/core/dice";
import "../engine/core/undo-manager";
import "../engine/core/state-tools";
import "../engine/core/data-store";
import "../engine/core/content-manager";
import "../engine/core/skill-resolver";
import "../../js/services/persona-service.js";
import "../engine/services/content-validator";
import "../../js/services/data-hot-reload.js";
import "../dev/data-hot-reload-client"; // dev-only: re-ingest changed data/*.json (stripped in prod)
import "../../js/services/dev-console.js";
import "../engine/effects/value-calc";
import "../engine/effects/conditions";
import "../engine/effects/effect-registry";
import "../engine/effects/effect-resolver";
import "../engine/grid/grid-engine";
import "../engine/grid/pathfinding";
import "../engine/grid/aoe";
import "../engine/grid/map-generator";
import "../engine/combat/weather-manager";
import "../engine/combat/enemy-modifiers";
import "../engine/combat/stat-compiler";
import "../engine/combat/damage-calc";
import "../engine/combat/dice-service";
import "../engine/combat/status-manager";
import "../engine/combat/action-handler";
import "../engine/combat/combat-log";
import "../engine/combat/combat-settings";
import "../engine/combat/combat-objectives";
import "../engine/combat/combat-manager";
import "../engine/combat/battle-setup";
import "../engine/ai/ai-conditions";
import "../engine/ai/ai-targeting";
import "../engine/ai/ai-controller";
import "../../js/qte/qte-quickpress.js";
import "../../js/qte/qte-mash.js";
import "../../js/qte/qte-fishing.js";
import "../../js/qte/qte-rhythm.js";
import "../../js/qte/qte-quiz.js";
import "../../js/qte/qte-manager.js";
import "../../js/narrator/narrator-state.js";
import "../../js/narrator/narrator-data.js";
import "../../js/narrator/narrator-engine.js";
import "../../js/ui/touch-gestures.js";
import "../../js/grid/grid-renderer.js";
import "../../js/ui/ui-helpers.js";
import "../../js/ui/ui-icons.js";
import "../../js/ui/portrait-picker.js";
import "../../js/ui/audio-manager.js";
import "../../js/ui/animation-bus.js";
import "../../js/ui/scene-player.js";
import "../../js/ui/gm-controls.js";
import "../../js/ui/loot-roller.js";
import "../../js/ui/l2d-avatar.js";
import "../../js/ui/l2d-companion.js";
import "../engine/campaign/campaign-tags";
import "../../js/campaign/campaign-conditions.js";
import "../../js/campaign/campaign-quest-pulse.js";
import "../../js/campaign/campaign-combat-bridge.js";
import { markEmbeddedIfNeeded } from "../shared/embed";
import { CombatPage } from "./CombatPage";

markEmbeddedIfNeeded();

const container = document.getElementById("combat-root");
if (!container) {
  throw new Error("Combat mount node #combat-root not found");
}

// Plain root (no StrictMode): the underlying vanilla engine modules
// (BattleSetup, CampaignCombatBridge, GMControls) bind events imperatively
// on init, which would double-fire under StrictMode's dev double-mount.
createRoot(container).render(<CombatPage />);
