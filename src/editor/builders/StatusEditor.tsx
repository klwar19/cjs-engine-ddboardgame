// React port of js/builders/status-editor.js. Browse built-in statuses
// (read-only with "Clone as Custom") and create/edit custom statuses
// living in DataStore. Auto-generates engine-compatible mirror fields
// (preventsActions, stacks, breakOn, …) when saving.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  constants,
  ds,
  effectRegistry,
  type Effect
} from "./_shared/cjs";
import { toast } from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface StatusRecord {
  id: string;
  name?: string;
  icon?: string;
  category?: string;
  desc?: string;
  preventsAction?: boolean;
  preventsMovement?: boolean;
  preventsSkills?: boolean;
  preventsHealing?: boolean;
  breaksOnDamage?: boolean;
  breaksOnAction?: boolean;
  breaksOnAllyDamage?: boolean;
  invisible?: boolean;
  autoCounter?: boolean;
  redirectDamage?: boolean;
  killOnExpire?: boolean;
  absorbHP?: boolean;
  tickHeal?: boolean;
  randomTarget?: boolean;
  stackable?: boolean;
  maxStacks?: number;
  duration?: number;
  breaksOnElement?: string | null;
  tickDamageType?: string | null;
  forcedTarget?: string | null;
  absorbType?: string | null;
  statMod?: Record<string, number> | null;
  moveMod?: number | null;
  drMod?: number | null;
  accuracyMod?: number | null;
  critMod?: number | null;
  damageMod?: number | null;
  preventsActions?: boolean;
  stacks?: boolean;
  refreshOnReapply?: boolean;
  isBuff?: boolean;
  element?: string | null;
  breakOn?: string[];
  tickPhase?: string;
  passiveEffects?: unknown[];
  tickEffects?: unknown[];
  _source?: "builtin" | "custom";
  [k: string]: unknown;
}

const FLAG_FIELDS = [
  ["preventsAction", "🚫 Prevents Action"],
  ["preventsMovement", "🚫 Prevents Movement"],
  ["preventsSkills", "🤐 Prevents Skills"],
  ["preventsHealing", "🚫 Prevents Healing"],
  ["breaksOnDamage", "💥 Breaks on Damage"],
  ["breaksOnAction", "⚔️ Breaks on Action"],
  ["breaksOnAllyDamage", "💔 Breaks on Ally Damage"],
  ["invisible", "👻 Invisible (untargetable)"],
  ["autoCounter", "⚔️ Auto Counter"],
  ["redirectDamage", "🛡️ Redirect Ally Damage"],
  ["killOnExpire", "💀 Kill on Expire"],
  ["absorbHP", "🛡️ Absorb HP (Shield)"],
  ["tickHeal", "💚 Tick Heal"],
  ["randomTarget", "🎲 Random Target"],
  ["stackable", "📦 Stackable"]
] as const;

const STATS = ["S", "P", "E", "C", "I", "A", "L"] as const;

function buildFlagsList(def: StatusRecord): string[] {
  const flags: string[] = [];
  if (def.preventsAction) flags.push("🚫 Cannot act (attack/skills disabled)");
  if (def.preventsMovement) flags.push("🚫 Cannot move");
  if (def.preventsSkills) flags.push("🤐 Cannot use skills (basic attack OK)");
  if (def.preventsHealing) flags.push("🚫 Cannot be healed");
  if (def.breaksOnDamage) flags.push("💥 Breaks when taking damage");
  if (def.breaksOnAction) flags.push("⚔️ Breaks after acting");
  if (def.breaksOnAllyDamage) flags.push("💔 Breaks if ally damages this unit");
  if (def.breaksOnElement) flags.push(`🔥 Breaks from ${def.breaksOnElement} damage`);
  if (def.forcedTarget)
    flags.push(`🎯 Forced target: ${def.forcedTarget === "source" ? "taunter" : def.forcedTarget}`);
  if (def.randomTarget) flags.push("🎲 Actions target randomly");
  if (def.invisible) flags.push("👻 Cannot be targeted by enemies");
  if (def.autoCounter) flags.push("⚔️ Auto counter-attacks when hit");
  if (def.redirectDamage) flags.push("🛡️ Redirects ally damage to self");
  if (def.killOnExpire) flags.push("💀 Unit DIES when duration expires");
  if (def.absorbHP) flags.push("🛡️ Creates a damage-absorbing shield");
  if (def.tickHeal) flags.push("💚 Heals HP each turn");
  if (def.tickDamageType) flags.push(`🔥 Deals ${def.tickDamageType} damage each turn`);
  if (def.stackable) flags.push(`📦 Stackable (max ${def.maxStacks ?? "∞"})`);
  return flags;
}

function buildStatModList(def: StatusRecord): string[] {
  const mods: string[] = [];
  const names = constants().STAT_NAMES || {};
  if (def.statMod) {
    for (const [s, val] of Object.entries(def.statMod)) {
      const v = val as number;
      mods.push(`${v > 0 ? "+" : ""}${v} ${names[s] || s}`);
    }
  }
  if (def.moveMod) mods.push(`${def.moveMod > 0 ? "+" : ""}${def.moveMod} Movement`);
  if (def.drMod) mods.push(`${def.drMod > 0 ? "+" : ""}${def.drMod} DR`);
  if (def.accuracyMod) mods.push(`${def.accuracyMod > 0 ? "+" : ""}${def.accuracyMod}% Accuracy`);
  if (def.critMod) mods.push(`+${def.critMod}% Crit`);
  if (def.damageMod) mods.push(`+${def.damageMod}% Damage`);
  return mods;
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function StatusEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  // Build the merged list (DataStore + built-ins not yet seeded).
  const merged = useMemo<StatusRecord[]>(() => {
    const defs = constants().STATUS_DEFINITIONS;
    const map = new Map<string, StatusRecord>();
    const dsAll = ds().getAllAsArray<StatusRecord>("statuses");
    for (const s of dsAll) {
      if (!s.id) continue;
      const isBuiltin = !!defs[s.id];
      map.set(s.id, { ...s, _source: isBuiltin ? "builtin" : "custom" });
    }
    for (const [id, def] of Object.entries(defs)) {
      if (!map.has(id)) {
        map.set(id, { id, ...(def as Partial<StatusRecord>), _source: "builtin" });
      }
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTick]);

  const grouped = useMemo(() => {
    const groups: Record<string, StatusRecord[]> = {};
    for (const s of merged) {
      const cat = s.category || "exotic";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [merged]);

  const filtered = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    const out: Record<string, StatusRecord[]> = {};
    for (const [cat, list] of Object.entries(grouped)) {
      const matches = list.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s.id || "").toLowerCase().includes(q) ||
          (s.desc || "").toLowerCase().includes(q)
      );
      if (matches.length > 0) out[cat] = matches;
    }
    return out;
  }, [grouped, search]);

  const activeRecord = useMemo<StatusRecord | null>(() => {
    if (!activeId) return null;
    return merged.find((s) => s.id === activeId) || null;
  }, [activeId, merged]);

  const createCustom = useCallback(() => {
    const name = window.prompt("Custom status name:");
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (ds().exists("statuses", id)) {
      window.alert(`ID "${id}" already exists!`);
      return;
    }
    ds().create("statuses", {
      id,
      name,
      icon: "✦",
      category: "exotic",
      desc: "Custom status — configure behavior below.",
      stackable: false,
      maxStacks: 1
    });
    setActiveId(id);
  }, []);

  const cats = constants().STATUS_CATEGORIES || {};

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
          <input
            type="search"
            placeholder="Search statuses..."
            style={{ flex: 1 }}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <button className="btn btn-primary btn-sm" type="button" onClick={createCustom}>
            + Custom
          </button>
        </div>
        <div
          className="data-list"
          style={{ flex: 1, maxHeight: "none", overflowY: "auto" }}
        >
          {Object.entries(filtered).map(([cat, items]) => {
            const catInfo = cats[cat] || { name: cat, color: "#888" };
            return (
              <div key={cat}>
                <div
                  className="status-cat-header"
                  style={{ borderLeft: `3px solid ${catInfo.color}` }}
                >
                  {catInfo.name} ({items.length})
                </div>
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={`data-list-item${s.id === activeId ? " active" : ""}`}
                    onClick={() => setActiveId(s.id)}
                  >
                    <span>{s.icon || "✦"}</span>{" "}
                    <span>{s.name || s.id}</span>{" "}
                    {s._source === "custom" ? (
                      <span className="badge" style={{ background: "var(--accent)" }}>
                        custom
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeRecord ? (
          activeRecord._source === "builtin" ? (
            <BuiltinDetail record={activeRecord} onCloned={(id) => setActiveId(id)} />
          ) : (
            <EditableForm
              key={activeRecord.id}
              record={activeRecord}
              onDeleted={() => setActiveId(null)}
            />
          )
        ) : (
          <div
            className="card"
            style={{ textAlign: "center", color: "var(--text-mute)", padding: 40 }}
          >
            Select a status to see its mechanical definition
          </div>
        )}
      </div>
    </div>
  );
}

// ── BUILT-IN VIEW ───────────────────────────────────────────────────
function BuiltinDetail({
  record,
  onCloned
}: {
  record: StatusRecord;
  onCloned: (id: string) => void;
}) {
  const cats = constants().STATUS_CATEGORIES || {};
  const catInfo = cats[record.category || "exotic"] || { name: "Unknown", color: "#888" };
  const ER = effectRegistry();
  const usedBy = useMemo<Effect[]>(
    () => ER.getAllEffects().filter((e) => e.statusId === record.id),
    [ER, record.id]
  );
  const flags = buildFlagsList(record);
  const statMods = buildStatModList(record);

  const onClone = useCallback(() => {
    const baseName = record.name || record.id;
    const name = window.prompt(
      `Clone "${baseName}" as custom.\nNew name:`,
      `Custom ${baseName}`
    );
    if (!name) return;
    const newId = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (ds().exists("statuses", newId)) {
      window.alert(`ID "${newId}" already exists!`);
      return;
    }
    const clone: StatusRecord = { ...record };
    clone.id = newId;
    clone.name = name;
    delete clone._source;
    if (record.statMod) clone.statMod = { ...record.statMod };
    ds().create("statuses", clone);
    onCloned(newId);
    toast(`Cloned "${baseName}" → "${name}"`, "success");
  }, [record, onCloned]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ fontSize: "1.2rem" }}>
          {record.icon || "✦"} {record.name || record.id}
        </span>
        <span
          className="badge"
          style={{ background: catInfo.color, color: "#fff" }}
        >
          {catInfo.name}
        </span>
      </div>
      <p style={{ color: "var(--text)", margin: "8px 0", fontSize: "0.9rem" }}>
        {record.desc || "No description."}
      </p>
      {flags.length > 0 && (
        <div style={{ margin: "12px 0" }}>
          <b style={{ color: "var(--accent)", fontSize: "0.85rem" }}>
            ⚙️ Mechanical Behavior:
          </b>
          <div style={{ marginTop: 4 }}>
            {flags.map((f, i) => (
              <div key={i} style={{ padding: "3px 0", fontSize: "0.85rem" }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      )}
      {statMods.length > 0 && (
        <div style={{ margin: "12px 0" }}>
          <b style={{ color: "var(--gold)", fontSize: "0.85rem" }}>
            📊 Stat Modifiers:
          </b>
          <div style={{ marginTop: 4, fontSize: "0.85rem" }}>
            {statMods.join(", ")}
          </div>
        </div>
      )}
      {usedBy.length > 0 ? (
        <div style={{ margin: "12px 0" }}>
          <b style={{ color: "var(--blue)", fontSize: "0.85rem" }}>
            🔗 Used By Effects:
          </b>
          <div style={{ marginTop: 4 }}>
            {usedBy.map((e) => (
              <span key={e.id} className="chip">
                {e.icon || "✦"} {e.name || e.id}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{ margin: "12px 0", fontSize: "0.82rem", color: "var(--text-dim)" }}
        >
          No effects currently apply this status.
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onClone}
        >
          📋 Clone as Custom
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-dim)" }}>
        ℹ️ Built-in status. Clone it to create a customizable copy.
        <br />
        <b>ID:</b> {record.id}
      </div>
    </div>
  );
}

// ── EDITABLE FORM ───────────────────────────────────────────────────
function EditableForm({
  record,
  onDeleted
}: {
  record: StatusRecord;
  onDeleted: () => void;
}) {
  const cats = constants().STATUS_CATEGORIES || {};
  const elements = constants().ELEMENTS || [];
  const statNames =
    constants().STAT_NAMES || {
      S: "STR",
      P: "PER",
      E: "END",
      C: "CHA",
      I: "INT",
      A: "AGI",
      L: "LCK"
    };

  const [draft, setDraft] = useState<StatusRecord>(() => ({ ...record }));
  useEffect(() => {
    setDraft({ ...record });
  }, [record]);

  const setField = useCallback(
    <K extends keyof StatusRecord>(key: K, value: StatusRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const setStatMod = useCallback((stat: string, value: number) => {
    setDraft((prev) => {
      const next = { ...(prev.statMod || {}) };
      if (Number.isFinite(value) && value !== 0) next[stat] = value;
      else delete next[stat];
      return { ...prev, statMod: next };
    });
  }, []);

  const save = useCallback(() => {
    const category = draft.category || "exotic";
    const breakOn: string[] = [];
    if (draft.breaksOnDamage) breakOn.push("damage");
    if (draft.breaksOnAction) breakOn.push("action");
    if (draft.breaksOnAllyDamage) breakOn.push("ally_damage");
    const tickDmgType = draft.tickDamageType || null;
    const isBuff = category === "buff";
    const element = tickDmgType || null;

    const updated: StatusRecord = {
      ...draft,
      id: record.id,
      name: draft.name || record.id,
      icon: draft.icon || "✦",
      category,
      desc: draft.desc || "",
      preventsActions: !!draft.preventsAction,
      stacks: !!draft.stackable,
      refreshOnReapply: true,
      isBuff,
      element,
      breakOn,
      tickPhase: "turn_start",
      duration: draft.duration ?? 3,
      passiveEffects: [],
      tickEffects: [],
      maxStacks: draft.maxStacks ?? 1,
      statMod:
        draft.statMod && Object.keys(draft.statMod).length > 0 ? draft.statMod : null,
      moveMod: draft.moveMod || null,
      drMod: draft.drMod || null,
      accuracyMod: draft.accuracyMod || null,
      critMod: draft.critMod || null,
      damageMod: draft.damageMod || null
    };

    // Strip falsy values for tidiness (keep essentials)
    const KEEP = new Set([
      "id",
      "name",
      "icon",
      "category",
      "desc",
      "maxStacks",
      "stackable",
      "preventsActions",
      "stacks",
      "refreshOnReapply",
      "isBuff",
      "breakOn",
      "tickPhase",
      "duration",
      "passiveEffects",
      "tickEffects",
      "element"
    ]);
    for (const k of Object.keys(updated)) {
      if (KEEP.has(k)) continue;
      const v = updated[k];
      if (v === null || v === false || v === 0) delete updated[k];
    }
    if (!updated.maxStacks) updated.maxStacks = 1;

    ds().update("statuses", record.id, updated);
    toast(`Status "${updated.name}" saved.`, "success");
  }, [draft, record.id]);

  const onDelete = useCallback(() => {
    if (window.confirm(`Delete custom status "${draft.name || record.id}"?`)) {
      ds().remove("statuses", record.id);
      onDeleted();
    }
  }, [draft.name, record.id, onDeleted]);

  const elementOpts = ["", ...elements];
  const tickElems = elements;

  return (
    <div className="card" style={{ fontSize: "0.85rem" }}>
      <div className="card-header">
        <span className="card-title" style={{ fontSize: "1.1rem" }}>
          ✏️ Edit: {draft.name || record.id}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 16px",
          margin: "12px 0"
        }}
      >
        <div>
          <label className="form-label">Name</label>
          <input
            type="text"
            value={draft.name || ""}
            onChange={(e) => setField("name", e.currentTarget.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className="form-label">Icon (emoji)</label>
          <input
            type="text"
            value={draft.icon || "✦"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className="form-label">Category</label>
          <select
            value={draft.category || "exotic"}
            onChange={(e) => setField("category", e.currentTarget.value)}
            style={{ width: "100%" }}
          >
            {Object.entries(cats).map(([k, info]) => (
              <option key={k} value={k}>
                {info.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Description</label>
          <input
            type="text"
            value={draft.desc || ""}
            onChange={(e) => setField("desc", e.currentTarget.value)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div
        style={{
          margin: "16px 0",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 12
        }}
      >
        <b style={{ color: "var(--accent)" }}>⚙️ Behavior Flags</b>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            marginTop: 8
          }}
        >
          {FLAG_FIELDS.map(([key, label]) => (
            <label key={key} className="form-check">
              <input
                type="checkbox"
                checked={!!draft[key as keyof StatusRecord]}
                onChange={(e) =>
                  setField(key as keyof StatusRecord, e.currentTarget.checked as never)
                }
              />{" "}
              {label}
            </label>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 8,
            marginTop: 10
          }}
        >
          <div>
            <label className="form-label">Duration (turns)</label>
            <input
              type="number"
              min={0}
              max={99}
              value={draft.duration ?? 3}
              onChange={(e) => setField("duration", Number(e.currentTarget.value) || 0)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label className="form-label">Max Stacks</label>
            <input
              type="number"
              min={1}
              max={99}
              value={draft.maxStacks ?? 1}
              onChange={(e) => setField("maxStacks", Number(e.currentTarget.value) || 1)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label className="form-label">Break Element</label>
            <select
              value={draft.breaksOnElement || ""}
              onChange={(e) =>
                setField("breaksOnElement", e.currentTarget.value || null)
              }
              style={{ width: "100%" }}
            >
              {elementOpts.map((e) => (
                <option key={e || "_none"} value={e}>
                  {e || "— None —"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Tick Damage Type</label>
            <select
              value={draft.tickDamageType || ""}
              onChange={(e) =>
                setField("tickDamageType", e.currentTarget.value || null)
              }
              style={{ width: "100%" }}
            >
              <option value="">— None —</option>
              {tickElems.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 8
          }}
        >
          <div>
            <label className="form-label">Forced Target</label>
            <select
              value={draft.forcedTarget || ""}
              onChange={(e) => setField("forcedTarget", e.currentTarget.value || null)}
              style={{ width: "100%" }}
            >
              <option value="">— None —</option>
              <option value="source">Source (taunter)</option>
              <option value="ally">Allies (charm)</option>
            </select>
          </div>
          <div>
            <label className="form-label">Absorb Type</label>
            <select
              value={draft.absorbType || ""}
              onChange={(e) => setField("absorbType", e.currentTarget.value || null)}
              style={{ width: "100%" }}
            >
              <option value="">All damage</option>
              <option value="Physical">Physical only</option>
              <option value="Magic">Magic only</option>
            </select>
          </div>
        </div>
      </div>

      <div
        style={{
          margin: "16px 0",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 12
        }}
      >
        <b style={{ color: "var(--gold)" }}>📊 Stat Modifiers While Active</b>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
        >
          {STATS.map((s) => (
            <label
              key={s}
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                fontSize: "0.8rem"
              }}
            >
              <span style={{ width: 30, color: "var(--text-mute)" }}>
                {statNames[s] || s}
              </span>
              <input
                type="number"
                value={(draft.statMod && draft.statMod[s]) || ""}
                onChange={(e) =>
                  setStatMod(s, parseInt(e.currentTarget.value, 10) || 0)
                }
                style={{ width: 52, padding: "2px 4px", fontSize: "0.8rem" }}
              />
            </label>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 10
          }}
        >
          {(
            [
              ["moveMod", "Move Mod"],
              ["drMod", "DR Mod"],
              ["accuracyMod", "Accuracy Mod %"]
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="form-label">{label}</label>
              <input
                type="number"
                value={(draft[key] as number | null) ?? 0}
                onChange={(e) =>
                  setField(key, (Number(e.currentTarget.value) || 0) as never)
                }
                style={{ width: "100%" }}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 6
          }}
        >
          {(
            [
              ["critMod", "Crit Mod %"],
              ["damageMod", "Damage Mod %"]
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="form-label">{label}</label>
              <input
                type="number"
                value={(draft[key] as number | null) ?? 0}
                onChange={(e) =>
                  setField(key, (Number(e.currentTarget.value) || 0) as never)
                }
                style={{ width: "100%" }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" type="button" onClick={save}>
          💾 Save
        </button>
        <button className="btn btn-danger btn-sm" type="button" onClick={onDelete}>
          🗑 Delete
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-dim)" }}>
        <b>ID:</b> {record.id}
      </div>
    </div>
  );
}
