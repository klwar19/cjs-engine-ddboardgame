#!/usr/bin/env node
// build-ai-briefs.mjs — Generate per-type "AI brief" markdown into
// data/ai-briefs/. Each brief describes the contract the schema enforces
// (required fields pulled straight from the schema), a guaranteed-valid
// ~200-token example (the author scaffold), and the commands to author it.
//
// Briefs are GENERATED so they never drift from the schema — re-run after a
// schema change (it's wired into `npm test` via test_content_lint.js as a
// regenerate-clean check).
//
//   node tools/build-ai-briefs.mjs                 # writes data/ai-briefs/
//   node tools/build-ai-briefs.mjs --out /tmp/foo  # writes elsewhere (tests)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSchemaByName } from "./lib/content-schema.mjs";
import { TYPES, SCAFFOLDS, scopeFor, envelopeFor, pathPatternFor } from "./lib/content-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx >= 0
  ? path.resolve(process.cwd(), process.argv[outIdx + 1])
  : path.join(root, "data/ai-briefs");
fs.mkdirSync(outDir, { recursive: true });

// Which compact AI index pairs with each type (for the "read this first" link).
const COMPACT = {
  skills: "skills", passives: "passives", statuses: "statuses",
  items: "items", materials: "items", food: "items",
  characters: "characters", monsters: "monsters", encounters: "encounters",
  campaignQuests: "campaignQuests", campaignEvents: "campaignEvents",
  oracleTables: "oracleTables", travelMaps: "travelMaps",
  worldActivityPacks: "worldActivities", storyDirectorPacks: "storyDirector"
};

// Hand-written authoring guidance — the wisdom the schema can't express.
const GUIDANCE = {
  skills: "`power` is the base; `scalingStat` (S/P/E/C/I/A/L) picks the stat it scales with. Reuse existing `element` / `damageType` / status ids from the compact indexes. Ultimate skills set `isUltimate: true` + `ultimateCost`. `effects` are master-effect refs (`{ effectId, overrides }`) or inline `{ type, ... }`.",
  passives: "Keep effects as master-effect refs where possible. `ranks` lets a passive scale with invested points.",
  statuses: "`category` is buff/debuff/neutral/environment. `tickEffect` runs each turn; `onApplyEffects` / `onRemoveEffects` fire at the edges. Use `maxStacks` + `defaultDuration` for stacking DoTs/buffs.",
  items: "Equipment sets `slot` (weapon/armor/accessory) + `stats`; consumables carry `effects`. Reuse `rarity` tiers and reference real status/effect ids.",
  materials: "Crafting inputs — usually just id/name/rarity/tags. They are referenced by crafting recipes and activity/quest reward ops.",
  food: "Cookable ingredients and dishes. Dishes carry `effects`; ingredients are plain. Referenced by the cooking minigame and farm crops.",
  characters: "Playable/NPC units. `team` is player/enemy/neutral. `stats` is the S/P/E/C/I/A/L block (E≈HP). `skills` and `innatePassives` reference existing ids; `ultimateSkillId` sets the ultimate.",
  monsters: "Same shape as characters but enemy-side. Set `weak` / `resist` / `immune` elements, a `behaviorAI` archetype, and `loot`. Reference real skill ids in `skills`.",
  encounters: "A grid battle. `grid` is `height` rows × `width` cols of cell-type strings; `units` place character/monster ids at `[x, y]`. Keep unit ids pointing at real combatants. `objectives` define win/lose beyond elimination.",
  campaignQuests: "Each set bundles `templates`. Objectives advance via `progressTriggers` (tag-matched battle outcomes — `requiresAnyTags` like `defeated_tag:wolf`). `rewards` / `failureConsequence` are campaign ops. `linkedScenario` / `battleSetIds` / `linkedMapNodes` reference existing scenario / battle-set / travel-node ids. `repeat.variants` make a quest re-rollable.",
  campaignEvents: "A weighted table; inner `entries` are rolled by `weight`. `suggested` are campaign ops the GM can apply. `requiresParty` gates an event on a party member; `settings` / `locationKinds` gate on context. Link `oracleTableId` to deepen an event.",
  oracleTables: "`tables` are keyword banks the oracle composes (adjectives/nouns/verbs/objects/twists); `prompts` are pre-written results. No runtime AI — the GM/solo loop rolls and decides. `canonRisk` (green/yellow/red) gates how freely a result becomes canon.",
  travelMaps: "A clickable node-and-link map. `nodes` carry `x`/`y` on the `canvas`; `links` connect node ids with `route`/`time`/`risk`. Node `people` / `actions` run campaign `ops` on click. `visualLayers` are decorative SVG; `visualBackdropPrompt` is the art brief.",
  worldActivityPacks: "Location-bound loops (scavenge/build/etc.). Each `activity` lists `locationIds` (travel-map node ids), an optional `cost` bucket, and `ops` on use. `conditions.requiresMilestones` gates availability; `conditions.any` is an OR-group.",
  storyDirectorPacks: "Arc guidance for solo/GM play. `stages` map to chapter ranges; rollable beats (`sceneBeats`, `periInterruptions`, `memoryShards`, `pressureTicks`) carry a `prompt` + `suggestedChoices` (each a label + campaign `ops`). `protectedTruths` mark reveals that must stay red until promoted. `metrics` are the trackable arc pressures."
};

// ── Resolve the top-level entry definition from a schema ───────────
function entryDefOf(schema) {
  const pick = (s) => s && s.properties && s.properties.entries && s.properties.entries.items;
  let item = pick(schema);
  if (!item && Array.isArray(schema.anyOf)) {
    for (const sub of schema.anyOf) { item = pick(sub); if (item) break; }
  }
  if (!item) return null;
  if (item.$ref && item.$ref.startsWith("#/")) {
    let cur = schema;
    for (const p of item.$ref.slice(2).split("/")) cur = cur && cur[p];
    return cur || null;
  }
  return item;
}

function fieldType(prop) {
  if (!prop || typeof prop !== "object") return "any";
  if (prop.enum) return prop.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (prop.const !== undefined) return JSON.stringify(prop.const);
  if (prop.$ref) return prop.$ref.split("/").pop();
  if (Array.isArray(prop.type)) return prop.type.join(" | ");
  if (prop.type === "array") {
    const it = prop.items || {};
    const inner = it.$ref ? it.$ref.split("/").pop() : (it.type || "any");
    return `${inner}[]`;
  }
  return prop.type || "object";
}

function briefFor(type, cfg) {
  const { schema } = loadSchemaByName(cfg.schema);
  const def = entryDefOf(schema) || {};
  const required = def.required || [];
  const props = def.properties || {};
  const requiredSet = new Set(required);
  const optional = Object.keys(props).filter((k) => !requiredSet.has(k));
  const scope = scopeFor(cfg, { world: cfg.kind === "core" ? undefined : "<world>" });
  const example = { _file: envelopeFor(cfg, { world: cfg.kind === "core" ? undefined : "<world>" }), entries: [SCAFFOLDS[type]({ world: "<world>" })] };

  const reqLines = required.length
    ? required.map((k) => `- \`${k}\`: ${fieldType(props[k])}`).join("\n")
    : "- (none beyond a unique `id`)";
  const optLines = optional.length
    ? optional.map((k) => `\`${k}\``).join(", ")
    : "(none)";

  const fileFlag = cfg.kind === "campaign" ? " --file <name>" : "";
  const worldFlag = scope === "world" ? " --world <world>" : "";

  const opNote = cfg.usesOps
    ? "\n- **Ops** (`rewards` / `ops` / `suggested` / `failureConsequence`): `{ \"op\": \"<verb>\", ...payload }`. The engine's CampaignOps registry is the authority for which verbs exist — the schema only checks `op` is a non-empty string. Common verbs are listed in `data/schemas/README.md`."
    : "";

  return `# ${cfg.label} — AI authoring brief

${schema.description || ""}

| | |
| --- | --- |
| **Type** | \`${type}\` |
| **Category** | \`${cfg.category}\` |
| **Scope** | ${scope} |
| **Lives in** | \`${pathPatternFor(cfg)}\` |
| **Schema** | \`data/schemas/${cfg.schema}\` |
| **Existing ids** | \`data/ai-index/${COMPACT[type]}.compact.json\` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase \`snake_case\` (\`^[a-z][a-z0-9_]*$\`), unique within a file.
- **Required fields** (top-level entry):
${reqLines}
- **Other fields**: ${optLines}${opNote}

${GUIDANCE[type] || ""}

## Example (valid — \`npm run author -- ${type} scaffold\`)

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

## Author it

\`\`\`bash
# Validate (no write):
echo '<entry json>' | npm run author -- ${type} validate${worldFlag}
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- ${type} add${worldFlag}${fileFlag}
\`\`\`

Or scaffold → edit → add:
\`\`\`bash
npm run author -- ${type} scaffold${worldFlag} > /tmp/${type}.json
npm run author -- ${type} add${worldFlag}${fileFlag} --in /tmp/${type}.json
\`\`\`
`;
}

// ── Write briefs + index ───────────────────────────────────────────
const written = [];
for (const [type, cfg] of Object.entries(TYPES)) {
  const md = briefFor(type, cfg);
  const file = path.join(outDir, `${type}.md`);
  fs.writeFileSync(file, md);
  written.push(type);
}

const readme = `# AI authoring briefs

One brief per authorable content type. Each describes the contract its schema
enforces (required fields are pulled straight from the schema), a
guaranteed-valid example, and the \`npm run author\` commands to create it.

**These files are generated** by \`tools/build-ai-briefs.mjs\` from
\`data/schemas/*\` + the authoring registry — do not edit by hand; re-run
\`npm run content:briefs\` after a schema change.

An AI generator's context for a type = this brief + the matching compact index
in \`data/ai-index/\`. That is enough to produce a valid patch/entry without the
full multi-megabyte content tree.

## Briefs

${Object.entries(TYPES).map(([t, c]) => `- [\`${t}\`](${t}.md) — ${c.label} (\`${c.category}\`)`).join("\n")}

## Shared conventions

- Every content file is \`{ "_file": { version, format, scope, world?, category, status }, "entries": [ … ] }\`.
- IDs are lowercase \`snake_case\` and unique within a file.
- \`canonRisk\` is \`green\` | \`yellow\` | \`red\` (how freely a result becomes canon).
- Campaign **ops** are \`{ "op": "<verb>", ...payload }\`; the engine's CampaignOps
  registry owns the verb list (see \`data/schemas/README.md\`).
- Validate anything with \`npm run content:lint -- --patch <file>\` or
  \`npm run author -- <type> validate\`.
`;
fs.writeFileSync(path.join(outDir, "README.md"), readme);

process.stdout.write(`build-ai-briefs: wrote ${written.length} briefs + README → ${path.relative(root, outDir)}\n`);
