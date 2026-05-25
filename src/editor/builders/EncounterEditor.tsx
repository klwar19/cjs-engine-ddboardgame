// React port of js/builders/encounter-editor.js. Grid painter + unit
// placement editor. Supports multi-cell units (1x1, 2x1, 1x2, 2x2,
// 3x3); blocks placement on impassable terrain or overlapping
// footprints.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  audioManager,
  cm,
  constants,
  ds,
  type BaseEntity
} from "./_shared/cjs";
import {
  DataList,
  confirm,
  toast
} from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

interface PlacedUnit {
  id: string;
  pos: [number, number];
  size?: string;
}

interface EncounterRecord extends BaseEntity {
  id: string;
  width?: number;
  height?: number;
  grid?: string[][];
  units?: PlacedUnit[];
  bgm?: string | string[] | null;
}

function emptyGrid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array(w).fill("empty"));
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function EncounterEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(null);
  }, [epoch]);

  const items = useMemo<EncounterRecord[]>(
    () =>
      cm()?.getVisibleItems?.<EncounterRecord>("encounters") ||
      ds().getAllAsArray<EncounterRecord>("encounters"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataTick]
  );
  const active = useMemo<EncounterRecord | null>(
    () =>
      activeId ? ds().get<EncounterRecord>("encounters", activeId) : null,
    [activeId, dataTick]
  );

  const createNew = useCallback(() => {
    const id = ds().create<EncounterRecord>("encounters", {
      name: "New Encounter",
      width: 8,
      height: 8,
      grid: emptyGrid(8, 8),
      units: []
    });
    setActiveId(id);
    toast("Encounter created", "success");
  }, []);

  const renderListItem = useCallback(
    (e: EncounterRecord) => (
      <>
        <span className="item-icon">🗺️</span>
        <div>
          <div className="item-name">{e.name || e.id}</div>
          <div className="item-sub">
            {e.width || 8}×{e.height || 8} · {(e.units || []).length} units
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
          width: 240,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={createNew}
          style={{ width: "100%" }}
        >
          + New Encounter
        </button>
        <div className="data-list" style={{ flex: 1, maxHeight: "none" }}>
          <DataList<EncounterRecord>
            entityType="encounters"
            items={items}
            activeId={activeId}
            onSelect={(e) => setActiveId(e.id)}
            renderItem={renderListItem}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active ? (
          <EncounterForm
            key={active.id}
            encounter={active}
            onDuplicate={() => {
              const nid = ds().duplicate("encounters", active.id);
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
            Select or create an encounter
          </div>
        )}
      </div>
    </div>
  );
}

// ── ENCOUNTER FORM ──────────────────────────────────────────────────
function EncounterForm({
  encounter,
  onDuplicate,
  onDeleted
}: {
  encounter: EncounterRecord;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const C = constants();

  // Working copies that mutate without triggering save until "Save".
  const [name, setName] = useState(encounter.name || "");
  const [width, setWidth] = useState(encounter.width || 8);
  const [height, setHeight] = useState(encounter.height || 8);
  const [pendingWidth, setPendingWidth] = useState(width);
  const [pendingHeight, setPendingHeight] = useState(height);
  const [grid, setGrid] = useState<string[][]>(() =>
    encounter.grid ? encounter.grid.map((row) => [...row]) : emptyGrid(width, height)
  );
  const [units, setUnits] = useState<PlacedUnit[]>(() =>
    (encounter.units || []).map((u) => {
      if (u.size) return { ...u };
      const data =
        ds().get<{ size?: string }>("characters", u.id) ||
        ds().get<{ size?: string }>("monsters", u.id);
      return { ...u, size: data?.size || "1x1" };
    })
  );
  const [bgm, setBgm] = useState<string | string[] | null>(() =>
    encounter.bgm == null
      ? null
      : Array.isArray(encounter.bgm)
      ? encounter.bgm.slice()
      : String(encounter.bgm)
  );

  useEffect(() => {
    setName(encounter.name || "");
    const w = encounter.width || 8;
    const h = encounter.height || 8;
    setWidth(w);
    setHeight(h);
    setPendingWidth(w);
    setPendingHeight(h);
    setGrid(
      encounter.grid ? encounter.grid.map((row) => [...row]) : emptyGrid(w, h)
    );
    setUnits(
      (encounter.units || []).map((u) => {
        if (u.size) return { ...u };
        const data =
          ds().get<{ size?: string }>("characters", u.id) ||
          ds().get<{ size?: string }>("monsters", u.id);
        return { ...u, size: data?.size || "1x1" };
      })
    );
    setBgm(
      encounter.bgm == null
        ? null
        : Array.isArray(encounter.bgm)
        ? encounter.bgm.slice()
        : String(encounter.bgm)
    );
  }, [encounter]);

  const [paintMode, setPaintMode] = useState<"terrain" | "unit" | "erase_unit">(
    "terrain"
  );
  const [selectedTerrain, setSelectedTerrain] = useState("empty");
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedUnitSize, setSelectedUnitSize] = useState("1x1");
  const isMouseDownRef = useRef(false);

  // Global mouseup listener.
  useEffect(() => {
    const onUp = () => {
      isMouseDownRef.current = false;
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  // Helpers
  const unitAtCell = useCallback(
    (r: number, c: number): PlacedUnit | null => {
      for (const u of units) {
        const sz = C.UNIT_SIZES?.[u.size || "1x1"] || { w: 1, h: 1 };
        if (
          r >= u.pos[0] &&
          r < u.pos[0] + sz.h &&
          c >= u.pos[1] &&
          c < u.pos[1] + sz.w
        ) {
          return u;
        }
      }
      return null;
    },
    [units, C.UNIT_SIZES]
  );

  const canPlace = useCallback(
    (size: string, r: number, c: number, ignoreIdx: number) => {
      const sz = C.UNIT_SIZES?.[size || "1x1"] || { w: 1, h: 1 };
      for (let dr = 0; dr < sz.h; dr++) {
        for (let dc = 0; dc < sz.w; dc++) {
          const tr = r + dr;
          const tc = c + dc;
          if (tr < 0 || tr >= height || tc < 0 || tc >= width) return false;
          const terrain = grid[tr]?.[tc] || "empty";
          const td = C.TERRAIN_TYPES[terrain];
          if (td && !td.passable) return false;
          const existing = unitAtCell(tr, tc);
          if (existing && units.indexOf(existing) !== ignoreIdx) return false;
        }
      }
      return true;
    },
    [grid, height, width, C.UNIT_SIZES, C.TERRAIN_TYPES, units, unitAtCell]
  );

  const cellAction = useCallback(
    (r: number, c: number) => {
      if (paintMode === "terrain") {
        if (unitAtCell(r, c)) return;
        setGrid((prev) => {
          if (!prev[r]) return prev;
          const next = prev.map((row, ri) =>
            ri === r ? row.map((cell, ci) => (ci === c ? selectedTerrain : cell)) : row
          );
          return next;
        });
      } else if (paintMode === "unit" && selectedUnit) {
        if (!canPlace(selectedUnitSize, r, c, -1)) {
          toast("Cannot place — blocked, occupied, or out of bounds", "error", 1500);
          return;
        }
        setUnits((prev) => [
          ...prev,
          { id: selectedUnit, pos: [r, c], size: selectedUnitSize }
        ]);
      } else if (paintMode === "erase_unit") {
        const u = unitAtCell(r, c);
        if (u) {
          setUnits((prev) => prev.filter((x) => x !== u));
        }
      }
    },
    [paintMode, selectedTerrain, selectedUnit, selectedUnitSize, unitAtCell, canPlace]
  );

  // Resize
  const resizeGrid = useCallback(
    (nw: number, nh: number) => {
      const clampedW = Math.min(16, Math.max(4, Number(nw) || 8));
      const clampedH = Math.min(16, Math.max(4, Number(nh) || 8));
      setGrid((prev) => {
        const next: string[][] = [];
        for (let r = 0; r < clampedH; r++) {
          next[r] = [];
          for (let c = 0; c < clampedW; c++) {
            next[r][c] = prev[r]?.[c] || "empty";
          }
        }
        return next;
      });
      setWidth(clampedW);
      setHeight(clampedH);
      // Remove units that now overflow
      setUnits((prev) =>
        prev.filter((u) => {
          const sz = C.UNIT_SIZES?.[u.size || "1x1"] || { w: 1, h: 1 };
          return u.pos[0] + sz.h <= clampedH && u.pos[1] + sz.w <= clampedW;
        })
      );
    },
    [C.UNIT_SIZES]
  );

  // Save
  const save = useCallback(() => {
    const payload: EncounterRecord = {
      id: encounter.id,
      name,
      width,
      height,
      grid,
      units
    };
    if (bgm != null && !(Array.isArray(bgm) && bgm.length === 0)) {
      payload.bgm = bgm;
    }
    ds().replace("encounters", encounter.id, payload);
    toast("Encounter saved", "success");
  }, [encounter.id, name, width, height, grid, units, bgm]);

  const onDelete = useCallback(() => {
    confirm(`Delete "${encounter.name}"?`, () => {
      ds().remove("encounters", encounter.id);
      onDeleted();
      toast("Deleted", "info");
    });
  }, [encounter, onDeleted]);

  // Coverage and anchor maps for rendering
  const { anchorAt, coverAt } = useMemo(() => {
    const a: Record<string, PlacedUnit> = {};
    const co: Record<string, PlacedUnit> = {};
    for (const u of units) {
      const sz = C.UNIT_SIZES?.[u.size || "1x1"] || { w: 1, h: 1 };
      a[`${u.pos[0]},${u.pos[1]}`] = u;
      for (let dr = 0; dr < sz.h; dr++) {
        for (let dc = 0; dc < sz.w; dc++) {
          co[`${u.pos[0] + dr},${u.pos[1] + dc}`] = u;
        }
      }
    }
    return { anchorAt: a, coverAt: co };
  }, [units, C.UNIT_SIZES]);

  // Available units for the picker (characters + monsters).
  const availableChars = useMemo(
    () =>
      ds()
        .getAllAsArray<BaseEntity & { size?: string; movement?: number }>(
          "characters"
        )
        .sort((x, y) => String(x.name || x.id).localeCompare(String(y.name || y.id))),
    []
  );
  const availableMons = useMemo(
    () =>
      ds()
        .getAllAsArray<BaseEntity & { size?: string; movement?: number }>(
          "monsters"
        )
        .sort((x, y) => String(x.name || x.id).localeCompare(String(y.name || y.id))),
    []
  );

  const collision = C.COLLISION;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🗺️ {name || "Unnamed"}</span>
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
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 80px" }}>
          <label className="form-label">Width</label>
          <input
            type="number"
            min={4}
            max={16}
            value={pendingWidth}
            onChange={(e) =>
              setPendingWidth(Number(e.currentTarget.value) || width)
            }
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 80px" }}>
          <label className="form-label">Height</label>
          <input
            type="number"
            min={4}
            max={16}
            value={pendingHeight}
            onChange={(e) =>
              setPendingHeight(Number(e.currentTarget.value) || height)
            }
          />
        </div>
        <div
          className="form-group"
          style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end" }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => resizeGrid(pendingWidth, pendingHeight)}
          >
            Resize
          </button>
        </div>
      </div>

      <h3>
        Audio{" "}
        <span className="dim" style={{ fontSize: "0.78em" }}>
          — battle BGM (single track or random pool)
        </span>
      </h3>
      <BgmPicker bgm={bgm} onChange={setBgm} />

      <h3>
        Terrain{" "}
        <span className="dim" style={{ fontSize: "0.78em" }}>
          — cost shown as ×N, 👁 = blocks LoS
        </span>
      </h3>
      <div
        className="filter-bar"
        style={{ maxHeight: 90, overflowY: "auto" }}
      >
        {Object.entries(C.TERRAIN_TYPES).map(([key, data]) => {
          const cost =
            (data.moveCost || 1) >= 999
              ? "✘"
              : (data.moveCost || 1) > 1
              ? `×${data.moveCost}`
              : "";
          const los = data.blocksLoS ? "👁" : "";
          return (
            <button
              key={key}
              type="button"
              className={`filter-btn${selectedTerrain === key ? " active" : ""}`}
              style={{ borderLeft: `3px solid ${data.color || "transparent"}` }}
              title={`Move cost: ${data.moveCost ?? 1}${data.blocksLoS ? ", blocks LoS" : ""}`}
              onClick={() => {
                setSelectedTerrain(key);
                setPaintMode("terrain");
              }}
            >
              {`${data.icon || ""} ${key} ${cost}${los}`.trim()}
            </button>
          );
        })}
      </div>

      <h3>Tools</h3>
      <div className="flex gap-sm items-center mb-sm flex-wrap">
        <button
          type="button"
          className={`btn btn-sm ${paintMode === "terrain" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setPaintMode("terrain")}
        >
          🎨 Paint Terrain
        </button>
        <button
          type="button"
          className={`btn btn-sm ${paintMode === "unit" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setPaintMode("unit")}
        >
          👤 Place Unit
        </button>
        <button
          type="button"
          className={`btn btn-sm ${paintMode === "erase_unit" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setPaintMode("erase_unit")}
        >
          🗑️ Erase Unit
        </button>
      </div>
      {paintMode === "unit" && (
        <div style={{ marginBottom: 8 }}>
          <select
            value={selectedUnit || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              const option = e.currentTarget.selectedOptions[0];
              setSelectedUnit(value || null);
              setSelectedUnitSize(option?.dataset.size || "1x1");
            }}
          >
            <option value="">— Select unit —</option>
            <optgroup label="Characters">
              {availableChars.map((c) => (
                <option key={c.id} value={c.id} data-size={c.size || "1x1"}>
                  {(c.icon || "") + " "}
                  {c.name} [
                  {C.UNIT_SIZES?.[c.size || "1x1"]?.label || c.size || "1x1"},
                  mv:{c.movement || 3}]
                </option>
              ))}
            </optgroup>
            <optgroup label="Monsters">
              {availableMons.map((m) => (
                <option key={m.id} value={m.id} data-size={m.size || "1x1"}>
                  {(m.icon || "") + " "}
                  {m.name} [
                  {C.UNIT_SIZES?.[m.size || "1x1"]?.label || m.size || "1x1"},
                  mv:{m.movement || 3}]
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      <h3>
        Grid{" "}
        <span className="dim" style={{ fontSize: "0.78em" }}>
          {width}×{height}
        </span>
      </h3>
      <div style={{ overflow: "auto", paddingBottom: 8 }}>
        <div
          className="grid-container"
          style={{ userSelect: "none" }}
          onMouseLeave={() => (isMouseDownRef.current = false)}
        >
          {Array.from({ length: height }, (_, r) => (
            <div key={r} className="grid-row">
              {Array.from({ length: width }, (_, c) => {
                const terrain = grid[r]?.[c] || "empty";
                const td = C.TERRAIN_TYPES[terrain] || C.TERRAIN_TYPES.empty;
                const key = `${r},${c}`;
                const anchor = anchorAt[key];
                const cover = coverAt[key];
                const data = anchor
                  ? ds().get<{
                      icon?: string;
                      name?: string;
                      team?: string;
                      movement?: number;
                    }>("characters", anchor.id) ||
                    ds().get<{
                      icon?: string;
                      name?: string;
                      team?: string;
                      movement?: number;
                    }>("monsters", anchor.id)
                  : null;
                const sz = anchor
                  ? C.UNIT_SIZES?.[anchor.size || "1x1"] || { w: 1, h: 1 }
                  : { w: 1, h: 1 };
                const isEnemy = data?.team === "enemy";

                return (
                  <div
                    key={c}
                    className="grid-cell"
                    style={{
                      background: td?.color || "#222",
                      position: "relative",
                      opacity: !anchor && cover ? 0.6 : 1,
                      overflow: anchor ? "visible" : undefined
                    }}
                    title={
                      anchor
                        ? `${data?.name || anchor.id} [${anchor.size || "1x1"}] mv:${data?.movement || 3} pos:[${r},${c}]`
                        : undefined
                    }
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      isMouseDownRef.current = true;
                      cellAction(r, c);
                    }}
                    onMouseEnter={() => {
                      if (
                        isMouseDownRef.current &&
                        paintMode === "terrain"
                      ) {
                        cellAction(r, c);
                      }
                    }}
                  >
                    {(td?.moveCost || 1) > 1 && (td?.moveCost || 1) < 999 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 1,
                          right: 2,
                          fontSize: "0.55em",
                          color: "var(--gold)",
                          opacity: 0.8
                        }}
                      >
                        ×{td?.moveCost}
                      </span>
                    )}
                    {td?.blocksLoS ? (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 1,
                          right: 2,
                          fontSize: "0.5em",
                          opacity: 0.6
                        }}
                      >
                        👁
                      </span>
                    ) : null}
                    {anchor ? (
                      <>
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            zIndex: 2,
                            width: sz.w * 56,
                            height: sz.h * 56,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: `${Math.max(1.2, sz.w * 0.9)}em`,
                            pointerEvents: "none"
                          }}
                        >
                          {data?.icon || "⬤"}
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            top: -1,
                            left: -1,
                            zIndex: 3,
                            width: sz.w * 56 + 1,
                            height: sz.h * 56 + 1,
                            border: `2px solid ${isEnemy ? "var(--red)" : "var(--gold)"}`,
                            borderRadius: 3,
                            pointerEvents: "none"
                          }}
                        />
                        {(sz.w >= 2 || sz.h >= 2) && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: -14,
                              left: 0,
                              zIndex: 4,
                              width: sz.w * 56,
                              textAlign: "center",
                              fontSize: "0.6em",
                              color: isEnemy ? "var(--red)" : "var(--gold)",
                              pointerEvents: "none",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {data?.name || anchor.id}
                          </div>
                        )}
                      </>
                    ) : !cover && td?.icon ? (
                      td.icon
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <h3>Placed Units ({units.length})</h3>
      <div style={{ fontSize: "0.85rem" }}>
        {units.length === 0 ? (
          <div className="dim">No units placed</div>
        ) : (
          units.map((u, i) => {
            const d =
              ds().get<{
                icon?: string;
                name?: string;
                team?: string;
                movement?: number;
              }>("characters", u.id) ||
              ds().get<{
                icon?: string;
                name?: string;
                team?: string;
                movement?: number;
              }>("monsters", u.id);
            const team = d?.team || "?";
            const clr =
              team === "enemy"
                ? "var(--red)"
                : team === "player"
                ? "var(--green)"
                : "var(--text-dim)";
            return (
              <div key={i} className="effect-chip">
                <span className="chip-icon">{d?.icon || "⬤"}</span>
                <span className="chip-name">{d?.name || u.id}</span>
                <span className="chip-desc">
                  <span style={{ color: clr }}>{team}</span> · [{u.pos[0]},
                  {u.pos[1]}] · {u.size || "1x1"} · mv:{d?.movement || 3}
                </span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setUnits((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ❌
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="card" style={{ background: "var(--surface2)", marginTop: 8 }}>
        <div className="dim" style={{ fontSize: "0.78rem" }}>
          <b>Movement:</b> Flat per-unit value. Cannot move through units or
          impassable terrain. Terrain costs: ice/water/high ground ×2,
          mud/rubble ×3.
          <br />
          <b>LoS:</b> Obstacles, walls, pillars, trees block ranged line of
          sight. 2×2+ units also block LoS.
          <br />
          <b>Knockback:</b> Hitting wall = {collision?.wallDamageFlat ?? 5}{" "}
          collision dmg. Hitting unit ={" "}
          {collision?.unitCollisionDamageFlat ?? 3} dmg to both. Larger pushes
          smaller. END/{collision?.knockbackResistPerEnd ?? 5} reduces
          knockback by 1.
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-success" type="button" onClick={save}>
          💾 Save Encounter
        </button>
      </div>
    </div>
  );
}

// ── BGM PICKER ───────────────────────────────────────────────────────
function BgmPicker({
  bgm,
  onChange
}: {
  bgm: string | string[] | null;
  onChange: (next: string | string[] | null) => void;
}) {
  const mode: "none" | "single" | "pool" = useMemo(() => {
    if (bgm == null) return "none";
    return Array.isArray(bgm) ? "pool" : "single";
  }, [bgm]);

  const [bgmIds, setBgmIds] = useState<string[]>([]);
  useEffect(() => {
    const AM = audioManager();
    const finish = () => {
      try {
        const manifest = AM?.getManifest?.() || { bgm: {} };
        setBgmIds(Object.keys((manifest as { bgm?: Record<string, unknown> }).bgm || {}));
      } catch {
        setBgmIds([]);
      }
    };
    if (AM?.loadManifest) {
      AM.loadManifest().then(finish).catch(finish);
    } else {
      finish();
    }
  }, []);

  const handleMode = (newMode: "none" | "single" | "pool") => {
    if (newMode === "none") onChange(null);
    else if (newMode === "single") {
      onChange(Array.isArray(bgm) ? bgm[0] || null : (bgm as string) || null);
    } else {
      onChange(Array.isArray(bgm) ? bgm : bgm ? [bgm as string] : []);
    }
  };

  return (
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">Mode</label>
        <select
          value={mode}
          onChange={(e) =>
            handleMode(e.currentTarget.value as "none" | "single" | "pool")
          }
        >
          <option value="none">None (use default)</option>
          <option value="single">Single track</option>
          <option value="pool">Random pool</option>
        </select>
      </div>
      <div className="form-group" style={{ flex: 2 }}>
        <label className="form-label">Track(s)</label>
        {mode === "none" && (
          <div className="dim" style={{ fontSize: "0.82rem" }}>
            Falls back to the global default pool
            (CombatSettings.defaultBgmPool).
          </div>
        )}
        {mode === "single" && (
          <select
            value={typeof bgm === "string" ? bgm : ""}
            onChange={(e) => onChange(e.currentTarget.value || null)}
            style={{ width: "100%" }}
          >
            <option value="">-- pick --</option>
            {bgmIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
        {mode === "pool" && (
          <div
            style={{
              maxHeight: 120,
              overflowY: "auto",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4,
              padding: 6
            }}
          >
            {bgmIds.length === 0 ? (
              <div className="dim">No BGM tracks in audio-manifest.json yet.</div>
            ) : (
              bgmIds.map((id) => {
                const set = new Set(Array.isArray(bgm) ? bgm : []);
                const checked = set.has(id);
                return (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      fontSize: "0.82rem",
                      padding: "2px 0"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(set);
                        if (e.currentTarget.checked) next.add(id);
                        else next.delete(id);
                        onChange(Array.from(next));
                      }}
                    />
                    <span>{id}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
