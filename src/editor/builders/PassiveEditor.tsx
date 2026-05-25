// React port of js/builders/passive-editor.js. Compose passives by
// referencing effects from the master library, plus rank perks with
// modifiers / add-effects.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cm,
  constants,
  ds,
  effectRegistry,
  type BaseEntity,
  type Effect
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

interface RankPerk {
  rank: number;
  description?: string;
  modifiers?: Record<string, number>;
  addEffects?: EffectRef[];
}

interface PassiveRecord extends BaseEntity {
  id: string;
  effects?: EffectRef[];
  spCost?: number;
  rankPerks?: RankPerk[];
  rankScaling?: { maxRank?: number; valuePerRank?: number };
  rankUpCost?: { materialId?: string; baseQty?: number; qtyPerRank?: number };
  // legacy field some authored data still uses
  maxRank?: number;
  rankMaterialId?: string;
}

// Round to 2 dp like the vanilla _cleanNumber.
function cleanNumber(v: unknown): number {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeEffectRef(ref: unknown): EffectRef | null {
  if (!ref) return null;
  if (typeof ref === "string") return { effectId: ref };
  const r = ref as Partial<EffectRef> & { id?: string };
  const effectId = r.effectId || r.id;
  if (!effectId) return null;
  const out: EffectRef = { effectId };
  if (r.overrides) out.overrides = { ...r.overrides };
  return out;
}

function formatEffectRefs(refs: EffectRef[]): string {
  const normalized = refs.map(normalizeEffectRef).filter(Boolean) as EffectRef[];
  if (!normalized.length) return "";
  const simple = normalized.every((ref) => {
    const keys = Object.keys(ref.overrides || {});
    return keys.length === 0 || (keys.length === 1 && keys[0] === "value");
  });
  if (!simple) return JSON.stringify(normalized);
  return normalized
    .map((ref) => {
      const value = ref.overrides?.value;
      return value == null || value === "" ? ref.effectId : `${ref.effectId}:${value}`;
    })
    .join(", ");
}

function parseEffectRefs(text: string): EffectRef[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map(normalizeEffectRef).filter(Boolean) as EffectRef[];
    } catch {
      toast("Rank perk effects JSON is invalid", "error");
      return [];
    }
  }
  return raw
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const [effectId, valueText] = part.split(":").map((s) => s.trim());
      const ref: EffectRef = { effectId };
      if (valueText !== undefined && valueText !== "") {
        const value = Number(valueText);
        if (Number.isFinite(value)) ref.overrides = { value };
      }
      return ref;
    })
    .filter((ref) => ref.effectId);
}

function normalizeRankPerk(perk: unknown): RankPerk {
  const copy = JSON.parse(JSON.stringify(perk || {})) as RankPerk & {
    level?: number;
    targetRank?: number;
    modifiers?: { value?: number; effectValue?: number } & Record<string, unknown>;
    effects?: unknown[];
  };
  const out: RankPerk = {
    rank: Math.max(
      2,
      Number(copy.rank ?? copy.level ?? copy.targetRank ?? 2) || 2
    ),
    description: copy.description || ""
  };
  const valueDelta = cleanNumber(copy.modifiers?.value ?? copy.modifiers?.effectValue);
  if (valueDelta) out.modifiers = { value: valueDelta };
  const effects = [...(copy.addEffects || []), ...(copy.effects || [])]
    .map(normalizeEffectRef)
    .filter(Boolean) as EffectRef[];
  if (effects.length) out.addEffects = effects;
  return out;
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function PassiveEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<PassiveRecord[]>(() => {
    const fromCM =
      cm()?.getVisibleItems?.<PassiveRecord>("passives", search) ||
      (search
        ? ds().search<PassiveRecord>("passives", search)
        : ds().getAllAsArray<PassiveRecord>("passives"));
    return fromCM;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dataTick]);

  const active = useMemo<PassiveRecord | null>(
    () => (activeId ? ds().get<PassiveRecord>("passives", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const PROG = constants()?.PROGRESSION || {};
    const id = ds().create<PassiveRecord>("passives", {
      name: "New Passive",
      icon: "🛡️",
      description: "",
      tags: [],
      effects: [],
      spCost: 1,
      rankPerks: [],
      rankScaling: {
        maxRank: Number(PROG.passiveMaxRankDefault || 5),
        valuePerRank: Number(PROG.passiveRankValuePerRank ?? 0.15)
      },
      rankUpCost: {
        materialId: PROG.passiveRankMaterialDefault || "haven_memory_shard",
        baseQty: 1,
        qtyPerRank: 1
      }
    });
    setActiveId(id);
    toast("Passive created", "success");
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
            placeholder="Search passives..."
          />
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={createNew}
          >
            + New
          </button>
        </div>
        <div className="data-list" style={{ flex: 1, maxHeight: "none" }}>
          <DataList<PassiveRecord>
            entityType="passives"
            items={items}
            activeId={activeId}
            onSelect={(p) => setActiveId(p.id)}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <PassiveForm
            key={active.id}
            passive={active}
            onDuplicate={() => {
              const newId = ds().duplicate("passives", active.id);
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
            Select a passive or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── PASSIVE FORM ────────────────────────────────────────────────────
function PassiveForm({
  passive,
  onDuplicate,
  onDeleted
}: {
  passive: PassiveRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const ER = effectRegistry();
  const PROG = constants().PROGRESSION || {};
  const maxRankCap = Number(PROG.passiveMaxRankCap || 20);

  const [draft, setDraft] = useState<PassiveRecord>(() => ({ ...passive }));
  useEffect(() => {
    setDraft({ ...passive });
  }, [passive]);

  const setField = useCallback(
    <K extends keyof PassiveRecord>(key: K, value: PassiveRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const setRankScaling = useCallback(
    (patch: Partial<NonNullable<PassiveRecord["rankScaling"]>>) =>
      setDraft((prev) => ({
        ...prev,
        rankScaling: { ...(prev.rankScaling || {}), ...patch }
      })),
    []
  );

  const setRankUpCost = useCallback(
    (patch: Partial<NonNullable<PassiveRecord["rankUpCost"]>>) =>
      setDraft((prev) => ({
        ...prev,
        rankUpCost: { ...(prev.rankUpCost || {}), ...patch }
      })),
    []
  );

  const currentMaxRank = Number(
    draft.rankScaling?.maxRank ??
      draft.maxRank ??
      PROG.passiveMaxRankDefault ??
      5
  );

  const setPerks = useCallback(
    (perks: RankPerk[]) => setField("rankPerks", perks),
    [setField]
  );

  const rankMaterial =
    draft.rankUpCost?.materialId ||
    draft.rankMaterialId ||
    PROG.passiveRankMaterialDefault ||
    "haven_memory_shard";

  const preview = useMemo(() => {
    const resolved = ER.resolveRefs(draft.effects || []);
    return resolved.map((e) => ER.autoDescribe(e as Effect)).join(", ") || "No effects";
  }, [draft.effects, ER]);

  const save = useCallback(() => {
    const PROG2 = constants().PROGRESSION || {};
    const materialId =
      (draft.rankUpCost?.materialId || "").trim() ||
      PROG2.passiveRankMaterialDefault ||
      "haven_memory_shard";
    const cleanedRankPerks = (draft.rankPerks || [])
      .filter((p) => Number(p.rank || 0) > 1)
      .map(normalizeRankPerk)
      .sort((a, b) => Number(a.rank) - Number(b.rank));

    const next: PassiveRecord = {
      ...passive,
      ...draft,
      id: passive.id,
      spCost: Math.max(0, Number(draft.spCost) || 0),
      rankScaling: {
        ...(passive.rankScaling || {}),
        maxRank: Math.min(maxRankCap, Math.max(1, currentMaxRank)),
        valuePerRank: Math.max(0, Number(draft.rankScaling?.valuePerRank ?? 0))
      },
      rankUpCost: {
        ...(passive.rankUpCost || {}),
        materialId,
        baseQty: Math.max(1, Number(draft.rankUpCost?.baseQty) || 1),
        qtyPerRank: Math.max(0, Number(draft.rankUpCost?.qtyPerRank) || 0)
      },
      rankPerks: cleanedRankPerks,
      effects: draft.effects || [],
      description:
        draft.description ||
        ER.resolveRefs(draft.effects || [])
          .map((e) => ER.autoDescribe(e as Effect))
          .join(", ")
    };
    ds().replace("passives", passive.id, next);
    toast(`"${next.name}" saved`, "success");
  }, [draft, passive, ER, currentMaxRank, maxRankCap]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${passive.name}"?`, () => {
      ds().remove("passives", passive.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [passive, onDeleted]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || "🛡️"} {draft.name || "Unnamed"}
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
            value={draft.icon || "🛡️"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 110px" }}>
          <label className="form-label">SP Cost</label>
          <input
            type="number"
            min={0}
            max={20}
            title="Passive points required to equip this passive"
            value={draft.spCost ?? 1}
            onChange={(e) => setField("spCost", Number(e.currentTarget.value) || 0)}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Tags</label>
          <TagInput
            tags={draft.tags || []}
            onChange={(t) => setField("tags", t)}
          />
        </div>
      </div>
      <h3>Rank Up</h3>
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 120px" }}>
          <label className="form-label">Max Rank</label>
          <input
            type="number"
            min={1}
            max={maxRankCap}
            value={currentMaxRank}
            onChange={(e) =>
              setRankScaling({ maxRank: Number(e.currentTarget.value) || 1 })
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 140px" }}>
          <label className="form-label">Value/Rank (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(
              Number(
                draft.rankScaling?.valuePerRank ??
                  PROG.passiveRankValuePerRank ??
                  0.15
              ) * 100
            )}
            onChange={(e) =>
              setRankScaling({
                valuePerRank: (Number(e.currentTarget.value) || 0) / 100
              })
            }
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Rank Material ID</label>
          <input
            type="text"
            placeholder="haven_memory_shard"
            value={rankMaterial}
            onChange={(e) => setRankUpCost({ materialId: e.currentTarget.value })}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 120px" }}>
          <label className="form-label">Base Qty</label>
          <input
            type="number"
            min={1}
            max={99}
            value={Number(draft.rankUpCost?.baseQty ?? 1)}
            onChange={(e) =>
              setRankUpCost({ baseQty: Number(e.currentTarget.value) || 1 })
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 120px" }}>
          <label className="form-label">Qty/Rank</label>
          <input
            type="number"
            min={0}
            max={99}
            value={Number(draft.rankUpCost?.qtyPerRank ?? 1)}
            onChange={(e) =>
              setRankUpCost({ qtyPerRank: Number(e.currentTarget.value) || 0 })
            }
          />
        </div>
      </div>
      <h3>Rank Perks</h3>
      <RankPerksBuilder
        perks={draft.rankPerks || []}
        maxRank={currentMaxRank}
        onChange={setPerks}
      />
      <h3>Effects</h3>
      <EffectListBuilder
        effects={draft.effects || []}
        onChange={(effs) => setField("effects", effs)}
      />
      <div className="form-group mt-md">
        <label className="form-label">Description (auto-generated if blank)</label>
        <textarea
          rows={2}
          value={draft.description || ""}
          onChange={(e) => setField("description", e.currentTarget.value)}
        />
      </div>
      <div className="card" style={{ background: "var(--surface2)", marginTop: 8 }}>
        <div className="dim" style={{ fontSize: "0.82rem" }}>
          <b>Preview:</b> {preview}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Passive
        </button>
      </div>
    </div>
  );
}

// ── RANK PERKS BUILDER ──────────────────────────────────────────────
function RankPerksBuilder({
  perks,
  maxRank,
  onChange
}: {
  perks: RankPerk[];
  maxRank: number;
  onChange: (next: RankPerk[]) => void;
}) {
  const safeMaxRank = Math.max(1, Number(maxRank || 1));

  // Sort by rank.
  const sortedPerks = useMemo(
    () =>
      [...perks].sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0)),
    [perks]
  );

  const updatePerk = useCallback(
    (index: number, patch: Partial<RankPerk>) => {
      const next = [...sortedPerks];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [sortedPerks, onChange]
  );

  const remove = useCallback(
    (index: number) => onChange(sortedPerks.filter((_, i) => i !== index)),
    [sortedPerks, onChange]
  );

  const addPerk = useCallback(() => {
    if (safeMaxRank < 2) return;
    const used = new Set(perks.map((p) => Number(p.rank || 0)));
    let nextRank = 2;
    while (used.has(nextRank) && nextRank <= safeMaxRank) nextRank++;
    onChange([
      ...perks,
      {
        rank: Math.min(nextRank, safeMaxRank),
        description: "",
        modifiers: {},
        addEffects: []
      }
    ]);
  }, [perks, safeMaxRank, onChange]);

  return (
    <div>
      {sortedPerks.map((perk, i) => {
        const modValue = cleanNumber(perk.modifiers?.value);
        return (
          <div
            key={i}
            className="rank-perk-row"
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              marginBottom: 8,
              padding: 10
            }}
          >
            <div
              className="form-row"
              style={{ alignItems: "flex-end", gap: 8, marginBottom: 6 }}
            >
              <div className="form-group" style={{ flex: "0 0 80px" }}>
                <label className="form-label">Rank</label>
                <input
                  type="number"
                  min={2}
                  max={safeMaxRank}
                  value={Number(perk.rank || 2)}
                  onChange={(e) =>
                    updatePerk(i, {
                      rank: Math.min(
                        safeMaxRank,
                        Math.max(
                          2,
                          Math.floor(Number(e.currentTarget.value) || 2)
                        )
                      )
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  placeholder="PER +1"
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
                Remove
              </button>
            </div>
            <div className="form-row" style={{ gap: 8 }}>
              <div className="form-group" style={{ flex: "0 0 130px" }}>
                <label className="form-label">Base Value +/-</label>
                <input
                  type="number"
                  step={1}
                  value={modValue || ""}
                  onChange={(e) => {
                    const v = cleanNumber(e.currentTarget.value);
                    const modifiers = { ...(perk.modifiers || {}) };
                    if (v) modifiers.value = v;
                    else delete modifiers.value;
                    updatePerk(i, {
                      modifiers: Object.keys(modifiers).length ? modifiers : undefined
                    });
                  }}
                  style={{ width: "100%" }}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Add Effects</label>
                <input
                  type="text"
                  placeholder="stat_mod_per:1, crit_rate_mod:2"
                  value={formatEffectRefs(perk.addEffects || [])}
                  onChange={(e) => {
                    const parsed = parseEffectRefs(e.currentTarget.value);
                    updatePerk(i, {
                      addEffects: parsed.length ? parsed : undefined
                    });
                  }}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={safeMaxRank < 2}
        onClick={addPerk}
      >
        + Add Rank Perk
      </button>
    </div>
  );
}
