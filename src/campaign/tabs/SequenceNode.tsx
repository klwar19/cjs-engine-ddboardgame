// SequenceNode.tsx — Phase G.8 JSX port of `_renderSequenceNode`.
//
// The active-sequence body has 7 variants (choice, stat_check, combat,
// minigame, scenario, end, default narration/ops/condition). Each
// variant has its own action set. The bridge (`getActiveSequenceData`
// in campaign-ui.js) pre-resolves choice eligibility, alignment
// hints, replay-aware labels, and chip text so this component stays
// presentational.

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { memoDeep } from "../util/memo";
import type {
  SequenceNodeData,
  SequenceNodeChoice
} from "./data/resultPanels";

function SequenceNodePanelView({ node }: { node: SequenceNodeData }) {
  switch (node.type) {
    case "choice":
      return (
        <div className="campaign-story-dialogue-box">
          {node.speaker && (
            <span className="campaign-story-speaker">{node.speaker}</span>
          )}
          <p>{node.text}</p>
          <div className="campaign-action-grid">
            {node.choices.length > 0 ? (
              node.choices.map((choice) => (
                <ChoiceButton key={choice.id} choice={choice} />
              ))
            ) : (
              <div className="campaign-muted">No available choices right now.</div>
            )}
          </div>
        </div>
      );
    case "stat_check":
      return (
        <div className="campaign-story-dialogue-box">
          <p>{node.text}</p>
          <MetaChips bits={node.meta} />
          <div className="campaign-action-grid">
            <ActionBtn
              action="sequence-pass"
              label="Pass"
              hint="Route to pass node"
              kind="primary"
            />
            <ActionBtn
              action="sequence-fail"
              label="Fail"
              hint="Route to fail node"
              kind="danger"
            />
          </div>
        </div>
      );
    case "combat":
      return (
        <div className="campaign-story-dialogue-box">
          <p>{node.text}</p>
          <MetaChips bits={node.meta} />
          <div className="campaign-action-grid">
            {!node.replay && (
              <ActionBtn
                action="sequence-queue-battle"
                label="Queue Battle"
                hint={node.encounterId || node.battleSetId || "Open in combat/manual result"}
                kind="primary"
              />
            )}
            <ActionBtn
              action="sequence-win"
              label={node.replay ? "Continue as Win" : "Manual Win"}
              hint={node.replay ? "Advance without reapplying battle rewards or flags" : "Advance as victory"}
            />
            <ActionBtn
              action="sequence-lose"
              label={node.replay ? "Continue as Loss" : "Manual Loss"}
              hint={node.replay ? "Advance without reapplying defeat consequences" : "Advance as defeat"}
              kind="danger"
            />
          </div>
        </div>
      );
    case "minigame":
      return (
        <div className="campaign-story-dialogue-box">
          <p>{node.text}</p>
          <MetaChips bits={node.meta} />
          <div className="campaign-action-grid">
            {!node.replay && (
              <ActionBtn
                action="sequence-play-minigame"
                label="Play Mini-Game"
                hint={node.gameId ? `Open ${node.gameLabel}` : "Open the linked mini-game"}
                kind="primary"
              />
            )}
            <ActionBtn
              action="sequence-win"
              label={node.replay ? "Continue as Clear" : "Manual Clear"}
              hint={node.replay ? "Advance without replaying rewards or flags" : "Advance as mini-game success"}
            />
            <ActionBtn
              action="sequence-lose"
              label={node.replay ? "Continue as Fail" : "Manual Fail"}
              hint={node.replay ? "Advance without replaying failure penalties" : "Advance as mini-game failure"}
              kind="danger"
            />
          </div>
        </div>
      );
    case "scenario":
      return (
        <div className="campaign-story-dialogue-box">
          <p>{node.text}</p>
          <MetaChips bits={node.meta} />
          <div className="campaign-action-grid">
            {!node.replay && (
              <ActionBtn
                action={node.scenarioOpen ? "open-maps-tab" : "sequence-next"}
                label={node.scenarioOpen ? "Open Map" : "Start Exploration"}
                hint={node.scenarioId || "Launch the linked scenario"}
                kind="primary"
              />
            )}
            <ActionBtn
              action="sequence-win"
              label="Continue as Success"
              hint="Resume story after a successful run"
            />
            <ActionBtn
              action="sequence-lose"
              label="Continue as Failure"
              hint="Resume story after a failed run"
              kind="danger"
            />
            <ActionBtn
              action="sequence-abort"
              label="Abort Run"
              hint="Resume story as an aborted exploration"
            />
          </div>
        </div>
      );
    case "end":
      return (
        <div className="campaign-story-dialogue-box">
          <p>{node.text}</p>
          <button
            className="campaign-action primary"
            onClick={() => dispatchCampaignAction("sequence-complete")}
          >
            Complete
          </button>
        </div>
      );
    case "default": {
      const continueAction = node.kind === "condition" ? "sequence-resolve" : "sequence-next";
      const continueLabel = node.kind === "ops" ? (node.replay ? "Continue" : "Apply & Continue") : "Continue";
      return (
        <div className="campaign-story-dialogue-box">
          {node.speaker && (
            <span className="campaign-story-speaker">{node.speaker}</span>
          )}
          <p>{node.text}</p>
          <MetaChips bits={node.meta} />
          <div className="campaign-action-grid">
            <ActionBtn
              action={continueAction}
              label={continueLabel}
              hint={node.next}
              kind="primary"
            />
          </div>
        </div>
      );
    }
  }
}

function ChoiceButton({ choice }: { choice: SequenceNodeChoice }) {
  const cls = ["campaign-action"];
  if (choice.locked) cls.push("is-locked");
  if (choice.hint) cls.push("has-hint");
  return (
    <button
      className={cls.join(" ")}
      disabled={choice.locked}
      title={choice.hint || undefined}
      onClick={() => dispatchCampaignAction("sequence-choice", { choice: choice.id })}
    >
      <span className="campaign-action-label">{choice.label}</span>
      {choice.hint && <small className="campaign-action-hint">{choice.hint}</small>}
    </button>
  );
}

function MetaChips({ bits }: { bits: readonly string[] }) {
  if (bits.length === 0) return null;
  return (
    <div className="campaign-chip-row">
      {bits.map((bit, i) => (
        <span key={i} className="campaign-chip">{bit}</span>
      ))}
    </div>
  );
}

function ActionBtn({
  action,
  label,
  hint,
  kind,
  disabled
}: {
  action: CampaignActionName;
  label: string;
  hint: string;
  kind?: string;
  disabled?: boolean;
}) {
  const cls = ["campaign-action"];
  if (kind) cls.push(kind);
  if (hint) cls.push("has-hint");
  return (
    <button
      className={cls.join(" ")}
      disabled={disabled}
      title={hint || undefined}
      onClick={() => dispatchCampaignAction(action)}
    >
      <span className="campaign-action-label">{label}</span>
      {hint && <small className="campaign-action-hint">{hint}</small>}
    </button>
  );
}

// The active-sequence node body. Memoized by value so an unrelated state
// change (e.g. a log line) doesn't re-render the whole node subtree when the
// node snapshot is unchanged.
export const SequenceNodePanel = memoDeep(SequenceNodePanelView);
