// BattleAssist — dice mode toggle, dice queue, Auto Turn / Round / All.
// Mirrors the markup the original combat-ui used. Auto buttons hook into
// CombatManager.autoOneTurn / autoOneRound / autoUntilStop / stopAuto.

import { useEffect, useState } from "react";
import { useCombatVersion } from "../store";

interface CjsAny {
  CombatSettings?: {
    setDiceMode: (mode: string) => void;
    getDiceMode: () => string;
    queueDice: (values: number[]) => void;
    setDicePromptFn: (fn: ((expr: string, source: string) => number | null) | null) => void;
    isAutoActive?: () => boolean;
    getAutoScope?: () => string | null;
  };
  CombatManager?: {
    autoOneTurn: () => unknown;
    autoOneRound: () => unknown;
    autoUntilStop: () => unknown;
    stopAuto: () => unknown;
  };
  Dice?: {
    parse: (expr: string) => unknown;
    min: (parsed: unknown) => number;
    max: (parsed: unknown) => number;
  };
  CombatLog?: {
    logNote?: (message: string, extraTags?: string[]) => void;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export function BattleAssist() {
  useCombatVersion();
  const cs = cjs().CombatSettings;
  const [diceMode, setDiceMode] = useState<string>(() => cs?.getDiceMode?.() ?? "auto");
  const [queueInput, setQueueInput] = useState("");

  // Wire the dice prompt callback once. The engine calls back into here
  // when manual dice mode needs a value. Returning null lets the engine
  // fall back to random.
  useEffect(() => {
    const settings = cjs().CombatSettings;
    if (!settings?.setDicePromptFn) return;
    settings.setDicePromptFn((expression, source) => {
      const Dice = cjs().Dice;
      if (!Dice) return null;
      const parsed = Dice.parse(expression);
      const minVal = Dice.min(parsed);
      const maxVal = Dice.max(parsed);
      const input = window.prompt(
        `Roll: ${expression} (for: ${source || "roll"})\n` +
          `Range: ${minVal} - ${maxVal}\n\n` +
          "Enter a value, or leave blank for random:"
      );
      if (input === null || input.trim() === "") return null;
      const value = parseInt(input, 10);
      if (Number.isNaN(value) || value < minVal || value > maxVal) return null;
      return value;
    });
    return () => {
      cjs().CombatSettings?.setDicePromptFn?.(null);
    };
  }, []);

  const autoActive = cs?.isAutoActive?.() ?? false;

  return (
    <section className="combat-assist-menu">
      <header className="combat-assist-summary">Battle Assist</header>
      <div className="combat-assist-panel">
        <div className="dice-controls">
          <div className="dice-mode-row">
            <span className="dice-label">Dice</span>
            <button
              id="btn-dice-auto"
              className={`btn btn-sm dice-mode-btn${diceMode === "auto" ? " active" : ""}`}
              onClick={() => {
                cjs().CombatSettings?.setDiceMode("auto");
                setDiceMode("auto");
              }}
            >
              Auto
            </button>
            <button
              id="btn-dice-manual"
              className={`btn btn-sm dice-mode-btn${diceMode === "prompt" ? " active" : ""}`}
              onClick={() => {
                cjs().CombatSettings?.setDiceMode("prompt");
                setDiceMode("prompt");
              }}
            >
              Manual
            </button>
          </div>
          <div
            id="dice-queue-row"
            className="dice-queue-row"
            style={{ display: diceMode === "prompt" ? "" : "none" }}
          >
            <input
              type="text"
              id="dice-queue-input"
              placeholder="Pre-queue: 14,7,3,18"
              className="dice-queue-field"
              value={queueInput}
              onChange={(e) => setQueueInput(e.currentTarget.value)}
            />
            <button
              id="btn-dice-queue"
              className="btn btn-sm"
              onClick={() => {
                const values = queueInput
                  .split(/[,\s]+/)
                  .map(Number)
                  .filter((v) => !Number.isNaN(v) && v > 0);
                if (values.length > 0) {
                  cjs().CombatSettings?.queueDice(values);
                  setQueueInput("");
                  cjs().CombatLog?.logNote?.(
                    `Queued ${values.length} dice: [${values.join(", ")}]`,
                    ["note"]
                  );
                }
              }}
            >
              Queue
            </button>
          </div>
        </div>
        <div className="auto-controls">
          <button
            id="btn-auto-turn"
            className="btn btn-sm"
            onClick={() => cjs().CombatManager?.autoOneTurn()}
          >
            Auto Turn
          </button>
          <button
            id="btn-auto-round"
            className="btn btn-sm"
            onClick={() => cjs().CombatManager?.autoOneRound()}
          >
            Auto Round
          </button>
          <button
            id="btn-auto-all"
            className="btn btn-sm"
            onClick={() => cjs().CombatManager?.autoUntilStop()}
          >
            Auto All
          </button>
          <button
            id="btn-stop-auto"
            className="btn btn-sm btn-danger"
            style={{ display: autoActive ? "" : "none" }}
            onClick={() => cjs().CombatManager?.stopAuto()}
          >
            Stop
          </button>
        </div>
      </div>
    </section>
  );
}
