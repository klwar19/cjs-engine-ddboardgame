// solo.ts — Phase H.3 solo-hook offer / dismissal handlers.
//
// The "offer" actions roll a hub-pulse card and stash it as a pending
// solo hook the Story tab surfaces. The "save"/"ignore" actions take the
// pending card and either save it to side content or reject it, then
// clear the pending pointer. `_setPendingSoloHook` had only these two
// callers in JS, so it ports here; `_clearPendingSoloHook` is also called
// by the still-JS `_startQuestRunFromOffer` / `_acceptSoloHook` /
// `_soloHookToQuest` / `_soloHookToRumor`, so the tiny one-line mutation
// is duplicated rather than centralized in TS (the JS clear stays). The
// `_pendingSoloHookCard` lookup is also read by render/data code, so the
// JS closure stays and the TS handlers inline the same lookup.
//
// Mutation sources, op payloads, mode/tab jumps and toast strings mirror
// the deleted closures exactly. (random-quest-offer + accept/solo-hook-quest
// /rumor stay — they call the still-JS `_startQuestRunFromOffer` /
// `_startQuestChainRun` scenario launchers.)

import { applyOp, cs, mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { modals, widgets } from "./modals";

interface SoloCard {
  id?: string;
  type?: string;
  [key: string]: unknown;
}
interface HubModule {
  rollHubPulse?: (table: string) => SoloCard | null | undefined;
  getCurrentHubId?: () => string | undefined;
}
interface SideContentModule {
  saveCard?: (card: SoloCard, opts: { status: string; source: string }) => void;
  rejectCard?: (id: string, reason: string) => void;
}

function hub(): HubModule | undefined {
  return mod<HubModule>("CampaignHub");
}
function side(): SideContentModule | undefined {
  return mod<SideContentModule>("CampaignSideContent");
}

function setPendingSoloHook(card: SoloCard, kind: string): void {
  const id = card?.id;
  if (!id) return;
  cs().mutate((state) => {
    (state as { pendingSoloHook?: unknown }).pendingSoloHook = {
      cardId: id,
      kind: kind || card.type || "hook",
      at: new Date().toISOString()
    };
  }, { source: "solo_hook" });
}

function clearPendingSoloHook(): void {
  cs().mutate((state) => {
    (state as { pendingSoloHook?: unknown }).pendingSoloHook = null;
  }, { source: "solo_hook" });
}

function pendingSoloHookCard(): SoloCard | null {
  const state = cs().getState() as
    | { pendingSoloHook?: { cardId?: string }; sideContent?: { generatedIdeas?: Record<string, SoloCard> }; lastSideContentCard?: SoloCard }
    | null;
  const id = state?.pendingSoloHook?.cardId;
  if (!id) return null;
  return (
    state?.sideContent?.generatedIdeas?.[id] ||
    (state?.lastSideContentCard?.id === id ? state.lastSideContentCard : null)
  );
}

export function rollSoloSurprise(): void {
  const tables = ["town", "guild", "tavern", "forge", "weird"];
  const table = tables[Math.floor(Math.random() * tables.length)];
  const card = hub()?.rollHubPulse?.(table);
  if (!card) {
    toast("No solo hooks available", "info");
    return;
  }
  setPendingSoloHook(card, "surprise");
  setActiveModeRaw("story");
  setActiveTabRaw("storyHome");
  rerender();
  toast("Story offer ready", "success");
}

export function offerRandomRumor(): void {
  const tables = ["tavern", "town", "weird"];
  const table = tables[Math.floor(Math.random() * tables.length)];
  const card = hub()?.rollHubPulse?.(table);
  if (!card) {
    toast("No rumor hooks available", "info");
    return;
  }
  setPendingSoloHook({ ...card, type: "rumor_offer" }, "rumor_offer");
  rerender();
}

export function saveSoloHook(): void {
  const card = pendingSoloHookCard();
  if (!card) return;
  side()?.saveCard?.(card, { status: "saved", source: "solo_hook" });
  clearPendingSoloHook();
}

export function ignoreSoloHook(): void {
  const card = pendingSoloHookCard();
  if (card) side()?.rejectCard?.(card.id || "", "Ignored from story offer.");
  clearPendingSoloHook();
}

export function manualRumorModal(): void {
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const body = document.createElement("div");
  const hint = document.createElement("div");
  hint.className = "campaign-muted";
  hint.style.marginBottom = "8px";
  hint.textContent = "Rumors are stored leads. They do not change mechanics until you promote or apply them later.";
  body.appendChild(hint);
  body.appendChild(m.formLabel("Rumor"));
  const text = document.createElement("textarea");
  text.style.width = "100%";
  text.style.minHeight = "90px";
  text.placeholder = "What are people whispering about?";
  body.appendChild(text);
  body.appendChild(m.formLabel("Canon risk"));
  const risk = ui.createSelect({
    options: [
      { value: "green", label: "Green" },
      { value: "yellow", label: "Yellow" },
      { value: "red", label: "Red" }
    ],
    value: "green"
  });
  body.appendChild(risk);
  m.formModal({
    title: "Add Rumor",
    body,
    width: "520px",
    primaryLabel: "Add Rumor",
    onSubmit: () => {
      const value = text.value.trim();
      if (!value) {
        toast("Rumor text required", "error");
        return false;
      }
      applyOp({
        op: "add_rumor",
        hubId: hub()?.getCurrentHubId?.(),
        text: value,
        canonRisk: risk.value,
        source: "manual"
      });
    }
  });
}
