// side.ts — Phase H.3 side-content (Hub Pulse) action handlers.
//
// Apply / save / reject / dismiss / copy a generated side-content card,
// and import/export a side-content pack. The two tiny closure-private
// helpers (_sideCardById, _clearCurrentSideCard) port alongside as local
// functions — they were used only by these handlers. Mutation sources,
// CampaignHub / CampaignSideContent calls, the red-risk confirm and the
// import JSON-parse flow mirror the deleted closures.

import { cs, confirmDialog, mod, rerender, toast } from "./context";

interface SideCard {
  id?: string;
  canonRisk?: string;
  [key: string]: unknown;
}
interface HubModule {
  applyChoice?: (id: string, choiceIndex: number, opts: { approved: boolean }) => void;
}
interface SideContentModule {
  saveCard?: (card: SideCard, opts: { status: string; source: string }) => void;
  rejectCard?: (id: string, reason: string) => void;
  copyMarkdown?: (card: SideCard) => Promise<unknown>;
  importPack?: (pack: unknown) => void;
}
interface SaveManagerModule {
  downloadTextFile?: (name: string, content: string, mime?: string) => void;
}
interface ModalsModule {
  textareaModal: (cfg: {
    title: string; label: string; placeholder?: string; primaryLabel: string; width?: string;
    onSubmit: (text: string) => boolean | void;
  }) => void;
}

function side(): SideContentModule | undefined {
  return mod<SideContentModule>("CampaignSideContent");
}
function textareaModal(): ModalsModule["textareaModal"] | undefined {
  return mod<{ Modals?: ModalsModule }>("CampaignUIInternal")?.Modals?.textareaModal;
}
function safe(value: unknown): string {
  const fn = mod<{ Utils?: { safe?: (v: unknown) => string } }>("CampaignUIInternal")?.Utils?.safe;
  return fn ? fn(value) : String(value ?? "");
}

function sideCardById(id: string): SideCard | null {
  const state = cs().getState() as
    | { sideContent?: { generatedIdeas?: Record<string, SideCard> }; lastSideContentCard?: SideCard }
    | null;
  return (
    state?.sideContent?.generatedIdeas?.[id] ||
    (state?.lastSideContentCard?.id === id ? state.lastSideContentCard : null) ||
    null
  );
}

function clearCurrentSideCard(id: string): void {
  cs().mutate((state) => {
    const s = state as { lastSideContentCard?: SideCard | null };
    if (!id || s.lastSideContentCard?.id === id) s.lastSideContentCard = null;
  }, { source: "side_card_clear" });
}

export function applySideChoice(id: string, choiceIndex: number): void {
  const card = sideCardById(id);
  const applyNow = (approved: boolean) => {
    mod<HubModule>("CampaignHub")?.applyChoice?.(id, choiceIndex, { approved });
    clearCurrentSideCard(id);
    rerender();
    toast(approved ? "Pulse applied and cleared" : "Pulse sent to review and cleared", approved ? "success" : "info");
  };
  if (card?.canonRisk === "red") {
    confirmDialog(
      "This is red-risk content. Approve and apply it now?",
      () => applyNow(true),
      () => applyNow(false)
    );
    return;
  }
  applyNow(true);
}

export function saveSideIdea(id: string): void {
  const card = sideCardById(id);
  if (!card) return;
  side()?.saveCard?.(card, { status: "saved", source: "ui" });
  clearCurrentSideCard(id);
  rerender();
  toast("Idea saved and cleared from current result", "success");
}

export function rejectSideIdea(id: string): void {
  textareaModal()?.({
    title: "Reject Idea",
    label: "Reason (optional)",
    placeholder: "Why is this rejected?",
    primaryLabel: "Reject",
    onSubmit: (reason) => {
      side()?.rejectCard?.(id, reason || "");
      clearCurrentSideCard(id);
      rerender();
    }
  });
}

export function dismissSideCard(id: string): void {
  clearCurrentSideCard(id);
  rerender();
}

export function copySideCard(id: string): void {
  const card = sideCardById(id);
  if (!card) return;
  side()?.copyMarkdown?.(card).then(() => toast("Card copied as Markdown", "success"));
}

export function importSidePack(): void {
  textareaModal()?.({
    title: "Import Side Content Pack",
    label: "Paste pack JSON",
    placeholder: '{ "id": "...", "cards": [...] }',
    primaryLabel: "Import",
    width: "640px",
    onSubmit: (raw) => {
      if (!raw) {
        toast("Nothing to import", "info");
        return false;
      }
      try {
        const pack = JSON.parse(raw);
        side()?.importPack?.(pack);
        toast("Side content pack imported", "success");
      } catch (error) {
        toast((error as Error).message || "Invalid JSON", "error");
        return false;
      }
    }
  });
}

export function exportSidePack(): void {
  const state = cs().getState() as
    | { saveId?: string; slotName?: string; sideContent?: { generatedIdeas?: unknown; reviewQueue?: unknown; activeQuestChains?: unknown } }
    | null;
  if (!state) return;
  const content = {
    exportedAt: new Date().toISOString(),
    saveId: state.saveId,
    generatedIdeas: state.sideContent?.generatedIdeas || {},
    reviewQueue: state.sideContent?.reviewQueue || [],
    activeQuestChains: state.sideContent?.activeQuestChains || {}
  };
  mod<SaveManagerModule>("SaveManager")?.downloadTextFile?.(
    `${safe(state.slotName)}-side-content.json`,
    `${JSON.stringify(content, null, 2)}\n`,
    "application/json"
  );
}
