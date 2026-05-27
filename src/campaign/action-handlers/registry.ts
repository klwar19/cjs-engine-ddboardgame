// registry.ts — Phase H.3 campaign action registry.
//
// Each entry here replaces a `case` in the vanilla `_handleAction`
// switch in `js/campaign/campaign-ui.js`. That switch consults this
// registry FIRST (through `window.CJS.CampaignActionsRuntime`), so a
// registered name is the single source of truth for that action across
// every dispatch path:
//   • React onClick → `dispatchCampaignAction` → `CampaignUI.handleAction`
//   • the shell `<main>` + drawer click forwarders
//   • internal delegated callers in campaign-ui.js (e.g. the party-sheet
//     modal's own click delegate)
//
// Porting an action = add it here + delete its `case` from the switch.
// `test_actions_bridge.js` cross-checks that the union of switch cases
// and registry keys exactly covers `CampaignActionName`, and that the
// two sets are disjoint (no dead duplicate).
//
// The handler receives the same camelCase `data` payload the switch case
// read (`data.id`, `data.choice`, `data.worldId`, …), sourced from a DOM
// `dataset` or the `dispatchCampaignAction` payload.

import type { CampaignActionName } from "../actionNames";
import * as Actions from "../actions";
import * as Roster from "./roster";
import * as RosterModals from "./roster-modals";
import * as Ops from "./ops";
import * as Farm from "./farm";
import * as Forge from "./forge";
import * as QuestChain from "./quest-chain";
import * as Nav from "./nav";
import * as Sequence from "./sequence";
import * as Story from "./story-director";
import * as Oracle from "./oracle";
import * as MapActions from "./map";
import * as Haven from "./haven";
import { worldMapAction } from "./worldmap";

export type ActionData = Record<string, string | number | undefined>;
export type ActionHandler = (data: ActionData) => unknown;

function str(value: string | number | undefined): string {
  return value == null ? "" : String(value);
}

const HANDLERS: Partial<Record<CampaignActionName, ActionHandler>> = {
  // ── Save management ───────────────────────────────────────────────
  "new-save": () => Actions.newSave(),
  "save-slot": () => Actions.quickSave(),
  "fork-save": () => Actions.forkSave(),
  "export-save": () => Actions.exportSave(),
  "import-save": () => Actions.importSavePicker(),
  "push-github": () => Actions.pushToGitHub(),
  "load-slot": (d) => Actions.loadSlot(str(d.id)),
  "delete-slot": (d) => Actions.deleteSlot(str(d.id)),
  "delete-all-saves": () => Actions.deleteAllSaves(),
  "export-slot": (d) => Actions.exportSlot(str(d.id)),
  // ── Log management ────────────────────────────────────────────────
  "export-log": () => Actions.exportLog(),
  "clear-log": () => Actions.clearLog(),
  "export-event-log": () => Actions.exportEventLog(),
  "clear-event-log": () => Actions.clearEventLog(),
  // ── Roster: pure CampaignOps (detail-row cards + gameplay actions) ─
  "bench-character": (d) => Actions.benchCharacter(str(d.id)),
  "activate-character": (d) => Actions.activateCharacter(str(d.id)),
  "unlearn-skill": (d) => Roster.unlearnSkill(str(d.id), str(d.skillId)),
  "unlearn-passive": (d) => Roster.unlearnPassive(str(d.id), str(d.passiveId)),
  "unequip-item": (d) => Roster.unequipItem(str(d.id), str(d.slot)),
  "equip-skill": (d) => Roster.equipSkill(str(d.id), str(d.skillId)),
  "unequip-skill": (d) => Roster.unequipSkill(str(d.id), str(d.skillId)),
  "equip-passive": (d) => Roster.equipPassive(str(d.id), str(d.passiveId)),
  "unequip-passive": (d) => Roster.unequipPassive(str(d.id), str(d.passiveId)),
  "party-available": (d) => Roster.clearPartyAvailability(str(d.id)),
  // ── Roster: GM stat modals (number / form / status-picker) ────────
  "damage-char": (d) => RosterModals.charNumberOp(str(d.id), "damage_character", "Damage amount"),
  "heal-char": (d) => RosterModals.charNumberOp(str(d.id), "heal_character", "Heal amount"),
  "level-char": (d) => RosterModals.charNumberOp(str(d.id), "add_level", "Level change"),
  "mp-char": (d) => RosterModals.charMpModal(str(d.id)),
  "status-char": (d) => RosterModals.charStatusModal(str(d.id)),
  "grant-xp": (d) => RosterModals.grantXpModal(str(d.id)),
  "grant-job-xp": (d) => RosterModals.grantJobXpModal(str(d.id)),
  // ── Thin engine ops (phase / hub / quest / shop / combat) ─────────
  "pass-phase": () => Actions.passPhase(),
  "full-rest": () => Ops.fullRest(),
  "review-resolve": (d) => Ops.reviewResolve(str(d.id), str(d.decision)),
  "resolve-hub-problem": (d) => Ops.resolveHubProblem(str(d.hubId), str(d.id)),
  "quest-complete": (d) => Ops.completeQuest(str(d.id)),
  "quest-fail": (d) => Ops.failQuest(str(d.id)),
  "quest-event": () => Ops.noticeRandomQuestEventsDisabled(),
  "shop-sell": (d) =>
    Ops.sellShopItem({ id: str(d.id), type: str(d.type), price: Number(d.price || 0), currency: str(d.currency) }),
  "run-roll-event": () => Ops.noticeRandomEventsDisabled(),
  "run-tick-danger": () => Ops.tickRunDanger(),
  "reveal-node": (d) => Ops.revealNode(str(d.nodeId)),
  "end-scenario": () => Ops.endScenario(),
  "skip-victory": () => Ops.skipBattleVictory(),
  "skip-defeat": () => Ops.skipBattleDefeat(),
  "cancel-battle": () => Ops.cancelPendingBattle(),
  "ignore-combat-result": () => Ops.ignoreCombatResult(),
  // ── Farm / Pocket Haven ───────────────────────────────────────────
  "farm-tick": () => Farm.farmTick(),
  "farm-move": (d) => Farm.farmMove(d.dir),
  "farm-interact": () => Farm.farmInteract(),
  "farm-tile": (d) => Farm.farmFaceOrUseTile(d.x, d.y),
  "farm-select-tool": (d) => Farm.farmSelectTool(d.tool),
  "farm-tile-action": (d) => Farm.farmTileAction(d.tileAction, d.x, d.y),
  "farm-tile-menu-close": () => Farm.farmCloseTileMenu(),
  "farm-qte-open": () => Farm.farmOpenQte(),
  "farm-qte-hit": () => Farm.farmHitQte(),
  "farm-qte-close": () => Farm.farmCloseQte(),
  "harvest-plot": (d) => Farm.harvestPlot(d.plotId),
  "open-fishing": () => Farm.openFishing(),
  // ── Forge passthroughs ────────────────────────────────────────────
  "save-chain": (d) => Forge.saveChainAsIdea(str(d.id)),
  "queue-battle-set": (d) => Forge.queueBattleSet(str(d.id)),
  "save-battle-card": (d) => Forge.saveBattleCard(str(d.id)),
  "save-map-seed": (d) => Forge.saveMapSeed(str(d.id)),
  "copy-battle-card": (d) => Forge.copyBattleCard(str(d.id)),
  "copy-map-seed": (d) => Forge.copyMapSeed(str(d.id)),
  // ── Quest chains (advance / complete / fail / promote) ────────────
  "advance-chain": (d) => QuestChain.advanceChain(str(d.id)),
  "complete-chain": (d) => QuestChain.completeChain(str(d.id)),
  "fail-chain": (d) => QuestChain.failChain(str(d.id)),
  "promote-chain": (d) => QuestChain.promoteChain(str(d.id)),
  // ── World map delegation ──────────────────────────────────────────
  "world-map-travel": (d) => worldMapAction(d),
  "world-map-switch-map": (d) => worldMapAction(d),
  "world-map-interaction": (d) => worldMapAction(d),
  "world-map-node-action": (d) => worldMapAction(d),
  "world-activity-use": (d) => worldMapAction(d),
  // ── Navigation (mode/tab switches; TS port of _goto) ──────────────
  "open-world-gate": () => Nav.goto("world", "worldGate"),
  "open-world-content": (d) => Nav.openWorldContent(str(d.mode), str(d.tab)),
  "open-story-home": () => Nav.goto("story", "storyHome"),
  "open-story-summary": () => Nav.goto("story", "storySummary"),
  "open-quest-home": () => Nav.goto("quest", "questHome"),
  "open-event-home": () => Nav.goto("event", "eventCharacter"),
  "open-event-log": () => Nav.goto("event", "eventLog"),
  "open-roster-tab": () => Nav.goto(null, "roster"),
  "open-scenarios-tab": () => Nav.goto(null, "scenarios"),
  "open-maps-tab": () => Nav.goto(null, "maps"),
  "open-inventory-tab": () => Nav.goto("activities", "inventory"),
  "open-farm-tab": () => Nav.goto("activities", "farm"),
  "open-craft-tab": () => Nav.goto("activities", "craft"),
  "open-cook-tab": () => Nav.goto("activities", "cook"),
  "open-oracle-event-tab": () => Nav.goto("activities", "oracleForge"),
  "open-quests-tab": () => Nav.goto("quest", "quests"),
  "open-shops-tab": () => Nav.goto("activities", "shops"),
  "open-sideforge-tab": () => Nav.goto("activities", "sideForge"),
  "open-event-stories-tab": () => Nav.goto("event", "eventSide"),
  "open-event-battles-tab": () => Nav.goto("event", "battleSets"),
  // ── Sequence runner (start / advance / complete / VN) ─────────────
  "sequence-start": (d) => Sequence.startSequence(str(d.id)),
  "sequence-next": () => Sequence.advanceSequence("next"),
  "sequence-resolve": () => Sequence.advanceSequence("resolve"),
  "sequence-choice": (d) => Sequence.advanceSequence("choice", d.choice),
  "sequence-pass": () => Sequence.advanceSequence("pass"),
  "sequence-fail": () => Sequence.advanceSequence("fail"),
  "sequence-queue-battle": () => Sequence.advanceSequence("queue"),
  "sequence-win": () => Sequence.advanceSequence("win"),
  "sequence-lose": () => Sequence.advanceSequence("lose"),
  "sequence-abort": () => Sequence.advanceSequence("abort"),
  "sequence-complete": () => Sequence.completeSequence(),
  "sequence-open-vn": () => Sequence.openSequenceVn(),
  // ── Story director (hold / skip / apply route / stage / side sync) ─
  "story-save-beat": () => Story.saveStoryBeat(),
  "story-reject-beat": () => Story.rejectStoryBeat(),
  "story-apply-choice": (d) => Story.applyStoryChoice(str(d.id), Number(d.choice || 0)),
  "story-set-stage": (d) => Story.setStoryStage(str(d.id)),
  "story-sync-sidequests": () => Story.syncStorySideQuests(),
  // ── Oracle / GM prompt (roll / pick / custom / note / event-log) ──
  "roll-oracle": () => Oracle.rollOracle(),
  "pick-oracle": () => Oracle.pickOracle(),
  "custom-oracle": () => Oracle.customOracle(),
  "oracle-note": () => Oracle.saveOracleNote(),
  "oracle-event-log": () => Oracle.oracleToEventLog(),
  "roll-forge-oracle": () => Oracle.rollForgeOracle(),
  // ── Scenario map interaction ──────────────────────────────────────
  "move-node": (d) => MapActions.moveNode(str(d.nodeId)),
  "move-cell": (d) => MapActions.moveCell(d.x, d.y),
  "map-layer": (d) => MapActions.setMapLayer(str(d.layer)),
  "clear-node": (d) => MapActions.clearNode(str(d.nodeId)),
  // ── Pocket Haven facility ops ─────────────────────────────────────
  "haven-build-facility": (d) => Haven.buildFacility(str(d.facility)),
  "haven-upgrade-facility": (d) => Haven.upgradeFacility(str(d.facility)),
  "haven-ranch-collect": (d) => Haven.ranchCollect(str(d.facility))
};

export function hasHandler(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

export function runHandler(name: string, data: ActionData = {}): unknown {
  const fn = HANDLERS[name as CampaignActionName];
  return fn ? fn(data) : undefined;
}

// The keys ported so far — exported for introspection / tests.
export const REGISTERED_ACTION_NAMES: readonly CampaignActionName[] =
  Object.keys(HANDLERS) as CampaignActionName[];

// Install the runtime bridge the vanilla `_handleAction` switch reads.
// campaign-ui.js looks this up lazily at call time, so import order only
// has to guarantee this module runs before the first user action —
// `src/campaign/main.tsx` imports it during bootstrap.
interface ActionsRuntime {
  has: (name: string) => boolean;
  run: (name: string, data?: ActionData) => unknown;
}
interface RuntimeCjs {
  CampaignActionsRuntime?: ActionsRuntime;
  [key: string]: unknown;
}

const globalCjs = (window as unknown as { CJS?: RuntimeCjs });
globalCjs.CJS = globalCjs.CJS || ({} as RuntimeCjs);
globalCjs.CJS.CampaignActionsRuntime = { has: hasHandler, run: runHandler };
