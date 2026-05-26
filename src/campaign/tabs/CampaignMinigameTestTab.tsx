// CampaignMinigameTestTab.tsx — Phase F JSX port of `_renderMiniGameTest`.
//
// Launches any registered mini-game level without quest context, for
// debugging. The level cache and selected-game state still live in
// campaign-ui.js (via the `mg-test-*` legacy actions); this component
// reads them through `getMinigameTestData(state)`.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getMinigameTestData,
  type MinigameTestData,
  type LevelRecord
} from "./data/minigameTest";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignMinigameTestTab({ state }: Props) {
  const data = getMinigameTestData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Mini-game test lab not ready.</div>
      </section>
    );
  }
  return (
    <div className="campaign-dashboard campaign-minigame-test">
      <GameSelector data={data} />
      <LevelGrid data={data} />
      <LastResult
        status={data.lastResultStatus}
        json={data.lastResultJson}
      />
    </div>
  );
}

function GameSelector({ data }: { data: MinigameTestData }) {
  return (
    <section className="campaign-panel campaign-wide-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Mini-Game Test Lab</h2>
          <div className="campaign-muted">
            Launch any registered mini-game level without quest context. Results are logged here only.
          </div>
        </div>
        <span className="campaign-pill">
          {data.games.length} games | {data.levels.length} levels
        </span>
      </div>
      <div className="campaign-action-grid">
        {data.games.map((game) => (
          <button
            key={game.id}
            className={`campaign-action ${game.id === data.selectedGameId ? "primary" : ""}`}
            onClick={() => dispatchCampaignAction("mg-test-pick", { game: game.id })}
          >
            {game.title}
          </button>
        ))}
      </div>
    </section>
  );
}

function LevelGrid({ data }: { data: MinigameTestData }) {
  const empty = !data.levels.length
    ? (data.selectedGameId && !data.levelsLoaded
      ? "Loading levels..."
      : "No mini-games registered.")
    : null;
  return (
    <section className="campaign-panel campaign-wide-panel">
      <div className="campaign-panel-head">
        <h3>Levels</h3>
        <div className="campaign-action-grid">
          <button
            className="campaign-action"
            onClick={() => dispatchCampaignAction("mg-test-random-any", { game: data.selectedGameId ?? "" })}
          >
            Surprise Me
          </button>
        </div>
      </div>
      <div className="campaign-minigame-grid">
        {data.levels.length ? (
          data.levels.map((lvl) => (
            <LevelCard key={lvl.id} level={lvl} gameId={data.selectedGameId ?? ""} />
          ))
        ) : (
          <div className="campaign-empty">{empty}</div>
        )}
      </div>
    </section>
  );
}

function LevelCard({ level, gameId }: { level: LevelRecord; gameId: string }) {
  return (
    <article className="campaign-minigame-card">
      <header>
        <strong>{level.title}</strong>
        <span className="campaign-pill">D{level.difficulty}</span>
      </header>
      <div className="campaign-muted">
        {level.theme} | {level.width ?? "?"}x{level.height ?? "?"} | optimal {level.optimalTurns ?? "?"}
      </div>
      <p>{level.hint}</p>
      <div className="campaign-chip-row">
        {level.tags.map((tag, i) => (
          <span key={i} className="campaign-chip">{tag}</span>
        ))}
      </div>
      <div className="campaign-action-grid">
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("mg-test-play", { game: gameId, level: level.id })}
        >
          Play {level.id}
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("mg-test-random", { game: gameId, difficulty: level.difficulty })}
        >
          Random D{level.difficulty}
        </button>
      </div>
    </article>
  );
}

function LastResult({ status, json }: { status: string | null; json: string | null }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Last Result</h3>
        <span className="campaign-pill">{status ?? "none yet"}</span>
      </div>
      <pre className="campaign-minigame-result">
        {json ?? "Run a level to see the result payload that Campaign Mode would receive."}
      </pre>
    </section>
  );
}
