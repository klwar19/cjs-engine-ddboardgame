// React port of js/builders/job-editor.js. Define job classes with
// progression tree (branch, tier, unlock requirement), equipment
// profile (weapon / armor types) and per-level grants (stat bonus,
// skills, passives, skill/passive slot+point bonuses).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cm,
  constants,
  ds,
  type BaseEntity
} from "./_shared/cjs";
import {
  DataList,
  SearchInput,
  TagInput,
  confirm,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface JobLevel {
  level: number;
  description?: string;
  statBonus?: Record<string, number>;
  grantsSkills?: string[];
  grantsPassives?: string[];
  skillSlotBonus?: number;
  passiveSlotBonus?: number;
  skillPointBonus?: number;
  passivePointBonus?: number;
}

interface JobRecord extends BaseEntity {
  id: string;
  branch?: string;
  tier?: number;
  unlockRequirement?: { jobId?: string; minLevel?: number } | null;
  xpThresholds?: number[] | null;
  weaponTypes?: string[];
  armorTypes?: string[];
  maxLevel?: number;
  levels?: JobLevel[];
}

function numberListToText(values: number[] | null | undefined): string {
  if (!Array.isArray(values)) return "";
  return values.map((v) => Number(v || 0)).join(", ");
}

function parseNumberList(raw: string): number[] | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const values = text
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((v) => Number.isFinite(v) && v >= 0);
  return values.length ? values : null;
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function JobEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<JobRecord[]>(
    () =>
      cm()?.getVisibleItems?.<JobRecord>("jobs", search) ||
      (search
        ? ds().search<JobRecord>("jobs", search)
        : ds().getAllAsArray<JobRecord>("jobs")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick]
  );
  const active = useMemo<JobRecord | null>(
    () => (activeId ? ds().get<JobRecord>("jobs", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const defaults: Partial<JobRecord> = {
      name: "New Job",
      icon: "🛡️",
      description: "",
      branch: "",
      tier: 1,
      unlockRequirement: null,
      xpThresholds: null,
      weaponTypes: [],
      armorTypes: [],
      maxLevel: 10,
      levels: [
        {
          level: 1,
          statBonus: {},
          grantsSkills: [],
          grantsPassives: [],
          description: ""
        }
      ]
    };
    const set = (id: string) => {
      setActiveId(id);
      toast("Job created", "success");
    };
    const CM = cm();
    if (CM?.createEntry) {
      CM.createEntry("jobs", defaults, set);
    } else {
      set(ds().create<JobRecord>("jobs", defaults));
    }
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
            placeholder="Search jobs..."
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
          <DataList<JobRecord>
            entityType="jobs"
            items={items}
            activeId={activeId}
            onSelect={(j) => setActiveId(j.id)}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <JobForm
            key={active.id}
            job={active}
            onDuplicate={() => {
              const nid = ds().duplicate("jobs", active.id);
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
            Select a job or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── JOB FORM ────────────────────────────────────────────────────────
function JobForm({
  job,
  onDuplicate,
  onDeleted
}: {
  job: JobRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();
  const [draft, setDraft] = useState<JobRecord>(() => ({
    ...job,
    levels: Array.isArray(job.levels)
      ? JSON.parse(JSON.stringify(job.levels))
      : [
          {
            level: 1,
            statBonus: {},
            grantsSkills: [],
            grantsPassives: [],
            description: ""
          }
        ]
  }));
  useEffect(() => {
    setDraft({
      ...job,
      levels: Array.isArray(job.levels)
        ? JSON.parse(JSON.stringify(job.levels))
        : [
            {
              level: 1,
              statBonus: {},
              grantsSkills: [],
              grantsPassives: [],
              description: ""
            }
          ]
    });
  }, [job]);

  const setField = useCallback(
    <K extends keyof JobRecord>(key: K, value: JobRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const unlockOptions = useMemo(
    () =>
      ds()
        .getAllAsArray<JobRecord>("jobs")
        .filter((other) => other.id !== job.id)
        .sort((a, b) =>
          String(a.name || a.id).localeCompare(String(b.name || b.id))
        ),
    [job.id]
  );

  const setLevel = useCallback((index: number, patch: Partial<JobLevel>) => {
    setDraft((prev) => {
      const next = [...(prev.levels || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, levels: next };
    });
  }, []);

  const removeLevel = useCallback((index: number) => {
    setDraft((prev) => {
      const next = (prev.levels || []).filter((_, i) => i !== index);
      return { ...prev, levels: next };
    });
  }, []);

  const addLevel = useCallback(() => {
    setDraft((prev) => {
      const used = new Set((prev.levels || []).map((l) => Number(l.level || 0)));
      let next = 2;
      while (used.has(next)) next++;
      return {
        ...prev,
        levels: [
          ...(prev.levels || []),
          {
            level: next,
            statBonus: {},
            grantsSkills: [],
            grantsPassives: [],
            description: ""
          }
        ]
      };
    });
  }, []);

  const save = useCallback(() => {
    const sortedLevels = [...(draft.levels || [])].sort(
      (a, b) => Number(a.level) - Number(b.level)
    );
    const branch = (draft.branch || "").trim();
    const unlockJob = draft.unlockRequirement?.jobId || "";

    const payload: JobRecord = {
      ...job,
      ...draft,
      id: job.id,
      branch,
      tier: Math.max(1, Number(draft.tier) || 1),
      unlockRequirement: unlockJob
        ? {
            jobId: unlockJob,
            minLevel: Math.max(1, Number(draft.unlockRequirement?.minLevel) || 1)
          }
        : null,
      xpThresholds: draft.xpThresholds || null,
      maxLevel: Number(draft.maxLevel) || 10,
      weaponTypes: draft.weaponTypes || [],
      armorTypes: draft.armorTypes || [],
      levels: sortedLevels
    };
    if (!payload.branch) delete payload.branch;
    if (!payload.unlockRequirement) delete payload.unlockRequirement;
    if (!payload.xpThresholds) delete payload.xpThresholds;
    ds().replace("jobs", job.id, payload);
    toast("Job saved", "success");
  }, [draft, job]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${job.name}"?`, () => {
      ds().remove("jobs", job.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [job, onDeleted]);

  const unlockJobId = draft.unlockRequirement?.jobId || "";
  const unlockMinLevel = Math.max(
    1,
    Number(draft.unlockRequirement?.minLevel || 1)
  );

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
        <div className="form-group" style={{ flex: "0 0 100px" }}>
          <label className="form-label">Max Level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={draft.maxLevel ?? 10}
            onChange={(e) => setField("maxLevel", Number(e.currentTarget.value) || 10)}
          />
        </div>
      </div>

      <h3>Progression Tree</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Branch</label>
          <input
            type="text"
            placeholder="warrior"
            value={draft.branch || ""}
            onChange={(e) => setField("branch", e.currentTarget.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 100px" }}>
          <label className="form-label">Tier</label>
          <input
            type="number"
            min={1}
            max={20}
            value={Number(draft.tier || 1)}
            onChange={(e) => setField("tier", Number(e.currentTarget.value) || 1)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 220px" }}>
          <label className="form-label">Unlock Job</label>
          <select
            value={unlockJobId}
            onChange={(e) =>
              setField(
                "unlockRequirement",
                e.currentTarget.value
                  ? {
                      jobId: e.currentTarget.value,
                      minLevel: unlockMinLevel
                    }
                  : null
              )
            }
          >
            <option value="">None</option>
            {unlockOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name || j.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: "0 0 130px" }}>
          <label className="form-label">Unlock Level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={unlockMinLevel}
            onChange={(e) => {
              const v = Number(e.currentTarget.value) || 1;
              setField(
                "unlockRequirement",
                unlockJobId ? { jobId: unlockJobId, minLevel: Math.max(1, v) } : null
              );
            }}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">XP Thresholds</label>
        <input
          type="text"
          placeholder="0, 80, 220, 440, 760"
          value={numberListToText(draft.xpThresholds)}
          onChange={(e) =>
            setField("xpThresholds", parseNumberList(e.currentTarget.value))
          }
        />
        <div className="dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
          Leave blank to use the default job XP curve.
        </div>
      </div>

      <h3>Equipment Profile</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Weapon Types Allowed</label>
          <TagInput
            tags={draft.weaponTypes || []}
            onChange={(t) => setField("weaponTypes", t)}
            placeholder="sword + Enter"
          />
          <div className="dim" style={{ fontSize: "0.78rem" }}>
            Wielding a weapon outside this list while this job is active is
            allowed but no job synergy applies.
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Armor Types Allowed</label>
          <TagInput
            tags={draft.armorTypes || []}
            onChange={(t) => setField("armorTypes", t)}
            placeholder="light + Enter"
          />
        </div>
      </div>

      <h3>
        Levels{" "}
        <span className="dim" style={{ fontSize: "0.8em" }}>
          — each level grants bonuses cumulatively
        </span>
      </h3>
      <LevelsBuilder
        levels={draft.levels || []}
        stats={C.STATS}
        onChange={setLevel}
        onRemove={removeLevel}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 8 }}
        onClick={addLevel}
      >
        + Add Level Tier
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
          💾 Save Job
        </button>
      </div>
    </div>
  );
}

// ── LEVELS BUILDER ──────────────────────────────────────────────────
function LevelsBuilder({
  levels,
  stats,
  onChange,
  onRemove
}: {
  levels: JobLevel[];
  stats: string[];
  onChange: (index: number, patch: Partial<JobLevel>) => void;
  onRemove: (index: number) => void;
}) {
  const sorted = useMemo(
    () =>
      levels
        .map((tier, originalIndex) => ({ tier, originalIndex }))
        .sort(
          (a, b) => Number(a.tier.level || 0) - Number(b.tier.level || 0)
        ),
    [levels]
  );

  return (
    <>
      {sorted.map(({ tier, originalIndex }) => (
        <LevelTier
          key={originalIndex}
          tier={tier}
          totalLevels={levels.length}
          stats={stats}
          onChange={(patch) => onChange(originalIndex, patch)}
          onRemove={() => onRemove(originalIndex)}
        />
      ))}
    </>
  );
}

function LevelTier({
  tier,
  totalLevels,
  stats,
  onChange,
  onRemove
}: {
  tier: JobLevel;
  totalLevels: number;
  stats: string[];
  onChange: (patch: Partial<JobLevel>) => void;
  onRemove: () => void;
}) {
  const sb = tier.statBonus || {};
  return (
    <div
      className="card"
      style={{ background: "var(--surface2)", marginBottom: 8 }}
    >
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 90px" }}>
          <label className="form-label">Level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={Number(tier.level || 1)}
            onChange={(e) =>
              onChange({ level: Number(e.currentTarget.value) || 1 })
            }
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Tier Description</label>
          <input
            type="text"
            value={tier.description || ""}
            onChange={(e) => onChange({ description: e.currentTarget.value })}
          />
        </div>
        {totalLevels > 1 ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            style={{ alignSelf: "flex-end", marginBottom: 4 }}
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="dim" style={{ fontSize: "0.78rem", margin: "-2px 0 4px" }}>
        Stat bonuses are CUMULATIVE on top of all earlier tiers when the
        character reaches this level.
      </div>
      <div className="form-row">
        {stats.map((s) => (
          <div key={s} className="form-group" style={{ flex: "0 0 70px" }}>
            <label className="form-label">{s}</label>
            <input
              type="number"
              value={Number(sb[s] || 0)}
              onChange={(e) => {
                const v = Number(e.currentTarget.value) || 0;
                const next = { ...(tier.statBonus || {}) };
                if (v) next[s] = v;
                else delete next[s];
                onChange({ statBonus: next });
              }}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Grants Skills (skill IDs, comma separated)</label>
          <input
            type="text"
            value={(tier.grantsSkills || []).join(", ")}
            onChange={(e) =>
              onChange({
                grantsSkills: e.currentTarget.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
          />
          <div className="dim" style={{ fontSize: "0.74rem" }}>
            Granted skills are auto-learned when the character reaches this job level.
          </div>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Grants Passives (passive IDs, comma separated)</label>
          <input
            type="text"
            value={(tier.grantsPassives || []).join(", ")}
            onChange={(e) =>
              onChange({
                grantsPassives: e.currentTarget.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
          />
        </div>
      </div>
      <div className="form-row">
        {(
          [
            ["skillSlotBonus", "Skill Slots +"],
            ["passiveSlotBonus", "Passive Slots +"],
            ["skillPointBonus", "Skill Points +"],
            ["passivePointBonus", "Passive Points +"]
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="form-group" style={{ flex: "0 0 130px" }}>
            <label className="form-label">{label}</label>
            <input
              type="number"
              value={Number(tier[key] || 0)}
              onChange={(e) => {
                const v = Number(e.currentTarget.value) || 0;
                onChange({ [key]: v || undefined });
              }}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
