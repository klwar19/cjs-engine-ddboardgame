// boot.ts — Phase H.4 TypeScript owner of the Campaign shell orchestration.
//
// This is the final piece of the campaign-ui.js retirement. The boot +
// render loop, the combat-result return flow, the Escape-to-close drawer
// binding, the command-rail drawer body (an HTML island), the quest
// narrative modal, and the action / chrome dispatch seam all live here. It
// installs `window.CJS.CampaignUI` with the same surface the React shell
// (`CampaignShell.tsx`) and the three remaining JS callers (pocket-haven,
// scenario-runner, data-hot-reload) consume — so deleting campaign-ui.js is
// a drop-in replacement.
//
// Chrome state (mode / tab / panel) is read + written through the canonical
// TS slice in `../chrome-state` directly (no `window.CJS.CampaignChrome`
// hop). Actions dispatch through `window.CJS.CampaignActionsRuntime`
// (installed by `action-handlers/registry.ts`). Every drawer panel body is
// React-owned (party / inventory / notes + quests / log via the shell), so
// boot.ts emits no main-body or drawer HTML; `esc` is kept only for the init
// error fallback.
//
// The vanilla render fallback was deleted back in H.2 (the React shell is
// always enabled), and the imperative drawer DOM (`_openPanel` /
// `_renderPanelLayer` / `_tearDownDrawer`) was fully orphaned once the
// React `CampaignDrawer` took over — both are gone. Only the reachable
// Escape-to-close path survives (the drawer can be open without re-running
// `init`, and the document-level listener mirrors the React drawer's own).

import { esc } from "../util/cui-utils";
import type { LogLine } from "../util/cui-log";
import {
  getActiveMode,
  getActiveTab,
  getActivePanel,
  setActiveMode as chromeSetActiveMode,
  setActiveTab as chromeSetActiveTab,
  setActivePanel as chromeSetActivePanel,
  setActivePanelRaw,
  setActiveModeRaw,
  setActiveTabRaw,
  modeForTab,
  normalizeForWorld
} from "../chrome-state";
import { getLauncherVisibility, onLauncherVisibilityChange } from "../../shared/embed";

// ── Boot-incompatible notice ───────────────────────────────────────────
export interface BootIncompatibleNotice {
  readonly slotName: string;
  readonly reason: string;
  readonly slotId: string;
}

// ── Minimal window.CJS module shapes (only the methods used here) ───────
interface ContentManagerModule {
  loadDefaultData: () => Promise<unknown>;
}
interface PartyChatModule {
  load?: () => Promise<unknown>;
}
interface SaveLoadResult {
  incompatible?: boolean;
  reason?: string;
  save?: { slotName?: string; saveId?: string };
}
interface MutableRunState {
  activeScenarioRun?: { currentBeatIndex?: number } | null;
  [key: string]: unknown;
}
interface CampaignStateModule {
  loadContentFromDataStore: () => void;
  getState: () => CampaignStateLike | null | undefined;
  getContent: () => { campaigns: Record<string, { id?: string }> };
  getCurrentCampaign: () => unknown;
  getActiveScenario: () => { beats?: Array<{ id?: string }> } | null | undefined;
  createNewSave: (campaignId: string | undefined) => void;
  mutate: (fn: (state: MutableRunState) => void, opts?: { source?: string }) => void;
  subscribe: (fn: () => void) => void;
}
interface SaveModule {
  hydrate?: () => Promise<unknown>;
  loadActive: () => SaveLoadResult | null | undefined;
  saveCurrent?: () => void;
}
interface SequencesModule {
  loadWorld?: (world: string) => Promise<unknown>;
}
interface StoryContextModule {
  ensureStoryContext?: (world: string) => Promise<unknown>;
}
interface ObjectiveBannerModule {
  init?: () => void;
}
interface CombatBridgeModule {
  onResult?: (fn: (result: CombatResult) => void) => () => void;
  clearResult?: () => void;
  applyResult: (result: CombatResult) => void;
  readResult?: () => CombatResult | null | undefined;
  consumeResult: () => CombatResult | null | undefined;
  openBattle?: (battle: unknown) => void;
}
interface UiModule {
  toast?: (msg: string, kind?: string) => void;
  openModal: (cfg: { title: string; content: HTMLElement; footer?: HTMLElement; width?: string }) => unknown;
  closeModal: (overlay: unknown) => void;
}
interface CombatPopupModule {
  show: (battle: PendingBattle, opts: { onEngage: (b: PendingBattle) => void }) => void;
}
interface CampaignMapModule {
  render: (el: Element) => void;
}
interface StoryScenesModule {
  openPendingNodeEntry?: () => void;
}
interface ActionsRuntime {
  has?: (name: string) => boolean;
  run: (name: string, data?: Record<string, unknown>) => unknown;
}
interface TabsRegistry {
  has: (id: string) => boolean;
  render: (id: string, state: unknown) => string | null | undefined;
}
interface CuiInternal {
  Tabs?: TabsRegistry;
}

interface BootCjs {
  ContentManager?: ContentManagerModule;
  CampaignPartyChat?: PartyChatModule;
  CampaignState?: CampaignStateModule;
  CampaignSave?: SaveModule;
  CampaignSequences?: SequencesModule;
  CampaignStoryContext?: StoryContextModule;
  CampaignObjectiveBanner?: ObjectiveBannerModule;
  CampaignCombatBridge?: CombatBridgeModule;
  UI?: UiModule;
  CampaignCombatPopup?: CombatPopupModule;
  CampaignMap?: CampaignMapModule;
  CampaignStoryScenes?: StoryScenesModule;
  CampaignActionsRuntime?: ActionsRuntime;
  CampaignUIInternal?: CuiInternal;
}

function cjs(): BootCjs {
  return (window as unknown as { CJS?: BootCjs }).CJS ?? {};
}

// ── State shapes (drawer islands + combat flow) ────────────────────────
interface PendingBattle {
  source?: string;
  threatId?: string;
  encounterId?: string;
  battleSetId?: string;
  label?: string;
}
interface CombatResult {
  saveId?: string;
  result?: string;
  requestId?: string;
  scenarioRunId?: string;
  encounterId?: string;
  completedAt?: string;
}
interface QuestMini {
  title?: string;
  id?: string;
  summary?: string;
  objectives?: Array<{ label?: string; current?: number; required?: number }>;
}
interface CampaignStateLike {
  currentWorld?: string;
  saveId?: string;
  lastCombatResultKey?: string;
  pendingBattle?: PendingBattle | null;
  inventory?: Record<string, Record<string, number>>;
  pinnedNotes?: Array<{ text?: string } | string>;
  quests?: Record<string, QuestMini>;
  log?: LogLine[];
  [key: string]: unknown;
}

// ── Orchestration state ────────────────────────────────────────────────
let _root: HTMLElement | null = null;
let _booted = false;
let _reactShellEnabled = false;
let _combatResultUnsub: (() => void) | null = null;
let _combatReturnEventsBound = false;
let _lastCombatResultKey = "";
let _escBound = false;
let _lastPendingBattleKey = "";
let _bootIncompatibleNotice: BootIncompatibleNotice | null = null;

// ── Boot ───────────────────────────────────────────────────────────────
export async function init(root: HTMLElement): Promise<void> {
  _root = root;
  // The loading placeholder is owned by React when the React shell is
  // enabled — skip the clobber to keep the React-rendered DOM intact.
  if (!_reactShellEnabled) {
    root.innerHTML = '<div class="campaign-loading">Loading Campaign Mode...</div>';
  }

  try {
    const c = cjs();
    await c.ContentManager?.loadDefaultData();
    await c.CampaignPartyChat?.load?.();
    const CS = c.CampaignState!;
    CS.loadContentFromDataStore();
    await c.CampaignSave?.hydrate?.();
    const loadResult = c.CampaignSave?.loadActive();
    if (!loadResult) {
      CS.createNewSave(Object.values(CS.getContent().campaigns)[0]?.id);
      c.CampaignSave?.saveCurrent?.();
    } else if (loadResult.incompatible) {
      _bootIncompatibleNotice = {
        slotName: loadResult.save?.slotName || loadResult.save?.saveId || "Previous Save",
        reason: loadResult.reason || "This save was made by an older build.",
        slotId: loadResult.save?.saveId || ""
      };
      CS.createNewSave(Object.values(CS.getContent().campaigns)[0]?.id);
      c.CampaignSave?.saveCurrent?.();
    }
    await c.CampaignSequences?.loadWorld?.(CS.getState()?.currentWorld || "haven");
    await c.CampaignStoryContext?.ensureStoryContext?.(CS.getState()?.currentWorld || "haven");
    // No campaign-root click delegate (Phase H.2): the React shell forwards
    // bridged body clicks through its typed React wrappers; the generic
    // shell forwarder remains only as a compatibility bridge.
    bindEscapeForPanels();
    bindCombatResultListener();
    bindCombatReturnEvents();
    c.CampaignObjectiveBanner?.init?.();
    CS.subscribe(() => {
      cjs().CampaignSave?.saveCurrent?.();
      cjs()
        .CampaignStoryContext?.ensureStoryContext?.(CS.getState()?.currentWorld || "haven")
        .catch(() => {});
      render();
    });
    _booted = true;
    consumeCombatResult();
    render();
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    if (_reactShellEnabled) {
      // React owns the chrome — surface the error through the same
      // state-tick event so CampaignShell can render its boot-error banner.
      _bootIncompatibleNotice = _bootIncompatibleNotice || {
        slotName: "Campaign Mode",
        reason: message,
        slotId: ""
      };
      try {
        root.dispatchEvent(
          new CustomEvent("campaign:state-tick", {
            bubbles: false,
            detail: { bootError: true, message }
          })
        );
      } catch {
        /* ignore */
      }
    } else {
      root.innerHTML = `<div class="campaign-error">Campaign Mode failed to load: ${esc(message)}</div>`;
    }
  }
}

// ── Render loop ────────────────────────────────────────────────────────
export function render(): void {
  const CS = cjs().CampaignState;
  if (!_root || !CS?.getState()) return;
  const state = CS.getState()!;
  cjs().CampaignStoryContext?.ensureStoryContext?.(state.currentWorld || "haven").catch(() => {});
  normalizeForWorld(state.currentWorld);

  // React owns the chrome. Skip any innerHTML clobber and let CampaignShell
  // re-read getChromeData() on the next state-tick. (The legacy non-React
  // render fallback was removed in H.2; render() is a no-op when the shell
  // flag is off.)
  if (!_reactShellEnabled) return;
  try {
    _root.dispatchEvent(
      new CustomEvent("campaign:state-tick", {
        bubbles: false,
        detail: { activeTab: getActiveTab(), activeMode: getActiveMode(), activePanel: getActivePanel() }
      })
    );
  } catch {
    /* CustomEvent unsupported in some test envs — ignore */
  }
  // The encounter flash + farm/run-panel binds still run; the drawer DOM is
  // React-owned. Farm + run-panel bindings run after React mounts the body
  // (same setTimeout trick).
  flashOnNewEncounter(state);
  const root = _root;
  setTimeout(() => {
    const mapRegion = root.querySelector("#campaign-map-region");
    if (mapRegion) cjs().CampaignMap?.render(mapRegion);
    bindRunPanel();
    cjs().CampaignStoryScenes?.openPendingNodeEntry?.();
  }, 0);
}

function flashOnNewEncounter(state: CampaignStateLike): void {
  const battle = state?.pendingBattle;
  if (!battle) {
    _lastPendingBattleKey = "";
    return;
  }
  const key = `${battle.source || ""}:${battle.threatId || ""}:${battle.encounterId || ""}:${battle.battleSetId || ""}:${battle.label || ""}`;
  if (key === _lastPendingBattleKey) return;
  _lastPendingBattleKey = key;
  // Any source representing an automatic in-game trigger gets the flash +
  // popup. Manual "Run Battle" clicks (source 'manual') are excluded — the
  // user already pressed a button. Sequence combat nodes set
  // source = 'sequence:<nodeId>', so we match the prefix.
  const source = String(battle.source || "");
  const autoTriggered =
    source === "moving_threat" ||
    source === "random" ||
    source === "random_monster_pool" ||
    source === "node" ||
    source === "progress_trigger" ||
    source === "beat" ||
    source.startsWith("sequence:") ||
    source.startsWith("quest:");
  if (!autoTriggered) return;
  const flash = document.createElement("div");
  flash.className = "campaign-encounter-flash";
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);
  setTimeout(() => {
    if (flash.parentNode) flash.parentNode.removeChild(flash);
  }, 720);
  // Throw the combat popup into the player's face. It pauses everything via
  // body.combat-popup-open until the player chooses Engage or Hold.
  const c = cjs();
  if (c.CampaignCombatPopup && !document.body.classList.contains("combat-popup-open")) {
    c.CampaignCombatPopup.show(battle, {
      onEngage: (b) => {
        try {
          cjs().CampaignSave?.saveCurrent?.();
        } catch {
          /* ignore */
        }
        cjs().CampaignCombatBridge?.openBattle?.(b);
      }
    });
  }
}

function bindRunPanel(): void {
  if (!_root) return;
  const beatList = _root.querySelector("#campaign-beat-list");
  if (!beatList) return;
  beatList.querySelectorAll<HTMLElement>("[data-beat-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.beatId;
      const scenario = cjs().CampaignState?.getActiveScenario();
      const idx = (scenario?.beats || []).findIndex((b) => b.id === id);
      if (idx < 0) return;
      cjs().CampaignState?.mutate(
        (state) => {
          const run = state.activeScenarioRun;
          if (run) run.currentBeatIndex = idx;
        },
        { source: "beat_jump" }
      );
    });
  });
}

// ── Combat-result return flow ──────────────────────────────────────────
function bindCombatResultListener(): void {
  const Bridge = cjs().CampaignCombatBridge;
  if (_combatResultUnsub || !Bridge?.onResult) return;
  _combatResultUnsub = Bridge.onResult((result) => {
    if (storeCombatResult(result)) Bridge.clearResult?.();
  });
}

function storeCombatResult(result: CombatResult | null | undefined): boolean {
  if (!result) return false;
  const c = cjs();
  const state = c.CampaignState?.getState();
  if (result.saveId && state?.saveId && result.saveId !== state.saveId) return false;
  const key = combatResultKey(result);
  if (key && (key === _lastCombatResultKey || key === state?.lastCombatResultKey)) return true;
  _lastCombatResultKey = key;
  setActiveModeRaw("quest");
  setActiveTabRaw("maps");
  c.CampaignCombatBridge?.applyResult(result);
  c.UI?.toast?.(`Combat ${result.result || "result"} applied to campaign.`, "success");
  return true;
}

function bindCombatReturnEvents(): void {
  if (_combatReturnEventsBound) return;
  _combatReturnEventsBound = true;
  const consume = () => consumeCombatResult();
  const consumeWhenVisible = () => {
    if (getLauncherVisibility().active) consume();
  };
  window.addEventListener("focus", consumeWhenVisible);
  window.addEventListener("pageshow", consumeWhenVisible);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) consumeWhenVisible();
  });
  onLauncherVisibilityChange((detail) => {
    if (detail.active) consume();
  });
  window.setInterval(() => {
    if (!getLauncherVisibility().active) return;
    const state = cjs().CampaignState?.getState?.();
    if (state?.pendingBattle || cjs().CampaignCombatBridge?.readResult?.()) consume();
  }, 750);
}

function combatResultKey(result: CombatResult): string {
  return [
    result?.requestId,
    result?.saveId,
    result?.scenarioRunId,
    result?.encounterId,
    result?.completedAt,
    result?.result
  ]
    .filter(Boolean)
    .join("|");
}

function consumeCombatResult(): boolean {
  const Bridge = cjs().CampaignCombatBridge;
  const result = Bridge?.readResult?.() || Bridge?.consumeResult();
  if (!result) return false;
  const handled = storeCombatResult(result);
  if (handled) Bridge?.clearResult?.();
  return handled;
}

// ── Drawer panel close (Escape) ────────────────────────────────────────
// The React `CampaignDrawer` owns the drawer DOM + its own Escape handler;
// this document-level listener mirrors it so the close contract is intact
// even though `init` binds it once (the drawer can open without re-init).
function bindEscapeForPanels(): void {
  if (_escBound) return;
  _escBound = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !getActivePanel()) return;
    if (document.querySelector(".modal-overlay")) return;
    e.stopPropagation();
    closePanel();
  });
}

function closePanel(): void {
  if (!getActivePanel()) return;
  setActivePanelRaw(null);
  render();
}

// ── Public React-shell bridge surface ──────────────────────────────────
// Every campaign tab body + drawer panel is React-owned (Phase D–F + the
// switch-plan island ports). The shell renders tabs via REACT_TAB_COMPONENTS
// and the drawer panels via `CampaignShell` `DrawerBody` / `shell/DrawerPanels`,
// so boot.ts no longer emits any main-body or drawer HTML string.
export function enableReactShell(): void {
  _reactShellEnabled = true;
}

// renderTabBody — kept on the bridge for backward compatibility. Phase F
// migrated every tab body to JSX, so the shell reads typed get<Tab>Data
// getters; this returns an empty string for every id now.
export function renderTabBody(): string {
  return "";
}

// Lightweight begin/end narrative modal used by generated and user-built
// quests (scenario-runner.js calls it). Authored "special" scenarios keep
// the full VN flow.
export function showQuestNarrative(payload: { phase?: string; title?: string; text?: string } = {}): unknown {
  if (typeof document === "undefined" || !document.body) return null;
  const ui = cjs().UI;
  if (!ui?.openModal) return null;
  const phase = String(payload.phase || "begin").toLowerCase();
  const title = payload.title || (phase === "end" ? "Quest complete" : "Quest begins");
  const rawText = String(payload.text || "").trim() || (phase === "end" ? "The quest is over." : "The quest begins.");
  const body = document.createElement("div");
  body.className = "campaign-quest-narrative " + (phase === "end" ? "is-end" : "is-begin");
  rawText.split(/\n{2,}/).forEach((para) => {
    const p = document.createElement("p");
    p.textContent = para.trim();
    body.appendChild(p);
  });
  const footer = document.createElement("div");
  const continueBtn = document.createElement("button");
  continueBtn.className = "btn btn-primary";
  continueBtn.textContent = phase === "end" ? "Wrap up" : "Begin";
  footer.appendChild(continueBtn);
  const overlay = ui.openModal({ title: "📜 " + title, content: body, footer, width: "460px" });
  continueBtn.onclick = () => ui.closeModal(overlay);
  return overlay;
}

// ── Action dispatch seam ───────────────────────────────────────────────
// React onClick → dispatchCampaignAction → here; the shell <main> + drawer
// click forwarders also funnel through this. Every CampaignActionName
// resolves through the TS registry on window.CJS.CampaignActionsRuntime.
export function handleAction(name: string, data: Record<string, unknown> = {}): unknown {
  const runtime = cjs().CampaignActionsRuntime;
  const action = String(name);
  return runtime?.has?.(action) ? runtime.run(action, { campaignAction: action, ...data }) : undefined;
}

// ── Chrome setters (write the TS slice, then render) ───────────────────
export function setActiveMode(mode: string, opts: { keepTab?: boolean } = {}): void {
  if (!mode) return;
  chromeSetActiveMode(mode, { keepTab: !!opts.keepTab, worldId: cjs().CampaignState?.getState()?.currentWorld });
  render();
}

export function setActiveTab(tab: string, opts: { keepMode?: boolean } = {}): void {
  if (!tab) return;
  chromeSetActiveTab(tab, { keepMode: !!opts.keepMode });
  render();
}

export function setActivePanel(panelId: string | null): void {
  chromeSetActivePanel(panelId);
  render();
}

// ── Notice + boot status getters ───────────────────────────────────────
export function getBootIncompatibleNotice(): BootIncompatibleNotice | null {
  return _bootIncompatibleNotice;
}
export function clearBootIncompatibleNotice(): void {
  _bootIncompatibleNotice = null;
}
export function isBooted(): boolean {
  return _booted;
}

// ── Install the window bridge ──────────────────────────────────────────
// Same surface campaign-ui.js's IIFE returned, so the React shell + the
// three remaining JS callers (pocket-haven, scenario-runner,
// data-hot-reload) keep working unchanged. The render-free chrome setters +
// getters forward straight to the chrome-state slice.
interface WindowCjs {
  CJS?: Record<string, unknown>;
}
const w = window as unknown as WindowCjs;
w.CJS = w.CJS || {};
(w.CJS as Record<string, unknown>).CampaignUI = Object.freeze({
  init,
  render,
  isBooted,
  showQuestNarrative,
  getBootIncompatibleNotice,
  clearBootIncompatibleNotice,
  renderTabBody,
  enableReactShell,
  handleAction,
  setActiveMode,
  setActiveTab,
  setActivePanel,
  setActiveModeRaw,
  setActiveTabRaw,
  modeForTab,
  getActiveTab,
  getActiveMode,
  getActivePanel
});
