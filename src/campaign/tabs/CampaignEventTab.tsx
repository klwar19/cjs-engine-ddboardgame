// CampaignEventTab.tsx — Phase F JSX port of `_renderEventTypeTab`.
//
// One component for all three event tabs (character / special / side).
// `kind` switches the kicker text and the meta line; `side` adds a
// Side Story Chains section. Quest-chain panels (active / available)
// still use HTML bridges until the G.14 port lands. Delivery + action
// pills on each entry are now full JSX (Phase G.9).

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getEventTabData,
  type EventTabData,
  type EventTabKind,
  type EventFileEntry,
  type EventTabQuestChains
} from "./data/eventTab";
import {
  EventResultPanel,
  SoloNoticePanel,
  PendingBattlePanel,
  CombatResultPanel,
  ActiveSequencePanel
} from "./ResultPanels";
import { SequenceDeliveryState, SequenceActionButton } from "./SequenceCard";
import { QuestChainActiveCard, QuestChainTemplateCard } from "./QuestChain";

interface Props {
  readonly state: CampaignStateSnapshot;
  readonly kind: EventTabKind;
}

export function CampaignEventTab({ state, kind }: Props) {
  const data = getEventTabData(kind, state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Event tab not ready.</div>
      </section>
    );
  }
  return (
    <div className="campaign-dashboard campaign-mode-home campaign-event-home">
      <EventTabHero data={data} />
      <ActiveSequencePanel state={state} scopes={["event"]} />
      <EventFilesPanel data={data} />
      {data.questChains && (
        <SideStoryChainsPanel chains={data.questChains} />
      )}
      <SoloNoticePanel state={state} />
      <PendingBattlePanel state={state} />
      <CombatResultPanel state={state} />
      <EventResultPanel state={state} />
    </div>
  );
}

function EventTabHero({ data }: { data: EventTabData }) {
  return (
    <section className="campaign-gacha-hero campaign-wide-panel is-event">
      <div className="campaign-gacha-hero-copy">
        <div className="campaign-gacha-kicker">{data.kicker}</div>
        <h2>{data.title}</h2>
        <p>{data.text}</p>
        <div className="campaign-chip-row">
          {data.meta.map((bit, i) => (
            <span key={i} className="campaign-chip">{bit}</span>
          ))}
        </div>
      </div>
      <div className="campaign-gacha-hero-actions">
        <HeroAction
          action="custom-event"
          label="Manual Event"
          hint="GM-authored event/consequence"
          kind="manual"
        />
        <HeroAction
          action="open-event-log"
          label="Event Log"
          hint="Read oracle/event bookkeeping"
        />
        <HeroAction
          action="open-story-summary"
          label="Story Log"
          hint="Read main-story context before choosing an event"
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

function EventFilesPanel({ data }: { data: EventTabData }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-home-focus">
      <div className="campaign-panel-head">
        <div>
          <h2>{data.kicker} Files</h2>
          <div className="campaign-muted">
            Event has three content tabs only: Character, Special, and Side Stories. Bookkeeping goes to Event Log.
          </div>
        </div>
        <span className="campaign-pill">{data.entryCount} files</span>
      </div>
      <div className="campaign-sequence-grid">
        {data.entries.length ? (
          data.entries.map((entry) => <EventFileCard key={entry.id} entry={entry} />)
        ) : (
          <div className="campaign-empty">{data.empty}</div>
        )}
      </div>
    </section>
  );
}

function EventFileCard({ entry }: { entry: EventFileEntry }) {
  return (
    <article className="campaign-sequence-card is-event">
      <div className="campaign-sequence-paper-pin" />
      <div className="campaign-sequence-kind">{entry.kindLabel}</div>
      <strong>{entry.title}</strong>
      {entry.summary && <p>{entry.summary}</p>}
      {entry.tagLabels.length > 0 && (
        <div className="campaign-chip-row">
          {entry.tagLabels.map((tag, i) => (
            <span key={i} className="campaign-chip">{tag}</span>
          ))}
        </div>
      )}
      <SequenceDeliveryState delivery={entry.delivery} />
      <SequenceActionButton action={entry.action} />
    </article>
  );
}

function SideStoryChainsPanel({ chains }: { chains: EventTabQuestChains }) {
  const hasActive = chains.activeCount > 0;
  const hasAvailable = chains.availableCount > 0;
  return (
    <section className="campaign-panel campaign-wide-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Side Story Chains</h2>
          <div className="campaign-muted">Existing side-story chains stay here, separate from normal quests.</div>
        </div>
        <span className="campaign-pill">
          {chains.activeCount} active | {chains.availableCount} available
        </span>
      </div>
      {hasActive ? (
        chains.active.map((chain) => (
          <QuestChainActiveCard key={chain.templateId} chain={chain} />
        ))
      ) : hasAvailable ? (
        <div className="campaign-tab-grid">
          {chains.available.map((chain) => (
            <QuestChainTemplateCard key={chain.id} chain={chain} />
          ))}
        </div>
      ) : (
        <div className="campaign-empty">No side-story chains available.</div>
      )}
    </section>
  );
}

// Tab-id-specific wrappers so the shell can register one component per tab.
export const CampaignEventHomeTab = ({ state }: { state: CampaignStateSnapshot }) =>
  <CampaignEventTab state={state} kind="character" />;

export const CampaignEventCharacterTab = ({ state }: { state: CampaignStateSnapshot }) =>
  <CampaignEventTab state={state} kind="character" />;

export const CampaignEventSpecialTab = ({ state }: { state: CampaignStateSnapshot }) =>
  <CampaignEventTab state={state} kind="special" />;

export const CampaignEventSideTab = ({ state }: { state: CampaignStateSnapshot }) =>
  <CampaignEventTab state={state} kind="side" />;
