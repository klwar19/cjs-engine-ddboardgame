// Shared helper for mode pages that may render inside the launcher iframe.
// Adds the same .cjs-embedded marker the legacy inline scripts used so the
// .cjs-embed-hide CSS rule (links back to the launcher, etc.) still works.

export const LAUNCHER_VISIBILITY_EVENT = "cjs:launcher-visibility";

export interface LauncherVisibilityDetail {
  readonly active: boolean;
  readonly mode?: string;
  readonly source: "launcher";
}

let visibilityBridgeInstalled = false;
let latestVisibility: LauncherVisibilityDetail = {
  active: !isLauncherEmbed(),
  source: "launcher"
};

export function isLauncherEmbed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.top !== window.self) return true;
  return new URLSearchParams(window.location.search).get("embed") === "launcher";
}

export function markEmbeddedIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (!isLauncherEmbed()) return;
  document.documentElement.classList.add("cjs-embedded");
  if (!document.getElementById("cjs-embed-hide-style")) {
    const style = document.createElement("style");
    style.id = "cjs-embed-hide-style";
    style.textContent = ".cjs-embed-hide{display:none !important}";
    document.head.appendChild(style);
  }
  installLauncherVisibilityBridge();
}

export function installLauncherVisibilityBridge(): void {
  if (typeof window === "undefined" || visibilityBridgeInstalled) return;
  visibilityBridgeInstalled = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent && event.source !== window.top) return;
    if (event.origin !== "null" && event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; active?: unknown; mode?: unknown } | null;
    if (!data || data.type !== LAUNCHER_VISIBILITY_EVENT) return;
    const detail: LauncherVisibilityDetail = {
      active: data.active === true,
      mode: typeof data.mode === "string" ? data.mode : undefined,
      source: "launcher"
    };
    latestVisibility = detail;
    window.dispatchEvent(new CustomEvent<LauncherVisibilityDetail>(LAUNCHER_VISIBILITY_EVENT, { detail }));
  });
}

export function getLauncherVisibility(): LauncherVisibilityDetail {
  return latestVisibility;
}

export function onLauncherVisibilityChange(
  listener: (detail: LauncherVisibilityDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<LauncherVisibilityDetail>).detail);
  };
  window.addEventListener(LAUNCHER_VISIBILITY_EVENT, handler);
  return () => window.removeEventListener(LAUNCHER_VISIBILITY_EVENT, handler);
}
