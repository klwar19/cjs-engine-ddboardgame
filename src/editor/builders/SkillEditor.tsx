// React port of js/builders/skill-editor.js. Build skills by picking
// effect refs from the library and configuring power / cost / targeting
// / QTE / SFX / level-perks.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  audioManager,
  cm,
  constants,
  ds,
  type BaseEntity
} from "./_shared/cjs";
import {
  DataList,
  EffectListBuilder,
  type EffectRef,
  SearchInput,
  TagInput,
  confirm,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface LevelPerk {
  level: number;
  description?: string;
  modifiers?: {
    power?: number;
    ap?: number;
    mp?: number;
    range?: number;
    cooldown?: number;
  };
  addEffects?: EffectRef[];
}

interface SkillRecord extends BaseEntity {
  id: string;
  power?: number;
  ap?: number;
  mp?: number;
  cooldown?: number;
  damageType?: string;
  element?: string | null;
  scalingStat?: string;
  range?: number;
  aoe?: string | null;
  aoeSize?: number;
  qte?: string;
  requiredWeaponTypes?: string[];
  effects?: EffectRef[];
  levelScaling?: { powerPerLevel?: number; maxLevel?: number };
  apGain?: number;
  apThresholds?: number[] | null;
  spCost?: number;
  levelPerks?: LevelPerk[];
  castSfx?: string;
  hitSfx?: string;
}

const BUILTIN_SFX = [
  "magic_cast",
  "magic_hit",
  "magic_fire",
  "magic_ice",
  "magic_lightning",
  "magic_holy",
  "magic_dark",
  "weapon_slash",
  "weapon_pierce",
  "weapon_blunt",
  "weapon_hit_physical",
  "weapon_hit_fire",
  "weapon_hit_ice",
  "weapon_hit_lightning",
  "weapon_hit_water",
  "weapon_hit_wind",
  "weapon_hit_earth",
  "weapon_hit_holy",
  "weapon_hit_dark",
  "weapon_bow_shot",
  "bin_fight",
  "bin_hurt",
  "bin_happy",
  "bin_angry",
  "zombie_attack",
  "zombie_hurt",
  "critical",
  "heal",
  "item_use",
  "item_potion",
  "item_buff",
  "item_throw"
];

function apThresholdsToText(thresholds: number[] | null | undefined): string {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return "";
  return thresholds.join(", ");
}

function parseApThresholds(raw: string): number[] | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const parts = text.split(/[\s,]+/).map((p) => Number(p.trim()));
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return null;
  return parts.map((n) => Math.max(0, Math.floor(n)));
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function SkillEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<SkillRecord[]>(
    () =>
      cm()?.getVisibleItems?.<SkillRecord>("skills", search) ||
      (search
        ? ds().search<SkillRecord>("skills", search)
        : ds().getAllAsArray<SkillRecord>("skills")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick]
  );
  const active = useMemo<SkillRecord | null>(
    () => (activeId ? ds().get<SkillRecord>("skills", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const id = ds().create<SkillRecord>("skills", {
      name: "New Skill",
      icon: "⚔️",
      power: 10,
      ap: 2,
      mp: 0,
      cooldown: 0,
      damageType: "Physical",
      element: null,
      scalingStat: "S",
      range: 1,
      aoe: null,
      aoeSize: 0,
      qte: "quickpress",
      requiredWeaponTypes: [],
      effects: [],
      levelScaling: { powerPerLevel: 0.15, maxLevel: 5 },
      apGain: 1,
      apThresholds: null,
      spCost: 1,
      description: ""
    });
    setActiveId(id);
    toast("Skill created", "success");
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
            placeholder="Search skills..."
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
          <DataList<SkillRecord>
            entityType="skills"
            items={items}
            activeId={activeId}
            onSelect={(s) => setActiveId(s.id)}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <SkillForm
            key={active.id}
            skill={active}
            onDuplicate={() => {
              const newId = ds().duplicate("skills", active.id);
              if (newId) {
                setActiveId(newId);
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
            Select a skill or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── SKILL FORM ──────────────────────────────────────────────────────
function SkillForm({
  skill,
  onDuplicate,
  onDeleted
}: {
  skill: SkillRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();

  const [draft, setDraft] = useState<SkillRecord>(() => ({ ...skill }));
  useEffect(() => {
    setDraft({ ...skill });
  }, [skill]);

  const setField = useCallback(
    <K extends keyof SkillRecord>(key: K, value: SkillRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const setLevelScaling = useCallback(
    (patch: Partial<NonNullable<SkillRecord["levelScaling"]>>) =>
      setDraft((prev) => ({
        ...prev,
        levelScaling: { ...(prev.levelScaling || {}), ...patch }
      })),
    []
  );

  const maxLevel = Number(draft.levelScaling?.maxLevel || 5);

  // SFX dropdowns — load manifest once on mount.
  const [sfxIds, setSfxIds] = useState<string[]>([]);
  useEffect(() => {
    const AM = audioManager();
    const finish = () => {
      const manifest = AM?.getManifest?.() || { sfx: {} };
      setSfxIds(Object.keys(manifest.sfx || {}).sort());
    };
    if (AM?.loadManifest) {
      AM.loadManifest().then(finish).catch(finish);
    } else {
      finish();
    }
  }, []);

  // Damage estimate
  const power = Number(draft.power) || 0;
  const stat = 6;
  const avgDmg = Math.floor(Math.sqrt(power) * Math.sqrt(stat));

  const apThresholdsText = useMemo(
    () => apThresholdsToText(draft.apThresholds),
    [draft.apThresholds]
  );

  const save = useCallback(() => {
    const cleanedPerks = (draft.levelPerks || []).filter((p) => p.level > 1);
    const payload: SkillRecord = {
      ...draft,
      id: skill.id,
      name: draft.name || "Unnamed",
      icon: draft.icon || "⚔️",
      power: Number(draft.power) || 0,
      ap: Number(draft.ap) || 0,
      mp: Number(draft.mp) || 0,
      cooldown: Number(draft.cooldown) || 0,
      damageType: draft.damageType || "Physical",
      element: draft.element || null,
      scalingStat: draft.scalingStat || "S",
      range: Number(draft.range) || 1,
      aoe: draft.aoe || null,
      aoeSize: Number(draft.aoeSize) || 0,
      qte: draft.qte || "quickpress",
      requiredWeaponTypes: draft.requiredWeaponTypes || [],
      effects: draft.effects || [],
      levelScaling: {
        powerPerLevel: Number(draft.levelScaling?.powerPerLevel) || 0.15,
        maxLevel: Number(draft.levelScaling?.maxLevel) || 5
      },
      apGain: Math.max(0, Number(draft.apGain ?? 1)),
      apThresholds: draft.apThresholds || null,
      spCost: Math.max(0, Number(draft.spCost ?? 1)),
      levelPerks: cleanedPerks,
      description: draft.description || ""
    };
    if (!draft.castSfx) delete payload.castSfx;
    if (!draft.hitSfx) delete payload.hitSfx;
    ds().replace("skills", skill.id, payload);
    toast("Skill saved", "success");
  }, [draft, skill.id]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${skill.name}"?`, () => {
      ds().remove("skills", skill.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [skill, onDeleted]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || "⚔️"} {draft.name || "Unnamed"}
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
        <div className="form-group" style={{ flex: "0 0 240px" }}>
          <label className="form-label">Icon (emoji or image)</label>
          <input
            type="text"
            placeholder="emoji or image URL"
            value={draft.icon || "⚔️"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
          />
        </div>
      </div>

      <h3>Base Stats</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Power</label>
          <input
            type="number"
            min={0}
            value={draft.power ?? 0}
            onChange={(e) => setField("power", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">AP Cost</label>
          <input
            type="number"
            min={0}
            max={10}
            value={draft.ap ?? 0}
            onChange={(e) => setField("ap", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">MP Cost</label>
          <input
            type="number"
            min={0}
            value={draft.mp ?? 0}
            onChange={(e) => setField("mp", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Cooldown</label>
          <input
            type="number"
            min={0}
            max={20}
            value={draft.cooldown ?? 0}
            onChange={(e) => setField("cooldown", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Damage Type</label>
          <select
            value={draft.damageType || "Physical"}
            onChange={(e) => setField("damageType", e.currentTarget.value)}
          >
            {C.DAMAGE_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Element</label>
          <select
            value={draft.element || ""}
            onChange={(e) => setField("element", e.currentTarget.value || null)}
          >
            <option value="">— None —</option>
            {C.ELEMENTS.map((el) => (
              <option key={el} value={el}>
                {el}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Scaling Stat</label>
          <select
            value={draft.scalingStat || "S"}
            onChange={(e) => setField("scalingStat", e.currentTarget.value)}
          >
            {C.STATS.map((s) => (
              <option key={s} value={s}>
                {s} — {C.STAT_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>Targeting</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Range (cells)</label>
          <input
            type="number"
            min={0}
            max={12}
            value={draft.range ?? 1}
            onChange={(e) => setField("range", Number(e.currentTarget.value) || 1)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">AoE Shape</label>
          <select
            value={draft.aoe || ""}
            onChange={(e) => setField("aoe", e.currentTarget.value || null)}
          >
            <option value="">None (single target)</option>
            {(["cone", "line", "circle", "cross"] as const).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">AoE Size</label>
          <input
            type="number"
            min={0}
            max={6}
            value={draft.aoeSize ?? 0}
            onChange={(e) => setField("aoeSize", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Required Weapon Types</label>
        <TagInput
          tags={
            Array.isArray(draft.requiredWeaponTypes)
              ? draft.requiredWeaponTypes
              : draft.requiredWeaponTypes
              ? [draft.requiredWeaponTypes as unknown as string]
              : []
          }
          onChange={(t) => setField("requiredWeaponTypes", t)}
          placeholder="bow + Enter"
        />
        <div className="dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
          Leave empty for any weapon. Examples: sword, bow, staff, knuckles.
        </div>
      </div>

      <h3>QTE</h3>
      <div className="form-group">
        <label className="form-label">QTE Type</label>
        <select
          value={draft.qte || "quickpress"}
          onChange={(e) => setField("qte", e.currentTarget.value)}
        >
          {(C.QTE_TYPES || []).map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>

      <h3>
        Audio{" "}
        <span className="dim" style={{ fontSize: "0.78em" }}>
          — optional per-skill SFX overrides
        </span>
      </h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">On Cast</label>
          <SfxSelect
            value={draft.castSfx || ""}
            onChange={(v) => setField("castSfx", v)}
            manifestIds={sfxIds}
          />
        </div>
        <div className="form-group">
          <label className="form-label">On Hit</label>
          <SfxSelect
            value={draft.hitSfx || ""}
            onChange={(v) => setField("hitSfx", v)}
            manifestIds={sfxIds}
          />
        </div>
      </div>
      <div className="dim" style={{ fontSize: "0.78rem", marginTop: -2 }}>
        Leave blank to use the default routing (Magic → magic_&lt;element&gt;,
        Physical → weapon_hit_&lt;element&gt;). Built-in keys (synth fallback)
        are listed below user-uploaded MP3 ids.
      </div>

      <h3>Additional Effects</h3>
      <EffectListBuilder
        effects={draft.effects || []}
        onChange={(effs) => setField("effects", effs)}
      />

      <h3>
        Level Scaling{" "}
        <span className="dim" style={{ fontSize: "0.78em" }}>
          — gain Ability Points by using this skill in combat
        </span>
      </h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Power/Level (%)</label>
          <input
            type="number"
            min={0}
            max={50}
            step={1}
            value={Math.round(
              (Number(draft.levelScaling?.powerPerLevel) || 0.15) * 100
            )}
            onChange={(e) =>
              setLevelScaling({
                powerPerLevel: (Number(e.currentTarget.value) || 0) / 100
              })
            }
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Max Level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxLevel}
            onChange={(e) =>
              setLevelScaling({
                maxLevel: Number(e.currentTarget.value) || 1
              })
            }
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">AbP per Use</label>
          <input
            type="number"
            min={0}
            max={20}
            value={draft.apGain ?? 1}
            onChange={(e) => setField("apGain", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">SP Cost</label>
          <input
            type="number"
            min={0}
            max={20}
            value={draft.spCost ?? 1}
            title="Skill points required to equip this skill"
            onChange={(e) => setField("spCost", Number(e.currentTarget.value) || 0)}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">
          AbP Thresholds{" "}
          <span className="dim" style={{ fontSize: "0.78em" }}>
            (comma-separated cumulative; blank = use default curve)
          </span>
        </label>
        <input
          type="text"
          placeholder="0, 8, 20, 36, 56, 80, 110, 145, 185, 230, 280"
          value={apThresholdsText}
          onChange={(e) => setField("apThresholds", parseApThresholds(e.currentTarget.value))}
        />
        <div className="dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
          Leave blank to use the default curve from CONST.PROGRESSION.skillApThresholds.
        </div>
      </div>

      <h3>
        Level Perks{" "}
        <span className="dim" style={{ fontSize: "0.78em" }}>
          — bonus/ability unlocked at specific skill levels
        </span>
      </h3>
      <div className="hint-box">
        Define what changes at each level: stat modifiers (power, AP cost, MP
        cost, range, cooldown) and/or extra effects. These stack cumulatively.
      </div>
      <LevelPerksBuilder
        perks={draft.levelPerks || []}
        maxLevel={maxLevel}
        onChange={(p) => setField("levelPerks", p)}
      />

      <div className="form-group mt-md">
        <label className="form-label">Description</label>
        <textarea
          rows={2}
          value={draft.description || ""}
          onChange={(e) => setField("description", e.currentTarget.value)}
        />
      </div>

      <div className="card" style={{ background: "var(--surface2)", marginTop: 8 }}>
        <div className="dim" style={{ fontSize: "0.82rem" }}>
          <b>Estimated base damage vs F-rank (stat 6):</b> ~{avgDmg}
          {" | "}<b>At lvl 10:</b> ~{Math.floor(avgDmg * 2.35)}
          {" | "}<b>ID:</b> {skill.id}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Skill
        </button>
      </div>
    </div>
  );
}

// ── LEVEL PERKS BUILDER ──────────────────────────────────────────────
function LevelPerksBuilder({
  perks,
  maxLevel,
  onChange
}: {
  perks: LevelPerk[];
  maxLevel: number;
  onChange: (next: LevelPerk[]) => void;
}) {
  const safeMaxLevel = Math.max(1, Number(maxLevel || 1));

  const sortedPerks = useMemo(
    () => [...perks].sort((a, b) => (a.level || 0) - (b.level || 0)),
    [perks]
  );

  const updatePerk = useCallback(
    (index: number, patch: Partial<LevelPerk>) => {
      const next = [...sortedPerks];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [sortedPerks, onChange]
  );

  const remove = useCallback(
    (i: number) => onChange(sortedPerks.filter((_, idx) => idx !== i)),
    [sortedPerks, onChange]
  );

  const addPerk = useCallback(() => {
    const used = new Set(perks.map((p) => p.level));
    let next = 2;
    while (used.has(next) && next <= safeMaxLevel) next++;
    onChange([
      ...perks,
      {
        level: Math.min(next, safeMaxLevel),
        description: "",
        modifiers: {},
        addEffects: []
      }
    ]);
  }, [perks, safeMaxLevel, onChange]);

  return (
    <div>
      {sortedPerks.length === 0 ? (
        <div
          className="dim"
          style={{ fontSize: "0.82rem", marginBottom: 6 }}
        >
          No level perks yet. Power still scales via Power/Level (%) above. Add
          perks for extra bonuses at specific levels.
        </div>
      ) : null}
      {sortedPerks.map((perk, i) => {
        const m = perk.modifiers || {};
        return (
          <div
            key={i}
            className="card"
            style={{
              background: "var(--surface2)",
              marginBottom: 8,
              padding: 10
            }}
          >
            <div
              className="form-row"
              style={{ alignItems: "flex-end", gap: 8, marginBottom: 6 }}
            >
              <div className="form-group" style={{ flex: "0 0 80px" }}>
                <label className="form-label">Level</label>
                <input
                  type="number"
                  min={2}
                  max={safeMaxLevel}
                  value={perk.level || 2}
                  onChange={(e) =>
                    updatePerk(i, {
                      level: Math.max(2, Number(e.currentTarget.value) || 2)
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Reduces MP cost, increases range"
                  value={perk.description || ""}
                  onChange={(e) =>
                    updatePerk(i, { description: e.currentTarget.value })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ flex: "0 0 auto", marginBottom: 2 }}
                onClick={() => remove(i)}
              >
                ✕
              </button>
            </div>
            <div className="form-row" style={{ gap: 6 }}>
              {(
                [
                  ["power", "Power ±"],
                  ["ap", "AP ±"],
                  ["mp", "MP ±"],
                  ["range", "Range ±"],
                  ["cooldown", "Cooldown ±"]
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: "0.75em" }}>
                    {label}
                  </label>
                  <input
                    type="number"
                    value={m[key as keyof typeof m] || 0}
                    onChange={(e) => {
                      const v = Number(e.currentTarget.value) || 0;
                      const nextMods = { ...(perk.modifiers || {}) };
                      if (v) nextMods[key as keyof typeof nextMods] = v;
                      else delete nextMods[key as keyof typeof nextMods];
                      updatePerk(i, { modifiers: nextMods });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: 6 }}>
              <label className="form-label" style={{ fontSize: "0.75em" }}>
                Add Effect IDs{" "}
                <span className="dim">(comma-separated)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. burn_on_hit, extra_damage"
                value={(perk.addEffects || [])
                  .map((e) => e.effectId)
                  .filter(Boolean)
                  .join(", ")}
                onChange={(e) => {
                  const refs = e.currentTarget.value
                    .split(/[,;]+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((id) => ({ effectId: id } as EffectRef));
                  updatePerk(i, {
                    addEffects: refs.length ? refs : undefined
                  });
                }}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={addPerk}
      >
        + Add Level Perk
      </button>
    </div>
  );
}

// ── SFX SELECT ──────────────────────────────────────────────────────
function SfxSelect({
  value,
  onChange,
  manifestIds
}: {
  value: string;
  onChange: (v: string) => void;
  manifestIds: string[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      <option value="">-- default --</option>
      {manifestIds.length > 0 && (
        <optgroup label="Uploaded MP3s">
          {manifestIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Built-in (synth fallback)">
        {BUILTIN_SFX.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
