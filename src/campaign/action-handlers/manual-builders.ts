// manual-builders.ts — action handlers for the big modal builders.
//
// One closure still lives in JS: the manual quest builder
// (`_openQuestModal`, 475 lines). It shares `_randomizedQuestTemplate` +
// `_inferObjectiveKind` + `_questBuilderMiniGame` with quest data flows,
// so add-quest stays a thin dispatcher that calls it through the
// CampaignUI.openQuestModal bridge until H.4 ports the closure + its data
// builders together. The other three modals ported to TS in H.4:
//   • manual event builder → `event-builder.ts` (custom-event /
//     oracle-to-event-builder call openManualEventBuilder directly)
//   • GM override → `gm-override.ts` (gm-override / gm-member-override)
//   • manual scene builder → `scene-builder.ts` (story-manual-note)
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

interface StoryDirectorModule {
  snapshot?: () => { stage?: SceneBuilderStage } | null | undefined;
}

interface CampaignUiBridge {
  openQuestModal?: (prefill?: Record<string, unknown>) => void;
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
  bridge()?.openQuestModal?.();
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
