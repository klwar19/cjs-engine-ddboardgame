import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("launcher-root");
if (!container) {
  throw new Error("Launcher mount node #launcher-root not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
