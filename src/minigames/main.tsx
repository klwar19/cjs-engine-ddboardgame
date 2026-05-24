import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../js/minigames/minigame-registry.js";
import "../../js/minigames/minigame-sprites.js";
import "../../js/minigames/mummy-maze.js";
import "../../js/minigames/push-box.js";
import "../../js/minigames/minigame-host.js";
import { markEmbeddedIfNeeded } from "../shared/embed";
import { MinigameHarness } from "./MinigameHarness";

markEmbeddedIfNeeded();

const container = document.getElementById("minigames-root");
if (!container) {
  throw new Error("Minigames mount node #minigames-root not found");
}

createRoot(container).render(
  <StrictMode>
    <MinigameHarness />
  </StrictMode>
);
