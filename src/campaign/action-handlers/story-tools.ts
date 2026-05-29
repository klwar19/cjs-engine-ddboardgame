// story-tools.ts — Phase H.3 story-tool action handlers.
//
// story-help opens a static "Story Mode Flow" info modal. story-copy-prompt
// assembles the AI story-prompt text (`storyPromptText`), waits on the world
// story-context cache (`ensureStoryContext`), then copies to clipboard or
// falls back to the openCopyTextModal pane. Both come from the TS
// `story-context.ts` port (Phase H.4) — no CampaignUI bridge hop.
// story-manual-note stays in the switch — it opens _openManualSceneBuilder
// (127 lines, closure-private branching-chapter authoring tool) which still
// depends on a handful of closure helpers (CampaignSequences.storyMeta /
// CampaignStoryBranch.append, render hooks); ports alongside those helpers.
//
// All copy + the clipboard fallback mirror the deleted closures.

import { cs, mod, toast } from "./context";
import { ensureStoryContext, storyPromptText } from "../story-context";

interface UiOpen {
  openModal: (cfg: { title: string; content: HTMLElement; width?: string }) => unknown;
}

interface CampaignCopy {
  openCopyTextModal?: (title: string, text: string) => void;
}

// Mirrors `_openStoryHelpModal`. Static four-section "Story Mode Flow"
// info modal — no state, no actions inside.
export function openStoryHelpModal(): void {
  const ui = mod<UiOpen>("UI");
  if (!ui?.openModal) return;
  const body = document.createElement("div");
  body.className = "campaign-story-help";
  body.innerHTML = `
      <div class="campaign-story-help-grid">
        <div>
          <strong>Solo default</strong>
          <p>Pick the current episode, roll Next Scene, read the popup, then choose one route. The app handles clocks, rumors, clues, and queue changes only after you choose.</p>
        </div>
        <div>
          <strong>Manual GM control</strong>
          <p>Use the episode rail to jump anywhere, Write Scene to author your own beat, Hold For Later to keep an idea, and Skip Roll when the random result is being dramatic for attention.</p>
        </div>
        <div>
          <strong>Random flavor</strong>
          <p>Peri Interrupt is for system comedy, Memory / Clue is for mystery pressure, and Offscreen Trouble is for consequences when time passes or the table gets too comfortable.</p>
        </div>
        <div>
          <strong>Tabletop flow</strong>
          <p>Use Story for scenes and route choices, then switch to Current Run for tactical movement and encounters. Side Routes tells you what content should stay, rise, or pause.</p>
        </div>
      </div>
    `;
  ui.openModal({ title: "Story Mode Flow", content: body, width: "720px" });
}

// Mirrors `_copyStoryPrompt`. Waits on the world's story-context cache
// (so the AI-context section of the prompt is hydrated), computes the
// full prompt text via the still-JS closure, then tries the clipboard
// API — falling back to the openCopyTextModal pane on rejection or
// when navigator.clipboard is unavailable.
export async function copyStoryPrompt(): Promise<void> {
  const world = (cs().getState() as { currentWorld?: string } | null)?.currentWorld || "haven";
  await ensureStoryContext(world);
  const text = storyPromptText() || "";
  if (!text) {
    toast("Story prompt unavailable", "info");
    return;
  }
  const fallback = (): void => {
    mod<CampaignCopy>("CampaignCopy")?.openCopyTextModal?.("Story Prompt", text);
  };
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast("Story prompt copied", "success"))
      .catch(fallback);
    return;
  }
  fallback();
}
