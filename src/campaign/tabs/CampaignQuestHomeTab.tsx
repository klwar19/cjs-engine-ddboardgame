// CampaignQuestHomeTab.tsx — Phase F JSX port of `_renderQuestHome`.
//
// Renders the Quest Home tab. Two variants:
//   • Zombie world: a special scavenge-focused dashboard. Still
//     rendered as one HTML chunk via `zombieHtml`; will migrate to JSX
//     when the zombie scavenge variant gets its own port.
//   • Normal worlds: hero card with shortcut actions, a Quest Types
//     panel (3 cards: daily / normal / story), an Active Quests
//     list (per-row HTML for now), Quest Run Tools, plus the shared
//     read-only sub-panels (solo notice, scenario summary, pending
//     battle, combat result, last report).
//
// Every JSX-owned button uses direct onClick handlers via
// dispatchCampaignAction. Per-quest rows still come through the
// HTML bridge until `_renderQuestRow` migrates.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getQuestHomeData, type QuestHomeData, type QuestPaperLite } from "./data/questHome";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignQuestHomeTab({ state }: Props) {
  const data = getQuestHomeData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Quest Home not ready.</div>
      </section>
    );
  }
  if (data.isZombie === true) {
    // Zombie-world variant still renders as one HTML chunk. Will get
    // its own JSX port (and the matching `_renderZombieScavengeHome`
    // helper will drop) when the zombie tab migrates.
    return (
      <div
        className="campaign-quest-home-zombie-bridge"
        dangerouslySetInnerHTML={{ __html: data.zombieHtml }}
      />
    );
  }
  return <NormalQuestHome data={data} />;
}

function NormalQuestHome({ data }: { data: Extract<QuestHomeData, { isZombie: false }> }) {
  return (
    <div className="campaign-dashboard campaign-mode-home campaign-quest-home">
      <QuestHomeHero data={data} />
      <HtmlBridge html={data.activeSequenceHtml} className="campaign-active-sequence-bridge" />
      <QuestTypesPanel data={data} />
      <ActiveQuestsPanel rows={data.activeQuestRows} activeCount={data.activeCount} />
      <QuestRunTools data={data} />
      <HtmlBridge html={data.soloNoticeHtml} className="campaign-solo-notice-bridge" />
      <HtmlBridge html={data.scenarioSummaryHtml} className="campaign-scenario-summary-bridge" />
      <HtmlBridge html={data.pendingBattleHtml} className="campaign-pending-battle-bridge" />
      <HtmlBridge html={data.combatResultHtml} className="campaign-combat-result-bridge" />
      <HtmlBridge html={data.lastReportHtml} className="campaign-last-report-bridge" />
    </div>
  );
}

function HtmlBridge({ html, className }: { html: string; className: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function QuestHomeHero({ data }: { data: Extract<QuestHomeData, { isZombie: false }> }) {
  const title = data.hasNextQuest ? data.nextQuestTitle : "Daily, Normal, Story Quest";
  const text = data.hasNextQuest
    ? (data.nextQuestSummary || "Continue the current request, then use its row for map, battle, harvest, hub, or check progress.")
    : "Quest keeps repeatable work, random/flavored jobs, and one-time or chapter-repeat quest papers in one place.";
  return (
    <section className="campaign-gacha-hero campaign-wide-panel is-quest">
      <div className="campaign-gacha-hero-copy">
        <div className="campaign-gacha-kicker">Quest</div>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="campaign-chip-row">
          <span className="campaign-chip">{data.activeCount} active</span>
          <span className="campaign-chip">{data.finishedCount} resolved</span>
          <span className="campaign-chip">{data.templateCount} templates</span>
        </div>
      </div>
      <div className="campaign-gacha-hero-actions">
        <HeroAction action="add-quest" label="Create Quest" hint="Manual quest builder for one-time or repeatable work" kind="primary" />
        <HeroAction action="random-quest-offer" label="Normal / Random" hint="Roll a context-flavored quest template" />
        <HeroAction action="open-quests-tab" label="Tracker" hint="See all active and resolved quests" />
        <HeroAction
          action="open-maps-tab"
          label={data.hasRun ? "Current Run" : "Map"}
          hint={data.hasRun ? "Continue the active quest/map run" : "No active map run yet"}
        />
      </div>
    </section>
  );
}

function QuestTypesPanel({ data }: { data: Extract<QuestHomeData, { isZombie: false }> }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-quest-type-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Quest Types</h2>
          <div className="campaign-muted">
            Only three buckets: daily reset work, normal/random jobs, and story quests that are one-time or return on chapter beats.
          </div>
        </div>
        <span className="campaign-pill">{data.paperCount} papers</span>
      </div>
      <div className="campaign-tab-grid">
        <DailyCard papers={data.dailyPapers} />
        <NormalCard papers={data.normalPapers} hasNextQuest={data.hasNextQuest} nextQuestTitle={data.nextQuestTitle} />
        <StoryCard papers={data.storyPapers} />
      </div>
    </section>
  );
}

function DailyCard({ papers }: { papers: readonly QuestPaperLite[] }) {
  return (
    <article className="campaign-sequence-card is-quest">
      <div className="campaign-sequence-kind">Daily Quest</div>
      <strong>Reset by Phase</strong>
      <p>Small chores, kill counts, harvests, hub errands, or mini-game results. Light flavor only.</p>
      <div className="campaign-action-grid">
        {papers.length ? (
          papers.map((p) => <QuestPaperButton key={p.id} paper={p} />)
        ) : (
          <ActionButton
            action="random-quest-offer"
            label="Roll Daily Style"
            hint="Use a normal quest template as a light daily job"
          />
        )}
        <ActionButton
          action="pass-phase"
          label="Pass Phase"
          hint="Refresh daily/repeatable quest timing"
        />
      </div>
    </article>
  );
}

function NormalCard({
  papers,
  hasNextQuest,
  nextQuestTitle
}: {
  papers: readonly QuestPaperLite[];
  hasNextQuest: boolean;
  nextQuestTitle: string;
}) {
  return (
    <article className="campaign-sequence-card is-quest">
      <div className="campaign-sequence-kind">Normal / Random</div>
      <strong>Context Job</strong>
      <p>Random picks should match rank, plot, tags, and the current monster context.</p>
      <div className="campaign-action-grid">
        {papers.map((p) => <QuestPaperButton key={p.id} paper={p} />)}
        <ActionButton
          action="random-quest-offer"
          label="Roll Quest"
          hint="Create a flavored random quest"
          kind="primary"
        />
        <ActionButton
          action="generate-quest-scenario"
          label="Map for Active"
          hint={hasNextQuest ? `Build a fresh map for "${nextQuestTitle}"` : "Add a quest first"}
          disabled={!hasNextQuest}
        />
      </div>
    </article>
  );
}

function StoryCard({ papers }: { papers: readonly QuestPaperLite[] }) {
  return (
    <article className="campaign-sequence-card is-quest">
      <div className="campaign-sequence-kind">Story Quest</div>
      <strong>One-Time / Chapter Beat</strong>
      <p>Authored quest content that can appear once, or return when the chapter/beat changes.</p>
      <div className="campaign-action-grid">
        {papers.length ? (
          papers.map((p) => <QuestPaperButton key={p.id} paper={p} />)
        ) : (
          <ActionButton
            action="add-quest"
            label="Create Story Quest"
            hint="Add a one-time or chapter-repeat quest"
          />
        )}
      </div>
    </article>
  );
}

function QuestPaperButton({ paper }: { paper: QuestPaperLite }) {
  return (
    <ActionButton
      action="sequence-start"
      label={paper.title}
      hint={paper.kindLabel}
      data={{ id: paper.id }}
    />
  );
}

function ActiveQuestsPanel({ rows, activeCount }: { rows: readonly string[]; activeCount: number }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-home-focus">
      <div className="campaign-panel-head">
        <div>
          <h2>Active Quests</h2>
          <div className="campaign-muted">
            Use a quest row for progress, map, battle, harvest, hub scene, check, hand-in, resolve, or fail.
          </div>
        </div>
        <span className="campaign-pill">{activeCount} active</span>
      </div>
      <div className="campaign-quest-list">
        {rows.length ? (
          rows.map((html, i) => (
            <div
              key={i}
              className="campaign-quest-row-bridge"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ))
        ) : (
          <div className="campaign-empty">
            No active quests yet. Create one, start a daily paper, or roll a normal/random quest.
          </div>
        )}
      </div>
    </section>
  );
}

function QuestRunTools({ data }: { data: Extract<QuestHomeData, { isZombie: false }> }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Quest Run Tools</h3>
        <span className="campaign-muted">
          Map seed and battle-style tools live here now, attached to quest play.
        </span>
      </div>
      <div className="campaign-action-grid">
        <ActionButton
          action="generate-quest-scenario"
          label="Generate Quest Map"
          hint={data.hasNextQuest ? `Build a map for "${data.nextQuestTitle}"` : "Add a quest first"}
          disabled={!data.hasNextQuest}
        />
        <ActionButton
          action="manual-battle"
          label="Manual Battle Result"
          hint="Apply a win/loss/escape without opening combat"
        />
        <ActionButton
          action="pass-phase"
          label="Pass Phase"
          hint="Advance phase and refresh daily/repeatable quest timing"
        />
      </div>
    </section>
  );
}

interface ActionProps {
  readonly action: string;
  readonly label: string;
  readonly hint: string;
  readonly kind?: string;
  readonly disabled?: boolean;
  readonly data?: Record<string, string | number | boolean>;
}

function ActionButton({ action, label, hint, kind, disabled, data }: ActionProps) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  const payload = data
    ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
    : {};
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action, payload)}
      title={hint}
      disabled={!!disabled}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}

function HeroAction({ action, label, hint, kind }: { action: string; label: string; hint: string; kind?: string }) {
  return <ActionButton action={action} label={label} hint={hint} kind={kind} />;
}
