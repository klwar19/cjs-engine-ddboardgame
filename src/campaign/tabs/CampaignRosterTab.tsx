import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { getRosterData, type RosterMemberData } from "./data/roster";

// Roster tab (K.3). The active / bench panel structure, member hero
// (identity, rank, persona pill, job chip, availability), vitals + stats
// + affinities, and every gameplay / GM action are JSX with direct
// onClick dispatch. The skills / passives / statuses / equipment detail
// row is a 2-column CSS grid whose four cards must be direct grid
// children to stretch evenly, so they stay one `detailCardsHtml` island
// (JSX owns the grid div) until their own K.3 step ports them. Those
// cards' data-campaign-action buttons still bubble to campaign-root's
// delegated listener (_bindEvents), unchanged from before this port.

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignRosterTab({ state }: Props) {
  const data = getRosterData(state);
  if (!data) {
    return <div className="campaign-empty">Roster module not loaded.</div>;
  }
  return (
    <div className="campaign-tab-stack">
      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h2>Roster</h2>
          <button
            className="campaign-action"
            onClick={() => dispatchCampaignAction("recruit-character")}
          >
            Recruit
          </button>
        </div>
        {data.active.length === 0 ? (
          <div className="campaign-empty">No active roster.</div>
        ) : (
          data.active.map((member) => <RosterMemberCard key={member.id} member={member} />)
        )}
      </section>

      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h2>Bench</h2>
        </div>
        {data.bench.length === 0 ? (
          <div className="campaign-empty">No benched members.</div>
        ) : (
          data.bench.map((member) => <RosterMemberCard key={member.id} member={member} />)
        )}
      </section>
    </div>
  );
}

// Hero / GM action button. All take the member id as `data-id`.
function MemberActionBtn({
  member,
  action,
  label,
  title,
  danger
}: {
  member: RosterMemberData;
  action: CampaignActionName;
  label: string;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      className={`campaign-action${danger ? " danger" : ""}`}
      title={title}
      onClick={() => dispatchCampaignAction(action, { id: member.id })}
    >
      {label}
    </button>
  );
}

function RosterMemberCard({ member }: { member: RosterMemberData }) {
  const cls = [
    "campaign-roster-member",
    member.isBench ? "is-bench" : "is-active",
    member.battleReady ? "" : "is-unavailable"
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={cls}>
      <header className="campaign-roster-hero">
        <div
          className="campaign-roster-portrait"
          dangerouslySetInnerHTML={{ __html: member.portraitHtml }}
        />
        <div className="campaign-roster-hero-info">
          <div className="campaign-roster-hero-title">
            <strong className="campaign-roster-name">{member.name}</strong>
            <span className={`campaign-pill ${member.battleReady ? "is-current" : "is-blocked"}`}>
              {member.availLabel}
            </span>
            <span className="campaign-pill">{member.isBench ? "Bench" : "Active"}</span>
            {member.persona && <PersonaPill member={member} persona={member.persona} />}
          </div>
          <div className="campaign-roster-hero-meta">
            <span>
              <b>Lv</b> {member.level}
            </span>
            <span title={member.rank.tooltip}>
              <b>Rank</b> {member.rank.label}
              {member.rank.trialPending && <span className="campaign-chip"> Trial!</span>}
            </span>
            <span
              className="campaign-roster-hero-job"
              dangerouslySetInnerHTML={{ __html: member.jobChipHtml }}
            />
            <span title={member.charXpMeta}>
              <b>XP</b> {member.xp} <small>{member.xpSmall}</small>
            </span>
            <span className="campaign-muted">
              {member.id}
              {member.baseFrom ? ` from ${member.baseFrom}` : ""}
            </span>
          </div>
          <div className="campaign-roster-action-groups">
            <div className="campaign-roster-action-block">
              <span className="campaign-roster-actions-title">Gameplay</span>
              <div className="campaign-roster-hero-actions campaign-row-actions">
                <MemberActionBtn
                  member={member}
                  action={member.isBench ? "activate-character" : "bench-character"}
                  label={member.isBench ? "Activate" : "Bench"}
                />
                <MemberActionBtn member={member} action="party-sheet" label="Sheet" />
                <MemberActionBtn member={member} action="change-job" label="Job Change" />
                <MemberActionBtn member={member} action="show-job-tree" label="Job Tree" />
                <MemberActionBtn member={member} action="change-persona" label="Persona" title="Switch world persona" />
                <button
                  className="campaign-action"
                  title="Apply for a rank-up trial at the Adventurer Guild."
                  onClick={() => dispatchCampaignAction("rank-up-apply")}
                >
                  Rank Trial
                </button>
                <MemberActionBtn member={member} action="party-availability" label="Availability" />
              </div>
            </div>
            <details className="campaign-roster-action-block is-gm">
              <summary className="campaign-roster-actions-title">GM Edit</summary>
              <div className="campaign-roster-hero-actions campaign-row-actions">
                <MemberActionBtn member={member} action="gm-member-override" label="GM Edit" />
                <MemberActionBtn member={member} action="level-char" label="Level" />
                <MemberActionBtn member={member} action="grant-xp" label="+XP" />
                <MemberActionBtn member={member} action="grant-job-xp" label="+Job XP" />
                <MemberActionBtn member={member} action="stat-boost" label="Stats" />
                <MemberActionBtn member={member} action="learn-skill" label="Learn Skill" />
                <MemberActionBtn member={member} action="learn-passive" label="Learn Passive" />
                <MemberActionBtn member={member} action="status-char" label="Status" />
                <MemberActionBtn member={member} action="remove-character" label="Remove" danger />
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="campaign-roster-vitals-row">
        <section className="campaign-roster-card campaign-roster-vitals">
          <div className="campaign-roster-card-title">Vitals</div>
          <div className="campaign-bar">
            <span className="hp" style={{ width: `${member.vitals.hpPct}%` }} />
            <b>HP {member.vitals.hp}/{member.vitals.maxHp}</b>
          </div>
          <div className="campaign-bar">
            <span className="mp" style={{ width: `${member.vitals.mpPct}%` }} />
            <b>MP {member.vitals.mp}/{member.vitals.maxMp}</b>
          </div>
          <div className="campaign-roster-stats-grid">
            {member.stats.map((stat, i) => (
              <div key={i} className="campaign-roster-stat">
                <span>{stat.name}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="campaign-roster-card campaign-roster-affinities">
          <div className="campaign-roster-card-title">Affinities</div>
          <div dangerouslySetInnerHTML={{ __html: member.resistancesHtml }} />
        </section>
      </div>

      <RosterDetailRow member={member} />
    </article>
  );
}

function PersonaPill({
  member,
  persona
}: {
  member: RosterMemberData;
  persona: NonNullable<RosterMemberData["persona"]>;
}) {
  return (
    <span
      className={persona.outOfWorld ? "campaign-pill is-blocked" : "campaign-pill"}
      title={persona.tooltip}
      style={{ cursor: "pointer" }}
      onClick={() => dispatchCampaignAction("change-persona", { id: member.id })}
    >
      {persona.icon} {persona.label}
      {persona.outOfWorld ? " ⚠" : ""}
    </span>
  );
}

// The detail row (skills / passives / statuses / equipment) is a
// 2-column grid whose four cards must be direct children to stretch
// evenly, so it stays one HTML island. JSX owns the actual
// `.campaign-roster-detail-row` grid div (exact DOM parity); the cards'
// data-campaign-action buttons bubble to campaign-root's delegated
// listener (_bindEvents), unchanged from before this port. When H.2
// removes _bindEvents, a single main-body forwarder in the shell will
// catch these alongside the other bridged-module tabs.
function RosterDetailRow({ member }: { member: RosterMemberData }) {
  return (
    <div
      className="campaign-roster-detail-row"
      dangerouslySetInnerHTML={{ __html: member.detailCardsHtml }}
    />
  );
}
