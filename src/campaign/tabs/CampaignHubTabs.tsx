import type { CampaignStateSnapshot } from "../store";

// The hub-family tabs (sideForge / questChains / oracleForge /
// battleSets / mapSeeds) are produced as complete HTML strings by the
// existing `cui-hub-tab.js` module. The React wrappers below own the
// mount points so a follow-up commit can replace each renderer with
// JSX in isolation; today every `data-campaign-action` inside still
// reaches the vanilla event delegator on campaign-root.

interface HubTabModule {
  readonly renderSideForge: (state: CampaignStateSnapshot, helpers: unknown) => string;
  readonly renderQuestChains: () => string;
  readonly renderOracleForge: (state: CampaignStateSnapshot) => string;
  readonly renderBattleSets: () => string;
  readonly renderMapSeeds: () => string;
}

interface CampaignUIModule {
  readonly getTabHelpers: () => unknown;
}

interface Cjs {
  readonly CampaignUIInternal?: { readonly HubTab?: HubTabModule };
  readonly CampaignUI?: CampaignUIModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

function wrap(html: string, mountClass: string) {
  return <div className={mountClass} dangerouslySetInnerHTML={{ __html: html }} />;
}

function fallback(label: string) {
  return (
    <section className="campaign-panel">
      <div className="campaign-empty">{label}</div>
    </section>
  );
}

function safeRender(label: string, fn: () => string): string {
  try {
    return fn();
  } catch (error) {
    console.error(`${label} failed:`, error);
    return `<section class="campaign-panel"><div class="campaign-empty">${label} render failed.</div></section>`;
  }
}

export function CampaignSideForgeTab({ state }: Props) {
  const HubTab = cjs().CampaignUIInternal?.HubTab;
  const UI = cjs().CampaignUI;
  if (!HubTab?.renderSideForge || !UI) return fallback("Side forge UI not loaded.");
  return wrap(
    safeRender("renderSideForge", () => HubTab.renderSideForge(state, UI.getTabHelpers())),
    "campaign-side-forge-react"
  );
}

export function CampaignQuestChainsTab(_props: Props) {
  const HubTab = cjs().CampaignUIInternal?.HubTab;
  if (!HubTab?.renderQuestChains) return fallback("Quest chains UI not loaded.");
  return wrap(
    safeRender("renderQuestChains", () => HubTab.renderQuestChains()),
    "campaign-quest-chains-react"
  );
}

export function CampaignOracleForgeTab({ state }: Props) {
  const HubTab = cjs().CampaignUIInternal?.HubTab;
  if (!HubTab?.renderOracleForge) return fallback("Oracle forge UI not loaded.");
  return wrap(
    safeRender("renderOracleForge", () => HubTab.renderOracleForge(state)),
    "campaign-oracle-forge-react"
  );
}

export function CampaignBattleSetsTab(_props: Props) {
  const HubTab = cjs().CampaignUIInternal?.HubTab;
  if (!HubTab?.renderBattleSets) return fallback("Battle sets UI not loaded.");
  return wrap(
    safeRender("renderBattleSets", () => HubTab.renderBattleSets()),
    "campaign-battle-sets-react"
  );
}

export function CampaignMapSeedsTab(_props: Props) {
  const HubTab = cjs().CampaignUIInternal?.HubTab;
  if (!HubTab?.renderMapSeeds) return fallback("Map seeds UI not loaded.");
  return wrap(
    safeRender("renderMapSeeds", () => HubTab.renderMapSeeds()),
    "campaign-map-seeds-react"
  );
}
