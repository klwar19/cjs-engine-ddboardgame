// React port of js/ui/data-browser.js. Read-only spreadsheet view of
// each DataStore collection.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cm,
  ds,
  effectRegistry,
  type BaseEntity
} from "./_shared/cjs";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

const TABS = [
  "effects",
  "skills",
  "jobs",
  "personas",
  "items",
  "food",
  "materials",
  "passives",
  "characters",
  "monsters",
  "encounters",
  "crafting",
  "crops",
  "shops",
  "zones",
  "stories",
  "worlds",
  "campaigns",
  "scenarios",
  "scenarioMaps",
  "campaignEvents",
  "campaignQuests",
  "campaignHubs",
  "sideContentPacks",
  "questChains",
  "battleSets",
  "mapSeeds",
  "oracleTables",
  "storyDirectorPacks"
] as const;

type Tab = (typeof TABS)[number];

const GENERIC_COLS = ["ID", "Name", "Description", "Scope", "World", "Origin"];

function match(obj: unknown, q: string): boolean {
  if (!q) return true;
  return JSON.stringify(obj).toLowerCase().includes(q);
}

function safeArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function renderTable(cols: string[], rows: Array<Array<unknown>>) {
  return (
    <table className="db-table">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={cols.length} style={{ textAlign: "center", color: "var(--text-mute)" }}>
              No data
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell === null || cell === undefined ? "—" : String(cell)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function DataBrowser() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeTab, setActiveTab] = useState<Tab>("effects");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [epoch]);

  const fetch = useCallback(
    (type: string): BaseEntity[] => {
      const fromCm = cm()?.getVisibleItems?.<BaseEntity>(type, search);
      if (fromCm) return fromCm;
      return ds().getAllAsArray<BaseEntity>(type);
    },
    [search]
  );

  const { cols, rows, count, label } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _tick = dataTick;
    const q = search.toLowerCase();
    switch (activeTab) {
      case "effects": {
        let items = effectRegistry().getAllEffects();
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: ["ID", "Icon", "Name", "Trigger", "Action", "Target", "Value", "Source", "Element", "Duration", "Tags"],
          rows: items.map((e) => [
            e.id,
            e.icon || "",
            e.name || "",
            e.trigger || "",
            e.action || "",
            e.target || "",
            e.value ?? "",
            e.source || "",
            e.element || "—",
            e.duration || "perm",
            (e.tags || []).join(", ")
          ]),
          count: items.length,
          label: "effects"
        };
      }
      case "skills": {
        let items = fetch("skills") as Array<
          BaseEntity & {
            power?: number;
            ap?: number;
            mp?: number;
            cooldown?: number;
            damageType?: string;
            element?: string;
            scalingStat?: string;
            range?: number;
            aoe?: string;
            qte?: string;
            effects?: unknown[];
            apGain?: number;
            levelScaling?: { maxLevel?: number };
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: [
            "ID",
            "Icon",
            "Name",
            "Power",
            "AP",
            "MP",
            "CD",
            "Type",
            "Element",
            "Scaling",
            "Range",
            "AoE",
            "QTE",
            "Effects#",
            "AP/Use",
            "MaxLv"
          ],
          rows: items.map((s) => [
            s.id,
            s.icon || "",
            s.name || "",
            s.power || 0,
            s.ap || 0,
            s.mp || 0,
            s.cooldown || 0,
            s.damageType || "",
            s.element || "—",
            s.scalingStat || "",
            s.range || 1,
            s.aoe || "none",
            s.qte || "none",
            safeArrayCount(s.effects),
            s.apGain != null ? s.apGain : 1,
            s.levelScaling?.maxLevel || 10
          ]),
          count: items.length,
          label: "skills"
        };
      }
      case "jobs": {
        let items = fetch("jobs") as Array<
          BaseEntity & {
            maxLevel?: number;
            levels?: unknown[];
            weaponTypes?: string[];
            armorTypes?: string[];
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: ["ID", "Icon", "Name", "MaxLv", "Levels#", "Weapons", "Armors", "Description"],
          rows: items.map((j) => [
            j.id,
            j.icon || "🛡️",
            j.name || "",
            j.maxLevel || 10,
            safeArrayCount(j.levels),
            (j.weaponTypes || []).join("/") || "—",
            (j.armorTypes || []).join("/") || "—",
            (j.description || "").substring(0, 60)
          ]),
          count: items.length,
          label: "jobs"
        };
      }
      case "personas": {
        let items = fetch("personas") as Array<
          BaseEntity & {
            characterId?: string;
            world?: string;
            defaultJob?: string;
            unlock?: {
              default?: boolean;
              requiresChapter?: number;
              requiresPhaseNumber?: number;
              requiresFlag?: string;
            };
            statOverrides?: Record<string, number>;
            crossWorldPenalty?: {
              damageDealtMultiplier?: number;
              damageTakenMultiplier?: number;
            };
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: [
            "ID",
            "Icon",
            "Name",
            "Character",
            "World",
            "Default Job",
            "Unlock",
            "Stat Overrides",
            "Penalty (dealt/taken)",
            "Description"
          ],
          rows: items.map((p) => {
            const u = p.unlock || {};
            const unlockBits: string[] = [];
            if (u.default) unlockBits.push("default");
            if (u.requiresChapter) unlockBits.push(`ch≥${u.requiresChapter}`);
            if (u.requiresPhaseNumber) unlockBits.push(`ph≥${u.requiresPhaseNumber}`);
            if (u.requiresFlag) unlockBits.push(`flag:${u.requiresFlag}`);
            const overrides = Object.entries(p.statOverrides || {})
              .map(([s, v]) => `${s}${v >= 0 ? "+" : ""}${v}`)
              .join(" ");
            const pen = p.crossWorldPenalty || {};
            return [
              p.id,
              p.icon || "🎭",
              p.name || "",
              p.characterId || "—",
              p.world || "—",
              p.defaultJob || "—",
              unlockBits.join(", ") || "—",
              overrides || "—",
              `×${Number(pen.damageDealtMultiplier ?? 1)} / ×${Number(pen.damageTakenMultiplier ?? 1)}`,
              (p.description || "").substring(0, 60)
            ];
          }),
          count: items.length,
          label: "personas"
        };
      }
      case "items": {
        let items = fetch("items") as Array<
          BaseEntity & {
            slot?: string;
            rarity?: string;
            effects?: unknown[];
            grantedSkills?: string[];
            weaponData?: { baseDamage?: number; element?: string };
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: [
            "ID",
            "Icon",
            "Name",
            "Slot",
            "Rarity",
            "Effects#",
            "Granted Skills",
            "Base Dmg",
            "Element"
          ],
          rows: items.map((i) => [
            i.id,
            i.icon || "",
            i.name || "",
            i.slot || "",
            i.rarity || "",
            safeArrayCount(i.effects),
            (i.grantedSkills || []).join(", ") || "—",
            i.weaponData?.baseDamage || "—",
            i.weaponData?.element || "—"
          ]),
          count: items.length,
          label: "items"
        };
      }
      case "passives": {
        let items = fetch("passives") as Array<
          BaseEntity & { effects?: unknown[] }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: ["ID", "Icon", "Name", "Effects#", "Tags", "Description"],
          rows: items.map((p) => [
            p.id,
            p.icon || "",
            p.name || "",
            safeArrayCount(p.effects),
            (p.tags || []).join(", "),
            (p.description || "").substring(0, 60)
          ]),
          count: items.length,
          label: "passives"
        };
      }
      case "characters": {
        let items = fetch("characters") as Array<
          BaseEntity & {
            team?: string;
            rank?: string;
            type?: string;
            stats?: Record<string, number>;
            skills?: unknown[];
            equipment?: unknown[];
            movement?: number;
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: [
            "ID",
            "Icon",
            "Name",
            "Team",
            "Rank",
            "Type",
            "S",
            "P",
            "E",
            "C",
            "I",
            "A",
            "L",
            "Skills#",
            "Items#",
            "Move"
          ],
          rows: items.map((c) => {
            const s = c.stats || {};
            return [
              c.id,
              c.icon || "",
              c.name || "",
              c.team || "",
              c.rank || "",
              c.type || "",
              s.S || 0,
              s.P || 0,
              s.E || 0,
              s.C || 0,
              s.I || 0,
              s.A || 0,
              s.L || 0,
              safeArrayCount(c.skills),
              safeArrayCount(c.equipment),
              c.movement || 3
            ];
          }),
          count: items.length,
          label: "characters"
        };
      }
      case "monsters": {
        let items = fetch("monsters") as Array<
          BaseEntity & {
            rank?: string;
            levelBand?: { min?: number; max?: number };
            type?: string;
            stats?: Record<string, number>;
            skills?: unknown[];
            levelTiers?: unknown[];
            aiRules?: unknown[];
            loot?: unknown[];
            movement?: number;
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: [
            "ID",
            "Icon",
            "Name",
            "Rank",
            "Lv Band",
            "Type",
            "S",
            "P",
            "E",
            "C",
            "I",
            "A",
            "L",
            "Skills#",
            "Tiers#",
            "AI Rules#",
            "Loot#",
            "Move"
          ],
          rows: items.map((m) => {
            const s = m.stats || {};
            const band = m.levelBand
              ? `${m.levelBand.min ?? 1}–${m.levelBand.max ?? "?"}`
              : "";
            return [
              m.id,
              m.icon || "",
              m.name || "",
              m.rank || "",
              band,
              m.type || "",
              s.S || 0,
              s.P || 0,
              s.E || 0,
              s.C || 0,
              s.I || 0,
              s.A || 0,
              s.L || 0,
              safeArrayCount(m.skills),
              safeArrayCount(m.levelTiers),
              safeArrayCount(m.aiRules),
              safeArrayCount(m.loot),
              m.movement || 3
            ];
          }),
          count: items.length,
          label: "monsters"
        };
      }
      case "encounters": {
        let items = fetch("encounters") as Array<
          BaseEntity & {
            width?: number;
            height?: number;
            units?: Array<{ id: string }>;
          }
        >;
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: ["ID", "Name", "Grid", "Units#", "Player Units", "Enemy Units"],
          rows: items.map((e) => {
            const units = e.units || [];
            const playerUnits = units.filter((u) => {
              const c = ds().get<{ team?: string }>("characters", u.id);
              return c && c.team === "player";
            });
            const enemyUnits = units.filter((u) => {
              const m = ds().get("monsters", u.id);
              return Boolean(m) || ds().get<{ team?: string }>("characters", u.id)?.team === "enemy";
            });
            return [
              e.id,
              e.name || "",
              `${e.width || 8}×${e.height || 8}`,
              units.length,
              playerUnits.map((u) => u.id).join(", "),
              enemyUnits.map((u) => u.id).join(", ")
            ];
          }),
          count: items.length,
          label: "encounters"
        };
      }
      case "worlds": {
        let items = ds().getAllAsArray<
          BaseEntity & {
            displayName?: string;
            ceiling?: string;
            requiredRank?: string;
            recommendedRank?: string;
            order?: number;
            tone?: string;
            color?: string;
            status?: string;
          }
        >("worlds");
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: [
            "ID",
            "Display Name",
            "Ceiling",
            "Required",
            "Recommended",
            "Order",
            "Tone",
            "Color",
            "Status"
          ],
          rows: items.map((world) => [
            world.id || "",
            world.displayName || "",
            world.ceiling || "",
            world.requiredRank || "",
            world.recommendedRank || "",
            world.order || "",
            world.tone || "",
            world.color || "",
            world.status || ""
          ]),
          count: items.length,
          label: "worlds"
        };
      }
      default: {
        // Generic
        let items = fetch(activeTab);
        if (q) items = items.filter((e) => match(e, q));
        return {
          cols: GENERIC_COLS,
          rows: items.map((item) => [
            item.id || "",
            item.name || "",
            (item.description || "").substring(0, 80),
            item._scope || "",
            item._world || "",
            item._origin || ""
          ]),
          count: items.length,
          label: activeTab
        };
      }
    }
  }, [activeTab, search, dataTick, fetch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      <div className="flex gap-sm items-center" style={{ flexShrink: 0 }}>
        <h3 style={{ margin: 0, color: "var(--accent)" }}>📊 Data Browser</h3>
        <div className="btn-group">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn btn-sm ${t === activeTab ? "btn-primary" : ""}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Filter..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ marginLeft: "auto", width: 200 }}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>{renderTable(cols, rows)}</div>
      <div
        style={{
          flexShrink: 0,
          fontSize: "0.78rem",
          color: "var(--text-dim)"
        }}
      >
        {count} {label}
      </div>
    </div>
  );
}
