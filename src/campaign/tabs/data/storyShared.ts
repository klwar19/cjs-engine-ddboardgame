// storyShared.ts — Shared Story-mode typed shapes + data builders used
// by both the Story Home tab and the Story Director tab.
//
// Phase H.4 — `storyTheme`, `storyVnHeroData`, `storyActionBtnData`,
// `storyNextStepData`, `videoTypeFromPath` ported inline. Both
// `getStoryHomeData` and `getStoryDirectorData` consume them.

import { cssVarAssetUrl } from "../../util/cui-utils";
import type { CampaignActionName } from "../../actionNames";

export interface StoryActionButton {
  readonly action: CampaignActionName;
  readonly label: string;
  readonly hint: string;
  readonly kind: string;
  readonly disabled: boolean;
  readonly data: Readonly<Record<string, string>>;
}

export interface StoryNextStep {
  readonly index: number;
  readonly title: string;
  readonly text: string;
  readonly actions: readonly StoryActionButton[];
}

export interface StoryVnHeroData {
  readonly worldName: string;
  readonly chapterLabel: string;
  readonly phaseLabel: string;
  readonly motif: string;
  readonly title: string;
  readonly summary: string;
  readonly bannerVideoUrl: string;
  readonly bannerVideoType: string;
  readonly next: StoryNextStep;
}

// ── Theme ──────────────────────────────────────────────────────────
export interface StoryTheme {
  readonly id: string;
  readonly className: string;
  readonly backdrop: string;
  readonly bannerImage: string;
  readonly bannerVideo: string;
  readonly accent: string;
  readonly danger: string;
  readonly motif: string;
  readonly worldName: string;
}

interface WorldRecord {
  readonly id?: string;
  readonly displayName?: string;
  readonly color?: string;
  readonly tone?: string;
  readonly storyModeTheme?: {
    readonly id?: string;
    readonly className?: string;
    readonly backdrop?: string;
    readonly bannerImage?: string;
    readonly bannerVideo?: string;
    readonly accent?: string;
    readonly danger?: string;
    readonly motif?: string;
  };
}

interface CampaignStateForTheme {
  readonly currentWorld?: string;
  readonly storyMode?: { readonly currentChapterLabel?: string };
  readonly currentChapter?: string | number;
  readonly phase?: { readonly number?: number };
}

interface CampaignStateSurface {
  readonly getCurrentWorld?: () => WorldRecord | null | undefined;
}

interface StoryCjs {
  readonly CampaignState?: CampaignStateSurface;
}

function cjs(): StoryCjs {
  return (window as unknown as { CJS?: StoryCjs }).CJS ?? {};
}

export function storyTheme(state: CampaignStateForTheme = {}): StoryTheme {
  const world = cjs().CampaignState?.getCurrentWorld?.() || {};
  const cfg = world.storyModeTheme || {};
  const currentWorld = state.currentWorld || world.id || "";
  return {
    id: cfg.id || "default",
    className: cfg.className || "",
    backdrop: cfg.backdrop || "",
    bannerImage: cfg.bannerImage || cfg.backdrop || "",
    bannerVideo:
      cfg.bannerVideo ||
      (currentWorld === "haven"
        ? "assets/videos/story-mode/banners/3%20f%C3%ACght%20chimera_reduced.mp4"
        : ""),
    accent: cfg.accent || world.color || "#76d3b1",
    danger: cfg.danger || "#ef6666",
    motif: cfg.motif || world.tone || "story",
    worldName: world.displayName || state.currentWorld || "World"
  };
}

// ── Video / asset helpers ──────────────────────────────────────────
export function videoTypeFromPath(path: string = ""): string {
  const lower = String(path).toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".ogg") || lower.endsWith(".ogv")) return "video/ogg";
  return "video/mp4";
}

// ── Action button data ─────────────────────────────────────────────
export interface StoryActionBtnInput {
  readonly action?: string;
  readonly label?: string;
  readonly hint?: string;
  readonly kind?: string;
  readonly disabled?: boolean;
  readonly data?: Record<string, string | number>;
}

export function storyActionBtnData(opts: StoryActionBtnInput = {}): StoryActionButton {
  return {
    action: String(opts.action || "") as CampaignActionName,
    label: String(opts.label || ""),
    hint: String(opts.hint || ""),
    kind: String(opts.kind || ""),
    disabled: !!opts.disabled,
    data: Object.freeze(
      Object.fromEntries(Object.entries(opts.data || {}).map(([k, v]) => [k, String(v)]))
    )
  };
}

// ── Next step data ─────────────────────────────────────────────────
export interface StoryNextStepInput {
  readonly index?: number;
  readonly title?: string;
  readonly text?: string;
  readonly actions?: readonly StoryActionBtnInput[];
}

export function storyNextStepData(next: StoryNextStepInput = {}): StoryNextStep {
  return {
    index: Number(next.index || 0),
    title: String(next.title || ""),
    text: String(next.text || ""),
    actions: Array.isArray(next.actions) ? next.actions.map(storyActionBtnData) : []
  };
}

// ── VN hero data ───────────────────────────────────────────────────
export interface StoryPackForVn {
  readonly name?: string;
  readonly summary?: string;
}

export interface StoryStageForVn {
  readonly id?: string;
  readonly name?: string;
}

export interface StoryVnHeroInput {
  readonly state?: CampaignStateForTheme;
  readonly pack?: StoryPackForVn | null;
  readonly stage?: StoryStageForVn | null;
  readonly next?: StoryNextStepInput;
  readonly theme?: Partial<StoryTheme>;
}

export function storyVnHeroData({
  state = {},
  pack = null,
  next = {},
  theme = {}
}: StoryVnHeroInput): StoryVnHeroData {
  const phase = state.phase || {};
  const video = theme.bannerVideo || "";
  return {
    worldName: String(theme.worldName || state.currentWorld || "World"),
    chapterLabel: String(state.storyMode?.currentChapterLabel || state.currentChapter || 1),
    phaseLabel: String(phase.number || 1),
    motif: String(theme.motif || "story"),
    title: String(pack?.name || `${theme.worldName || "World"} Story Mode`),
    summary: String(
      pack?.summary ||
        "Story Mode is ready for this world theme, but no authored story pack is loaded yet."
    ),
    bannerVideoUrl: video ? String(cssVarAssetUrl(video) || video) : "",
    bannerVideoType: video ? videoTypeFromPath(video) : "",
    next: storyNextStepData(next)
  };
}
