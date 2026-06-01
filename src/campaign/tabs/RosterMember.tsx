// RosterMember.tsx - shared roster member JSX.
//
// The full member sheet is reused by the roster tab and party-sheet modal.
// Portraits, job chips, affinities, and the detail row now render from typed
// data instead of HTML bridge strings.

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { Icon } from "../util/IconView";
import { cssTextToReactStyle } from "../util/react-style";
import { RosterDetailRow } from "./RosterDetail";
import type {
  RosterAffinities,
  RosterJobChipData,
  RosterMemberData,
  RosterPortraitData,
  PortraitHeroData
} from "./data/roster";

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

function PortraitFallback({
  portrait,
  className
}: {
  portrait: RosterPortraitData;
  className: string;
}) {
  return <span className={className}>{portrait.fallback}</span>;
}

export function RosterPortrait({
  portrait,
  fallbackClass = "campaign-roster-portrait-fallback"
}: {
  portrait: RosterPortraitData;
  fallbackClass?: string;
}) {
  if (portrait.src) {
    return <img src={portrait.src} alt={portrait.alt} style={cssTextToReactStyle(portrait.focusStyle)} />;
  }
  return <PortraitFallback portrait={portrait} className={fallbackClass} />;
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
      {persona.outOfWorld ? " !" : ""}
    </span>
  );
}

function JobChip({ data }: { data: RosterJobChipData }) {
  if (data.state === "none") return <span className="campaign-muted">No job</span>;
  if (data.state === "unknown") return <span className="campaign-muted">Unknown job: {data.unknownId}</span>;
  const job = data.job || {};
  return (
    <>
      <Icon entity={job} kind="job" size="xs" /> {job.name || job.id} Lv {data.level}/{data.cap} | XP {data.xp} {data.meta}
      {data.persona ? (
        <>
          {" "}
          <span className="campaign-muted">/</span>{" "}
          <span title={data.persona.tooltip} style={data.persona.outOfWorld ? { color: "#f59e0b" } : undefined}>
            {data.persona.icon} {data.persona.label}
            {data.persona.outOfWorld ? " !" : ""}
          </span>
        </>
      ) : null}
    </>
  );
}

function Affinities({ data }: { data: RosterAffinities }) {
  return (
    <>
      <div className="campaign-affinity-grid">
        {data.elements.map((affinity) => (
          <div
            key={affinity.slug}
            className={`campaign-affinity-pill el-${affinity.slug} is-${affinity.state}`}
            data-element={affinity.slug}
            title={affinity.title}
          >
            <span className="campaign-affinity-name">{affinity.element}</span>
            {affinity.state === "neutral" ? (
              <span className="campaign-affinity-state">{affinity.code}</span>
            ) : (
              <strong className="campaign-affinity-state">{affinity.code}</strong>
            )}
          </div>
        ))}
      </div>
      <div className="campaign-affinity-subheading">Damage Reduction</div>
      <div className="campaign-dr-row">
        <span className="campaign-dr-chip" title="Reduces incoming Physical damage">
          <b className="campaign-dr-icon">P</b>
          <span className="campaign-dr-label">Phys</span>
          <b className="campaign-dr-value">{data.damageReduction.physical}</b>
        </span>
        <span className="campaign-dr-chip" title="Reduces incoming Magical damage">
          <b className="campaign-dr-icon">M</b>
          <span className="campaign-dr-label">Magic</span>
          <b className="campaign-dr-value">{data.damageReduction.magic}</b>
        </span>
        <span className="campaign-dr-chip" title="Reduces incoming Chaos damage">
          <b className="campaign-dr-icon">C</b>
          <span className="campaign-dr-label">Chaos</span>
          <b className="campaign-dr-value">{data.damageReduction.chaos}</b>
        </span>
      </div>
    </>
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
        <div className="campaign-roster-portrait">
          <RosterPortrait portrait={member.portrait} />
        </div>
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
            <span className="campaign-roster-hero-job">
              <JobChip data={member.job} />
            </span>
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
          <Affinities data={member.affinities} />
        </section>
      </div>

      <RosterDetailRow data={member.detail} />
    </article>
  );
}

function PortraitHero({ data }: { data: PortraitHeroData }) {
  return (
    <div className="campaign-portrait-hero">
      <div className="campaign-portrait-frame is-large">
        {data.portrait.src ? (
          <img src={data.portrait.src} alt={data.portrait.alt} style={cssTextToReactStyle(data.portrait.focusStyle)} />
        ) : (
          <div className="fallback">{data.portrait.fallback}</div>
        )}
      </div>
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

export function PartySheet({ hero, member }: { hero: PortraitHeroData; member: RosterMemberData }) {
  return (
    <>
      <PortraitHero data={hero} />
      <RosterMemberCard member={member} />
    </>
  );
}
