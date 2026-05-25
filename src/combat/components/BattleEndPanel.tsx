// BattleEndPanel — shown when state.phase === "battle_end". Hosts the loot
// roll display via the imperative LootRoller mount.

import { useRef } from "react";

interface CjsAny {
  CombatManager?: {
    getState?: () => { winner?: string; roundNumber?: number; phase?: string } | null;
    getUnits?: () => Array<{ team?: string }>;
  };
  LootRoller?: {
    rollAndDisplay: (enemies: unknown[], container: HTMLElement) => unknown;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

interface Props {
  readonly showReturnButton: boolean;
  readonly onReturn: () => void;
  readonly onRestart: () => void;
}

export function BattleEndPanel({ showReturnButton, onReturn, onRestart }: Props) {
  const state = cjs().CombatManager?.getState?.();
  const lootHost = useRef<HTMLDivElement | null>(null);

  if (!state || state.phase !== "battle_end") return null;
  const winner = state.winner;

  const onLoot = () => {
    const host = lootHost.current;
    if (!host) return;
    if (winner === "player") {
      const enemies = (cjs().CombatManager?.getUnits?.() ?? []).filter(
        (unit) => unit.team === "enemy"
      );
      cjs().LootRoller?.rollAndDisplay(enemies, host);
    } else {
      host.innerHTML = '<div class="action-wait">Combat complete.</div>';
    }
  };

  return (
    <div id="cbt-battle-end" className="action-panel">
      <div className={`battle-end-panel ${winner === "player" ? "victory" : "defeat"}`}>
        <h2>{winner === "player" ? "Victory" : "Defeat"}</h2>
        <p>Round {state.roundNumber}</p>
        <div className="battle-end-buttons">
          <button
            className="btn btn-primary"
            id="btn-show-loot"
            onClick={onLoot}
          >
            {winner === "player" ? "Collect Loot" : "Summary"}
          </button>
          <button className="btn" id="btn-restart-combat" onClick={onRestart}>
            Restart
          </button>
          {showReturnButton ? (
            <button className="btn" id="btn-return-setup" onClick={onReturn}>
              Back to Setup
            </button>
          ) : null}
        </div>
        <div ref={lootHost} />
      </div>
    </div>
  );
}
