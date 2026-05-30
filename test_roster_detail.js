// test_roster_detail.js — Phase K.3.2 roster detail-row JSX port.
//
// The skills / passives / statuses / equipment cards moved from the
// `cui-party-tab.js` HTML island (`rosterMemberData().detailCardsHtml`) to
// JSX (`<RosterDetailRow>`, RosterDetail.tsx) reading typed RosterDetailData
// (rosterDetail.ts). This test is the parity oracle the VR fixture can't be:
// it renders the JSX and compares it to the LIVE island output for BOTH an
// empty member (matches the VR fixture) AND a rich member (filled slots,
// known skill/passive rows with perks, statuses, equipped item) — states the
// VR stub (no Formulas) never reaches.
//
// Both renderers read the SAME engine stub (window.CJS.{Formulas,DataStore,
// CampaignState,CONST}) + the SAME real TS utils + UIIcons, so any divergence
// is a porting bug. Action wiring differs by design (the island stamps
// data-campaign-action / data-id / data-slot; the JSX uses onClick), so those
// attributes are normalized away before the comparison — the visible DOM
// (structure, text, classes, titles, icons) must match exactly.
//
// Run: node test_roster_detail.js

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

console.log("Campaign roster detail-row parity tests (Phase K.3.2)");

// ── Harness: env + real utils + UIIcons + the island ────────────────────────
const env = require("./tools/visual-regression/env.cjs").installEnv();
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "js/ui/ui-icons.js"), "utf8"), {
  filename: "ui-icons.js"
});

const { createLoader } = require("./tools/visual-regression/load-tsx.cjs");
const { load } = createLoader();
const SRC = path.join(__dirname, "src/campaign");

// Real TS leaf utils install CampaignUIInternal.{Utils,Portraits,Modals,Equipment}.
for (const m of ["cui-utils", "cui-portraits", "cui-modals", "cui-equipment"]) {
  load(path.join(SRC, "util", `${m}.ts`));
}
// The island (still-JS) attaches PartyTab.rosterMemberData.
load(path.join(__dirname, "js/campaign/ui/tabs/cui-party-tab.js"));

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { getRosterDetailData } = load(path.join(SRC, "tabs/data/rosterDetail.ts"));
const { RosterDetailRow } = load(path.join(SRC, "tabs/RosterDetail.tsx"));

ok("getRosterDetailData is a function", typeof getRosterDetailData === "function");
ok("RosterDetailRow is a component", typeof RosterDetailRow === "function");

const PartyTab = env.CJS.CampaignUIInternal.PartyTab;
ok("island PartyTab.rosterMemberData present", typeof PartyTab?.rosterMemberData === "function");

// ── Normalizer: strip the action-wiring attributes + React preload hints ─────
function normalize(html) {
  return String(html)
    .replace(/\sdata-campaign-action="[^"]*"/g, "")
    .replace(/\sdata-id="[^"]*"/g, "")
    .replace(/\sdata-skill-id="[^"]*"/g, "")
    .replace(/\sdata-passive-id="[^"]*"/g, "")
    .replace(/\sdata-slot="[^"]*"/g, "")
    .replace(/<link[^>]*rel="preload"[^>]*\/?>/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/\s+>/g, ">")
    .trim();
}

function islandHtml(id, member) {
  // The island returns the 4 cards WITHOUT the grid wrapper; <RosterDetailRow>
  // owns the wrapper, so wrap the island output to match.
  const d = PartyTab.rosterMemberData(id, member);
  return `<div class="campaign-roster-detail-row">${d.detailCardsHtml}</div>`;
}
function jsxHtml(id, member) {
  return renderToStaticMarkup(React.createElement(RosterDetailRow, { data: getRosterDetailData(id, member) }));
}

// Common stubs both renderers + rosterMemberData's hero/vitals path need.
function baseEngine() {
  env.CJS.CampaignCombatBridge = { isMemberBattleReady: () => true, availabilityLabel: () => "Ready" };
  env.CJS.CONST = {
    STATS: ["STR", "DEX", "INT"],
    STAT_NAMES: { STR: "Strength", DEX: "Dexterity", INT: "Intellect" },
    ELEMENTS: ["Physical", "Fire", "Water"],
    STATUS_DEFINITIONS: { burn: { name: "Burn", description: "Taking fire damage." } }
  };
}

// ── Scenario 1: empty member (matches the VR fixture — no Formulas) ──────────
baseEngine();
env.CJS.Formulas = undefined;
const emptyMember = {
  name: "Lyra", baseCharacterId: "lyra", level: 12, xp: 100, rank: "B",
  currentHp: 10, maxHp: 20, currentMp: 5, maxMp: 10,
  equipmentSlots: { weapon: null, armor: null, accessory1: null, accessory2: null },
  equipment: [], equippedSkills: [], equippedPassives: [],
  learnedSkills: [], learnedPassives: [], skillProgress: {}, passiveProgress: {},
  statuses: [], statOverrides: {}, resist: [], weak: [], immune: []
};
env.CJS.DataStore = { get: () => null, getAll: () => ({}), getAllAsArray: () => [] };
env.CJS.CampaignState = { getState: () => ({ party: { char_lyra: emptyMember }, currentWorld: "haven" }) };

{
  const expected = normalize(islandHtml("char_lyra", emptyMember));
  const actual = normalize(jsxHtml("char_lyra", emptyMember));
  ok("empty member: JSX detail row matches island", actual === expected, actual === expected ? "" : "\n  JSX:    " + actual + "\n  island: " + expected);
  ok("empty member: renders the four cards",
     /campaign-roster-skills/.test(actual) && /campaign-roster-passives/.test(actual) &&
     /campaign-roster-statuses/.test(actual) && /campaign-roster-equipment/.test(actual));
  ok("empty member: equipment shows 4 empty slots",
     (actual.match(/campaign-equipment-line/g) || []).length === 4);
  ok("empty member: no skill slot grid (no Formulas)", !/campaign-slot-grid/.test(actual));
}

// ── Scenario 2: rich member (filled slots, known rows, status, equipment) ────
baseEngine();
const richMember = {
  name: "Bram", baseCharacterId: "bram_base", level: 9, xp: 50, rank: "C",
  currentHp: 30, maxHp: 30, currentMp: 8, maxMp: 8, currentJob: null,
  equipmentSlots: { weapon: "it_sword", armor: null, accessory1: null, accessory2: null },
  equipment: [],
  equippedSkills: ["sk_slash"], equippedPassives: ["ps_tough"],
  learnedSkills: ["sk_slash"], learnedPassives: ["ps_tough"],
  skillProgress: { sk_slash: { ap: 5, level: 2 } }, passiveProgress: { ps_tough: { rank: 1 } },
  skillSlots: 2, passiveSlots: 2, skillPoints: 3, passivePoints: 3,
  statuses: [{ id: "burn", duration: 3, stacks: 2, notes: "Searing." }],
  statOverrides: {}, resist: [], weak: [], immune: []
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
// Deterministic Formulas — both the island and the TS builder read these, so
// the exact return values don't matter as long as they're identical for both.
env.CJS.Formulas = {
  calcCharXpToNextLevel: () => 200,
  effectiveRank: (rank) => rank,
  nextRank: () => "B",
  rpThresholdFor: () => 100,
  getJobMaxLevel: () => 10,
  calcJobXpToNextLevel: () => 50,
  calcPhysicalDR: () => 5,
  calcMagicDR: () => 3,
  calcChaosDR: () => 1,
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
  const expected = normalize(islandHtml("char_bram", richMember));
  const actual = normalize(jsxHtml("char_bram", richMember));
  ok("rich member: JSX detail row matches island", actual === expected, actual === expected ? "" : "\n  JSX:    " + actual + "\n  island: " + expected);
  // Spot checks so a passing equality isn't a both-empty false positive.
  ok("rich member: skill slot grid present", /campaign-slot-grid/.test(actual));
  ok("rich member: filled skill slot shows icon + name", /campaign-slot filled/.test(actual) && /Slash/.test(actual));
  ok("rich member: empty skill slot present (slotCap 2 > 1 equipped)", /campaign-slot empty/.test(actual));
  ok("rich member: known skill row with perks", /Bleed on hit\./.test(actual) && /Wider arc\./.test(actual));
  ok("rich member: equipped skill badge (checkmark)", /✓ Slash/.test(actual));
  ok("rich member: pooled-but-unequipped skill (empty box)", /☐ Guard/.test(actual));
  ok("rich member: passive rank-up perks", /\+5 DEF\./.test(actual) && /\+10 DEF\./.test(actual));
  ok("rich member: status row rendered", /Burn/.test(actual) && /stacks 2/.test(actual));
  ok("rich member: equipped item in equipment card", /Iron Sword/.test(actual));
  ok("rich member: icon span present (glyph)", /cjs-icon cjs-icon-md cjs-icon-skill/.test(actual));
}

console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
