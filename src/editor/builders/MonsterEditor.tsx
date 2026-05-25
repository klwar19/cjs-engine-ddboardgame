// React port of js/builders/monster-editor.js. Build monsters with
// SPECIAL stats, derived-stat preview, skill list with overrides,
// passives, elemental interactions, battle SFX, structured AI rule
// builder (with presets + runtime preview), and loot table.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cm,
  constants,
  ds,
  formulas,
  ui,
  type BaseEntity,
  type PortraitWidget
} from "./_shared/cjs";
import {
  DataList,
  PortraitField,
  ReferenceList,
  SearchInput,
  TagInput,
  confirm,
  openReferencePicker,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface MonsterSkillEntry {
  skillId: string;
  overrides?: Record<string, unknown>;
}

interface MonsterAIRule {
  priority?: number;
  condition?: string;
  action?: string;
  target?: string;
}

interface MonsterLoot {
  itemId?: string;
  name?: string;
  rarity?: string;
  chance?: number;
}

interface MonsterRecord extends BaseEntity {
  id: string;
  team?: "enemy";
  rank?: string;
  type?: string;
  stats?: Record<string, number>;
  movement?: number;
  size?: string;
  skills?: Array<string | MonsterSkillEntry>;
  innatePassives?: string[];
  weak?: string[];
  resist?: string[];
  immune?: string[];
  loot?: MonsterLoot[];
  behaviorAI?: string;
  aiRules?: MonsterAIRule[];
  portrait?: string;
  portraitFocus?: unknown;
  battleSfx?: { attack?: string; hurt?: string; [k: string]: unknown };
}

function labelize(s: string): string {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parseAIAction(action: string): { type: string; skillId: string } {
  const text = String(action || "").trim();
  if (text.startsWith("use_skill:")) {
    return { type: "use_skill", skillId: text.split(":")[1] || "" };
  }
  return { type: text || "move_toward", skillId: "" };
}

function aiTargetLabel(id: string): string {
  return constants().AI_TARGET_INFO?.[id]?.label || labelize(id);
}

function aiRuleSentence(rule: MonsterAIRule): string {
  const action = parseAIAction(rule.action || "move_toward");
  const skillName = action.skillId
    ? ds().get<{ name?: string }>("skills", action.skillId)?.name || action.skillId
    : "";
  const actionLabel =
    action.type === "use_skill"
      ? `use ${skillName || "a skill"}`
      : labelize(action.type);
  return `When ${labelize(rule.condition || "default")}, ${actionLabel} targeting ${aiTargetLabel(rule.target || "nearest_enemy")}.`;
}

function normaliseSkillEntries(
  raw: MonsterRecord["skills"]
): MonsterSkillEntry[] {
  return (raw || []).map((s) =>
    typeof s === "string"
      ? { skillId: s, overrides: {} }
      : { skillId: s.skillId, overrides: { ...(s.overrides || {}) } }
  );
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function MonsterEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<MonsterRecord[]>(
    () =>
      cm()?.getVisibleItems?.<MonsterRecord>("monsters", search) ||
      (search
        ? ds().search<MonsterRecord>("monsters", search)
        : ds().getAllAsArray<MonsterRecord>("monsters")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick]
  );
  const active = useMemo<MonsterRecord | null>(
    () => (activeId ? ds().get<MonsterRecord>("monsters", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const id = ds().create<MonsterRecord>("monsters", {
      name: "New Monster",
      icon: "👾",
      team: "enemy",
      rank: "F",
      type: "beast",
      stats: { S: 5, P: 5, E: 5, C: 3, I: 3, A: 5, L: 3 },
      skills: [],
      innatePassives: [],
      weak: [],
      resist: [],
      immune: [],
      loot: [],
      behaviorAI: "aggressive",
      aiRules: [],
      portrait: "",
      battleSfx: {},
      description: ""
    });
    setActiveId(id);
    toast("Monster created", "success");
  }, []);

  const renderListItem = useCallback(
    (m: MonsterRecord) => (
      <>
        <span className="item-icon">{m.icon || "👾"}</span>
        <div>
          <div className="item-name">{m.name || m.id}</div>
          <div className="item-sub">
            Rank {m.rank || "F"} · {m.type || "beast"} · {m.behaviorAI || "aggressive"}
          </div>
        </div>
      </>
    ),
    []
  );

  return (
    <div className="flex gap-md" style={{ height: "100%" }}>
      <div
        style={{
          width: 260,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        <div className="flex gap-sm items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search monsters..."
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={createNew}
          >
            + New
          </button>
        </div>
        <div className="data-list" style={{ flex: 1, maxHeight: "none" }}>
          <DataList<MonsterRecord>
            entityType="monsters"
            items={items}
            activeId={activeId}
            onSelect={(m) => setActiveId(m.id)}
            renderItem={renderListItem}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <MonsterForm
            key={active.id}
            monster={active}
            onDuplicate={() => {
              const nid = ds().duplicate("monsters", active.id);
              if (nid) {
                setActiveId(nid);
                toast("Duplicated", "success");
              }
            }}
            onDeleted={() => setActiveId(null)}
          />
        ) : (
          <div
            className="card"
            style={{ textAlign: "center", color: "var(--text-mute)", padding: 40 }}
          >
            Select a monster or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── MONSTER FORM ─────────────────────────────────────────────────────
function MonsterForm({
  monster,
  onDuplicate,
  onDeleted
}: {
  monster: MonsterRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();
  const F = formulas();
  const rd = (C.RANK_DATA || {})[monster.rank || "F"] || { statMin: 1, statMax: 10 };

  const [draft, setDraft] = useState<MonsterRecord>(() => ({ ...monster }));
  useEffect(() => {
    setDraft({ ...monster });
  }, [monster]);
  const portraitRef = useRef<PortraitWidget | null>(null);

  const setField = useCallback(
    <K extends keyof MonsterRecord>(key: K, value: MonsterRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const stats = draft.stats || { S: 5, P: 5, E: 5, C: 3, I: 3, A: 5, L: 3 };
  const setStat = useCallback(
    (stat: string, value: number) =>
      setDraft((prev) => ({
        ...prev,
        stats: { ...(prev.stats || {}), [stat]: value }
      })),
    []
  );

  const rank = draft.rank || "F";
  const rdFor = (C.RANK_DATA || {})[rank] || rd;
  const statMax = (rdFor.statMax || 10) + 10;

  const derived = useMemo(() => {
    const st: Record<string, number> = {};
    for (const s of C.STATS) st[s] = stats[s] || 0;
    return {
      hp: F.calcMaxHP(st, rank),
      mp: F.calcMaxMP(st, rank),
      pdr: F.calcPhysicalDR(st),
      mdr: F.calcMagicDR(st),
      move: F.calcMovement(Number(draft.movement) || 3, 0),
      crit: F.calcCritChance(st.L || 0, 0)
    };
  }, [stats, rank, draft.movement, F, C.STATS]);

  const setSfx = useCallback(
    (key: "attack" | "hurt", value: string) =>
      setDraft((prev) => ({
        ...prev,
        battleSfx: { ...(prev.battleSfx || {}), [key]: value }
      })),
    []
  );

  const archetypeOptions = useMemo(() => {
    const list = [...(C.AI_ARCHETYPES || [])];
    const current = String(draft.behaviorAI || "aggressive").trim();
    if (current && !list.includes(current)) list.push(current);
    return list;
  }, [C.AI_ARCHETYPES, draft.behaviorAI]);

  const archetypeDesc =
    C.AI_ARCHETYPE_INFO?.[draft.behaviorAI || "aggressive"]?.desc ||
    "Custom AI archetype. Authored rules still run before the fallback behavior.";

  const skillEntries = normaliseSkillEntries(draft.skills);
  const skillIds = skillEntries.map((e) => e.skillId);

  const save = useCallback(() => {
    const battleSfx: Record<string, string> = {};
    if (draft.battleSfx?.attack) battleSfx.attack = String(draft.battleSfx.attack);
    if (draft.battleSfx?.hurt) battleSfx.hurt = String(draft.battleSfx.hurt);

    ds().replace<MonsterRecord>("monsters", monster.id, {
      ...monster,
      ...draft,
      id: monster.id,
      portrait: portraitRef.current
        ? portraitRef.current.getValue()
        : draft.portrait || "",
      portraitFocus: portraitRef.current
        ? portraitRef.current.getFocus()
        : draft.portraitFocus,
      team: "enemy",
      stats: { ...stats },
      movement: Number(draft.movement) || 3,
      size: draft.size || "1x1",
      skills: skillEntries,
      innatePassives: draft.innatePassives || [],
      weak: draft.weak || [],
      resist: draft.resist || [],
      immune: draft.immune || [],
      aiRules: (draft.aiRules || []).map((r, i) => ({ ...r, priority: i + 1 })),
      loot: draft.loot || [],
      ...(Object.keys(battleSfx).length ? { battleSfx } : { battleSfx: {} })
    });
    toast("Monster saved", "success");
  }, [draft, monster, skillEntries, stats]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${monster.name}"?`, () => {
      ds().remove("monsters", monster.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [monster, onDeleted]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || "👾"} {draft.name || "Unnamed"}
        </span>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onDuplicate}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>

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
            value={draft.icon || "👾"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
            style={{ textAlign: "center", fontSize: "1.2em" }}
          />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <PortraitField
          currentPath={draft.portrait}
          currentFocus={draft.portraitFocus}
          category="monsters"
          id={monster.id}
          name={monster.name}
          fallbackIcon={draft.icon || "?"}
          widgetRef={portraitRef}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Rank</label>
          <select
            value={rank}
            onChange={(e) => setField("rank", e.currentTarget.value)}
          >
            {(C.RANKS || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Unit Type</label>
          <select
            value={draft.type || "beast"}
            onChange={(e) => setField("type", e.currentTarget.value)}
          >
            {C.UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">AI Archetype</label>
          <select
            value={draft.behaviorAI || "aggressive"}
            onChange={(e) => setField("behaviorAI", e.currentTarget.value)}
          >
            {archetypeOptions.map((a) => (
              <option key={a} value={a}>
                {C.AI_ARCHETYPE_INFO?.[a]?.label || labelize(a)}
              </option>
            ))}
          </select>
          <div className="dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            {archetypeDesc}
          </div>
        </div>
      </div>

      <h3>
        SPECIAL Stats{" "}
        <span className="dim" style={{ fontSize: "0.8em" }}>
          ({rdFor.statMin}–{rdFor.statMax})
        </span>
      </h3>
      <div>
        {C.STATS.map((s) => (
          <div
            key={s}
            className="flex items-center gap-sm"
            style={{ marginBottom: 4 }}
          >
            <span
              className="form-label"
              style={{ marginBottom: 0, width: 60 }}
            >
              {s}
            </span>
            <input
              type="range"
              min={1}
              max={statMax}
              step={1}
              value={stats[s] || 0}
              style={{ flex: 1 }}
              onChange={(e) => setStat(s, Number(e.currentTarget.value) || 0)}
            />
            <input
              type="number"
              min={1}
              max={statMax}
              value={stats[s] || 0}
              style={{ width: 70 }}
              onChange={(e) => setStat(s, Number(e.currentTarget.value) || 0)}
            />
          </div>
        ))}
      </div>

      <div className="form-row mt-sm">
        <div className="form-group" style={{ flex: "0 0 140px" }}>
          <label className="form-label">Base Movement</label>
          <input
            type="number"
            min={0}
            max={8}
            value={draft.movement ?? 3}
            onChange={(e) => setField("movement", Number(e.currentTarget.value) || 3)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 140px" }}>
          <label className="form-label">Size</label>
          <select
            value={draft.size || "1x1"}
            onChange={(e) => setField("size", e.currentTarget.value)}
          >
            {Object.entries(C.UNIT_SIZES || {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div
          className="dim"
          style={{
            alignSelf: "flex-end",
            paddingBottom: 6,
            fontSize: "0.82rem"
          }}
        >
          Movement: cells/turn · Size: grid footprint (bosses: 2×2)
        </div>
      </div>

      <h3>Derived Stats</h3>
      <div className="card" style={{ background: "var(--surface2)" }}>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.88rem" }}
        >
          <span>
            <b style={{ color: "var(--red)" }}>HP</b> {derived.hp}
          </span>
          <span>
            <b style={{ color: "var(--blue)" }}>MP</b> {derived.mp}
          </span>
          <span>
            <b style={{ color: "var(--text-dim)" }}>Phys DR</b> {derived.pdr}
          </span>
          <span>
            <b style={{ color: "var(--accent)" }}>Mag DR</b> {derived.mdr}
          </span>
          <span>
            <b style={{ color: "var(--green)" }}>Move</b> {derived.move}
          </span>
          <span>
            <b style={{ color: "var(--gold)" }}>Crit</b>{" "}
            {derived.crit.toFixed(1)}%
          </span>
        </div>
      </div>

      <h3>Skills</h3>
      <MonsterSkillList
        entries={skillEntries}
        onChange={(entries) => setField("skills", entries)}
      />

      <h3>Innate Passives / Effects</h3>
      <ReferenceList
        type="passives"
        label="passive"
        ids={draft.innatePassives || []}
        onChange={(ids) => setField("innatePassives", ids)}
      />

      <h3>Elemental Interactions</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Weak</label>
          <TagInput
            tags={draft.weak || []}
            onChange={(t) => setField("weak", t)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Resist</label>
          <TagInput
            tags={draft.resist || []}
            onChange={(t) => setField("resist", t)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Immune</label>
          <TagInput
            tags={draft.immune || []}
            onChange={(t) => setField("immune", t)}
          />
        </div>
      </div>

      <h3>Battle SFX</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Attack SFX ID</label>
          <input
            type="text"
            placeholder="zombie_attack"
            value={String(draft.battleSfx?.attack || "")}
            onChange={(e) => setSfx("attack", e.currentTarget.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Hurt SFX ID</label>
          <input
            type="text"
            placeholder="zombie_hurt"
            value={String(draft.battleSfx?.hurt || "")}
            onChange={(e) => setSfx("hurt", e.currentTarget.value)}
          />
        </div>
      </div>

      <h3>AI Behavior Rules</h3>
      <div className="monster-ai-builder">
        <div className="monster-ai-summary">
          <b>Rule order matters.</b> The first matching rule runs;
          otherwise the archetype fallback takes over. Use presets for
          common patterns, then tune the condition, action, skill, and
          target.
        </div>
        <AIPresets
          rules={draft.aiRules || []}
          skillIds={skillIds}
          onChange={(r) => setField("aiRules", r)}
        />
        <AIRuleList
          rules={draft.aiRules || []}
          skillIds={skillIds}
          onChange={(r) => setField("aiRules", r)}
        />
        <AIRulePreview rules={draft.aiRules || []} />
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-sm"
          onClick={() =>
            setField("aiRules", [
              ...(draft.aiRules || []),
              {
                priority: (draft.aiRules?.length || 0) + 1,
                condition: "default",
                action: "move_toward",
                target: "lowest_hp_enemy"
              }
            ])
          }
        >
          + Add Custom Rule
        </button>
      </div>

      <h3>Loot Table</h3>
      <LootTable
        loot={draft.loot || []}
        onChange={(l) => setField("loot", l)}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-sm"
        onClick={() =>
          setField("loot", [
            ...(draft.loot || []),
            { itemId: "", name: "New Drop", rarity: "Common", chance: 0.5 }
          ])
        }
      >
        + Add Loot
      </button>

      <div className="form-group mt-md">
        <label className="form-label">Description</label>
        <textarea
          rows={2}
          value={draft.description || ""}
          onChange={(e) => setField("description", e.currentTarget.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Monster
        </button>
      </div>
    </div>
  );
}

// ── MONSTER SKILL LIST (no level — just skills with overrides) ───────
function MonsterSkillList({
  entries,
  onChange
}: {
  entries: MonsterSkillEntry[];
  onChange: (next: MonsterSkillEntry[]) => void;
}) {
  const updateEntry = useCallback(
    (index: number, patch: Partial<MonsterSkillEntry>) => {
      const next = [...entries];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [entries, onChange]
  );

  const openOverrides = useCallback(
    (index: number) => {
      const entry = entries[index];
      const skill = ds().get<BaseEntity & {
        power?: number;
        ap?: number;
        mp?: number;
        range?: number;
        cooldown?: number;
        element?: string;
        scalingStat?: string;
      }>("skills", entry.skillId);
      if (!skill) return;
      void import("react-dom/client").then(({ createRoot }) => {
        const mount = document.createElement("div");
        let overlay: HTMLElement | null = null;
        let live: Record<string, unknown> = { ...(entry.overrides || {}) };
        const root = createRoot(mount);
        const footer = document.createElement("div");
        const doneBtn = document.createElement("button");
        doneBtn.className = "btn btn-primary";
        doneBtn.textContent = "Done";
        footer.appendChild(doneBtn);
        root.render(
          <MonsterSkillOverrideForm
            master={skill}
            overrides={live}
            onChange={(ov) => (live = ov)}
          />
        );
        doneBtn.onclick = () => {
          updateEntry(index, { overrides: live });
          if (overlay) ui().closeModal(overlay);
        };
        overlay = ui().openModal({
          title: `Override: ${skill.icon || "⚔️"} ${skill.name}`,
          content: mount,
          footer,
          width: "450px",
          onClose: () => {
            try { root.unmount(); } catch { /* ignore */ }
          }
        });
      });
    },
    [entries, updateEntry]
  );

  return (
    <div>
      {entries.map((entry, i) => {
        const skill = ds().get<BaseEntity & { ap?: number; mp?: number }>(
          "skills",
          entry.skillId
        );
        const hasOvr = entry.overrides && Object.keys(entry.overrides).length > 0;
        return (
          <div key={`${entry.skillId}-${i}`} className="effect-chip">
            {skill ? (
              <>
                <span className="chip-icon">{skill.icon || "⚔️"}</span>
                <span className="chip-name">
                  {skill.name}
                  {hasOvr ? (
                    <span
                      style={{ color: "var(--gold)", fontSize: "0.75em" }}
                    >
                      {" "}
                      ✏️ {Object.keys(entry.overrides || {}).join(", ")}
                    </span>
                  ) : null}
                </span>
                <span className="chip-desc">
                  {skill.ap || 0}AP {skill.mp || 0}MP
                </span>
              </>
            ) : (
              <>
                <span className="chip-icon">⚠️</span>
                <span className="chip-name">{entry.skillId}</span>
                <span className="chip-desc" style={{ color: "var(--red)" }}>
                  Not found
                </span>
              </>
            )}
            <div className="chip-actions" style={{ display: "flex", gap: 2 }}>
              {skill ? (
                <button
                  type="button"
                  className="btn-icon"
                  title="Edit overrides"
                  onClick={() => openOverrides(i)}
                >
                  ✏️
                </button>
              ) : null}
              <button
                type="button"
                className="btn-icon"
                onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
              >
                ❌
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          openReferencePicker("skills", "skill", (picked) => {
            if (!entries.some((e) => e.skillId === picked.id)) {
              onChange([...entries, { skillId: picked.id, overrides: {} }]);
            }
          })
        }
      >
        + Add skill
      </button>
    </div>
  );
}

function MonsterSkillOverrideForm({
  master,
  overrides,
  onChange
}: {
  master: BaseEntity & {
    power?: number;
    element?: string;
    ap?: number;
    mp?: number;
    range?: number;
    cooldown?: number;
    scalingStat?: string;
  };
  overrides: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const C = constants();
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...overrides });
  const set = useCallback(
    (key: string, value: unknown) =>
      setDraft((prev) => {
        const next = { ...prev };
        if (value === undefined || value === "" || value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
        onChange(next);
        return next;
      }),
    [onChange]
  );
  return (
    <>
      <div className="hint-box">
        💡 Override values for <b>this monster only</b>.
      </div>
      {(
        [
          { key: "power", label: "Power", type: "number", def: master.power || 0 },
          { key: "element", label: "Element", type: "select", opts: ["", ...(C.ELEMENTS || [])], def: master.element || "" },
          { key: "ap", label: "AP Cost", type: "number", def: master.ap || 1 },
          { key: "mp", label: "MP Cost", type: "number", def: master.mp || 0 },
          { key: "range", label: "Range", type: "number", def: master.range || 1 },
          { key: "cooldown", label: "Cooldown", type: "number", def: master.cooldown || 0 },
          { key: "scalingStat", label: "Scaling Stat", type: "select", opts: ["", ...C.STATS], def: master.scalingStat || "" }
        ] as const
      ).map((f) => (
        <div key={f.key} className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">
            {f.label} (default: {String(f.def)})
          </label>
          {f.type === "number" ? (
            <input
              type="number"
              placeholder={String(f.def)}
              value={draft[f.key] !== undefined ? String(draft[f.key]) : ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "" || v === String(f.def)) set(f.key, undefined);
                else set(f.key, Number(v));
              }}
            />
          ) : (
            <select
              value={String(draft[f.key] ?? f.def ?? "")}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "" || v === f.def) set(f.key, undefined);
                else set(f.key, v);
              }}
            >
              {f.opts.map((o) => (
                <option key={o || "_blank"} value={o}>
                  {o || "— Default —"}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </>
  );
}

// ── AI RULE PRESETS ─────────────────────────────────────────────────
function AIPresets({
  rules,
  skillIds,
  onChange
}: {
  rules: MonsterAIRule[];
  skillIds: string[];
  onChange: (next: MonsterAIRule[]) => void;
}) {
  const firstSkill = skillIds[0] || "";
  const secondSkill = skillIds[1] || firstSkill;
  const presets: Array<{ label: string; rule: MonsterAIRule }> = [
    {
      label: "Use opener skill",
      rule: {
        condition: firstSkill ? `skill_ready:${firstSkill}` : "first_turn",
        action: firstSkill ? `use_skill:${firstSkill}` : "attack",
        target: "nearest_enemy"
      }
    },
    {
      label: "Kite ranged",
      rule: {
        condition: "any_adjacent_enemy",
        action: "move_away",
        target: "nearest_enemy"
      }
    },
    {
      label: "Finish weak target",
      rule: {
        condition: "enemies_alive_lt_2",
        action: secondSkill ? `use_skill:${secondSkill}` : "attack",
        target: "lowest_hp_enemy"
      }
    },
    {
      label: "Defend when hurt",
      rule: { condition: "hp_below_30", action: "defend", target: "self" }
    },
    {
      label: "Protect wounded ally",
      rule: {
        condition: "ally_wounded",
        action: "move_toward",
        target: "lowest_hp_ally"
      }
    }
  ];
  return (
    <div className="monster-ai-presets">
      {presets.map((p, i) => (
        <button
          key={i}
          type="button"
          className="filter-btn"
          title={aiRuleSentence(p.rule)}
          onClick={() =>
            onChange([
              ...rules,
              { priority: rules.length + 1, ...p.rule }
            ])
          }
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── AI RULE LIST ─────────────────────────────────────────────────────
function AIRuleList({
  rules,
  skillIds,
  onChange
}: {
  rules: MonsterAIRule[];
  skillIds: string[];
  onChange: (next: MonsterAIRule[]) => void;
}) {
  const C = constants();

  const conditionOptions = useMemo(() => {
    const base: Array<[string, string, string]> = [
      ["default", "Always", "Runs when no earlier rule matched."],
      ["first_turn", "First turn", "Good for opening buffs or ambush shots."],
      ["hp_below_30", "HP below 30%", "Panic, flee, defend, or desperation skill."],
      ["hp_below_50", "HP below 50%", "A safer wounded threshold."],
      ["hp_above_50", "HP above 50%", "Keeps pressure while healthy."],
      ["hp_full", "HP full", "Opening confidence behavior."],
      ["ap_at_least_1", "AP at least 1", "Can afford cheap actions."],
      ["ap_at_least_2", "AP at least 2", "Can afford most skills."],
      ["mp_at_least_10", "MP at least 10", "Enough MP for special actions."],
      ["mp_below_25", "MP below 25%", "Conserve MP or reposition."],
      ["any_adjacent_enemy", "Adjacent enemy", "Someone is in melee range."],
      ["no_adjacent_enemy", "No adjacent enemy", "Good for kiting or ranged attacks."],
      ["enemies_in_range:3 >= 2", "Two enemies within 3", "Use AoE or control when clustered."],
      ["ally_wounded", "Ally wounded", "Protect, heal, or draw pressure."],
      ["any_ally_dying", "Ally dying", "Emergency support behavior."],
      ["outnumbered", "Outnumbered", "Defensive or retreat behavior."],
      ["winning_numbers", "Winning numbers", "Aggressive pressure while ahead."],
      ["allies_alive_lt_3", "Allies alive below 3", "Late-fight fallback."],
      ["allies_alive_gt_1", "More than one ally alive", "Team tactics available."],
      ["enemies_alive_lt_2", "One enemy left", "Finish-off behavior."],
      ["turn_above_3", "After turn 3", "Use once the fight has settled."]
    ];
    const skillScoped = skillIds.map((id) => {
      const skill = ds().get<{ name?: string }>("skills", id);
      const label = skill?.name || id;
      return [
        [`skill_ready:${id}`, `${label} ready`, "Skill exists and can be used now."],
        [`skill_off_cooldown:${id}`, `${label} off cooldown`, "Cooldown is not blocking this skill."],
        [`skill_on_cooldown:${id}`, `${label} on cooldown`, "Fallback while waiting for this skill."]
      ] as Array<[string, string, string]>;
    });
    return [...base, ...skillScoped.flat()];
  }, [skillIds]);

  const actionOptions: Array<{ value: string; label: string }> = [
    { value: "attack", label: "Basic attack" },
    { value: "use_skill", label: "Use skill" },
    { value: "move_toward", label: "Move toward" },
    { value: "move_away", label: "Move away" },
    { value: "defend", label: "Defend" },
    { value: "wait", label: "Wait" },
    { value: "flee", label: "Flee" }
  ];

  const targetOptions = useMemo(() => {
    const list = [...(C.AI_TARGET_TYPES || [])];
    for (const r of rules) {
      const v = String(r.target || "").trim();
      if (v && !list.includes(v)) list.push(v);
    }
    return list;
  }, [C.AI_TARGET_TYPES, rules]);

  const updateRule = useCallback(
    (index: number, patch: Partial<MonsterAIRule>) => {
      const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
      onChange(next);
    },
    [rules, onChange]
  );

  const move = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= rules.length) return;
      const next = [...rules];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
    [rules, onChange]
  );

  const remove = useCallback(
    (index: number) => onChange(rules.filter((_, i) => i !== index)),
    [rules, onChange]
  );

  if (rules.length === 0) {
    return (
      <div className="monster-ai-empty">
        No custom rules yet. The archetype fallback handles behavior until you
        add one.
      </div>
    );
  }

  return (
    <div>
      {rules.map((r, i) => {
        const currentCondition = r.condition || "default";
        const conditionKnown = conditionOptions.some(
          (opt) => opt[0] === currentCondition
        );
        const action = parseAIAction(r.action || "move_toward");
        return (
          <div key={i} className="monster-ai-rule-card">
            <div className="monster-ai-rule-index">{i + 1}</div>
            <div className="monster-ai-rule-main">
              <div className="form-row monster-ai-rule-fields">
                <div className="form-group">
                  <label className="form-label">When</label>
                  <select
                    value={conditionKnown ? currentCondition : "__custom__"}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      updateRule(i, {
                        condition: v === "__custom__" ? currentCondition : v
                      });
                    }}
                  >
                    {conditionOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                    <option value="__custom__">Custom condition...</option>
                  </select>
                </div>
                {!conditionKnown && (
                  <div className="form-group">
                    <label className="form-label">Custom</label>
                    <input
                      type="text"
                      placeholder="condition string"
                      value={currentCondition}
                      onChange={(e) =>
                        updateRule(i, { condition: e.currentTarget.value || "default" })
                      }
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Do</label>
                  <select
                    value={action.type}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      updateRule(i, {
                        action: v === "use_skill"
                          ? action.skillId
                            ? `use_skill:${action.skillId}`
                            : "attack"
                          : v
                      });
                    }}
                  >
                    {actionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {action.type === "use_skill" && (
                  <div className="form-group">
                    <label className="form-label">Skill</label>
                    <select
                      value={action.skillId}
                      onChange={(e) =>
                        updateRule(i, {
                          action: `use_skill:${e.currentTarget.value}`
                        })
                      }
                    >
                      {skillIds.length === 0 ? (
                        <option value="">No skills equipped</option>
                      ) : (
                        skillIds.map((id) => {
                          const skill = ds().get<{ name?: string }>(
                            "skills",
                            id
                          );
                          return (
                            <option key={id} value={id}>
                              {skill?.name || id}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Target</label>
                  <select
                    value={r.target || "nearest_enemy"}
                    onChange={(e) =>
                      updateRule(i, { target: e.currentTarget.value })
                    }
                  >
                    {targetOptions.map((t) => (
                      <option key={t} value={t}>
                        {aiTargetLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="monster-ai-rule-help">{aiRuleSentence(r)}</div>
            </div>
            <div className="monster-ai-rule-controls">
              <button
                type="button"
                className="btn-icon"
                title="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="btn-icon"
                title="Move down"
                disabled={i === rules.length - 1}
                onClick={() => move(i, +1)}
              >
                Down
              </button>
              <button
                type="button"
                className="btn-icon danger"
                title="Remove"
                onClick={() => remove(i)}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AIRulePreview({ rules }: { rules: MonsterAIRule[] }) {
  return (
    <div className="monster-ai-preview">
      {rules.length > 0 ? (
        <>
          <b>Runtime order:</b>{" "}
          {rules.map((rule, index) => (
            <span key={index}>
              {index + 1}. {aiRuleSentence(rule)}
              {index < rules.length - 1 ? " " : ""}
            </span>
          ))}
        </>
      ) : (
        <>
          <b>Runtime order:</b> archetype fallback only.
        </>
      )}
    </div>
  );
}

// ── LOOT TABLE ──────────────────────────────────────────────────────
function LootTable({
  loot,
  onChange
}: {
  loot: MonsterLoot[];
  onChange: (next: MonsterLoot[]) => void;
}) {
  const C = constants();
  const update = useCallback(
    (index: number, patch: Partial<MonsterLoot>) => {
      const next = loot.map((l, i) => (i === index ? { ...l, ...patch } : l));
      onChange(next);
    },
    [loot, onChange]
  );
  return (
    <div>
      {loot.map((l, i) => (
        <div
          key={i}
          className="form-row items-center"
          style={{ marginBottom: 6 }}
        >
          <div className="form-group" style={{ flex: 2 }}>
            <input
              type="text"
              placeholder="Item name/ID"
              value={l.name || l.itemId || ""}
              onChange={(e) =>
                update(i, {
                  name: e.currentTarget.value,
                  itemId: e.currentTarget.value
                })
              }
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <select
              value={l.rarity || "Common"}
              onChange={(e) => update(i, { rarity: e.currentTarget.value })}
            >
              {(C.RARITIES || []).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: "0 0 90px" }}>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={l.chance ?? 0}
              onChange={(e) =>
                update(i, { chance: Number(e.currentTarget.value) || 0 })
              }
              style={{ width: "100%" }}
            />
          </div>
          <button
            type="button"
            className="btn-icon"
            title="Remove"
            onClick={() => onChange(loot.filter((_, idx) => idx !== i))}
          >
            ❌
          </button>
        </div>
      ))}
    </div>
  );
}
