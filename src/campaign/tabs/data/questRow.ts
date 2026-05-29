// questRow.ts — Phase G typed shape for the shared QuestRow JSX
// component used by QuestHome and QuestsPanel.
//
// Phase H.4 — `getQuestRowData` ported inline. The companion typed
// helpers (`questStatusClass`, `questMiniGameObjective`, etc.) live in
// `src/campaign/util/state-helpers.ts`. The scenario pill (`questScenarioPill`)
// is co-located here since it's only consumed by `getQuestRowData`.

import { label } from "../../util/cui-utils";
import {
  questNextObjective,
  questObjectiveDone,
  questStatusClass,
  questMiniGameObjective,
  activeRunQuestId,
  type QuestObjective as TriggerObjective,
  type QuestObjectiveTrigger,
  type ActiveRunLike,
  type ActiveScenarioLike,
  type QuestLike
} from "../../util/state-helpers";
import type { QuestPillData } from "./scenarioShared";

export interface QuestObjective {
  readonly id: string;
  readonly label: string;
  readonly current: number;
  readonly required: number;
  readonly pct: number;
  readonly done: boolean;
  readonly pulseHints: readonly string[];
}

export interface QuestVariant {
  readonly label: string;
  readonly text: string;
  readonly repeat: string;
}

export interface QuestRowData {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly statusLabel: string;
  readonly statusClass: string;
  readonly metaLine: string;
  readonly resolved: boolean;
  readonly isRunQuest: boolean;
  readonly scenarioDisabled: boolean;
  readonly scenarioLabel: string;
  readonly scenarioHint: string;
  readonly scenarioPill: QuestPillData | null;
  readonly hasMiniGame: boolean;
  readonly tagChips: readonly string[];
  readonly variant: QuestVariant | null;
  readonly phaseLabel: string;
  readonly doneCount: number;
  readonly totalCount: number;
  readonly objectives: readonly QuestObjective[];
}

// ── Module surfaces ─────────────────────────────────────────────────
interface CampaignStateModule {
  readonly getState?: () => CampaignStateForRow | null | undefined;
  readonly getActiveScenario?: () => ScenarioRecord | null | undefined;
  readonly getScenarioById?: (id: string) => ScenarioRecord | null | undefined;
}

interface QuestRowCjs {
  readonly CampaignState?: CampaignStateModule;
}

function cjs(): QuestRowCjs {
  return (window as unknown as { CJS?: QuestRowCjs }).CJS ?? {};
}

interface ScenarioRecord {
  readonly id?: string;
  readonly name?: string;
  readonly source?: { readonly questId?: string };
}

interface CampaignStateForRow {
  readonly activeScenarioRun?: ActiveRunLike & { readonly scenarioId?: string };
  readonly quests?: Record<string, QuestRowInput>;
  readonly sideContent?: { readonly generatedScenarios?: Record<string, ScenarioRecord> };
}

export interface QuestRowInput extends QuestLike {
  readonly id?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly status?: string;
  readonly giver?: string;
  readonly timer?: { readonly phasesRemaining?: number };
  readonly tags?: readonly string[];
  readonly contextTags?: readonly string[];
  readonly monsterTags?: readonly string[];
  readonly objectives?: readonly TriggerObjective[];
  readonly activeVariant?: { readonly label?: string; readonly dialogue?: string; readonly summary?: string };
  readonly variantLabel?: string;
  readonly variantDialogue?: string;
  readonly variantSummary?: string;
  readonly repeatCycle?: number;
  readonly linkedScenario?: string;
  readonly scenarioId?: string;
  readonly scenario?: string;
}

export interface QuestRowOptions {
  readonly resolved?: boolean;
}

// `_triggerLabel` — describes a quest objective's auto-progress trigger
// in human-readable form (for the pulse-hint chips on the quest card).
function triggerLabel(trigger: QuestObjectiveTrigger = {}): string {
  const bits: string[] = [];
  if (trigger.outcome) bits.push(label(trigger.outcome));
  if (trigger.skillIds?.length) bits.push(trigger.skillIds.map(label).join(" / "));
  if (trigger.statusIds?.length) bits.push(`Status ${trigger.statusIds.map(label).join(" / ")}`);
  if (trigger.defeatedTypes?.length) bits.push(`Defeat ${trigger.defeatedTypes.map(label).join(" / ")}`);
  if (trigger.defeatedMonsterIds?.length) bits.push(`Defeat ${trigger.defeatedMonsterIds.map(label).join(" / ")}`);
  const tags = trigger.requiresTags || trigger.requiresAnyTags || trigger.anyTags || [];
  const tagList = Array.isArray(tags) ? tags : [tags];
  if (tagList.length) bits.push(tagList.filter(Boolean).map((t) => label(t)).join(" / "));
  if (trigger.onlyPlayerActionTags?.length) bits.push(`Only ${trigger.onlyPlayerActionTags.map(label).join(" / ")}`);
  return bits.length ? `Auto: ${bits.join(" + ")}` : "Auto progress available";
}

// `_questScenarioPill` — typed scenario pill for the quest row.
// Returns null when the quest is unset; otherwise one of:
//   running  — quest's scenario is the currently-running run
//   linked   — quest has a linked scenario (`linkedScenario` etc.)
//   generated — a previously generated scenario points at this quest
//   noMap    — no scenario yet (will be generated on first run)
function questScenarioPill(
  quest: QuestRowInput,
  activeRun: (ActiveRunLike & { readonly scenarioId?: string }) | null,
  activeScenario: (ActiveScenarioLike & { readonly name?: string }) | null
): QuestPillData | null {
  if (!quest?.id) return null;
  if (activeRunQuestId(activeRun, activeScenario) === quest.id) {
    return {
      variant: "running",
      label: `▶ Running: ${activeScenario?.name || activeRun?.scenarioId || "scenario"}`,
      title: "A scenario for this quest is currently running",
      linkable: true,
      muted: false
    };
  }
  const linkedId = quest.linkedScenario || quest.scenarioId || quest.scenario;
  if (linkedId) {
    const sc = cjs().CampaignState?.getScenarioById?.(linkedId);
    return {
      variant: "linked",
      label: `📜 Linked: ${sc?.name || linkedId}`,
      title: "This quest has a pre-built scenario linked to it",
      linkable: false,
      muted: false
    };
  }
  const generated = Object.values(
    cjs().CampaignState?.getState?.()?.sideContent?.generatedScenarios || {}
  ).find((sc) => sc?.source?.questId === quest.id);
  if (generated) {
    return {
      variant: "generated",
      label: `🗺 Generated: ${generated.name || generated.id}`,
      title: "A scenario was previously generated for this quest",
      linkable: false,
      muted: false
    };
  }
  return {
    variant: "noMap",
    label: "no map yet",
    title: "No scenario yet — Map Run will generate one",
    linkable: false,
    muted: true
  };
}

export function getQuestRowData(quest: QuestRowInput = {}, opts: QuestRowOptions = {}): QuestRowData {
  const objectives = quest.objectives || [];
  const nextObjective = opts.resolved ? null : questNextObjective({ objectives });
  const done = objectives.filter((obj) => questObjectiveDone(obj)).length;
  const total = objectives.length || 1;
  const meta = [
    label(quest.status || "active"),
    quest.giver ? `Giver: ${quest.giver}` : "",
    quest.timer?.phasesRemaining ? `${quest.timer.phasesRemaining} phases left` : ""
  ]
    .filter(Boolean)
    .join(" | ");
  const state = cjs().CampaignState;
  const activeRun = state?.getState?.()?.activeScenarioRun || null;
  const activeScenario = state?.getActiveScenario?.() || null;
  const isRunQuest = activeRunQuestId(activeRun, activeScenario) === quest.id;
  const scenarioDisabled = !!(activeRun && !isRunQuest);
  const tagChips = Array.from(
    new Set(
      [
        ...(quest.tags || []),
        ...(quest.contextTags || []),
        ...(quest.monsterTags || [])
      ].filter(Boolean)
    )
  )
    .slice(0, 8)
    .map((t) => label(t));
  const variant = quest.activeVariant || null;
  const variantLabel = variant?.label || quest.variantLabel || "";
  const variantText =
    quest.variantDialogue ||
    quest.variantSummary ||
    variant?.dialogue ||
    variant?.summary ||
    "";
  const variantRepeat = quest.repeatCycle ? `Cycle ${quest.repeatCycle + 1}` : "";
  return {
    id: String(quest.id || ""),
    title: quest.title || quest.id || "Quest",
    summary: quest.summary || "",
    statusLabel: label(quest.status || "active"),
    statusClass: questStatusClass(quest),
    metaLine: meta,
    resolved: !!opts.resolved,
    isRunQuest,
    scenarioDisabled,
    scenarioLabel: isRunQuest ? "Open Map" : "Map Run",
    scenarioHint: isRunQuest
      ? "Jump to the active map for this quest"
      : "Start (or generate) the map run for this quest",
    scenarioPill: questScenarioPill(quest, activeRun, activeScenario),
    hasMiniGame: !!questMiniGameObjective({ objectives }),
    tagChips,
    variant:
      variantLabel || variantText || variantRepeat
        ? { label: variantLabel, text: variantText, repeat: variantRepeat }
        : null,
    phaseLabel: opts.resolved ? "Resolved" : nextObjective?.label || "Open",
    doneCount: done,
    totalCount: total,
    objectives: objectives.map((obj) => {
      const cur = Number(obj.current || 0);
      const req = Math.max(1, Number(obj.required || 1));
      const pct = Math.max(0, Math.min(100, Math.round((cur / req) * 100)));
      return {
        id: String(obj.id || obj.label || ""),
        label: obj.label || obj.id || "Objective",
        current: cur,
        required: req,
        pct,
        done: cur >= req,
        pulseHints: (obj.progressTriggers || []).slice(0, 2).map((trigger) => triggerLabel(trigger))
      };
    })
  };
}
