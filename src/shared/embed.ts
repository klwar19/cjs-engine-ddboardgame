// Shared helper for mode pages that may render inside the launcher iframe.
// Adds the same .cjs-embedded marker the legacy inline scripts used so the
// .cjs-embed-hide CSS rule (links back to the launcher, etc.) still works.

export function markEmbeddedIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (window.top === window.self) return;
  document.documentElement.classList.add("cjs-embedded");
  if (document.getElementById("cjs-embed-hide-style")) return;
  const style = document.createElement("style");
  style.id = "cjs-embed-hide-style";
  style.textContent = ".cjs-embed-hide{display:none !important}";
  document.head.appendChild(style);
}
