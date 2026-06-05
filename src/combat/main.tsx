import { createRoot } from "react-dom/client";
import "../engine/core/constants";
import "../engine/core/formulas";
import "../engine/core/dice";
import "../engine/core/undo-manager";
import "../engine/core/state-tools";
import "../engine/core/data-store";
import "../engine/core/content-manager";
import "../engine/core/skill-resolver";
import "../engine/services/persona-service";
import "../engine/services/content-validator";
import "../engine/services/data-hot-reload";
import "../dev/data-hot-reload-client"; // dev-only: re-ingest changed data/*.json (stripped in prod)
import "../engine/services/dev-console";
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
import "../engine/qte/qte-quickpress";
import "../engine/qte/qte-mash";
import "../engine/qte/qte-fishing";
import "../engine/qte/qte-rhythm";
import "../engine/qte/qte-quiz";
import "../engine/qte/qte-manager";
import "../engine/narrator/narrator-state";
import "../engine/narrator/narrator-data";
import "../engine/narrator/narrator-engine";
import "../engine/ui/touch-gestures";
import "../engine/grid/grid-renderer";
import "../engine/ui/ui-helpers";
import "../engine/ui/ui-icons";
import "../engine/ui/portrait-picker";
import "../engine/ui/audio-manager";
import "../engine/ui/animation-bus";
import "../engine/ui/scene-player";
import "../engine/ui/gm-controls";
import "../engine/ui/loot-roller";
import "../engine/ui/l2d-avatar";
import "../engine/ui/l2d-companion";
import "../engine/campaign/campaign-tags";
import "../engine/campaign/campaign-conditions";
import "../engine/campaign/campaign-quest-pulse";
import "../engine/campaign/campaign-combat-bridge";
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
