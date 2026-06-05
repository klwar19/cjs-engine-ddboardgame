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
import "../engine/effects/value-calc";
import "../engine/effects/conditions";
import "../engine/effects/effect-registry";
import "../../js/ui/ui-helpers.js";
import "../../js/ui/ui-icons.js";
import "../../js/ui/portrait-picker.js";
import "../../js/ui/audio-manager.js";
import "../engine/services/persona-service";
import "../engine/services/content-validator";
import "../engine/services/data-hot-reload";
import "../dev/data-hot-reload-client"; // dev-only: re-ingest changed data/*.json (stripped in prod)
import "../engine/services/dev-console";
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
