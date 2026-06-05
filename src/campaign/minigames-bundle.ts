// minigames-bundle.ts — the minigame + QTE engine, as one dynamically-imported
// unit (Tier 1 perf). These are side-effect IIFE modules that register on
// window.CJS; the order here mirrors the original static import order in
// main.tsx exactly, so the registration sequence is unchanged. Importing this
// single module pulls the whole set (Vite groups them into the cjs-minigames /
// cjs-qte chunks). Loaded on demand via ./lazy-minigames, never at boot.
import "../engine/minigames/minigame-registry";
import "../engine/minigames/minigame-sprites";
import "../engine/minigames/mummy-maze";
import "../engine/minigames/push-box";
import "../engine/qte/qte-quickpress";
import "../engine/qte/qte-mash";
import "../engine/qte/qte-fishing";
import "../engine/qte/qte-rhythm";
import "../engine/qte/qte-quiz";
import "../engine/qte/qte-manager";
import "../engine/minigames/fishing-minigame";
import "../engine/minigames/cooking-minigame";
import "../engine/minigames/minigame-host";
