// React port of js/builders/item-editor.js. Build items (weapons,
// armor, accessories, consumables) with effects, weapon data, granted
// skills and a portrait field that embeds the vanilla PortraitPicker
// widget.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cm,
  constants,
  ds,
  effectRegistry,
  type BaseEntity,
  type Effect,
  type PortraitWidget
} from "./_shared/cjs";
import {
  DataList,
  EffectListBuilder,
  type EffectRef,
  PortraitField,
  SearchInput,
  confirm,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface WeaponData {
  baseDamage?: number;
  damageType?: string;
  element?: string | null;
  range?: number;
  weaponType?: string;
}

interface ItemRecord extends BaseEntity {
  id: string;
  slot?: string;
  rarity?: string;
  equipmentCategory?: string;
  weaponType?: string;
  armorType?: string;
  accessoryType?: string;
  characteristic?: string;
  changeNotes?: string;
  effects?: EffectRef[];
  weaponData?: WeaponData | null;
  portrait?: string;
  portraitFocus?: unknown;
  grantedSkills?: string[];
  type?: string;
}

function cleanType(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, "")
    .replace(/\s+/g, "_");
}

function gearKindFromSlot(slot: string | undefined): string {
  if (slot === "weapon" || slot === "offhand") return "weapon";
  if (["armor", "head", "body", "legs", "feet"].includes(slot || "")) return "armor";
  if (["accessory", "accessory1", "accessory2"].includes(slot || ""))
    return "accessory";
  return slot || "item";
}

function inferType(item: ItemRecord, types: string[]): string {
  const text = [item.id, item.name, item.slot, ...(item.tags || [])]
    .join(" ")
    .toLowerCase();
  const aliases: Record<string, string> = {
    blade: "sword",
    longsword: "sword",
    shortsword: "sword",
    katana: "sword",
    fang: "dagger",
    knife: "dagger",
    longbow: "bow",
    shortbow: "bow",
    fist: "knuckles",
    claw: "knuckles",
    gauntlet: "knuckles",
    rod: "staff",
    tome: "staff",
    leather: "light",
    cloak: "light",
    boots: "light",
    cloth: "robe",
    mail: "heavy",
    plate: "heavy",
    pendant: "amulet",
    necklace: "amulet",
    coin: "charm",
    core: "trinket"
  };
  for (const [alias, type] of Object.entries(aliases)) {
    if ((types || []).includes(type) && text.includes(alias)) return type;
  }
  return (types || []).find((type) => text.includes(type)) || "";
}

function weaponTypeOf(item: ItemRecord, types: string[]): string {
  return cleanType(
    item.weaponType || item.weaponData?.weaponType || item.type || inferType(item, types)
  );
}
function armorTypeOf(item: ItemRecord, types: string[]): string {
  return cleanType(item.armorType || item.type || inferType(item, types));
}
function accessoryTypeOf(item: ItemRecord, types: string[]): string {
  return cleanType(item.accessoryType || item.type || inferType(item, types));
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function ItemEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<ItemRecord[]>(
    () =>
      cm()?.getVisibleItems?.<ItemRecord>("items", search) ||
      (search
        ? ds().search<ItemRecord>("items", search)
        : ds().getAllAsArray<ItemRecord>("items")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, dataTick]
  );
  const active = useMemo<ItemRecord | null>(
    () => (activeId ? ds().get<ItemRecord>("items", activeId) : null),
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const id = ds().create<ItemRecord>("items", {
      name: "New Item",
      icon: "📦",
      slot: "weapon",
      rarity: "Common",
      weaponType: "sword",
      armorType: "",
      accessoryType: "",
      characteristic: "",
      changeNotes: "",
      effects: [],
      weaponData: null,
      portrait: "",
      description: ""
    });
    setActiveId(id);
    toast("Item created", "success");
  }, []);

  const renderListItem = useCallback((i: ItemRecord) => {
    const color = constants().RARITY_COLORS?.[i.rarity || ""] || "var(--text-dim)";
    return (
      <>
        <span className="item-icon">{i.icon || "📦"}</span>
        <div>
          <div className="item-name" style={{ color }}>
            {i.name || i.id}
          </div>
          <div className="item-sub">
            {i.slot || ""} · {i.rarity || ""}
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
            placeholder="Search items..."
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
          <DataList<ItemRecord>
            entityType="items"
            items={items}
            activeId={activeId}
            onSelect={(i) => setActiveId(i.id)}
            renderItem={renderListItem}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <ItemForm
            key={active.id}
            item={active}
            onDuplicate={() => {
              const nid = ds().duplicate("items", active.id);
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
            Select an item or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

// ── ITEM FORM ───────────────────────────────────────────────────────
function ItemForm({
  item,
  onDuplicate,
  onDeleted
}: {
  item: ItemRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();
  const ER = effectRegistry();

  const [draft, setDraft] = useState<ItemRecord>(() => ({ ...item }));
  useEffect(() => {
    setDraft({ ...item });
  }, [item]);

  const portraitRef = useRef<PortraitWidget | null>(null);

  const setField = useCallback(
    <K extends keyof ItemRecord>(key: K, value: ItemRecord[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );
  const setWeaponData = useCallback(
    (patch: Partial<WeaponData>) =>
      setDraft((prev) => ({
        ...prev,
        weaponData: { ...(prev.weaponData || {}), ...patch }
      })),
    []
  );

  // Derived gear kind from current slot.
  const slot = draft.slot || "weapon";
  const kind = gearKindFromSlot(slot);

  // Cache type lists.
  const weaponTypes = C.WEAPON_TYPES || [];
  const armorTypes = C.ARMOR_TYPES || [];
  const accessoryTypes = C.ACCESSORY_TYPES || [];

  // Initial type values inferred for legacy items that don't carry the
  // explicit weaponType / armorType / accessoryType field.
  const weaponTypeVal = draft.weaponType ?? weaponTypeOf(draft, weaponTypes);
  const armorTypeVal = draft.armorType ?? armorTypeOf(draft, armorTypes);
  const accessoryTypeVal =
    draft.accessoryType ?? accessoryTypeOf(draft, accessoryTypes);

  // Effects preview.
  const preview = useMemo(() => {
    const resolved = ER.resolveRefs(draft.effects || []);
    return resolved.map((e) => ER.autoDescribe(e as Effect)).join(", ") || "None";
  }, [draft.effects, ER]);

  const allSkills = useMemo(
    () => ds().getAllAsArray<{ id: string; name?: string; icon?: string; ap?: number; mp?: number }>("skills"),
    []
  );

  const grantedSkills = draft.grantedSkills || [];
  const availableSkills = useMemo(
    () => allSkills.filter((s) => !grantedSkills.includes(s.id)),
    [allSkills, grantedSkills]
  );

  const save = useCallback(() => {
    const slotVal = draft.slot || "weapon";
    const equipmentCategory = gearKindFromSlot(slotVal);
    const cleanedWeaponType = cleanType(weaponTypeVal || "");
    const cleanedArmorType = cleanType(armorTypeVal || "");
    const cleanedAccessoryType = cleanType(accessoryTypeVal || "");
    const payload: ItemRecord = {
      ...item,
      ...draft,
      portrait: portraitRef.current
        ? portraitRef.current.getValue()
        : draft.portrait || "",
      portraitFocus: portraitRef.current
        ? portraitRef.current.getFocus()
        : draft.portraitFocus,
      equipmentCategory,
      weaponType:
        equipmentCategory === "weapon" ? cleanedWeaponType || "sword" : "",
      armorType:
        equipmentCategory === "armor" ? cleanedArmorType || "light" : "",
      accessoryType:
        equipmentCategory === "accessory"
          ? cleanedAccessoryType || "ring"
          : "",
      effects: draft.effects || [],
      grantedSkills: draft.grantedSkills || [],
      weaponData:
        equipmentCategory === "weapon"
          ? {
              baseDamage: Number(draft.weaponData?.baseDamage) || 0,
              damageType: draft.weaponData?.damageType || "Physical",
              element: draft.weaponData?.element || null,
              range: Number(draft.weaponData?.range) || 1,
              weaponType: cleanedWeaponType || "sword"
            }
          : null
    };
    ds().replace("items", item.id, payload);
    toast("Item saved", "success");
  }, [draft, item, weaponTypeVal, armorTypeVal, accessoryTypeVal]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${item.name}"?`, () => {
      ds().remove("items", item.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [item, onDeleted]);

  const rarityColor = C.RARITY_COLORS?.[draft.rarity || ""] || "";

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ color: rarityColor }}>
          {draft.icon || "📦"} {draft.name || "Unnamed"}
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
            value={draft.icon || "📦"}
            onChange={(e) => setField("icon", e.currentTarget.value)}
          />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <PortraitField
          currentPath={draft.portrait}
          currentFocus={draft.portraitFocus}
          category="items"
          id={item.id}
          name={item.name}
          fallbackIcon={draft.icon || "?"}
          widgetRef={portraitRef}
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Slot</label>
          <select
            value={slot}
            onChange={(e) => setField("slot", e.currentTarget.value)}
          >
            {(C.EQUIPMENT_SLOTS || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="consumable">consumable</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Rarity</label>
          <select
            value={draft.rarity || "Common"}
            onChange={(e) => setField("rarity", e.currentTarget.value)}
          >
            {(C.RARITIES || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>Equipment Type</h3>
      <div className="form-row">
        {kind === "weapon" && (
          <div className="form-group">
            <label className="form-label">Weapon Type</label>
            <input
              type="text"
              list="itm-weapon-types"
              placeholder="sword, bow, staff..."
              value={weaponTypeVal}
              onChange={(e) => setField("weaponType", e.currentTarget.value)}
            />
            <datalist id="itm-weapon-types">
              {weaponTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        )}
        {kind === "armor" && (
          <div className="form-group">
            <label className="form-label">Armor Type</label>
            <input
              type="text"
              list="itm-armor-types"
              placeholder="light, heavy, robe..."
              value={armorTypeVal}
              onChange={(e) => setField("armorType", e.currentTarget.value)}
            />
            <datalist id="itm-armor-types">
              {armorTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        )}
        {kind === "accessory" && (
          <div className="form-group">
            <label className="form-label">Accessory Type</label>
            <input
              type="text"
              list="itm-accessory-types"
              placeholder="ring, amulet, charm..."
              value={accessoryTypeVal}
              onChange={(e) => setField("accessoryType", e.currentTarget.value)}
            />
            <datalist id="itm-accessory-types">
              {accessoryTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        )}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Characteristic</label>
          <input
            type="text"
            placeholder="fast bow, heavy defense, magic focus..."
            value={draft.characteristic || ""}
            onChange={(e) => setField("characteristic", e.currentTarget.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Change Notes</label>
          <input
            type="text"
            placeholder="+S, longer range, grants skill, etc."
            value={draft.changeNotes || ""}
            onChange={(e) => setField("changeNotes", e.currentTarget.value)}
          />
        </div>
      </div>

      {kind === "weapon" && (
        <div>
          <h3>Weapon Data</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Base Damage</label>
              <input
                type="number"
                min={0}
                value={draft.weaponData?.baseDamage ?? 0}
                onChange={(e) =>
                  setWeaponData({ baseDamage: Number(e.currentTarget.value) || 0 })
                }
                style={{ width: "100%" }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Damage Type</label>
              <select
                value={draft.weaponData?.damageType || "Physical"}
                onChange={(e) => setWeaponData({ damageType: e.currentTarget.value })}
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
                value={draft.weaponData?.element || ""}
                onChange={(e) =>
                  setWeaponData({ element: e.currentTarget.value || null })
                }
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
              <label className="form-label">Range</label>
              <input
                type="number"
                min={1}
                max={8}
                value={draft.weaponData?.range ?? 1}
                onChange={(e) =>
                  setWeaponData({ range: Number(e.currentTarget.value) || 1 })
                }
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      )}

      <h3>Effects (active while equipped / on use)</h3>
      <EffectListBuilder
        effects={draft.effects || []}
        onChange={(effs) => setField("effects", effs)}
      />

      <h3>Granted Skills (item gives the user these active skills)</h3>
      <div className="hint-box">
        💡 Skills listed here become available to any character who equips this
        item. Remove the item = lose the skill.
      </div>
      <div>
        {grantedSkills.map((sid, i) => {
          const skill = ds().get<{ icon?: string; name?: string }>("skills", sid);
          const label = skill ? `${skill.icon || "⚔️"} ${skill.name || sid}` : sid;
          return (
            <span key={sid} className="chip">
              {label}{" "}
              <button
                type="button"
                className="chip-x"
                onClick={() =>
                  setField(
                    "grantedSkills",
                    grantedSkills.filter((_, idx) => idx !== i)
                  )
                }
              >
                ×
              </button>
            </span>
          );
        })}
        {availableSkills.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v) setField("grantedSkills", [...grantedSkills, v]);
            }}
          >
            <option value="">+ Add skill...</option>
            {availableSkills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon || "⚔️"} {s.name || s.id} ({s.ap || 0}AP, {s.mp || 0}MP)
              </option>
            ))}
          </select>
        )}
      </div>

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
          <b>{kind}:</b> {(kind === "weapon" && weaponTypeVal) || (kind === "armor" && armorTypeVal) || (kind === "accessory" && accessoryTypeVal) || "untyped"}
          {draft.changeNotes ? (
            <>
              {" "}
              | <b>Change:</b> {draft.changeNotes}
            </>
          ) : null}
          {" "}
          | <b>Effects:</b> {preview} | <b>ID:</b> {item.id}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Item
        </button>
      </div>
    </div>
  );
}
