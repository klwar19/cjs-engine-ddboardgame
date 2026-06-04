// CampaignFarmTab.tsx — JSX port of the vanilla `farming-mode.js` RENDER half
// (renderFarm + tile/tool/tile-menu/QTE/detail sub-renderers) and its keyboard
// controls (bindControls). All stateful operations, QTE-hit timing and growth
// logic stay in farming-mode.js, invoked through typed onClick → the farm.ts
// action handlers (same dispatch the old data-* markers routed to). The QTE bar
// is CSS-animated via --qte-duration, so the view is purely declarative.

import { useEffect, useRef, type CSSProperties } from "react";
import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getFarmData,
  type FarmData,
  type FarmTileView,
  type FarmToolView,
  type FarmTileMenu,
  type FarmQteView
} from "./data/farm";

interface Props {
  readonly state: CampaignStateSnapshot;
}

interface FarmingModeSeed {
  readonly selectSeed?: (value: string) => void;
}
function selectSeed(value: string): void {
  // No registry action for the seed picker — it routes straight to FarmingMode
  // (the same direct call the old onFarmSeedChange forwarder made). The mutation
  // emits a CampaignState change, so the React store re-renders the tab.
  (window as unknown as { CJS?: { FarmingMode?: FarmingModeSeed } }).CJS?.FarmingMode?.selectSeed?.(value);
}

const MOVE_KEYS: Readonly<Record<string, string>> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right"
};

export function CampaignFarmTab({ state }: Props) {
  const data = getFarmData(state);

  // Keyboard controls (ports bindControls). Bound only while the Farm tab is
  // mounted; a ref carries the latest menu/QTE flags so the handler isn't
  // re-bound every render but still branches on current state.
  const flags = useRef({ hasTileMenu: data.hasTileMenu, qteActive: data.qteActive });
  flags.current = { hasTileMenu: data.hasTileMenu, qteActive: data.qteActive };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;
      const k = String(event.key || "").toLowerCase();
      const { hasTileMenu, qteActive } = flags.current;
      if (hasTileMenu && k === "escape") {
        event.preventDefault();
        dispatchCampaignAction("farm-tile-menu-close");
        return;
      }
      if (qteActive) {
        if (k === " " || k === "enter") {
          event.preventDefault();
          dispatchCampaignAction("farm-qte-hit");
        } else if (k === "escape") {
          event.preventDefault();
          dispatchCampaignAction("farm-qte-close");
        }
        return;
      }
      const dir = MOVE_KEYS[k];
      if (dir) {
        event.preventDefault();
        dispatchCampaignAction("farm-move", { dir });
        return;
      }
      if (k === " " || k === "enter") {
        event.preventDefault();
        dispatchCampaignAction("farm-interact");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sectionClass = `campaign-panel farm-mode${data.qteActive ? " has-qte-active" : ""}${
    data.hasTileMenu ? " has-tile-menu" : ""
  }`;

  return (
    <section className={sectionClass} tabIndex={0} aria-label="Pocket Haven farm">
      <div className="campaign-panel-head farm-head">
        <div>
          <h2>Pocket Haven Farm</h2>
          <div className="campaign-muted">{data.subtitle}</div>
        </div>
        <div className="campaign-panel-actions farm-head-actions">
          <FocusBonusButton available={data.qteAvailable} />
          <button className="campaign-action" onClick={() => dispatchCampaignAction("farm-tick")}>
            Tick Growth
          </button>
          <button className="campaign-action primary" onClick={() => dispatchCampaignAction("pass-phase")}>
            Pass Phase
          </button>
        </div>
      </div>

      <div className="farm-layout">
        <div className="farm-stage">
          <div className="farm-board" style={{ "--farm-cols": data.width } as CSSProperties}>
            {data.tiles.map((tile) => (
              <FarmTileButton key={`${tile.x},${tile.y}`} tile={tile} />
            ))}
          </div>
        </div>

        <aside className="farm-controls" aria-label="Farm controls">
          <div className="farm-tool-grid" role="toolbar" aria-label="Tools">
            {data.tools.map((tool) => (
              <FarmToolButton key={tool.id} tool={tool} />
            ))}
          </div>

          <label className="farm-select-label">
            <span>Seed</span>
            <select
              className="farm-select"
              value={data.seedOptions.find((option) => option.selected)?.id ?? ""}
              onChange={(event) => selectSeed(event.target.value)}
            >
              {data.seedOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="farm-action-strip">
            <button
              className="campaign-action primary farm-main-action"
              onClick={() => dispatchCampaignAction("farm-interact")}
            >
              {data.mainActionLabel}
            </button>
            <FocusBonusButton available={data.qteAvailable} extraClass="farm-bonus-action" />
          </div>

          <div className="farm-dpad" aria-label="Move farmer">
            <span />
            <button onClick={() => dispatchCampaignAction("farm-move", { dir: "up" })} aria-label="Move up">
              Up
            </button>
            <span />
            <button onClick={() => dispatchCampaignAction("farm-move", { dir: "left" })} aria-label="Move left">
              Left
            </button>
            <button onClick={() => dispatchCampaignAction("farm-interact")} aria-label="Use selected tool">
              Act
            </button>
            <button onClick={() => dispatchCampaignAction("farm-move", { dir: "right" })} aria-label="Move right">
              Right
            </button>
            <span />
            <button onClick={() => dispatchCampaignAction("farm-move", { dir: "down" })} aria-label="Move down">
              Down
            </button>
            <span />
          </div>

          <div className="farm-detail">
            <div className="farm-detail-title">
              <strong>{data.detail.title}</strong>
              <span className="campaign-pill">{data.detail.facingLabel}</span>
            </div>
            <div className="farm-detail-grid">
              <span>Progress</span>
              <b>{data.detail.progress}</b>
              <span>Soil</span>
              <b>{data.detail.soil}</b>
              <span>Water</span>
              <b>{data.detail.water}</b>
              <span>Fertilizer</span>
              <b>{data.detail.fertilizer}</b>
            </div>
          </div>

          <div className="farm-recent">
            {data.recent.length ? (
              data.recent.map((line, index) => <div key={index}>{line}</div>)
            ) : (
              <div className="campaign-muted">No farm actions yet.</div>
            )}
          </div>
        </aside>
      </div>

      {data.tileMenu ? <FarmTileMenuView menu={data.tileMenu} /> : null}
      {data.qte ? <FarmQteWindow qte={data.qte} /> : null}
    </section>
  );
}

function FocusBonusButton({ available, extraClass }: { available: boolean; extraClass?: string }) {
  return (
    <button
      className={`campaign-action${extraClass ? ` ${extraClass}` : ""}${available ? " primary" : ""}`}
      disabled={!available}
      onClick={() => dispatchCampaignAction("farm-qte-open")}
    >
      {available ? "Focus Bonus" : "No Bonus"}
    </button>
  );
}

function FarmTileButton({ tile }: { tile: FarmTileView }) {
  return (
    <button
      className={tile.className}
      title={tile.label}
      aria-label={tile.label}
      onClick={() => dispatchCampaignAction("farm-tile", { x: tile.x, y: tile.y })}
    >
      <span className="farm-ground" />
      {tile.hasGrass ? <span className="farm-grass" /> : null}
      {tile.cropGlyph != null ? (
        <span className={`farm-crop crop-stage-${tile.cropStageClass}`}>{tile.cropGlyph}</span>
      ) : null}
      {tile.isPlayer ? (
        <span className="farm-player">
          <span />
        </span>
      ) : null}
    </button>
  );
}

function FarmToolButton({ tool }: { tool: FarmToolView }) {
  return (
    <button
      className={`farm-tool${tool.active ? " is-active" : ""}`}
      aria-pressed={tool.active ? "true" : "false"}
      onClick={() => dispatchCampaignAction("farm-select-tool", { tool: tool.id })}
    >
      <span className={`farm-tool-glyph tool-${tool.glyphClass}`}>{tool.glyph}</span>
      <span>{tool.label}</span>
      <small>Lv {tool.level}</small>
    </button>
  );
}

function FarmTileMenuView({ menu }: { menu: FarmTileMenu }) {
  return (
    <div className="farm-tile-menu-backdrop" role="presentation">
      <div className="farm-tile-menu" role="dialog" aria-label="Tile actions">
        <div className="farm-tile-menu-head">
          <div>
            <strong>{menu.title}</strong>
            <div className="campaign-muted">{menu.subtitle}</div>
          </div>
          <button
            className="campaign-icon-btn"
            aria-label="Close tile actions"
            onClick={() => dispatchCampaignAction("farm-tile-menu-close")}
          >
            Close
          </button>
        </div>
        <div className="farm-tile-menu-meta">
          {menu.meta.map((entry, index) => (
            <span key={index}>{entry}</span>
          ))}
        </div>
        <div className="farm-tile-menu-actions">
          {menu.options.map((option) => (
            <button
              key={option.id}
              className={`campaign-action${option.primary ? " primary" : ""}`}
              disabled={!option.enabled}
              title={option.hint || option.label}
              onClick={() =>
                dispatchCampaignAction("farm-tile-action", { tileAction: option.id, x: menu.x, y: menu.y })
              }
            >
              <span>{option.label}</span>
              {option.hint ? <small>{option.hint}</small> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FarmQteWindow({ qte }: { qte: FarmQteView }) {
  const laneStyle = {
    "--qte-target-start": `${qte.targetStart}%`,
    "--qte-target-width": `${qte.targetWidth}%`,
    "--qte-duration": `${qte.duration}ms`
  } as CSSProperties;
  return (
    <div className="farm-qte-backdrop" role="presentation">
      <div className="farm-qte-window" role="dialog" aria-label="Farm focus bonus">
        <div className="farm-qte-head">
          <strong>Focus Bonus</strong>
          <button
            className="campaign-icon-btn"
            aria-label="Close focus bonus"
            onClick={() => dispatchCampaignAction("farm-qte-close")}
          >
            Close
          </button>
        </div>
        <div className="farm-qte-lane" style={laneStyle}>
          <span className="farm-qte-target" />
          <span className="farm-qte-marker" />
        </div>
        <div className="farm-qte-actions">
          <button
            className="campaign-action primary farm-qte-hit"
            onClick={() => dispatchCampaignAction("farm-qte-hit")}
          >
            Hit
          </button>
          <button className="campaign-action" onClick={() => dispatchCampaignAction("farm-qte-close")}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
