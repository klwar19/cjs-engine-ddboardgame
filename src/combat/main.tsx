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
import "../../js/services/content-validator.js";
import "../../js/services/data-hot-reload.js";
import "../dev/data-hot-reload-client"; // dev-only: re-ingest changed data/*.json (stripped in prod)
import "../../js/services/dev-console.js";
import "../../js/effects/value-calc.js";
import "../../js/effects/conditions.js";
import "../../js/effects/effect-registry.js";
import "../../js/effects/effect-resolver.js";
import "../../js/grid/grid-engine.js";
import "../../js/grid/pathfinding.js";
import "../../js/grid/aoe.js";
import "../../js/grid/map-generator.js";
import "../../js/combat/weather-manager.js";
import "../../js/combat/enemy-modifiers.js";
import "../../js/combat/stat-compiler.js";
import "../../js/combat/damage-calc.js";
import "../../js/combat/dice-service.js";
import "../../js/combat/status-manager.js";
import "../../js/combat/action-handler.js";
import "../../js/combat/combat-log.js";
import "../../js/combat/combat-settings.js";
import "../../js/combat/combat-objectives.js";
import "../../js/combat/combat-manager.js";
import "../../js/combat/battle-setup.js";
import "../../js/ai/ai-conditions.js";
import "../../js/ai/ai-targeting.js";
import "../../js/ai/ai-controller.js";
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
import "../../js/campaign/campaign-tags.js";
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
