// StoryBeatModal.tsx — Part B React body for the story-director beat modal.
//
// Rendered into the modal content via `createRoot` by
// `action-handlers/story-director-modals.ts` (the editor-picker / party-sheet
// modal pattern). It reuses the shared `<StoryBeatCard>` (the `is-modal`
// variant of the storyDirector tab card), so the modal and the tab render
// byte-identical cards. The route buttons call `onChoose(index)` so the
// imperative modal can close itself before dispatching `story-apply-choice`.
//
// This replaced the `renderStoryDirectorCardHtml` HTML-string island + the
// `data-story-modal-choice` click delegate.

import { StoryBeatCard } from "./StoryDirectorPanels";
import type { StoryDirectorCardData } from "./data/storyDirector";

export function StoryBeatModalBody({
  data,
  onChoose
}: {
  data: StoryDirectorCardData;
  onChoose: (index: number) => void;
}) {
  return (
    <>
      <div className="campaign-story-popup-hint">
        This roll has not changed the campaign yet. Choose a route, hold it for
        later, or skip it if the table says "nice try, app."
      </div>
      <StoryBeatCard data={data} onChoose={onChoose} />
    </>
  );
}
