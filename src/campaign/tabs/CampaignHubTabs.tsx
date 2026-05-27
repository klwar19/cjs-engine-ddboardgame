import { Fragment } from "react";
import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { QuestChainActiveCard, QuestChainTemplateCard } from "./QuestChain";
import {
  getQuestChainsData,
  getBattleSetsData,
  getMapSeedsData,
  type SideStoryFlowGuide,
  type QuestChainResolved,
  type BattleSetCard,
  type MapSeedCard
} from "./data/hub";

// Hub-family tabs. Battle Sets, Map Seeds, and Quest Chains are full
// JSX (K.3), reading typed data from `getBattleSetsData` /
// `getMapSeedsData` / `getQuestChainsData`.
//
// Side Forge / Oracle Forge are still produced as HTML strings by
// `cui-hub-tab.js`; the wrappers below own the mount points until their
// K.3 commit lands. Every `data-campaign-action` inside those two still
// reaches the vanilla event delegator on campaign-root.

interface HubTabModule {
  readonly renderSideForge: (state: CampaignStateSnapshot, helpers: unknown) => string;
  readonly renderOracleForge: (state: CampaignStateSnapshot) => string;
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

// ── Quest Chains / Event Side Stories (K.3 JSX port) ───────────────
export function CampaignQuestChainsTab({ state }: Props) {
  const data = getQuestChainsData(state);
  if (!data) return fallback("Quest chains UI not loaded.");
  return (
    <div className="campaign-tab-grid">
      <section className="campaign-panel campaign-wide-panel">
        <div className="campaign-panel-head">
          <h2>Event Side Stories</h2>
          <span className="campaign-pill">
            {data.activeCount} active · {data.availableCount} available
          </span>
        </div>
        {data.flowGuide && <SideStoryFlowGuideView guide={data.flowGuide} />}
        {data.active.length === 0 ? (
          <div className="campaign-empty">
            No active side stories. Start one below or use Normal Quest for a single farming run.
          </div>
        ) : (
          data.active.map((chain) => (
            <QuestChainActiveCard key={chain.templateId} chain={chain} />
          ))
        )}
        {data.finished.length > 0 && (
          <details className="campaign-resolved-quests">
            <summary>Resolved side stories ({data.finished.length})</summary>
            {data.finished.map((chain, i) => (
              <QuestChainResolvedRow key={i} chain={chain} />
            ))}
          </details>
        )}
      </section>
      {data.available.length === 0 ? (
        <section className="campaign-panel campaign-wide-panel">
          <div className="campaign-empty">
            No side-story templates available for this world. Add some in the editor or import a side content pack.
          </div>
        </section>
      ) : (
        data.available.map((chain) => (
          <QuestChainTemplateCard key={chain.id} chain={chain} />
        ))
      )}
    </div>
  );
}

function SideStoryFlowGuideView({ guide }: { guide: SideStoryFlowGuide }) {
  return (
    <div className="campaign-side-story-guide">
      <span className="campaign-impact-badge is-plot">Side Story VN</span>
      <strong>{guide.title}</strong>
      <span>{guide.summary}</span>
      {guide.phases.length > 0 && <span>{guide.phases.join(" → ")}</span>}
    </div>
  );
}

function QuestChainResolvedRow({ chain }: { chain: QuestChainResolved }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>{chain.title}</strong>
        <div className="campaign-muted">
          {chain.statusLabel} at phase {chain.phaseLabel}
        </div>
      </div>
    </div>
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

// ── Battle Sets (K.3 JSX port) ─────────────────────────────────────
export function CampaignBattleSetsTab({ state }: Props) {
  const data = getBattleSetsData(state);
  if (!data) return fallback("Battle sets UI not loaded.");
  return (
    <div className="campaign-tab-grid">
      {data.cards.length === 0 ? (
        <div className="campaign-empty">No battle set cards.</div>
      ) : (
        data.cards.map((card) => <BattleSetCardView key={card.id} card={card} />)
      )}
    </div>
  );
}

function BattleSetCardView({ card }: { card: BattleSetCard }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{card.name}</h3>
        <span className={`campaign-risk ${card.canonRiskClass}`}>{card.canonRisk}</span>
      </div>
      <div className="campaign-muted">Rank {card.rank} | {card.objective}</div>
      <div className="campaign-chip-row">
        {card.tags.map((tag, i) => (
          <span key={i} className="campaign-chip">{tag}</span>
        ))}
      </div>
      <div className="campaign-preview">
        <b>Enemy Mix</b>
        <br />
        {card.enemyMix.length === 0
          ? "Manual enemy mix"
          : card.enemyMix.map((enemy, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {enemy.qty}x {enemy.label}
              </Fragment>
            ))}
      </div>
      <div className="campaign-muted">{card.gimmick}</div>
      <div className="campaign-action-grid">
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("queue-battle-set", { id: card.id })}
        >
          {card.queueLabel}
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("save-battle-card", { id: card.id })}
        >
          Save Idea
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("copy-battle-card", { id: card.id })}
        >
          Copy
        </button>
      </div>
    </section>
  );
}

// ── Map Seeds (K.3 JSX port) ───────────────────────────────────────
export function CampaignMapSeedsTab({ state }: Props) {
  const data = getMapSeedsData(state);
  if (!data) return fallback("Map seeds UI not loaded.");
  return (
    <div className="campaign-tab-grid">
      {data.seeds.length === 0 ? (
        <div className="campaign-empty">No map seeds.</div>
      ) : (
        data.seeds.map((seed) => <MapSeedCardView key={seed.id} seed={seed} />)
      )}
    </div>
  );
}

function MapSeedCardView({ seed }: { seed: MapSeedCard }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{seed.name}</h3>
        <span className={`campaign-risk ${seed.canonRiskClass}`}>{seed.canonRisk}</span>
      </div>
      <div className="campaign-muted">{seed.purpose}</div>
      {seed.nodes.map((node, i) => (
        <div key={i} className="campaign-step">
          <b>{i + 1}. {node.name}</b>
          <span>{node.detail}</span>
        </div>
      ))}
      <div className="campaign-action-grid">
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("save-map-seed", { id: seed.id })}
        >
          Save Idea
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("copy-map-seed", { id: seed.id })}
        >
          Copy
        </button>
      </div>
    </section>
  );
}
