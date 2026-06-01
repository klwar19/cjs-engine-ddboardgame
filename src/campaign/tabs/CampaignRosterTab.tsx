import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getRosterData } from "./data/roster";
import { RosterMemberCard } from "./RosterMember";

// Roster tab (K.3). The active / bench panel structure + the full member
// card (hero identity / rank / persona / job chip / availability, vitals +
// stats + affinities, and the skills / passives / statuses / equipment
// detail row) are JSX with direct onClick dispatch. The member card
// (`RosterMemberCard`) is shared with the party-sheet modal (K.3.2).

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
