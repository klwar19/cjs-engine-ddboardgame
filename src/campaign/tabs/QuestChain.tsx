// QuestChain.tsx — Phase G.14 JSX components for the EventTab
// side-story chain cards (active + template). The shared VN panel,
// step cards, and stakes preview render from typed bridge data.

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import type {
  QuestChainActiveData,
  QuestChainTemplateData,
  QuestChainStep,
  QuestChainStakes,
  QuestChainVnPanel
} from "./data/eventTab";

export function QuestChainActiveCard({ chain }: { chain: QuestChainActiveData }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>{chain.title}</strong>
        <div className="campaign-muted">
          {chain.status} | Step {chain.stepIndex}/{chain.stepCount}: {chain.stepLabel}
        </div>
        {chain.currentStepDetail && <QuestChainStepDetail step={chain.currentStepDetail} />}
        {chain.contextTags.length > 0 && (
          <div className="campaign-chip-row campaign-context-tags">
            {chain.contextTags.map((tag, i) => (
              <span key={i} className="campaign-chip">{tag}</span>
            ))}
          </div>
        )}
        {chain.currentStepDetail && chain.currentStepDetail.pulseHints.length > 0 && (
          <div className="campaign-quest-pulse">
            {chain.currentStepDetail.pulseHints.map((hint, i) => (
              <span key={i}>{hint}</span>
            ))}
          </div>
        )}
        <QuestChainVnPanelView vn={chain.vnPanel} />
        <QuestChainStakesView stakes={chain.stakes} />
      </div>
      <div className="campaign-row-actions">
        <ActionBtn action="chain-scenario" id={chain.templateId} kind="primary">Map Run</ActionBtn>
        <ActionBtn action="chain-battle" id={chain.templateId}>Battle</ActionBtn>
        <ActionBtn action="advance-chain" id={chain.templateId}>Complete Step</ActionBtn>
        <ActionBtn action="complete-chain" id={chain.templateId}>Resolve</ActionBtn>
        <ActionBtn action="fail-chain" id={chain.templateId} kind="danger">Fail</ActionBtn>
      </div>
    </div>
  );
}

export function QuestChainTemplateCard({ chain }: { chain: QuestChainTemplateData }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{chain.title}</h3>
        <span className={`campaign-risk ${chain.canonRiskClass}`}>{chain.canonRisk}</span>
      </div>
      <div className="campaign-muted">{chain.summary}</div>
      <QuestChainVnPanelView vn={chain.vnPanel} />
      <div className="campaign-chip-row">
        {chain.tags.map((tag, i) => (
          <span key={i} className="campaign-chip">{tag}</span>
        ))}
      </div>
      <QuestChainStakesView stakes={chain.stakes} />
      {chain.steps.map((step, i) => (
        <div key={step.id || i} className="campaign-step">
          <b>{i + 1}. {step.label}</b>
          <QuestChainStepDetail step={step} />
          {step.pulseHints.length > 0 && (
            <div className="campaign-quest-pulse">
              {step.pulseHints.map((hint, h) => (
                <span key={h}>{hint}</span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="campaign-action-grid">
        <ActionBtn action="start-chain" id={chain.id} kind="primary">Start Quest Run</ActionBtn>
        <ActionBtn action="save-chain" id={chain.id}>Save Idea</ActionBtn>
        <ActionBtn action="promote-chain" id={chain.id}>Add To Quests</ActionBtn>
      </div>
    </section>
  );
}

function QuestChainStepDetail({ step }: { step: QuestChainStep }) {
  return (
    <>
      {step.meta.length > 0 && (
        <div className="campaign-muted">{step.meta.join(" | ")}</div>
      )}
      {step.text && <span>{step.text}</span>}
      {step.systems.length > 0 && (
        <div className="campaign-chip-row">
          {step.systems.map((sys, i) => (
            <span key={i} className="campaign-chip">{sys}</span>
          ))}
        </div>
      )}
      {step.detailLines.length > 0 && (
        <div className="campaign-muted">{step.detailLines.join(" | ")}</div>
      )}
    </>
  );
}

function QuestChainVnPanelView({ vn }: { vn: QuestChainVnPanel }) {
  return (
    <div className="campaign-side-story-vn">
      <div className="campaign-side-story-scene">
        <span className="campaign-impact-badge is-plot">{vn.badgeLabel}</span>
        <strong>{vn.title}</strong>
        <p>{vn.text}</p>
        {vn.systems.length > 0 && (
          <div className="campaign-chip-row">
            {vn.systems.map((sys, i) => (
              <span key={i} className="campaign-chip">{sys}</span>
            ))}
          </div>
        )}
      </div>
      <div className="campaign-side-story-meta">
        <span><b>Plot</b> {vn.plot}</span>
        <span><b>Characters</b> {vn.characters}</span>
        <span><b>Control</b> Start map, battle manually, complete step, resolve, or fail.</span>
      </div>
      <div className="campaign-side-story-steps">
        {vn.steps.map((step, i) => {
          const cls = step.state === "current" ? "is-current" : step.state === "done" ? "is-done" : "";
          return (
            <span key={i} className={cls}>
              <b>{step.index}</b>{step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function QuestChainStakesView({ stakes }: { stakes: QuestChainStakes }) {
  return (
    <div className="campaign-preview">
      <b>Run</b>: {stakes.runLine}
      <br />
      {stakes.rewardLine && (
        <>
          <b>Reward</b>: {stakes.rewardLine}
          <br />
        </>
      )}
      <b>If failed</b>: {stakes.failureLine}
    </div>
  );
}

function ActionBtn({
  action,
  id,
  kind,
  children
}: {
  action: CampaignActionName;
  id: string;
  kind?: string;
  children: React.ReactNode;
}) {
  const cls = ["campaign-action"];
  if (kind) cls.push(kind);
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action, { id })}
    >
      {children}
    </button>
  );
}
