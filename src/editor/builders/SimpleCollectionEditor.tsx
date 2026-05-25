// React port of js/builders/simple-collection-editor.js. Generic list +
// detail editor used for food, materials and crafting collections.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cm,
  ds,
  type BaseEntity
} from "./_shared/cjs";
import {
  DataList,
  SearchInput,
  confirm,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface FoodBuff {
  stat?: string;
  amount?: number;
}

interface SimpleRecord extends BaseEntity {
  id: string;
  rarity?: string;
  duration?: string;
  buff?: FoodBuff;
  inputs?: Record<string, Record<string, number>>;
  outputs?: Record<string, Record<string, number>>;
  subCategory?: string;
  value?: number;
  station?: string;
}

interface CollectionSpec {
  readonly type: "food" | "materials" | "crafting";
  readonly singularLabel: string;
  readonly pluralLabel: string;
  readonly defaultIcon: string;
  readonly buildDefaults: () => Partial<SimpleRecord>;
}

const SPECS: Record<"food" | "materials" | "crafting", CollectionSpec> = {
  food: {
    type: "food",
    singularLabel: "food",
    pluralLabel: "food",
    defaultIcon: "🍲",
    buildDefaults: () => ({
      name: "New Food",
      icon: "🍲",
      rarity: "Common",
      duration: "next_battle",
      buff: { stat: "E", amount: 1 },
      inputs: { materials: {} },
      description: ""
    })
  },
  materials: {
    type: "materials",
    singularLabel: "material",
    pluralLabel: "materials",
    defaultIcon: "🧱",
    buildDefaults: () => ({
      name: "New Material",
      icon: "🧱",
      rarity: "Common",
      subCategory: "material",
      value: 0,
      description: ""
    })
  },
  crafting: {
    type: "crafting",
    singularLabel: "recipe",
    pluralLabel: "recipes",
    defaultIcon: "🔨",
    buildDefaults: () => ({
      name: "New Recipe",
      icon: "🔨",
      station: "workbench",
      inputs: { materials: {} },
      outputs: { items: {} },
      description: ""
    })
  }
};

function scopeLabel(item: SimpleRecord): string {
  const scope = item._scope || "legacy";
  if (scope === "world") {
    const world = item._world
      ? ds().get<{ displayName?: string }>("worlds", item._world)
      : null;
    return world?.displayName || item._world || "World";
  }
  if (scope === "universal") return "Universal";
  if (scope === "system") return "System";
  return "Legacy";
}

function metaSnippet(item: SimpleRecord, type: CollectionSpec["type"]): string {
  const bits: string[] = [];
  if (item.rarity) bits.push(item.rarity);
  if (type === "food" && item.buff?.stat) {
    bits.push(`${item.buff.stat} +${item.buff.amount || 0}`);
  }
  if (type === "crafting" && item.station) {
    bits.push(`@${item.station}`);
  }
  if (type === "materials" && item.subCategory) {
    bits.push(item.subCategory);
  }
  return bits.join(" · ") || item.id;
}

// ── INPUT / OUTPUT BUCKETS (read-only, like vanilla) ────────────────
function BucketGroup({ label, group }: { label: string; group: SimpleRecord["inputs"] | undefined }) {
  if (!group || typeof group !== "object") return null;
  const entries = Object.entries(group);
  if (entries.length === 0) return null;
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {entries.map(([bucket, items]) => (
        <div key={bucket} style={{ marginBottom: 6 }}>
          <div
            style={{
              fontSize: "0.74rem",
              color: "var(--text-mute)",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}
          >
            {bucket}
          </div>
          <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
            {Object.entries(items || {}).map(([id, qty]) => {
              const rec =
                ds().get<{ name?: string; icon?: string }>("items", id) ||
                ds().get<{ name?: string; icon?: string }>("materials", id) ||
                ds().get<{ name?: string; icon?: string }>("food", id);
              const name = rec?.name || id;
              const icon = rec?.icon || "";
              return (
                <li key={id}>
                  {icon} {name}{" "}
                  <span style={{ color: "var(--text-mute)" }}>×{qty}</span>{" "}
                  <span style={{ color: "var(--text-mute)", fontSize: "0.72rem" }}>
                    [{id}]
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── GENERIC PANEL ────────────────────────────────────────────────────
function CollectionPanel({ spec }: { spec: CollectionSpec }) {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<SimpleRecord[]>(
    () =>
      cm()?.getVisibleItems?.<SimpleRecord>(spec.type, search) ||
      (search
        ? ds().search<SimpleRecord>(spec.type, search)
        : ds().getAllAsArray<SimpleRecord>(spec.type)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick, spec.type]
  );
  const active = useMemo<SimpleRecord | null>(
    () => (activeId ? ds().get<SimpleRecord>(spec.type, activeId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, dataTick, spec.type]
  );

  const createNew = useCallback(() => {
    const defaults = spec.buildDefaults();
    const onCreated = (id: string) => {
      setActiveId(id);
      toast(`${spec.singularLabel} created`, "success");
    };
    const CM = cm();
    if (CM?.createEntry) {
      CM.createEntry(spec.type, defaults, onCreated);
    } else {
      onCreated(ds().create<SimpleRecord>(spec.type, defaults));
    }
  }, [spec]);

  const renderListItem = useCallback(
    (rec: SimpleRecord) => (
      <>
        <span className="item-icon">{rec.icon || spec.defaultIcon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="item-name">{rec.name || rec.id}</div>
          <div className="item-sub">{metaSnippet(rec, spec.type)}</div>
        </div>
      </>
    ),
    [spec]
  );

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
            placeholder={`Search ${spec.pluralLabel}...`}
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
          <DataList<SimpleRecord>
            entityType={spec.type}
            items={items}
            activeId={activeId}
            onSelect={(rec) => setActiveId(rec.id)}
            renderItem={renderListItem}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <SimpleForm
            key={active.id}
            spec={spec}
            record={active}
            onDeleted={() => setActiveId(null)}
            onDuplicated={(newId) => {
              setActiveId(newId);
              toast("Duplicated", "success");
            }}
          />
        ) : (
          <div
            className="card"
            style={{ textAlign: "center", color: "var(--text-mute)", padding: 40 }}
          >
            Select a {spec.singularLabel} or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── SIMPLE FORM ──────────────────────────────────────────────────────
function SimpleForm({
  spec,
  record,
  onDeleted,
  onDuplicated
}: {
  spec: CollectionSpec;
  record: SimpleRecord;
  onDeleted: () => void;
  onDuplicated: (newId: string) => void;
}) {
  const [draft, setDraft] = useState<SimpleRecord>(() => ({ ...record }));
  useEffect(() => {
    setDraft({ ...record });
  }, [record]);

  const persist = useCallback(
    (next: SimpleRecord) => {
      const CM = cm();
      const prepared = CM?.prepareRecord
        ? CM.prepareRecord(spec.type, record.id, next)
        : next;
      ds().replace(spec.type, record.id, prepared);
    },
    [record.id, spec.type]
  );

  // Each field commits on blur/change exactly like the vanilla
  // `_bindInputForRecord` flow.
  const commitField = useCallback(
    <K extends keyof SimpleRecord>(key: K, value: SimpleRecord[K], label: string) => {
      const next = { ...draft, [key]: value };
      setDraft(next);
      persist(next);
      toast(`${label} updated`, "success", 1500);
    },
    [draft, persist]
  );

  const commitBuff = useCallback(
    (patch: Partial<FoodBuff>) => {
      const buff = { ...(draft.buff || {}), ...patch };
      const next = { ...draft, buff };
      setDraft(next);
      persist(next);
      toast("Buff updated", "success", 1500);
    },
    [draft, persist]
  );

  const onDuplicate = useCallback(() => {
    const newId = ds().duplicate(spec.type, record.id);
    if (newId) onDuplicated(newId);
  }, [record.id, spec.type, onDuplicated]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${draft.name || record.id}"?`, () => {
      ds().remove(spec.type, record.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [draft.name, record.id, spec.type, onDeleted]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          {draft.icon || spec.defaultIcon} {draft.name || "Unnamed"}
        </span>
        <div className="btn-group">
          <span
            className="scope-chip"
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              fontSize: "0.72rem",
              fontWeight: 600
            }}
          >
            {scopeLabel(draft)}
          </span>
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
      {record._origin ? (
        <div style={{ fontSize: "0.72rem", color: "var(--text-mute)" }}>
          {record._origin}
        </div>
      ) : null}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">ID</label>
          <input type="text" value={record.id} disabled />
        </div>
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            type="text"
            value={draft.name || ""}
            onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
            onBlur={(e) => commitField("name", e.currentTarget.value, "Name")}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 90px" }}>
          <label className="form-label">Icon</label>
          <input
            type="text"
            value={draft.icon || spec.defaultIcon}
            onChange={(e) => setDraft({ ...draft, icon: e.currentTarget.value })}
            onBlur={(e) => commitField("icon", e.currentTarget.value, "Icon")}
            style={{ textAlign: "center", fontSize: "1.2em" }}
          />
        </div>
      </div>

      <TypeSpecific
        spec={spec}
        draft={draft}
        setDraft={setDraft}
        commitField={commitField}
        commitBuff={commitBuff}
      />

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          rows={3}
          value={draft.description || ""}
          onChange={(e) =>
            setDraft({ ...draft, description: e.currentTarget.value })
          }
          onBlur={(e) =>
            commitField("description", e.currentTarget.value, "Description")
          }
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

// ── TYPE-SPECIFIC FIELDS ─────────────────────────────────────────────
function TypeSpecific({
  spec,
  draft,
  setDraft,
  commitField,
  commitBuff
}: {
  spec: CollectionSpec;
  draft: SimpleRecord;
  setDraft: (next: SimpleRecord) => void;
  commitField: <K extends keyof SimpleRecord>(
    key: K,
    value: SimpleRecord[K],
    label: string
  ) => void;
  commitBuff: (patch: Partial<FoodBuff>) => void;
}) {
  if (spec.type === "food") {
    const buff = draft.buff || {};
    return (
      <>
        <div className="form-row">
          <div className="form-group" style={{ flex: "0 0 140px" }}>
            <label className="form-label">Rarity</label>
            <input
              type="text"
              value={draft.rarity || "Common"}
              onChange={(e) => setDraft({ ...draft, rarity: e.currentTarget.value })}
              onBlur={(e) => commitField("rarity", e.currentTarget.value, "Rarity")}
            />
          </div>
          <div className="form-group" style={{ flex: "0 0 160px" }}>
            <label className="form-label">Duration</label>
            <input
              type="text"
              value={draft.duration || "next_battle"}
              onChange={(e) =>
                setDraft({ ...draft, duration: e.currentTarget.value })
              }
              onBlur={(e) =>
                commitField("duration", e.currentTarget.value, "Duration")
              }
            />
          </div>
          <div className="form-group" style={{ flex: "0 0 100px" }}>
            <label className="form-label">Buff Stat</label>
            <input
              type="text"
              value={buff.stat || ""}
              onChange={(e) =>
                setDraft({ ...draft, buff: { ...buff, stat: e.currentTarget.value } })
              }
              onBlur={() => commitBuff({ stat: buff.stat })}
            />
          </div>
          <div className="form-group" style={{ flex: "0 0 100px" }}>
            <label className="form-label">Buff Amount</label>
            <input
              type="number"
              value={buff.amount || 0}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  buff: { ...buff, amount: Number(e.currentTarget.value) || 0 }
                })
              }
              onBlur={() =>
                commitBuff({ amount: Number(buff.amount) || 0 })
              }
            />
          </div>
        </div>
        <BucketGroup label="Inputs (read-only)" group={draft.inputs} />
      </>
    );
  }
  if (spec.type === "materials") {
    return (
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 140px" }}>
          <label className="form-label">Rarity</label>
          <input
            type="text"
            value={draft.rarity || "Common"}
            onChange={(e) => setDraft({ ...draft, rarity: e.currentTarget.value })}
            onBlur={(e) => commitField("rarity", e.currentTarget.value, "Rarity")}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 200px" }}>
          <label className="form-label">Sub-category</label>
          <input
            type="text"
            value={draft.subCategory || "material"}
            onChange={(e) => setDraft({ ...draft, subCategory: e.currentTarget.value })}
            onBlur={(e) => commitField("subCategory", e.currentTarget.value, "Sub-category")}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 120px" }}>
          <label className="form-label">Value (gold)</label>
          <input
            type="number"
            value={draft.value || 0}
            onChange={(e) =>
              setDraft({ ...draft, value: Number(e.currentTarget.value) || 0 })
            }
            onBlur={(e) =>
              commitField("value", Number(e.currentTarget.value) || 0, "Value")
            }
          />
        </div>
      </div>
    );
  }
  // crafting
  return (
    <>
      <div className="form-row">
        <div className="form-group" style={{ flex: "0 0 200px" }}>
          <label className="form-label">Station</label>
          <input
            type="text"
            value={draft.station || "workbench"}
            onChange={(e) => setDraft({ ...draft, station: e.currentTarget.value })}
            onBlur={(e) => commitField("station", e.currentTarget.value, "Station")}
          />
        </div>
      </div>
      <BucketGroup label="Inputs (read-only)" group={draft.inputs} />
      <BucketGroup label="Outputs (read-only)" group={draft.outputs} />
    </>
  );
}

// ── EXPORTED PANELS ─────────────────────────────────────────────────
export function FoodEditor() {
  return <CollectionPanel spec={SPECS.food} />;
}
export function MaterialsEditor() {
  return <CollectionPanel spec={SPECS.materials} />;
}
export function CraftingEditor() {
  return <CollectionPanel spec={SPECS.crafting} />;
}
