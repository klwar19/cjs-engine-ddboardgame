import "./engine/core/constants";
import "./engine/core/formulas";
import "./engine/core/dice";
import "./engine/core/undo-manager";
import "./engine/core/state-tools";
import "./engine/core/data-store";
import "./engine/core/skill-resolver";
import "../js/services/persona-service.js";
import "./engine/effects/value-calc";
import "../js/effects/conditions.js";
import "../js/effects/effect-registry.js";
import "../js/ui/audio-manager.js";
import "../js/ui/animation-bus.js";
import { markEmbeddedIfNeeded } from "./shared/embed";

markEmbeddedIfNeeded();
