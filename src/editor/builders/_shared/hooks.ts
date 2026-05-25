// React hooks for editor builders. The hooks subscribe to the vanilla
// CJS modules where appropriate and bump a local tick so React re-renders
// when underlying data changes.

import { useEffect, useState, useSyncExternalStore } from "react";
import { editorStore } from "../../editorStore";
import { ds, subscribeData } from "./cjs";

// Re-renders on every DataStore mutation (create/update/replace/remove).
// Returns a monotonic tick that callers can include in deps to refetch.
export function useDataStoreTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeData(() => setTick((n) => n + 1)), []);
  return tick;
}

// Returns the current array of items for a given DataStore collection,
// re-fetched on every mutation. Filtering by visibility is done by
// ContentManager.getVisibleItems when present.
export function useCollection<T>(
  type: string,
  fetcher: () => T[]
): T[] {
  const tick = useDataStoreTick();
  const [items, setItems] = useState<T[]>(() => fetcher());
  useEffect(() => {
    setItems(fetcher());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, type]);
  return items;
}

// Subscribes to the editor's epoch (filters/import/migrate force a
// global re-init). Builders read this to wipe local state when the
// underlying scope changes.
export function useEditorTick(): number {
  return useSyncExternalStore(
    editorStore.subscribe,
    () => editorStore.getSnapshot().tick,
    () => editorStore.getSnapshot().tick
  );
}

// Wraps a single DataStore record with React semantics: returns the
// current value, updates when the store changes, and exposes a setter
// that runs through DataStore.update.
export function useRecord<T extends { id: string }>(
  type: string,
  id: string | null
): T | null {
  const tick = useDataStoreTick();
  const [record, setRecord] = useState<T | null>(() =>
    id ? (ds().get<T>(type, id) ?? null) : null
  );
  useEffect(() => {
    setRecord(id ? (ds().get<T>(type, id) ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, tick]);
  return record;
}
