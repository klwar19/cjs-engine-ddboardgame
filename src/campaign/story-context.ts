// story-context.ts — Phase H.4 port of the story-context cache +
// AI story-prompt builder cluster from campaign-ui.js.
//
// Owns the four async story-context loads (global AI index, all-world
// flow summary, per-world summary markdown, per-world structured
// context JSON) behind a module-private cache, the typed AI-story-
// context snapshot the Story Home panel reads, and the full AI
// story-prompt text the `story-copy-prompt` action assembles.
//
// Cross-language seam: installs `window.CJS.CampaignStoryContext` so the
// still-JS `campaign-ui.js` init/render/subscribe can prime the cache.
// TS consumers (`action-handlers/story-tools.ts`,
// `tabs/data/storyHome.ts`) import these functions directly — no
// CampaignUI bridge hop. When campaign-ui.js is deleted the install can
// drop; the direct imports stay.

import { esc, label } from "./util/cui-utils";

// ── Public types ────────────────────────────────────────────────────
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

export type StoryContextLoadStatus = "idle" | "loading" | "loaded" | "missing";

export interface StoryContextSnapshot {
  readonly world: string;
  readonly indexPath: string;
  readonly allWorldPath: string;
  readonly worldPath: string;
  readonly structuredWorldPath: string;
  readonly indexStatus: StoryContextLoadStatus;
  readonly allWorldStatus: StoryContextLoadStatus;
  readonly worldStatus: StoryContextLoadStatus;
  readonly structuredWorldStatus: StoryContextLoadStatus;
  readonly indexData: Record<string, unknown> | null;
  readonly allWorldText: string;
  readonly worldText: string;
  readonly structuredWorldData: Record<string, unknown> | null;
}

// ── Module-private cache (mirrors the closure `_storyContextCache`) ───
interface JsonCacheEntry {
  status: StoryContextLoadStatus;
  data: Record<string, unknown> | null;
  promise: Promise<void> | null;
}

interface TextCacheEntry {
  status: StoryContextLoadStatus;
  text: string;
  promise: Promise<void> | null;
}

const storyContextCache: {
  globalIndex: JsonCacheEntry;
  allWorld: TextCacheEntry;
  worlds: Record<string, TextCacheEntry>;
  structuredWorlds: Record<string, JsonCacheEntry>;
} = {
  globalIndex: { status: "idle", data: null, promise: null },
  allWorld: { status: "idle", text: "", promise: null },
  worlds: {},
  structuredWorlds: {}
};

// ── Engine accessors ────────────────────────────────────────────────
interface StoryContextState {
  readonly currentWorld?: string;
  readonly currentChapter?: string | number;
  readonly storyMode?: {
    readonly currentChapterLabel?: string;
    readonly manualSummaryEntries?: readonly ManualSummaryEntry[];
    readonly manualBranches?: readonly StoryBranch[];
  };
  readonly phase?: { readonly number?: number; readonly type?: string };
  readonly party?: Record<string, PartyMember>;
}

interface ManualSummaryEntry {
  readonly title?: string;
  readonly text?: string;
  readonly branchLabel?: string;
  readonly stageId?: string;
  readonly at?: string;
}

interface StoryBranch {
  readonly id?: string;
  readonly chapterLabel?: string;
  readonly partLabel?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly parentLabel?: string;
  readonly parentTitle?: string;
  readonly parentSequenceId?: string;
  readonly scene?: { readonly lines?: ReadonlyArray<{ readonly text?: string }> };
}

interface PartyMember {
  readonly name?: string;
  readonly baseCharacterId?: string;
  readonly rosterRole?: string;
}

interface StoryDirectorSnapshot {
  readonly pack?: { readonly tonePillars?: readonly string[]; readonly name?: string } | null;
  readonly stage?: { readonly name?: string; readonly id?: string; readonly summary?: string } | null;
  readonly last?: {
    readonly suggestedChoices?: ReadonlyArray<{ readonly label?: string; readonly ops?: OpInput[] }>;
    readonly title?: string;
    readonly prompt?: string;
    readonly text?: string;
    readonly summary?: string;
  } | null;
  readonly queue?: ReadonlyArray<{ readonly title?: string; readonly id?: string; readonly status?: string }>;
  readonly clues?: ReadonlyArray<{ readonly title?: string; readonly id?: string; readonly text?: string }>;
  readonly facts?: ReadonlyArray<{ readonly title?: string; readonly id?: string; readonly text?: string }>;
}

interface OpInput {
  readonly op?: string;
  readonly [key: string]: unknown;
}

interface RouteChoiceEntry {
  readonly partLabel?: string;
  readonly title?: string;
  readonly sequenceId?: string;
  readonly routeLabel?: string;
  readonly mode?: string;
  readonly choices?: ReadonlyArray<{ readonly nodeId?: string; readonly choiceId?: string; readonly label?: string }>;
}

interface ChapterTreeNode {
  readonly partLabel?: string;
  readonly partId?: string;
  readonly id?: string;
  readonly routeLabel?: string;
  readonly title?: string;
  readonly eligibility?: { readonly eligible?: boolean; readonly reasons?: readonly string[] };
  readonly status?: { readonly replayOnly?: boolean; readonly deliveryBlocked?: boolean };
}

interface SequencesSurface {
  readonly currentRouteChoices?: (state: unknown, world?: string) => readonly RouteChoiceEntry[];
  readonly chapterTree?: (world: string | undefined, state: unknown) => { nodes?: readonly ChapterTreeNode[] } | null | undefined;
}

interface AlignmentSurface {
  readonly formatForPrompt?: (state: unknown, opts: { actor: string; world?: string }) => string;
}

interface StoryBranchSurface {
  readonly getBranches?: (world: string | undefined) => readonly StoryBranch[];
}

interface OpsSurface {
  readonly describe: (ops: OpInput[] | unknown[]) => string[];
}

interface DataStoreSurface {
  readonly get: (bucket: string, id: string) => { name?: string } | null | undefined;
}

interface CampaignStateSurface {
  readonly getState: () => StoryContextState | null;
}

interface StoryContextCjs {
  readonly CampaignState?: CampaignStateSurface;
  readonly CampaignStoryDirector?: { readonly snapshot?: () => StoryDirectorSnapshot };
  readonly CampaignSequences?: SequencesSurface;
  readonly CampaignAlignment?: AlignmentSurface;
  readonly CampaignStoryBranch?: StoryBranchSurface;
  readonly CampaignOps?: OpsSurface;
  readonly DataStore?: DataStoreSurface;
  readonly CampaignUI?: { readonly render?: () => void };
  CampaignStoryContext?: StoryContextInstall;
  readonly [key: string]: unknown;
}

function cjs(): StoryContextCjs {
  return (window as unknown as { CJS?: StoryContextCjs }).CJS ?? {};
}

// After an async per-world load resolves, repaint only when the player
// is still on that world — mirrors the closure's `_root &&
// currentWorld === worldId` guard (render() itself bails when unmounted).
function requestRenderForWorld(worldId: string): void {
  if (cjs().CampaignState?.getState?.()?.currentWorld === worldId) {
    setTimeout(() => cjs().CampaignUI?.render?.(), 0);
  }
}

// ── Async loaders (mirror `_loadStoryContextFile/Json`) ──────────────
async function loadStoryContextFile(path: string): Promise<string> {
  if (typeof fetch !== "function") return "";
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return "";
  return (await response.text()).trim();
}

async function loadStoryContextJson(path: string): Promise<Record<string, unknown> | null> {
  if (typeof fetch !== "function") return null;
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return null;
  const text = (await response.text()).trim();
  if (!text) return null;
  return JSON.parse(text);
}

// ── Cache primer (mirrors `_ensureStoryContext`) ─────────────────────
export async function ensureStoryContext(world = "haven"): Promise<StoryContextSnapshot> {
  const worldId = world || "haven";
  const jobs: Array<Promise<void>> = [];
  const cache = storyContextCache;

  if (cache.globalIndex.status === "idle") {
    cache.globalIndex.status = "loading";
    cache.globalIndex.promise = loadStoryContextJson("data/worlds/_ai_story_context_index.json")
      .then((data) => {
        cache.globalIndex.data = data;
        cache.globalIndex.status = data ? "loaded" : "missing";
      })
      .catch((error) => {
        console.warn("AI story context index unavailable:", error);
        cache.globalIndex.status = "missing";
      });
  }
  if (cache.globalIndex.promise) jobs.push(cache.globalIndex.promise);

  if (cache.allWorld.status === "idle") {
    cache.allWorld.status = "loading";
    cache.allWorld.promise = loadStoryContextFile("data/worlds/_all_world_story_flow_summary.md")
      .then((text) => {
        cache.allWorld.text = text;
        cache.allWorld.status = text ? "loaded" : "missing";
      })
      .catch((error) => {
        console.warn("All-world story summary unavailable:", error);
        cache.allWorld.status = "missing";
      });
  }
  if (cache.allWorld.promise) jobs.push(cache.allWorld.promise);

  const entry = (cache.worlds[worldId] = cache.worlds[worldId] || { status: "idle", text: "", promise: null });
  if (entry.status === "idle") {
    entry.status = "loading";
    entry.promise = loadStoryContextFile(`data/worlds/${worldId}/story_summary.md`)
      .then((text) => {
        entry.text = text;
        entry.status = text ? "loaded" : "missing";
        requestRenderForWorld(worldId);
      })
      .catch((error) => {
        console.warn("World story summary unavailable:", worldId, error);
        entry.status = "missing";
      });
  }
  if (entry.promise) jobs.push(entry.promise);

  const structured = (cache.structuredWorlds[worldId] = cache.structuredWorlds[worldId] || { status: "idle", data: null, promise: null });
  if (structured.status === "idle") {
    structured.status = "loading";
    structured.promise = loadStoryContextJson(`data/worlds/${worldId}/story_context/index.json`)
      .then((data) => {
        structured.data = data;
        structured.status = data ? "loaded" : "missing";
        requestRenderForWorld(worldId);
      })
      .catch((error) => {
        console.warn("World AI story context unavailable:", worldId, error);
        structured.status = "missing";
      });
  }
  if (structured.promise) jobs.push(structured.promise);

  await Promise.allSettled(jobs);
  return storyContextFor(worldId);
}

// ── Snapshot reader (mirrors `_storyContextFor`) ─────────────────────
export function storyContextFor(world = "haven"): StoryContextSnapshot {
  const worldId = world || "haven";
  const worldEntry = storyContextCache.worlds[worldId] || { status: "idle" as StoryContextLoadStatus, text: "" };
  const structuredEntry = storyContextCache.structuredWorlds[worldId] || { status: "idle" as StoryContextLoadStatus, data: null };
  return {
    world: worldId,
    indexPath: "data/worlds/_ai_story_context_index.json",
    allWorldPath: "data/worlds/_all_world_story_flow_summary.md",
    worldPath: `data/worlds/${worldId}/story_summary.md`,
    structuredWorldPath: `data/worlds/${worldId}/story_context/index.json`,
    indexStatus: storyContextCache.globalIndex.status,
    allWorldStatus: storyContextCache.allWorld.status,
    worldStatus: worldEntry.status,
    structuredWorldStatus: structuredEntry.status,
    indexData: storyContextCache.globalIndex.data || null,
    allWorldText: storyContextCache.allWorld.text || "",
    worldText: worldEntry.text || "",
    structuredWorldData: structuredEntry.data || null
  };
}

// ── AI story-context panel snapshot (mirrors `_aiStoryContextData`) ───
export function aiStoryContextData(state: StoryContextState): AiStoryContextData {
  const ctx = storyContextFor(state.currentWorld || "haven");
  const manual = state.storyMode?.manualSummaryEntries || [];
  const branches =
    cjs().CampaignStoryBranch?.getBranches?.(state.currentWorld) || state.storyMode?.manualBranches || [];
  const loaded = [ctx.indexData ? 1 : 0, ctx.allWorldText ? 1 : 0, ctx.worldText ? 1 : 0, ctx.structuredWorldData ? 1 : 0].reduce(
    (a, b) => a + b,
    0
  );
  const arcsRaw = (ctx.structuredWorldData as { arcs?: unknown[] } | null)?.arcs;
  const arcs = Array.isArray(arcsRaw) ? arcsRaw : [];
  return {
    loaded,
    total: 4,
    staticLines: [
      { path: String(ctx.allWorldPath), statusLabel: label(ctx.allWorldStatus) },
      { path: String(ctx.worldPath), statusLabel: label(ctx.worldStatus) }
    ],
    indexLines: [
      { path: String(ctx.indexPath), statusLabel: label(ctx.indexStatus) },
      { path: String(ctx.structuredWorldPath), statusLabel: label(ctx.structuredWorldStatus) }
    ],
    arcsCount: arcs.length,
    manualCount: manual.length,
    branchCount: branches.length
  };
}

// ── Prompt text helpers (mirror the `_*PromptText` cluster) ──────────
function markdownPromptExcerpt(text: unknown = "", maxChars = 2800): string {
  const clean = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  const slice = clean.slice(0, maxChars);
  const cut = Math.max(slice.lastIndexOf("\n## "), slice.lastIndexOf("\n- "), slice.lastIndexOf("\n"));
  return `${slice.slice(0, cut > 900 ? cut : maxChars).trim()}\n...`;
}

function compactPromptLine(text: unknown = "", maxChars = 600): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 3).trim()}...`;
}

function storyChapterText(state: StoryContextState = {}): string {
  return esc(state.storyMode?.currentChapterLabel || state.currentChapter || 1);
}

interface GlobalIndexData {
  readonly purpose?: string;
  readonly readOrder?: readonly unknown[];
  readonly authoringContract?: { readonly afterDrafting?: readonly unknown[] };
  readonly sharedConsequenceModel?: {
    readonly choiceAxes?: ReadonlyArray<{ readonly id?: string; readonly use?: string }>;
    readonly additionalTrackers?: readonly string[];
  };
}

function storyContextIndexPromptText(data: GlobalIndexData | null): string {
  if (!data) return "- Global AI story context index not loaded.";
  const lines: string[] = [];
  if (data.purpose) lines.push(`Purpose: ${compactPromptLine(data.purpose, 500)}`);
  if (Array.isArray(data.readOrder) && data.readOrder.length) {
    lines.push("Read order:");
    data.readOrder.slice(0, 7).forEach((item) => lines.push(`- ${compactPromptLine(item, 240)}`));
  }
  const contract = data.authoringContract || {};
  if (Array.isArray(contract.afterDrafting) && contract.afterDrafting.length) {
    lines.push("After each AI delivery:");
    contract.afterDrafting.slice(0, 7).forEach((item) => lines.push(`- ${compactPromptLine(item, 260)}`));
  }
  const consequence = data.sharedConsequenceModel || {};
  if (Array.isArray(consequence.choiceAxes) && consequence.choiceAxes.length) {
    lines.push("Shared choice axes:");
    consequence.choiceAxes.forEach((axis) => lines.push(`- ${axis.id}: ${compactPromptLine(axis.use || "", 220)}`));
  }
  if (Array.isArray(consequence.additionalTrackers) && consequence.additionalTrackers.length) {
    lines.push(`Other trackers to consider: ${consequence.additionalTrackers.slice(0, 12).join(", ")}`);
  }
  return lines.join("\n") || "- Global AI story context index is empty.";
}

interface ChoicePoint {
  readonly id?: string;
  readonly where?: string;
  readonly potentialAxes?: Record<string, unknown>;
  readonly futureUse?: string;
}

interface SuitabilityEntry {
  readonly bucket?: string;
  readonly summary?: string;
}

interface StructuredArc {
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly arcSummary?: string;
  readonly previousArcCarryover?: string;
  readonly currentDevelopmentTarget?: string;
  readonly potentialChoicePoints?: readonly ChoicePoint[];
  readonly eventSuitability?: readonly SuitabilityEntry[];
  readonly questSuitability?: readonly SuitabilityEntry[];
}

interface StructuredWorldData {
  readonly displayName?: string;
  readonly world?: string;
  readonly purpose?: string;
  readonly summaryTiers?: { readonly always?: string; readonly previousArcCarryForward?: string };
  readonly readOrder?: { readonly skim?: readonly string[]; readonly openWhenWriting?: readonly string[] };
  readonly consequenceInputs?: {
    readonly alignmentAxes?: readonly string[];
    readonly relationships?: readonly string[];
    readonly worldPressure?: readonly string[];
  };
  readonly arcs?: readonly StructuredArc[];
  readonly futureEditSlots?: readonly unknown[];
}

function worldStoryContextPromptText(data: StructuredWorldData | null): string {
  if (!data) return "- World structured story context not loaded.";
  const lines: string[] = [];
  const title = data.displayName || data.world || "World";
  lines.push(`World: ${title}`);
  if (data.purpose) lines.push(`Purpose: ${compactPromptLine(data.purpose, 420)}`);
  const tiers = data.summaryTiers || {};
  if (tiers.always) lines.push(`Always remember: ${compactPromptLine(tiers.always, 420)}`);
  if (tiers.previousArcCarryForward) lines.push(`Carryover: ${compactPromptLine(tiers.previousArcCarryForward, 520)}`);
  const readFiles = [
    ...(Array.isArray(data.readOrder?.skim) ? data.readOrder.skim : []),
    ...(Array.isArray(data.readOrder?.openWhenWriting) ? data.readOrder.openWhenWriting : [])
  ];
  if (readFiles.length) {
    lines.push("Read/develop from:");
    readFiles.slice(0, 8).forEach((file) => lines.push(`- ${compactPromptLine(file, 260)}`));
  }
  const inputs = data.consequenceInputs || {};
  const trackers = [
    ...(Array.isArray(inputs.alignmentAxes) ? [`axes=${inputs.alignmentAxes.join("/")}`] : []),
    ...(Array.isArray(inputs.relationships) ? [`relationships=${inputs.relationships.slice(0, 8).join(", ")}`] : []),
    ...(Array.isArray(inputs.worldPressure) ? [`worldPressure=${inputs.worldPressure.slice(0, 8).join(", ")}`] : [])
  ];
  if (trackers.length) lines.push(`Consequence inputs: ${trackers.join("; ")}`);
  const arcs = Array.isArray(data.arcs) ? data.arcs.slice(0, 5) : [];
  if (arcs.length) {
    lines.push("Arc plan:");
    arcs.forEach((arc) => {
      lines.push(`- ${arc.id || arc.title} [${arc.status || "draft"}]: ${compactPromptLine(arc.arcSummary || "", 520)}`);
      if (arc.previousArcCarryover) lines.push(`  Previous carryover: ${compactPromptLine(arc.previousArcCarryover, 360)}`);
      if (arc.currentDevelopmentTarget) lines.push(`  Develop next: ${compactPromptLine(arc.currentDevelopmentTarget, 360)}`);
      if (Array.isArray(arc.potentialChoicePoints) && arc.potentialChoicePoints.length) {
        const points = arc.potentialChoicePoints
          .slice(0, 3)
          .map((point) => {
            const axes = point.potentialAxes
              ? ` axes=${Object.entries(point.potentialAxes)
                  .map(([key, value]) => `${key}${value}`)
                  .join("/")}`
              : "";
            return `${point.id || point.where}${axes}: ${compactPromptLine(point.futureUse || "", 220)}`;
          })
          .join(" | ");
        lines.push(`  Potential points: ${points}`);
      }
      if (Array.isArray(arc.eventSuitability) && arc.eventSuitability.length) {
        const events = arc.eventSuitability
          .slice(0, 3)
          .map((entry) => `${entry.bucket}: ${compactPromptLine(entry.summary || "", 220)}`)
          .join(" | ");
        lines.push(`  Event fit: ${events}`);
      }
      if (Array.isArray(arc.questSuitability) && arc.questSuitability.length) {
        const quests = arc.questSuitability
          .slice(0, 3)
          .map((entry) => `${entry.bucket}: ${compactPromptLine(entry.summary || "", 220)}`)
          .join(" | ");
        lines.push(`  Quest fit: ${quests}`);
      }
    });
  }
  if (Array.isArray(data.futureEditSlots) && data.futureEditSlots.length) {
    lines.push("Future edit slots:");
    data.futureEditSlots.slice(0, 5).forEach((slot) => lines.push(`- ${compactPromptLine(slot, 260)}`));
  }
  return lines.join("\n") || "- World structured story context is empty.";
}

function storyContextPromptText(state: StoryContextState = {}): string {
  const ctx = storyContextFor(state.currentWorld || "haven");
  const allWorld = markdownPromptExcerpt(ctx.allWorldText, 2200);
  const world = markdownPromptExcerpt(ctx.worldText, 3200);
  const globalIndex = storyContextIndexPromptText(ctx.indexData as GlobalIndexData | null);
  const structuredWorld = worldStoryContextPromptText(ctx.structuredWorldData as StructuredWorldData | null);
  return [
    "AI-readable story context files:",
    `- ${ctx.indexPath} (${ctx.indexStatus})`,
    `- ${ctx.allWorldPath} (${ctx.allWorldStatus})`,
    `- ${ctx.worldPath} (${ctx.worldStatus})`,
    `- ${ctx.structuredWorldPath} (${ctx.structuredWorldStatus})`,
    "",
    "How to use the context:",
    "- First read the structured arc/event/quest context for the chosen world.",
    "- Use full markdown summaries only when the compact context does not answer a story continuity question.",
    "- After drafting a story, event, or quest, return a story_context_update block so the matching world story_context/index.json can be updated for future AI runs.",
    "- Check possible consequence points, not just current points: alignment, world alignment, relationships, flags, world pressure, reputation, heat, debt, noise, infection, and route identity.",
    "",
    "Global AI story context index:",
    globalIndex,
    "",
    `${label(state.currentWorld || "world")} compact arc/event/quest context:`,
    structuredWorld,
    "",
    "All-world story flow summary:",
    allWorld || "- Summary file not loaded or not present.",
    "",
    `${label(state.currentWorld || "world")} story summary:`,
    world || "- Summary file not loaded or not present."
  ].join("\n");
}

function liveGmStoryPromptText(state: StoryContextState = {}): string {
  const manual = Array.isArray(state.storyMode?.manualSummaryEntries) ? state.storyMode.manualSummaryEntries : [];
  const branches = cjs().CampaignStoryBranch?.getBranches?.(state.currentWorld) || state.storyMode?.manualBranches || [];
  const manualText = manual.length
    ? manual
        .slice(0, 8)
        .map((entry) => {
          const meta = [entry.branchLabel ? `branch ${entry.branchLabel}` : "", entry.stageId ? `stage ${entry.stageId}` : "", entry.at || ""]
            .filter(Boolean)
            .join(", ");
          return `- ${entry.title || "GM note"}${meta ? ` (${meta})` : ""}: ${compactPromptLine(entry.text || "", 700)}`;
        })
        .join("\n")
    : "- No GM-added manual notes yet.";
  const branchText = branches.length
    ? branches
        .slice(0, 8)
        .map((branch) => {
          const parent = branch.parentLabel || branch.parentTitle || branch.parentSequenceId || "parent chapter";
          return `- ${branch.chapterLabel || branch.partLabel || branch.id}: ${branch.title || "Manual branch"} from ${parent}. ${compactPromptLine(
            branch.summary || branch.scene?.lines?.map((line) => line.text).join(" ") || "",
            500
          )}`;
        })
        .join("\n")
    : "- No runtime manual branch chapters yet.";
  return [
    "Live GM-added story overlay from the current save:",
    "These notes and branches are newer than static markdown. If they conflict, treat this live overlay as table truth unless the GM says otherwise.",
    "",
    "GM manual notes:",
    manualText,
    "",
    "Runtime manual branch chapters:",
    branchText
  ].join("\n");
}

// Full AI story-prompt assembler (mirrors `_storyPromptText`).
export function storyPromptText(): string {
  const c = cjs();
  const state = c.CampaignState?.getState?.() || {};
  const snap = c.CampaignStoryDirector?.snapshot?.() || {};
  const pack = snap.pack || {};
  const stage = snap.stage || {};
  const last = snap.last || {};
  const ds = c.DataStore;
  const party =
    Object.entries(state.party || {})
      .filter(([, member]) => (member.rosterRole || "active") !== "bench")
      .map(([id, member]) => member.name || ds?.get?.("characters", member.baseCharacterId || id)?.name || id)
      .join(", ") || "Current party";
  const queue = (snap.queue || []).slice(0, 5).map((beat) => `- ${beat.title || beat.id} (${beat.status || "saved"})`).join("\n") || "- None";
  const clues = (snap.clues || []).slice(0, 5).map((clue) => `- ${clue.title || clue.id}: ${clue.text || ""}`).join("\n") || "- None";
  const facts = (snap.facts || []).slice(0, 5).map((fact) => `- ${fact.title || fact.id}: ${fact.text || ""}`).join("\n") || "- None";
  const describe = c.CampaignOps?.describe;
  const choices =
    (last.suggestedChoices || [])
      .map((choice, index) => {
        const ops = (choice.ops || []).map((op) => `    - ${(describe?.([op]) || [])[0] || op.op}`).join("\n") || "    - Story only";
        return `${index + 1}. ${choice.label || `Choice ${index + 1}`}\n${ops}`;
      })
      .join("\n") || "No current branch choices.";
  const Seq = c.CampaignSequences;
  const route = Seq?.currentRouteChoices?.(state, state.currentWorld) || [];
  const routePath = route.length
    ? route
        .map((entry) => `${entry.partLabel || entry.title || entry.sequenceId}${entry.routeLabel ? ` (${entry.routeLabel})` : ""}`)
        .join(" → ")
    : "No story parts played yet.";
  const routeDetail = route.length
    ? route
        .map((entry) => {
          const choiceText = (entry.choices || []).map((choice) => `${choice.nodeId}=${choice.choiceId || choice.label || "?"}`).join(", ");
          return `- ${entry.partLabel || entry.title || entry.sequenceId} [${entry.mode}]${choiceText ? `: ${choiceText}` : ""}`;
        })
        .join("\n")
    : "- None yet";
  const tree = Seq?.chapterTree?.(state.currentWorld, state) || { nodes: [] };
  const upcoming = (tree.nodes || [])
    .filter((node) => {
      const eligible = node.eligibility?.eligible;
      const replayed = node.status?.replayOnly;
      const blocked = node.status?.deliveryBlocked;
      return eligible && !replayed && !blocked;
    })
    .slice(0, 6);
  const upcomingText = upcoming.length
    ? upcoming.map((node) => `- ${node.partLabel || node.partId || node.id}${node.routeLabel ? ` (${node.routeLabel})` : ""}: ${node.title}`).join("\n")
    : "- Nothing currently unlocked beyond the trunk.";
  const lockedHints = (tree.nodes || [])
    .filter((node) => {
      const blocked = node.status?.deliveryBlocked;
      return !node.eligibility?.eligible && !node.status?.replayOnly && !blocked && node.eligibility?.reasons?.length;
    })
    .slice(0, 5);
  const lockedText = lockedHints.length
    ? lockedHints.map((node) => `- ${node.partLabel || node.partId || node.id}: ${(node.eligibility?.reasons || []).join(" | ")}`).join("\n")
    : "- No locked branches with clear unlock hints.";
  const alignmentText =
    c.CampaignAlignment?.formatForPrompt?.(state, { actor: "bin", world: state.currentWorld }) || "Choice consequence tracker unavailable.";
  const staticStoryContext = storyContextPromptText(state);
  const liveGmContext = liveGmStoryPromptText(state);
  return [
    "CJS Story Mode GM Prompt",
    "",
    `Tone: ${(pack.tonePillars || []).join(", ") || "light, human, funny, hopeful, slightly snarky"}`,
    `Campaign: ${pack.name || "Campaign story"}`,
    `Current stage: ${stage.name || stage.id || "No stage"} - ${stage.summary || ""}`,
    `Party: ${party}`,
    `Chapter/phase: chapter ${storyChapterText(state)}, phase ${state.phase?.number || 1} (${state.phase?.type || "unknown"})`,
    "",
    staticStoryContext,
    "",
    liveGmContext,
    "",
    "Route taken so far:",
    `Path: ${routePath}`,
    routeDetail,
    "",
    "Currently unlocked next chapter parts:",
    upcomingText,
    "",
    "Locked branches (and what unlocks them):",
    lockedText,
    "",
    alignmentText,
    "",
    "Current beat:",
    last.title ? `${last.title}\n${last.prompt || last.text || last.summary || ""}` : "No current beat rolled.",
    "",
    "Branch choices and consequences:",
    choices,
    "",
    "Saved/queued beats:",
    queue,
    "",
    "Known clues:",
    clues,
    "",
    "Revealed facts:",
    facts,
    "",
    "Request:",
    "Continue the chapter that follows the route the player has taken. Respect the branch flags (e.g. gate vs tavern, hunt vs fortify vs compromise). When you write the next scene, begin with VN narration + dialogue + at least one stat/choice/QTE hook, then progress into either a map step or a battle that pops up directly in the player's face on contact. Resolve combat with consequences: losing should imply a penalty or retry, not a soft reset. Keep authored content concrete, no decorative filler, and end each scene with a clear next action or unlock signal."
  ].join("\n");
}

// ── Cross-language install ───────────────────────────────────────────
// Only `ensureStoryContext` is consumed by the still-JS campaign-ui.js
// (init/render/subscribe prime the cache). TS callers import the rest
// directly. Drops when campaign-ui.js is deleted.
interface StoryContextInstall {
  readonly ensureStoryContext: (world?: string) => Promise<StoryContextSnapshot>;
}

const install: StoryContextInstall = { ensureStoryContext };
const root = (window as unknown as { CJS?: StoryContextCjs }).CJS ?? ((window as unknown as { CJS: StoryContextCjs }).CJS = {} as StoryContextCjs);
root.CampaignStoryContext = install;
