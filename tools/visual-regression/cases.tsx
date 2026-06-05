// cases.tsx — the visual-regression case registry + the single shared
// CampaignState fixture + the engine-module stub (Phase K.2).
//
// This file is TYPE-CHECKED by `tsc` (tsconfig includes
// tools/visual-regression/**), so every `state={...}` / `data={...}` prop is
// verified against the REAL component contract — a fixture can't silently
// drift from the typed shape it stands in for. It is NOT in any vite entry
// graph, so it never ships in the production bundle.
//
// Design (matches MIGRATION_PHASE_D_PLAN.md K.2 — "render every tab against a
// fixed CampaignState fixture, snapshot the DOM tree"):
//   • ONE rich CampaignState fixture drives every registered tab. The tabs
//     pull their data through the REAL typed bridges in src/campaign/tabs/data/
//     and the REAL leaf components (QuestRow, ResultPanels, …) render inside
//     them — so the snapshots exercise the actual render path, not mocks.
//   • The 5 always-mounted chrome strips render from a typed ChromeData fixture
//     (pure prop → JSX).
//   • A few leaf components are snapshotted standalone to pin branch variants
//     (resolved vs active quest) the shared fixture doesn't otherwise hit.
//   • `installEngine()` provides the bounded window.CJS engine surface the
//     bridges read. Almost every engine read is optional-chained, so empties
//     are safe; we return realistic data where a tab's content depends on it.
//     External-module tabs (inventory/shops/…) are React wrappers around
//     vanilla island HTML — out of scope for the JSX migration — so their
//     modules return a labeled sentinel; the snapshot captures the wrapper.

import type { ReactElement } from "react";

import { CampaignHeader } from "../../src/campaign/shell/Header";
import { CampaignModeBar } from "../../src/campaign/shell/ModeBar";
import { CampaignSubTabs } from "../../src/campaign/shell/SubTabs";
import { CampaignRecentLog } from "../../src/campaign/shell/RecentLog";
import { CampaignCommandRail } from "../../src/campaign/shell/CommandRail";
import { PartyDrawer } from "../../src/campaign/shell/PartyDrawer";
import { QuestsDrawerPanel, LogDrawerPanel } from "../../src/campaign/shell/DrawerPanels";
import type { ChromeData } from "../../src/campaign/shell/types";

import { CampaignSettingsTab } from "../../src/campaign/tabs/CampaignSettingsTab";
import { CampaignLogsTab } from "../../src/campaign/tabs/CampaignLogsTab";
import { CampaignRosterTab } from "../../src/campaign/tabs/CampaignRosterTab";
import { CampaignWorldMapTab, CampaignWorldActivitiesTab } from "../../src/campaign/tabs/CampaignWorldMapTab";
import {
  CampaignSideForgeTab,
  CampaignQuestChainsTab,
  CampaignOracleForgeTab,
  CampaignBattleSetsTab,
  CampaignMapSeedsTab
} from "../../src/campaign/tabs/CampaignHubTabs";
import { CampaignInventoryTab } from "../../src/campaign/tabs/CampaignInventoryTab";
import { CampaignShopsTab } from "../../src/campaign/tabs/CampaignShopsTab";
import { CampaignRelationshipsTab } from "../../src/campaign/tabs/CampaignRelationshipsTab";
import { CampaignCraftTab, CampaignCookTab } from "../../src/campaign/tabs/CampaignCraftCookTabs";
import { CampaignFarmTab } from "../../src/campaign/tabs/CampaignFarmTab";
import { CampaignWorldGateTab } from "../../src/campaign/tabs/CampaignWorldGateTab";
import { CampaignStoryHomeTab } from "../../src/campaign/tabs/CampaignStoryHomeTab";
import { CampaignStorySummaryTab } from "../../src/campaign/tabs/CampaignStorySummaryTab";
import { CampaignStoryDirectorTab } from "../../src/campaign/tabs/CampaignStoryDirectorTab";
import { CampaignQuestHomeTab } from "../../src/campaign/tabs/CampaignQuestHomeTab";
import { CampaignQuestsPanelTab } from "../../src/campaign/tabs/CampaignQuestsPanelTab";
import {
  CampaignEventHomeTab,
  CampaignEventCharacterTab,
  CampaignEventSpecialTab,
  CampaignEventSideTab
} from "../../src/campaign/tabs/CampaignEventTab";
import { CampaignEventLogTab } from "../../src/campaign/tabs/CampaignEventLogTab";
import { CampaignScenariosTab } from "../../src/campaign/tabs/CampaignScenariosTab";
import { CampaignMapsTab } from "../../src/campaign/tabs/CampaignMapsTab";
import { CampaignMinigameTestTab } from "../../src/campaign/tabs/CampaignMinigameTestTab";
import { CampaignOverviewTab } from "../../src/campaign/tabs/CampaignOverviewTab";

import { QuestRow } from "../../src/campaign/tabs/QuestRow";
import { getQuestRowData } from "../../src/campaign/tabs/data/questRow";
import { StoryBeatModalBody } from "../../src/campaign/tabs/StoryBeatModal";
import { storyDirectorCardData } from "../../src/campaign/tabs/data/storyDirector";

import { campaignStore } from "../../src/campaign/store";
import type { CampaignStateSnapshot } from "../../src/campaign/store";

// ── Shared CampaignState fixture ────────────────────────────────────────────
// Deliberately readonly-free (the engine's state is a mutable plain object);
// typed as CampaignStateSnapshot so the tab `state=` props type-check.
const fixtureQuests: Record<string, Record<string, unknown>> = {
  q_relic: {
    id: "q_relic",
    title: "The Sunken Relic",
    status: "active",
    summary: "Recover the drowned relic from the tidewater ruins.",
    phase: 2,
    tags: ["main", "ruins"],
    variant: { label: "Tidewater", text: "Water rises each phase.", repeat: "" },
    objectives: [
      { id: "o1", kind: "reach", label: "Reach the ruins", current: 1, required: 1, done: true },
      { id: "o2", kind: "collect", label: "Recover the relic", current: 0, required: 1, done: false }
    ]
  },
  q_herbs: {
    id: "q_herbs",
    title: "Moonpetal Harvest",
    status: "active",
    summary: "Gather moonpetals for the apothecary.",
    phase: 1,
    tags: ["side"],
    objectives: [
      { id: "o1", kind: "collect", label: "Gather moonpetals", current: 3, required: 8, done: false }
    ]
  },
  q_bandits: {
    id: "q_bandits",
    title: "Bandit Bounty",
    status: "complete",
    summary: "The bandit camp was cleared.",
    phase: 3,
    tags: ["bounty"],
    objectives: [
      { id: "o1", kind: "defeat", label: "Defeat the bandits", current: 5, required: 5, done: true }
    ]
  }
};

// One active + one benched roster member, with the field surface the typed
// roster data builders read, so the React roster hero/vitals/stats/detail
// cards render real data.
const fixtureParty: Record<string, Record<string, unknown>> = {
  char_lyra: {
    name: "Lyra Vane", baseCharacterId: "lyra", icon: "", rarity: "SR",
    level: 12, xp: 3400, rank: "B", rosterRole: "active", adventurer: true,
    archetype: "striker", class: "Duelist", currentJob: "duelist",
    currentHp: 184, maxHp: 220, currentMp: 38, maxMp: 60,
    tags: ["melee", "agile"], statuses: [],
    equipment: [], equipmentSlots: { weapon: null, armor: null, accessory1: null, accessory2: null },
    equippedSkills: [], equippedPassives: [], learnedSkills: [], learnedPassives: [],
    skillSlots: 4, passiveSlots: 2, skillPoints: 1, passivePoints: 0,
    skillProgress: {}, passiveProgress: {}, jobProgress: {},
    statOverrides: {}, resist: [], weak: [], immune: [], activePersona: null
  },
  char_bram: {
    name: "Bram Holt", baseCharacterId: "bram", icon: "", rarity: "R",
    level: 9, xp: 1500, rank: "C", rosterRole: "bench", adventurer: true,
    archetype: "guardian", class: "Warden", currentJob: "warden",
    currentHp: 240, maxHp: 240, currentMp: 12, maxMp: 20,
    tags: ["tank"], statuses: [],
    equipment: [], equipmentSlots: { weapon: null, armor: null, accessory1: null, accessory2: null },
    equippedSkills: [], equippedPassives: [], learnedSkills: [], learnedPassives: [],
    skillSlots: 3, passiveSlots: 2, skillPoints: 0, passivePoints: 1,
    skillProgress: {}, passiveProgress: {}, jobProgress: {},
    statOverrides: {}, resist: [], weak: [], immune: [], activePersona: null
  }
};

const campaignState = {
  campaignId: "camp_fixture",
  campaignName: "Harborlight Saga",
  currentWorld: "haven",
  activeAppMode: "story",
  activeTab: "overview",
  chapter: 2,
  phase: 5,
  gold: 1840,
  jp: 12,
  // Spendable currencies — drives the Shops tab `canBuy` (affordability) path.
  currencies: { haven_gold: 200, jp: 12 },
  party: fixtureParty,
  // Inventory slice — drives the ported CampaignInventoryTab JSX (DataStore.get
  // returns null in the stub, so names fall back to ids, exercising that path).
  inventory: {
    items: { potion_heal: 3, smoke_bomb: 1 },
    materials: { iron_ore: 12 },
    food: { trail_ration: 5 },
    questItems: { sea_chart: 1 },
    equipment: {}
  },
  pinnedNotes: [{ at: "2026-05-30T08:00:00Z", text: "Ask the harbor master about the relic." }],
  // Relationship bonds + acts — drive the ported CampaignRelationshipsTab JSX
  // (DataStore.get('characters') is null in the stub, so names fall back to ids
  // and romance stays ineligible; romance shows only where a bond romance > 0).
  bonds: {
    char_lyra: { trust: 4, respect: 2 },
    npc_mara: { trust: 1, respect: 0, romance: 2 }
  },
  relationshipActs: {
    remaining: 2,
    max: 3,
    history: [{ characterId: "char_lyra", activityId: "hang_out", amount: 1, field: "trust" }]
  },
  log: [
    { op: "phase-advance", text: "Phase 5 begins.", at: "2026-05-30T09:00:00Z", phase: 5 },
    { op: "quest-progress", text: "Recovered a moonpetal.", at: "2026-05-30T09:02:00Z", phase: 5 },
    { op: "combat", text: "Defeated a tidewater lurker.", at: "2026-05-30T09:05:00Z", phase: 5 }
  ],
  eventLog: {
    entries: [
      {
        title: "A Stranger at the Docks",
        summary: "A hooded figure offers a map for a price.",
        scope: "world",
        source: "manual",
        phase: 4,
        at: "2026-05-30T08:40:00Z",
        consequences: ["Gained a sea chart", "Owe a favor"],
        tags: ["manual_event", "intrigue"]
      },
      {
        title: "Oracle: The Tower",
        summary: "Upheaval ahead — prepare for sudden change.",
        scope: "oracle",
        source: "oracle",
        phase: 3,
        at: "2026-05-30T08:10:00Z",
        consequences: [],
        tags: ["oracle"]
      }
    ]
  },
  quests: fixtureQuests,
  activeScenarioRun: {
    travelMode: "linear",
    questId: "q_relic",
    questTitle: "The Sunken Relic",
    danger: 3,
    dangerMax: 10,
    usedCampRests: 1,
    randomBattlesUsed: 2,
    eventsUsed: 1,
    limits: { campRests: 3, events: 4, randomBattles: 6 },
    currentBeatIndex: 1
  },
  // Result-panel slices — these light up the self-subscribing ResultPanels
  // (Phase I.2b) inside the tabs that mount them (Overview, EventTab, Maps).
  lastEvent: {
    id: "ev_docks", title: "A Stranger at the Docks", type: "world", tableName: "Harbor Events",
    prompt: "A hooded figure offers a sea chart for a price.", gmHook: "The chart marks the relic.",
    gmIdea: "main_plot", suggested: [],
    manualSummary: { short: "Got a sea chart; owe a favor.", main: "The stranger vanished into the fog.", tags: ["intrigue"] }
  },
  lastOracle: { text: "The Tower — sudden upheaval; what you built is tested." },
  lastTravelSurprise: {
    title: "Ambush at the Ford", category: "danger", prompt: "Bandits spring from the reeds.",
    area: "Tidewater Ford", repeated: false, location: "Ford"
  },
  pendingBattle: {
    source: "scenario", encounterId: "enc_lurkers", label: "Tidewater Lurkers",
    monsterIds: ["lurker", "lurker", "tide_caller"], battleMap: { theme: "coast" }
  },
  pendingBattleResult: { result: "victory", encounterId: "enc_lurkers", rounds: 4, loot: [] },
  lastCombatResult: { result: "victory", encounterId: "enc_lurkers", rounds: 4, summary: "Cleared the flooded stair." },
  lastScenarioReport: {
    outcome: "complete", danger: 3, usedCampRests: 1, eventsUsed: 1,
    completedBattles: ["enc_lurkers"], diff: { gold: 120, xp: 300 }
  }
} as unknown as CampaignStateSnapshot;

// World / content / scenario fixtures the engine stub serves to the bridges.
const worldFixture = {
  id: "haven",
  name: "Pocket Haven",
  storyModeTheme: { homeBackdrop: "images/story-mode/haven/haven-theme.png" }
};

const scenarioFixture = {
  id: "sc_relic",
  name: "Tidewater Descent",
  notes: "A linear delve beneath the ruins.",
  shape: "linear",
  beats: [
    { id: "b1", label: "Flooded Stair", kind: "combat", encounterId: "enc_lurkers", prompt: "Lurkers block the stair." },
    { id: "b2", label: "Drowned Hall", kind: "event", encounterId: "", prompt: "An eerie calm." },
    { id: "b3", label: "Relic Vault", kind: "boss", encounterId: "enc_guardian", prompt: "The guardian stirs." }
  ]
};

const contentFixture = {
  campaignQuests: {
    haven_quests: { templates: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] }
  }
};

// Crafting recipes the DataStore stub serves to CampaignCraftTab via
// getAllAsArray("crafting"). Covers an affordable recipe (Craft enabled, green
// ingredients, buff) and an unaffordable one (disabled, red ingredients).
const craftingFixture = [
  {
    id: "iron_blade",
    name: "Iron Blade",
    icon: "🗡️",
    description: "A sturdy starter weapon.",
    _world: "haven",
    inputs: { materials: { iron_ore: 4 } },
    outputs: { items: { iron_blade: 1 } },
    buff: { stat: "atk", amount: 2 },
    duration: "next_battle"
  },
  {
    id: "mythic_charm",
    name: "Mythic Charm",
    icon: "✨",
    description: "Requires rare materials.",
    _world: "haven",
    inputs: { materials: { mythril: 3 }, currencies: { haven_gold: 500 } },
    outputs: { items: { mythic_charm: 1 } }
  }
];

// Food recipes for CampaignCookTab via getAllAsArray("food"). Food-only inputs
// don't surface as ingredient chips (island quirk), so this exercises the
// "No ingredients required." + canMake-via-food-stock path.
const foodFixture = [
  {
    id: "hearty_stew",
    name: "Hearty Stew",
    icon: "🍲",
    description: "Warm food for the road.",
    inputs: { food: { trail_ration: 2 } },
    outputs: { food: { hearty_stew: 1 } },
    buff: { stat: "hp", amount: 10 },
    duration: "next_battle"
  }
];

// Crops served via getAllAsArray("crops") — populate the Farm tab seed picker.
const cropsFixture = [
  { id: "haven_frostcap_seed", name: "Frostcap Seed", _world: "haven", growthTicks: 3 },
  { id: "haven_emberbloom_seed", name: "Emberbloom Seed", _world: "haven", growthTicks: 4 }
];

// A normalized Pocket Haven farm — drives the ported CampaignFarmTab JSX.
// Player faces a growing crop (target detail), one tile is ready, one crop slot
// is locked, a tile action-menu is open, and a focus bonus is available.
const farmFixture = {
  width: 8,
  height: 6,
  player: { x: 1, y: 3, facing: "right" },
  selectedTool: "seed",
  selectedSeed: "haven_frostcap_seed",
  selectedFertilizer: "haven_basic_fertilizer",
  cropSlots: ["2,3", "3,3", "2,2"],
  unlockedCropSlots: 2,
  maxCropSlots: 3,
  seedStock: { haven_frostcap_seed: 6 },
  fertilizerStock: { haven_basic_fertilizer: 2 },
  tools: {
    hand: { level: 1 }, hoe: { level: 1 }, seed: { level: 2 },
    water: { level: 1 }, fertilizer: { level: 1 }, scythe: { level: 1 }
  },
  tiles: {
    "2,3": { terrain: "soil", tilled: true, seedId: "haven_frostcap_seed", cropId: "frostcap", progress: 1, required: 3, ready: false, watered: true },
    "3,3": { terrain: "soil", tilled: true, seedId: "haven_frostcap_seed", cropId: "frostcap", progress: 3, required: 3, ready: true }
  },
  recent: ["Planted Frostcap Seed.", "Watered the soil."],
  qte: { available: true, active: false, streak: 0, startedAt: 0, duration: 1500, targetStart: 40, targetWidth: 18 },
  bonusHarvests: 1,
  lastClickedTile: null,
  actionMenu: { x: 2, y: 3 }
};

// Variant farm with the focus-bonus QTE window open (active) and no tile menu —
// drives the leaf-farm-qte snapshot for the CSS-animated QTE lane structure.
const farmQteActive = {
  ...farmFixture,
  qte: { ...farmFixture.qte, available: false, active: true, startedAt: 1, duration: 1500, targetStart: 42, targetWidth: 18 },
  actionMenu: null
};

// Dedicated farm states (kept off the shared campaignState so the farm slice
// doesn't perturb other tabs' snapshots).
const farmState = { ...campaignState, pocketHaven: { farm: farmFixture } } as unknown as CampaignStateSnapshot;
const farmQteState = { ...campaignState, pocketHaven: { farm: farmQteActive } } as unknown as CampaignStateSnapshot;

// Shops the DataStore stub serves to the ported CampaignShopsTab via
// getAllAsArray("shops"). Covers: an affordable item (Buy enabled + Sell),
// a seed (farm stock — no Sell), and an item with requires/consumes bundles.
const shopsFixture = [
  {
    id: "haven_general",
    name: "Harbor General Store",
    description: "Everyday gear for adventurers.",
    currency: "haven_gold",
    world: "haven",
    stock: [
      { id: "potion_heal", type: "item", qty: 9, price: 25, currency: "haven_gold" },
      { id: "moon_seed", type: "seed", qty: 5, price: 12 },
      {
        id: "warded_charm",
        type: "item",
        qty: 1,
        price: 60,
        requires: { items: { potion_heal: 1 } },
        costs: { materials: { iron_ore: 2 } }
      }
    ]
  }
];

// Save slots for the Settings tab (the shape CampaignSave.getSlots returns).
const saveSlots: Record<string, Record<string, unknown>> = {
  slot_main: {
    saveId: "slot_main", slotName: "Main", currentWorld: "haven",
    currentChapter: "2", storyMode: { currentChapterLabel: "Chapter 2 — Harborlight" },
    saveVersion: 7, lastUpdated: "2026-05-30T09:00:00Z"
  },
  slot_old: {
    saveId: "slot_old", slotName: "Backup", currentWorld: "haven",
    currentChapter: "1", storyMode: { currentChapterLabel: "Chapter 1 — Arrival" },
    saveVersion: 4, lastUpdated: "2026-05-20T18:30:00Z"
  }
};

// Story Director snapshot (the shape CampaignStoryDirector.snapshot returns),
// pack-loaded so the VN hero + stage rail + director card + support grid all
// render (the bulk of the G.11 migrated JSX).
const directorSnapshot = {
  pack: {
    id: "haven_director", name: "Harborlight Director", summary: "A coastal intrigue arc.",
    pressureRule: "Pressure rises when a clue is ignored.",
    stages: [
      { id: "arrival", name: "Arrival", summary: "Make port and meet the harbor master." },
      { id: "intrigue", name: "Intrigue", summary: "Uncover the smuggling ring." },
      { id: "reckoning", name: "Reckoning", summary: "Confront the ringleader." }
    ],
    metrics: [
      { id: "pressure", label: "Pressure" },
      { id: "trust", label: "Harbor Trust" }
    ],
    protectedTruths: [
      { id: "truth_relic", title: "The relic is real", rule: "Never reveal its location early." }
    ]
  },
  stage: { id: "intrigue", name: "Intrigue", summary: "Uncover the smuggling ring." },
  metrics: { pressure: 3, trust: 6 },
  flow: {
    stageId: "intrigue", summary: "Two side threads are live.",
    keep: [{ id: "sq_docks", title: "Dockside Whispers", reason: "Feeds the main clue." }],
    promote: [{ id: "sq_market", title: "Market Tipoff", reason: "Ready to escalate." }],
    retire: [{ id: "sq_stray", title: "Stray Cat", reason: "No longer relevant." }]
  },
  queue: [
    { id: "beat_warehouse", title: "The Warehouse Meet", status: "ready", stageName: "Intrigue", stageId: "intrigue", canonRisk: "amber" },
    { id: "beat_chase", title: "Rooftop Chase", status: "held", stageName: "Intrigue", stageId: "intrigue", canonRisk: "green" }
  ],
  clues: [
    { id: "clue_ledger", title: "The Smuggler's Ledger", text: "Names a corrupt official.", canonRisk: "amber" },
    { id: "clue_sigil", title: "A Strange Sigil", text: "Marks the crates.", canonRisk: "green" }
  ],
  facts: [
    { id: "fact_port", title: "The port is watched", text: "Guards patrol nightly." }
  ],
  last: {
    id: "card_meet", title: "The Warehouse Meet", stageId: "intrigue", stageName: "Intrigue",
    kind: "scene", canonRisk: "amber", status: "played",
    prompt: "The party stakes out the warehouse at dusk.",
    text: "Crates shift in the dark; a lantern flickers.",
    summary: "A tense observation scene.", gmNote: "Reward stealth.",
    tags: ["stealth", "intrigue"],
    suggestedChoices: [
      { label: "Sneak closer", ops: [] },
      { label: "Wait and watch", ops: [] }
    ]
  }
};

// ── Typed ChromeData fixture (pure chrome-strip props) ──────────────────────
const chromeData: ChromeData = {
  activeMode: "story",
  activeTab: "overview",
  activePanel: null,
  isUtility: false,
  header: {
    campaignName: "Harborlight Saga",
    worldName: "Pocket Haven",
    chapter: 2,
    phaseNumber: 5,
    phaseLabel: "Exploration",
    worldEvents: [
      { id: "we_storm", name: "Coastal Storm", icon: "⛈️", summary: "Travel costs rise.", category: "weather", remainingPhases: 2 }
    ],
    currencies: { gold: 1840, jp: 12 }
  },
  modeBar: {
    modes: [
      { id: "story", label: "Story", icon: "📖" },
      { id: "world", label: "World", icon: "🗺️" },
      { id: "haven", label: "Haven", icon: "🏠" }
    ],
    activeMode: "story",
    utilityTabs: [
      { id: "settings", label: "Settings" },
      { id: "logs", label: "Logs" }
    ],
    activeTab: "overview",
    scenarioHud: {
      scenarioName: "Tidewater Descent",
      danger: 3,
      dangerMax: 10,
      campsUsed: 1,
      campsMax: 3,
      battlesUsed: 2,
      battlesMax: 6,
      generated: true
    }
  },
  subTabs: [
    { id: "overview", label: "Overview" },
    { id: "questHome", label: "Quests" },
    { id: "storyHome", label: "Story" }
  ],
  recentLog: {
    hasLog: true,
    entries: [
      { kind: { key: "phase", label: "Phase" }, text: "Phase 5 begins.", meta: "P5" },
      { kind: { key: "combat", label: "Combat" }, text: "Defeated a tidewater lurker.", meta: "P5" }
    ]
  },
  commandRail: {
    panels: [
      { id: "quests", icon: "📜", label: "Quests", title: "Open quests", count: 2 },
      { id: "inventory", icon: "🎒", label: "Items", title: "Inventory", count: 14 }
    ],
    activePanel: null,
    currency: { gold: 1840, jp: 12 }
  }
};

// ── Engine stub ─────────────────────────────────────────────────────────────
// The bounded window.CJS surface the React tree reads (enumerated by grepping
// `CJS?.<Module>.<method>` across src/campaign). Every entry is defensive:
// methods return realistic fixtures where a tab's content depends on them and
// safe empties otherwise. CampaignUIInternal.* is installed separately by the
// runner (it loads the real TS util modules + the two JS islands).
const ISLAND = (name: string) =>
  `<section class="campaign-panel"><div class="campaign-island" data-island="${name}">[${name} island body]</div></section>`;

export function installEngine(): void {
  const w = window as unknown as { CJS: Record<string, unknown> };
  w.CJS = w.CJS || {};
  const CJS = w.CJS;

  CJS.CampaignState = {
    getState: () => campaignState,
    subscribe: () => () => {},
    getCurrentWorld: () => worldFixture,
    getContent: () => contentFixture,
    getCurrentCampaign: () => ({ id: "camp_fixture", name: "Harborlight Saga", world: "haven" }),
    getActiveScenario: () => scenarioFixture,
    getScenarioById: () => scenarioFixture,
    getScenarioMapById: () => null,
    getGeneratedScenarios: () => [scenarioFixture],
    getActiveQuestChains: () => [],
    getActiveMap: () => null,
    mutate: () => {}
  };
  CJS.CampaignSequences = {
    list: () => [],
    storyStatus: () => ({}),
    storyMeta: () => ({}),
    loadWorld: () => Promise.resolve()
  };
  CJS.CampaignStoryContext = { ensureStoryContext: () => Promise.resolve(null) };
  CJS.Minigames = {
    listGames: () => [
      { id: "fishing", name: "Fishing", category: "leisure" },
      { id: "cooking", name: "Cooking", category: "craft" }
    ]
  };
  const cropsById = Object.fromEntries(cropsFixture.map((c) => [c.id, c]));
  CJS.DataStore = {
    // Only the crops bucket is served (drives the Farm tab crop name / progress
    // / stage branches); every other bucket stays null so the inventory / shop /
    // recipe tabs keep exercising their id-fallback paths.
    get: (bucket: string, id: string) => (bucket === "crops" ? cropsById[id] || null : null),
    getAll: () => ({}),
    getAllAsArray: (bucket: string) =>
      bucket === "shops"
        ? shopsFixture
        : bucket === "crafting"
          ? craftingFixture
          : bucket === "food"
            ? foodFixture
            : bucket === "crops"
              ? cropsFixture
              : []
  };
  CJS.CampaignWorldMap = {
    getTravelMapData: () => null,
    getActivitiesData: () => null,
    handleAction: () => {}
  };
  CJS.CampaignSideContent = { riskClass: () => "campaign-risk-amber" };
  CJS.RelationshipTiers = {
    computeTier: (bond: { trust?: number; respect?: number; romance?: number } | undefined) => {
      const score = Number(bond?.trust || 0) * 5 + Number(bond?.respect || 0) * 3 + Number(bond?.romance || 0) * 4;
      return score >= 20
        ? { id: "ally", label: "Ally", icon: "♥", score }
        : { id: "acquaintance", label: "Acquaintance", icon: "•", score };
    },
    getKnownCharacters: (state: { bonds?: Record<string, unknown> } | undefined) => Object.keys(state?.bonds || {})
  };
  CJS.CampaignQuestChains = { getAvailable: () => [], getActive: () => [], toQuest: () => ({}) };
  CJS.CampaignStoryDirector = { snapshot: () => directorSnapshot };
  CJS.CampaignBattleSetForge = {
    getCards: () => [
      {
        id: "bs_lurkers", name: "Tidewater Ambush", canonRisk: "amber", rank: "B",
        objective: "Survive the rising tide.", tags: ["water", "ambush"], encounterId: "enc_lurkers",
        enemyMix: [{ qty: 3, label: "Lurker" }, { qty: 1, label: "Tide Caller" }], gimmick: "Flooding floor each round."
      }
    ]
  };
  CJS.CampaignMapSeedForge = {
    getSeeds: () => [
      {
        id: "ms_ruins", name: "Sunken Ruins", canonRisk: "green", purpose: ["delve", "treasure"],
        nodes: [
          { id: "n1", name: "Flooded Stair", role: "entry", notes: "Start here." },
          { id: "n2", name: "Relic Vault", role: "boss", notes: "Guardian waits." }
        ]
      }
    ]
  };
  CJS.CampaignSave = {
    getSlots: () => saveSlots,
    getActiveSlotId: () => "slot_main",
    isCompatible: (slot: { saveVersion?: number }) => (slot.saveVersion ?? 0) >= 5,
    describeIncompatibility: (slot: { saveVersion?: number }) =>
      `Saved on version ${slot.saveVersion ?? "?"}, older than the minimum supported (5).`,
    currentSaveVersion: () => 7,
    minCompatibleVersion: () => 5
  };
  CJS.CampaignOps = { describe: () => "", apply: () => {} };
  CJS.CampaignHub = { getCurrentHubState: () => ({}), getCurrentHubDefinition: () => ({}) };
  CJS.CampaignCombatBridge = { readResult: () => null, openBattle: () => {}, applyResult: () => {} };
  CJS.CONST = { STATUS_DEFINITIONS: {} };

  // External-module island wrappers (still-vanilla HTML; ported one at a time).
  // Inventory + Shops are now JSX (read state + DataStore) — no island stub.
  // All external-module tabs (inventory / shops / craft / cook / farm /
  // relationships) are now JSX; no PocketHaven/Economy/RelationshipsTab render
  // islands remain. The farm tab reads its slice from state.pocketHaven.farm.

  // Seed the campaign store so self-subscribing panels (ResultPanels via
  // useCampaignSelector) read the fixture through their getServerSnapshot
  // during renderToStaticMarkup. `subscribe` runs attach(), which seeds the
  // snapshot synchronously from getState().
  campaignStore.subscribe(() => {});
}

// ── Case registry ───────────────────────────────────────────────────────────
export interface VrCase {
  readonly name: string;
  readonly element: ReactElement;
}

function tab(name: string, element: ReactElement): VrCase {
  return { name, element };
}

export const cases: readonly VrCase[] = [
  // Chrome strips (typed ChromeData → pure JSX).
  tab("chrome-header", <CampaignHeader data={chromeData.header} />),
  tab("chrome-modebar", <CampaignModeBar data={chromeData.modeBar} />),
  tab("chrome-subtabs", <CampaignSubTabs tabs={chromeData.subTabs} activeTab={chromeData.activeTab} isUtility={chromeData.isUtility} />),
  tab("chrome-recentlog", <CampaignRecentLog data={chromeData.recentLog} />),
  tab("chrome-commandrail", <CampaignCommandRail data={chromeData.commandRail} />),
  tab("chrome-partydrawer", <PartyDrawer state={campaignState} />),
  // The quests / log command-rail drawer side panels (switch-plan Part D —
  // ported from boot.ts renderQuestsFallback / renderLogFallback HTML strings).
  tab("chrome-drawer-quests", <QuestsDrawerPanel state={campaignState} />),
  tab("chrome-drawer-log", <LogDrawerPanel state={campaignState} />),

  // Every registered tab, against the shared fixture.
  tab("tab-settings", <CampaignSettingsTab state={campaignState} />),
  tab("tab-logs", <CampaignLogsTab state={campaignState} />),
  tab("tab-roster", <CampaignRosterTab state={campaignState} />),
  tab("tab-worldMap", <CampaignWorldMapTab state={campaignState} />),
  tab("tab-worldActivities", <CampaignWorldActivitiesTab state={campaignState} />),
  tab("tab-sideForge", <CampaignSideForgeTab state={campaignState} />),
  tab("tab-questChains", <CampaignQuestChainsTab state={campaignState} />),
  tab("tab-oracleForge", <CampaignOracleForgeTab state={campaignState} />),
  tab("tab-battleSets", <CampaignBattleSetsTab state={campaignState} />),
  tab("tab-mapSeeds", <CampaignMapSeedsTab state={campaignState} />),
  tab("tab-inventory", <CampaignInventoryTab state={campaignState} />),
  tab("tab-shops", <CampaignShopsTab state={campaignState} />),
  tab("tab-craft", <CampaignCraftTab state={campaignState} />),
  tab("tab-cook", <CampaignCookTab state={campaignState} />),
  tab("tab-farm", <CampaignFarmTab state={farmState} />),
  tab("tab-relationships", <CampaignRelationshipsTab state={campaignState} />),
  tab("tab-worldGate", <CampaignWorldGateTab state={campaignState} />),
  tab("tab-storyHome", <CampaignStoryHomeTab state={campaignState} />),
  tab("tab-storySummary", <CampaignStorySummaryTab state={campaignState} />),
  tab("tab-storyDirector", <CampaignStoryDirectorTab state={campaignState} />),
  tab("tab-questHome", <CampaignQuestHomeTab state={campaignState} />),
  tab("tab-quests", <CampaignQuestsPanelTab state={campaignState} />),
  tab("tab-eventHome", <CampaignEventHomeTab state={campaignState} />),
  tab("tab-eventCharacter", <CampaignEventCharacterTab state={campaignState} />),
  tab("tab-eventSpecial", <CampaignEventSpecialTab state={campaignState} />),
  tab("tab-eventSide", <CampaignEventSideTab state={campaignState} />),
  tab("tab-eventLog", <CampaignEventLogTab state={campaignState} />),
  tab("tab-scenarios", <CampaignScenariosTab state={campaignState} />),
  tab("tab-maps", <CampaignMapsTab state={campaignState} />),
  tab("tab-minigameTest", <CampaignMinigameTestTab state={campaignState} />),
  tab("tab-overview", <CampaignOverviewTab state={campaignState} />),

  // Leaf branch variants the shared fixture doesn't otherwise pin.
  tab("leaf-questrow-active", <QuestRow row={getQuestRowData(fixtureQuests.q_relic)} />),
  tab("leaf-questrow-resolved", <QuestRow row={getQuestRowData(fixtureQuests.q_bandits, { resolved: true })} />),
  // Farm focus-bonus QTE window (active) — the CSS-animated lane structure.
  tab("leaf-farm-qte", <CampaignFarmTab state={farmQteState} />),
  // Story beat modal body (Part B) — pins the `is-modal` card variant + hint
  // that only the imperative modal renders (no tab covers it). Reuses the same
  // beat fixture the storyDirector tab's last card does.
  tab("leaf-storybeat-modal", <StoryBeatModalBody data={storyDirectorCardData(directorSnapshot.last)!} onChoose={() => undefined} />)
];
