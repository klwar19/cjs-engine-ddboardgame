import { useEffect, useState } from "react";

interface NavItemConfig {
  readonly panel: string;
  readonly label: string;
  readonly hasBadge?: boolean;
  readonly badgeKey?: string;
}

interface NavSection {
  readonly title: string;
  readonly items: readonly NavItemConfig[];
}

// Mirrors the legacy editor.html navigation/panel layout. The vanilla
// editor-controller.js queries these IDs / classes directly; renaming any
// of them will break the controller.
const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Content",
    items: [
      { panel: "effects", label: "Effects", hasBadge: true, badgeKey: "effects" },
      { panel: "statuses", label: "Status Defs" },
      { panel: "passives", label: "Passives", hasBadge: true, badgeKey: "passives" },
      { panel: "skills", label: "Skills", hasBadge: true, badgeKey: "skills" },
      { panel: "jobs", label: "Jobs", hasBadge: true, badgeKey: "jobs" },
      { panel: "personas", label: "Personas", hasBadge: true, badgeKey: "personas" },
      { panel: "items", label: "Items", hasBadge: true, badgeKey: "items" },
      { panel: "food", label: "Food", hasBadge: true, badgeKey: "food" },
      { panel: "materials", label: "Materials", hasBadge: true, badgeKey: "materials" },
      { panel: "crafting", label: "Crafting", hasBadge: true, badgeKey: "crafting" }
    ]
  },
  {
    title: "Units",
    items: [
      { panel: "characters", label: "Characters", hasBadge: true, badgeKey: "characters" },
      { panel: "monsters", label: "Monsters", hasBadge: true, badgeKey: "monsters" }
    ]
  },
  {
    title: "World",
    items: [
      { panel: "encounters", label: "Encounters", hasBadge: true, badgeKey: "encounters" }
    ]
  },
  {
    title: "Campaign",
    items: [
      { panel: "campaign", label: "Campaign Data", hasBadge: true, badgeKey: "campaigns" }
    ]
  },
  {
    title: "Tools",
    items: [
      { panel: "browser", label: "Data Browser" },
      { panel: "audio", label: "Audio Library" }
    ]
  }
];

const PANEL_IDS: readonly string[] = NAV_SECTIONS.flatMap((s) =>
  s.items.map((i) => i.panel)
);

export function EditorPage() {
  const [controllerReady, setControllerReady] = useState(false);

  // Defer importing the editor-controller IIFE until React has mounted the
  // DOM it queries. The controller looks up #sidebar, #btn-save, etc., so
  // it has to run *after* this component renders.
  useEffect(() => {
    let cancelled = false;
    void import("../../js/editor/editor-controller.js").then(() => {
      if (cancelled) return;
      setControllerReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1>CJS Editor</h1>
        <div className="btn-group" style={{ marginLeft: "auto" }}>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-undo"
            title="Nothing to undo"
            disabled
          >
            Undo
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-redo"
            title="Nothing to redo"
            disabled
          >
            Redo
          </button>
          <span
            style={{
              borderLeft: "1px solid rgba(255,255,255,0.1)",
              margin: "0 4px"
            }}
          />
          <button
            className="btn btn-ghost btn-sm"
            id="btn-migrate"
            title="Migrate legacy bundle into the multi-file layout"
          >
            Migrate
          </button>
          <button
            className="btn btn-primary btn-sm"
            id="btn-save"
            title="Review save options for the multi-file layout"
          >
            Save
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-github"
            title="Configure GitHub sync"
          >
            GitHub
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-import"
            title="Import JSON"
          >
            Import
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-export"
            title="Extract split files or download a bundle backup"
          >
            Export
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-validate"
            title="Validate all references"
          >
            Validate
          </button>
          <a
            href="tests.html"
            className="btn btn-ghost btn-sm cjs-embed-hide"
            style={{ textDecoration: "none" }}
          >
            Tests
          </a>
          <a
            href="campaign.html"
            className="btn btn-ghost btn-sm cjs-embed-hide"
            style={{ textDecoration: "none", color: "#bfdbfe" }}
          >
            Campaign
          </a>
          <a
            href="combat.html"
            className="btn btn-ghost btn-sm cjs-embed-hide"
            style={{ textDecoration: "none", color: "#fca5a5" }}
          >
            Combat
          </a>
        </div>
        <input
          type="file"
          id="import-file"
          accept=".json"
          style={{ display: "none" }}
        />
      </div>

      <div className="app-body">
        <div className="app-sidebar" id="sidebar">
          {NAV_SECTIONS.map((section, sectionIdx) => (
            <SectionGroup
              key={section.title}
              section={section}
              isFirstSection={sectionIdx === 0}
            />
          ))}
        </div>

        <div className="app-content" id="main-content">
          {PANEL_IDS.map((panel, idx) => (
            <div
              key={panel}
              className={`editor-panel${idx === 0 ? " active" : ""}`}
              id={`panel-${panel}`}
            />
          ))}
        </div>
      </div>

      <div className="status-bar">
        <div className="counts" id="status-counts" />
        <div className="sync-meta">
          <div className="status-filters">
            <label className="status-filter">
              Scope
              <select id="filter-scope" defaultValue="all">
                <option value="all">All scopes</option>
                <option value="system">System</option>
                <option value="universal">Universal</option>
                <option value="world">World only</option>
              </select>
            </label>
            <label className="status-filter">
              World
              <select id="filter-world" defaultValue="all">
                <option value="all">All worlds</option>
              </select>
            </label>
          </div>
          <span id="status-dirty" />
          <span id="status-files" />
          <span id="status-msg">{controllerReady ? "Ready" : "Loading..."}</span>
          <span id="status-sync" />
        </div>
      </div>
    </div>
  );
}

function SectionGroup({
  section,
  isFirstSection
}: {
  readonly section: NavSection;
  readonly isFirstSection: boolean;
}) {
  return (
    <>
      <div className="nav-section">{section.title}</div>
      {section.items.map((item, idx) => {
        const isFirst = isFirstSection && idx === 0;
        return (
          <div
            key={item.panel}
            className={`nav-item${isFirst ? " active" : ""}`}
            data-panel={item.panel}
          >
            <span>{item.label}</span>
            {item.hasBadge ? (
              <span className="badge" id={`count-${item.badgeKey ?? item.panel}`}>
                0
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
