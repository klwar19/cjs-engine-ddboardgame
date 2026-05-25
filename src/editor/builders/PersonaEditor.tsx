// React port of js/builders/persona-editor.js. Build per-world
// character "skins" — owner character + home world + stat overrides +
// job / skill / passive / equipment / branch lists + unlock rules +
// cross-world penalty + persona tags.

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

interface UnlockRules {
  default?: boolean;
  requiresChapter?: number;
  requiresPhaseNumber?: number;
  requiresPhaseType?: string | null;
  requiresFlag?: string | null;
  world?: string | null;
}

interface CrossWorldPenalty {
  statFlat?: Record<string, number>;
  damageDealtMultiplier?: number;
  damageTakenMultiplier?: number;
  relationshipModifier?: number;
  tags?: string[];
}

interface PersonaRecord extends BaseEntity {
  id: string;
  characterId?: string | null;
  world?: string | null;
  rank?: string;
  statOverrides?: Record<string, number>;
  defaultJob?: string | null;
  availableJobs?: string[];
  availableBranches?: string[];
  innatePassives?: string[];
  skills?: string[];
  equipment?: string[];
  allowedWeaponTypes?: string[];
  allowedArmorTypes?: string[];
  unlock?: UnlockRules;
  crossWorldPenalty?: CrossWorldPenalty;
  relationshipPerWorld?: Record<string, unknown>;
}

const DEFAULT_RANKS = ["F", "E", "D", "C", "B", "A", "S", "SR", "SSR"];

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function PersonaEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<PersonaRecord[]>(
    () =>
      cm()?.getVisibleItems?.<PersonaRecord>("personas", search) ||
      (search
        ? ds().search<PersonaRecord>("personas", search)
        : ds().getAllAsArray<PersonaRecord>("personas")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick]
  );
  const active = useMemo<PersonaRecord | null>(
    () => (activeId ? ds().get<PersonaRecord>("personas", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const defaults: Partial<PersonaRecord> = {
      name: "New Persona",
      icon: "🎭",
      characterId: "",
      world: "",
      rank: "F",
      description: "",
      statOverrides: {},
      defaultJob: "",
      availableJobs: [],
      availableBranches: [],
      innatePassives: [],
      skills: [],
      equipment: [],
      allowedWeaponTypes: [],
      allowedArmorTypes: [],
      unlock: { default: true },
      crossWorldPenalty: {
        statFlat: {},
        damageDealtMultiplier: 0.8,
        damageTakenMultiplier: 1.2,
        relationshipModifier: -1,
        tags: []
      },
      relationshipPerWorld: {},
      tags: []
    };
    const onCreated = (id: string) => {
      setActiveId(id);
      toast("Persona created", "success");
    };
    const CM = cm();
    if (CM?.createEntry) {
      CM.createEntry("personas", defaults, onCreated);
    } else {
      onCreated(ds().create<PersonaRecord>("personas", defaults));
    }
  }, []);

  const renderListItem = useCallback((p: PersonaRecord) => {
    const ownerChar = p.characterId
      ? ds().get<BaseEntity>("characters", p.characterId)
      : null;
    const ownerName = ownerChar?.name || p.characterId || "—";
    const worldRec = p.world
      ? ds().get<{ displayName?: string }>("worlds", p.world)
      : null;
    const worldName = worldRec?.displayName || p.world || "—";
    return (
      <>
        <span className="item-icon">{p.icon || "🎭"}</span>
        <div style={{ minWidth: 0 }}>
          <div className="item-name">{p.name || p.id}</div>
          <div className="item-sub">
            {ownerName} · {worldName}
          </div>
        </div>
      </>
    );
  }, []);

  return (
    <div className="flex gap-md" style={{ height: "100%" }}>
      <div
        style={{
          width: 280,
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
            placeholder="Search personas..."
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
          <DataList<PersonaRecord>
            entityType="personas"
            items={items}
            activeId={activeId}
            onSelect={(p) => setActiveId(p.id)}
            renderItem={renderListItem}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <PersonaForm
            key={active.id}
            persona={active}
            onDuplicate={() => {
              const newId = ds().duplicate("personas", active.id);
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
            Select a persona or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── PERSONA FORM ────────────────────────────────────────────────────
function PersonaForm({
  persona,
  onDuplicate,
  onDeleted
}: {
  persona: PersonaRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();
  const stats = C.STATS || ["S", "P", "E", "C", "I", "A", "L"];
  const ranks = C.RANKS || DEFAULT_RANKS;

  const [draft, setDraft] = useState<PersonaRecord>(() => ({ ...persona }));
  useEffect(() => {
    setDraft({ ...persona });
  }, [persona]);

  const setField = useCallback(
    <K extends keyof PersonaRecord>(key: K, value: PersonaRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );

  const setUnlock = useCallback(
    (patch: Partial<UnlockRules>) =>
      setDraft((prev) => ({
        ...prev,
        unlock: { ...(prev.unlock || {}), ...patch }
      })),
    []
  );
  const setPenalty = useCallback(
    (patch: Partial<CrossWorldPenalty>) =>
      setDraft((prev) => ({
        ...prev,
        crossWorldPenalty: { ...(prev.crossWorldPenalty || {}), ...patch }
      })),
    []
  );

  // Dropdown sources
  const characters = useMemo(
    () =>
      ds()
        .getAllAsArray<BaseEntity>("characters")
        .sort((a, b) =>
          String(a.name || a.id).localeCompare(String(b.name || b.id))
        ),
    []
  );
  const worlds = useMemo(
    () =>
      ds()
        .getAllAsArray<BaseEntity & { displayName?: string; order?: number }>(
          "worlds"
        )
        .sort((a, b) => Number(a.order || 999) - Number(b.order || 999)),
    []
  );
  const jobs = useMemo(
    () =>
      ds()
        .getAllAsArray<BaseEntity>("jobs")
        .sort((a, b) =>
          String(a.name || a.id).localeCompare(String(b.name || b.id))
        ),
    []
  );

  const save = useCallback(() => {
    const overrides = draft.statOverrides || {};
    // Strip zero values
    const cleanedOverrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (Number.isFinite(v) && v !== 0) cleanedOverrides[k] = v;
    }
    const penFlat = draft.crossWorldPenalty?.statFlat || {};
    const cleanedPenFlat: Record<string, number> = {};
    for (const [k, v] of Object.entries(penFlat)) {
      if (Number.isFinite(v) && v !== 0) cleanedPenFlat[k] = v;
    }

    const next: PersonaRecord = {
      ...persona,
      ...draft,
      name: (draft.name || "").trim() || "Unnamed Persona",
      icon: (draft.icon || "").trim() || "🎭",
      rank: draft.rank || "F",
      characterId: draft.characterId || null,
      world: draft.world || null,
      description: draft.description || "",
      statOverrides: cleanedOverrides,
      defaultJob: draft.defaultJob || null,
      availableJobs: draft.availableJobs || [],
      availableBranches: draft.availableBranches || [],
      innatePassives: draft.innatePassives || [],
      skills: draft.skills || [],
      equipment: draft.equipment || [],
      allowedWeaponTypes: draft.allowedWeaponTypes || [],
      allowedArmorTypes: draft.allowedArmorTypes || [],
      unlock: {
        default: !!draft.unlock?.default,
        requiresChapter: Number(draft.unlock?.requiresChapter) || 0,
        requiresPhaseNumber: Number(draft.unlock?.requiresPhaseNumber) || 0,
        requiresPhaseType: (draft.unlock?.requiresPhaseType || "").trim() || null,
        requiresFlag: (draft.unlock?.requiresFlag || "").trim() || null,
        world: draft.world || null
      },
      crossWorldPenalty: {
        ...(persona.crossWorldPenalty || {}),
        statFlat: cleanedPenFlat,
        damageDealtMultiplier:
          Number(draft.crossWorldPenalty?.damageDealtMultiplier) || 1,
        damageTakenMultiplier:
          Number(draft.crossWorldPenalty?.damageTakenMultiplier) || 1,
        relationshipModifier:
          Number(draft.crossWorldPenalty?.relationshipModifier) || 0,
        tags: draft.crossWorldPenalty?.tags || []
      },
      tags: draft.tags || []
    };
    const CM = cm();
    const prepared = CM?.prepareRecord
      ? CM.prepareRecord("personas", persona.id, next)
      : next;
    ds().replace("personas", persona.id, prepared);
    toast("Persona saved", "success");
  }, [draft, persona]);

  const onDelete = useCallback(() => {
    confirm(`Delete persona "${persona.name || persona.id}"?`, () => {
      ds().remove("personas", persona.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [persona, onDeleted]);

  const passiveSuggestions = useMemo(
    () => ds().getAllAsArray<BaseEntity>("passives").map((x) => x.id),
    []
  );
  const skillSuggestions = useMemo(
    () => ds().getAllAsArray<BaseEntity>("skills").map((x) => x.id),
    []
  );
  const itemSuggestions = useMemo(
    () => ds().getAllAsArray<BaseEntity>("items").map((x) => x.id),
    []
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || "🎭"} {draft.name || "Unnamed"}
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
          <label className="form-label">ID</label>
          <input type="text" value={persona.id} disabled />
        </div>
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            type="text"
            value={draft.name || ""}
            onChange={(e) => setField("name", e.currentTarget.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 100px" }}>
          <label className="form-label">Icon</label>
          <input
            type="text"
            value={draft.icon || "🎭"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
            style={{ textAlign: "center", fontSize: "1.2em" }}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 90px" }}>
          <label className="form-label">Rank</label>
          <select
            value={draft.rank || "F"}
            onChange={(e) => setField("rank", e.currentTarget.value)}
          >
            {ranks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Owner Character</label>
          <select
            value={draft.characterId || ""}
            onChange={(e) =>
              setField("characterId", e.currentTarget.value || null)
            }
          >
            <option value="">— pick character —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Home World</label>
          <select
            value={draft.world || ""}
            onChange={(e) => setField("world", e.currentTarget.value || null)}
          >
            <option value="">— pick world —</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.displayName || w.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          rows={2}
          value={draft.description || ""}
          onChange={(e) => setField("description", e.currentTarget.value)}
        />
      </div>

      <h3>
        Stat Overrides{" "}
        <span className="dim" style={{ fontSize: "0.8em" }}>
          — added on top of universal SPECIAL
        </span>
      </h3>
      <div className="form-row">
        {stats.map((s) => (
          <div key={s} className="form-group" style={{ flex: "0 0 90px" }}>
            <label className="form-label">{s}</label>
            <input
              type="number"
              value={Number(draft.statOverrides?.[s] || 0)}
              onChange={(e) => {
                const v = Number(e.currentTarget.value) || 0;
                const next = { ...(draft.statOverrides || {}) };
                if (v) next[s] = v;
                else delete next[s];
                setField("statOverrides", next);
              }}
            />
          </div>
        ))}
      </div>

      <h3>Loadout</h3>
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 280px" }}>
          <label className="form-label">Default Job</label>
          <select
            value={draft.defaultJob || ""}
            onChange={(e) =>
              setField("defaultJob", e.currentTarget.value || null)
            }
          >
            <option value="">— none —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.icon || ""} {j.name || j.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Available Jobs</label>
          <TagInput
            tags={draft.availableJobs || []}
            onChange={(t) => setField("availableJobs", t)}
            placeholder="job_warrior + Enter"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Available Branches</label>
          <TagInput
            tags={draft.availableBranches || []}
            onChange={(t) => setField("availableBranches", t)}
            placeholder="warrior + Enter"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Innate Passives</label>
          <TagInput
            tags={draft.innatePassives || []}
            onChange={(t) => setField("innatePassives", t)}
            placeholder="passive id + Enter"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Persona Skills</label>
          <TagInput
            tags={draft.skills || []}
            onChange={(t) => setField("skills", t)}
            placeholder="skill id + Enter"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Persona Starting Equipment</label>
          <TagInput
            tags={draft.equipment || []}
            onChange={(t) => setField("equipment", t)}
            placeholder="item id + Enter"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Weapon Types Allowed</label>
          <TagInput
            tags={draft.allowedWeaponTypes || []}
            onChange={(t) => setField("allowedWeaponTypes", t)}
            placeholder="sword + Enter"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Armor Types Allowed</label>
          <TagInput
            tags={draft.allowedArmorTypes || []}
            onChange={(t) => setField("allowedArmorTypes", t)}
            placeholder="light + Enter"
          />
        </div>
      </div>

      <h3>Unlock Rules</h3>
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 160px" }}>
          <label className="form-label">
            <input
              type="checkbox"
              checked={!!draft.unlock?.default}
              onChange={(e) => setUnlock({ default: e.currentTarget.checked })}
            />{" "}
            Default unlocked
          </label>
        </div>
        <div className="form-group" style={{ flex: "0 0 140px" }}>
          <label className="form-label">Chapter ≥</label>
          <input
            type="number"
            min={0}
            value={Number(draft.unlock?.requiresChapter || 0)}
            onChange={(e) =>
              setUnlock({ requiresChapter: Number(e.currentTarget.value) || 0 })
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 160px" }}>
          <label className="form-label">Phase # ≥</label>
          <input
            type="number"
            min={0}
            value={Number(draft.unlock?.requiresPhaseNumber || 0)}
            onChange={(e) =>
              setUnlock({
                requiresPhaseNumber: Number(e.currentTarget.value) || 0
              })
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 160px" }}>
          <label className="form-label">Phase Type</label>
          <input
            type="text"
            placeholder="travel_phase"
            value={draft.unlock?.requiresPhaseType || ""}
            onChange={(e) =>
              setUnlock({ requiresPhaseType: e.currentTarget.value || null })
            }
          />
        </div>
        <div className="form-group">
          <label className="form-label">Required Flag</label>
          <input
            type="text"
            placeholder="zombie_first_camp_secured"
            value={draft.unlock?.requiresFlag || ""}
            onChange={(e) =>
              setUnlock({ requiresFlag: e.currentTarget.value || null })
            }
          />
        </div>
      </div>
      <div className="dim" style={{ fontSize: "0.78rem", marginBottom: 8 }}>
        Set "Default unlocked" for starter personas. Other rules gate
        phase-locked personas; all conditions must pass.
      </div>

      <h3>
        Cross-World Penalty{" "}
        <span className="dim" style={{ fontSize: "0.8em" }}>
          — applied when used outside home world
        </span>
      </h3>
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 180px" }}>
          <label className="form-label">Damage Dealt ×</label>
          <input
            type="number"
            step={0.05}
            value={Number(
              draft.crossWorldPenalty?.damageDealtMultiplier ?? 1
            )}
            onChange={(e) =>
              setPenalty({
                damageDealtMultiplier: Number(e.currentTarget.value) || 1
              })
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 180px" }}>
          <label className="form-label">Damage Taken ×</label>
          <input
            type="number"
            step={0.05}
            value={Number(
              draft.crossWorldPenalty?.damageTakenMultiplier ?? 1
            )}
            onChange={(e) =>
              setPenalty({
                damageTakenMultiplier: Number(e.currentTarget.value) || 1
              })
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 200px" }}>
          <label className="form-label">Relationship Modifier</label>
          <input
            type="number"
            value={Number(draft.crossWorldPenalty?.relationshipModifier ?? 0)}
            onChange={(e) =>
              setPenalty({
                relationshipModifier: Number(e.currentTarget.value) || 0
              })
            }
          />
        </div>
      </div>
      <div className="form-row">
        {stats.map((s) => (
          <div key={s} className="form-group" style={{ flex: "0 0 90px" }}>
            <label className="form-label">{s} (flat)</label>
            <input
              type="number"
              value={Number(draft.crossWorldPenalty?.statFlat?.[s] || 0)}
              onChange={(e) => {
                const v = Number(e.currentTarget.value) || 0;
                const next = { ...(draft.crossWorldPenalty?.statFlat || {}) };
                if (v) next[s] = v;
                else delete next[s];
                setPenalty({ statFlat: next });
              }}
            />
          </div>
        ))}
      </div>
      <div className="form-group">
        <label className="form-label">
          Cross-world tags (comma-separated)
        </label>
        <input
          type="text"
          placeholder="out_of_place, rot_smell"
          value={(draft.crossWorldPenalty?.tags || []).join(", ")}
          onChange={(e) =>
            setPenalty({
              tags: e.currentTarget.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            })
          }
        />
        <div className="dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
          Character dialogue / quips can gate by these tags.
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Persona tags</label>
        <input
          type="text"
          placeholder="adventurer, fantasy"
          value={(draft.tags || []).join(", ")}
          onChange={(e) =>
            setField(
              "tags",
              e.currentTarget.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Persona
        </button>
      </div>
      {/* Reference suggestion arrays to keep them eligible for tag autocompletion */}
      <span style={{ display: "none" }}>
        {passiveSuggestions.length}
        {skillSuggestions.length}
        {itemSuggestions.length}
      </span>
    </div>
  );
}
