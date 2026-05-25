// React port of js/builders/char-editor.js. Build characters with
// SPECIAL stat sliders, derived-stat preview, skills (with overrides
// and per-character level), items, innate passives, jobs / branches,
// allowed weapon/armor types, elemental interactions, battle SFX, and
// persona summary (read-only).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cm,
  constants,
  ds,
  formulas,
  personaService,
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

interface SkillEntry {
  skillId: string;
  overrides?: Record<string, unknown>;
  level?: number;
}

interface BattleSfx {
  attack?: string;
  fight?: string;
  hurt?: string;
  happy?: string;
  angry?: string;
  miss?: string;
  expression?: string;
  archerAttack?: string;
  [k: string]: unknown;
}

interface CharRecord extends BaseEntity {
  id: string;
  team?: "player" | "ally" | "neutral" | "enemy";
  rank?: string;
  type?: string;
  stats?: Record<string, number>;
  movement?: number;
  size?: string;
  skills?: Array<string | SkillEntry>;
  equipment?: string[];
  innatePassives?: string[];
  allowedWeaponTypes?: string[];
  allowedArmorTypes?: string[];
  weaponSlots?: number;
  availableJobs?: string[];
  availableBranches?: string[];
  defaultJob?: string | null;
  maxJobs?: number;
  skillSlots?: number;
  passiveSlots?: number;
  skillPoints?: number;
  passivePoints?: number;
  weak?: string[];
  resist?: string[];
  immune?: string[];
  portrait?: string;
  portraitFocus?: unknown;
  battleSfx?: BattleSfx;
}

// Normalise skills field (mix of strings and entries) into SkillEntry[].
function normalizeSkills(raw: CharRecord["skills"]): SkillEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) =>
    typeof s === "string"
      ? { skillId: s, overrides: {}, level: 1 }
      : {
          skillId: s.skillId,
          overrides: { ...(s.overrides || {}) },
          level: s.level || 1
        }
  );
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function CharEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<CharRecord[]>(
    () =>
      cm()?.getVisibleItems?.<CharRecord>("characters", search) ||
      (search
        ? ds().search<CharRecord>("characters", search)
        : ds().getAllAsArray<CharRecord>("characters")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick]
  );
  const active = useMemo<CharRecord | null>(
    () => (activeId ? ds().get<CharRecord>("characters", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const PROG = constants()?.PROGRESSION || {};
    const id = ds().create<CharRecord>("characters", {
      name: "New Character",
      icon: "🧑",
      team: "player",
      rank: "F",
      type: "humanoid",
      stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
      skills: [],
      equipment: [],
      innatePassives: [],
      allowedWeaponTypes: ["sword", "bow", "staff"],
      allowedArmorTypes: ["light", "robe"],
      availableJobs: [],
      availableBranches: [],
      defaultJob: null,
      maxJobs: Number((PROG as Record<string, unknown>).maxJobsDefault ?? 3),
      weaponSlots: 2,
      skillSlots: Number((PROG as Record<string, unknown>).defaultSkillSlots ?? 4),
      passiveSlots: Number(
        (PROG as Record<string, unknown>).defaultPassiveSlots ?? 3
      ),
      skillPoints: Number(
        (PROG as Record<string, unknown>).defaultSkillPoints ?? 10
      ),
      passivePoints: Number(
        (PROG as Record<string, unknown>).defaultPassivePoints ?? 10
      ),
      weak: [],
      resist: [],
      immune: [],
      portrait: "",
      battleSfx: {},
      description: ""
    });
    setActiveId(id);
    toast("Character created", "success");
  }, []);

  const renderListItem = useCallback((c: CharRecord) => {
    const team = c.team === "enemy" ? "🟥 enemy" : "🟦 player";
    return (
      <>
        <span className="item-icon">{c.icon || "🧑"}</span>
        <div style={{ minWidth: 0 }}>
          <div className="item-name">{c.name || c.id}</div>
          <div className="item-sub">
            {team} · {c.rank || "F"} · {c.type || ""}
          </div>
        </div>
      </>
    );
  }, []);

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
            placeholder="Search characters..."
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
          <DataList<CharRecord>
            entityType="characters"
            items={items}
            activeId={activeId}
            onSelect={(c) => setActiveId(c.id)}
            renderItem={renderListItem}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <CharForm
            key={active.id}
            character={active}
            onDuplicate={() => {
              const nid = ds().duplicate("characters", active.id);
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
            Select a character or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── CHAR FORM ───────────────────────────────────────────────────────
function CharForm({
  character,
  onDuplicate,
  onDeleted
}: {
  character: CharRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();
  const F = formulas();
  const rankDataAll = C.RANK_DATA || ({} as NonNullable<typeof C.RANK_DATA>);

  const [draft, setDraft] = useState<CharRecord>(() => ({ ...character }));
  useEffect(() => {
    setDraft({ ...character });
  }, [character]);
  const portraitRef = useRef<PortraitWidget | null>(null);

  const setField = useCallback(
    <K extends keyof CharRecord>(key: K, value: CharRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const stats = draft.stats || { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 };
  const setStat = useCallback(
    (stat: string, value: number) =>
      setDraft((prev) => ({
        ...prev,
        stats: { ...(prev.stats || {}), [stat]: value }
      })),
    []
  );

  const rank = draft.rank || "F";
  const rankData = rankDataAll[rank] || rankDataAll.F || {
    statMin: 1,
    statMax: 10,
    totalSpecial: 35
  };
  const statMax = (rankData.statMax || 10) + 10;

  // Derived stats preview
  const derived = useMemo(() => {
    const totalStats: Record<string, number> = {};
    for (const s of C.STATS) totalStats[s] = stats[s] || 0;
    return {
      hp: F.calcMaxHP(totalStats, rank, { team: "player", plotArmor: true }),
      mp: F.calcMaxMP(totalStats, rank),
      pdr: F.calcPhysicalDR(totalStats),
      mdr: F.calcMagicDR(totalStats),
      cdr: F.calcChaosDR(totalStats),
      move: F.calcMovement(Number(draft.movement) || 3, 0),
      crit: F.calcCritChance(totalStats.L || 0, 0)
    };
  }, [stats, rank, draft.movement, F, C.STATS]);

  const statTotal = useMemo(
    () => C.STATS.reduce((sum, s) => sum + (stats[s] || 0), 0),
    [stats, C.STATS]
  );

  const branchSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          ds()
            .getAllAsArray<{ branch?: string }>("jobs")
            .map((j) => j.branch || "")
            .filter(Boolean)
        )
      ).sort(),
    []
  );

  // Personas summary
  const personas = useMemo(() => {
    const PS = personaService();
    if (PS) return PS.personasForCharacter(character.id);
    return ds()
      .getAllAsArray<{
        characterId?: string;
        id: string;
        name?: string;
        icon?: string;
        world?: string;
        unlock?: {
          default?: boolean;
          requiresChapter?: number;
          requiresPhaseNumber?: number;
          requiresFlag?: string;
        };
        statOverrides?: Record<string, number>;
        defaultJob?: string;
      }>("personas")
      .filter((p) => p.characterId === character.id);
  }, [character.id]);

  // ── Save ──
  const save = useCallback(() => {
    const skills = normalizeSkills(draft.skills);
    const availableJobs = draft.availableJobs || [];
    const defaultJob =
      draft.defaultJob && availableJobs.includes(draft.defaultJob)
        ? draft.defaultJob
        : null;

    // Collect battle SFX, stripping empties.
    const battleSfx: Record<string, string> = {};
    const sfx = draft.battleSfx || {};
    for (const key of [
      "attack",
      "hurt",
      "happy",
      "angry",
      "expression",
      "archerAttack"
    ]) {
      const v = String(sfx[key] || "").trim();
      if (v) battleSfx[key] = v;
    }

    const payload: CharRecord = {
      ...character,
      ...draft,
      id: character.id,
      portrait: portraitRef.current
        ? portraitRef.current.getValue()
        : draft.portrait || "",
      portraitFocus: portraitRef.current
        ? portraitRef.current.getFocus()
        : draft.portraitFocus,
      stats: { ...stats },
      movement: Number(draft.movement) || 3,
      size: draft.size || "1x1",
      skills,
      equipment: draft.equipment || [],
      allowedWeaponTypes: draft.allowedWeaponTypes || [],
      allowedArmorTypes: draft.allowedArmorTypes || [],
      weaponSlots: Math.max(1, Number(draft.weaponSlots) || 2),
      skillSlots: Math.max(0, Number(draft.skillSlots) || 0),
      passiveSlots: Math.max(0, Number(draft.passiveSlots) || 0),
      skillPoints: Math.max(0, Number(draft.skillPoints) || 0),
      passivePoints: Math.max(0, Number(draft.passivePoints) || 0),
      availableJobs,
      availableBranches: draft.availableBranches || [],
      maxJobs: Math.max(
        1,
        Number(draft.maxJobs) ||
          Number((C.PROGRESSION as Record<string, unknown>)?.maxJobsDefault) ||
          3
      ),
      defaultJob,
      innatePassives: draft.innatePassives || [],
      weak: draft.weak || [],
      resist: draft.resist || [],
      immune: draft.immune || [],
      battleSfx
    };
    ds().replace("characters", character.id, payload);
    toast("Character saved", "success");
  }, [draft, character, stats, C.PROGRESSION]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${character.name}"?`, () => {
      ds().remove("characters", character.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [character, onDeleted]);

  const setSfx = useCallback(
    (key: string, value: string) =>
      setDraft((prev) => ({
        ...prev,
        battleSfx: { ...(prev.battleSfx || {}), [key]: value }
      })),
    []
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || "🧑"} {draft.name || "Unnamed"}
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
            value={draft.icon || "🧑"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
            style={{ textAlign: "center", fontSize: "1.2em" }}
          />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <PortraitField
          currentPath={draft.portrait}
          currentFocus={draft.portraitFocus}
          category="characters"
          id={character.id}
          name={character.name}
          fallbackIcon={draft.icon || "?"}
          widgetRef={portraitRef}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Team</label>
          <select
            value={draft.team || "player"}
            onChange={(e) => setField("team", e.currentTarget.value as CharRecord["team"])}
          >
            <option value="player">Player</option>
            <option value="ally">Ally</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
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
            value={draft.type || "humanoid"}
            onChange={(e) => setField("type", e.currentTarget.value)}
          >
            {C.UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>
        SPECIAL Stats{" "}
        <span className="dim" style={{ fontSize: "0.8em" }}>
          (Rank {rank}: {rankData.statMin}–{rankData.statMax}, total ~
          {rankData.totalSpecial})
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
      <div className="dim" style={{ fontSize: "0.82rem", marginTop: 4 }}>
        Total: <b>{statTotal}</b> / ~{rankData.totalSpecial}
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
          Movement: cells/turn · Size: grid footprint
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
            <b style={{ color: "var(--pink)" }}>Chaos DR</b> {derived.cdr}
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
      <SkillRefList
        entries={normalizeSkills(draft.skills)}
        onChange={(entries) => setField("skills", entries)}
      />

      <h3>Equipment</h3>
      <ReferenceList
        type="items"
        label="item"
        ids={draft.equipment || []}
        onChange={(ids) => setField("equipment", ids)}
      />
      <div className="hint-box">
        Equipment proficiencies control what this character can equip in
        Campaign Mode.
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Allowed Weapon Types</label>
          <TagInput
            tags={draft.allowedWeaponTypes || []}
            onChange={(t) => setField("allowedWeaponTypes", t)}
            placeholder="sword + Enter"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Allowed Armor Types</label>
          <TagInput
            tags={draft.allowedArmorTypes || []}
            onChange={(t) => setField("allowedArmorTypes", t)}
            placeholder="light + Enter"
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 130px" }}>
          <label className="form-label">Weapon Slots</label>
          <input
            type="number"
            min={1}
            max={4}
            value={draft.weaponSlots ?? 2}
            onChange={(e) => setField("weaponSlots", Number(e.currentTarget.value) || 2)}
          />
          <div className="dim" style={{ fontSize: "0.74rem" }}>
            How many distinct weapon types this character can master
            (informational).
          </div>
        </div>
      </div>

      <h3>Available Jobs</h3>
      <div className="hint-box">
        Jobs the character can pick from in Campaign Mode. The default job is
        auto-applied when the party is created.
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Available Jobs</label>
          <ReferenceList
            type="jobs"
            label="job"
            ids={draft.availableJobs || []}
            onChange={(ids) => {
              setField("availableJobs", ids);
              if (draft.defaultJob && !ids.includes(draft.defaultJob)) {
                setField("defaultJob", null);
              }
            }}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 200px" }}>
          <label className="form-label">Default Job</label>
          <select
            value={draft.defaultJob || ""}
            onChange={(e) => setField("defaultJob", e.currentTarget.value || null)}
          >
            <option value="">— None —</option>
            {(draft.availableJobs || []).map((jid) => {
              const job = ds().get<BaseEntity>("jobs", jid);
              const label = job ? `${job.icon || "🛡️"} ${job.name || job.id}` : jid;
              return (
                <option key={jid} value={jid}>
                  {label}
                </option>
              );
            })}
          </select>
          <div className="dim" style={{ fontSize: "0.74rem" }}>
            — None — keeps the character jobless until campaign assigns one.
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Available Branches</label>
          <TagInput
            tags={draft.availableBranches || []}
            onChange={(t) => setField("availableBranches", t)}
            placeholder="warrior + Enter"
          />
          <div className="dim" style={{ fontSize: "0.74rem" }}>
            Branches allow later-tier jobs such as warrior -&gt; knight after
            prerequisites are met. Suggestions: {branchSuggestions.join(", ")}
          </div>
        </div>
        <div className="form-group" style={{ flex: "0 0 130px" }}>
          <label className="form-label">Max Jobs</label>
          <input
            type="number"
            min={1}
            max={20}
            value={Number(
              draft.maxJobs ??
                (C.PROGRESSION as Record<string, unknown>)?.maxJobsDefault ??
                3
            )}
            onChange={(e) => setField("maxJobs", Number(e.currentTarget.value) || 3)}
          />
        </div>
      </div>

      <h3>Personas (World Skins)</h3>
      <div className="hint-box">
        Personas reshape this character per world (job, skills, equipment, stat
        overrides). Edit them in the Personas panel — this is a read-only
        summary.
      </div>
      <div>
        {personas.length === 0 ? (
          <div className="dim" style={{ fontSize: "0.85rem" }}>
            No personas authored for this character yet.
          </div>
        ) : (
          personas.map((p) => {
            const worldRec = p.world
              ? ds().get<{ displayName?: string }>("worlds", p.world)
              : null;
            const worldName = worldRec?.displayName || p.world || "—";
            const unlockBits: string[] = [];
            if (p.unlock?.default) unlockBits.push("default");
            if (p.unlock?.requiresChapter)
              unlockBits.push(`ch ≥ ${p.unlock.requiresChapter}`);
            if (p.unlock?.requiresPhaseNumber)
              unlockBits.push(`phase ≥ ${p.unlock.requiresPhaseNumber}`);
            if (p.unlock?.requiresFlag)
              unlockBits.push(`flag: ${p.unlock.requiresFlag}`);
            const overrides = Object.entries(p.statOverrides || {})
              .map(([s, v]) => `${s}${v >= 0 ? "+" : ""}${v}`)
              .join(" ");
            return (
              <div
                key={p.id}
                style={{
                  padding: "6px 10px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  marginBottom: 6
                }}
              >
                <div>
                  <b>
                    {p.icon || "🎭"} {p.name || p.id}
                  </b>{" "}
                  <span className="dim">[{p.id}]</span> —{" "}
                  <span style={{ color: "var(--accent)" }}>{worldName}</span>
                </div>
                <div className="dim" style={{ fontSize: "0.78rem" }}>
                  {unlockBits.length
                    ? `Unlock: ${unlockBits.join(", ")}`
                    : "No unlock rule"}
                  {overrides ? ` · Stat: ${overrides}` : ""}
                  {p.defaultJob ? ` · Job: ${p.defaultJob}` : ""}
                </div>
              </div>
            );
          })
        )}
      </div>

      <h3>Selection Budget</h3>
      <div className="hint-box">
        In Campaign Mode the player explicitly equips a subset of known
        skills/passives. Both caps apply: total count must fit slots, and
        total spCost must fit the points budget.
      </div>
      <div className="form-row">
        {(
          [
            ["skillSlots", "Skill Slots", 20],
            ["passiveSlots", "Passive Slots", 20],
            ["skillPoints", "Skill Points", 100],
            ["passivePoints", "Passive Points", 100]
          ] as const
        ).map(([key, label, max]) => (
          <div key={key} className="form-group" style={{ flex: "0 0 130px" }}>
            <label className="form-label">{label}</label>
            <input
              type="number"
              min={0}
              max={max}
              value={(draft[key] as number | undefined) ?? 0}
              onChange={(e) =>
                setField(key, (Number(e.currentTarget.value) || 0) as never)
              }
            />
          </div>
        ))}
        <div
          className="dim"
          style={{
            alignSelf: "flex-end",
            paddingBottom: 6,
            fontSize: "0.78rem"
          }}
        >
          Effective values get +bonuses from level / rank / job / item /
          passive at runtime.
        </div>
      </div>

      <h3>Innate Passives</h3>
      <ReferenceList
        type="passives"
        label="passive"
        ids={draft.innatePassives || []}
        onChange={(ids) => setField("innatePassives", ids)}
      />

      <h3>Elemental Interactions</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Weaknesses</label>
          <TagInput
            tags={draft.weak || []}
            onChange={(t) => setField("weak", t)}
            placeholder="e.g. Fire + Enter"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Resistances</label>
          <TagInput
            tags={draft.resist || []}
            onChange={(t) => setField("resist", t)}
            placeholder="e.g. Water + Enter"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Immunities</label>
          <TagInput
            tags={draft.immune || []}
            onChange={(t) => setField("immune", t)}
            placeholder="e.g. Dark + Enter"
          />
        </div>
      </div>

      <h3>Battle SFX</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Fight Line ID</label>
          <input
            type="text"
            placeholder="bin_fight"
            value={String(draft.battleSfx?.attack || draft.battleSfx?.fight || "")}
            onChange={(e) => setSfx("attack", e.currentTarget.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Hurt Line ID</label>
          <input
            type="text"
            placeholder="bin_hurt"
            value={String(draft.battleSfx?.hurt || "")}
            onChange={(e) => setSfx("hurt", e.currentTarget.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Happy Line ID</label>
          <input
            type="text"
            placeholder="bin_happy"
            value={String(draft.battleSfx?.happy || "")}
            onChange={(e) => setSfx("happy", e.currentTarget.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Angry Line ID</label>
          <input
            type="text"
            placeholder="bin_angry"
            value={String(draft.battleSfx?.angry || draft.battleSfx?.miss || "")}
            onChange={(e) => setSfx("angry", e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Expression ID</label>
          <input
            type="text"
            placeholder="optional_expression"
            value={String(draft.battleSfx?.expression || "")}
            onChange={(e) => setSfx("expression", e.currentTarget.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Archer Shot ID</label>
          <input
            type="text"
            placeholder="weapon_bow_shot"
            value={String(draft.battleSfx?.archerAttack || "")}
            onChange={(e) => setSfx("archerAttack", e.currentTarget.value)}
          />
        </div>
      </div>

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
          💾 Save Character
        </button>
      </div>
    </div>
  );
}

// ── SKILL REF LIST WITH OVERRIDES + LEVEL ───────────────────────────
function SkillRefList({
  entries,
  onChange
}: {
  entries: SkillEntry[];
  onChange: (next: SkillEntry[]) => void;
}) {
  const C = constants();
  const F = formulas();

  const updateEntry = useCallback(
    (index: number, patch: Partial<SkillEntry>) => {
      const next = [...entries];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [entries, onChange]
  );

  const openOverrideEditor = useCallback(
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
        let liveOverrides: Record<string, unknown> = { ...(entry.overrides || {}) };
        const root = createRoot(mount);
        const footer = document.createElement("div");
        const doneBtn = document.createElement("button");
        doneBtn.className = "btn btn-primary";
        doneBtn.textContent = "Done";
        footer.appendChild(doneBtn);
        root.render(
          <SkillOverrideForm
            master={skill}
            overrides={liveOverrides}
            onChange={(ov) => {
              liveOverrides = ov;
            }}
          />
        );
        doneBtn.onclick = () => {
          updateEntry(index, { overrides: liveOverrides });
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
        const skill = ds().get<BaseEntity & {
          ap?: number;
          mp?: number;
        }>("skills", entry.skillId);
        const hasOverrides =
          entry.overrides && Object.keys(entry.overrides).length > 0;
        const maxLevel = skill && F.getSkillMaxLevel ? F.getSkillMaxLevel(skill) : 5;
        const curLevel = Math.max(1, Math.min(entry.level || 1, maxLevel));
        const earned = skill && F.getEarnedSkillPerks
          ? F.getEarnedSkillPerks(skill, curLevel)
          : [];
        const next = skill && F.getNextSkillPerk
          ? F.getNextSkillPerk(skill, curLevel)
          : null;

        return (
          <div key={`${entry.skillId}-${i}`} style={{ marginBottom: 6 }}>
            <div className="effect-chip">
              {skill ? (
                <>
                  <span className="chip-icon">{skill.icon || "⚔️"}</span>
                  <span className="chip-name">
                    {skill.name}
                    {hasOverrides ? (
                      <span
                        style={{ color: "var(--gold)", fontSize: "0.75em" }}
                      >
                        {" "}
                        ✏️ {Object.keys(entry.overrides || {}).join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="chip-desc">
                    {skill.ap || 0}AP {skill.mp || 0}MP | Lv {curLevel}/{maxLevel}
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
              <div
                className="chip-actions"
                style={{ display: "flex", gap: 2, alignItems: "center" }}
              >
                {skill ? (
                  <>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Decrease level"
                      style={{ fontWeight: "bold", fontSize: "1.1em" }}
                      disabled={curLevel <= 1}
                      onClick={() =>
                        updateEntry(i, { level: Math.max(1, curLevel - 1) })
                      }
                    >
                      −
                    </button>
                    <span
                      style={{
                        fontSize: "0.82em",
                        minWidth: 18,
                        textAlign: "center",
                        fontWeight: "bold",
                        color: "var(--accent)"
                      }}
                    >
                      {curLevel}
                    </span>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Increase level"
                      style={{ fontWeight: "bold", fontSize: "1.1em" }}
                      disabled={curLevel >= maxLevel}
                      onClick={() =>
                        updateEntry(i, {
                          level: Math.min(maxLevel, curLevel + 1)
                        })
                      }
                    >
                      +
                    </button>
                    <span
                      style={{
                        borderLeft: "1px solid var(--border)",
                        height: 18,
                        margin: "0 2px"
                      }}
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      title="Edit overrides for this unit"
                      onClick={() => openOverrideEditor(i)}
                    >
                      ✏️
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() =>
                    onChange(entries.filter((_, idx) => idx !== i))
                  }
                >
                  ❌
                </button>
              </div>
            </div>
            {(earned.length > 0 || next) && (
              <div
                style={{
                  fontSize: "0.78em",
                  padding: "2px 8px 4px 28px",
                  color: "var(--text-dim)"
                }}
              >
                {earned.length > 0 && (
                  <span style={{ color: "var(--green)" }}>
                    ✔{" "}
                    {earned
                      .map(
                        (p) =>
                          `Lv${p.level}: ${p.description || "perk"}`
                      )
                      .join(" · ")}
                  </span>
                )}
                {next ? (
                  <>
                    {earned.length > 0 ? " | " : ""}
                    <span style={{ color: "var(--accent)" }}>
                      Next at Lv{next.level}: {next.description || "..."}
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          openReferencePicker("skills", "skill", (picked) => {
            if (!entries.some((e) => e.skillId === picked.id)) {
              onChange([
                ...entries,
                { skillId: picked.id, overrides: {}, level: 1 }
              ]);
            }
          })
        }
      >
        + Add skill
      </button>
      {/* Reference C to keep tree-shake happy when used in conditionals */}
      <span style={{ display: "none" }}>{C.STATS.length}</span>
    </div>
  );
}

// ── SKILL OVERRIDE FORM (used inside the modal opened above) ────────
function SkillOverrideForm({
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
    (key: string, value: unknown) => {
      setDraft((prev) => {
        const next = { ...prev };
        if (value === "" || value === null || value === undefined) {
          delete next[key];
        } else {
          next[key] = value;
        }
        onChange(next);
        return next;
      });
    },
    [onChange]
  );

  return (
    <>
      <div className="hint-box">
        💡 Override values for <b>this unit only</b>. Leave blank/unchanged to
        use the skill's default.
      </div>
      {(
        [
          { key: "power", label: "Power (base damage)", type: "number", def: master.power || 0 },
          { key: "element", label: "Element", type: "select", options: ["", ...(C.ELEMENTS || [])], def: master.element || "" },
          { key: "ap", label: "AP Cost", type: "number", def: master.ap || 1 },
          { key: "mp", label: "MP Cost", type: "number", def: master.mp || 0 },
          { key: "range", label: "Range", type: "number", def: master.range || 1 },
          { key: "cooldown", label: "Cooldown (turns)", type: "number", def: master.cooldown || 0 },
          { key: "scalingStat", label: "Scaling Stat", type: "select", options: ["", ...C.STATS], def: master.scalingStat || "" }
        ] as const
      ).map((f) => (
        <div key={f.key} className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">
            {f.label} (default: {String(f.def)})
          </label>
          {f.type === "number" ? (
            <input
              type="number"
              value={
                draft[f.key] !== undefined ? String(draft[f.key]) : ""
              }
              placeholder={String(f.def)}
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
              {f.options.map((o) => (
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
