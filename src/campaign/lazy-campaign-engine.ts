// lazy-campaign-engine.ts — defer the scenario *generator* engine off the
// campaign boot path (Tier 1 perf), mirroring ./lazy-minigames.
//
// `engine/campaign/campaign-scenario-generator` is a side-effect IIFE that
// registers `window.CJS.CampaignScenarioGenerator`. It is only read when:
//   • the lazy Scenarios tab renders (it imports the module directly, so the
//     render path is covered with zero load window), or
//   • a `generate-*` action fires (scenario.ts) — possibly from the QuestHome
//     tab via `generate-quest-scenario`, or the Quests/Overview tabs' quest
//     builder (quest-builder.ts) — i.e. tabs that do NOT pull the generator
//     chunk themselves.
//
// Importing it statically in main.tsx pulled `cjs-campaign-generators` into the
// campaign page's eager modulepreload set. Behind this single memoized dynamic
// import it drops out of the initial download; main.tsx warms it in the
// background after first paint, and the cross-tab action handlers await this
// first so a generate never runs against an unloaded generator.
let scenarioGenerator: Promise<unknown> | null = null;

export function ensureScenarioGenerator(): Promise<unknown> {
  if (!scenarioGenerator) scenarioGenerator = import("../engine/campaign/campaign-scenario-generator");
  return scenarioGenerator;
}
