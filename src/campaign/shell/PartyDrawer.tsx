import { dispatchCampaignAction } from "../actions";
import type { CampaignStateSnapshot } from "../store";
import { Icon } from "../util/IconView";
import { cssTextToReactStyle } from "../util/react-style";
import { getPartyDrawerData, type PartyDrawerMemberData, type MemberRankInfo } from "../tabs/data/roster";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function PartyDrawer({ state }: Props) {
  const data = getPartyDrawerData(state);
  return (
    <>
      <div className="campaign-panel-head">
        <h2>Party</h2>
        <button className="campaign-icon-btn" onClick={() => dispatchCampaignAction("open-roster-tab")}>
          Roster
        </button>
      </div>
      {data.active.length ? (
        data.active.map((member) => <PartyDrawerCard key={member.id} member={member} />)
      ) : (
        <div className="campaign-empty">No active party members.</div>
      )}
      {data.bench.length ? (
        <>
          <div className="campaign-muted campaign-sidebar-label">Bench</div>
          {data.bench.map((member) => <PartyDrawerCard key={member.id} member={member} />)}
        </>
      ) : null}
    </>
  );
}

function PartyDrawerCard({ member }: { member: PartyDrawerMemberData }) {
  return (
    <section className={`campaign-character ${member.battleReady ? "" : "is-unavailable"}`}>
      <div className="campaign-character-head">
        <div className="campaign-avatar">
          {member.portrait.src ? (
            <img src={member.portrait.src} alt="" style={cssTextToReactStyle(member.portrait.focusStyle)} />
          ) : (
            <Icon entity={member.iconEntity} kind="character" size="lg" alt={member.name || member.id} />
          )}
        </div>
        <div>
          <strong>{member.name}</strong>
          <div className="campaign-muted">
            Lv {member.level} | Rank {member.rank.label}
            {member.rank.trialPending ? (
              <span className="campaign-chip" title="Ready to rank up - visit the Adventurer Guild">
                Trial!
              </span>
            ) : null}
          </div>
          <RankBar rank={member.rank} />
        </div>
        <span className={`campaign-pill ${member.battleReady ? "is-current" : "is-blocked"}`}>
          {member.availability}
        </span>
      </div>
      <div className="campaign-bar">
        <span className="hp" style={{ width: `${member.vitals.hpPct}%` }} />
        <b>HP {member.vitals.hp}/{member.vitals.maxHp}</b>
      </div>
      <div className="campaign-bar">
        <span className="mp" style={{ width: `${member.vitals.mpPct}%` }} />
        <b>MP {member.vitals.mp}/{member.vitals.maxMp}</b>
      </div>
      <div className="campaign-chip-row">
        {member.statuses.length ? (
          member.statuses.map((status, i) => (
            <span key={`${status.label}-${i}`} className="campaign-chip">
              {status.label}
            </span>
          ))
        ) : (
          <span className="campaign-muted">No statuses</span>
        )}
      </div>
      <div className="campaign-mini-actions">
        <DrawerAction action="damage-char" id={member.id} label="Damage" />
        <DrawerAction action="heal-char" id={member.id} label="Heal" />
        <DrawerAction action="mp-char" id={member.id} label="MP" />
        <DrawerAction action="status-char" id={member.id} label="Status" />
        <DrawerAction action="party-sheet" id={member.id} label="Sheet" />
        <DrawerAction
          action={member.isBench ? "activate-character" : "bench-character"}
          id={member.id}
          label={member.isBench ? "Activate" : "Bench"}
        />
        <DrawerAction action="party-availability" id={member.id} label="Availability" />
        {member.battleReady ? null : <DrawerAction action="party-available" id={member.id} label="Return" />}
      </div>
    </section>
  );
}

function DrawerAction({
  action,
  id,
  label
}: {
  action: Parameters<typeof dispatchCampaignAction>[0];
  id: string;
  label: string;
}) {
  return <button onClick={() => dispatchCampaignAction(action, { id })}>{label}</button>;
}

function RankBar({ rank }: { rank: MemberRankInfo }) {
  if (rank.atMax) {
    return (
      <div className="campaign-muted" style={{ fontSize: "0.72rem" }}>
        Rank maxed (SSR)
      </div>
    );
  }
  if (rank.threshold <= 0) return null;
  return (
    <div className="campaign-bar" style={{ marginTop: 4 }}>
      <span className="mp" style={{ width: `${rank.pct}%` }} />
      <b>RP {rank.rp}/{rank.threshold} {"->"} {rank.next}</b>
    </div>
  );
}
