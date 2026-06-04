// cui-hub-tab.ts — Phase K.3 TypeScript port of the shared side-content
// primitives (formerly `js/campaign/ui/tabs/cui-hub-tab.js`).
//
// The hub-family tab bodies (sideForge, questChains, oracleForge,
// battleSets, mapSeeds) are JSX (Phase K.3 prerequisite) — this module
// renders no tab and registers nothing. What remains is the shared
// side-content tone/consequence math: `operationTone`,
// `consequenceSummary`, `cardChoiceOps`, and the rumor helpers, plus the
// HTML-free `consequencePreviewData` / `flavorTrailData` builders.
//
// Part B retired the `renderConsequencePreview` / `renderFlavorTrail`
// HTML-string emitters: the JSX `<ConsequencePreview>` / `<FlavorTrail>`
// components (`src/campaign/tabs/ConsequenceViews.tsx`) render the
// structured data the builders return. The pure math still installs the
// same `window.CJS.CampaignUIInternal.HubTab` surface for the two
// remaining cross-module callers (overview's town-roll float + the manual
// event builder's rumor list); the typed React data builders import the
// data functions directly.

// ── Types ────────────────────────────────────────────────────────────
export interface CampaignOpLike {
  readonly op?: string;
  readonly amount?: number;
  readonly [key: string]: unknown;
}

export type ConsequenceTone = "reward" | "risk" | "quest" | "plot" | "flavor" | "mixed";

export interface ConsequenceSummary {
  readonly tone: ConsequenceTone;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly short: string;
}

export interface ConsequencePreviewOptions {
  readonly title?: string;
  readonly emptyTitle?: string;
  readonly emptyText?: string;
  readonly hasText?: boolean;
}

// Permissive input — the card data is loosely-typed JSON state, so every
// field is `unknown` and coerced at read time. No index signature, so any
// concrete card interface (with or without its own index sig) is assignable.
export interface FlavorTrailEntry {
  readonly suggestedUse?: unknown;
  readonly objective?: unknown;
  readonly gimmick?: unknown;
  readonly followUpHooks?: unknown;
  readonly oracleTableId?: unknown;
}

// Structured (HTML-free) data the JSX `<ConsequencePreview>` / `<FlavorTrail>`
// components render. Part B retired the `render*` HTML-string emitters; the
// tone/summary math below stays as the single source of truth feeding both
// the React data builders (tabs/data/*) and the story beat modal.
export interface ConsequencePreviewData {
  readonly tone: ConsequenceTone;
  readonly label: string;
  readonly title: string;
  readonly text: string;
  readonly lines: readonly string[];
}

export interface FlavorTrailLine {
  readonly label: string;
  readonly text: string;
}

export interface FlavorTrailData {
  readonly lines: readonly FlavorTrailLine[];
}

interface CardOpsSource {
  readonly suggestedChoices?: ReadonlyArray<{ readonly ops?: readonly unknown[] }>;
  readonly suggested?: readonly unknown[];
  readonly suggestedOps?: readonly unknown[];
  readonly rewardOps?: readonly unknown[];
  readonly [key: string]: unknown;
}

export interface RumorLike {
  readonly status?: string;
  readonly [key: string]: unknown;
}

interface HubStateLike {
  readonly rumors?: readonly RumorLike[];
  readonly [key: string]: unknown;
}

interface CampaignOpsSurface {
  readonly describe?: (ops: readonly CampaignOpLike[]) => readonly string[];
}

function ops(): CampaignOpsSurface {
  return (window as unknown as { CJS?: { CampaignOps?: CampaignOpsSurface } }).CJS?.CampaignOps ?? {};
}

// ── Tone / consequence math ────────────────────────────────────────────

export function operationTone(op: CampaignOpLike = {}): Exclude<ConsequenceTone, "mixed"> {
  const name = String(op.op || "").toLowerCase();
  if (!name || name === "log") return "flavor";
  if (/^(give_|heal_|restore_mp|recruit_character|learn_|unlock_|add_xp|add_level)/.test(name)) return "reward";
  if (/^(take_|damage_|spend_|add_status|remove_character|bench_character)/.test(name)) return "risk";
  if (name === "danger") return Number(op.amount || 0) > 0 ? "risk" : "reward";
  if (/quest|scenario|battle|node|map|hub_problem|hub_service|clock/.test(name)) return "quest";
  if (/rumor|flag|bond|reputation|npc_mood|hub_mood|hub_stat|memory|side_idea|review|world_transition|chapter_transition/.test(name)) return "plot";
  return "plot";
}

export function consequenceSummary(
  opsList: readonly unknown[] = [],
  options: { hasText?: boolean } = {}
): ConsequenceSummary {
  const list = (Array.isArray(opsList) ? opsList.filter(Boolean) : []) as CampaignOpLike[];
  const counts = { reward: 0, risk: 0, quest: 0, plot: 0, flavor: 0 };
  for (const op of list) counts[operationTone(op)] += 1;
  let tone: ConsequenceTone = "flavor";
  if (counts.reward && !counts.risk && !counts.quest && !counts.plot) tone = "reward";
  else if (counts.risk && !counts.reward && !counts.quest && !counts.plot) tone = "risk";
  else if (counts.quest && !counts.reward && !counts.risk) tone = "quest";
  else if (counts.plot && !counts.reward && !counts.risk && !counts.quest) tone = "plot";
  else if (counts.reward || counts.risk || counts.quest || counts.plot) tone = "mixed";
  else if (options.hasText) tone = "flavor";

  const labels: Record<ConsequenceTone, string> = {
    reward: "Gain",
    risk: "Risk / Cost",
    quest: "Quest / Progress",
    plot: "Plot / Text",
    flavor: "Flavor Only",
    mixed: "Mixed"
  };
  const titles: Record<ConsequenceTone, string> = {
    reward: "Applies rewards",
    risk: "Applies a cost or danger",
    quest: "Changes quest or hub progress",
    plot: "Adds plot state or table text",
    flavor: "Flavor text only",
    mixed: "Applies mixed consequences"
  };
  const details: Record<ConsequenceTone, string> = {
    reward: "Clicking applies gains such as items, money, JP, healing, unlocks, or roster growth.",
    risk: "Clicking applies loss, damage, danger, status pressure, or a similar cost.",
    quest: "Clicking starts or advances a quest, scenario, hub problem, service, map, or clock.",
    plot: "Clicking records story state such as rumors, flags, bonds, reputation, notes, or review items.",
    flavor: "No mechanical change yet. Keep it as narration, save it as a note, or turn it into a plot seed.",
    mixed: "Clicking applies more than one kind of result. Review the exact list before applying."
  };
  const shorts: Record<ConsequenceTone, string> = {
    reward: "You get something.",
    risk: "Something pushes back.",
    quest: "The campaign state moves forward.",
    plot: "Story text or plot state changes.",
    flavor: "Text only until you save or promote it.",
    mixed: "Multiple consequences apply."
  };
  return { tone, label: labels[tone], title: titles[tone], detail: details[tone], short: shorts[tone] };
}

export function cardChoiceOps(card: CardOpsSource = {}): readonly unknown[] {
  const firstChoice = card.suggestedChoices?.[0]?.ops;
  const list = firstChoice || card.suggested || card.suggestedOps || card.rewardOps || [];
  return Array.isArray(list) ? list : [];
}

// ── Consequence preview / flavor trail (structured data) ────────────────
// No HTML — these return typed data the JSX `<ConsequencePreview>` /
// `<FlavorTrail>` components (`src/campaign/tabs/ConsequenceViews.tsx`)
// render. Consumed by the typed data builders (ResultPanels, SideContent,
// SoloNotice, Story Director routes) and the React story beat modal.

export function consequencePreviewData(
  opsList: readonly unknown[] = [],
  options: ConsequencePreviewOptions = {}
): ConsequencePreviewData {
  const list = (Array.isArray(opsList) ? opsList.filter(Boolean) : []) as CampaignOpLike[];
  const summary = consequenceSummary(list, { hasText: options.hasText });
  const title = options.title || (list.length ? summary.title : options.emptyTitle) || summary.title;
  const text = list.length ? summary.detail : (options.emptyText || summary.detail);
  const lines = list.length ? ops().describe?.(list) || [] : [];
  return { tone: summary.tone, label: summary.label, title, text, lines };
}

export function flavorTrailData(entry: unknown): FlavorTrailData | null {
  const e = (entry ?? {}) as FlavorTrailEntry;
  const lines: FlavorTrailLine[] = [];
  if (e.suggestedUse) lines.push({ label: "Use", text: String(e.suggestedUse) });
  if (e.objective) lines.push({ label: "Objective", text: String(e.objective) });
  if (e.gimmick) lines.push({ label: "Scene logic", text: String(e.gimmick) });
  const hooks = e.followUpHooks;
  if (Array.isArray(hooks) && hooks.length) {
    lines.push({ label: "Follow-up", text: hooks.map(String).join(" / ") });
  }
  if (e.oracleTableId) {
    lines.push({ label: "Oracle", text: "Roll a linked prompt if the text needs a sharper direction." });
  }
  if (!lines.length) return null;
  return { lines };
}

// ── Rumor helpers ──────────────────────────────────────────────────────

export function isRumorOpen(rumor: RumorLike = {}): boolean {
  return !["resolved", "promoted", "dismissed", "archived"].includes(
    String(rumor.status || "active").toLowerCase()
  );
}

export function openRumors(hubState: HubStateLike | null | undefined): readonly RumorLike[] {
  return (hubState?.rumors || []).filter(isRumorOpen);
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiHubTab {
  readonly operationTone: typeof operationTone;
  readonly consequenceSummary: typeof consequenceSummary;
  readonly cardChoiceOps: typeof cardChoiceOps;
  readonly openRumors: typeof openRumors;
  readonly isRumorOpen: typeof isRumorOpen;
}

const NAMESPACE: CuiHubTab = Object.freeze({
  operationTone,
  consequenceSummary,
  cardChoiceOps,
  openRumors,
  isRumorOpen
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { HubTab?: CuiHubTab; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.HubTab = NAMESPACE;

export default NAMESPACE;
