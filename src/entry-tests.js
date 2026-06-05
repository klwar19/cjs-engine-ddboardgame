import "./engine/core/constants";
import "./engine/core/formulas";
import "./engine/core/dice";
import "./engine/core/undo-manager";
import "./engine/core/state-tools";
import "./engine/core/data-store";
import "./engine/core/skill-resolver";
import "./engine/services/persona-service";
import "./engine/effects/value-calc";
import "./engine/effects/conditions";
import "./engine/effects/effect-registry";
import "./engine/ui/audio-manager";
import "./engine/ui/animation-bus";
import { markEmbeddedIfNeeded } from "./shared/embed";

markEmbeddedIfNeeded();
