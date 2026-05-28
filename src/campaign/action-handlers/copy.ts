// copy.ts — Phase H.3 shared "copy to clipboard" helpers.
//
// `openCopyTextModal` shows a read-only textarea fallback when the clipboard
// API is unavailable; `copyPlainText` tries the clipboard then falls back to
// it. Both are shared by the event handlers (events.ts) AND the still-in-JS
// manual event builder (`_manualEventSummaryText` copy) + story prompt copy
// (`_copyStoryPrompt`), so the module installs `window.CJS.CampaignCopy` for
// those JS callers until they port. Markup, widths, focus/select timing and
// toast strings mirror the deleted `_openCopyTextModal` / `_copyPlainText`.

import { mod, toast } from "./context";

interface OpenModalApi {
  openModal: (cfg: { title?: string; content?: HTMLElement; width?: string }) => unknown;
}

export function openCopyTextModal(title: string, text: string): void {
  const ui = mod<OpenModalApi>("UI");
  if (!ui) return;
  const body = document.createElement("div");
  const hint = document.createElement("div");
  hint.className = "campaign-muted";
  hint.style.marginBottom = "8px";
  hint.textContent = "Clipboard was not available. Copy this text manually:";
  const ta = document.createElement("textarea");
  ta.readOnly = true;
  ta.style.width = "100%";
  ta.style.minHeight = "280px";
  ta.style.fontFamily = "monospace";
  ta.value = text;
  body.appendChild(hint);
  body.appendChild(ta);
  ui.openModal({ title, content: body, width: "680px" });
  setTimeout(() => {
    ta.focus();
    ta.select();
  }, 30);
}

export function copyPlainText(title: string, text: string, successMessage = "Copied"): void {
  if (!text) {
    toast("Nothing to copy", "info");
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(successMessage, "success"))
      .catch(() => openCopyTextModal(title, text));
    return;
  }
  openCopyTextModal(title, text);
}

// Exposed for the still-in-JS callers (`_copyStoryPrompt` → openCopyTextModal,
// `_openManualEventBuilder` → copyPlainText). Removed once those port.
interface CopyRuntime {
  openCopyTextModal: typeof openCopyTextModal;
  copyPlainText: typeof copyPlainText;
}
interface CopyCjs {
  CampaignCopy?: CopyRuntime;
  [key: string]: unknown;
}
const copyCjs = window as unknown as { CJS?: CopyCjs };
copyCjs.CJS = copyCjs.CJS || ({} as CopyCjs);
copyCjs.CJS.CampaignCopy = { openCopyTextModal, copyPlainText };
