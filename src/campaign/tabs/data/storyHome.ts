// storyHome.ts — Phase F bridge for the Story Home tab.
//
// Phase H.4 — `getStoryHomeData` ported inline. Sub-helpers
// (`chapterTreeData`, `chapterTreeNodeData`, `storyPipelineSnapshot`,
// `storyPipelinePanelData`, `syncSummaryData`, `shortenPanelLabel`,
// `storySummaryEntriesForHome`, `choiceConsequenceData`) ported here.
// The AI story context section reads through a thin JS bridge
// (`renderAiStoryContextData`) because its data sits in a closure-private
// async cache (`_storyContextCache`) shared with `_ensureStoryContext`
// and the still-JS story-prompt builder — moving the cache requires
// migrating the whole prompt-builder cluster.

import { cssVarAssetUrl, label } from "../../util/cui-utils";
import { storyTheme, storyVnHeroData, type StoryVnHeroData } from "./storyShared";
import { storySummaryEntries, type StoryPartRecord } from "./storySummary";
import type { CampaignStateSnapshot } from "../../store";

export interface StoryArcStats {
  readonly completed: number;
  readonly defaulted: number;
  readonly manualNotes: number;
  readonly phase: number;
}

// G.12 — typed shapes for the Story Home sub-panels.
export interface ChapterTreeNode {
  readonly id: string;
  readonly partLabel: string;
  readonly title: string;
  readonly routeLabel: string;
  readonly stateLabel: string;
  readonly stateClass: string;
  readonly summaryShort: string;
  readonly lockReasons: string;
  readonly nextCandidates: readonly string[];
  readonly blocked: boolean;
  readonly locked: boolean;
  readonly replayOnly: boolean;
  readonly depth: number;
  readonly children: readonly ChapterTreeNode[];
}

export interface ChapterTreeData {
  readonly routeText: string;
  readonly routeCount: number;
  readonly roots: readonly ChapterTreeNode[];
}

export interface AlignmentAxis {
  readonly id: string;
  readonly label: string;
  readonly currentValue: number;
  readonly worldValue: number;
  readonly rangeMin: number;
  readonly rangeMax: number;
}

export interface AlignmentRecentEntry {
  readonly label: string;
  readonly description: string;
}

export interface AlignmentPotentialEntry {
  readonly label: string;
  readonly description: string;
  readonly summary: string;
  readonly reachable: boolean;
}

export interface ChoiceConsequenceData {
  readonly axes: readonly AlignmentAxis[];
  readonly recent: readonly AlignmentRecentEntry[];
  readonly potential: readonly AlignmentPotentialEntry[];
  readonly potentialCount: number;
}

export interface AiStoryContextLine {
  readonly path: string;
  readonly statusLabel: string;
}

export interface AiStoryContextData {
  readonly loaded: number;
  readonly total: number;
  readonly staticLines: readonly AiStoryContextLine[];
  readonly indexLines: readonly AiStoryContextLine[];
  readonly arcsCount: number;
  readonly manualCount: number;
  readonly branchCount: number;
}

export interface StoryPipelineData {
  readonly anchorTitle: string;
  readonly nextCandidates: readonly string[];
}

export interface SyncSummaryData {
  readonly title: string;
  readonly sourcePill: string;
  readonly lines: readonly string[];
}

export interface StoryHomeData {
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly chapterPartsCount: number;
  readonly currentChapter: string | number;
  readonly currentArc: StoryArcStats;
  readonly hasActiveRun: boolean;
  readonly vnHero: StoryVnHeroData;
  readonly chapterTree: ChapterTreeData | null;
  readonly choiceConsequence: ChoiceConsequenceData | null;
  readonly aiStoryContext: AiStoryContextData;
  readonly storyPipeline: StoryPipelineData;
  readonly syncSummary: SyncSummaryData;
}

// ── Module surfaces ─────────────────────────────────────────────────
interface SequenceEntry {
  readonly id?: string;
  readonly title?: string;
  readonly partLabel?: string;
  readonly sequenceId?: string;
}

interface StoryMeta {
  readonly title?: string;
  readonly nextCandidates?: readonly string[];
  readonly syncSummary?: readonly string[];
  readonly partLabel?: string;
  readonly sequenceId?: string;
}

interface ActiveSequence {
  readonly scope?: string;
  readonly sequenceId?: string;
}

interface SequencesSurface {
  readonly list?: (scope: string, world?: string) => readonly SequenceEntry[];
  readonly active?: (state: unknown) => ActiveSequence | null | undefined;
  readonly storyMeta?: (entry: SequenceEntry | string, world?: string) => StoryMeta | null | undefined;
  readonly chapterTree?: (world: string | undefined, state: unknown) => RawChapterTree | null | undefined;
  readonly currentRouteChoices?: (state: unknown, world?: string) => readonly SequenceEntry[];
}

interface StoryBranchSurface {
  readonly applyToTree?: (tree: RawChapterTree, world?: string) => RawChapterTree;
  readonly getBranches?: (world: string | undefined) => readonly unknown[];
}

interface AlignmentAxisDef {
  readonly label?: string;
}

interface AlignmentRecentInput {
  readonly label?: string;
  readonly choiceId?: string;
  readonly deltas?: unknown;
}

interface AlignmentPotentialInput extends AlignmentRecentInput {
  readonly summary?: string;
  readonly sequenceId?: string;
  readonly reachable?: boolean;
}

interface AlignmentSnapshot {
  readonly axes?: Record<string, number>;
  readonly worldAxes?: Record<string, number>;
  readonly range?: Record<string, { min?: number; max?: number }>;
  readonly recent?: readonly AlignmentRecentInput[];
  readonly potential?: readonly AlignmentPotentialInput[];
}

interface AlignmentSurface {
  readonly snapshot?: (state: unknown, opts: { actor: string; world?: string }) => AlignmentSnapshot;
  readonly AXES?: Record<string, AlignmentAxisDef>;
  readonly describeDeltas?: (delta: unknown) => string;
}

interface CampaignUiSurface {
  readonly renderAiStoryContextData?: (state: unknown) => AiStoryContextData;
}

interface StoryHomeCjs {
  readonly CampaignSequences?: SequencesSurface;
  readonly CampaignStoryBranch?: StoryBranchSurface;
  readonly CampaignAlignment?: AlignmentSurface;
  readonly CampaignUI?: CampaignUiSurface;
  readonly CampaignStoryDirector?: { readonly snapshot?: () => unknown };
}

function cjs(): StoryHomeCjs {
  return (window as unknown as { CJS?: StoryHomeCjs }).CJS ?? {};
}

interface RawChapterTreeNode {
  readonly id?: string;
  readonly partLabel?: string;
  readonly orderKey?: string;
  readonly title?: string;
  readonly routeLabel?: string;
  readonly routeKey?: string;
  readonly status?: {
    readonly deliveryBlocked?: boolean;
    readonly completed?: boolean;
    readonly defaulted?: boolean;
    readonly replayOnly?: boolean;
  };
  readonly eligibility?: { readonly eligible?: boolean; readonly reasons?: readonly string[] };
  readonly meta?: { readonly summary?: { readonly short?: string } };
  readonly nextCandidates?: readonly string[];
  readonly children?: readonly RawChapterTreeNode[];
}

interface RawChapterTree {
  readonly roots?: readonly RawChapterTreeNode[];
  readonly byPartId?: Record<string, unknown>;
  readonly nodes?: readonly unknown[];
}

interface CampaignStateForHome {
  readonly currentWorld?: string;
  readonly storyMode?: {
    readonly currentChapterLabel?: string;
    readonly manualSummaryEntries?: readonly unknown[];
    readonly manualBranches?: readonly unknown[];
    readonly defaultedParts?: Record<string, unknown>;
    readonly partResults?: Record<string, StoryPartRecord>;
  };
  readonly currentChapter?: string | number;
  readonly phase?: { readonly number?: number };
  readonly activeScenarioRun?: unknown;
  readonly storyDirector?: { readonly revealedFacts?: unknown; readonly storyQueue?: unknown };
}

// ── Chapter tree ───────────────────────────────────────────────────
function chapterTreeNodeData(node: RawChapterTreeNode = {}, depth = 0): ChapterTreeNode {
  const status = node.status || {};
  const eligibility = node.eligibility || { eligible: true, reasons: [] };
  const blocked = !!status.deliveryBlocked;
  const completed = !!status.completed;
  const defaulted = !!status.defaulted;
  const replayOnly = !!status.replayOnly;
  const locked = !eligibility.eligible && !replayOnly;
  let stateLabel = "Ready";
  let stateClass = "is-ready";
  if (blocked) {
    stateLabel = "In Update";
    stateClass = "is-update";
  } else if (completed) {
    stateLabel = "Played";
    stateClass = "is-played";
  } else if (defaulted) {
    stateLabel = "Defaulted";
    stateClass = "is-defaulted";
  } else if (locked) {
    stateLabel = "Locked";
    stateClass = "is-locked";
  }
  return {
    id: String(node.id || ""),
    partLabel: String(node.partLabel || node.orderKey || node.id || ""),
    title: String(node.title || ""),
    routeLabel: String(node.routeLabel || (node.routeKey ? label(node.routeKey) : "")),
    stateLabel,
    stateClass,
    summaryShort: String(node.meta?.summary?.short || ""),
    lockReasons: locked ? (eligibility.reasons || []).join(" | ") : "",
    nextCandidates: Array.isArray(node.nextCandidates) ? node.nextCandidates.map(String) : [],
    blocked,
    locked,
    replayOnly,
    depth,
    children: Array.isArray(node.children) ? node.children.map((child) => chapterTreeNodeData(child, depth + 1)) : []
  };
}

function chapterTreeData(state: CampaignStateForHome): ChapterTreeData | null {
  const Seq = cjs().CampaignSequences;
  if (!Seq?.chapterTree) return null;
  let tree = Seq.chapterTree(state.currentWorld, state) || { roots: [], byPartId: {}, nodes: [] };
  const Branch = cjs().CampaignStoryBranch;
  if (Branch?.applyToTree) tree = Branch.applyToTree(tree, state.currentWorld);
  if (!tree.roots?.length) return null;
  const route = Seq.currentRouteChoices?.(state, state.currentWorld) || [];
  const routeText = route.length
    ? route.map((entry) => entry.partLabel || entry.title || entry.sequenceId).join(" → ")
    : "No story parts played yet.";
  return {
    routeText: String(routeText),
    routeCount: route.length,
    roots: tree.roots.map((node) => chapterTreeNodeData(node, 0))
  };
}

// ── Pipeline / sync summary ────────────────────────────────────────
interface StoryPipelineSnapshot {
  readonly anchorId: string | null;
  readonly anchorTitle: string;
  readonly nextCandidates: readonly string[];
  readonly syncSummary: readonly string[];
  readonly syncTitle: string;
}

function storyPipelineSnapshot(state: CampaignStateForHome): StoryPipelineSnapshot {
  const Seq = cjs().CampaignSequences;
  const active = Seq?.active?.(state);
  const summary = storySummaryEntries(state as Parameters<typeof storySummaryEntries>[0]);
  const lastSummary = summary[summary.length - 1];
  const lastSeqId = (lastSummary && (lastSummary as { sequenceId?: string }).sequenceId) || null;
  const anchorId =
    active?.scope === "story"
      ? active.sequenceId ?? null
      : lastSeqId || (Seq?.list?.("story", state.currentWorld) || [])[0]?.id || null;
  const meta = anchorId ? Seq?.storyMeta?.(anchorId, state.currentWorld) || {} : {};
  return {
    anchorId,
    anchorTitle: meta.title || "",
    nextCandidates: meta.nextCandidates || [],
    syncSummary: meta.syncSummary || [],
    syncTitle: meta.title || meta.partLabel || meta.sequenceId || ""
  };
}

function storyPipelinePanelData(pipeline: StoryPipelineSnapshot): StoryPipelineData {
  return {
    anchorTitle: String(pipeline.anchorTitle || ""),
    nextCandidates: (Array.isArray(pipeline.nextCandidates) ? pipeline.nextCandidates : [])
      .filter(Boolean)
      .map(String)
  };
}

function shortenPanelLabel(value = ""): string {
  const text = String(value || "");
  return text.length > 24 ? `${text.slice(0, 22)}..` : text;
}

function syncSummaryData(
  title = "State Sync",
  lines: readonly string[] = [],
  sourceTitle = ""
): SyncSummaryData {
  return {
    title: String(title),
    sourcePill: sourceTitle ? shortenPanelLabel(sourceTitle) : "",
    lines: (Array.isArray(lines) ? lines : []).filter(Boolean).map(String)
  };
}

// ── Choice consequence ─────────────────────────────────────────────
function choiceConsequenceData(state: CampaignStateForHome): ChoiceConsequenceData | null {
  const Align = cjs().CampaignAlignment;
  if (!Align?.snapshot) return null;
  const snap = Align.snapshot(state, { actor: "bin", world: state.currentWorld });
  const axes = Object.entries(Align.AXES || {});
  return {
    axes: axes.map(([axis, meta]) => {
      const current = Number(snap.axes?.[axis] || 0);
      const world = Number(snap.worldAxes?.[axis] || 0);
      const range = snap.range?.[axis] || { min: current, max: current };
      return {
        id: String(axis),
        label: String(meta.label || axis),
        currentValue: current,
        worldValue: world,
        rangeMin: Number(range.min || 0),
        rangeMax: Number(range.max || 0)
      };
    }),
    recent: (snap.recent || []).slice(0, 3).map((entry) => ({
      label: String(entry.label || entry.choiceId || "Choice"),
      description: String(Align.describeDeltas?.(entry.deltas) || "Tracked")
    })),
    potential: (snap.potential || []).slice(0, 4).map((entry) => ({
      label: String(entry.label || entry.choiceId || "Future"),
      description: String(Align.describeDeltas?.(entry.deltas) || ""),
      summary: String(entry.summary || entry.sequenceId || ""),
      reachable: entry.reachable !== false
    })),
    potentialCount: (snap.potential || []).length
  };
}

// ── AI story context (bridges to JS; cache stays in JS) ────────────
function aiStoryContextDataFallback(state: CampaignStateForHome): AiStoryContextData {
  // The closure-private `_storyContextCache` in campaign-ui.js owns the
  // four async loads (global index, all-world summary, world summary,
  // structured world data). Until that cache ports to TS, the JS bridge
  // exposes the snapshot through `CampaignUI.renderAiStoryContextData`;
  // this fallback runs only if the bridge isn't installed (older JS),
  // returning a zeroed shape so the panel renders without throwing.
  const branches = cjs().CampaignStoryBranch?.getBranches?.(state.currentWorld) || [];
  const manual = state.storyMode?.manualSummaryEntries || [];
  return {
    loaded: 0,
    total: 4,
    staticLines: [],
    indexLines: [],
    arcsCount: 0,
    manualCount: manual.length,
    branchCount: branches.length
  };
}

function aiStoryContextData(state: CampaignStateForHome): AiStoryContextData {
  const bridge = cjs().CampaignUI?.renderAiStoryContextData;
  if (bridge) return bridge(state);
  return aiStoryContextDataFallback(state);
}

// ── Entry ──────────────────────────────────────────────────────────
export function getStoryHomeData(state: CampaignStateSnapshot): StoryHomeData | null {
  if (!state) return null;
  const typed = state as CampaignStateForHome;
  const theme = storyTheme(typed);
  const c = cjs();
  const director = c.CampaignStoryDirector;
  const snap = (director?.snapshot?.() as { pack?: { name?: string; summary?: string } | null; stage?: { id?: string; name?: string } } | undefined) || {};
  const pack = snap.pack || null;
  const stage = snap.stage || {};
  const Seq = c.CampaignSequences;
  const storyFiles = Seq?.list?.("story") || [];
  const activeSequence = Seq?.active?.(typed);
  const storyParts = storySummaryEntries(typed as Parameters<typeof storySummaryEntries>[0]);
  const manualCount = typed.storyMode?.manualSummaryEntries?.length || 0;
  const defaultedCount = Object.keys(typed.storyMode?.defaultedParts || {}).length;
  const activeRun = typed.activeScenarioRun;
  const pipeline = storyPipelineSnapshot(typed);
  const next = {
    index: activeSequence?.scope === "story" ? 1 : 0,
    title: activeSequence?.scope === "story" ? "Continue Current Story Part" : "Choose a Chapter Part",
    text:
      activeSequence?.scope === "story"
        ? "The current story file is open below. Continue node by node, then complete it when the conclusion is reached."
        : "Start a story file when you are ready. Starting ahead should be treated as revealing earlier parts with the default path.",
    actions: [
      {
        action: "story-manual-note",
        label: "Manual Note",
        hint: "Add a GM-written scene to the story summary",
        kind: "manual"
      },
      {
        action: "open-story-summary",
        label: "Summary",
        hint: "Read what has happened so far"
      },
      {
        action: "story-copy-prompt",
        label: "Copy AI Context",
        hint: "Copy static summaries, live GM notes, branches, and current route state for AI drafting",
        kind: "manual"
      }
    ]
  };
  const themeStyleVars: Record<string, string> = {};
  if (theme.backdrop) themeStyleVars["--story-backdrop"] = `url('${cssVarAssetUrl(theme.backdrop)}')`;
  if (theme.accent) themeStyleVars["--story-accent"] = theme.accent;
  if (theme.danger) themeStyleVars["--story-danger"] = theme.danger;
  return {
    themeClassName: theme.className || "",
    themeStyleVars,
    chapterPartsCount: storyFiles.length,
    currentChapter: typed.storyMode?.currentChapterLabel || typed.currentChapter || 1,
    currentArc: {
      completed: storyParts.length,
      defaulted: defaultedCount,
      manualNotes: manualCount,
      phase: typed.phase?.number || 1
    },
    hasActiveRun: !!activeRun,
    vnHero: storyVnHeroData({ state: typed, pack, stage, next, theme }),
    chapterTree: chapterTreeData(typed),
    choiceConsequence: choiceConsequenceData(typed),
    aiStoryContext: aiStoryContextData(typed),
    storyPipeline: storyPipelinePanelData(pipeline),
    syncSummary: syncSummaryData("After This Part Changes", pipeline.syncSummary, pipeline.syncTitle)
  };
}
