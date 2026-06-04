// story-director-modals.ts — Phase H.3 story-director roll + beat modal.
//
// `rollStoryDirector(kind)` jumps to story / storyDirector, rolls a beat
// through CampaignStoryDirector, and opens the beat modal on the result.
// `openLastStoryBeatModal` re-opens the last rolled beat. `openStoryBeatModal`
// mounts the React `<StoryBeatModalBody>` into the shared modal via createRoot
// — the editor-picker / party-sheet pattern. Part B replaced the
// `renderStoryDirectorCardHtml` HTML-string island (+ its `data-story-modal-choice`
// click delegate) with the JSX `<StoryBeatCard>`; the route / save / reject /
// close buttons route through the action runtime (story-apply-choice /
// story-save-beat / story-reject-beat) to the handlers in story-director.ts.
//
// story-manual-note / story-copy-prompt / story-help stay in the registry —
// they need `_openManualSceneBuilder` (127 lines) and the prompt / help
// generators (~290 lines), each shared with render/data code.

import { cs, mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
// Type-only — erased at compile so the data builder stays OUT of the eager
// action-handler boot chunk; it is lazy-imported with the modal below.
import type { CardInput } from "../tabs/data/storyDirector";

type StoryBeatCard = CardInput;

interface StoryDirectorModule {
  roll?: (kind: string) => StoryBeatCard | null | undefined;
}

interface ActionsRuntime {
  run?: (name: string, data?: Record<string, unknown>) => void;
}

interface UiModalApi {
  openModal: (cfg: {
    title: string;
    content: HTMLElement;
    footer: HTMLElement;
    width: string;
    onClose?: () => void;
  }) => unknown;
  closeModal: (overlay: unknown) => void;
}

function actionsRuntime(): ActionsRuntime | undefined {
  return mod<ActionsRuntime>("CampaignActionsRuntime");
}

function footerButton(label: string, className: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = className;
  btn.textContent = label;
  return btn;
}

export function openStoryBeatModal(card: StoryBeatCard | null | undefined): void {
  if (!card) return;
  const ui = mod<UiModalApi>("UI");
  if (!ui?.openModal) return;

  // React, the beat-card JSX, AND the card data builder are all lazy-loaded so
  // they stay out of the eager boot chunk; the modal only opens on a user roll.
  // Same pattern as the party-sheet modal.
  void Promise.all([
    import("react"),
    import("react-dom/client"),
    import("../tabs/StoryBeatModal"),
    import("../tabs/data/storyDirector")
  ]).then(([React, { createRoot }, { StoryBeatModalBody }, { storyDirectorCardData }]) => {
    const data = storyDirectorCardData(card);
    if (!data) return;
    const runtime = actionsRuntime();
    const mount = document.createElement("div");
    mount.className = "campaign-story-modal-body";
    const root = createRoot(mount);
    let overlay: unknown;
    const onChoose = (index: number) => {
      ui.closeModal(overlay);
      runtime?.run?.("story-apply-choice", { id: data.id, choice: index });
    };
    root.render(React.createElement(StoryBeatModalBody, { data, onChoose }));

    const footer = document.createElement("div");
    const closeBtn = footerButton("Keep On Page", "btn btn-ghost");
    const saveBtn = footerButton("Hold For Later", "btn btn-ghost");
    const rejectBtn = footerButton("Skip Roll", "btn btn-danger");
    footer.append(closeBtn, saveBtn, rejectBtn);

    overlay = ui.openModal({
      title: `${data.kindLabel} - ${data.title}`,
      content: mount,
      footer,
      width: "780px",
      onClose: () => {
        try {
          root.unmount();
        } catch {
          /* ignore */
        }
      }
    });

    closeBtn.onclick = () => ui.closeModal(overlay);
    saveBtn.onclick = () => {
      ui.closeModal(overlay);
      runtime?.run?.("story-save-beat");
    };
    rejectBtn.onclick = () => {
      ui.closeModal(overlay);
      runtime?.run?.("story-reject-beat");
    };
  });
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
