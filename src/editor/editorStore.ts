// Editor store — small reactive surface for the React shell. Subscribes
// to the vanilla UndoManager and ticks a counter every 2s to refresh
// dirty/count/sync indicators (the original used setInterval(2000) for
// the same purpose).

import { useEffect, useSyncExternalStore } from "react";
import { getEditorCjs } from "./editorTypes";

interface UndoSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

interface State {
  tick: number;
  undo: UndoSnapshot;
  saveInFlight: boolean;
  syncMessage: string;
  syncTone: "info" | "success" | "error";
  statusMessage: string;
}

type Listener = () => void;

class EditorStore {
  private state: State = {
    tick: 0,
    undo: { canUndo: false, canRedo: false },
    saveInFlight: false,
    syncMessage: "",
    syncTone: "info",
    statusMessage: "Ready"
  };
  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private undoUnsub: (() => void) | null = null;

  start(): void {
    this.stop();
    // Background tick every 2s — matches the legacy editor-controller.
    this.timer = window.setInterval(() => this.bump(), 2000);
    const UM = getEditorCjs().UndoManager;
    if (UM?.subscribe) {
      this.undoUnsub = UM.subscribe((s) => {
        this.state = { ...this.state, undo: { ...s } };
        this.commit();
      });
    }
  }

  stop(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.undoUnsub) {
      try { this.undoUnsub(); } catch { /* ignore */ }
      this.undoUnsub = null;
    }
  }

  bump(): void {
    this.state = { ...this.state, tick: this.state.tick + 1 };
    this.commit();
  }

  setSaveInFlight(flag: boolean): void {
    this.state = { ...this.state, saveInFlight: flag };
    this.commit();
  }

  setSyncMessage(message: string, tone: "info" | "success" | "error" = "info"): void {
    this.state = { ...this.state, syncMessage: message, syncTone: tone };
    this.commit();
  }

  setStatusMessage(message: string): void {
    this.state = { ...this.state, statusMessage: message || "Ready" };
    this.commit();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = (): State => this.state;

  private commit(): void {
    for (const l of this.listeners) {
      try { l(); } catch (err) { console.error("EditorStore listener:", err); }
    }
  }
}

export const editorStore = new EditorStore();

export function useEditorStore<T>(selector: (state: State) => T): T {
  return useSyncExternalStore(
    editorStore.subscribe,
    () => selector(editorStore.getSnapshot()),
    () => selector(editorStore.getSnapshot())
  );
}

export function useEditorBoot(): void {
  useEffect(() => {
    editorStore.start();
    return () => editorStore.stop();
  }, []);
}
