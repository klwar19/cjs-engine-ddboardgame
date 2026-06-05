import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../engine/minigames/minigame-registry";
import "../engine/minigames/minigame-sprites";
import "../engine/minigames/mummy-maze";
import "../engine/minigames/push-box";
import "../engine/minigames/minigame-host";
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
