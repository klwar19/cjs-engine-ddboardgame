// React port of js/builders/campaign-editor.js. Generic JSON editor
// for campaign / scenario / hub / side-pack data — each collection
// exposes a textarea bound to the active record, plus New / Duplicate /
// Delete / Save controls and a scope chip in the list.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cm,
  ds,
  type BaseEntity
} from "./_shared/cjs";
import { confirm, toast } from "./_shared/widgets";
import { useDataStoreTick, useEditorTick } from "./_shared/hooks";

const TYPES: readonly { id: string; label: string }[] = [
  { id: "campaigns", label: "Campaigns" },
  { id: "scenarios", label: "Scenarios" },
  { id: "scenarioMaps", label: "Scenario Maps" },
  { id: "travelMaps", label: "Travel Maps" },
  { id: "campaignEvents", label: "Event Tables" },
  { id: "campaignQuests", label: "Quest Templates" },
  { id: "campaignHubs", label: "Living Hubs" },
  { id: "sideContentPacks", label: "Side Packs" },
  { id: "questChains", label: "Quest Chains" },
  { id: "battleSets", label: "Battle Sets" },
  { id: "mapSeeds", label: "Map Seeds" },
  { id: "oracleTables", label: "Oracles" },
  { id: "storyDirectorPacks", label: "Story Director" },
  { id: "worldActivityPacks", label: "World Activities" },
  { id: "campaignProfiles", label: "Carryover" },
  { id: "pocketHavenRules", label: "Pocket Haven" }
];

interface CampaignRecord extends BaseEntity {
  id: string;
  title?: string;
}

function templateFor(type: string): Record<string, unknown> {
  const filtersWorld = cm()?.getFilters?.()?.world;
  const world = filtersWorld && filtersWorld !== "all" ? filtersWorld : "haven";
  switch (type) {
    case "campaigns":
      return {
        id: "",
        name: "New Campaign",
        version: 1,
        world,
        startChapter: 1,
        startPhase: "town_phase",
        scenarios: [],
        maps: [],
        eventTables: [],
        questTemplates: [],
        hubs: [],
        sideContentPacks: [],
        startingState: {
          currencies: {},
          items: {},
          materials: {},
          food: {},
          questItems: {},
          party: []
        }
      };
    case "scenarios":
      return {
        id: "",
        name: "New Scenario",
        world,
        mapId: "",
        startNode: "",
        randomBattleTable: [],
        setBattles: [],
        notes: ""
      };
    case "scenarioMaps":
      return { id: "", name: "New Map", world, nodes: [], links: [], notes: "" };
    case "travelMaps":
      return {
        id: "",
        name: "New Travel Map",
        world,
        defaultLocationId: "",
        canvas: { width: 720, height: 420 },
        nodes: [],
        links: [],
        notes: ""
      };
    case "campaignEvents":
      return { id: "", name: "New Event Table", world, events: [] };
    case "campaignQuests":
      return { id: "", name: "New Quest Templates", world, templates: [] };
    case "campaignHubs":
      return {
        id: "",
        name: "New Hub",
        world,
        zone: "",
        defaultMood: "neutral",
        locations: [],
        npcs: [],
        hubStats: {},
        startingProblems: [],
        eventTables: {}
      };
    case "sideContentPacks":
      return {
        id: "",
        name: "New Side Content Pack",
        version: 1,
        world,
        zone: "",
        hubId: "",
        canonPolicy: {
          gmControlsMainStory: true,
          defaultCanonRisk: "green",
          redRequiresReview: true
        },
        contentRefs: {},
        hubEvents: [],
        tags: []
      };
    case "questChains":
      return {
        id: "",
        name: "New Quest Chain Set",
        world,
        zone: "",
        hubId: "",
        chains: []
      };
    case "battleSets":
      return {
        id: "",
        name: "New Battle Set",
        world,
        zone: "",
        hubId: "",
        cards: []
      };
    case "mapSeeds":
      return {
        id: "",
        name: "New Map Seeds",
        world,
        zone: "",
        hubId: "",
        seeds: []
      };
    case "oracleTables":
      return {
        id: "",
        name: "New Oracle Table",
        world,
        zone: "",
        hubId: "",
        defaultCanonRisk: "green",
        tables: {},
        prompts: []
      };
    case "storyDirectorPacks":
      return {
        id: "",
        name: "New Story Director Pack",
        version: 1,
        world,
        zone: "",
        hubId: "",
        stages: [],
        sceneBeats: [],
        periInterruptions: [],
        memoryShards: [],
        pressureTicks: [],
        sideQuestFlow: []
      };
    case "worldActivityPacks":
      return {
        id: "",
        name: "New World Activity Pack",
        version: 1,
        world,
        zone: "",
        activities: [],
        journalEntries: []
      };
    case "campaignProfiles":
      return { id: "", name: "New Carryover Profile", rules: [] };
    case "pocketHavenRules":
      return { id: "", name: "New Pocket Haven Rules", farm: {}, stations: [] };
    default:
      return { id: "", name: "New Record" };
  }
}

function stripMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMeta);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_"))
      .map(([k, v]) => [k, stripMeta(v)])
  );
}

// ── MAIN PANEL ───────────────────────────────────────────────────────
export function CampaignEditor() {
  const dataTick = useDataStoreTick();
  const epoch = useEditorTick();
  const [activeType, setActiveType] = useState<string>("campaigns");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draftJson, setDraftJson] = useState("");

  useEffect(() => {
    setActiveId(null);
    setQuery("");
  }, [epoch]);

  // Reset when active type changes (mirrors the vanilla render flow).
  useEffect(() => {
    setActiveId(null);
    setQuery("");
  }, [activeType]);

  const items = useMemo<CampaignRecord[]>(
    () =>
      cm()?.getVisibleItems?.<CampaignRecord>(activeType, query) ||
      ds().getAllAsArray<CampaignRecord>(activeType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeType, query, dataTick]
  );

  const activeRecord = useMemo(
    () =>
      activeId ? ds().get<CampaignRecord>(activeType, activeId) : null,
    [activeId, activeType, dataTick]
  );

  // Sync the JSON editor when the selected record changes.
  useEffect(() => {
    setDraftJson(
      activeRecord ? JSON.stringify(stripMeta(activeRecord), null, 2) : ""
    );
  }, [activeRecord]);

  const onNew = useCallback(() => {
    const defaults = templateFor(activeType);
    const CM = cm();
    if (CM?.createEntry) {
      CM.createEntry(activeType, defaults, (id) => {
        setActiveId(id);
        toast(`Created ${id}`, "success");
      });
    } else {
      const id = ds().create(activeType, defaults);
      setActiveId(id);
      toast(`Created ${id}`, "success");
    }
  }, [activeType]);

  const onDuplicate = useCallback(() => {
    if (!activeId) return;
    const id = ds().duplicate(activeType, activeId);
    if (id) {
      setActiveId(id);
      toast(`Duplicated ${id}`, "success");
    }
  }, [activeId, activeType]);

  const onDelete = useCallback(() => {
    if (!activeId) return;
    confirm(`Delete ${activeId}?`, () => {
      ds().remove(activeType, activeId);
      setActiveId(null);
    });
  }, [activeId, activeType]);

  const onSave = useCallback(() => {
    if (!activeId) return;
    try {
      const parsed = JSON.parse(draftJson || "{}") as Record<string, unknown>;
      if (!parsed.id) throw new Error("Record must include id.");
      if (parsed.id !== activeId)
        throw new Error(
          "ID changes are not allowed here. Duplicate first if you need a new ID."
        );
      const CM = cm();
      const prepared = CM?.prepareRecord
        ? CM.prepareRecord(activeType, activeId, parsed)
        : parsed;
      ds().replace(activeType, activeId, prepared);
      toast(`Saved ${activeId}`, "success");
    } catch (error) {
      toast(
        (error as Error)?.message || "Invalid JSON",
        "error",
        5000
      );
    }
  }, [activeId, activeType, draftJson]);

  const activeLabel =
    TYPES.find((t) => t.id === activeType)?.label || activeType;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px minmax(0,1fr)",
        gap: 12,
        height: "100%"
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          paddingRight: 12,
          overflow: "auto"
        }}
      >
        <div className="hint-box hint-info">
          Campaign data is authored as plain JSON. Side Forge cards, hubs, quest
          chains, battle sets, map seeds, oracle tables, and Story Director
          packs live in separate files for easy future edits.
        </div>
        <div
          className="btn-group"
          style={{ flexWrap: "wrap", marginBottom: 10 }}
        >
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn btn-sm ${t.id === activeType ? "btn-primary" : ""}`}
              onClick={() => setActiveType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder={`Filter ${activeType}...`}
          value={query}
          style={{ width: "100%", marginBottom: 10 }}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <div className="btn-group" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onNew}
          >
            New
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!activeId}
            onClick={onDuplicate}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={!activeId}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
        <div>
          {items.length === 0 ? (
            <div className="data-list-empty">No records.</div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`data-list-item${item.id === activeId ? " active" : ""}`}
                onClick={() => setActiveId(item.id)}
                style={{ alignItems: "flex-start" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="item-name">
                    {item.name || item.title || item.id}
                  </div>
                  <div className="item-sub">{item.id || ""}</div>
                </div>
                <ScopeChip item={item} />
              </div>
            ))
          )}
        </div>
      </aside>

      <main
        style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 10
          }}
        >
          <h3 style={{ margin: 0, color: "var(--accent)" }}>{activeLabel}</h3>
          <span
            style={{ color: "var(--text-mute)", fontSize: "0.82rem" }}
          >
            {activeId || "No record selected"}
          </span>
          <div className="btn-group" style={{ marginLeft: "auto" }}>
            <a
              className="btn btn-sm btn-ghost"
              href="campaign.html"
              style={{ textDecoration: "none" }}
            >
              Open Campaign
            </a>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!activeId}
              onClick={onSave}
            >
              Save JSON
            </button>
          </div>
        </div>
        <textarea
          spellCheck={false}
          disabled={!activeId}
          value={draftJson}
          onChange={(e) => setDraftJson(e.currentTarget.value)}
          style={{
            flex: 1,
            minHeight: 420,
            fontFamily: "Consolas, monospace",
            fontSize: "0.84rem",
            lineHeight: 1.45
          }}
        />
      </main>
    </div>
  );
}

function ScopeChip({ item }: { item: BaseEntity }) {
  const html = cm()?.renderScopeChip?.(item) || "";
  if (!html) return null;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
