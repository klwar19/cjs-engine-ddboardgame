// event-builder.ts — Phase H.4 port of the Manual Event Builder
// (`_openManualEventBuilder` + its 14 sub-helpers) from campaign-ui.js.
//
// The `custom-event` and `oracle-to-event-builder` actions
// (manual-builders.ts) open this four-step modal: seed (oracle / rumor /
// keywords / AI draft), scene, "turn into" toggles (rumor / event log /
// quest / map note / battle / plot hook / character beat / move), and a
// live summary + ops preview. "Use Event" stores the assembled event on
// state.lastEvent (applied later); "Copy Summary" copies the export text.
//
// Behaviour parity with the closures — identical DOM, identical op
// payloads, identical summary text, identical toasts. Shared engine
// helpers come straight from their TS homes: battle pool (battle-pool.ts),
// clipboard (copy.ts); rumor list via CampaignUIInternal.HubTab.openRumors.

import { cs, ds, ops, mod, rerender } from "./context";
import { widgets, modals } from "./modals";
import { esc, escAttr, label, truncate } from "../util/cui-utils";
import { battleDefeatFields, battleMapForArea, fallbackBattlePool, type BattleLike } from "./battle-pool";
import { copyPlainText } from "./copy";

export interface ManualEventPrefill {
  source?: string;
  seed?: string;
  title?: string;
  scope?: string;
  short?: string;
  scene?: string;
  mainStory?: string;
  tags?: string[];
}

type OpInput = { op: string; [key: string]: unknown };

interface RumorRecord {
  id?: string;
  text?: string;
  [key: string]: unknown;
}

interface RumorOption {
  value: string;
  label: string;
  text: string;
  rumor: RumorRecord;
}

interface BattleOption {
  value: string;
  label: string;
  battle: BattleLike;
}

interface SimpleOption {
  value: string;
  label: string;
}

interface ManualEventDraft {
  title: string;
  source: string;
  seed: string;
  scope: string;
  short: string;
  scene: string;
  mainStory: string;
  customTags: string[];
  selectedRumor: RumorOption | null;
  selectedBattle: BattleOption | null;
  battleValue: string;
  battleLabel: string;
  selectedCharacter: SimpleOption | null;
  characterId: string;
  bondAmount: number;
  characterNote: string;
  questTitle: string;
  questObjective: string;
  mapKind: string;
  mapLayer: string;
  mapText: string;
  returnPlace: string;
  consequence: string;
  goldAmount: number;
  jpAmount: number;
  amount: number;
  saveRumor: boolean;
  logEvent: boolean;
  addQuest: boolean;
  mapNote: boolean;
  queueBattle: boolean;
  savePlot: boolean;
  character: boolean;
  move: boolean;
}

interface DraftContext {
  rumorOptions?: RumorOption[];
  battleOptions?: BattleOption[];
  characterOptions?: SimpleOption[];
}

// ── Engine surfaces ─────────────────────────────────────────────────
interface OracleModule {
  roll?: (overrides?: Record<string, unknown>) => { text?: string; prompt?: string } | null | undefined;
}
interface HubModule {
  getCurrentHubId?: () => string | undefined;
  getCurrentHubState?: () => unknown;
}
interface HubTabApi {
  openRumors?: (hubState: unknown) => RumorRecord[];
}
interface CuiInternalHub {
  HubTab?: HubTabApi;
}
interface ContentManagerModule {
  getVisibleItems?: (type: string) => Array<{ id?: string; name?: string }>;
}
interface RunnerModule {
  findCurrentNode?: () => { name?: string; label?: string } | null | undefined;
}

function openRumors(hubState: unknown): RumorRecord[] {
  return mod<CuiInternalHub>("CampaignUIInternal")?.HubTab?.openRumors?.(hubState) || [];
}

// ── Option builders ─────────────────────────────────────────────────
function manualEventRumorOptions(): RumorOption[] {
  const hubState = mod<HubModule>("CampaignHub")?.getCurrentHubState?.();
  return openRumors(hubState).map((rumor) => ({
    value: String(rumor.id || ""),
    label: truncate(rumor.text || String(rumor.id || ""), 90),
    text: rumor.text || String(rumor.id || ""),
    rumor
  }));
}

function manualEventBattleOptions(): BattleOption[] {
  const scenario = cs().getActiveScenario?.() as { setBattles?: BattleLike[] } | null | undefined;
  const setBattles: BattleOption[] = (scenario?.setBattles || []).map((battle, index) => ({
    value: `scenario_${battle.id || battle.encounterId || index}`,
    label: battle.label || battle.name || battle.encounterId || battle.battleSetId || `Set Battle ${index + 1}`,
    battle: {
      ...battle,
      label: battle.label || battle.name || battle.encounterId || battle.battleSetId || `Set Battle ${index + 1}`
    }
  }));
  const fallback: BattleOption[] = fallbackBattlePool()
    .slice(0, 10)
    .map((battle, index) => ({
      value: `pool_${battle.id || battle.encounterId || battle.battleSetId || index}`,
      label: battle.label || battle.name || battle.encounterId || battle.battleSetId || `Battle ${index + 1}`,
      battle
    }));
  const seen = new Set<string>();
  return [...setBattles, ...fallback].filter((entry) => {
    if (seen.has(entry.value)) return false;
    seen.add(entry.value);
    return true;
  });
}

function manualEventLayerOptions(): SimpleOption[] {
  const run = cs().getState()?.activeScenarioRun as { mapLayer?: string } | undefined;
  const map = cs().getActiveMap?.() as { layers?: Array<{ id?: string; name?: string }> } | null | undefined;
  const layers: SimpleOption[] = (map?.layers || []).map((layer) => ({
    value: String(layer.id || ""),
    label: layer.name || String(layer.id || "")
  }));
  if (layers.length) return [{ value: "", label: `Stay on ${run?.mapLayer || layers[0].label || "current layer"}` }, ...layers];
  return [
    { value: "", label: "Stay on current layer" },
    { value: "surface", label: "Surface / town layer" },
    { value: "underground", label: "Underground layer" },
    { value: "upper", label: "Upper layer" },
    { value: "dream", label: "Dream / memory layer" },
    { value: "return_route", label: "Return route" }
  ];
}

function manualEventCharacterOptions(): SimpleOption[] {
  const state = cs().getState() || {};
  const party = (state.party as Record<string, { name?: string; baseCharacterId?: string }>) || {};
  const seen = new Set<string>();
  const out: SimpleOption[] = [];
  for (const [id, member] of Object.entries(party)) {
    const base = ds()?.get("characters", member.baseCharacterId || id);
    const name = member.name || base?.name || id;
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ value: id, label: `${name} (party)` });
    }
  }
  const source: Array<{ id?: string; name?: string }> =
    mod<ContentManagerModule>("ContentManager")?.getVisibleItems?.("characters") ||
    (ds()?.getAllAsArray("characters") as Array<{ id?: string; name?: string }>) ||
    [];
  for (const character of source.slice(0, 80)) {
    if (!character.id || seen.has(character.id)) continue;
    seen.add(character.id);
    out.push({ value: character.id, label: character.name || character.id });
  }
  const sortOptionLabel = modals()?.sortOptionLabel;
  return sortOptionLabel ? out.sort(sortOptionLabel) : out;
}

// ── Keyword bank ────────────────────────────────────────────────────
function manualKeywordBank(): { adjectives: string; nouns: string; verbs: string; twists: string } {
  return {
    adjectives: "hidden, urgent, broken, tender, absurd, cursed, rival, lost, glittering, forbidden, overdue, suspicious",
    nouns: "letter, contract, shrine, mirror, debt, festival, bridge, relic, witness, map, recipe, monster trail",
    verbs: "betrays, protects, vanishes, returns, accuses, demands, interrupts, awakens, bargains, follows, fractures, remembers",
    twists: "someone is lying, the reward has a cost, the map is wrong, an ally recognizes the sign, it connects to a rumor, the safe route is blocked"
  };
}

function manualKeywordPrompt(source: { adjectives?: string; nouns?: string; verbs?: string; twists?: string } = {}): string {
  const pick = (text: string | undefined): string => {
    const list = String(text || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length ? list[Math.floor(Math.random() * list.length)] : "";
  };
  const adjective = pick(source.adjectives);
  const noun = pick(source.nouns);
  const verb = pick(source.verbs);
  const twist = pick(source.twists);
  return [[adjective, noun].filter(Boolean).join(" "), verb ? `action: ${verb}` : "", twist ? `twist: ${twist}` : ""].filter(Boolean).join("; ");
}

// ── Tags ────────────────────────────────────────────────────────────
function tagList(text = ""): string[] {
  return String(text || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function manualEventTags(draft: Partial<ManualEventDraft> = {}): string[] {
  return ["manual_event", draft.scope || "event", draft.source || "manual"]
    .concat(draft.customTags || [])
    .concat(draft.selectedRumor ? ["rumor"] : [])
    .filter((tag, index, arr) => !!tag && arr.indexOf(tag) === index);
}

// ── Draft + summary ─────────────────────────────────────────────────
function eventShortSummary(draft: Partial<ManualEventDraft> = {}): string {
  const text = draft.short || draft.scene || draft.seed || draft.mapText || draft.mainStory || draft.title || "Manual event happened.";
  return truncate(String(text).replace(/\s+/g, " ").trim(), 180) || "Manual event happened.";
}

function manualEventDraftFromBody(body: ParentNode, context: DraftContext = {}): ManualEventDraft {
  const $ = (sel: string): HTMLInputElement | null => body.querySelector(sel) as HTMLInputElement | null;
  const bool = (sel: string): boolean => !!$(sel)?.checked;
  const battleValue = $("#manual-battle")?.value || "";
  const characterId = $("#manual-character-id")?.value || "";
  const selectedBattle = (context.battleOptions || []).find((battle) => battle.value === battleValue) || null;
  const selectedRumor = (context.rumorOptions || []).find((rumor) => rumor.value === $("#manual-rumor")?.value) || null;
  const selectedCharacter = (context.characterOptions || []).find((character) => character.value === characterId) || null;
  return {
    title: $("#manual-title")?.value.trim() || "Manual Event",
    source: $("#manual-source")?.value || "manual",
    seed: $("#manual-seed")?.value.trim() || "",
    scope: $("#manual-scope")?.value || "event",
    short: $("#manual-short")?.value.trim() || "",
    scene: $("#manual-scene")?.value.trim() || "",
    mainStory: $("#manual-main")?.value.trim() || "",
    customTags: tagList($("#manual-tags")?.value || ""),
    selectedRumor,
    selectedBattle,
    battleValue,
    battleLabel: $("#manual-battle-label")?.value.trim() || "",
    selectedCharacter,
    characterId,
    bondAmount: Number($("#manual-bond")?.value || 0),
    characterNote: $("#manual-character-note")?.value.trim() || "",
    questTitle: $("#manual-quest-title")?.value.trim() || "",
    questObjective: $("#manual-quest-objective")?.value.trim() || "",
    mapKind: $("#manual-map-kind")?.value || "event",
    mapLayer: $("#manual-map-layer")?.value || "",
    mapText: $("#manual-map-text")?.value.trim() || "",
    returnPlace: $("#manual-return")?.value.trim() || "",
    consequence: $("#manual-consequence")?.value || "none",
    goldAmount: Math.abs(Number($("#manual-gold")?.value || 0)),
    jpAmount: Math.abs(Number($("#manual-jp")?.value || 0)),
    amount: Number($("#manual-amount")?.value || 0),
    saveRumor: bool("#manual-save-rumor"),
    logEvent: bool("#manual-event-log"),
    addQuest: bool("#manual-add-quest"),
    mapNote: bool("#manual-map-note"),
    queueBattle: bool("#manual-queue-battle"),
    savePlot: bool("#manual-save-plot"),
    character: bool("#manual-character"),
    move: bool("#manual-move")
  };
}

function manualRewardOps(draft: Partial<ManualEventDraft> = {}, world?: string): OpInput[] {
  const currency = `${world || "haven"}_gold`;
  const amount = Math.abs(Number(draft.amount || 0)) || 1;
  switch (draft.consequence) {
    case "gain_gold":
      return [{ op: "give_money", currency, amount: Math.abs(Number(draft.goldAmount || 0)) || 25 }];
    case "lose_gold":
      return [{ op: "take_money", currency, amount: Math.abs(Number(draft.goldAmount || 0)) || 15 }];
    case "give_jp":
      return [{ op: "give_jp", amount: Math.abs(Number(draft.jpAmount || 0)) || 5 }];
    case "take_jp":
      return [{ op: "take_jp", amount: Math.abs(Number(draft.jpAmount || 0)) || 5 }];
    case "damage_party":
      return [{ op: "damage_party", amount: amount || 5 }];
    case "heal_party":
      return [{ op: "heal_party", amount: amount || 10 }];
    case "add_status_cold":
      return [{ op: "add_status", target: "party", status: "cold", duration: "scenario" }];
    case "danger":
      return [{ op: "danger", amount: Number(draft.amount || 1) }];
    default:
      return [];
  }
}

function manualEventOps(draft: ManualEventDraft): OpInput[] {
  const state = cs().getState() || {};
  const world = state.currentWorld as string | undefined;
  const run = (state.activeScenarioRun as { mapId?: string; currentNode?: string; currentCell?: string; mapLayer?: string } | null) || null;
  const mapId = run?.mapId || "freeform";
  const nodeId = run?.currentNode || run?.currentCell || "freeform";
  const short = eventShortSummary(draft);
  const title = draft.title || "Manual Event";
  const result: OpInput[] = [];

  result.push({ op: "log", text: `Manual event: ${short}` });

  if (draft.logEvent) {
    result.push({
      op: "event_log_add",
      entry: {
        title,
        summary: short,
        source: draft.source || "manual",
        scope: draft.scope || "event",
        tags: manualEventTags(draft),
        consequences: []
      }
    });
  }

  if (draft.saveRumor) {
    result.push({
      op: "add_rumor",
      hubId: mod<HubModule>("CampaignHub")?.getCurrentHubId?.(),
      text: draft.seed || short,
      canonRisk: "green",
      tags: manualEventTags(draft),
      source: "manual_event"
    });
  }

  if (draft.addQuest) {
    const questId = `manual_quest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    result.push({
      op: "add_quest",
      quest: {
        id: questId,
        title: draft.questTitle || title,
        status: "active",
        summary: short,
        notes: [draft.seed, draft.scene].filter(Boolean).join("\n\n"),
        objectives: [
          {
            id: "obj_1",
            label: draft.questObjective || "Resolve the event hook",
            current: 0,
            required: 1
          }
        ],
        rewards: [],
        tags: manualEventTags(draft)
      }
    });
  }

  if (draft.mapNote) {
    result.push({
      op: "map_note",
      mapId,
      nodeId,
      title,
      kind: draft.mapKind || "event",
      layer: draft.mapLayer || run?.mapLayer || null,
      text: draft.mapText || draft.scene || short
    });
  }

  if (draft.move && draft.mapLayer) {
    result.push({ op: "map_layer_set", layer: draft.mapLayer });
  }
  if (draft.move && draft.returnPlace) {
    result.push({ op: "log", text: `Manual movement marker: ${draft.returnPlace}.` });
  }

  if (draft.queueBattle) {
    const battle = draft.selectedBattle?.battle || {};
    result.push({
      op: "start_battle",
      encounterId: battle.encounterId || null,
      battleSetId: battle.battleSetId || null,
      monsterIds: battle.monsterIds || [],
      label: draft.battleLabel || battle.label || `Manual battle: ${title}`,
      source: "manual_event",
      rewardOps: battle.rewardOps || [],
      ...battleDefeatFields(battle),
      objective: battle.objective || draft.questObjective || "",
      notes: battle.notes || draft.scene || short,
      battleMap: battle.battleMap || battleMapForArea((cs().getActiveScenario?.() as { setting?: string } | null)?.setting || "outdoor")
    });
  }

  if (draft.savePlot) {
    result.push({
      op: "side_idea_save",
      status: "saved",
      contentCard: {
        id: `manual_plot_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        type: draft.scope === "main_story" ? "main_story_hook" : "plot_hook",
        title,
        summary: short,
        prompt: draft.scene || draft.seed || "",
        canonRisk: draft.scope === "main_story" ? "yellow" : "green",
        source: "manual_event",
        tags: manualEventTags(draft)
      },
      setLast: false
    });
  }

  if (draft.character) {
    const characterName = draft.selectedCharacter?.label || draft.characterId || "character";
    if (draft.characterNote) {
      result.push({
        op: "side_idea_save",
        status: "saved",
        contentCard: {
          id: `manual_character_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          type: "character_beat",
          title: `${title}: ${characterName}`,
          summary: draft.characterNote,
          prompt: draft.scene || draft.seed || "",
          canonRisk: "green",
          source: "manual_event",
          tags: [...manualEventTags(draft), "character"]
        },
        setLast: false
      });
    }
    if (draft.characterId && draft.bondAmount) {
      result.push({ op: "bond_change", npcId: draft.characterId, amount: draft.bondAmount, field: "value" });
    }
  }

  if (draft.mainStory || draft.scope === "main_story") {
    result.push({
      op: "story_beat_save",
      status: "manual",
      beat: {
        id: `manual_story_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        type: "manual_event_main_story",
        kind: "manual",
        title,
        summary: draft.mainStory || short,
        prompt: draft.scene || draft.seed || "",
        tags: [...manualEventTags(draft), "main_story"]
      }
    });
  }

  result.push(...manualRewardOps(draft, world));
  return result;
}

function manualEventFromDraft(draft: ManualEventDraft): Record<string, unknown> {
  const opList = manualEventOps(draft);
  const short = eventShortSummary(draft);
  const prompt =
    [draft.seed ? `Seed: ${draft.seed}` : "", draft.scene, draft.mapText ? `Map note: ${draft.mapText}` : "", draft.characterNote ? `Character: ${draft.characterNote}` : ""]
      .filter(Boolean)
      .join("\n\n") || short;
  return {
    id: `manual_event_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    title: draft.title || "Manual Event",
    prompt,
    gmHook: draft.scene || draft.seed || "",
    suggested: opList,
    tableName: "Manual Builder",
    type: draft.scope || "event",
    source: draft.source || "manual",
    rolledAt: new Date().toISOString(),
    manualSummary: {
      short,
      main: draft.mainStory || "",
      full: manualEventSummaryText(draft, opList),
      tags: manualEventTags(draft)
    }
  };
}

function manualEventSummaryText(draft: ManualEventDraft, opList: OpInput[] = []): string {
  const lines: string[] = [
    "Manual Event Summary",
    "",
    `Title: ${draft.title || "Manual Event"}`,
    `Source: ${label(draft.source || "manual")}`,
    `Scope: ${label(draft.scope || "event")}`,
    "",
    "Event short summary:",
    eventShortSummary(draft),
    ""
  ];
  if (draft.seed) lines.push("Seed:", draft.seed, "");
  if (draft.scene) lines.push("Scene / hook:", draft.scene, "");
  if (draft.customTags?.length) lines.push("Tags:", draft.customTags.join(", "), "");
  lines.push("Main story summary:", draft.mainStory || "(none)", "");
  lines.push("Event log:", draft.logEvent ? "yes" : "no", "");
  if (draft.addQuest) lines.push("Quest:", `${draft.questTitle || draft.title || "Manual Quest"} - ${draft.questObjective || "Resolve the event hook"}`, "");
  if (draft.mapNote) lines.push("Map:", `${label(draft.mapKind || "event")} - ${draft.mapText || draft.scene || eventShortSummary(draft)}`, "");
  if (draft.queueBattle) lines.push("Battle:", draft.battleLabel || draft.selectedBattle?.label || `Manual battle: ${draft.title || "Event"}`, "");
  if (draft.character) {
    lines.push("Character:", `${draft.selectedCharacter?.label || draft.characterId || "Character"}${draft.characterNote ? ` - ${draft.characterNote}` : ""}`, "");
  }
  if (draft.move && (draft.mapLayer || draft.returnPlace)) {
    lines.push(
      "Move / return:",
      [draft.mapLayer ? `Layer: ${draft.mapLayer}` : "", draft.returnPlace ? `Return/place: ${draft.returnPlace}` : ""].filter(Boolean).join(" | "),
      ""
    );
  }
  const descriptions = (ops().describe(opList) || []).filter(Boolean);
  lines.push("Applied changes preview:");
  lines.push(...(descriptions.length ? descriptions.map((line) => `- ${line}`) : ["- Story-only event."]));
  return lines.join("\n");
}

// ── Modal ───────────────────────────────────────────────────────────
export function openManualEventBuilder(prefill: ManualEventPrefill = {}): void {
  const ui = widgets();
  if (!ui?.openModal) return;
  const state = cs().getState() || {};
  const run = (state.activeScenarioRun as { mapId?: string; scenarioId?: string; currentNode?: string } | null) || null;
  const currentMap = cs().getActiveMap?.() as { name?: string } | null | undefined;
  const currentNode = mod<RunnerModule>("ScenarioRunner")?.findCurrentNode?.();
  const rumorOptions = manualEventRumorOptions();
  const battleOptions = manualEventBattleOptions();
  const layerOptions = manualEventLayerOptions();
  const characterOptions = manualEventCharacterOptions();
  const bank = manualKeywordBank();
  const runLine = run
    ? `Active run: ${currentMap?.name || run.mapId || run.scenarioId || "map"} / ${currentNode?.name || currentNode?.label || run.currentNode || "current point"}`
    : "No active run. Map notes are saved to a freeform map bucket until you start a run.";

  const body = document.createElement("div");
  body.className = "campaign-manual-event-builder";
  body.innerHTML = `
      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>1</span>
          <div>
            <h3>Seed</h3>
            <small>Oracle, rumor, keywords, AI draft, or your own note.</small>
          </div>
        </div>
        <div class="campaign-row-actions">
          <button type="button" class="campaign-action primary" id="manual-roll-oracle">Roll Oracle</button>
          <button type="button" class="campaign-action" id="manual-use-rumor" ${rumorOptions.length ? "" : "disabled"}>Use Rumor</button>
          <button type="button" class="campaign-action" id="manual-roll-keywords">Roll Keywords</button>
          <button type="button" class="campaign-action" id="manual-clear-seed">Clear</button>
        </div>
        <div class="campaign-builder-grid">
          <label class="form-label">Source
            <select id="manual-source">
              <option value="manual" ${prefill.source === "manual" || !prefill.source ? "selected" : ""}>Manual</option>
              <option value="oracle" ${prefill.source === "oracle" ? "selected" : ""}>Oracle</option>
              <option value="rumor">Rumor</option>
              <option value="keywords">Keywords</option>
              <option value="ai_draft" ${prefill.source === "ai_draft" ? "selected" : ""}>AI Draft</option>
            </select>
          </label>
          <label class="form-label">Open Rumor
            <select id="manual-rumor">
              <option value="">No rumor selected</option>
              ${rumorOptions.map((rumor) => `<option value="${escAttr(rumor.value)}">${esc(rumor.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        <textarea id="manual-seed" placeholder="Seed, oracle line, rumor, or outside AI draft.">${esc(prefill.seed || "")}</textarea>
        <details class="campaign-builder-details">
          <summary>Keyword bank</summary>
          <div class="campaign-builder-grid">
            <label class="form-label">Adjectives<input id="manual-kw-adj" type="text" value="${escAttr(bank.adjectives)}"></label>
            <label class="form-label">Nouns<input id="manual-kw-noun" type="text" value="${escAttr(bank.nouns)}"></label>
            <label class="form-label">Verbs<input id="manual-kw-verb" type="text" value="${escAttr(bank.verbs)}"></label>
            <label class="form-label">Twists<input id="manual-kw-twist" type="text" value="${escAttr(bank.twists)}"></label>
          </div>
        </details>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>2</span>
          <div>
            <h3>Scene</h3>
            <small>Short record first, longer prose optional.</small>
          </div>
        </div>
        <div class="campaign-builder-grid">
          <label class="form-label">Title<input id="manual-title" type="text" placeholder="Event title" value="${escAttr(prefill.title || "")}"></label>
          <label class="form-label">Scope
            <select id="manual-scope">
              <option value="event" ${!prefill.scope || prefill.scope === "event" ? "selected" : ""}>Event / table beat</option>
              <option value="quest" ${prefill.scope === "quest" ? "selected" : ""}>Quest support</option>
              <option value="main_story" ${prefill.scope === "main_story" ? "selected" : ""}>Main story</option>
              <option value="hub" ${prefill.scope === "hub" ? "selected" : ""}>Hub / town</option>
            </select>
          </label>
        </div>
        <label class="form-label">Very Short Event Summary
          <textarea id="manual-short" placeholder="One sentence: what happened at the table?">${esc(prefill.short || "")}</textarea>
        </label>
        <label class="form-label">Scene / Conversation / Hook
          <textarea id="manual-scene" placeholder="Dialogue, hook, clue, obstacle, or GM note.">${esc(prefill.scene || "")}</textarea>
        </label>
        <label class="form-label">Main Story Summary (separate)
          <textarea id="manual-main" placeholder="Only the main-plot meaning, if any. Leave blank for side or farming events.">${esc(prefill.mainStory || "")}</textarea>
        </label>
        <label class="form-label">Event Tags
          <input id="manual-tags" type="text" placeholder="comma-separated tags" value="${escAttr((prefill.tags || []).join(", "))}">
        </label>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>3</span>
          <div>
            <h3>Turn Into</h3>
            <small>Choose only the pieces you want to commit.</small>
          </div>
        </div>
        <div class="campaign-builder-checks">
          <label><input id="manual-save-rumor" type="checkbox">Save as rumor</label>
          <label><input id="manual-event-log" type="checkbox" checked>Add to event log</label>
          <label><input id="manual-add-quest" type="checkbox">Build quest</label>
          <label><input id="manual-map-note" type="checkbox" ${run ? "checked" : ""}>Write map event/trap</label>
          <label><input id="manual-queue-battle" type="checkbox">Queue battle</label>
          <label><input id="manual-save-plot" type="checkbox" checked>Save plot hook</label>
          <label><input id="manual-character" type="checkbox">Add character beat</label>
          <label><input id="manual-move" type="checkbox">Move / return marker</label>
        </div>

        <div class="campaign-builder-grid">
          <label class="form-label">Quest Title<input id="manual-quest-title" type="text" placeholder="Defaults to event title"></label>
          <label class="form-label">Quest Objective<input id="manual-quest-objective" type="text" placeholder="Resolve the hook"></label>
          <label class="form-label">Map Note Type
            <select id="manual-map-kind">
              <option value="event">Event</option>
              <option value="trap">Trap</option>
              <option value="clue">Clue</option>
              <option value="shortcut">Shortcut</option>
              <option value="reward">Reward</option>
            </select>
          </label>
          <label class="form-label">Map Layer
            <select id="manual-map-layer">
              ${layerOptions.map((layer) => `<option value="${escAttr(layer.value)}">${esc(layer.label)}</option>`).join("")}
            </select>
          </label>
          <label class="form-label">Battle
            <select id="manual-battle">
              <option value="">No set battle</option>
              <option value="custom">Custom/manual battle</option>
              ${battleOptions.map((battle) => `<option value="${escAttr(battle.value)}">${esc(battle.label)}</option>`).join("")}
            </select>
          </label>
          <label class="form-label">Battle Label<input id="manual-battle-label" type="text" placeholder="Ambush, duel, defense, etc."></label>
          <label class="form-label">Related Character
            <select id="manual-character-id">
              <option value="">No character selected</option>
              ${characterOptions.map((character) => `<option value="${escAttr(character.value)}">${esc(character.label)}</option>`).join("")}
            </select>
          </label>
          <label class="form-label">Bond Change<input id="manual-bond" type="number" value="0" step="1"></label>
          <label class="form-label">Return / New Place<input id="manual-return" type="text" placeholder="Return to guild, lower layer, old shrine..."></label>
          <label class="form-label">Quick Reward / Consequence
            <select id="manual-consequence">
              <option value="none">None</option>
              <option value="gain_gold">Gain gold</option>
              <option value="lose_gold">Lose gold</option>
              <option value="give_jp">Gain JP</option>
              <option value="take_jp">Lose JP</option>
              <option value="damage_party">Damage party</option>
              <option value="heal_party">Heal party</option>
              <option value="add_status_cold">Cold status on party</option>
              <option value="danger">Danger change</option>
            </select>
          </label>
          <label class="form-label">Gold Amount<input id="manual-gold" type="number" value="25" step="1"></label>
          <label class="form-label">JP Amount<input id="manual-jp" type="number" value="5" step="1"></label>
          <label class="form-label">Danger / HP Amount<input id="manual-amount" type="number" value="1" step="1"></label>
        </div>
        <label class="form-label">Map Event / Trap Text
          <textarea id="manual-map-text" placeholder="${escAttr(runLine)}"></textarea>
        </label>
        <label class="form-label">Character Beat
          <textarea id="manual-character-note" placeholder="What changed with this character, companion, rival, or party member?"></textarea>
        </label>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>4</span>
          <div>
            <h3>Summary</h3>
            <small>Copy this for writing outside the app. Apply later if the ops look right.</small>
          </div>
        </div>
        <div id="manual-ops-preview" class="campaign-preview"></div>
        <label class="form-label">Event Summary<textarea id="manual-summary-event" readonly></textarea></label>
        <label class="form-label">Main Story Summary<textarea id="manual-summary-main" readonly></textarea></label>
        <label class="form-label">Full Export<textarea id="manual-summary-full" readonly></textarea></label>
      </section>
    `;

  const footer = document.createElement("div");
  footer.className = "campaign-builder-footer";
  footer.innerHTML = `
      <button class="btn" id="manual-cancel">Cancel</button>
      <button class="btn" id="manual-copy">Copy Summary</button>
      <button class="btn btn-primary" id="manual-use">Use Event</button>
    `;
  const overlay = ui.openModal({ title: "Manual Event Builder", content: body, footer, width: "860px" });
  const $ = (sel: string): HTMLInputElement => body.querySelector(sel) as HTMLInputElement;

  function refresh(): void {
    const draft = manualEventDraftFromBody(body, { rumorOptions, battleOptions, characterOptions });
    const opList = manualEventOps(draft);
    $("#manual-summary-event").value = eventShortSummary(draft);
    $("#manual-summary-main").value = draft.mainStory || "";
    $("#manual-summary-full").value = manualEventSummaryText(draft, opList);
    const descriptions = (ops().describe(opList) || []).filter(Boolean);
    $("#manual-ops-preview").innerHTML = descriptions.length
      ? `<b>Changes if applied:</b><br>${descriptions.map(esc).join("<br>")}`
      : "<b>Changes if applied:</b><br>Story-only event. No automatic mechanics yet.";
  }

  $("#manual-roll-oracle").onclick = () => {
    const oracle = mod<OracleModule>("CampaignOracle")?.roll?.();
    if (!oracle) {
      ui.toast("No oracle table available", "info");
      return;
    }
    $("#manual-source").value = "oracle";
    $("#manual-seed").value = oracle.text || oracle.prompt || "";
    if (!$("#manual-title").value.trim()) $("#manual-title").value = "Oracle Event";
    if (!$("#manual-short").value.trim()) $("#manual-short").value = truncate(oracle.text || oracle.prompt || "", 140);
    refresh();
  };
  $("#manual-use-rumor").onclick = () => {
    const picked = rumorOptions.find((rumor) => rumor.value === $("#manual-rumor").value) || rumorOptions[0];
    if (!picked) {
      ui.toast("No open rumor selected", "info");
      return;
    }
    $("#manual-rumor").value = picked.value;
    $("#manual-source").value = "rumor";
    $("#manual-seed").value = picked.text || picked.label || "";
    $("#manual-save-rumor").checked = false;
    if (!$("#manual-title").value.trim()) $("#manual-title").value = `Rumor: ${truncate(picked.text || picked.label || "", 48)}`;
    if (!$("#manual-short").value.trim()) $("#manual-short").value = picked.text || picked.label || "";
    refresh();
  };
  $("#manual-roll-keywords").onclick = () => {
    $("#manual-source").value = "keywords";
    const text = manualKeywordPrompt({
      adjectives: $("#manual-kw-adj").value,
      nouns: $("#manual-kw-noun").value,
      verbs: $("#manual-kw-verb").value,
      twists: $("#manual-kw-twist").value
    });
    $("#manual-seed").value = text;
    if (!$("#manual-title").value.trim()) $("#manual-title").value = `Keyword Event: ${text.split(";")[0] || "Hook"}`;
    if (!$("#manual-short").value.trim()) $("#manual-short").value = text;
    refresh();
  };
  $("#manual-clear-seed").onclick = () => {
    $("#manual-seed").value = "";
    $("#manual-source").value = "manual";
    refresh();
  };
  body.querySelectorAll("input, textarea, select").forEach((el) => {
    el.addEventListener("input", refresh);
    el.addEventListener("change", refresh);
  });
  (footer.querySelector("#manual-cancel") as HTMLButtonElement).onclick = () => ui.closeModal(overlay);
  (footer.querySelector("#manual-copy") as HTMLButtonElement).onclick = () => {
    const draft = manualEventDraftFromBody(body, { rumorOptions, battleOptions, characterOptions });
    const opList = manualEventOps(draft);
    copyPlainText("Manual Event Summary", manualEventSummaryText(draft, opList), "Manual event summary copied");
  };
  (footer.querySelector("#manual-use") as HTMLButtonElement).onclick = () => {
    const draft = manualEventDraftFromBody(body, { rumorOptions, battleOptions, characterOptions });
    const event = manualEventFromDraft(draft);
    cs().mutate((next) => {
      (next as { lastEvent?: unknown }).lastEvent = event;
    }, { source: "event_custom" });
    ui.closeModal(overlay);
    rerender();
    ui.toast("Manual event ready. Review the summary and apply when you want it committed.", "success");
  };

  refresh();
}
