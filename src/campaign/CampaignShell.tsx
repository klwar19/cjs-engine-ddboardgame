import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent
} from "react";
import { createPortal } from "react-dom";
import { useCampaignState, useCampaignSelector, type CampaignStateSnapshot } from "./store";
import { deepEqual } from "./util/equality";
import { ErrorBoundary } from "./util/ErrorBoundary";
import { CampaignHelpPopover } from "./HelpPopover";
import { importSaveFile } from "./actions";
import { CampaignHeader } from "./shell/Header";
import { CampaignModeBar } from "./shell/ModeBar";
import { CampaignSubTabs } from "./shell/SubTabs";
import { CampaignRecentLog } from "./shell/RecentLog";
import { CampaignCommandRail } from "./shell/CommandRail";
import { getChromeData } from "./shell/bridge";
import { PartyDrawer } from "./shell/PartyDrawer";
import { NotesPanel } from "./shell/NotesPanel";
import { QuestsDrawerPanel, LogDrawerPanel } from "./shell/DrawerPanels";
// Tab bodies are React.lazy'd (Phase I.4) so the campaign entry chunk ships
// only the chrome + the active tab; the rest download on first visit (and the
// PWA precaches them in the background). Multi-export files
// (CampaignWorldMapTab / CampaignHubTabs / CampaignCraftCookTabs /
// CampaignEventTab) are imported via the SAME specifier per export, so each
// resolves to ONE shared "tab family" chunk. This realizes the vite config's
// stated intent and mirrors the editor's lazy-builder split (Phase E).

// React Shell: this component owns the campaign chrome
// (header, mode bar, sub-tabs, recent log strip, command rail, drawer)
// in real React. Each chrome strip is its own JSX component in
// `./shell/`, reading typed data via `getChromeData(state)`.
//
// The body area renders React tab components directly via
// `REACT_TAB_COMPONENTS`; an unregistered tab id renders a typed empty
// state (the defensive `VanillaBody` below — no HTML-string bridge).
//
// The drawer is portaled to document.body via React, replacing the
// imperative `_drawerEl`/`_drawerBackdropEl` flow in campaign-ui.js.
// Every drawer panel is React-owned now (party / inventory / notes via
// their own components; quests / log via `shell/DrawerPanels`), so the
// shell holds no `dangerouslySetInnerHTML` outside the world-map SVG.

// ── Bridge surface (mirror of campaign-ui.js bridge) ───────────────
// Panel defs + order come from the TS chrome data builder (Phase H.4).
import { panelDefsForState } from "./shell/chromeData";

interface CampaignUIShell {
  readonly enableReactShell: () => void;
  readonly init: (root: HTMLElement) => Promise<void> | void;
  readonly setActivePanel: (panelId: string | null) => void;
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

// The `<main>` body used to carry a click/change forwarder that translated
// bridged `data-campaign-action` / `-mode` / `-tab` / `-panel` attributes into
// typed dispatch, and a second typed-marker bridge (`htmlIslandActions`) routed
// the external-tab islands. Both are gone: every tab — including the former
// island tabs (inventory / shops / craft / cook / farm / relationships) — is
// real JSX with typed `onClick`, and `campaign-map` binds its own private
// click listener. Nothing emits the mode/tab/panel attributes any more.

// Registry of React-owned tabs. Mirrors the vanilla
// `cui-react-bridge.js` registrations, but instead of a mount-point div
// and a portal we render the component directly inline.
type TabComponent = LazyExoticComponent<ComponentType<{ state: CampaignStateSnapshot }>>;

const REACT_TAB_COMPONENTS: Readonly<Record<string, TabComponent>> = {
  settings: lazy(() => import("./tabs/CampaignSettingsTab").then((m) => ({ default: m.CampaignSettingsTab }))),
  logs: lazy(() => import("./tabs/CampaignLogsTab").then((m) => ({ default: m.CampaignLogsTab }))),
  roster: lazy(() => import("./tabs/CampaignRosterTab").then((m) => ({ default: m.CampaignRosterTab }))),
  worldMap: lazy(() => import("./tabs/CampaignWorldMapTab").then((m) => ({ default: m.CampaignWorldMapTab }))),
  worldActivities: lazy(() => import("./tabs/CampaignWorldMapTab").then((m) => ({ default: m.CampaignWorldActivitiesTab }))),
  sideForge: lazy(() => import("./tabs/CampaignHubTabs").then((m) => ({ default: m.CampaignSideForgeTab }))),
  questChains: lazy(() => import("./tabs/CampaignHubTabs").then((m) => ({ default: m.CampaignQuestChainsTab }))),
  oracleForge: lazy(() => import("./tabs/CampaignHubTabs").then((m) => ({ default: m.CampaignOracleForgeTab }))),
  battleSets: lazy(() => import("./tabs/CampaignHubTabs").then((m) => ({ default: m.CampaignBattleSetsTab }))),
  mapSeeds: lazy(() => import("./tabs/CampaignHubTabs").then((m) => ({ default: m.CampaignMapSeedsTab }))),
  inventory: lazy(() => import("./tabs/CampaignInventoryTab").then((m) => ({ default: m.CampaignInventoryTab }))),
  shops: lazy(() => import("./tabs/CampaignShopsTab").then((m) => ({ default: m.CampaignShopsTab }))),
  craft: lazy(() => import("./tabs/CampaignCraftCookTabs").then((m) => ({ default: m.CampaignCraftTab }))),
  cook: lazy(() => import("./tabs/CampaignCraftCookTabs").then((m) => ({ default: m.CampaignCookTab }))),
  farm: lazy(() => import("./tabs/CampaignFarmTab").then((m) => ({ default: m.CampaignFarmTab }))),
  relationships: lazy(() => import("./tabs/CampaignRelationshipsTab").then((m) => ({ default: m.CampaignRelationshipsTab }))),
  worldGate: lazy(() => import("./tabs/CampaignWorldGateTab").then((m) => ({ default: m.CampaignWorldGateTab }))),
  storyHome: lazy(() => import("./tabs/CampaignStoryHomeTab").then((m) => ({ default: m.CampaignStoryHomeTab }))),
  storySummary: lazy(() => import("./tabs/CampaignStorySummaryTab").then((m) => ({ default: m.CampaignStorySummaryTab }))),
  storyDirector: lazy(() => import("./tabs/CampaignStoryDirectorTab").then((m) => ({ default: m.CampaignStoryDirectorTab }))),
  questHome: lazy(() => import("./tabs/CampaignQuestHomeTab").then((m) => ({ default: m.CampaignQuestHomeTab }))),
  quests: lazy(() => import("./tabs/CampaignQuestsPanelTab").then((m) => ({ default: m.CampaignQuestsPanelTab }))),
  eventHome: lazy(() => import("./tabs/CampaignEventTab").then((m) => ({ default: m.CampaignEventHomeTab }))),
  eventCharacter: lazy(() => import("./tabs/CampaignEventTab").then((m) => ({ default: m.CampaignEventCharacterTab }))),
  eventSpecial: lazy(() => import("./tabs/CampaignEventTab").then((m) => ({ default: m.CampaignEventSpecialTab }))),
  eventSide: lazy(() => import("./tabs/CampaignEventTab").then((m) => ({ default: m.CampaignEventSideTab }))),
  eventLog: lazy(() => import("./tabs/CampaignEventLogTab").then((m) => ({ default: m.CampaignEventLogTab }))),
  scenarios: lazy(() => import("./tabs/CampaignScenariosTab").then((m) => ({ default: m.CampaignScenariosTab }))),
  maps: lazy(() => import("./tabs/CampaignMapsTab").then((m) => ({ default: m.CampaignMapsTab }))),
  minigameTest: lazy(() => import("./tabs/CampaignMinigameTestTab").then((m) => ({ default: m.CampaignMinigameTestTab }))),
  overview: lazy(() => import("./tabs/CampaignOverviewTab").then((m) => ({ default: m.CampaignOverviewTab })))
};

// Stable selector identity (module-level) so useCampaignSelector keeps a
// steady getSnapshot and never re-subscribes. Returns the typed chrome slice,
// or null before a save is loaded.
function selectChrome(state: CampaignStateSnapshot | null) {
  return state ? getChromeData(state) : null;
}

// ── Shell ─────────────────────────────────────────────────────────
export function CampaignShell() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  // `useCampaignState()` re-renders the shell on every committed change —
  // chrome (tab/mode/panel switches) AND data — because the store listens to
  // the `campaign:state-tick` / `campaign:rendered` superset signal. The
  // shell no longer needs its own state-tick listener (removed below).
  const { state } = useCampaignState();
  // Chrome via a value-equality selector: when only body data changes, this
  // returns the SAME ChromeData reference, so the memoized chrome strips skip
  // re-render via their Object.is fast path. When chrome changes, a fresh
  // object flows and each strip re-renders only if its own slice differs.
  const chrome = useCampaignSelector(selectChrome, deepEqual);

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
            {/* ErrorBoundary (keyed by tab so a switch clears a stale error)
                catches a failed lazy chunk; Suspense covers the chunk fetch so
                the chrome stays painted while a not-yet-loaded tab streams in. */}
            <ErrorBoundary key={activeTab}>
              <Suspense fallback={<div className="campaign-loading">Loading…</div>}>
                {ReactTab ? <ReactTab state={state} /> : <VanillaBody tab={activeTab} />}
              </Suspense>
            </ErrorBoundary>
          </main>
          <aside className="campaign-rail">
            <CampaignCommandRail data={chrome.commandRail} />
          </aside>
        </div>
        <input
          type="file"
          id="campaign-import-file"
          accept=".json"
          hidden
          onChange={(e) => {
            importSaveFile(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {activePanel ? <CampaignDrawer panelId={activePanel} state={state} /> : null}
      <CampaignHelpPopover />
    </div>
  );
}

// Defensive fallback for an active tab id with no registered React
// component. Every real tab is in REACT_TAB_COMPONENTS, so this is not
// reached in normal operation; it renders a typed empty state (no
// HTML-string bridge) rather than blanking the body.
function VanillaBody({ tab }: { tab: string }) {
  return (
    <div className="campaign-main-body">
      <div className="campaign-empty">No body registered for the “{tab}” tab.</div>
    </div>
  );
}

// Every drawer panel is React-owned. Party / inventory / notes have their own
// components; quests / log are the small side panels in `shell/DrawerPanels`.
// The inventory drawer reuses the SAME lazy chunk as the inventory tab, so
// opening the drawer doesn't pull it into the shell entry chunk.
function DrawerBody({ panelId, state }: { panelId: string; state: CampaignStateSnapshot }) {
  if (panelId === "party") return <PartyDrawer state={state} />;
  if (panelId === "notes") return <NotesPanel state={state} />;
  if (panelId === "quests") return <QuestsDrawerPanel state={state} />;
  if (panelId === "log") return <LogDrawerPanel state={state} />;
  if (panelId === "inventory") {
    const InventoryTab = REACT_TAB_COMPONENTS.inventory;
    return (
      <Suspense fallback={<div className="campaign-loading">Loading…</div>}>
        <InventoryTab state={state} />
      </Suspense>
    );
  }
  return <div className="campaign-empty">Panel not implemented.</div>;
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
  const defs = panelDefsForState(state);
  const def = defs[panelId];
  if (!def) return null;

  // Close the drawer through the bridge so the closure-private flag
  // and the React state stay in sync.
  const close = () => UI.setActivePanel(null);

  // ESC binding: shell/boot.ts also binds a document-level Escape handler
  // (`bindEscapeForPanels`), but the drawer is rendered by this component,
  // so we own the close path while it is mounted. Both close the panel
  // through the chrome slice (idempotent), so the duplicate listener keeps
  // the close contract self-contained.
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
          // The drawer lives in a React portal under document.body, so it is
          // OUTSIDE the campaign-root subtree and owns its own click handling.
          // Every drawer body is now React-owned (party / inventory / notes) or
          // display-only HTML (quests / log) with no action markers, so the only
          // delegated concern left here is the close button.
          const target = e.target as HTMLElement | null;
          if (!target) return;
          if (target.closest("[data-campaign-panel-close]")) {
            e.stopPropagation();
            close();
          }
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
        <div className="campaign-drawer-body">
          <DrawerBody panelId={panelId} state={state} />
        </div>
      </aside>
    </>
  );
  return createPortal(drawerNode, document.body);
}
