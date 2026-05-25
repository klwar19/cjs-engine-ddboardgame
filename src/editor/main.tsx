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
import "../../js/effects/value-calc.js";
import "../../js/effects/conditions.js";
import "../../js/effects/effect-registry.js";
import "../../js/ui/ui-helpers.js";
import "../../js/ui/ui-icons.js";
import "../../js/ui/portrait-picker.js";
import "../../js/ui/audio-manager.js";
import "../../js/services/persona-service.js";
import "../../js/services/content-validator.js";
import "../../js/services/data-hot-reload.js";
import "../../js/services/dev-console.js";
import "../../js/builders/audio-library.js";
import { markEmbeddedIfNeeded } from "../shared/embed";
import { EditorPage } from "./EditorPage";

markEmbeddedIfNeeded();

const container = document.getElementById("editor-root");
if (!container) {
  throw new Error("Editor mount node #editor-root not found");
}

// Plain root (no StrictMode): the underlying vanilla builder modules
// (CharEditor, MonsterEditor, etc.) mount imperatively into their panel
// DIVs; under StrictMode dev double-mount their useEffect would re-mount
// them and break their internal state.
createRoot(container).render(<EditorPage />);
