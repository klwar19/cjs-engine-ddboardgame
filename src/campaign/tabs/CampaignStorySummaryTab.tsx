// CampaignStorySummaryTab.tsx — Phase F JSX port of `_renderStorySummary`.
//
// Renders the Story Log: a hero with story-action shortcuts, then four
// panels — completed story parts, manual GM notes, revealed facts, and
// held story beats. All read-only display; the only interactive bits
// are the three hero buttons.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getStorySummaryData,
  type StorySummaryData,
  type StoryPartEntry,
  type ManualNote,
  type RevealedFact,
  type HeldBeat
} from "./data/storySummary";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignStorySummaryTab({ state }: Props) {
  const data = getStorySummaryData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Story Log not ready.</div>
      </section>
    );
  }
  return (
    <div className="campaign-dashboard campaign-story-summary">
      <StoryLogHero data={data} />
      <StoryPartsPanel parts={data.storyParts} />
      <ManualNotesPanel notes={data.manual} />
      <FactsPanel facts={data.facts} />
      <HeldBeatsPanel beats={data.queue} />
    </div>
  );
}

function StoryLogHero({ data }: { data: StorySummaryData }) {
  return (
    <section className="campaign-gacha-hero campaign-wide-panel is-story">
      <div className="campaign-gacha-hero-copy">
        <div className="campaign-gacha-kicker">Story Log</div>
        <h2>Current Arc Summary</h2>
        <p>Readable memory for main-story parts, defaults, and GM-written story addenda. Event notes live in the separate Event Log.</p>
        <div className="campaign-chip-row">
          <span className="campaign-chip">{data.storyParts.length} story parts</span>
          <span className="campaign-chip">{data.manual.length} manual notes</span>
          <span className="campaign-chip">{data.facts.length} facts</span>
        </div>
      </div>
      <div className="campaign-gacha-hero-actions">
        <HeroAction
          action="open-story-home"
          label="Story Home"
          hint="Return to chapter play"
          kind="primary"
        />
        <HeroAction
          action="story-manual-note"
          label="Add Manual Scene"
          hint="Write a GM summary note"
        />
        <HeroAction
          action="story-copy-prompt"
          label="Copy Story Prompt"
          hint="Use current story state with AI"
        />
      </div>
    </section>
  );
}

function HeroAction({
  action,
  label,
  hint,
  kind
}: {
  action: string;
  label: string;
  hint: string;
  kind?: string;
}) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action)}
      title={hint}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}

function StoryPartsPanel({ parts }: { parts: readonly StoryPartEntry[] }) {
  return (
    <section className="campaign-panel campaign-wide-panel">
      <div className="campaign-panel-head">
        <h2>Completed Story Parts</h2>
        <span className="campaign-pill">{parts.length}</span>
      </div>
      {parts.length ? (
        parts.map((entry, i) => <StoryPartRow key={i} entry={entry} />)
      ) : (
        <div className="campaign-empty">No completed story sequence parts yet.</div>
      )}
    </section>
  );
}

function StoryPartRow({ entry }: { entry: StoryPartEntry }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>{entry.title}</strong>
        <div className="campaign-chip-row">
          {entry.chapterLabel && (
            <span className="campaign-chip">Chapter {entry.chapterLabel}</span>
          )}
          {entry.partLabel && <span className="campaign-chip">{entry.partLabel}</span>}
          <span className="campaign-chip">{entry.modeLabel}</span>
        </div>
        <div className="campaign-muted">
          {entry.result} | {entry.timestamp}
        </div>
        <p>{entry.summaryText}</p>
        {entry.routeText && (
          <div className="campaign-muted">Route: {entry.routeText}</div>
        )}
        {entry.syncSummary.length > 0 && (
          <div className="campaign-muted">State Sync: {entry.syncSummary.join(" | ")}</div>
        )}
      </div>
    </div>
  );
}

function ManualNotesPanel({ notes }: { notes: readonly ManualNote[] }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head"><h3>GM Manual Bookkeeping</h3></div>
      <div className="campaign-muted">
        These are hand-written main-story addenda, separate from oracle/event notes.
      </div>
      {notes.length ? (
        notes.map((entry, i) => (
          <div key={i} className="campaign-row">
            <div>
              <strong>{entry.title}</strong>
              <div className="campaign-muted">{entry.timestamp}</div>
              <p>{entry.text}</p>
            </div>
          </div>
        ))
      ) : (
        <div className="campaign-empty">Manual GM story addenda will appear here.</div>
      )}
    </section>
  );
}

function FactsPanel({ facts }: { facts: readonly RevealedFact[] }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head"><h3>Revealed Facts</h3></div>
      {facts.length ? (
        facts.map((fact, i) => (
          <div key={i} className="campaign-row">
            <div>
              <strong>{fact.title}</strong>
              <p>{fact.text}</p>
            </div>
          </div>
        ))
      ) : (
        <div className="campaign-empty">No revealed facts yet.</div>
      )}
    </section>
  );
}

function HeldBeatsPanel({ beats }: { beats: readonly HeldBeat[] }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head"><h3>Held Story Beats</h3></div>
      {beats.length ? (
        beats.map((beat, i) => (
          <div key={i} className="campaign-row">
            <div>
              <strong>{beat.title}</strong>
              <div className="campaign-muted">{beat.status}</div>
              <p>{beat.text}</p>
            </div>
          </div>
        ))
      ) : (
        <div className="campaign-empty">No held beats.</div>
      )}
    </section>
  );
}
