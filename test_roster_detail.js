// test_roster_detail.js — Phase K.3.2 roster detail-row regression guard.
//
// The skills / passives / statuses / equipment cards are JSX
// (`<RosterDetailRow>`, RosterDetail.tsx) reading typed RosterDetailData
// (rosterDetail.ts). Their byte-parity with the original cui-party-tab.js
// HTML island was PROVEN in the prior commit (this test compared the JSX to
// the live island for empty + rich members and matched). That island detail
// renderer is now deleted (the roster tab + party-sheet modal both render the
// JSX), so this test becomes a golden-file regression guard: it runs the REAL
// data builder against a controlled engine stub (empty + rich members),
// renders the JSX, and compares to the committed golden HTML captured from
// that proven-correct output. A change to rosterDetail.ts or RosterDetail.tsx
// that alters the DOM fails here; intended changes re-capture with --update.
//
// Run: node test_roster_detail.js            (verify)
//      node test_roster_detail.js --update    (re-capture goldens)

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadEngineSource } = require("./tools/test/engine-source.cjs");

const UPDATE = process.argv.includes("--update");
const GOLDEN_DIR = path.join(__dirname, "tools/roster-detail-golden");

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) {
    pass += 1;
    console.log("  OK  " + label + (info ? " (" + info + ")" : ""));
  } else {
    fail += 1;
    console.log("  XX  " + label + (info ? " (" + info + ")" : ""));
  }
}

console.log("Campaign roster detail-row regression guard (Phase K.3.2)");

// ── Harness: env + real utils + UIIcons (no island needed) ──────────────────
const env = require("./tools/visual-regression/env.cjs").installEnv();
vm.runInThisContext(loadEngineSource("ui/ui-icons"), {
  filename: "ui-icons.ts"
});

const { createLoader } = require("./tools/visual-regression/load-tsx.cjs");
const { load } = createLoader();
const SRC = path.join(__dirname, "src/campaign");

// Real TS leaf utils the data builder + component import (cui-utils / cui-modals
// / cui-equipment). No cui-party-tab.js island — the JSX path is independent.
for (const m of ["cui-utils", "cui-modals", "cui-equipment"]) {
  load(path.join(SRC, "util", `${m}.ts`));
}

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { getRosterDetailData } = load(path.join(SRC, "tabs/data/rosterDetail.ts"));
const { RosterDetailRow } = load(path.join(SRC, "tabs/RosterDetail.tsx"));

ok("getRosterDetailData is a function", typeof getRosterDetailData === "function");
ok("RosterDetailRow is a component", typeof RosterDetailRow === "function");

function squash(html) {
  return String(html)
    .replace(/<link[^>]*rel="preload"[^>]*\/?>/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function renderDetail(id, member) {
  return squash(renderToStaticMarkup(React.createElement(RosterDetailRow, { data: getRosterDetailData(id, member) })));
}

function checkGolden(name, actual) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  const file = path.join(GOLDEN_DIR, `${name}.html`);
  if (UPDATE) {
    fs.writeFileSync(file, actual + "\n", "utf8");
    console.log(`  ++  wrote golden ${name}.html`);
    return;
  }
  if (!fs.existsSync(file)) {
    ok(`golden ${name}.html exists`, false, "run with --update to capture");
    return;
  }
  const expected = fs.readFileSync(file, "utf8").trim();
  ok(`${name}: matches committed golden`, actual === expected,
     actual === expected ? "" : "\n  actual: " + actual + "\n  golden: " + expected);
}

function baseEngine() {
  env.CJS.CONST = {
    STATUS_DEFINITIONS: { burn: { name: "Burn", description: "Taking fire damage." } }
  };
}

// ── Scenario 1: empty member (no Formulas — matches the VR fixture) ──────────
baseEngine();
env.CJS.Formulas = undefined;
const emptyMember = {
  name: "Lyra", baseCharacterId: "lyra",
  equipmentSlots: { weapon: null, armor: null, accessory1: null, accessory2: null },
  equipment: [], equippedSkills: [], equippedPassives: [],
  learnedSkills: [], learnedPassives: [], skillProgress: {}, passiveProgress: {}, statuses: []
};
env.CJS.DataStore = { get: () => null, getAll: () => ({}), getAllAsArray: () => [] };
env.CJS.CampaignState = { getState: () => ({ party: { char_lyra: emptyMember }, currentWorld: "haven" }) };

{
  const actual = renderDetail("char_lyra", emptyMember);
  checkGolden("roster-detail-empty", actual);
  ok("empty: renders the four cards",
     /campaign-roster-skills/.test(actual) && /campaign-roster-passives/.test(actual) &&
     /campaign-roster-statuses/.test(actual) && /campaign-roster-equipment/.test(actual));
  ok("empty: equipment shows 4 empty slots",
     (actual.match(/campaign-equipment-line/g) || []).length === 4);
  ok("empty: no skill slot grid (no Formulas)", !/campaign-slot-grid/.test(actual));
}

// ── Scenario 2: rich member (filled slots, known rows, status, equipment) ────
baseEngine();
const richMember = {
  name: "Bram", baseCharacterId: "bram_base", currentJob: null,
  equipmentSlots: { weapon: "it_sword", armor: null, accessory1: null, accessory2: null },
  equipment: [],
  equippedSkills: ["sk_slash"], equippedPassives: ["ps_tough"],
  learnedSkills: ["sk_slash"], learnedPassives: ["ps_tough"],
  skillProgress: { sk_slash: { ap: 5, level: 2 } }, passiveProgress: { ps_tough: { rank: 1 } },
  skillSlots: 2, passiveSlots: 2, skillPoints: 3, passivePoints: 3,
  statuses: [{ id: "burn", duration: 3, stacks: 2, notes: "Searing." }]
};
const records = {
  characters: { bram_base: { id: "bram_base", name: "Bram", stats: { STR: 10, DEX: 8, INT: 4 }, skills: [] } },
  skills: {
    sk_slash: { id: "sk_slash", name: "Slash", icon: "⚔️", ap: 2, mp: 0, range: 1, power: 30, description: "A clean slash.", category: "attack" },
    sk_guard: { id: "sk_guard", name: "Guard", icon: "🛡️", ap: 1, mp: 0, description: "Brace up.", category: "defense" }
  },
  passives: { ps_tough: { id: "ps_tough", name: "Toughness", icon: "💪", trigger: "stat_mod", description: "Raise DEF." } },
  items: { it_sword: { id: "it_sword", name: "Iron Sword", icon: "🗡️", rarity: "common", type: "weapon", slot: "weapon", description: "A basic blade." } }
};
env.CJS.DataStore = {
  get: (bucket, id) => (records[bucket] && id ? records[bucket][id] || null : null),
  getAll: () => ({}),
  getAllAsArray: (bucket) => Object.values(records[bucket] || {})
};
env.CJS.CampaignState = {
  getState: () => ({ party: { char_bram: richMember }, currentWorld: "haven" }),
  skillPoolIds: () => ["sk_slash", "sk_guard"],
  passivePoolIds: () => ["ps_tough"]
};
env.CJS.Formulas = {
  calcEffectiveSkillSlots: () => 2,
  calcEffectivePassiveSlots: () => 2,
  calcEffectiveSkillPoints: () => 3,
  calcEffectivePassivePoints: () => 3,
  calcEquippedSpCost: (arr) => arr.length,
  calcSpCost: () => 1,
  getSkillMaxLevel: () => 5,
  calcSkillApToNextLevel: () => 10,
  getEarnedSkillPerks: () => [{ level: 2, description: "Bleed on hit." }],
  getNextSkillPerk: () => ({ level: 3, description: "Wider arc." }),
  getPassiveMaxRank: () => 5,
  calcPassiveRankCost: () => ({ gold: 10 }),
  getEarnedPassiveRankPerks: () => [{ rank: 1, description: "+5 DEF." }],
  getNextPassiveRankPerk: () => ({ rank: 2, description: "+10 DEF." })
};

{
  const actual = renderDetail("char_bram", richMember);
  checkGolden("roster-detail-rich", actual);
  // Spot checks so a passing equality isn't a both-empty false positive.
  ok("rich: skill slot grid present", /campaign-slot-grid/.test(actual));
  ok("rich: filled skill slot shows name", /campaign-slot filled/.test(actual) && /Slash/.test(actual));
  ok("rich: empty skill slot present (slotCap 2 > 1 equipped)", /campaign-slot empty/.test(actual));
  ok("rich: known skill row with perks", /Bleed on hit\./.test(actual) && /Wider arc\./.test(actual));
  ok("rich: equipped skill badge (checkmark)", /✓ Slash/.test(actual));
  ok("rich: pooled-but-unequipped skill (empty box)", /☐ Guard/.test(actual));
  ok("rich: passive rank-up perks", /\+5 DEF\./.test(actual) && /\+10 DEF\./.test(actual));
  ok("rich: status row rendered", /Burn/.test(actual) && /stacks 2/.test(actual));
  ok("rich: equipped item in equipment card", /Iron Sword/.test(actual));
  ok("rich: glyph icon span present", /cjs-icon cjs-icon-md cjs-icon-skill/.test(actual));
}

console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
