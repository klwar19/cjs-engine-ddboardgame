// scene-builder.ts — Phase H.4 port of the manual scene + branch builder
// (`_openManualSceneBuilder` + `_saveAsManualNote`) from campaign-ui.js.
//
// The `story-manual-note` action (manual-builders.ts::manualStoryNote)
// opens this modal: the GM authors a scene, optionally branching it off
// an existing chapter into the auto-generated chapter tree. "Save as
// Note" records it in the story summary; "Save & Create Branch" also
// creates a playable child chapter via CampaignStoryBranch.
//
// Behaviour parity with the closure — same DOM, same op payloads, same
// toasts, same render() after each save.

import { cs, ops, mod, rerender } from "./context";
import { widgets } from "./modals";
import { esc, escAttr } from "../util/cui-utils";

export interface SceneBuilderStage {
  readonly id?: string;
  readonly name?: string;
}

interface SequenceEntry {
  readonly id?: string;
  readonly title?: string;
}

interface SequenceMeta {
  readonly partLabel?: string;
  readonly chapterLabel?: string;
  readonly title?: string;
}

interface SequencesSurface {
  readonly list?: (scope: string, world?: string) => readonly SequenceEntry[];
  readonly storyMeta?: (entry: SequenceEntry | string, world?: string) => SequenceMeta;
}

interface BranchResult {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly branch?: { readonly chapterLabel?: string };
}

interface StoryBranchSurface {
  readonly nextSuffix?: (parentSequenceId: string, world?: string) => string;
  readonly previewLabel?: (parentSequenceId: string, suffix: string, world?: string) => string;
  readonly createBranch?: (input: {
    world: string;
    parentSequenceId: string;
    suffix: string;
    title: string;
    scene: string;
    summary: string;
  }) => BranchResult | null | undefined;
}

interface SceneBuilderState {
  readonly currentWorld?: string;
  readonly storyMode?: { readonly currentPartId?: string };
}

interface ChapterOption {
  readonly id: string;
  readonly label: string;
  readonly chapterLabel: string;
  readonly title: string;
}

function q<T extends HTMLElement>(root: ParentNode, sel: string): T {
  return root.querySelector(sel) as T;
}

export function openManualSceneBuilder({ stage = {} }: { stage?: SceneBuilderStage } = {}): void {
  const ui = widgets();
  if (!ui?.openModal) return;
  const state = (cs().getState() as SceneBuilderState | null) || {};
  const world = state.currentWorld || "haven";
  const Seq = mod<SequencesSurface>("CampaignSequences");
  const Branch = mod<StoryBranchSurface>("CampaignStoryBranch");
  const chapterList: ChapterOption[] = (Seq?.list?.("story", world) || []).map((entry) => {
    const meta = Seq?.storyMeta?.(entry, world) || {};
    return {
      id: String(entry.id || ""),
      label: meta.partLabel || meta.chapterLabel || String(entry.id || ""),
      chapterLabel: meta.chapterLabel || meta.partLabel || String(entry.id || ""),
      title: meta.title || entry.title || String(entry.id || "")
    };
  });
  const currentPartId = state.storyMode?.currentPartId || chapterList[0]?.id || "";

  const body = document.createElement("div");
  body.className = "campaign-builder-body";
  body.innerHTML = `
      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>1</span>
          <div>
            <h3>Scene Text</h3>
            <small>The dialogue, hook, or scene description. Lines starting with "Name:" become VN speaker lines.</small>
          </div>
        </div>
        <label class="form-label">Scene Title
          <input id="manual-scene-title" type="text" placeholder="What this scene is called">
        </label>
        <label class="form-label">Scene / Conversation
          <textarea id="manual-scene-text" rows="8" placeholder="Bin: I have a terrible idea.&#10;Corvin: Of course you do.&#10;&#10;The hallway echoes with their footsteps."></textarea>
        </label>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>2</span>
          <div>
            <h3>Branch Into Chapter Tree</h3>
            <small>Optional. Hangs this scene off an existing chapter as 1.4.a, 1.4.b, etc. — fully integrated with the auto-generated tree.</small>
          </div>
        </div>
        <label class="form-label">
          <input id="manual-make-branch" type="checkbox">
          Create a new branch chapter from a parent chapter
        </label>
        <div class="campaign-branch-row" id="manual-branch-row" style="display:none">
          <label>From parent:
            <select id="manual-branch-parent">
              ${chapterList
                .map(
                  (entry) =>
                    `<option value="${escAttr(entry.id)}" ${entry.id === currentPartId ? "selected" : ""}>${esc(entry.chapterLabel)} — ${esc(entry.title)}</option>`
                )
                .join("")}
            </select>
          </label>
          <label>Suffix:
            <input id="manual-branch-suffix" type="text" maxlength="2" value="" placeholder="auto">
          </label>
          <span class="campaign-branch-preview" id="manual-branch-preview">Branch label: —</span>
        </div>
        <div class="campaign-muted" id="manual-branch-help">
          Without a branch, the scene is recorded as a manual note in the summary.
          With a branch, it appears as a child chapter (e.g. <b>1.4.a</b>) in the Chapter Routes panel — playable like any other chapter.
        </div>
      </section>
    `;
  const footer = document.createElement("div");
  footer.className = "campaign-builder-footer";
  footer.innerHTML = `
      <button class="btn" id="manual-scene-cancel">Cancel</button>
      <button class="btn" id="manual-scene-as-note">Save as Note</button>
      <button class="btn btn-primary" id="manual-scene-as-branch">Save & Create Branch</button>
    `;
  const overlay = ui.openModal({ title: "Manual Scene + Branch", content: body, footer, width: "720px" });

  function updatePreview(): void {
    const parent = q<HTMLSelectElement>(body, "#manual-branch-parent").value || currentPartId;
    const suffix = q<HTMLInputElement>(body, "#manual-branch-suffix").value.trim() || Branch?.nextSuffix?.(parent, world) || "a";
    q<HTMLElement>(body, "#manual-branch-preview").textContent = `Branch label: ${Branch?.previewLabel?.(parent, suffix, world) || "?"}`;
  }
  function toggleBranch(): void {
    const make = q<HTMLInputElement>(body, "#manual-make-branch").checked;
    q<HTMLElement>(body, "#manual-branch-row").style.display = make ? "grid" : "none";
    q<HTMLButtonElement>(footer, "#manual-scene-as-branch").disabled = !make && !q<HTMLTextAreaElement>(body, "#manual-scene-text").value.trim();
    if (make) updatePreview();
  }
  q<HTMLInputElement>(body, "#manual-make-branch").addEventListener("change", toggleBranch);
  q<HTMLSelectElement>(body, "#manual-branch-parent").addEventListener("change", updatePreview);
  q<HTMLInputElement>(body, "#manual-branch-suffix").addEventListener("input", updatePreview);
  q<HTMLTextAreaElement>(body, "#manual-scene-text").addEventListener("input", toggleBranch);

  q<HTMLButtonElement>(footer, "#manual-scene-cancel").onclick = () => ui.closeModal(overlay);
  q<HTMLButtonElement>(footer, "#manual-scene-as-note").onclick = () => {
    const text = q<HTMLTextAreaElement>(body, "#manual-scene-text").value.trim();
    if (!text) {
      ui.toast("Scene text is empty", "info");
      return;
    }
    saveAsManualNote({ text, title: q<HTMLInputElement>(body, "#manual-scene-title").value.trim(), stage });
    ui.closeModal(overlay);
    rerender();
  };
  q<HTMLButtonElement>(footer, "#manual-scene-as-branch").onclick = () => {
    const text = q<HTMLTextAreaElement>(body, "#manual-scene-text").value.trim();
    if (!text) {
      ui.toast("Scene text is empty", "info");
      return;
    }
    const title = q<HTMLInputElement>(body, "#manual-scene-title").value.trim() || text.split(/\n+/)[0].slice(0, 78) || "Manual Branch";
    const wantBranch = q<HTMLInputElement>(body, "#manual-make-branch").checked;
    if (wantBranch) {
      const parent = q<HTMLSelectElement>(body, "#manual-branch-parent").value || currentPartId;
      const suffix = q<HTMLInputElement>(body, "#manual-branch-suffix").value.trim();
      const result = Branch?.createBranch?.({
        world,
        parentSequenceId: parent,
        suffix,
        title,
        scene: text,
        summary: text.slice(0, 200)
      });
      if (!result?.ok) {
        ui.toast("Could not create branch chapter.", "error");
        return;
      }
      saveAsManualNote({ text, title, stage, branchLabel: result.branch?.chapterLabel || "" });
      ui.toast(`Branch ${result.branch?.chapterLabel} added to the chapter tree.`, "success");
    } else {
      saveAsManualNote({ text, title, stage });
      ui.toast("Manual scene held in summary.", "success");
    }
    ui.closeModal(overlay);
    rerender();
  };
  toggleBranch();
}

function saveAsManualNote({
  text,
  title,
  stage = {},
  branchLabel = ""
}: {
  text: string;
  title?: string;
  stage?: SceneBuilderStage;
  branchLabel?: string;
}): void {
  const resolvedTitle = title || text.split(/\n+/)[0].slice(0, 78) || "Manual Story Note";
  const beat = {
    id: `story_manual_${Date.now()}`,
    type: "story_manual",
    kind: "manual",
    title: branchLabel ? `[${branchLabel}] ${resolvedTitle}` : resolvedTitle,
    prompt: text,
    stageId: stage.id || "",
    stageName: stage.name || "",
    canonRisk: "green",
    tags: branchLabel ? ["manual", "table_control", "branch"] : ["manual", "table_control"],
    suggestedChoices: [
      {
        label: branchLabel ? "Open branch chapter" : "Accept as table note",
        ops: [{ op: "log", text: `Story note: ${text}` }]
      }
    ]
  };
  ops().apply({ op: "story_beat_save", beat, status: "manual" }, { source: "story_director_manual" });
  cs().mutate(
    (next) => {
      const draft = next as {
        storyMode?: {
          manualSummaryEntries?: Array<Record<string, unknown>>;
        };
      };
      draft.storyMode = draft.storyMode || {};
      draft.storyMode.manualSummaryEntries = draft.storyMode.manualSummaryEntries || [];
      draft.storyMode.manualSummaryEntries.unshift({
        id: beat.id,
        title: beat.title,
        text,
        stageId: stage.id || "",
        branchLabel: branchLabel || "",
        at: new Date().toISOString()
      });
    },
    { source: "story_manual_summary" }
  );
}
