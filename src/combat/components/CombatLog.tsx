// CombatLog — turn log feed driven by the engine's CombatLog subscriber.
// Each log entry is mapped to a human-readable message identical to the
// vanilla combat-ui formatter so existing CSS keeps working.

import { useEffect, useLayoutEffect, useRef } from "react";
import { useLogEntries, type LogEntry } from "../store";

interface CjsAny {
  GridRenderer?: {
    addDamageFloat?: (r: number, c: number, text: string | number, color: string) => void;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

function formatEntry(entry: LogEntry): { message: string; cls: string } {
  const actor = entry.actor?.name || entry.actor?.baseId || "Someone";
  const target = entry.target?.name || entry.target?.baseId || "Target";
  const data = (entry.data || {}) as Record<string, unknown>;
  const type = entry.type || "note";
  let message = "";

  switch (type) {
    case "hit":
      message = `${actor} hits ${target} for ${data.damage ?? "?"} damage${
        entry.tags?.includes("crit") ? " (crit)" : ""
      }.`;
      break;
    case "miss":
      message = `${actor} misses ${target}.`;
      break;
    case "dodge":
      message = `${actor} dodges.`;
      break;
    case "kill":
      message = `${target} is defeated.`;
      break;
    case "heal":
      message = `${target} heals for ${data.amount ?? "?"} HP.`;
      break;
    case "status_applied":
      message = `${data.statusId} applied to ${target}.`;
      break;
    case "status_tick":
      message = `${data.statusId} ticks on ${target} (${data.amount ?? "?"}).`;
      break;
    case "status_removed":
      message = `${data.statusId} removed from ${target}.`;
      break;
    case "move":
      message = `${actor} moves.`;
      break;
    case "skill_used":
      message = `${actor} uses ${data.skill ?? "a skill"}.`;
      break;
    case "qte_result":
      message = `QTE: ${data.grade ?? "ok"} (${data.multiplier ?? 1}x).`;
      break;
    case "turn_start":
      message = `Turn ${data.turn}: ${actor}'s turn.`;
      break;
    case "battle_start":
      message = "Battle start.";
      break;
    case "battle_end":
      message = `Battle end: ${data.winner ?? "unknown"} wins.`;
      break;
    case "terrain_effect":
      message = `${target} is affected by ${data.terrain ?? "terrain"}.`;
      break;
    default:
      message = entry.message || type;
      break;
  }

  return { message, cls: `log-entry log-${type}` };
}

function emitFloats(entry: LogEntry): void {
  if (!entry.target?.pos) return;
  const [r, c] = entry.target.pos;
  const gr = cjs().GridRenderer;
  if (!gr?.addDamageFloat) return;
  if (entry.type === "hit") {
    gr.addDamageFloat(
      r,
      c,
      ((entry.data as Record<string, unknown>)?.damage ?? "?") as string | number,
      entry.tags?.includes("crit") ? "#fbbf24" : "#ff4444"
    );
  } else if (entry.type === "heal") {
    gr.addDamageFloat(
      r,
      c,
      `+${(entry.data as Record<string, unknown>)?.amount ?? "?"}`,
      "#22c55e"
    );
  } else if (entry.type === "status_tick" && (entry.data as Record<string, unknown>)?.amount) {
    gr.addDamageFloat(
      r,
      c,
      ((entry.data as Record<string, unknown>).amount) as string | number,
      "#c084fc"
    );
  }
}

export function CombatLog() {
  const entries = useLogEntries();
  const logEl = useRef<HTMLDivElement | null>(null);
  const lastSeenLen = useRef(0);

  // Emit float popups for newly arrived entries that carry positional data.
  useEffect(() => {
    if (entries.length > lastSeenLen.current) {
      for (let i = lastSeenLen.current; i < entries.length; i++) {
        emitFloats(entries[i]);
      }
    }
    lastSeenLen.current = entries.length;
  }, [entries]);

  // Autoscroll to bottom whenever the list grows.
  useLayoutEffect(() => {
    if (logEl.current) {
      logEl.current.scrollTop = logEl.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div id="cbt-log" className="battle-log-panel" ref={logEl}>
      {entries.map((entry, idx) => {
        const { message, cls } = formatEntry(entry);
        if (!message) return null;
        return (
          <div key={idx} className={cls}>
            {message}
          </div>
        );
      })}
    </div>
  );
}
