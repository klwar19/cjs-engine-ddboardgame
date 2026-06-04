// NotesPanel.tsx — JSX port of the drawer "Pinned Notes" island that lived in
// `shell/boot.ts::renderNotesPanel`. The "+ Add" button dispatches via typed
// onClick instead of the old `data-add-note` marker that `htmlIslandActions.ts`
// translated. Display-only otherwise (list of pinned notes).

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";

type PinnedNote = string | { readonly text?: string; readonly at?: string };

export function NotesPanel({ state }: { state: CampaignStateSnapshot }) {
  const notes = (state.pinnedNotes as readonly PinnedNote[] | undefined) || [];
  return (
    <section className="campaign-side-section">
      <div className="campaign-panel-head">
        <h2>Pinned Notes</h2>
        <button className="campaign-icon-btn" onClick={() => dispatchCampaignAction("add-note")}>
          + Add
        </button>
      </div>
      {notes.length ? (
        notes.map((note, index) => (
          <div className="campaign-log-line" key={typeof note === "string" ? `${index}-${note}` : note.at || index}>
            {typeof note === "string" ? note : note.text || ""}
          </div>
        ))
      ) : (
        <div className="campaign-empty">No pinned notes yet.</div>
      )}
    </section>
  );
}
