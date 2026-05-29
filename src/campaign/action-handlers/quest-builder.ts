// quest-builder.ts — Phase H.4 port of the Manual Quest Builder
// (`_openQuestModal`, 475 lines) + its sub-helpers from campaign-ui.js.
//
// The `add-quest` action (manual-builders.ts) opens this modal: pick a
// template (or blank/random), edit title/summary/giver/tags, add
// objective rows (10 presets incl. mini-game rooms), reward rows,
// failure-consequence rows, and map movement/setting/size. "Add Quest"
// commits via the add_quest op; "Add & Start Run" also launches the
// scenario through CampaignQuestLauncher.
//
// Behaviour parity with the closures — identical DOM, identical preset
// tables, identical objective/reward/consequence reads, identical
// add_quest payload, identical map-form/-type inference (shared with
// quest.ts), identical launcher call. Shares nothing with the rest of
// campaign-ui.js (the four helpers were modal-only), so the whole
// cluster moves here.

import { cs, ops, mod } from "./context";
import { widgets } from "./modals";
import { esc, escAttr, label, safe } from "../util/cui-utils";
import { questMapForm, questMapType } from "./quest";

interface MiniGame {
  gameId?: string;
  levelId?: string;
  difficulty?: number;
  theme?: string;
  contextText?: string;
  context?: string;
  conversation?: Array<{ speaker?: string; text?: string }>;
  bonusText?: string;
  [key: string]: unknown;
}

interface QuestObjective {
  id?: string;
  kind?: string;
  label?: string;
  current?: number;
  required?: number;
  minigame?: MiniGame | null;
  miniGame?: MiniGame | null;
}

interface RewardEntry {
  op?: string;
  label?: string;
  amount?: number;
  id?: string;
  defaultAmount?: number;
  broadcast?: boolean;
}

interface ConsequenceEntry {
  op?: string;
  label?: string;
  amount?: number;
  text?: string;
  defaultAmount?: number;
}

interface QuestRecord {
  id?: string;
  title?: string;
  status?: string;
  summary?: string;
  giver?: string;
  tags?: string[];
  contextTags?: string[];
  objectives?: QuestObjective[];
  rewards?: RewardEntry[];
  rewardOps?: RewardEntry[];
  failureConsequences?: ConsequenceEntry[];
  failureOps?: ConsequenceEntry[];
  templateId?: string;
  mapType?: string;
  mapSetting?: string;
  mapForm?: string;
  travelMode?: string;
  movement?: string;
  mapMode?: string;
  setting?: string;
  location?: string;
  mapSize?: string;
  randomVariant?: string;
  quickNarrative?: boolean;
  forceGeneratedMap?: boolean;
  linkedScenario?: unknown;
  linkedMapNodes?: unknown;
  linkedMapCells?: unknown;
  scenarioId?: unknown;
  scenario?: unknown;
  [key: string]: unknown;
}

interface ObjectivePreset {
  kind: string;
  label: string;
  template: string;
  icon: string;
  required: number;
  minigame?: MiniGame;
}

interface GeneratorModule {
  options?: () => { mapSettings?: string[]; mapTypes?: string[] };
}

interface QuestLauncherModule {
  startQuestScenario?: (
    questId: string,
    overrides?: { quest?: QuestRecord; mapForm?: string; mapType?: string; size?: string; forceGenerated?: boolean }
  ) => unknown;
}

type OpInput = { op: string; [key: string]: unknown };

// ── Mini-game context defaults + helpers ────────────────────────────
const DEFAULT_QUEST_MINIGAME_CONTEXT = {
  contextText: "This mini-game room is attached to the current quest. Clearing it advances the tracker and applies the training bonus.",
  conversation: [
    { speaker: "Quest Giver", text: "This counts for the job. Clear the room and I can mark the bonus." },
    { speaker: "Bin", text: "Good. Then it is work, not a distraction." }
  ],
  bonusText: "Clear bonus: quest progress, room buff, and JP payout apply on success."
};

function questBuilderMiniGame(base: MiniGame = {}): MiniGame {
  const mini = base || {};
  const conversation =
    Array.isArray(mini.conversation) && mini.conversation.length
      ? mini.conversation
      : DEFAULT_QUEST_MINIGAME_CONTEXT.conversation.map((line) => ({ ...line }));
  return {
    ...mini,
    contextText: mini.contextText || mini.context || DEFAULT_QUEST_MINIGAME_CONTEXT.contextText,
    conversation,
    bonusText: mini.bonusText || DEFAULT_QUEST_MINIGAME_CONTEXT.bonusText
  };
}

function parseMiniGameConversation(value: string | undefined): Array<{ speaker?: string; text?: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface RandomVariant {
  label: string;
  summary: string;
  objective: string;
  tag: string;
  mapType: string;
  kind?: string;
  required?: number;
  mapForm?: string;
  minigame?: MiniGame;
}

function randomizedQuestTemplate(template: QuestRecord = {}): QuestRecord {
  const variants: RandomVariant[] = [
    { label: "weather turn", summary: "A weather shift changes the approach and adds a small travel complication.", objective: "Handle the weather complication", tag: "weather", mapType: "outdoor" },
    { label: "rival claim", summary: "Another party, clerk, or local rival wants credit for the same job.", objective: "Deal with the rival claim", tag: "rival", mapType: "urban" },
    { label: "strange trace", summary: "The job leaves behind one odd clue that can stay rumor-only unless promoted.", objective: "Decide what the strange trace means", tag: "mystery", mapType: "ruins" },
    { label: "resource bonus", summary: "The route has better materials than expected, but one extra obstacle guards them.", objective: "Secure the bonus materials", kind: "harvest", required: 2, tag: "materials", mapType: "forest" },
    {
      label: "challenge room",
      summary: "The job includes a tiny dungeon mechanism resolved by the mini-game module or a manual check.",
      objective: "Clear the mini-game room",
      kind: "minigame",
      required: 1,
      tag: "minigame",
      mapForm: "grid_map",
      mapType: "dungeon",
      minigame: questBuilderMiniGame({ gameId: "push_box", difficulty: 1, theme: "ruins" })
    },
    { label: "hub errand", summary: "A local hub event becomes part of the request before the fieldwork can be closed.", objective: "Run one hub event", kind: "hub_event", required: 1, tag: "hub", mapType: "urban" },
    { label: "Character request", summary: "A nearby character asks for a small extra favor while the party is already out.", objective: "Answer the extra request", kind: "talk", required: 1, tag: "npc", mapType: "urban" }
  ];
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const next = cs().clone(template || {}) as QuestRecord;
  next.randomVariant = label(variant.label);
  next.title = `${template.title || template.id || "Quest"} (${next.randomVariant})`;
  next.summary = [template.summary || "", `Variant: ${variant.summary}`].filter(Boolean).join(" ");
  next.tags = Array.from(new Set([...(template.tags || []), variant.tag, "randomized"]));
  const variantObjective: QuestObjective = {
    id: `variant_${safe(variant.label)}`,
    kind: variant.kind || "custom",
    label: variant.objective,
    current: 0,
    required: Math.max(1, Number(variant.required || 1))
  };
  if (variant.minigame) variantObjective.minigame = variant.minigame;
  next.objectives = [...(template.objectives || []), variantObjective];
  if (!template.mapType || template.mapType === "any") next.mapType = variant.mapType;
  if (!template.mapForm && variant.mapForm) next.mapForm = variant.mapForm;
  return next;
}

// Library of objective archetypes for the structured quest builder.
// Built then spliced exactly as the closure did so the final order
// (defeat, defeat_count, …, harvest, hub_event, minigame, craft, custom)
// is preserved.
const QUEST_OBJECTIVE_PRESETS: ObjectivePreset[] = [
  { kind: "defeat", label: "Defeat targets", template: "Defeat the {what}", icon: "⚔", required: 1 },
  { kind: "recover", label: "Recover item", template: "Recover the {what}", icon: "📦", required: 1 },
  { kind: "reach", label: "Reach location", template: "Reach the {what}", icon: "📍", required: 1 },
  { kind: "escort", label: "Escort someone", template: "Escort {what} safely", icon: "🛡", required: 1 },
  { kind: "investigate", label: "Investigate / clue", template: "Investigate the {what}", icon: "🔍", required: 1 },
  { kind: "talk", label: "Talk to a character", template: "Speak with {what}", icon: "💬", required: 1 },
  { kind: "survive", label: "Survive waves", template: "Hold the {what} for 3 turns", icon: "⏳", required: 3 },
  { kind: "gather", label: "Gather materials", template: "Gather {what}", icon: "🌿", required: 3 },
  { kind: "craft", label: "Craft / deliver", template: "Craft and deliver {what}", icon: "🛠", required: 1 },
  { kind: "custom", label: "Custom", template: "", icon: "✎", required: 1 }
];

QUEST_OBJECTIVE_PRESETS.splice(1, 0, { kind: "defeat_count", label: "Kill X monsters", template: "Defeat {what} monsters", icon: "x", required: 3 });
QUEST_OBJECTIVE_PRESETS.splice(
  QUEST_OBJECTIVE_PRESETS.findIndex((p) => p.kind === "craft"),
  0,
  { kind: "harvest", label: "Harvest", template: "Harvest {what}", icon: "H", required: 3 },
  { kind: "hub_event", label: "Run hub event", template: "Run {what} hub event", icon: "E", required: 1 },
  { kind: "minigame", label: "Mini-game room", template: "Clear {what} mini-game room", icon: "M", required: 1, minigame: questBuilderMiniGame({ gameId: "push_box", difficulty: 1, theme: "ruins" }) }
);

const QUEST_REWARD_PRESETS: RewardEntry[] = [
  { op: "give_money", label: "Gold", defaultAmount: 50 },
  { op: "give_jp", label: "JP", defaultAmount: 25 },
  { op: "add_xp", label: "XP (party)", defaultAmount: 100, broadcast: true }
];

const QUEST_CONSEQUENCE_PRESETS: ConsequenceEntry[] = [
  { op: "take_money", label: "Lose Gold", defaultAmount: 50 },
  { op: "reputation_change", label: "Reputation -1", defaultAmount: -1 },
  { op: "hub_problem_add", label: "Trigger Hub Problem", defaultAmount: 0 }
];

// Guess an objective kind from free-form label text.
function inferObjectiveKind(text = ""): string {
  const s = String(text).toLowerCase();
  if (/kill \d|kill|cull|slay \d|defeat \d/.test(s)) return "defeat_count";
  if (/defeat|slay|kill|fight|battle|hunt/.test(s)) return "defeat";
  if (/recover|retrieve|find|fetch|bring/.test(s)) return "recover";
  if (/reach|arrive|enter|explore/.test(s)) return "reach";
  if (/escort|protect|guard/.test(s)) return "escort";
  if (/investigate|clue|inspect|search/.test(s)) return "investigate";
  if (/talk|speak|negotiate|ask/.test(s)) return "talk";
  if (/survive|hold|defend|withstand/.test(s)) return "survive";
  if (/harvest|forage|reap/.test(s)) return "harvest";
  if (/hub event|town event|guild pulse|tavern pulse/.test(s)) return "hub_event";
  if (/challenge|puzzle|maze|trial|mechanism/.test(s)) return "check";
  if (/gather|collect|mine/.test(s)) return "gather";
  if (/craft|deliver|build|forge/.test(s)) return "craft";
  return "custom";
}

// ── Modal ───────────────────────────────────────────────────────────
export function openQuestModal(prefill: { template?: string } = {}): void {
  const ui = widgets();
  if (!ui?.openModal) return;
  const campaignQuests = (cs().getContent().campaignQuests as Record<string, { templates?: QuestRecord[] }>) || {};
  const templates: QuestRecord[] = Object.values(campaignQuests).flatMap((record) => record.templates || []);
  const body = document.createElement("div");
  body.className = "campaign-quest-builder";
  const genOptions = mod<GeneratorModule>("CampaignScenarioGenerator")?.options?.();
  const mapTypeOptions: string[] = genOptions?.mapSettings || genOptions?.mapTypes || ["any", "urban", "outdoor", "forest", "dungeon", "cave", "ruins", "temple"];
  body.innerHTML = `
      <div class="campaign-control-help">
        Build a quest from scratch, fill from a template, or roll a random one. Edit any field before
        committing. <b>Add Quest</b> only adds it to the tracker. <b>Add &amp; Start Run</b> also auto-starts the map run.
      </div>
      <div class="campaign-quest-builder-row">
        <label class="form-label">Template (optional)</label>
        <div class="campaign-row-actions">
          <select id="campaign-quest-template" class="campaign-grow">
            <option value="">Custom quest (blank)</option>
            ${templates.map((quest) => `<option value="${escAttr(quest.id)}">${esc(quest.title || quest.id)}</option>`).join("")}
          </select>
          <button type="button" class="campaign-action" id="campaign-quest-roll" ${templates.length ? "" : "disabled"}>🎲 Roll Random</button>
          <button type="button" class="campaign-action" id="campaign-quest-clear">Clear</button>
        </div>
      </div>
      <label class="form-label">Title</label>
      <input id="campaign-quest-title" type="text" placeholder="Quest title">
      <label class="form-label">Summary <small class="campaign-muted">— shown to players in Quest Tracker</small></label>
      <textarea id="campaign-quest-summary" placeholder="One-paragraph hook describing what the party is asked to do."></textarea>
      <div class="campaign-quest-builder-grid">
        <label class="form-label">Giver <small class="campaign-muted">— optional character name</small>
          <input id="campaign-quest-giver" type="text" placeholder="e.g. Captain Reed">
        </label>
        <label class="form-label">Tags <small class="campaign-muted">— comma separated</small>
          <input id="campaign-quest-tags" type="text" placeholder="e.g. forest, escort">
        </label>
      </div>

      <div class="campaign-quest-section">
        <div class="campaign-quest-section-title">
          <span>Objectives</span>
          <small class="campaign-muted">Each row becomes a tracker step. The first objective marks the map's primary node.</small>
        </div>
        <div class="campaign-objective-presets" id="campaign-objective-presets">
          ${QUEST_OBJECTIVE_PRESETS.map(
            (preset) => `
            <button type="button" class="campaign-action campaign-objective-preset"
                    data-preset-kind="${escAttr(preset.kind)}"
                    title="${escAttr(preset.template || "Custom objective")}">
              ${preset.icon} ${esc(preset.label)}
            </button>
          `
          ).join("")}
        </div>
        <div class="campaign-objective-list" id="campaign-objective-list"></div>
      </div>

      <div class="campaign-quest-section">
        <div class="campaign-quest-section-title">
          <span>Rewards on Resolve</span>
          <small class="campaign-muted">Granted when you mark the quest complete.</small>
        </div>
        <div class="campaign-objective-presets">
          ${QUEST_REWARD_PRESETS.map((preset, idx) => `
            <button type="button" class="campaign-action" data-reward-add="${idx}">+ ${esc(preset.label)}</button>
          `).join("")}
          <button type="button" class="campaign-action" data-reward-add-item>+ Item</button>
        </div>
        <div class="campaign-reward-list" id="campaign-reward-list"></div>
      </div>

      <div class="campaign-quest-section">
        <div class="campaign-quest-section-title">
          <span>Failure Consequences</span>
          <small class="campaign-muted">Optional. Applied if you mark the quest Failed.</small>
        </div>
        <div class="campaign-objective-presets">
          ${QUEST_CONSEQUENCE_PRESETS.map((preset, idx) => `
            <button type="button" class="campaign-action" data-conseq-add="${idx}">+ ${esc(preset.label)}</button>
          `).join("")}
          <button type="button" class="campaign-action" data-conseq-add-note>+ Note Only</button>
        </div>
        <div class="campaign-reward-list" id="campaign-consequence-list"></div>
      </div>

      <div class="campaign-quest-builder-grid">
        <label class="form-label">Map movement <small class="campaign-muted">node or square grid</small>
          <select id="campaign-quest-map-form">
            <option value="node_map">Node Map</option>
            <option value="grid_map">Grid Map</option>
          </select>
        </label>
        <label class="form-label">Setting / context <small class="campaign-muted">visual theme and encounter pool</small>
          <select id="campaign-quest-map-type">
            ${mapTypeOptions.map((type) => `<option value="${type}">${esc(label(type))}</option>`).join("")}
          </select>
        </label>
        <label class="form-label">Map size <small class="campaign-muted">scenario length — grid sizes shown after slash</small>
          <select id="campaign-quest-map-size">
            <option value="tiny">Tiny (~5 nodes / 5×5 grid)</option>
            <option value="small" selected>Small (~7 nodes / 6×6 grid)</option>
            <option value="medium">Medium (~9 nodes / 8×6 grid)</option>
            <option value="large">Large (~12 nodes / 10×8 grid)</option>
            <option value="huge">Huge (~16 nodes / 14×11 grid)</option>
            <option value="massive">Massive (~22 nodes / 20×15 grid)</option>
          </select>
        </label>
      </div>
      <div class="campaign-preview" id="campaign-quest-preview" hidden></div>
    `;
  const footer = document.createElement("div");
  footer.innerHTML = `
      <button class="btn" id="campaign-add-quest-back">Cancel</button>
      <button class="btn" id="campaign-add-quest-commit">Add Quest</button>
      <button class="btn btn-primary" id="campaign-add-quest-start">Add &amp; Start Run</button>
    `;
  const overlay = ui.openModal({ title: "Add Quest", content: body, footer, width: "680px" });

  const $ = <T extends HTMLElement = HTMLInputElement>(sel: string): T => body.querySelector(sel) as T;
  const previewBox = $<HTMLElement>("#campaign-quest-preview");
  const objList = $<HTMLElement>("#campaign-objective-list");
  const rewardList = $<HTMLElement>("#campaign-reward-list");
  const consequenceList = $<HTMLElement>("#campaign-consequence-list");
  let currentTemplateVariant: QuestRecord | null = null;
  let objSeq = 0;

  function objectiveRow({ id, kind = "custom", label: lbl = "", required = 1, minigame = null }: QuestObjective = {}): HTMLElement {
    objSeq += 1;
    const rowId = id || `obj_${objSeq}`;
    const row = document.createElement("div");
    row.className = "campaign-objective-row";
    row.dataset.rowId = rowId;
    const mini = minigame ? questBuilderMiniGame(minigame) : null;
    if (mini?.gameId) row.dataset.minigameGameId = mini.gameId;
    if (mini?.levelId) row.dataset.minigameLevelId = mini.levelId;
    if (mini?.difficulty) row.dataset.minigameDifficulty = String(mini.difficulty);
    if (mini?.theme) row.dataset.minigameTheme = mini.theme;
    if (mini?.contextText) row.dataset.minigameContextText = mini.contextText;
    if (Array.isArray(mini?.conversation) && mini.conversation.length) row.dataset.minigameConversation = JSON.stringify(mini.conversation);
    if (mini?.bonusText) row.dataset.minigameBonusText = mini.bonusText;
    row.innerHTML = `
        <select class="campaign-objective-kind">
          ${QUEST_OBJECTIVE_PRESETS.map((p) => `<option value="${p.kind}" ${p.kind === kind ? "selected" : ""}>${p.icon} ${esc(p.label)}</option>`).join("")}
        </select>
        <input class="campaign-objective-label" type="text" value="${escAttr(lbl)}" placeholder="Objective label (use {what} to replace)">
        <input class="campaign-objective-count" type="number" min="1" max="99" value="${Math.max(1, Number(required) || 1)}" title="Required count">
        <button type="button" class="campaign-icon-btn campaign-objective-remove" aria-label="Remove">×</button>
      `;
    (row.querySelector(".campaign-objective-remove") as HTMLButtonElement).onclick = () => {
      row.remove();
      refreshPreview();
    };
    row.querySelectorAll("select,input").forEach((el) => el.addEventListener("input", refreshPreview));
    return row;
  }

  function addObjective(opts: QuestObjective = {}): void {
    objList.appendChild(objectiveRow(opts));
    refreshPreview();
  }

  function rewardRow({ op = "give_money", label: lbl = "Gold", amount = 50, itemId = "" }: { op?: string; label?: string; amount?: number; itemId?: string } = {}): HTMLElement {
    const row = document.createElement("div");
    row.className = "campaign-reward-row";
    const isItem = op === "give_item" || op === "give_material" || op === "give_quest_item";
    row.innerHTML = `
        <span class="campaign-pill">${esc(lbl)}</span>
        ${isItem ? `<input class="campaign-reward-id" type="text" placeholder="item_id" value="${escAttr(itemId)}">` : ""}
        <input class="campaign-reward-amount" type="number" value="${Number(amount) || 0}" min="0">
        <button type="button" class="campaign-icon-btn campaign-reward-remove" aria-label="Remove">×</button>
      `;
    row.dataset.op = op;
    row.dataset.label = lbl;
    (row.querySelector(".campaign-reward-remove") as HTMLButtonElement).onclick = () => {
      row.remove();
      refreshPreview();
    };
    row.querySelectorAll("input").forEach((el) => el.addEventListener("input", refreshPreview));
    return row;
  }

  function consequenceRow({ op = "take_money", label: lbl = "Lose Gold", amount = 50, text = "" }: { op?: string; label?: string; amount?: number; text?: string } = {}): HTMLElement {
    const row = document.createElement("div");
    row.className = "campaign-reward-row";
    const isNote = op === "log";
    row.innerHTML = `
        <span class="campaign-pill is-danger">${esc(lbl)}</span>
        ${isNote ? `<input class="campaign-reward-text" type="text" placeholder="Note text" value="${escAttr(text)}">` : `<input class="campaign-reward-amount" type="number" value="${Number(amount) || 0}">`}
        <button type="button" class="campaign-icon-btn campaign-reward-remove" aria-label="Remove">×</button>
      `;
    row.dataset.op = op;
    row.dataset.label = lbl;
    (row.querySelector(".campaign-reward-remove") as HTMLButtonElement).onclick = () => {
      row.remove();
      refreshPreview();
    };
    row.querySelectorAll("input").forEach((el) => el.addEventListener("input", refreshPreview));
    return row;
  }

  function readObjectives(): QuestObjective[] {
    return Array.from(objList.querySelectorAll(".campaign-objective-row")).map((rowEl, idx) => {
      const row = rowEl as HTMLElement;
      const kind = (row.querySelector(".campaign-objective-kind") as HTMLSelectElement).value;
      const lbl = (row.querySelector(".campaign-objective-label") as HTMLInputElement).value.trim();
      const required = Math.max(1, Number((row.querySelector(".campaign-objective-count") as HTMLInputElement).value) || 1);
      const objective: QuestObjective = {
        id: row.dataset.rowId || `obj_${idx + 1}`,
        label: lbl || `Objective ${idx + 1}`,
        kind,
        current: 0,
        required
      };
      if (kind === "minigame") {
        objective.minigame = questBuilderMiniGame({
          gameId: row.dataset.minigameGameId || "push_box",
          difficulty: Number(row.dataset.minigameDifficulty || 1),
          theme: row.dataset.minigameTheme || "ruins",
          levelId: row.dataset.minigameLevelId || "",
          contextText: row.dataset.minigameContextText || "",
          conversation: parseMiniGameConversation(row.dataset.minigameConversation),
          bonusText: row.dataset.minigameBonusText || ""
        });
        if (objective.minigame && !objective.minigame.levelId) delete objective.minigame.levelId;
      }
      return objective;
    });
  }

  function readRewards(): RewardEntry[] {
    return Array.from(rewardList.querySelectorAll(".campaign-reward-row"))
      .map((rowEl) => {
        const row = rowEl as HTMLElement;
        const op = row.dataset.op || "";
        const amount = Number((row.querySelector(".campaign-reward-amount") as HTMLInputElement | null)?.value || 0);
        if (op === "give_item" || op === "give_material" || op === "give_quest_item") {
          const id = (row.querySelector(".campaign-reward-id") as HTMLInputElement | null)?.value.trim() || "";
          return { op, id, amount };
        }
        if (op === "add_xp") return { op, amount, broadcast: true };
        return { op, amount };
      })
      .filter((entry) => entry.amount > 0 || (entry.op?.startsWith("give_") && entry.id));
  }

  function readConsequences(): ConsequenceEntry[] {
    return Array.from(consequenceList.querySelectorAll(".campaign-reward-row"))
      .map((rowEl): ConsequenceEntry | null => {
        const row = rowEl as HTMLElement;
        const op = row.dataset.op || "";
        if (op === "log") {
          const text = (row.querySelector(".campaign-reward-text") as HTMLInputElement | null)?.value.trim() || "";
          return text ? { op: "log", text } : null;
        }
        if (op === "hub_problem_add") {
          return { op: "hub_problem_add", label: "Quest failed" };
        }
        const amount = Number((row.querySelector(".campaign-reward-amount") as HTMLInputElement | null)?.value || 0);
        return { op, amount };
      })
      .filter((entry): entry is ConsequenceEntry => !!entry);
  }

  function applyTemplate(template: QuestRecord | null): void {
    currentTemplateVariant = template?.randomVariant ? template : null;
    $("#campaign-quest-title").value = template?.title || "";
    $<HTMLTextAreaElement>("#campaign-quest-summary").value = template?.summary || "";
    $("#campaign-quest-giver").value = template?.giver || "";
    $("#campaign-quest-tags").value = (template?.tags || []).join(", ");
    objList.innerHTML = "";
    (template?.objectives || []).forEach((obj) =>
      addObjective({
        id: obj.id,
        kind: obj.kind || inferObjectiveKind(obj.label || ""),
        label: obj.label || obj.id || "",
        required: Math.max(1, Number(obj.required || 1)),
        minigame: obj.minigame || obj.miniGame || null
      })
    );
    if (!objList.children.length) addObjective({ kind: "reach", label: "Reach the destination", required: 1 });
    rewardList.innerHTML = "";
    (template?.rewards || template?.rewardOps || []).forEach((reward) => {
      if (!reward?.op) return;
      const preset = QUEST_REWARD_PRESETS.find((p) => p.op === reward.op);
      rewardList.appendChild(
        rewardRow({
          op: reward.op,
          label: preset?.label || label(reward.op),
          amount: reward.amount || preset?.defaultAmount || 0,
          itemId: reward.id || ""
        })
      );
    });
    consequenceList.innerHTML = "";
    (template?.failureConsequences || template?.failureOps || []).forEach((entry) => {
      if (!entry?.op) return;
      const preset = QUEST_CONSEQUENCE_PRESETS.find((p) => p.op === entry.op);
      consequenceList.appendChild(
        consequenceRow({
          op: entry.op,
          label: preset?.label || label(entry.op),
          amount: Math.abs(entry.amount || preset?.defaultAmount || 0),
          text: entry.text || ""
        })
      );
    });
    const mapType = template?.mapType || questMapType((template || {}) as Parameters<typeof questMapType>[0]);
    const sel = $<HTMLSelectElement>("#campaign-quest-map-type");
    if (sel && Array.from(sel.options).some((opt) => opt.value === mapType)) sel.value = mapType;
    const formSel = $<HTMLSelectElement>("#campaign-quest-map-form");
    const mapForm = template?.mapForm || questMapForm((template || {}) as Parameters<typeof questMapForm>[0]);
    if (formSel && Array.from(formSel.options).some((opt) => opt.value === mapForm)) formSel.value = mapForm;
    const sizeSel = $<HTMLSelectElement>("#campaign-quest-map-size");
    if (sizeSel && template?.mapSize && Array.from(sizeSel.options).some((opt) => opt.value === template.mapSize)) {
      sizeSel.value = template.mapSize;
    }
    refreshPreview();
  }

  function buildQuest(): QuestRecord {
    const templateId = $<HTMLSelectElement>("#campaign-quest-template").value;
    const rawTemplate = templates.find((q) => q.id === templateId);
    const template = currentTemplateVariant || rawTemplate;
    const title = $("#campaign-quest-title").value.trim();
    const summary = $<HTMLTextAreaElement>("#campaign-quest-summary").value.trim();
    const giver = $("#campaign-quest-giver").value.trim();
    const tags = $("#campaign-quest-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const objectives = readObjectives();
    const rewards = readRewards();
    const failureConsequences = readConsequences();
    const base: QuestRecord = template
      ? (cs().clone(template) as QuestRecord)
      : {
          id: `quest_${Date.now()}`,
          title: title || "New Quest",
          status: "active",
          summary,
          objectives: [],
          rewards: []
        };
    if (rawTemplate) {
      base.templateId = rawTemplate.id;
      base.id = `quest_${safe(rawTemplate.id)}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    } else {
      base.id = base.id || `quest_${Date.now()}`;
    }
    base.status = "active";
    if (title) base.title = title;
    if (summary) base.summary = summary;
    if (giver) base.giver = giver;
    if (tags.length) base.tags = tags;
    base.objectives = objectives.length ? objectives : [{ id: "obj_1", kind: "reach", label: "Reach the destination", current: 0, required: 1 }];
    base.rewards = rewards;
    if (failureConsequences.length) base.failureConsequences = failureConsequences;
    else delete base.failureConsequences;
    const mapType = $<HTMLSelectElement>("#campaign-quest-map-type").value;
    if (mapType) base.mapType = mapType;
    const mapForm = $<HTMLSelectElement>("#campaign-quest-map-form").value;
    if (mapForm) base.mapForm = mapForm;
    const mapSize = $<HTMLSelectElement>("#campaign-quest-map-size").value;
    if (mapSize) base.mapSize = mapSize;
    // If the user picked a map movement that disagrees with the template's
    // linked scenario, drop the linked scenario fields so the quest runs a
    // freshly generated map of the chosen kind.
    const templateMapForm = String(template?.mapForm || template?.travelMode || "").toLowerCase();
    const chosenMapForm = String(mapForm || "").toLowerCase();
    if (template && chosenMapForm && templateMapForm && chosenMapForm !== templateMapForm) {
      delete base.linkedScenario;
      delete base.linkedMapNodes;
      delete base.linkedMapCells;
      delete base.scenarioId;
      delete base.scenario;
      base.forceGeneratedMap = true;
    }
    // Manual-builder quests default to the lightweight narrative flow.
    if (base.quickNarrative !== false) base.quickNarrative = true;
    return base;
  }

  function refreshPreview(): void {
    const quest = buildQuest();
    const lines: string[] = [];
    lines.push(`<b>${esc(quest.title || "Untitled quest")}</b>`);
    if (quest.summary) lines.push(esc(quest.summary));
    if (quest.objectives?.length) {
      lines.push(`<b>Objectives:</b> ${quest.objectives.map((o) => `${esc(o.label)} (0/${o.required})`).join(" · ")}`);
    }
    if (quest.rewards?.length) {
      lines.push(`<b>Rewards:</b> ${quest.rewards.map((r) => `${label(r.op)} ${r.amount || r.id || ""}`).join(" · ")}`);
    }
    if (quest.failureConsequences?.length) {
      lines.push(`<b>On fail:</b> ${quest.failureConsequences.map((r) => `${label(r.op)} ${r.amount || r.text || ""}`).join(" · ")}`);
    }
    lines.push(`<b>Map movement:</b> ${quest.mapForm === "grid_map" ? "Grid Map" : "Node Map"}`);
    lines.push(`<b>Setting/context:</b> ${esc(label(quest.mapType || "any"))}`);
    if (quest.giver) lines.push(`<b>Giver:</b> ${esc(quest.giver)}`);
    if (quest.tags?.length) lines.push(`<b>Tags:</b> ${quest.tags.map((t) => esc(t)).join(", ")}`);
    if (quest.randomVariant) lines.push(`<b>Variant:</b> ${esc(quest.randomVariant)}`);
    previewBox.innerHTML = lines.join("<br>");
    previewBox.hidden = false;
  }

  $<HTMLSelectElement>("#campaign-quest-template").addEventListener("change", (ev) => {
    const tpl = templates.find((q) => q.id === (ev.target as HTMLSelectElement).value);
    currentTemplateVariant = null;
    applyTemplate(tpl || null);
  });
  body
    .querySelectorAll("input:not(.campaign-objective-label):not(.campaign-objective-count):not(.campaign-reward-amount):not(.campaign-reward-id):not(.campaign-reward-text), textarea, select")
    .forEach((el) => {
      if ((el as HTMLElement).id !== "campaign-quest-template") el.addEventListener("input", refreshPreview);
    });

  body.querySelectorAll("[data-preset-kind]").forEach((btnEl) => {
    const btn = btnEl as HTMLElement;
    (btn as HTMLButtonElement).onclick = () => {
      const preset = QUEST_OBJECTIVE_PRESETS.find((p) => p.kind === btn.dataset.presetKind);
      if (!preset) return;
      addObjective({
        kind: preset.kind,
        label: preset.template.replace("{what}", "...") || preset.label,
        required: preset.required,
        minigame: preset.minigame || null
      });
    };
  });
  body.querySelectorAll("[data-reward-add]").forEach((btnEl) => {
    const btn = btnEl as HTMLElement;
    (btn as HTMLButtonElement).onclick = () => {
      const preset = QUEST_REWARD_PRESETS[Number(btn.dataset.rewardAdd)];
      if (!preset) return;
      rewardList.appendChild(rewardRow({ op: preset.op, label: preset.label, amount: preset.defaultAmount }));
      refreshPreview();
    };
  });
  (body.querySelector("[data-reward-add-item]") as HTMLButtonElement).onclick = () => {
    rewardList.appendChild(rewardRow({ op: "give_item", label: "Item", amount: 1, itemId: "" }));
    refreshPreview();
  };
  body.querySelectorAll("[data-conseq-add]").forEach((btnEl) => {
    const btn = btnEl as HTMLElement;
    (btn as HTMLButtonElement).onclick = () => {
      const preset = QUEST_CONSEQUENCE_PRESETS[Number(btn.dataset.conseqAdd)];
      if (!preset) return;
      consequenceList.appendChild(consequenceRow({ op: preset.op, label: preset.label, amount: preset.defaultAmount }));
      refreshPreview();
    };
  });
  (body.querySelector("[data-conseq-add-note]") as HTMLButtonElement).onclick = () => {
    consequenceList.appendChild(consequenceRow({ op: "log", label: "Note Only", text: "Quest failed." }));
    refreshPreview();
  };

  $<HTMLButtonElement>("#campaign-quest-roll").onclick = () => {
    if (!templates.length) return;
    const tpl = randomizedQuestTemplate(templates[Math.floor(Math.random() * templates.length)]);
    $<HTMLSelectElement>("#campaign-quest-template").value = tpl.id || "";
    applyTemplate(tpl);
  };
  $<HTMLButtonElement>("#campaign-quest-clear").onclick = () => {
    $<HTMLSelectElement>("#campaign-quest-template").value = "";
    currentTemplateVariant = null;
    applyTemplate(null);
  };
  (footer.querySelector("#campaign-add-quest-back") as HTMLButtonElement).onclick = () => ui.closeModal(overlay);
  (footer.querySelector("#campaign-add-quest-commit") as HTMLButtonElement).onclick = () => {
    const quest = buildQuest();
    ops().apply({ op: "add_quest", quest } as OpInput, { source: "ui" });
    ui.closeModal(overlay);
    ui.toast(`Quest added: ${quest.title}`, "success");
  };
  (footer.querySelector("#campaign-add-quest-start") as HTMLButtonElement).onclick = () => {
    if (cs().getState()?.activeScenarioRun) {
      ui.toast("Finish the active scenario before starting a new run", "info");
      return;
    }
    const quest = buildQuest();
    ops().apply({ op: "add_quest", quest } as OpInput, { source: "ui" });
    ui.closeModal(overlay);
    ui.toast(`Quest added: ${quest.title}. Starting run…`, "success");
    mod<QuestLauncherModule>("CampaignQuestLauncher")?.startQuestScenario?.(quest.id || "", {
      quest,
      mapForm: questMapForm(quest as Parameters<typeof questMapForm>[0]),
      mapType: quest.mapType || questMapType(quest as Parameters<typeof questMapType>[0]),
      size: quest.mapSize || "small",
      forceGenerated: !!quest.forceGeneratedMap
    });
  };

  if (prefill && prefill.template) {
    const tpl = templates.find((q) => q.id === prefill.template) || null;
    $<HTMLSelectElement>("#campaign-quest-template").value = prefill.template;
    applyTemplate(tpl);
  } else {
    applyTemplate(null);
  }
  refreshPreview();
}
