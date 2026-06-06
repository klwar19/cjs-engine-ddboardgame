// manual-builders.ts — thin action-handler dispatchers for the four big
// modal builders. As of Phase H.4 all four modal bodies live in TS, so
// these handlers call them directly (no CampaignUI bridge hop remains):
//   • manual event builder → `event-builder.ts` (custom-event /
//     oracle-to-event-builder)
//   • manual quest builder → `quest-builder.ts` (add-quest)
//   • GM override → `gm-override.ts` (gm-override / gm-member-override)
//   • manual scene builder → `scene-builder.ts` (story-manual-note)
//
// This module survives as the seam between the action names and those
// modal entry points (e.g. oracle-to-event-builder seeds the event
// builder from state.lastOracle; story-manual-note reads the current
// Story Director stage first).
//
// custom-event → manual event builder (no prefill).
// oracle-to-event-builder → manual event builder seeded from the
//   last oracle (title, source: 'oracle', scope: 'event', seed +
//   short summary, oracle tags merged).
// add-quest → manual quest modal.
// gm-override → GM override modal (no default member focus).
// gm-member-override → GM override modal focused on a member id.
// story-manual-note → manual scene builder (with current Story
//   Director stage as the default chapter slot).

import { cs, mod, toast } from "./context";
import { openManualSceneBuilder, type SceneBuilderStage } from "./scene-builder";
import { openGmOverride } from "./gm-override";
import { openManualEventBuilder } from "./event-builder";
import { openQuestModal } from "./quest-builder";

interface StoryDirectorModule {
  snapshot?: () => { stage?: SceneBuilderStage } | null | undefined;
}

interface UtilsModule {
  truncate?: (text: string, max?: number) => string;
}

interface CuiInternal {
  Utils?: UtilsModule;
}

function truncate(text: string, max = 160): string {
  const fn = mod<CuiInternal>("CampaignUIInternal")?.Utils?.truncate;
  if (fn) return fn(text, max);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// ── custom-event / oracle-to-event-builder ─────────────────────────

export function customEvent(): void {
  openManualEventBuilder();
}

// Mirrors `_oracleToEventBuilder`. Seeds the manual event builder
// from `state.lastOracle` so the player can promote the oracle roll
// into a structured event. Toasts and exits if no oracle is pending.
export function oracleToEventBuilder(): void {
  const oracle = (cs().getState() as { lastOracle?: { text?: string; prompt?: string; tags?: string[] } } | null)?.lastOracle;
  if (!oracle) {
    toast("No oracle to promote — roll one first", "info");
    return;
  }
  const seed = oracle.text || oracle.prompt || "";
  openManualEventBuilder({
    title: "Oracle Event",
    source: "oracle",
    scope: "event",
    seed,
    short: truncate(seed, 160),
    tags: ["oracle", ...(oracle.tags || [])]
  });
}

// ── add-quest ──────────────────────────────────────────────────────

export function addQuest(): void {
  // openQuestModal is async (it awaits the deferred generator chunk before
  // building the modal); fire-and-forget — the action dispatch ignores returns.
  void openQuestModal();
}

// ── gm-override / gm-member-override ───────────────────────────────

export function gmOverride(memberId?: string): void {
  openGmOverride(memberId || "");
}

// ── story-manual-note (manual scene builder) ───────────────────────

// Mirrors `_manualStoryNote`. Reads the current Story Director stage
// (so the new manual scene defaults to the right chapter slot) and
// opens the scene builder (ported to TS in Phase H.4 — direct call).
export function manualStoryNote(): void {
  const stage = mod<StoryDirectorModule>("CampaignStoryDirector")?.snapshot?.()?.stage || {};
  openManualSceneBuilder({ stage });
}
