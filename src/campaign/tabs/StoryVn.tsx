// StoryVn.tsx — Phase G.11a JSX components for the Story Mode
// visual-novel hero, solo guide ladder, and control deck. Shared
// between StoryHome and StoryDirector tabs.

import "../../../css/visual-novel.css";
import { dispatchCampaignAction } from "../actions";
import type {
  StoryVnHeroData,
  StoryActionButton,
  StoryNextStep
} from "./data/storyShared";

export function StoryVnHero({ data }: { data: StoryVnHeroData }) {
  const hasVideo = !!data.bannerVideoUrl;
  return (
    <section className={`campaign-story-vn-hero campaign-wide-panel${hasVideo ? " has-video" : ""}`}>
      {hasVideo && (
        <video
          className="campaign-story-vn-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src={data.bannerVideoUrl} type={data.bannerVideoType} />
        </video>
      )}
      <div className="campaign-story-vn-shade" aria-hidden="true" />
      <div className="campaign-story-vn-content">
        <div className="campaign-story-vn-kicker">
          <span>{data.worldName}</span>
          <span>Chapter {data.chapterLabel} / Phase {data.phaseLabel}</span>
        </div>
        <div className="campaign-story-vn-title">
          <span className="campaign-story-motif">{data.motif}</span>
          <h2>{data.title}</h2>
          <p>{data.summary}</p>
        </div>
        <StoryVnNextStep next={data.next} />
      </div>
    </section>
  );
}

function StoryVnNextStep({ next }: { next: StoryNextStep }) {
  return (
    <div className="campaign-story-vn-next">
      <span className="campaign-story-step-badge">Next Action</span>
      <strong>{next.title || "Choose the next story action"}</strong>
      <p>{next.text || "Pick a stage, roll a scene, then choose a route when the popup opens."}</p>
      {next.actions.length > 0 && (
        <div className="campaign-story-next-actions">
          {next.actions.map((btn, i) => (
            <StoryActionBtn key={i} btn={btn} />
          ))}
        </div>
      )}
      <small>Route choices are previews until you click one.</small>
    </div>
  );
}

export function StoryActionBtn({ btn }: { btn: StoryActionButton }) {
  const cls = ["campaign-action"];
  if (btn.kind) {
    for (const part of btn.kind.split(/\s+/)) {
      if (part) cls.push(part);
    }
  }
  if (btn.hint) cls.push("has-hint");
  return (
    <button
      className={cls.join(" ")}
      disabled={btn.disabled}
      title={btn.hint || undefined}
      onClick={() => dispatchCampaignAction(btn.action, btn.data)}
    >
      <span className="campaign-action-label">{btn.label}</span>
      {btn.hint && <small className="campaign-action-hint">{btn.hint}</small>}
    </button>
  );
}

const SOLO_STEPS: ReadonlyArray<readonly [string, string]> = [
  ["Stage", "Pick the episode you are playing now."],
  ["Scene", "Roll or write a playable story beat."],
  ["Route", "Read the choices and their outcomes."],
  ["Commit", "Choose, hold, or skip the roll."],
  ["Table", "Update side routes, then play."]
];

export function StorySoloGuide({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="campaign-story-guide">
      <div className="campaign-story-ladder" aria-label="Solo story flow">
        {SOLO_STEPS.map((step, index) => {
          const cls = ["campaign-story-ladder-step"];
          if (index === activeIndex) cls.push("is-active");
          else if (index < activeIndex) cls.push("is-done");
          return (
            <div key={index} className={cls.join(" ")}>
              <span>{index + 1}</span>
              <b>{step[0]}</b>
              <small>{step[1]}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StoryActionDeck({
  flowSynced,
  hasFlow
}: {
  flowSynced: boolean;
  hasFlow: boolean;
}) {
  return (
    <div className="campaign-story-roll-pad">
      <div className="campaign-section-title">Scene Controls</div>
      <div className="campaign-action-grid">
        <StoryActionBtn
          btn={{
            action: "story-roll-scene",
            label: "Next Scene",
            hint: "Default story roll. Opens a popup before anything is applied.",
            kind: "primary story",
            disabled: false,
            data: {}
          }}
        />
        <StoryActionBtn
          btn={{
            action: "story-manual-note",
            label: "Write Scene",
            hint: "Write your own table beat and save it without random rolling.",
            kind: "manual",
            disabled: false,
            data: {}
          }}
        />
        <ActionMenu label="Roll Type">
          <StoryActionBtn
            btn={{
              action: "story-roll-peri",
              label: "Peri Interrupt",
              hint: "Comic system interruption, helpful glitch, or suspicious advice.",
              kind: "random",
              disabled: false,
              data: {}
            }}
          />
          <StoryActionBtn
            btn={{
              action: "story-roll-memory",
              label: "Memory / Clue",
              hint: "Mystery clue or emotional leak. Good when the scene needs plot smoke.",
              kind: "plot",
              disabled: false,
              data: {}
            }}
          />
          <StoryActionBtn
            btn={{
              action: "story-pressure-tick",
              label: "Offscreen Trouble",
              hint: "Pressure that happens away from the current scene when time passes or the table stalls.",
              kind: "risk",
              disabled: false,
              data: {}
            }}
          />
        </ActionMenu>
        <ActionMenu label="Story Tools">
          <StoryActionBtn
            btn={{
              action: "story-sync-sidequests",
              label: flowSynced ? "Routes Updated" : "Update Side Routes",
              hint: "Marks which side routes should stay, rise, or pause for this episode.",
              kind: flowSynced ? "manual" : "quest",
              disabled: !hasFlow || flowSynced,
              data: {}
            }}
          />
          <StoryActionBtn
            btn={{
              action: "story-copy-prompt",
              label: "Copy GM Prompt",
              hint: "Copies current stage, last beat, clues, and queue for outside AI or GM drafting.",
              kind: "manual",
              disabled: false,
              data: {}
            }}
          />
          <StoryActionBtn
            btn={{
              action: "story-help",
              label: "Flow Help",
              hint: "Short solo/GM instructions for this Story Mode desk.",
              kind: "",
              disabled: false,
              data: {}
            }}
          />
        </ActionMenu>
      </div>
    </div>
  );
}

function ActionMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="campaign-action-menu">
      <summary className="campaign-action-menu-trigger">
        <span>{label}</span>
      </summary>
      <div className="campaign-action-menu-panel">{children}</div>
    </details>
  );
}
