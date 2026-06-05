// minigames-bundle.ts — the minigame + QTE engine, as one dynamically-imported
// unit (Tier 1 perf). These are side-effect IIFE modules that register on
// window.CJS; the order here mirrors the original static import order in
// main.tsx exactly, so the registration sequence is unchanged. Importing this
// single module pulls the whole set (Vite groups them into the cjs-minigames /
// cjs-qte chunks). Loaded on demand via ./lazy-minigames, never at boot.
import "../../js/minigames/minigame-registry.js";
import "../../js/minigames/minigame-sprites.js";
import "../../js/minigames/mummy-maze.js";
import "../../js/minigames/push-box.js";
import "../../js/qte/qte-quickpress.js";
import "../../js/qte/qte-mash.js";
import "../../js/qte/qte-fishing.js";
import "../../js/qte/qte-rhythm.js";
import "../../js/qte/qte-quiz.js";
import "../engine/qte/qte-manager";
import "../../js/minigames/fishing-minigame.js";
import "../../js/minigames/cooking-minigame.js";
import "../../js/minigames/minigame-host.js";
