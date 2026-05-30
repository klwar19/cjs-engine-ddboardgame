// cui-hub-tab.ts — Phase K.3 TypeScript port of the shared side-content
// primitives (formerly `js/campaign/ui/tabs/cui-hub-tab.js`).
//
// The hub-family tab bodies (sideForge, questChains, oracleForge,
// battleSets, mapSeeds) are JSX (Phase K.3 prerequisite) — this module
// renders no tab and registers nothing. What remains is the shared
// side-content math + the two display-only HTML emitters
// (consequence preview, flavor trail). They are consumed by BOTH the
// typed React data bridges (getEventResultData / getOracleData /
// getSideForgeData / getTownSnapshotData / getStoryDirectorData …) AND
// the imperative story-director beat modal (story-director-card.ts) and
// the manual event builder (event-builder.ts), so the single source of
// truth is one TS module that installs the same
// `window.CJS.CampaignUIInternal.HubTab` surface the JS island did —
// every existing consumer keeps working unchanged.
//
// The consequence-preview / flavor-trail strings carry no
// `data-campaign-action`; they are display-only.

import { esc, escAttr } from "./cui-utils";

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

export interface FlavorTrailEntry {
  readonly suggestedUse?: string;
  readonly objective?: string;
  readonly gimmick?: string;
  readonly followUpHooks?: readonly string[];
  readonly oracleTableId?: string;
  readonly [key: string]: unknown;
}

interface CardOpsSource {
  readonly suggestedChoices?: ReadonlyArray<{ readonly ops?: readonly CampaignOpLike[] }>;
  readonly suggested?: readonly CampaignOpLike[];
  readonly suggestedOps?: readonly CampaignOpLike[];
  readonly rewardOps?: readonly CampaignOpLike[];
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
  opsList: readonly CampaignOpLike[] = [],
  options: { hasText?: boolean } = {}
): ConsequenceSummary {
  const list = Array.isArray(opsList) ? opsList.filter(Boolean) : [];
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

export function cardChoiceOps(card: CardOpsSource = {}): readonly CampaignOpLike[] {
  const firstChoice = card.suggestedChoices?.[0]?.ops;
  const list = firstChoice || card.suggested || card.suggestedOps || card.rewardOps || [];
  return Array.isArray(list) ? list : [];
}

// ── Consequence preview / flavor trail (display-only HTML) ──────────────
// No data-campaign-action; consumed by the typed bridges (ResultPanels,
// SideContent, SoloNotice, StoryDirectorPanels) as a dangerouslySetInnerHTML
// island and by the imperative beat modal / manual event builder.

export function renderConsequencePreview(
  opsList: readonly CampaignOpLike[] = [],
  options: ConsequencePreviewOptions = {}
): string {
  const list = Array.isArray(opsList) ? opsList.filter(Boolean) : [];
  const summary = consequenceSummary(list, { hasText: options.hasText });
  const title = options.title || (list.length ? summary.title : options.emptyTitle) || summary.title;
  const text = list.length ? summary.detail : (options.emptyText || summary.detail);
  const lines = list.length ? ops().describe?.(list) || [] : [];
  return `
      <div class="campaign-consequence is-${escAttr(summary.tone)}">
        <div class="campaign-consequence-head">
          <span class="campaign-impact-badge is-${escAttr(summary.tone)}">${esc(summary.label)}</span>
          <strong>${esc(title)}</strong>
        </div>
        <span>${esc(text)}</span>
        ${lines.length ? `<ul>${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
}

export function renderFlavorTrail(entry: FlavorTrailEntry = {}): string {
  const lines: Array<[string, string]> = [];
  if (entry.suggestedUse) lines.push(["Use", entry.suggestedUse]);
  if (entry.objective) lines.push(["Objective", entry.objective]);
  if (entry.gimmick) lines.push(["Scene logic", entry.gimmick]);
  if (entry.followUpHooks?.length) lines.push(["Follow-up", entry.followUpHooks.join(" / ")]);
  if (entry.oracleTableId) lines.push(["Oracle", "Roll a linked prompt if the text needs a sharper direction."]);
  if (!lines.length) return "";
  return `
      <div class="campaign-flavor-trail">
        ${lines
          .map(
            ([label, text]) => `
          <div>
            <b>${esc(label)}</b>
            <span>${esc(text)}</span>
          </div>
        `
          )
          .join("")}
      </div>
    `;
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
  readonly renderConsequencePreview: typeof renderConsequencePreview;
  readonly renderFlavorTrail: typeof renderFlavorTrail;
  readonly openRumors: typeof openRumors;
  readonly isRumorOpen: typeof isRumorOpen;
}

const NAMESPACE: CuiHubTab = Object.freeze({
  operationTone,
  consequenceSummary,
  cardChoiceOps,
  renderConsequencePreview,
  renderFlavorTrail,
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
