import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCampaignState, type CampaignStateSnapshot } from "./store";
import { CampaignHelpPopover } from "./HelpPopover";
import { dispatchCampaignAction, type CampaignActionName } from "./actions";
import { CampaignHeader } from "./shell/Header";
import { CampaignModeBar } from "./shell/ModeBar";
import { CampaignSubTabs } from "./shell/SubTabs";
import { CampaignRecentLog } from "./shell/RecentLog";
import { CampaignCommandRail } from "./shell/CommandRail";
import { getChromeData } from "./shell/bridge";
import { CampaignSettingsTab } from "./tabs/CampaignSettingsTab";
import { CampaignLogsTab } from "./tabs/CampaignLogsTab";
import { CampaignRosterTab } from "./tabs/CampaignRosterTab";
import { CampaignWorldMapTab, CampaignWorldActivitiesTab } from "./tabs/CampaignWorldMapTab";
import {
  CampaignSideForgeTab,
  CampaignQuestChainsTab,
  CampaignOracleForgeTab,
  CampaignBattleSetsTab,
  CampaignMapSeedsTab
} from "./tabs/CampaignHubTabs";
import {
  CampaignInventoryTab,
  CampaignShopsTab,
  CampaignCraftTab,
  CampaignCookTab,
  CampaignFarmTab,
  CampaignRelationshipsTab
} from "./tabs/CampaignExternalTabs";
import { CampaignStoryHomeTab } from "./tabs/CampaignStoryHomeTab";
import { CampaignWorldGateTab } from "./tabs/CampaignWorldGateTab";
import { CampaignStoryDirectorTab } from "./tabs/CampaignStoryDirectorTab";
import { CampaignQuestsPanelTab } from "./tabs/CampaignQuestsPanelTab";
import { CampaignEventLogTab } from "./tabs/CampaignEventLogTab";
import { CampaignMinigameTestTab } from "./tabs/CampaignMinigameTestTab";
import { CampaignOverviewTab } from "./tabs/CampaignOverviewTab";
import { CampaignStorySummaryTab } from "./tabs/CampaignStorySummaryTab";
import { CampaignQuestHomeTab } from "./tabs/CampaignQuestHomeTab";
import {
  CampaignEventHomeTab,
  CampaignEventCharacterTab,
  CampaignEventSpecialTab,
  CampaignEventSideTab
} from "./tabs/CampaignEventTab";
import { CampaignScenariosTab } from "./tabs/CampaignScenariosTab";
import { CampaignMapsTab } from "./tabs/CampaignMapsTab";

// React Shell: this component owns the campaign chrome
// (header, mode bar, sub-tabs, recent log strip, command rail, drawer)
// in real React. Each chrome strip is its own JSX component in
// `./shell/`, reading typed data via `getChromeData(state)`.
//
// The body area renders React tab components directly. Tabs not yet
// migrated to JSX fall back to `getMainBody()` (vanilla HTML).
//
// The drawer is portaled to document.body via React, replacing the
// imperative `_drawerEl`/`_drawerBackdropEl` flow in campaign-ui.js.

// ── Bridge surface (mirror of campaign-ui.js bridge) ───────────────
interface PanelDef {
  readonly icon: string;
  readonly label: string;
  readonly title: string;
}

interface CampaignUIShell {
  readonly enableReactShell: () => void;
  readonly init: (root: HTMLElement) => Promise<void> | void;
  readonly getMainBody: (state?: CampaignStateSnapshot) => string;
  readonly getPanelDefs: (state?: CampaignStateSnapshot) => Record<string, PanelDef>;
  readonly getPanelOrder: () => readonly string[];
  readonly renderDrawerBody: (panelId: string, state?: CampaignStateSnapshot) => string;
  readonly setActiveMode: (mode: string, opts?: { keepTab?: boolean }) => void;
  readonly setActiveTab: (tab: string, opts?: { keepMode?: boolean }) => void;
  readonly setActivePanel: (panelId: string | null) => void;
  readonly getActiveTab: () => string;
  readonly getActiveMode: () => string;
  readonly getActivePanel: () => string | null;
  readonly getBootIncompatibleNotice?: () => { readonly slotName: string; readonly reason: string; readonly slotId: string } | null;
}

interface SceneAttach {
  readonly wireCampaign?: () => void;
}
interface L2dAttach {
  readonly init?: (opts: { mode: string }) => Promise<void>;
}
interface SeqAttach {
  readonly init?: () => void;
}

interface ShellCjs {
  readonly CampaignUI?: CampaignUIShell;
  readonly ScenePlayer?: SceneAttach;
  readonly CampaignSequenceVN?: SeqAttach;
  readonly L2DCompanion?: L2dAttach;
}

function cjs(): ShellCjs {
  return (window as unknown as { CJS?: ShellCjs }).CJS ?? {};
}

// Registry of React-owned tabs. Mirrors the vanilla
// `cui-react-bridge.js` registrations, but instead of a mount-point div
// and a portal we render the component directly inline.
const REACT_TAB_COMPONENTS: Readonly<
  Record<string, (props: { state: CampaignStateSnapshot }) => React.ReactNode>
> = {
  settings: (props) => <CampaignSettingsTab {...props} />,
  logs: (props) => <CampaignLogsTab {...props} />,
  roster: (props) => <CampaignRosterTab {...props} />,
  worldMap: (props) => <CampaignWorldMapTab {...props} />,
  worldActivities: (props) => <CampaignWorldActivitiesTab {...props} />,
  sideForge: (props) => <CampaignSideForgeTab {...props} />,
  questChains: (props) => <CampaignQuestChainsTab {...props} />,
  oracleForge: (props) => <CampaignOracleForgeTab {...props} />,
  battleSets: (props) => <CampaignBattleSetsTab {...props} />,
  mapSeeds: (props) => <CampaignMapSeedsTab {...props} />,
  inventory: (props) => <CampaignInventoryTab {...props} />,
  shops: (props) => <CampaignShopsTab {...props} />,
  craft: (props) => <CampaignCraftTab {...props} />,
  cook: (props) => <CampaignCookTab {...props} />,
  farm: (props) => <CampaignFarmTab {...props} />,
  relationships: (props) => <CampaignRelationshipsTab {...props} />,
  worldGate: (props) => <CampaignWorldGateTab {...props} />,
  storyHome: (props) => <CampaignStoryHomeTab {...props} />,
  storySummary: (props) => <CampaignStorySummaryTab {...props} />,
  storyDirector: (props) => <CampaignStoryDirectorTab {...props} />,
  questHome: (props) => <CampaignQuestHomeTab {...props} />,
  quests: (props) => <CampaignQuestsPanelTab {...props} />,
  eventHome: (props) => <CampaignEventHomeTab {...props} />,
  eventCharacter: (props) => <CampaignEventCharacterTab {...props} />,
  eventSpecial: (props) => <CampaignEventSpecialTab {...props} />,
  eventSide: (props) => <CampaignEventSideTab {...props} />,
  eventLog: (props) => <CampaignEventLogTab {...props} />,
  scenarios: (props) => <CampaignScenariosTab {...props} />,
  maps: (props) => <CampaignMapsTab {...props} />,
  minigameTest: (props) => <CampaignMinigameTestTab {...props} />,
  overview: (props) => <CampaignOverviewTab {...props} />
};

// ── Shell ─────────────────────────────────────────────────────────
export function CampaignShell() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const { state } = useCampaignState();

  // One-time boot: enable the React-shell flag BEFORE init() so the
  // vanilla render() doesn't clobber our DOM. After init, subscribe to
  // both `campaign:state-tick` (the React-shell signal) and
  // `campaign:rendered` (legacy fallback) so the shell re-renders
  // whenever vanilla mutates state.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const boot = async () => {
      if (cancelled) return;
      const c = cjs();
      const UI = c.CampaignUI;
      if (!UI?.enableReactShell || !UI?.init) {
        tries += 1;
        if (tries > 100) {
          setBootError("CJS.CampaignUI bridge surface missing");
          return;
        }
        window.setTimeout(() => void boot(), 40);
        return;
      }
      const mount = rootRef.current;
      if (!mount) {
        setBootError("Campaign mount node not found");
        return;
      }
      try {
        UI.enableReactShell();
        await UI.init(mount);
        c.ScenePlayer?.wireCampaign?.();
        c.CampaignSequenceVN?.init?.();
        if (c.L2DCompanion?.init) {
          c.L2DCompanion
            .init({ mode: "campaign" })
            .catch((err: unknown) => console.warn("L2D init:", err));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Campaign init failed:", error);
        setBootError(msg);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Bump the tick whenever the engine emits a state change. We listen
  // for both events: the new `state-tick` (React-shell mode) and the
  // legacy `rendered` (in case the engine ever falls back).
  useEffect(() => {
    const onTick = () => setRenderTick((t) => t + 1);
    document.addEventListener("campaign:state-tick", onTick, true);
    document.addEventListener("campaign:rendered", onTick, true);
    return () => {
      document.removeEventListener("campaign:state-tick", onTick, true);
      document.removeEventListener("campaign:rendered", onTick, true);
    };
  }, []);

  // Reference the tick so React keeps it as a dep of the read below.
  void renderTick;

  if (bootError) {
    return (
      <div ref={rootRef} id="campaign-root" className="campaign-root">
        <div className="campaign-error">Campaign Mode failed to load: {bootError}</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div ref={rootRef} id="campaign-root" className="campaign-root">
        <div className="campaign-loading">Loading Campaign Mode...</div>
      </div>
    );
  }

  const chrome = getChromeData(state);
  if (!chrome) {
    return (
      <div ref={rootRef} id="campaign-root" className="campaign-root">
        <div className="campaign-loading">Loading Campaign Mode...</div>
      </div>
    );
  }

  const activeTab = chrome.activeTab;
  const activePanel = chrome.activePanel;
  const ReactTab = REACT_TAB_COMPONENTS[activeTab];

  return (
    <div
      ref={rootRef}
      id="campaign-root"
      className="campaign-root"
    >
      <div className={`campaign-shell${activePanel ? " has-drawer-open" : ""}`}>
        <CampaignHeader data={chrome.header} />
        <CampaignModeBar data={chrome.modeBar} />
        <CampaignSubTabs
          tabs={chrome.subTabs}
          activeTab={chrome.activeTab}
          isUtility={chrome.isUtility}
        />
        <CampaignRecentLog data={chrome.recentLog} />
        <div className="campaign-body">
          <main className="campaign-main">
            {ReactTab ? <ReactTab state={state} /> : <VanillaBody state={state} tab={activeTab} />}
          </main>
          <aside className="campaign-rail">
            <CampaignCommandRail data={chrome.commandRail} />
          </aside>
        </div>
        <input type="file" id="campaign-import-file" accept=".json" hidden />
      </div>
      {activePanel ? <CampaignDrawer panelId={activePanel} state={state} /> : null}
      <CampaignHelpPopover />
    </div>
  );
}

// Renders the body of a non-migrated tab via `getMainBody`. The HTML
// string can include mount-point divs (the cui-react-bridge places
// `campaign-react-tab-<id>` divs there for tabs handled by the React
// registry); when a registered tab's React component is present in
// REACT_TAB_COMPONENTS above, we render it directly instead and this
// fallback isn't reached.
function VanillaBody({ state, tab }: { state: CampaignStateSnapshot; tab: string }) {
  const UI = cjs().CampaignUI;
  let html = "";
  try {
    html = UI?.getMainBody(state) ?? "";
  } catch (error) {
    console.error(`getMainBody(${tab}) failed:`, error);
    html = `<div class="campaign-empty">${tab} render failed.</div>`;
  }
  return <div className="campaign-main-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── Drawer (React portal to document.body) ────────────────────────
// Replaces the imperative `_drawerEl` flow in campaign-ui.js. The
// drawer is a controlled component now — open if `panelId` is set,
// closed otherwise. Clicking the backdrop or pressing Escape calls
// `setActivePanel(null)` which triggers a vanilla render() and emits
// a state-tick so the shell re-renders without the drawer.
function CampaignDrawer({ panelId, state }: { panelId: string; state: CampaignStateSnapshot }) {
  const UI = cjs().CampaignUI;
  if (!UI) return null;
  const defs = UI.getPanelDefs(state);
  const def = defs[panelId];
  if (!def) return null;

  let bodyHtml = "";
  try {
    bodyHtml = UI.renderDrawerBody(panelId, state);
  } catch (error) {
    console.error(`renderDrawerBody(${panelId}) failed:`, error);
    bodyHtml = `<div class="campaign-empty">Panel render failed.</div>`;
  }

  // Close the drawer through the bridge so the closure-private flag
  // and the React state stay in sync.
  const close = () => UI.setActivePanel(null);

  // ESC binding: campaign-ui.js still calls `_bindEscapeForPanels` for
  // the vanilla case, but in React-shell mode the drawer is rendered
  // by this component, so we own the close path. The vanilla listener
  // would still work (it calls _closePanel which now branches into the
  // React path), but duplicating the listener here keeps the close
  // contract self-contained while the drawer is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".modal-overlay")) return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  const drawerNode = (
    <>
      <div
        className="campaign-drawer-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      />
      <aside
        className="campaign-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={def.title}
        data-panel-id={panelId}
        onClick={(e) => {
          // The drawer lives in a React portal under document.body, so
          // it is OUTSIDE the campaign-root event-delegation tree. The
          // vanilla shell's click listener on `_root` never sees these
          // events. We replicate the drawer's old in-place click
          // handler here: close buttons close the panel, and every
          // other `data-campaign-action` button is forwarded to the
          // vanilla dispatch via dispatchCampaignAction (which routes
          // through campaign-root's listener).
          const target = e.target as HTMLElement | null;
          if (!target) return;
          if (target.closest("[data-campaign-panel-close]")) {
            e.stopPropagation();
            close();
            return;
          }
          const actionBtn = target.closest("[data-campaign-action]") as HTMLElement | null;
          if (!actionBtn) return;
          e.preventDefault();
          const action = actionBtn.dataset.campaignAction;
          if (!action) return;
          // Tab-switch actions auto-close the panel (matches the legacy
          // drawer's _closePanel pre-step).
          const closesPanel = new Set([
            "open-inventory-tab", "open-roster-tab", "open-scenarios-tab",
            "open-maps-tab", "open-quests-tab", "open-shops-tab",
            "open-sideforge-tab", "open-story-home", "open-quest-home",
            "open-event-home", "open-farm-tab", "open-event-stories-tab",
            "open-event-battles-tab", "open-event-log"
          ]);
          if (closesPanel.has(action)) close();
          // Forward to the vanilla dispatcher with the same dataset
          // payload the original delegate would have seen. `action` is a
          // runtime DOM string from the HTML-bridge drawer body, so it
          // crosses the typed boundary via a cast.
          const payload: Record<string, string | number | undefined> = {};
          for (const k of Object.keys(actionBtn.dataset)) {
            if (k === "campaignAction") continue;
            payload[k] = actionBtn.dataset[k];
          }
          dispatchCampaignAction(action as CampaignActionName, payload);
        }}
      >
        <header className="campaign-drawer-head">
          <h2>{def.title}</h2>
          <button
            className="campaign-drawer-close"
            data-campaign-panel-close="1"
            aria-label="Close panel"
          >
            ×
          </button>
        </header>
        <div
          className="campaign-drawer-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </aside>
    </>
  );
  return createPortal(drawerNode, document.body);
}
