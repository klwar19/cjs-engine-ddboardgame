// StoryHomePanels.tsx — Phase G.12 JSX components for Story Home
// sub-panels: chapter tree, choice consequence, AI story context,
// story pipeline, and sync summary.

import { dispatchCampaignAction } from "../actions";
import type {
  ChapterTreeData,
  ChapterTreeNode,
  ChoiceConsequenceData,
  AlignmentAxis,
  AlignmentPotentialEntry,
  AiStoryContextData,
  StoryPipelineData,
  SyncSummaryData
} from "./data/storyHome";

export function ChapterTreePanel({ data }: { data: ChapterTreeData }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-chapter-tree-panel">
      <div className="campaign-panel-head">
        <div>
          <h3>Chapter Routes</h3>
          <div className="campaign-muted">
            Branches unlock from the choices you made. Locked rows show what you still need before they can play.
          </div>
        </div>
        <span className="campaign-pill">{data.routeCount} played</span>
      </div>
      <div className="campaign-route-trail" aria-label="Current route">
        <strong>Route taken:</strong>
        <span>{data.routeText}</span>
      </div>
      <div className="campaign-chapter-tree" role="tree" aria-label="Chapter tree">
        {data.roots.map((root) => (
          <ChapterTreeNodeView key={root.id} node={root} />
        ))}
      </div>
    </section>
  );
}

function ChapterTreeNodeView({ node }: { node: ChapterTreeNode }) {
  const cls = [
    "campaign-chapter-tree-node",
    `depth-${Math.min(node.depth, 4)}`,
    node.stateClass
  ];
  return (
    <div className={cls.join(" ")} role="treeitem" aria-level={node.depth + 1}>
      <div className="campaign-chapter-tree-row">
        <div className="campaign-chapter-tree-marker" aria-hidden="true" />
        <div className="campaign-chapter-tree-body">
          <div className="campaign-chapter-tree-head">
            <strong>{node.partLabel}</strong>
            <span>{node.title}</span>
            {node.routeLabel && (
              <span className="campaign-chip is-route">{node.routeLabel}</span>
            )}
            <span className={`campaign-pill ${node.stateClass}`}>{node.stateLabel}</span>
          </div>
          {node.summaryShort && (
            <div className="campaign-muted">{node.summaryShort}</div>
          )}
          {node.lockReasons && (
            <div className="campaign-muted is-warning">Unlock requires: {node.lockReasons}</div>
          )}
          {node.nextCandidates.length > 0 && (
            <div className="campaign-muted">Next: {node.nextCandidates.join(" / ")}</div>
          )}
          <div className="campaign-chapter-tree-actions">
            <ChapterAction node={node} />
          </div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="campaign-chapter-tree-children">
          {node.children.map((child) => (
            <ChapterTreeNodeView key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChapterAction({ node }: { node: ChapterTreeNode }) {
  if (node.blocked) {
    return <span className="campaign-pill is-update">In Update</span>;
  }
  if (node.locked) {
    return (
      <button
        className="campaign-action"
        disabled
        title={node.lockReasons || "Locked"}
      >
        Locked
      </button>
    );
  }
  return (
    <button
      className="campaign-action primary"
      onClick={() => dispatchCampaignAction("sequence-start", { id: node.id })}
    >
      {node.replayOnly ? "Read" : "Play"}
    </button>
  );
}

export function ChoiceConsequencePanel({ data }: { data: ChoiceConsequenceData }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-alignment-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Choice Consequences</h2>
          <div className="campaign-muted">
            Bin&rsquo;s soft leanings for dialogue gates, NPC reactions, quest unlocks, and future branches.
          </div>
        </div>
        <span className="campaign-pill">{data.potentialCount} possible points</span>
      </div>
      <div className="campaign-alignment-grid">
        {data.axes.map((axis) => (
          <AxisCard key={axis.id} axis={axis} />
        ))}
      </div>
      <div className="campaign-alignment-bottom">
        <div>
          <strong>Recent</strong>
          {data.recent.length > 0 ? (
            data.recent.map((entry, i) => (
              <div key={i} className="campaign-alignment-line">
                <strong>{entry.label}</strong>
                <span>{entry.description}</span>
              </div>
            ))
          ) : (
            <div className="campaign-muted">No consequence choices recorded yet.</div>
          )}
        </div>
        <div>
          <strong>Future Checks</strong>
          <div className="campaign-chip-row">
            {data.potential.length > 0 ? (
              data.potential.map((entry, i) => <PotentialChip key={i} entry={entry} />)
            ) : (
              <span className="campaign-muted">No authored potential points visible yet.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AxisCard({ axis }: { axis: AlignmentAxis }) {
  return (
    <div className="campaign-alignment-axis">
      <span>{axis.label}</span>
      <strong>{formatSigned(axis.currentValue)}</strong>
      <small>
        Here {formatSigned(axis.worldValue)} | possible {formatSigned(axis.rangeMin)}..{formatSigned(axis.rangeMax)}
      </small>
    </div>
  );
}

function PotentialChip({ entry }: { entry: AlignmentPotentialEntry }) {
  const cls = ["campaign-chip"];
  if (entry.reachable) cls.push("is-route");
  return (
    <span className={cls.join(" ")} title={entry.summary || undefined}>
      {entry.label} {entry.description}
    </span>
  );
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export function AiStoryContextPanel({ data }: { data: AiStoryContextData }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-ai-context-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>AI Story Context</h2>
          <div className="campaign-muted">
            Copy GM Prompt merges static summaries, low-token arc context, live GM notes, runtime branches, and consequence trackers.
          </div>
        </div>
        <span className="campaign-pill">{data.loaded}/{data.total} files</span>
      </div>
      <div className="campaign-ai-context-grid">
        <div>
          <strong>Static summaries</strong>
          {data.staticLines.map((line, i) => (
            <div key={i} className="campaign-muted">
              {line.path} - {line.statusLabel}
            </div>
          ))}
        </div>
        <div>
          <strong>Arc/event/quest index</strong>
          {data.indexLines.map((line, i) => (
            <div key={i} className="campaign-muted">
              {line.path} - {line.statusLabel}
            </div>
          ))}
          <div className="campaign-muted">
            {data.arcsCount} arc{data.arcsCount === 1 ? "" : "s"} with compact event, quest, branch, and consequence slots.
          </div>
        </div>
        <div>
          <strong>Live overlay</strong>
          <div className="campaign-muted">
            {data.manualCount} GM note{data.manualCount === 1 ? "" : "s"} and {data.branchCount} manual branch{data.branchCount === 1 ? "" : "es"} will be included after the markdown summary.
          </div>
          <div className="campaign-muted">
            If live GM notes disagree with a static summary, the prompt tells AI to treat the GM notes as newer table truth.
          </div>
        </div>
      </div>
    </section>
  );
}

export function StoryPipelinePanel({ data }: { data: StoryPipelineData }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Next Planned Parts</h3>
        <span className="campaign-pill">{data.nextCandidates.length}</span>
      </div>
      <div className="campaign-muted">
        {data.anchorTitle ? `Following ${data.anchorTitle}` : "Upcoming story delivery for this arc."}
      </div>
      {data.nextCandidates.length > 0 ? (
        <div className="campaign-chip-row">
          {data.nextCandidates.map((item, i) => (
            <span key={i} className="campaign-chip">{item}</span>
          ))}
        </div>
      ) : (
        <div className="campaign-empty">No next-part notes yet.</div>
      )}
    </section>
  );
}

export function SyncSummaryPanel({ data }: { data: SyncSummaryData }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{data.title}</h3>
        {data.sourcePill && <span className="campaign-pill">{data.sourcePill}</span>}
      </div>
      {data.lines.length > 0 ? (
        data.lines.map((line, i) => (
          <div key={i} className="campaign-row">
            <div>{line}</div>
          </div>
        ))
      ) : (
        <div className="campaign-empty">No quest, hub, or rumor sync notes for this part yet.</div>
      )}
    </section>
  );
}
