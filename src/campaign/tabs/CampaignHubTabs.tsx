import { Fragment } from "react";
import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { QuestChainActiveCard, QuestChainTemplateCard } from "./QuestChain";
import { SideCard, RumorRow, HtmlBridge } from "./SideContent";
import { SoloNoticePanel } from "./ResultPanels";
import {
  getSideForgeData,
  getOracleForgeData,
  getQuestChainsData,
  getBattleSetsData,
  getMapSeedsData,
  type SideStoryFlowGuide,
  type QuestChainResolved,
  type BattleSetCard,
  type MapSeedCard
} from "./data/hub";

// Hub-family tabs — fully ported to JSX in Phase K.3. Each reads typed
// data from a `get*Data` bridge in campaign-ui.js and dispatches actions
// through direct onClick handlers (no data-campaign-action HTML strings).
// The shared SideCard / RumorRow live in `SideContent.tsx`; the chain
// cards in `QuestChain.tsx`.

interface Props {
  readonly state: CampaignStateSnapshot;
}

function fallback(label: string) {
  return (
    <section className="campaign-panel">
      <div className="campaign-empty">{label}</div>
    </section>
  );
}

// ── Side Forge / Living Hub dashboard ──────────────────────────────
export function CampaignSideForgeTab({ state }: Props) {
  const data = getSideForgeData(state);
  if (!data) return fallback("Side forge UI not loaded.");
  return (
    <div className="campaign-dashboard side-forge">
      <section className="campaign-panel side-forge-hero">
        <div className="campaign-panel-head">
          <div>
            <h2>{data.hubName}</h2>
            <div className="campaign-muted">{data.hubDescription}</div>
          </div>
          <span className="campaign-pill">{data.moodLabel}</span>
        </div>
        <div className="campaign-stat-grid">
          <span>Security <b>{data.stats.security}</b></span>
          <span>Prosperity <b>{data.stats.prosperity}</b></span>
          <span>Warmth <b>{data.stats.warmth}</b></span>
          <span>Weirdness <b>{data.stats.weirdness}</b></span>
        </div>
        <div className="campaign-control-help">
          Roll a pulse table for a flavorful idea, or roll a quest / rumor hook. Each result lands in the floating box and only commits when you accept it.
        </div>
        <div className="campaign-action-grid">
          <button className="campaign-action primary" title="Roll the general hub pulse table - gossip, mood, mundane problems." onClick={() => dispatchCampaignAction("roll-hub-pulse", { table: "town" })}>Hub Pulse</button>
          <button className="campaign-action" title="Roll the adventurer guild table — contracts, recruits, factions." onClick={() => dispatchCampaignAction("roll-hub-pulse", { table: "guild" })}>Guild</button>
          <button className="campaign-action" title="Apply for a rank-up trial at the Adventurer Guild." onClick={() => dispatchCampaignAction("rank-up-apply")}>Rank Up</button>
          <button className="campaign-action" title="Roll the tavern table — gossip, suppliers, drinking-spot drama." onClick={() => dispatchCampaignAction("roll-hub-pulse", { table: "tavern" })}>Tavern</button>
          <button className="campaign-action" title="Roll the forge / craft table — weapons, materials, smith requests." onClick={() => dispatchCampaignAction("roll-hub-pulse", { table: "forge" })}>Forge</button>
          <button className="campaign-action" title="Roll the weirdness table — ominous omens, supernatural beats." onClick={() => dispatchCampaignAction("roll-hub-pulse", { table: "weird" })}>Weird</button>
          <button className="campaign-action" title="Pick a random quest template and auto-start its map run." onClick={() => dispatchCampaignAction("random-quest-offer")}>Quest Run</button>
          <button className="campaign-action" title="Create a marked lead. Mechanics only happen when you promote it later." onClick={() => dispatchCampaignAction("random-rumor-offer")}>Rumor Hook</button>
          <button className="campaign-action" title="Type a custom rumor / lead into the hub bank." onClick={() => dispatchCampaignAction("manual-rumor")}>Manual Rumor</button>
          <button className="campaign-action" title="Roll a GM inspiration prompt — text only, no mechanics." onClick={() => dispatchCampaignAction("roll-forge-oracle")}>Oracle</button>
        </div>
      </section>

      <SoloNoticePanel />
      {data.lastCard && <SideCard card={data.lastCard} />}

      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h3>Hub Problems</h3>
          <span className="campaign-muted">Pressure cards on this hub. Resolve them by spending phases or addressing the cause.</span>
        </div>
        <HtmlBridge html={data.problemPurposeHtml} className="campaign-inline-purpose-bridge" />
        {data.problems.length === 0 ? (
          <div className="campaign-empty">No active hub problems.</div>
        ) : (
          data.problems.map((problem) => (
            <div key={problem.id} className="campaign-row">
              <strong>{problem.label}</strong>
              <button
                className="campaign-action"
                title="Mark this problem solved. Frees Pressure budget."
                onClick={() => dispatchCampaignAction("resolve-hub-problem", { id: problem.id, hubId: data.hubId })}
              >
                Resolve
              </button>
            </div>
          ))
        )}
      </section>

      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h3>Rumors</h3>
          <button className="campaign-action" onClick={() => dispatchCampaignAction("manual-rumor")}>Add Rumor</button>
        </div>
        <div className="campaign-rumor-purpose">
          <span className="campaign-impact-badge is-plot">Rumor purpose</span>
          <span>Rumors are parked leads, not current events. Collect whispers now, check canon risk, then promote one later into a quest, event, map seed, character beat, oracle prompt, or hub problem when the party is ready.</span>
        </div>
        {data.rumors.length === 0 ? (
          <div className="campaign-empty">No open rumors.</div>
        ) : (
          data.rumors.map((rumor) => <RumorRow key={rumor.id} rumor={rumor} />)
        )}
      </section>

      <section className="campaign-panel">
        <div className="campaign-panel-head"><h3>Saved Ideas</h3></div>
        {data.savedIdeas.length === 0 ? (
          <div className="campaign-empty">No saved ideas yet.</div>
        ) : (
          data.savedIdeas.map((idea) => <SideCard key={idea.id} card={idea} />)
        )}
      </section>

      <section className="campaign-panel review-panel">
        <div className="campaign-panel-head"><h3>Review Queue</h3></div>
        {data.review.length === 0 ? (
          <div className="campaign-empty">No pending review.</div>
        ) : (
          data.review.map((item) => (
            <div key={item.id} className="campaign-row">
              <div>
                <strong>{item.contentId}</strong>
                <div className="campaign-muted">{item.reason}</div>
              </div>
              <div className="campaign-row-actions">
                <span className={`campaign-risk ${item.canonRiskClass}`}>{item.canonRisk}</span>
                <button
                  className="campaign-action"
                  onClick={() => dispatchCampaignAction("review-resolve", { id: item.id, decision: "approved" })}
                >
                  Approve
                </button>
                <button
                  className="campaign-action campaign-action-reject"
                  title="Reject this content. It will not be added."
                  onClick={() => dispatchCampaignAction("review-resolve", { id: item.id, decision: "rejected" })}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="campaign-panel">
        <div className="campaign-panel-head"><h3>Side History</h3></div>
        {data.history.length === 0 ? (
          <div className="campaign-empty">No side content history.</div>
        ) : (
          data.history.map((line, i) => (
            <div key={i} className="campaign-log-line">
              <span>{line.title}: {line.result}</span>
              <small>Phase {line.phaseLabel}</small>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

// ── Oracle / Keyword Forge ─────────────────────────────────────────
export function CampaignOracleForgeTab({ state }: Props) {
  const data = getOracleForgeData(state);
  if (!data) return fallback("Oracle forge UI not loaded.");
  return (
    <div className="campaign-dashboard">
      <section className="campaign-panel">
        <div className="campaign-panel-head"><h2>Oracle / Keyword Forge</h2></div>
        <HtmlBridge html={data.purposeHtml} className="campaign-inline-purpose-bridge" />
        <div className="campaign-muted">{data.tableNames}</div>
        <div className="campaign-action-grid">
          <button className="campaign-action primary" onClick={() => dispatchCampaignAction("roll-forge-oracle")}>Roll Oracle</button>
          <button className="campaign-action" onClick={() => dispatchCampaignAction("import-side-pack")}>Import Pack</button>
          <button className="campaign-action" onClick={() => dispatchCampaignAction("export-side-pack")}>Export Save Ideas</button>
        </div>
      </section>
      {data.lastCard && <SideCard card={data.lastCard} />}
    </div>
  );
}

// ── Quest Chains / Event Side Stories ──────────────────────────────
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

// ── Battle Sets ────────────────────────────────────────────────────
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

// ── Map Seeds ──────────────────────────────────────────────────────
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
