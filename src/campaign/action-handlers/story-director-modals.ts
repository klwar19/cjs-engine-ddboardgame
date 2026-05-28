// story-director-modals.ts — Phase H.3 story-director roll + beat modal.
//
// `rollStoryDirector(kind)` jumps to story / storyDirector, rolls a beat
// through CampaignStoryDirector, and opens the beat modal on the result.
// `openLastStoryBeatModal` re-opens the last rolled beat. `openStoryBeatModal`
// builds the modal whose card body comes from the closure-private
// `_renderStoryDirectorCard` HTML — reached through the new
// `CampaignUI.renderStoryDirectorCardHtml` bridge (G.11b keeps the renderer
// itself in JS until H.4). The route / save / reject / close buttons route
// through the action runtime (story-apply-choice / story-save-beat /
// story-reject-beat) to the already-ported handlers in story-director.ts.
//
// story-manual-note / story-copy-prompt / story-help stay in the switch —
// they need `_openManualSceneBuilder` (127 lines) and the prompt / help
// generators (~290 lines), each shared with render/data code.

import { cs, mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { utils } from "./modals";

interface StoryBeatCard {
  id?: string;
  title?: string;
  kind?: string;
  [key: string]: unknown;
}

interface StoryDirectorModule {
  roll?: (kind: string) => StoryBeatCard | null | undefined;
}

interface CampaignUiBridge {
  renderStoryDirectorCardHtml?: (card: StoryBeatCard, options: { modal?: boolean }) => string;
}

interface ActionsRuntime {
  run?: (name: string, data?: Record<string, unknown>) => void;
}

interface UiModalApi {
  openModal: (cfg: { title: string; content: HTMLElement; footer: HTMLElement; width: string }) => unknown;
  closeModal: (overlay: unknown) => void;
}

function actionsRuntime(): ActionsRuntime | undefined {
  return mod<ActionsRuntime>("CampaignActionsRuntime");
}

export function openStoryBeatModal(card: StoryBeatCard | null | undefined): void {
  if (!card) return;
  const ui = mod<UiModalApi>("UI");
  if (!ui?.openModal) return;
  const cardHtml = mod<CampaignUiBridge>("CampaignUI")?.renderStoryDirectorCardHtml?.(card, { modal: true }) || "";
  const label = utils()?.label ?? ((v: unknown) => String(v ?? ""));
  const body = document.createElement("div");
  body.className = "campaign-story-modal-body";
  body.innerHTML = `
      <div class="campaign-story-popup-hint">
        This roll has not changed the campaign yet. Choose a route, hold it for later, or skip it if the table says "nice try, app."
      </div>
      ${cardHtml}
    `;

  const footer = document.createElement("div");
  footer.innerHTML = `
      <button class="btn btn-ghost" data-story-modal-close>Keep On Page</button>
      <button class="btn btn-ghost" data-story-modal-save>Hold For Later</button>
      <button class="btn btn-danger" data-story-modal-reject>Skip Roll</button>
    `;
  const overlay = ui.openModal({
    title: `${label(card.kind || "story")} - ${card.title || card.id}`,
    content: body,
    footer,
    width: "780px"
  });

  const runtime = actionsRuntime();
  body.querySelectorAll<HTMLElement>("[data-story-modal-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choiceIndex = Number(btn.dataset.storyModalChoice || 0);
      ui.closeModal(overlay);
      runtime?.run?.("story-apply-choice", { id: card.id, choice: choiceIndex });
    });
  });
  const close = footer.querySelector<HTMLElement>("[data-story-modal-close]");
  const save = footer.querySelector<HTMLElement>("[data-story-modal-save]");
  const reject = footer.querySelector<HTMLElement>("[data-story-modal-reject]");
  if (close) close.onclick = () => ui.closeModal(overlay);
  if (save) {
    save.onclick = () => {
      ui.closeModal(overlay);
      runtime?.run?.("story-save-beat");
    };
  }
  if (reject) {
    reject.onclick = () => {
      ui.closeModal(overlay);
      runtime?.run?.("story-reject-beat");
    };
  }
}

export function rollStoryDirector(kind: string): void {
  setActiveModeRaw("story");
  setActiveTabRaw("storyDirector");
  const card = mod<StoryDirectorModule>("CampaignStoryDirector")?.roll?.(kind);
  if (!card) {
    toast("No matching story beat available", "info");
    return;
  }
  rerender();
  openStoryBeatModal(card);
}

export function openLastStoryBeatModal(): void {
  const card = (cs().getState() as { lastStoryDirectorBeat?: StoryBeatCard } | null)?.lastStoryDirectorBeat;
  if (!card) {
    toast("No story scene to show", "info");
    return;
  }
  openStoryBeatModal(card);
}
