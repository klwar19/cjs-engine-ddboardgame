// rumor.ts — Phase H.3 hub-pulse + rumor action handlers.
//
// Roll a hub-pulse card, and resolve / promote a rumor to a quest or a
// hub problem. The tiny `_rumorById` lookup ports alongside (used only
// here). Op payloads (the add_quest / hub_problem_add + resolve_rumor
// batches), the generated ids, the mode/tab jumps and toast strings
// mirror the deleted closures.
//
// The solo-hook handlers (solo-surprise / accept- / save- / ignore- /
// solo-hook-quest / -rumor) stay in the switch — they share the
// `_pendingSoloHookCard` / `_setPendingSoloHook` / `_clearPendingSoloHook`
// state helpers (also read by render/data code) and `_startQuestRunFromOffer`.

import { cs, mod, ops, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";

interface Rumor {
  id?: string;
  text?: string;
  tags?: string[];
  [key: string]: unknown;
}
interface HubModule {
  getCurrentHubId?: () => string | undefined;
  getCurrentHubState?: () => { rumors?: Rumor[] } | null | undefined;
  rollHubPulse?: (table: string) => unknown;
}

function hub(): HubModule | undefined {
  return mod<HubModule>("CampaignHub");
}

function truncate(value: string, max: number): string {
  const fn = mod<{ Utils?: { truncate?: (v: string, n: number) => string } }>("CampaignUIInternal")?.Utils?.truncate;
  return fn ? fn(value, max) : value;
}

function rumorById(rumorId: string, hubId: string): { hubId: string | undefined; rumor: Rumor | undefined } {
  const id = hubId || hub()?.getCurrentHubId?.();
  const hubState = id ? cs().getHubState(id) : hub()?.getCurrentHubState?.();
  return { hubId: id, rumor: (hubState?.rumors || []).find((entry) => entry.id === rumorId) };
}

export function rollHubPulse(table: string): void {
  setActiveModeRaw("event");
  setActiveTabRaw("sideForge");
  const card = hub()?.rollHubPulse?.(table);
  if (!card) {
    toast("No hub events available", "info");
    return;
  }
  rerender();
}

export function resolveRumor(rumorId: string, hubId: string, status = "resolved"): void {
  const found = rumorById(rumorId, hubId);
  if (!found.rumor) {
    toast("Rumor not found", "info");
    return;
  }
  ops().apply({ op: "resolve_rumor", hubId: found.hubId, rumorId, status }, { source: "rumor" });
  rerender();
  toast(status === "promoted" ? "Rumor promoted and removed from open leads" : "Rumor resolved", "success");
}

export function rumorToQuest(rumorId: string, hubId: string): void {
  const found = rumorById(rumorId, hubId);
  const rumor = found.rumor;
  if (!rumor) {
    toast("Rumor not found", "info");
    return;
  }
  const title = truncate(rumor.text || rumor.id || "", 52);
  const questId = `quest_rumor_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  ops().apply([
    {
      op: "add_quest",
      quest: {
        id: questId,
        title: `Rumor: ${title}`,
        status: "active",
        summary: rumor.text || "",
        tags: ["rumor", ...(rumor.tags || [])],
        objectives: [{ id: "follow_lead", label: "Follow the rumor lead", current: 0, required: 1 }],
        rewards: []
      }
    },
    { op: "resolve_rumor", hubId: found.hubId, rumorId, status: "promoted" }
  ], { source: "rumor_to_quest" });
  setActiveModeRaw("quest");
  setActiveTabRaw("quests");
  rerender();
  toast("Rumor promoted to Quest", "success");
}

export function rumorToProblem(rumorId: string, hubId: string): void {
  const found = rumorById(rumorId, hubId);
  const rumor = found.rumor;
  if (!rumor) {
    toast("Rumor not found", "info");
    return;
  }
  const label = truncate(rumor.text || rumor.id || "", 48);
  ops().apply([
    {
      op: "hub_problem_add",
      hubId: found.hubId,
      problemId: `rumor_problem_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      label,
      notes: rumor.text || ""
    },
    { op: "resolve_rumor", hubId: found.hubId, rumorId, status: "promoted" }
  ], { source: "rumor_to_problem" });
  rerender();
  toast("Rumor escalated to hub problem", "success");
}
