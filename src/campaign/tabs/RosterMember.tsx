// RosterMember.tsx — Phase K.3.2 shared roster member JSX.
//
// The full member sheet (hero identity / rank / persona / job chip /
// availability, vitals + stats + affinities, and the skills / passives /
// statuses / equipment detail row) rendered as ONE component reused by
// BOTH the roster tab (`CampaignRosterTab`) and the party-sheet modal
// (`roster-modal-pickers.ts`, mounted via createRoot — the editor picker
// pattern). This retires the island's `renderRosterMember` /
// `renderPartySheetHtml` / `_renderPortraitHero` HTML strings: one JSX
// source, no duplication, every action a direct onClick dispatch.
//
// The portrait / job-chip / affinities are still tiny HTML bridges
// (`portraitHtml` / `jobChipHtml` / `resistancesHtml` from the island's
// `rosterMemberData`) — icon-as-data lets the detail row go full JSX, but
// these three carry inline focus-style strings / the affinity grid and
// stay bridged until their own step.

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { RosterDetailRow } from "./RosterDetail";
import type { RosterMemberData, PortraitHeroData } from "./data/roster";

// Hero / GM action button. All take the member id as the payload.
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

export function RosterMemberCard({ member }: { member: RosterMemberData }) {
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

      <RosterDetailRow data={member.detail} />
    </article>
  );
}

// Portrait-hero header for the party-sheet modal (mirrors the island's
// `_renderPortraitHero`). The portrait img/fallback carries an inline
// focus-style string, so it stays a tiny HTML bridge; the meta is JSX.
function PortraitHero({ data }: { data: PortraitHeroData }) {
  return (
    <div className="campaign-portrait-hero">
      <div
        className="campaign-portrait-frame is-large"
        dangerouslySetInnerHTML={{ __html: data.portraitHtml }}
      />
      <div className="campaign-portrait-meta">
        <h2>{data.name}</h2>
        <div className="campaign-portrait-sub">{data.sub}</div>
        <div className="campaign-chip-row">
          {data.tags.map((tag, i) => (
            <span key={i} className="campaign-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Full party-sheet body (portrait hero + member card). Mounted into the
// modal via createRoot — every action button inside dispatches via onClick,
// so the modal needs no click delegate.
export function PartySheet({ hero, member }: { hero: PortraitHeroData; member: RosterMemberData }) {
  return (
    <>
      <PortraitHero data={hero} />
      <RosterMemberCard member={member} />
    </>
  );
}
