import "./engine/core/constants";
import "./engine/core/formulas";
import "./engine/core/dice";
import "../js/core/undo-manager.js";
import "./engine/core/state-tools";
import "../js/core/data-store.js";
import "../js/core/skill-resolver.js";
import "../js/services/persona-service.js";
import "../js/effects/value-calc.js";
import "../js/effects/conditions.js";
import "../js/effects/effect-registry.js";
import "../js/ui/audio-manager.js";
import "../js/ui/animation-bus.js";
import { markEmbeddedIfNeeded } from "./shared/embed";

markEmbeddedIfNeeded();
