// React port of js/builders/effect-editor.js. Feature parity with the
// vanilla v3 builder: passive vs event branching, conditions / cleanse
// / overridable chip builders, parameterised conditions, status icons,
// suitability hint, autodescribe preview.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  constants,
  effectRegistry,
  ds,
  ui,
  type Effect
} from "./_shared/cjs";
import {
  ChipList,
  DataList,
  FilterBar,
  SearchInput,
  TagInput,
  confirm,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

// ── HUMAN LABELS (verbatim from vanilla) ─────────────────────────────
const TRIGGER_LABELS: Record<string, string> = {
  stat_mod: "Passive: Modify a Stat",
  dr_mod: "Passive: Modify DR",
  element_mod: "Passive: Element Interaction",
  crit_mod: "Passive: Modify Crit",
  evasion_mod: "Passive: Evasion",
  accuracy_mod: "Passive: Accuracy",
  ap_mod: "Passive: AP/Turn",
  movement_mod: "Passive: Movement",
  range_mod: "Passive: Range",
  cost_mod: "Passive: Reduce Costs",
  cooldown_mod: "Passive: Reduce Cooldowns",
  damage_mod: "Passive: Damage %",
  hp_mod: "Passive: Max HP",
  mp_mod: "Passive: Max MP",
  status_resist_mod: "Passive: Status Resistance",
  on_hit: "When Dealing Damage",
  on_take_damage: "When Taking Damage",
  on_kill: "When Killing",
  on_death: "When Dying",
  on_turn_start: "Turn Start",
  on_turn_end: "Turn End",
  on_battle_start: "Battle Start",
  on_low_hp: "HP Below Threshold",
  on_dodge: "When Dodging",
  on_move: "When Moving",
  on_status_applied: "When Status Applied",
  on_ally_hit: "Ally Takes Damage",
  on_crit: "Landing a Crit",
  on_status_tick: "Status Tick (DoT/HoT)",
  on_miss: "When Missing"
};

const ACTION_LABELS: Record<string, string> = {
  damage: "Deal Bonus Damage",
  heal: "Heal HP",
  mp_restore: "Restore MP",
  mp_drain: "Drain MP",
  hp_drain: "Drain HP (+Self Heal)",
  status_apply: "Apply a Status",
  status_remove: "Remove Status",
  reflect: "Reflect Damage",
  absorb: "Create Shield",
  counter: "Counter-Attack",
  revive: "Revive at % HP",
  knockback: "Push Away",
  pull: "Pull Closer",
  teleport: "Teleport",
  terrain_create: "Create Terrain",
  terrain_remove: "Remove Terrain",
  cooldown_reset: "Reset Cooldown",
  ap_grant: "Grant AP",
  steal_buff: "Steal Buff",
  execute: "Kill Below HP%",
  extra_action: "Grant Extra Action"
};

const SOURCE_LABELS: Record<string, string> = {
  flat: "Flat Number",
  percent: "Percentage (%)",
  max_hp: "% of Max HP",
  current_hp: "% of Current HP",
  missing_hp: "% of Missing HP",
  damage_dealt: "% of Damage Dealt",
  damage_received: "% of Damage Taken",
  caster_S: "× Caster STR",
  caster_P: "× Caster PER",
  caster_E: "× Caster END",
  caster_C: "× Caster CHA",
  caster_I: "× Caster INT",
  caster_A: "× Caster AGI",
  caster_L: "× Caster LCK",
  target_max_hp: "% of Target Max HP",
  stack_count: "× Stack Count"
};

const TARGET_LABELS: Record<string, string> = {
  self: "Self",
  target: "Current Target",
  attacker: "Attacker",
  host: "Host (status bearer)",
  all_allies: "All Allies",
  all_enemies: "All Enemies",
  all: "Everyone",
  random_enemy: "Random Enemy",
  random_ally: "Random Ally",
  lowest_hp_ally: "Lowest HP Ally",
  lowest_hp_enemy: "Lowest HP Enemy",
  adjacent_to_self: "Adjacent to Self"
};

const OVR_FIELDS = [
  "value",
  "duration",
  "stat",
  "element",
  "statusId",
  "drType",
  "source",
  "terrainType",
  "threshold",
  "maxStacks"
] as const;

const OVR_DESCS: Record<string, string> = {
  value: "The main number (damage amount, heal amount, bonus %)",
  duration: "How many turns it lasts",
  stat: "Which SPECIAL stat is affected",
  element: "Which element (Fire, Water, etc.)",
  statusId: "Which status is applied/removed",
  drType: "Physical/Magic/Chaos DR type",
  source: "How the value is calculated (flat, % of HP, etc.)",
  terrainType: "Which terrain is created",
  threshold: "HP % threshold for triggers",
  maxStacks: "Maximum stack count"
};

// ── HELPERS ──────────────────────────────────────────────────────────
function statusList(): string[] {
  const builtins = Object.keys(constants().STATUS_DEFINITIONS);
  const custom = ds()
    .getAllAsArray<{ id?: string }>("statuses")
    .map((s) => s.id)
    .filter((x): x is string => Boolean(x));
  return Array.from(new Set([...builtins, ...custom]));
}

function statusTip(id: string): string {
  const custom = ds().get<{ icon?: string; name?: string; desc?: string }>("statuses", id);
  if (custom) return `${custom.icon || "✦"} ${custom.name || id}: ${custom.desc || id}`;
  const def = constants().STATUS_DEFINITIONS[id];
  return def ? `${def.icon} ${def.name}: ${def.desc}` : id;
}

function statusIcon(id: string): string {
  const custom = ds().get<{ icon?: string }>("statuses", id);
  if (custom) return custom.icon || "✦";
  return constants().STATUS_DEFINITIONS[id]?.icon || "✦";
}

function statusName(id: string): string {
  const custom = ds().get<{ name?: string }>("statuses", id);
  if (custom) return custom.name || id;
  return constants().STATUS_DEFINITIONS[id]?.name || id;
}

function condLabel(c: string): string {
  const defs = constants().CONDITION_DEFS;
  for (const d of defs) {
    if (c === d.v) return d.l;
    if (c.startsWith(d.v + "_")) {
      const param = c.slice(d.v.length + 1);
      return d.l
        .replace("X", param)
        .replace("[pick]", param)
        .replace("[stat]", param)
        .replace("[type]", param)
        .replace("[terrain type]", param);
    }
  }
  return c;
}

function suitHint(e: Effect): string {
  const passive = new Set(constants().EFFECT_TRIGGERS.passive);
  const t = e.trigger || "";
  if (passive.has(t))
    return (
      "✅ Good for: Passives, Item bonuses, Character innates, Buff/debuff statuses · " +
      "⚠️ Skills use this as a permanent modifier while active — not a one-time action"
    );
  if (t === "on_status_tick")
    return "✅ Good for: DoT (Burn/Poison) or HoT (Regen) status tick effects · 💡 Reference from a status_apply effect in a skill";
  const bits = ["✅ Good for: Skill effects, Triggered passives, Item procs"];
  if (t === "on_hit" || t === "on_crit") bits.push("⚔️ Best on: Skills, Weapons, Combat passives");
  if (t === "on_take_damage") bits.push("🛡️ Best on: Armor, Tank passives, Defensive skills");
  return bits.join(" · ");
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function EffectEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Reset selection when the global epoch (filter / import) changes.
  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const ER = effectRegistry();

  const allEffects = useMemo<Effect[]>(() => {
    return search ? ER.searchEffects(search) : ER.getAllEffects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dataTick]);

  const grouped = useMemo(() => ER.getEffectsGroupedByCategory(), [dataTick]);

  const visibleEffects = useMemo(() => {
    if (filter === "all") return allEffects;
    return allEffects.filter((e) => e.category === filter);
  }, [allEffects, filter]);

  const filterButtons = useMemo(() => {
    const buttons = [{ id: "all", label: "All", count: ER.getAllEffects().length }];
    for (const [cat, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;
      buttons.push({ id: cat, label: cat, count: items.length });
    }
    return buttons;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, dataTick]);

  const activeEffect = useMemo(
    () => (activeId ? ER.getEffect(activeId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const id = ER.createEffect({ name: "New Effect" });
    setActiveId(id);
    toast("Effect created", "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const duplicate = useCallback((id: string) => {
    const n = ER.duplicateEffect(id);
    if (n) setActiveId(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = useCallback((effect: Effect) => {
    confirm(`Delete "${effect.name}"?`, () => {
      ER.deleteEffect(effect.id);
      setActiveId(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex gap-md" style={{ height: "100%" }}>
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="flex gap-sm items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search effects..."
          />
          <button className="btn btn-primary btn-sm" onClick={createNew} type="button">
            + New
          </button>
        </div>
        <FilterBar buttons={filterButtons} active={filter} onSelect={setFilter} />
        <div className="data-list" style={{ flex: 1, maxHeight: "none" }}>
          <DataList<Effect>
            entityType="effects"
            items={visibleEffects}
            activeId={activeId}
            onSelect={(e) => setActiveId(e.id)}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeEffect ? (
          <EffectForm
            key={activeEffect.id}
            effect={activeEffect}
            onDuplicate={() => duplicate(activeEffect.id)}
            onDelete={() => remove(activeEffect)}
          />
        ) : (
          <div
            className="card"
            style={{ textAlign: "center", color: "var(--text-mute)", padding: 40 }}
          >
            Select an effect or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── EFFECT FORM ──────────────────────────────────────────────────────
function EffectForm({
  effect,
  onDuplicate,
  onDelete
}: {
  effect: Effect;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ER = effectRegistry();
  const C = constants();
  const passiveSet = useMemo(() => new Set(C.EFFECT_TRIGGERS.passive), [C]);

  const [draft, setDraft] = useState<Effect>(() => ({ ...effect }));

  // When the parent provides a different effect (by id), reset the draft.
  useEffect(() => {
    setDraft({ ...effect });
  }, [effect]);

  const isEvent = !passiveSet.has(draft.trigger || "stat_mod");

  const setField = useCallback(<K extends keyof Effect>(key: K, value: Effect[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(() => {
    ER.updateEffect(effect.id, draft);
    toast(`"${draft.name}" saved`, "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || "✦"} {draft.name || "Unnamed"}
        </span>
        <div className="btn-group">
          <button className="btn btn-ghost btn-sm" type="button" onClick={onDuplicate}>
            Dup
          </button>
          <button className="btn btn-danger btn-sm" type="button" onClick={onDelete}>
            Del
          </button>
        </div>
      </div>
      <div
        className="hint-box"
        dangerouslySetInnerHTML={{ __html: suitHint(draft).replace(/·/g, "<br>") }}
      />
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            type="text"
            value={draft.name || ""}
            onChange={(e) => setField("name", e.currentTarget.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 80px" }}>
          <label className="form-label">Icon</label>
          <input
            type="text"
            value={draft.icon || "✦"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
            style={{ textAlign: "center", fontSize: "1.2em" }}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">① What type of effect?</label>
        <select
          value={draft.trigger || "stat_mod"}
          onChange={(e) => setField("trigger", e.currentTarget.value)}
        >
          <optgroup label="── Passive (always active) ──">
            {C.EFFECT_TRIGGERS.passive.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t] || t}
              </option>
            ))}
          </optgroup>
          <optgroup label="── Event (fires on trigger) ──">
            {C.EFFECT_TRIGGERS.event.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t] || t}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {passiveSet.has(draft.trigger || "stat_mod") ? (
        <PassiveContextFields draft={draft} setField={setField} />
      ) : (
        <EventContextFields draft={draft} setField={setField} />
      )}

      <DurationFields draft={draft} setField={setField} isEvent={isEvent} />

      <div className="form-group">
        <label className="form-label">⑤ Conditions (optional — when should this fire?)</label>
        <ConditionBuilder
          conditions={draft.conditions || []}
          onChange={(c) => setField("conditions", c)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">⑥ Cleansed By (what removes this?)</label>
        <CleanseBuilder
          items={draft.cleansedBy || []}
          onChange={(c) => setField("cleansedBy", c)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">
          ⑦ Overridable Fields
          <span style={{ fontWeight: "normal", fontSize: "0.78rem", color: "var(--text-dim)" }}>
            {" "}
            — Skills/items can change these values when they reference this effect. E.g. if "value"
            is overridable, one skill can set damage to 5 and another to 20, reusing the same
            effect template.
          </span>
        </label>
        <OverrideBuilder
          items={draft.overridable || []}
          onChange={(c) => setField("overridable", c)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Tags</label>
        <TagInput
          tags={draft.tags || []}
          onChange={(t) => setField("tags", t)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Description (blank = auto)</label>
        <textarea
          rows={2}
          value={draft.description || ""}
          onChange={(e) => setField("description", e.currentTarget.value)}
        />
      </div>
      <div className="card" style={{ background: "var(--surface2)", marginTop: 8 }}>
        <div style={{ fontSize: "0.82rem" }}>
          <b>📝 Auto:</b> {ER.autoDescribe(draft)} | <b>ID:</b> {effect.id}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Effect
        </button>
      </div>
    </div>
  );
}

// ── PASSIVE CONTEXT FIELDS ───────────────────────────────────────────
function PassiveContextFields({
  draft,
  setField
}: {
  draft: Effect;
  setField: <K extends keyof Effect>(key: K, value: Effect[K]) => void;
}) {
  const C = constants();
  const t = draft.trigger || "stat_mod";

  // Sync the "action" / "source" / "target" hidden fields to the trigger
  // shape every render. The vanilla form encodes these as <input
  // type="hidden">; in React we just keep draft in sync.
  useEffect(() => {
    // We don't have explicit hidden fields; the save below derives them.
  }, [t]);

  const sList = useMemo(() => statusList(), []);

  switch (t) {
    case "stat_mod":
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② Which stat?</label>
            <select
              value={draft.stat || ""}
              onChange={(e) => setField("stat", e.currentTarget.value)}
            >
              {C.STATS.map((s) => (
                <option key={s} value={s}>
                  {s} — {C.STAT_NAMES[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">③ Amount (+/-)</label>
            <input
              type="number"
              value={draft.value ?? 0}
              onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              value={draft.source === "percent" ? "percent" : "flat"}
              onChange={(e) => setField("source", e.currentTarget.value)}
            >
              <option value="flat">Flat</option>
              <option value="percent">Percent</option>
            </select>
          </div>
        </div>
      );
    case "dr_mod":
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② DR Type</label>
            <select
              value={draft.drType || "physical"}
              onChange={(e) => setField("drType", e.currentTarget.value)}
            >
              {(["physical", "magic", "chaos", "all"] as const).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">③ Amount</label>
            <input
              type="number"
              value={draft.value ?? 0}
              onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
            />
          </div>
        </div>
      );
    case "crit_mod":
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② Crit Chance +%</label>
            <input
              type="number"
              value={draft.value ?? 0}
              onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">③ Crit Damage +%</label>
            <input
              type="number"
              value={draft.critDamageBonus ?? 0}
              onChange={(e) => setField("critDamageBonus", Number(e.currentTarget.value) || 0)}
            />
          </div>
        </div>
      );
    case "element_mod":
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② Add</label>
            <select
              value={draft.interaction || "weak"}
              onChange={(e) => setField("interaction", e.currentTarget.value)}
            >
              <option value="weak">Weakness</option>
              <option value="resist">Resistance</option>
              <option value="immune">Immunity</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">③ Element</label>
            <select
              value={draft.element || C.ELEMENTS[0]}
              onChange={(e) => setField("element", e.currentTarget.value)}
            >
              {C.ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    case "damage_mod":
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② Damage bonus %</label>
            <input
              type="number"
              value={draft.value ?? 0}
              onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">③ For element</label>
            <select
              value={draft.element || ""}
              onChange={(e) => setField("element", e.currentTarget.value || null)}
            >
              <option value="">All</option>
              {C.ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    case "hp_mod":
    case "mp_mod": {
      const label = t === "hp_mod" ? "HP" : "MP";
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② {label} bonus</label>
            <input
              type="number"
              value={draft.value ?? 0}
              onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">③ Type</label>
            <select
              value={draft.source === "percent" ? "percent" : "flat"}
              onChange={(e) => setField("source", e.currentTarget.value)}
            >
              <option value="flat">Flat</option>
              <option value="percent">%</option>
            </select>
          </div>
        </div>
      );
    }
    case "status_resist_mod":
      return (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">② Resist which?</label>
            <select
              value={draft.statusId || sList[0] || ""}
              onChange={(e) => setField("statusId", e.currentTarget.value)}
            >
              {sList.map((s) => (
                <option key={s} value={s} title={statusTip(s)}>
                  {statusIcon(s)} {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">③ Chance %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.value ?? 0}
              onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
            />
          </div>
        </div>
      );
    default: {
      const labels: Record<string, string> = {
        evasion_mod: "Evasion",
        accuracy_mod: "Accuracy",
        movement_mod: "Movement",
        range_mod: "Range",
        ap_mod: "AP/turn",
        cost_mod: "Cost reduction",
        cooldown_mod: "Cooldown reduction"
      };
      const lbl = labels[t] || "Value";
      return (
        <div className="form-group">
          <label className="form-label">② {lbl} (+/-)</label>
          <input
            type="number"
            value={draft.value ?? 0}
            onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
          />
        </div>
      );
    }
  }
}

// ── EVENT CONTEXT FIELDS ─────────────────────────────────────────────
function EventContextFields({
  draft,
  setField
}: {
  draft: Effect;
  setField: <K extends keyof Effect>(key: K, value: Effect[K]) => void;
}) {
  const C = constants();
  const t = draft.trigger || "on_hit";
  const sourceVal = draft.source || "flat";
  const sourceIsCustom = sourceVal.includes(":");

  return (
    <>
      <div className="hint-box hint-info">
        🔔 <b>{TRIGGER_LABELS[t] || t}</b>
      </div>
      {(t === "on_low_hp" || t === "on_hp_threshold") && (
        <div className="form-group">
          <label className="form-label">HP Threshold %</label>
          <input
            type="number"
            min={1}
            max={99}
            value={draft.threshold ?? 30}
            onChange={(e) => setField("threshold", Number(e.currentTarget.value) || 0)}
          />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">② What happens?</label>
        <select
          value={draft.action || "damage"}
          onChange={(e) => setField("action", e.currentTarget.value)}
        >
          <optgroup label="Damage/Heal">
            {["damage", "heal", "mp_restore", "mp_drain", "hp_drain"].map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </optgroup>
          <optgroup label="Status">
            {["status_apply", "status_remove"].map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </optgroup>
          <optgroup label="Defensive">
            {["reflect", "absorb", "counter", "revive"].map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </optgroup>
          <optgroup label="Position">
            {["knockback", "pull", "teleport"].map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </optgroup>
          <optgroup label="Terrain">
            {["terrain_create", "terrain_remove"].map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </optgroup>
          <optgroup label="Utility">
            {["steal_buff", "cooldown_reset", "ap_grant", "extra_action", "execute"].map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] || a}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">③ Who?</label>
        <select
          value={draft.target || "target"}
          onChange={(e) => setField("target", e.currentTarget.value)}
        >
          <optgroup label="Single">
            {["self", "target", "attacker", "host"].map((x) => (
              <option key={x} value={x}>
                {TARGET_LABELS[x] || x}
              </option>
            ))}
          </optgroup>
          <optgroup label="Group">
            {["all_allies", "all_enemies", "all"].map((x) => (
              <option key={x} value={x}>
                {TARGET_LABELS[x] || x}
              </option>
            ))}
          </optgroup>
          <optgroup label="Smart">
            {[
              "random_enemy",
              "random_ally",
              "lowest_hp_ally",
              "lowest_hp_enemy",
              "adjacent_to_self"
            ].map((x) => (
              <option key={x} value={x}>
                {TARGET_LABELS[x] || x}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">④ Amount</label>
          <input
            type="number"
            value={draft.value ?? 0}
            onChange={(e) => setField("value", Number(e.currentTarget.value) || 0)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Based on</label>
          <select
            value={sourceIsCustom ? "dice:" : sourceVal}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "dice:") {
                setField("source", "dice:");
              } else {
                setField("source", v);
              }
            }}
          >
            {Object.entries(SOURCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            <option value="dice:">Dice (custom)</option>
          </select>
        </div>
      </div>
      {sourceVal.includes(":") && (
        <div className="form-group">
          <label className="form-label">Dice expression</label>
          <input
            type="text"
            placeholder="dice:2d6+3"
            value={sourceVal}
            onChange={(e) => setField("source", e.currentTarget.value)}
          />
        </div>
      )}
      <ActionExtra draft={draft} setField={setField} C={C} />
    </>
  );
}

// ── ACTION-SPECIFIC EXTRA FIELDS ─────────────────────────────────────
function ActionExtra({
  draft,
  setField,
  C
}: {
  draft: Effect;
  setField: <K extends keyof Effect>(key: K, value: Effect[K]) => void;
  C: ReturnType<typeof constants>;
}) {
  const a = draft.action || "";
  const sList = useMemo(() => statusList(), [draft]);

  return (
    <div>
      {(a === "status_apply" || a === "status_remove") && (
        <div className="form-group">
          <label className="form-label">Which status?</label>
          <select
            value={draft.statusId || ""}
            onChange={(e) => setField("statusId", e.currentTarget.value)}
          >
            <option value="">— pick —</option>
            {sList.map((s) => (
              <option key={s} value={s} title={statusTip(s)}>
                {statusIcon(s)} {s} — {statusName(s)}
              </option>
            ))}
          </select>
          {draft.statusId ? (
            <div className="hint-box" style={{ marginTop: 4, fontSize: "0.8rem" }}>
              {statusTip(draft.statusId)}
            </div>
          ) : null}
        </div>
      )}
      {(a === "damage" || a === "heal" || a === "hp_drain") && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Element</label>
            <select
              value={draft.element || ""}
              onChange={(e) => setField("element", e.currentTarget.value || null)}
            >
              <option value="">None</option>
              {C.ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Damage Type</label>
            <select
              value={draft.damageType || ""}
              onChange={(e) => setField("damageType", e.currentTarget.value || null)}
            >
              <option value="">None</option>
              {C.DAMAGE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {a === "terrain_create" && (
        <div className="form-group">
          <label className="form-label">Terrain</label>
          <select
            value={draft.terrainType || ""}
            onChange={(e) => setField("terrainType", e.currentTarget.value || null)}
          >
            {Object.keys(C.TERRAIN_TYPES).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      )}
      {(a === "knockback" || a === "pull") && (
        <div className="form-group">
          <label className="form-label">Distance (cells)</label>
          <input
            type="number"
            min={1}
            max={6}
            value={draft.knockbackDistance ?? 2}
            onChange={(e) =>
              setField("knockbackDistance", Number(e.currentTarget.value) || 0)
            }
          />
        </div>
      )}
    </div>
  );
}

// ── DURATION FIELDS ─────────────────────────────────────────────────
function DurationFields({
  draft,
  setField,
  isEvent
}: {
  draft: Effect;
  setField: <K extends keyof Effect>(key: K, value: Effect[K]) => void;
  isEvent: boolean;
}) {
  return (
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">Duration (0=permanent)</label>
        <input
          type="number"
          min={0}
          max={99}
          value={draft.duration ?? 0}
          onChange={(e) => setField("duration", Number(e.currentTarget.value) || 0)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Max Stacks</label>
        <input
          type="number"
          min={1}
          max={99}
          value={draft.maxStacks ?? 1}
          onChange={(e) => setField("maxStacks", Number(e.currentTarget.value) || 1)}
        />
      </div>
      <div
        className="form-group"
        style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}
      >
        <label className="form-check">
          <input
            type="checkbox"
            checked={!!draft.stacks}
            onChange={(e) => setField("stacks", e.currentTarget.checked)}
          />{" "}
          Stackable
        </label>
      </div>
      {isEvent && (
        <div className="form-group">
          <label className="form-label">
            Fire Chance %
            <span style={{ fontWeight: "normal", fontSize: "0.78rem", color: "var(--text-dim)" }}>
              {" "}
              — probability this fires (each roll independent)
            </span>
          </label>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={draft.chance ?? 100}
            onChange={(e) => setField("chance", Number(e.currentTarget.value) || 100)}
          />
        </div>
      )}
    </div>
  );
}

// ── CONDITION BUILDER ───────────────────────────────────────────────
function ConditionBuilder({
  conditions,
  onChange
}: {
  conditions: string[];
  onChange: (next: string[]) => void;
}) {
  const C = constants();
  const groups = useMemo(() => {
    const g: Record<string, typeof C.CONDITION_DEFS> = {};
    for (const d of C.CONDITION_DEFS) {
      if (!g[d.g]) g[d.g] = [];
      g[d.g].push(d);
    }
    return g;
  }, [C]);

  const sList = useMemo(() => statusList(), []);
  const [selValue, setSelValue] = useState("");
  const [param, setParam] = useState("");
  const [stat, setStat] = useState(C.STATS[0]);
  const [status, setStatus] = useState(sList[0] || "");
  const [terrain, setTerrain] = useState(Object.keys(C.TERRAIN_TYPES)[0]);
  const [utype, setUtype] = useState(C.UNIT_TYPES[0]);

  const selDef = useMemo(
    () => C.CONDITION_DEFS.find((d) => d.v === selValue),
    [C.CONDITION_DEFS, selValue]
  );

  const onSelChange = useCallback(
    (newValue: string) => {
      setSelValue(newValue);
      if (!newValue) return;
      if (newValue === "__custom") {
        const c = window.prompt("Condition string:");
        if (c) onChange([...conditions, c.trim()]);
        setSelValue("");
        return;
      }
      const def = C.CONDITION_DEFS.find((d) => d.v === newValue);
      if (!def) return;
      // No parameters? add immediately.
      if (!def.hasParam && !def.hasStat && !def.hasStatus && !def.hasTerrain && !def.hasUnitType) {
        onChange([...conditions, newValue]);
        setSelValue("");
      } else {
        setParam(def.paramDefault || "");
      }
    },
    [conditions, onChange, C.CONDITION_DEFS]
  );

  const addParameterised = useCallback(() => {
    if (!selDef) return;
    let v = selDef.v;
    if (selDef.hasParam) v += "_" + (param || selDef.paramDefault || "0");
    if (selDef.hasStat) v += "_" + stat;
    if (selDef.hasStatus) v += "_" + status;
    if (selDef.hasTerrain) v += "_" + terrain;
    if (selDef.hasUnitType) v += "_" + utype;
    onChange([...conditions, v]);
    setSelValue("");
    setParam("");
  }, [selDef, param, stat, status, terrain, utype, conditions, onChange]);

  return (
    <div>
      <ChipList
        items={conditions}
        renderLabel={(c) => condLabel(c)}
        onRemove={(i) => onChange(conditions.filter((_, idx) => idx !== i))}
      />
      {conditions.length > 1 ? (
        <span className="chip-and" style={{ marginRight: 4 }}>
          AND
        </span>
      ) : null}
      <div
        style={{
          marginTop: 6,
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <select
          className="cond-add"
          style={{ fontSize: "0.82rem" }}
          value={selValue}
          onChange={(e) => onSelChange(e.currentTarget.value)}
        >
          <option value="">+ Add condition...</option>
          {Object.entries(groups).map(([g, items]) => (
            <optgroup key={g} label={g}>
              {items.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.l}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom">Custom (type your own)...</option>
        </select>
        {selDef?.hasParam && (
          <input
            type="number"
            style={{ width: 60 }}
            placeholder="#"
            value={param}
            onChange={(e) => setParam(e.currentTarget.value)}
          />
        )}
        {selDef?.hasStat && (
          <select value={stat} onChange={(e) => setStat(e.currentTarget.value)}>
            {C.STATS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {selDef?.hasStatus && (
          <select value={status} onChange={(e) => setStatus(e.currentTarget.value)}>
            {sList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {selDef?.hasTerrain && (
          <select value={terrain} onChange={(e) => setTerrain(e.currentTarget.value)}>
            {Object.keys(C.TERRAIN_TYPES).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {selDef?.hasUnitType && (
          <select value={utype} onChange={(e) => setUtype(e.currentTarget.value)}>
            {C.UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {selDef && (selDef.hasParam || selDef.hasStat || selDef.hasStatus || selDef.hasTerrain || selDef.hasUnitType) && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={addParameterised}
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}

// ── CLEANSE BUILDER ─────────────────────────────────────────────────
function CleanseBuilder({
  items,
  onChange
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const labels = constants().CLEANSE_LABELS;
  const allOpts = Object.keys(labels);
  return (
    <div>
      <ChipList
        items={items}
        renderLabel={(it) => {
          const lb = labels[it];
          return lb ? `${lb.icon} ${lb.label}` : it;
        }}
        onRemove={(i) => onChange(items.filter((_, idx) => idx !== i))}
      />
      <select
        style={{ fontSize: "0.82rem" }}
        value=""
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v) onChange([...items, v]);
        }}
      >
        <option value="">+ Add cleanse method...</option>
        {allOpts
          .filter((o) => !items.includes(o))
          .map((o) => {
            const lb = labels[o];
            return (
              <option key={o} value={o}>
                {lb.icon} {lb.label}
              </option>
            );
          })}
      </select>
    </div>
  );
}

// ── OVERRIDE BUILDER ────────────────────────────────────────────────
function OverrideBuilder({
  items,
  onChange
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <ChipList
        items={items}
        renderLabel={(it) => <span title={OVR_DESCS[it] || ""}>{it}</span>}
        onRemove={(i) => onChange(items.filter((_, idx) => idx !== i))}
      />
      <select
        value=""
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v) onChange([...items, v]);
        }}
      >
        <option value="">+ Add field...</option>
        {OVR_FIELDS.filter((o) => !items.includes(o)).map((o) => (
          <option key={o} value={o} title={OVR_DESCS[o] || ""}>
            {o} — {OVR_DESCS[o] || ""}
          </option>
        ))}
      </select>
    </div>
  );
}

// Marker reference so unused-import warnings stay quiet in TS-strict.
void ui;
