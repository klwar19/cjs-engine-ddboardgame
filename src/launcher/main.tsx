import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Safety net: the launcher is never meant to render inside an iframe. If
// something ever serves index.html in response to a mode-page request, we
// would otherwise stack a launcher inside the launcher. Bail to the top
// frame instead so the user sees a single launcher.
if (window.top && window.top !== window.self) {
  try {
    window.top.location.replace(window.location.href);
  } catch {
    // Cross-origin top — can't escape, fall through and render anyway.
  }
}

const container = document.getElementById("launcher-root");
if (!container) {
  throw new Error("Launcher mount node #launcher-root not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
