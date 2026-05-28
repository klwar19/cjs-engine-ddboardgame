// manual-builders.ts — Phase H.3 action handlers for the big modal
// builders that still live in JS (manual event builder, manual quest
// builder, GM override, manual scene builder).
//
// Each closure is large (266 / 475 / 174 / 127 lines) with many
// sub-helpers, and the render-side data builders still consume them
// (e.g. _openQuestModal shares `_randomizedQuestTemplate` +
// `_inferObjectiveKind` + `_questBuilderMiniGame` with quest data
// flows; `_openManualEventBuilder` shares the manual-event sub-
// helpers — keyword / battle / rumor / character / layer / tags —
// with event-builder data flows). Porting them in H.3 would
// duplicate that surface; instead, each action handler is a thin
// dispatcher that calls the closure through the new CampaignUI
// bridge (openManualEventBuilder / openQuestModal / openGmOverride /
// openManualSceneBuilder). H.4 ports the closure + its data
// builders together, and the bridge entries become redundant.
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

interface StoryDirectorModule {
  snapshot?: () => { stage?: { id?: string } } | null | undefined;
}

interface CampaignUiBridge {
  openManualEventBuilder?: (prefill?: Record<string, unknown>) => void;
  openQuestModal?: (prefill?: Record<string, unknown>) => void;
  openGmOverride?: (defaultTarget?: string) => void;
  openManualSceneBuilder?: (opts?: { stage?: Record<string, unknown> }) => void;
}

interface UtilsModule {
  truncate?: (text: string, max?: number) => string;
}

interface CuiInternal {
  Utils?: UtilsModule;
}

function bridge(): CampaignUiBridge | undefined {
  return mod<CampaignUiBridge>("CampaignUI");
}

function truncate(text: string, max = 160): string {
  const fn = mod<CuiInternal>("CampaignUIInternal")?.Utils?.truncate;
  if (fn) return fn(text, max);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// ── custom-event / oracle-to-event-builder ─────────────────────────

export function customEvent(): void {
  bridge()?.openManualEventBuilder?.();
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
  bridge()?.openManualEventBuilder?.({
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
  bridge()?.openQuestModal?.();
}

// ── gm-override / gm-member-override ───────────────────────────────

export function gmOverride(memberId?: string): void {
  bridge()?.openGmOverride?.(memberId || "");
}

// ── story-manual-note (manual scene builder) ───────────────────────

// Mirrors `_manualStoryNote`. Reads the current Story Director stage
// (so the new manual scene defaults to the right chapter slot) and
// opens the scene builder.
export function manualStoryNote(): void {
  const stage = mod<StoryDirectorModule>("CampaignStoryDirector")?.snapshot?.()?.stage || {};
  bridge()?.openManualSceneBuilder?.({ stage });
}
