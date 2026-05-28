// events.ts — Phase H.3 event / oracle resolution handlers + shared
// event builders.
//
// roll-event / pick-event open the authored-event picker. apply-event /
// edit-event / note-event / ignore-event / pin-plot-seed delegate to
// CampaignEvents. event-to-quest / oracle-to-quest promote the prompt to a
// quest via `addQuestFromPrompt`. event-add-tags / oracle-add-tags open the
// tag prompt. event-log-only summarizes into the event log. event-to-oracle
// rolls the oracle from the current event. copy-event-summary copies the
// summary. The shared builders (`addQuestFromPrompt`, `tagPromptModal`,
// `opsModal`, `eventSummary`, `eventChoices`) port here too; oracle.ts imports
// `addQuestFromPrompt` / `tagPromptModal` for its oracle-to-* handlers.
//
// Op names, payload keys, mutation sources, toast strings and the modal
// configs mirror the deleted closures exactly. (custom-event /
// oracle-to-event-builder stay in the switch — they open the 266-line
// `_openManualEventBuilder`, ported in a follow-up.)

import { applyOp, cs, mod, ops, toast } from "./context";
import { modals, utils } from "./modals";
import { copyPlainText } from "./copy";

interface CampaignEventLike {
  id?: string;
  title?: string;
  prompt?: string;
  gmHook?: string;
  text?: string;
  summary?: string;
  type?: string;
  kind?: string;
  source?: string;
  tableName?: string;
  tags?: string[];
  suggested?: unknown[];
  manualSummary?: { short?: string; full?: string; tags?: string[] };
  [key: string]: unknown;
}
interface OracleLike {
  id?: string;
  text?: string;
  prompt?: string;
  tags?: string[];
  [key: string]: unknown;
}
interface EventTable {
  id?: string;
  name?: string;
  entries?: Array<{ id?: string; title?: string; [key: string]: unknown }>;
}
interface CampaignEventsModule {
  applyEvent: (event: CampaignEventLike | null | undefined, ops?: unknown[]) => void;
  ignoreEvent: (event: CampaignEventLike | null | undefined, asNote: boolean) => void;
  pinAsPlotSeed: (event: CampaignEventLike) => void;
}
interface OracleRollModule {
  roll?: () => OracleLike | null | undefined;
}

function events(): CampaignEventsModule | undefined {
  return mod<CampaignEventsModule>("CampaignEvents");
}
function lastEvent(): CampaignEventLike | null {
  return (cs().getState() as { lastEvent?: CampaignEventLike } | null)?.lastEvent ?? null;
}
function lastOracle(): OracleLike | null {
  return (cs().getState() as { lastOracle?: OracleLike } | null)?.lastOracle ?? null;
}

export function eventSummary(event: CampaignEventLike = {}): string {
  return (
    event.manualSummary?.short ||
    event.summary ||
    event.prompt ||
    event.gmHook ||
    event.text ||
    event.title ||
    event.id ||
    "Event happened."
  );
}

interface EventChoice {
  value: string;
  label: string;
  sub?: string;
  _entry: Record<string, unknown>;
}

export function eventChoices(): EventChoice[] {
  const campaign = cs().getCurrentCampaign();
  const tables = ((campaign?.eventTables as string[] | undefined) || [])
    .map((id) => (cs().getContent().campaignEvents as Record<string, EventTable>)?.[id])
    .filter(Boolean) as EventTable[];
  const seen = new Map<string, EventChoice>();
  for (const table of tables) {
    for (const entry of table.entries || []) {
      if (!entry.id || seen.has(entry.id)) continue;
      seen.set(entry.id, {
        value: entry.id,
        label: entry.title || entry.id,
        sub: table.name || table.id,
        _entry: { ...entry, tableId: table.id, tableName: table.name }
      });
    }
  }
  return Array.from(seen.values());
}

export function pickEvent(): void {
  const choices = eventChoices();
  if (!choices.length) {
    toast("No events authored yet", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Pick Event",
    options: choices.map(({ value, label, sub }) => ({ value, label, sub })),
    placeholder: "Search events…",
    primaryLabel: "Use Event",
    onSubmit: ({ value }) => {
      const opt = choices.find((c) => c.value === value);
      if (!opt) return;
      const event = { ...opt._entry, rolledAt: new Date().toISOString() };
      cs().mutate((state) => {
        (state as { lastEvent?: unknown }).lastEvent = event;
      }, { source: "event_pick" });
    }
  });
}

export function applyEvent(): void {
  const event = lastEvent();
  events()?.applyEvent(event);
  cs().mutate((state) => {
    (state as { lastEvent?: unknown }).lastEvent = null;
  }, { source: "event" });
}

export function editEvent(): void {
  const event = lastEvent();
  opsModal("Edit Event Operations", event?.suggested || [], (edited) => {
    events()?.applyEvent(event, edited);
    cs().mutate((state) => {
      (state as { lastEvent?: unknown }).lastEvent = null;
    }, { source: "event" });
  });
}

export function eventToQuest(): void {
  const event = lastEvent();
  if (!event) return;
  addQuestFromPrompt({
    title: event.title || "Event Quest",
    summary: eventSummary(event),
    source: event.source || event.tableName || "event",
    tags: ["event", ...(event.tags || []), ...(event.manualSummary?.tags || [])]
  });
  cs().mutate((state) => {
    (state as { lastEvent?: unknown }).lastEvent = null;
  }, { source: "event_quest" });
}

export function eventLogOnly(): void {
  const event = lastEvent();
  if (!event) return;
  applyOp({
    op: "event_log_add",
    entry: {
      title: event.title || event.id || "Event",
      summary: eventSummary(event),
      source: event.source || event.tableName || "event",
      scope: event.type || event.kind || "event",
      relatedId: event.id || null,
      tags: ["event", ...(event.tags || []), ...(event.manualSummary?.tags || [])],
      consequences: ops().describe(event.suggested || []).filter(Boolean)
    }
  }, "event_log_only");
  cs().mutate((state) => {
    (state as { lastEvent?: unknown }).lastEvent = null;
  }, { source: "event_log_only" });
  toast("Event summarized in Event Log", "success");
}

export function eventAddTags(): void {
  const event = lastEvent();
  if (!event) return;
  tagPromptModal("Tag Event", eventSummary(event), "event", event.id || null);
}

export function noteEvent(): void {
  const event = lastEvent();
  events()?.ignoreEvent(event, true);
  cs().mutate((state) => {
    (state as { lastEvent?: unknown }).lastEvent = null;
  }, { source: "event" });
}

export function ignoreEvent(): void {
  const event = lastEvent();
  events()?.ignoreEvent(event, false);
  cs().mutate((state) => {
    (state as { lastEvent?: unknown }).lastEvent = null;
  }, { source: "event" });
}

export function pinPlotSeed(): void {
  const event = lastEvent();
  if (!event) return;
  events()?.pinAsPlotSeed(event);
  toast("Plot seed pinned to notes", "success");
}

export function eventToOracle(): void {
  const event = lastEvent();
  const oracle = mod<OracleRollModule>("CampaignOracle")?.roll?.();
  if (!oracle) {
    toast("Oracle table empty", "info");
    return;
  }
  cs().mutate((state) => {
    (state as { lastOracle?: unknown }).lastOracle = { ...oracle, source: event ? `event:${event.id}` : "event" };
  }, { source: "oracle_from_event" });
  toast("Oracle rolled from event", "success");
}

export function copyEventSummary(): void {
  const event = lastEvent();
  const text =
    event?.manualSummary?.full ||
    [event?.title || "Event", event?.prompt || "", event?.gmHook ? `GM hook: ${event.gmHook}` : ""]
      .filter(Boolean)
      .join("\n\n");
  copyPlainText("Event Summary", text, "Event summary copied");
}

// ── Oracle → event-builder bridges (consumed by oracle.ts) ────────
export function oracleToQuest(): void {
  const oracle = lastOracle();
  if (!oracle) return;
  addQuestFromPrompt({
    title: "Oracle Quest",
    summary: oracle.text || oracle.prompt || "",
    source: "oracle",
    tags: ["oracle", ...(oracle.tags || [])]
  });
  cs().mutate((state) => {
    (state as { lastOracle?: unknown }).lastOracle = null;
  }, { source: "oracle_quest" });
}

export function oracleAddTags(): void {
  const oracle = lastOracle();
  if (!oracle) return;
  tagPromptModal("Tag Oracle Prompt", oracle.text || oracle.prompt || "Oracle prompt", "oracle", oracle.id || null);
}

// ── Shared builders ───────────────────────────────────────────────
export interface QuestPromptInput {
  title?: string;
  summary?: string;
  source?: string;
  tags?: string[];
}

export function addQuestFromPrompt({ title = "Event Quest", summary = "", source = "event", tags = [] }: QuestPromptInput = {}): void {
  const cleanTitle = title || "Event Quest";
  const questId = `${source || "event"}_quest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const safe = utils()?.safe ?? ((v: unknown) => String(v ?? ""));
  const quest = {
    id: safe(questId),
    title: cleanTitle,
    status: "active",
    summary: summary || cleanTitle,
    notes: summary || "",
    objectives: [{ id: "obj_1", label: "Resolve the hook", current: 0, required: 1 }],
    rewards: [],
    tags: Array.from(new Set(["promoted_event", source, ...tags].filter(Boolean)))
  };
  ops().apply({ op: "add_quest", quest }, { source: `${source}_to_quest` });
  ops().apply({
    op: "event_log_add",
    entry: {
      title: cleanTitle,
      summary: summary || cleanTitle,
      source,
      scope: "quest",
      relatedId: quest.id,
      tags: quest.tags,
      consequences: [`Quest created: ${cleanTitle}`]
    }
  }, { source: `${source}_to_quest` });
  toast("Quest created from prompt", "success");
}

export function tagPromptModal(title: string, note: string, scope: string, targetId: string | null): void {
  modals()?.textareaModal({
    title,
    label: "Tags",
    placeholder: "comma-separated tags",
    primaryLabel: "Add Tags",
    onSubmit: (text) => {
      const tags = String(text || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (!tags.length) {
        toast("Add at least one tag", "info");
        return false;
      }
      ops().apply(
        tags.map((tag) => ({
          op: "tag_add",
          tag,
          scope,
          targetType: scope,
          targetId,
          note,
          source: "event_oracle_ui"
        })),
        { source: "event_oracle_tags" }
      );
    }
  });
}

export function opsModal(title: string, opsList: unknown[], onApply: (parsed: unknown[]) => void): void {
  const ui = mod<{ openModal: (cfg: { title: string; content: HTMLElement; footer: HTMLElement; width: string }) => unknown; closeModal: (overlay: unknown) => void }>("UI");
  if (!ui) return;
  const esc = utils()?.esc ?? ((v: unknown) => String(v ?? ""));
  const body = document.createElement("div");
  body.innerHTML = `<textarea id="ops-json" style="min-height:220px;font-family:monospace">${esc(JSON.stringify(opsList, null, 2))}</textarea>`;
  const footer = document.createElement("div");
  footer.innerHTML = '<button class="btn btn-primary">Apply</button>';
  const overlay = ui.openModal({ title, content: body, footer, width: "680px" });
  const button = footer.querySelector("button");
  if (button) {
    button.onclick = () => {
      try {
        const textarea = body.querySelector("#ops-json") as HTMLTextAreaElement | null;
        onApply(JSON.parse(textarea?.value || "[]"));
        ui.closeModal(overlay);
      } catch (error) {
        toast((error as Error).message || "Invalid JSON", "error");
      }
    };
  }
}
