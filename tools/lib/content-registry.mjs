// content-registry.mjs — The single registry of authorable content types:
// where each lives, which schema validates it, its `_file` envelope, and a
// schema-valid scaffold. Shared by the authoring CLI (tools/author) and the
// AI-brief generator (tools/build-ai-briefs.mjs) so a type is described in
// exactly one place.

// ── Scaffolds (each is a schema-valid starter entry) ───────────────
function grid(w, h, cell = "empty") {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => cell));
}

export const SCAFFOLDS = {
  skills: () => ({
    id: "new_skill", name: "New Skill", description: "What the skill does.",
    power: 10, ap: 1, mp: 0, damageType: "Physical", element: "Physical",
    scalingStat: "S", range: 1, aoe: null, tags: ["new"]
  }),
  passives: () => ({ id: "new_passive", name: "New Passive", description: "What the passive does.", tags: ["new"] }),
  statuses: () => ({ id: "new_status", name: "New Status", desc: "What the status does.", category: "buff", maxStacks: 1, defaultDuration: 2, tags: ["new"] }),
  items: () => ({ id: "new_item", name: "New Item", description: "What the item does.", rarity: "common", slot: "consumable", tags: ["new"] }),
  materials: () => ({ id: "new_material", name: "New Material", description: "A crafting material.", rarity: "common", tags: ["material"] }),
  food: () => ({ id: "new_food", name: "New Food", description: "A cookable ingredient or dish.", rarity: "common", tags: ["food"] }),
  characters: () => ({ id: "new_character", name: "New Character", team: "player", rank: "F", stats: { S: 5, P: 5, E: 6, C: 5, I: 5, A: 5, L: 5 }, skills: [], tags: ["new"] }),
  monsters: () => ({ id: "new_monster", name: "New Monster", team: "enemy", rank: "F", stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 }, skills: [], weak: [], resist: [], tags: ["new"] }),
  encounters: () => ({ id: "new_encounter", name: "New Encounter", width: 6, height: 6, grid: grid(6, 6), units: [{ id: "new_monster", pos: [2, 2] }] }),
  campaignQuests: (o) => ({
    id: "new_quest_set", name: "New Quest Set", world: o.world,
    templates: [{
      id: "new_quest", title: "New Quest", status: "idea", giver: "Quest Giver",
      summary: "One-line pitch for the quest.",
      objectives: [{ id: "obj_one", label: "Do the first thing", current: 0, required: 1 }],
      rewards: [{ op: "give_jp", amount: 1 }],
      tags: ["new"]
    }]
  }),
  campaignEvents: (o) => ({
    id: "new_event_table", name: "New Event Table", world: o.world,
    tags: ["new"], settings: ["town"],
    entries: [{
      weight: 10, id: "new_event", type: "social", title: "New Event",
      prompt: "A short description of what the party encounters.",
      suggested: [{ op: "log", text: "Something happened." }]
    }]
  }),
  oracleTables: (o) => ({
    id: "new_oracle", name: "New Oracle", world: o.world, defaultCanonRisk: "green",
    tables: { adjectives: ["cracked", "warm"], nouns: ["bell", "lantern"], verbs: ["remembers", "follows"] },
    prompts: [{ id: "new_prompt", text: "The cracked bell remembers something it should not.", suggestedUse: "Travel omen.", canonRisk: "green", tags: ["omen"] }]
  }),
  travelMaps: (o) => ({
    id: "new_travel_map", name: "New Travel Map", world: o.world,
    defaultLocationId: "loc_start", canvas: { width: 760, height: 430 },
    nodes: [
      { id: "loc_start", name: "Start", type: "base", x: 120, y: 200, description: "Where the route begins." },
      { id: "loc_next", name: "Next Stop", type: "scavenge", x: 420, y: 200, description: "The first place worth visiting." }
    ],
    links: [{ from: "loc_start", to: "loc_next", route: "road", time: 1, risk: "low" }]
  }),
  worldActivityPacks: (o) => ({
    id: "new_activity_pack", name: "New Activity Pack", version: 1, world: o.world,
    activities: [{
      id: "new_activity", type: "scavenge", title: "New Activity",
      locationIds: ["loc_start"], summary: "What the player does here.",
      buttonLabel: "Do It", rewardText: "materials +1",
      ops: [{ op: "give_material", id: "some_material", qty: 1 }]
    }]
  }),
  storyDirectorPacks: (o) => ({
    id: "new_story_director", name: "New Story Director", version: 1, world: o.world,
    summary: "Arc guidance for this world.", defaultCanonRisk: "green",
    stages: [{ id: "stage_one", name: "Opening", chapterMin: 1, chapterMax: 1, summary: "How the arc opens.", tags: ["intro"] }],
    sceneBeats: [{
      id: "beat_one", title: "Opening Beat", stageIds: ["stage_one"],
      canonRisk: "green", weight: 10, tags: ["intro"],
      prompt: "Something story-shaped the GM/solo player can drop in.",
      suggestedChoices: [{ label: "An option", ops: [{ op: "give_jp", amount: 1 }] }]
    }]
  })
};

// ── Type registry ──────────────────────────────────────────────────
// kind: core (universal or world), coreWorldOnly, system, campaign.
// usesOps: the entry carries free-form campaign ops (rewards/ops/suggested).
export const TYPES = {
  skills: { schema: "skills.schema.json", category: "skills", kind: "core", filename: "skills.json", label: "Skills" },
  passives: { schema: "passives.schema.json", category: "passives", kind: "core", filename: "passives.json", label: "Passives" },
  items: { schema: "items.schema.json", category: "items", kind: "core", filename: "items.json", label: "Items" },
  materials: { schema: "items.schema.json", category: "materials", kind: "core", filename: "materials.json", label: "Materials" },
  food: { schema: "items.schema.json", category: "food", kind: "core", filename: "food.json", label: "Food" },
  characters: { schema: "monsters.schema.json", category: "characters", kind: "core", filename: "characters.json", label: "Characters" },
  monsters: { schema: "monsters.schema.json", category: "monsters", kind: "coreWorldOnly", filename: "monsters.json", label: "Monsters" },
  encounters: { schema: "encounters.schema.json", category: "encounters", kind: "coreWorldOnly", filename: "encounters.json", label: "Encounters" },
  statuses: { schema: "statuses.schema.json", category: "statuses", kind: "system", filename: "statuses.json", relDir: "data/system", label: "Statuses" },
  campaignQuests: { schema: "campaignQuests.schema.json", category: "campaignQuests", kind: "campaign", subdir: "quests", ext: ".json", usesOps: true, label: "Campaign quests" },
  campaignEvents: { schema: "campaignEvents.schema.json", category: "campaignEvents", kind: "campaign", subdir: "events", ext: ".table.json", usesOps: true, label: "Campaign event tables" },
  oracleTables: { schema: "oracleTables.schema.json", category: "oracleTables", kind: "campaign", subdir: "oracles", ext: ".json", label: "Oracle tables" },
  travelMaps: { schema: "travelMaps.schema.json", category: "travelMaps", kind: "campaign", subdir: "travel_maps", ext: ".json", usesOps: true, label: "Travel maps" },
  worldActivityPacks: { schema: "worldActivityPacks.schema.json", category: "worldActivityPacks", kind: "campaign", subdir: "activity_packs", ext: ".json", usesOps: true, label: "World activity packs" },
  storyDirectorPacks: { schema: "storyDirectorPacks.schema.json", category: "storyDirectorPacks", kind: "campaign", subdir: "story_director", ext: ".json", usesOps: true, label: "Story director packs" }
};

export function scopeFor(cfg, opts = {}) {
  if (cfg.kind === "system") return "system";
  if (cfg.kind === "campaign" || cfg.kind === "coreWorldOnly") return "world";
  return opts.world ? "world" : "universal"; // core
}

export function envelopeFor(cfg, opts = {}) {
  const scope = scopeFor(cfg, opts);
  const env = { version: 1, format: "cjs-collection", scope };
  // Only stamp `world` when we actually have one — a literal `world: undefined`
  // would otherwise trip the envelope's string check.
  if (scope === "world" && opts.world) env.world = opts.world;
  env.category = cfg.category;
  env.status = "active";
  return env;
}

// Where this type's files live (for docs / briefs).
export function pathPatternFor(cfg) {
  if (cfg.kind === "campaign") return `data/campaigns/<world>/${cfg.subdir}/*${cfg.ext}`;
  if (cfg.kind === "system") return `${cfg.relDir}/${cfg.filename}`;
  if (cfg.kind === "coreWorldOnly") return `data/worlds/<world>/${cfg.filename}`;
  return `data/universal/${cfg.filename} or data/worlds/<world>/${cfg.filename}`;
}
