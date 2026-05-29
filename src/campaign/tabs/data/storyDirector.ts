// storyDirector.ts — Phase F bridge for the Story Director tab.
//
// Phase H.4 — `getStoryDirectorData` ported inline. Sub-helpers
// (`storyNextStep`, `storyStageRailData`, `storyDirectorCardData`,
// `storyPressureBoardData`, `storyCluesPanelData`, `storyQueuePanelData`,
// `storyTruthsPanelData`, `storySideFlowData`) are co-located here since
// none of them are shared with `getStoryHomeData`.

import { cssVarAssetUrl, label } from "../../util/cui-utils";
import { storyTheme, storyVnHeroData, type StoryVnHeroData } from "./storyShared";
import type { CampaignStateSnapshot } from "../../store";

export type { StoryVnHeroData, StoryNextStep, StoryActionButton } from "./storyShared";

// G.11b — typed stage rail + director card. The route consequence
// preview is still an HTML bridge (`HubTab.renderConsequencePreview`)
// until K.3 ports the HubTab renderers.
export interface StoryStageEntry {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly index: number;
  readonly isActive: boolean;
  readonly isPast: boolean;
}

export interface StoryRouteChoice {
  readonly index: number;
  readonly label: string;
  readonly cardId: string;
  readonly isRecommended: boolean;
  readonly consequencePreviewHtml: string;
}

export interface StoryDirectorCardData {
  readonly id: string;
  readonly title: string;
  readonly stageLabel: string;
  readonly kindLabel: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly prompt: string;
  readonly text: string;
  readonly summary: string;
  readonly gmNote: string;
  readonly tags: readonly string[];
  readonly routes: readonly StoryRouteChoice[];
}

// G.11c — typed support-grid panels (pressure / clues / queue /
// truths / side-flow).
export interface PressureMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number | string;
}

export interface PressureBoardData {
  readonly metrics: readonly PressureMetric[];
  readonly rule: string;
}

export interface StoryClue {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
}

export interface StoryFact {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export interface StoryCluesPanelData {
  readonly clues: readonly StoryClue[];
  readonly facts: readonly StoryFact[];
}

export interface StoryQueueBeat {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly stageLabel: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
}

export interface StoryQueuePanelData {
  readonly beats: readonly StoryQueueBeat[];
}

export interface StoryTruth {
  readonly id: string;
  readonly title: string;
  readonly rule: string;
}

export interface StoryTruthsPanelData {
  readonly truths: readonly StoryTruth[];
}

export type SideFlowTone = "flavor" | "plot" | "risk";

export interface SideFlowItem {
  readonly title: string;
  readonly reason: string;
}

export interface SideFlowColumn {
  readonly label: string;
  readonly tone: SideFlowTone;
  readonly items: readonly SideFlowItem[];
}

export interface StorySideFlowData {
  readonly hasFlow: boolean;
  readonly summary: string;
  readonly flowSynced: boolean;
  readonly columns: readonly SideFlowColumn[];
}

interface StoryDirectorMissing {
  readonly moduleAvailable: false;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
}

interface StoryDirectorNoPack {
  readonly moduleAvailable: true;
  readonly hasPack: false;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly vnHero: StoryVnHeroData;
}

interface StoryDirectorReady {
  readonly moduleAvailable: true;
  readonly hasPack: true;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly stageName: string;
  readonly stageSummary: string;
  readonly vnHero: StoryVnHeroData;
  readonly soloGuideActiveIndex: number;
  readonly actionDeckFlowSynced: boolean;
  readonly actionDeckHasFlow: boolean;
  readonly stageRailEntries: readonly StoryStageEntry[];
  readonly lastCard: StoryDirectorCardData | null;
  readonly pressureBoard: PressureBoardData;
  readonly sideFlow: StorySideFlowData;
  readonly clues: StoryCluesPanelData;
  readonly queue: StoryQueuePanelData;
  readonly truths: StoryTruthsPanelData;
}

export type StoryDirectorData = StoryDirectorMissing | StoryDirectorNoPack | StoryDirectorReady;

// ── Module surfaces ─────────────────────────────────────────────────
interface DirectorSnapshot {
  readonly pack?: PackInput | null;
  readonly stage?: StageInput;
  readonly flow?: FlowInput | null;
  readonly queue?: readonly BeatInput[];
  readonly clues?: readonly ClueInput[];
  readonly facts?: readonly FactInput[];
  readonly last?: CardInput | null;
  readonly metrics?: Record<string, number | string>;
}

interface PackInput {
  readonly id?: string;
  readonly name?: string;
  readonly summary?: string;
  readonly stages?: readonly StageInput[];
  readonly metrics?: readonly MetricInput[];
  readonly pressureRule?: string;
  readonly protectedTruths?: readonly TruthInput[];
}

interface StageInput {
  readonly id?: string;
  readonly name?: string;
  readonly summary?: string;
}

interface MetricInput {
  readonly id?: string;
  readonly label?: string;
}

interface BeatInput {
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly stageName?: string;
  readonly stageId?: string;
  readonly canonRisk?: string;
}

interface ClueInput {
  readonly id?: string;
  readonly title?: string;
  readonly text?: string;
  readonly canonRisk?: string;
}

interface FactInput {
  readonly id?: string;
  readonly title?: string;
  readonly text?: string;
}

interface TruthInput {
  readonly id?: string;
  readonly title?: string;
  readonly rule?: string;
}

interface CardInput {
  readonly id?: string;
  readonly title?: string;
  readonly stageId?: string;
  readonly stageName?: string;
  readonly kind?: string;
  readonly canonRisk?: string;
  readonly prompt?: string;
  readonly text?: string;
  readonly summary?: string;
  readonly gmNote?: string;
  readonly status?: string;
  readonly tags?: readonly string[];
  readonly suggestedChoices?: readonly ChoiceInput[];
}

interface ChoiceInput {
  readonly label?: string;
  readonly ops?: readonly unknown[];
}

interface FlowInput {
  readonly stageId?: string;
  readonly summary?: string;
  readonly keep?: readonly SideFlowItemInput[];
  readonly promote?: readonly SideFlowItemInput[];
  readonly retire?: readonly SideFlowItemInput[];
}

interface SideFlowItemInput {
  readonly title?: string;
  readonly id?: string;
  readonly reason?: string;
  readonly note?: string;
}

interface StoryDirectorModule {
  readonly snapshot?: () => DirectorSnapshot;
}

interface HubTabSurface {
  readonly renderConsequencePreview?: (
    ops: readonly unknown[],
    options?: { title?: string; emptyTitle?: string; emptyText?: string }
  ) => string;
}

interface SideContentSurface {
  readonly riskClass?: (risk: string | undefined) => string;
}

interface DirectorCjs {
  readonly CampaignStoryDirector?: StoryDirectorModule;
  readonly CampaignUIInternal?: { readonly HubTab?: HubTabSurface };
  readonly CampaignSideContent?: SideContentSurface;
}

function cjs(): DirectorCjs {
  return (window as unknown as { CJS?: DirectorCjs }).CJS ?? {};
}

interface CampaignStateForDirector {
  readonly currentWorld?: string;
  readonly activeScenarioRun?: unknown;
  readonly storyDirector?: { readonly sideQuestSync?: Record<string, unknown> };
  readonly storyMode?: { readonly currentChapterLabel?: string };
  readonly currentChapter?: string | number;
  readonly phase?: { readonly number?: number };
}

// ── Story next-step (Solo Guide content) ───────────────────────────
function storyNextStep(snap: DirectorSnapshot, state: CampaignStateForDirector, flowSynced: boolean) {
  const last = snap.last;
  const choices = last?.suggestedChoices || [];
  if (!snap.stage) {
    return {
      index: 0,
      title: "Pick an arc stage",
      text: "Choose the part of the story you are actually playing now. This only guides tables; it does not lock the plot.",
      actions: []
    };
  }
  if (!last) {
    return {
      index: 1,
      title: "Roll or write the next scene",
      text: "Use Next Scene for normal story flow, Peri Interrupt for comedy, Memory / Clue for mystery, or Write Scene when you want GM control.",
      actions: [
        {
          action: "story-roll-scene",
          label: "Next Scene",
          hint: "Best default for solo play",
          kind: "primary story"
        },
        {
          action: "story-manual-note",
          label: "Write Scene",
          hint: "Save your own beat",
          kind: "manual"
        }
      ]
    };
  }
  if (!["resolved", "rejected", "saved", "manual", "review"].includes(last.status || "")) {
    return {
      index: 2,
      title: "Choose a route",
      text: "Read the route cards below. Choose one if it fits, hold it for later, or skip the roll with no guilt.",
      actions: [
        {
          action: "story-open-last",
          label: "Open Popup",
          hint: "Reopen the current beat window",
          kind: "primary story"
        },
        {
          action: "story-save-beat",
          label: "Hold For Later",
          hint: "Keep it in the queue without applying consequences",
          kind: "manual"
        },
        {
          action: "story-apply-choice",
          label: choices[0]?.label ? `Choose: ${choices[0].label}` : "Accept Note",
          hint: "Apply the first route",
          kind: "quest",
          data: { id: last.id || "", choice: 0 }
        }
      ]
    };
  }
  if (snap.flow && !flowSynced) {
    return {
      index: 4,
      title: "Update side routes",
      text: "This episode has advice for which side routes should stay available, get promoted, or politely leave the room.",
      actions: [
        {
          action: "story-sync-sidequests",
          label: "Update Side Routes",
          hint: "Applies this episode side-flow once",
          kind: "quest"
        }
      ]
    };
  }
  if (state.activeScenarioRun) {
    return {
      index: 4,
      title: "Continue the tabletop run",
      text: "A scenario is active. Use the story beat as table color, then continue moving pieces and resolving encounters on the map.",
      actions: [
        {
          action: "open-maps-tab",
          label: "Open Run Map",
          hint: "Return to the tactical board",
          kind: "primary"
        }
      ]
    };
  }
  return {
    index: 1,
    title: "Ready for the next scene",
    text: "The last beat is handled. Roll again, write a scene, or just let the table breathe for a moment.",
    actions: [
      {
        action: "story-roll-scene",
        label: "Next Scene",
        hint: "Continue the story flow",
        kind: "primary story"
      }
    ]
  };
}

// ── Stage rail ─────────────────────────────────────────────────────
function storyStageRailData(stages: readonly StageInput[], stage: StageInput = {}): readonly StoryStageEntry[] {
  if (!stages.length) return [];
  const activeIndex = Math.max(0, stages.findIndex((entry) => entry.id === stage.id));
  return stages.map((entry, index) => ({
    id: String(entry.id || ""),
    name: String(entry.name || entry.id || ""),
    summary: String(entry.summary || ""),
    index: index + 1,
    isActive: entry.id === stage.id,
    isPast: index < activeIndex && entry.id !== stage.id
  }));
}

// ── Story director card ────────────────────────────────────────────
function storyDirectorCardData(card: CardInput | null | undefined): StoryDirectorCardData | null {
  if (!card) return null;
  const sx = cjs().CampaignSideContent;
  const hub = cjs().CampaignUIInternal?.HubTab;
  const kindLabel = label(card.kind || "story");
  const stageLabel = card.stageName || card.stageId || "";
  const choices = card.suggestedChoices || [];
  const branchChoices: readonly ChoiceInput[] = choices.length
    ? choices
    : [
        {
          label: "Accept as story note",
          ops: [
            {
              op: "log",
              text: card.prompt || card.text || card.summary || card.title || "Story beat accepted."
            }
          ]
        }
      ];
  const routes: StoryRouteChoice[] = branchChoices.map((choice, index) => ({
    index,
    label: String(choice.label || `Choice ${index + 1}`),
    cardId: String(card.id || ""),
    isRecommended: index === 0,
    consequencePreviewHtml:
      hub?.renderConsequencePreview?.(choice.ops || [], {
        title: choice.label || `Choice ${index + 1}`,
        emptyTitle: choice.label || `Choice ${index + 1}`,
        emptyText: "Story-only route. Choose it if it fits the current scene."
      }) ?? ""
  }));
  return {
    id: String(card.id || ""),
    title: String(card.title || card.id || ""),
    stageLabel: String(stageLabel),
    kindLabel: String(kindLabel),
    canonRisk: String(card.canonRisk || "green"),
    canonRiskClass: sx?.riskClass?.(card.canonRisk) ?? "",
    prompt: String(card.prompt || ""),
    text: String(card.text || ""),
    summary: String(card.summary || ""),
    gmNote: String(card.gmNote || ""),
    tags: Array.isArray(card.tags) ? card.tags.map((tag) => String(tag)) : [],
    routes
  };
}

// ── Support panels (pressure / clues / queue / truths / side-flow) ─
function storyPressureBoardData(
  metrics: readonly MetricInput[],
  snap: DirectorSnapshot,
  pack: PackInput | null
): PressureBoardData {
  return {
    metrics: (metrics || []).map((metric) => ({
      id: String(metric.id || ""),
      label: String(metric.label || label(metric.id || "")),
      value: snap.metrics?.[metric.id || ""] ?? 0
    })),
    rule: String(
      pack?.pressureRule || "Offscreen trouble suggests consequences. Apply only what fits the session."
    )
  };
}

function storyCluesPanelData(clues: readonly ClueInput[], facts: readonly FactInput[]): StoryCluesPanelData {
  const sx = cjs().CampaignSideContent;
  return {
    clues: (clues || []).map((clue) => ({
      id: String(clue.id || ""),
      title: String(clue.title || clue.id || ""),
      text: String(clue.text || ""),
      canonRisk: String(clue.canonRisk || "green"),
      canonRiskClass: sx?.riskClass?.(clue.canonRisk) ?? ""
    })),
    facts: (facts || []).map((fact) => ({
      id: String(fact.id || ""),
      title: String(fact.title || fact.id || ""),
      text: String(fact.text || "")
    }))
  };
}

function storyQueuePanelData(queue: readonly BeatInput[]): StoryQueuePanelData {
  const sx = cjs().CampaignSideContent;
  return {
    beats: (queue || []).map((beat) => ({
      id: String(beat.id || ""),
      title: String(beat.title || beat.id || ""),
      statusLabel: String(beat.status || "saved"),
      stageLabel: String(beat.stageName || beat.stageId || ""),
      canonRisk: String(beat.canonRisk || "green"),
      canonRiskClass: sx?.riskClass?.(beat.canonRisk) ?? ""
    }))
  };
}

function storyTruthsPanelData(pack: PackInput | null): StoryTruthsPanelData {
  return {
    truths: (pack?.protectedTruths || []).slice(0, 10).map((truth) => ({
      id: String(truth.id || ""),
      title: String(truth.title || truth.id || ""),
      rule: String(truth.rule || "Red-risk until the GM promotes it.")
    }))
  };
}

function storySideFlowData(flow: FlowInput | null | undefined, flowSynced = false): StorySideFlowData {
  if (!flow) {
    return {
      hasFlow: false,
      summary: "",
      flowSynced: !!flowSynced,
      columns: []
    };
  }
  const column = (label: string, list: readonly SideFlowItemInput[] | undefined, tone: SideFlowTone): SideFlowColumn => ({
    label,
    tone,
    items: (list || []).map((item) => ({
      title: String(item.title || item.id || ""),
      reason: String(item.reason || item.note || "")
    }))
  });
  return {
    hasFlow: true,
    summary: String(
      flow.summary || "Keep, promote, or retire optional content as the main arc moves."
    ),
    flowSynced: !!flowSynced,
    columns: [
      column("Keep Available", flow.keep, "flavor"),
      column("Promote Soon", flow.promote, "plot"),
      column("Retire / Downgrade", flow.retire, "risk")
    ]
  };
}

// ── Entry ──────────────────────────────────────────────────────────
export function getStoryDirectorData(state: CampaignStateSnapshot): StoryDirectorData | null {
  if (!state) return null;
  const typed = state as CampaignStateForDirector;
  const theme = storyTheme(typed);
  const themeStyleVars: Record<string, string> = {};
  if (theme.backdrop) themeStyleVars["--story-backdrop"] = `url('${cssVarAssetUrl(theme.backdrop)}')`;
  if (theme.accent) themeStyleVars["--story-accent"] = theme.accent;
  if (theme.danger) themeStyleVars["--story-danger"] = theme.danger;
  const director = cjs().CampaignStoryDirector;
  if (!director?.snapshot) {
    return {
      moduleAvailable: false,
      themeClassName: theme.className || "",
      themeStyleVars
    };
  }
  const snap = director.snapshot();
  const pack = snap.pack || null;
  if (!pack) {
    const next = {
      index: 0,
      title: "No story pack loaded",
      text:
        "This world has a visual theme, but no Story Director pack yet. Add one later to unlock scene rolls, routes, clues, and side route guidance.",
      actions: []
    };
    return {
      moduleAvailable: true,
      hasPack: false,
      themeClassName: theme.className || "",
      themeStyleVars,
      vnHero: storyVnHeroData({ state: typed, pack: null, stage: null, next, theme })
    };
  }
  const stage = snap.stage || {};
  const stages = pack.stages || [];
  const metrics = pack.metrics || [];
  const flow = snap.flow || null;
  const queue = (snap.queue || []).slice(0, 8);
  const clues = (snap.clues || []).slice(0, 8);
  const facts = (snap.facts || []).slice(0, 8);
  const syncKey = pack.id && flow?.stageId ? `${pack.id}:${flow.stageId}` : "";
  const flowSynced = !!(syncKey && typed.storyDirector?.sideQuestSync?.[syncKey]);
  const next = storyNextStep(snap, typed, flowSynced);
  return {
    moduleAvailable: true,
    hasPack: true,
    themeClassName: theme.className || "",
    themeStyleVars,
    stageName: stage.name || stage.id || "No stage",
    stageSummary: stage.summary || "",
    vnHero: storyVnHeroData({ state: typed, pack, stage, next, theme }),
    soloGuideActiveIndex: Number(next.index || 0),
    actionDeckFlowSynced: !!flowSynced,
    actionDeckHasFlow: !!flow,
    stageRailEntries: storyStageRailData(stages, stage),
    lastCard: storyDirectorCardData(snap.last),
    pressureBoard: storyPressureBoardData(metrics, snap, pack),
    sideFlow: storySideFlowData(flow, flowSynced),
    clues: storyCluesPanelData(clues, facts),
    queue: storyQueuePanelData(queue),
    truths: storyTruthsPanelData(pack)
  };
}
