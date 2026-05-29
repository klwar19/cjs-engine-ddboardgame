// Header.tsx — Phase F JSX port of `_renderHeader` in campaign-ui.js.
//
// Renders the campaign header: back link, title row, world-events
// ticker, compact currencies, and three action menus (Save / Transfer
// / Apps). Buttons either:
//   • use a typed wrapper from `../actions.ts` for save/transfer ops
//   • or fall through to `dispatchCampaignAction` for entries the
//     vanilla `_handleAction` switch still owns.
// No `data-campaign-action` attributes — the React shell now drives
// these actions directly through onClick.

import { dispatchCampaignAction, quickSave, newSave, forkSave, exportSave, importSavePicker, pushToGitHub } from "../actions";
import { memoDeep } from "../util/memo";
import type { HeaderData, WorldEventChip } from "./types";

interface Props {
  readonly data: HeaderData;
}

function CampaignHeaderView({ data }: Props) {
  return (
    <header className="campaign-header">
      <a className="campaign-back" href="index.html">Main Menu</a>
      <div className="campaign-title">
        <h1>{data.campaignName}</h1>
        <span>
          {data.worldName} | Chapter {data.chapter} | Phase {data.phaseNumber}: {data.phaseLabel}
        </span>
        {data.worldEvents.length > 0 && <WorldEventsTicker events={data.worldEvents} />}
      </div>
      <CompactCurrencies gold={data.currencies.gold} jp={data.currencies.jp} />
      <div className="campaign-header-actions">
        <button
          className="campaign-action primary campaign-world-gate-quick"
          onClick={() => dispatchCampaignAction("open-world-gate")}
        >
          World Gate
        </button>
        <ActionMenu label="Save">
          <button className="campaign-action" onClick={quickSave}>Quick Save</button>
          <button className="campaign-action" onClick={newSave}>New Save</button>
          <button className="campaign-action" onClick={forkSave}>Fork Save</button>
        </ActionMenu>
        <ActionMenu label="Transfer">
          <button className="campaign-action" onClick={exportSave}>Export</button>
          <button className="campaign-action" onClick={importSavePicker}>Import</button>
          <button className="campaign-action" onClick={pushToGitHub}>GitHub Sync</button>
        </ActionMenu>
        <ActionMenu label="Apps">
          <a className="campaign-action" href="editor.html">Editor</a>
          <a className="campaign-action" href="combat.html">Combat</a>
        </ActionMenu>
      </div>
    </header>
  );
}

// Always-mounted chrome: memoized so a body-only state change (header data
// unchanged) skips it entirely, and a chrome change re-renders it only when
// the header slice itself differs.
export const CampaignHeader = memoDeep(CampaignHeaderView);

function WorldEventsTicker({ events }: { events: readonly WorldEventChip[] }) {
  return (
    <div className="cjs-world-event-ticker" aria-label="Active world events">
      {events.map((ev) => (
        <span
          key={ev.id}
          className={`cjs-world-event-chip category-${ev.category}`}
          title={ev.summary}
        >
          <span className="we-icon">{ev.icon}</span>
          <span className="we-name">{ev.name}</span>
          <span className="we-remaining">{ev.remainingPhases}p</span>
        </span>
      ))}
    </div>
  );
}

function CompactCurrencies({ gold, jp }: { gold: number; jp: number }) {
  return (
    <div className="campaign-stats campaign-stats-compact" aria-label="Currencies">
      <span><small>Gold</small><b>{gold}</b></span>
      <span title="Jester Points"><small>JP</small><b>{jp}</b></span>
    </div>
  );
}

// Mirrors `_actionMenu`: a `<details>` disclosure with a trigger and a
// grid of action buttons. Native open/close behaviour matches the
// vanilla version (clicking the summary toggles, clicking outside
// doesn't auto-close — same as before).
function ActionMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="campaign-action-menu">
      <summary className="campaign-action-menu-trigger">
        <span>{label}</span>
      </summary>
      <div className="campaign-action-menu-panel">
        {children}
      </div>
    </details>
  );
}
