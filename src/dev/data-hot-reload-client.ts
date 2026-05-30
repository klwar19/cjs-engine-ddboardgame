// data-hot-reload-client.ts — Dev-only bridge for content hot-reload.
//
// The dev server (cjsDataHotReload in vite.config.mjs) pushes a custom
// `cjs:data-change` HMR event when a data/*.json file changes on disk. Here
// we re-ingest just that file into DataStore in place via
// ContentManager.reloadFile — the resulting DataStore change events flow
// through the existing CJS.DataHotReload broadcast, so the active React/UI
// surfaces re-render without a page reload.
//
// Prod builds strip this entirely: Vite statically replaces `import.meta.hot`
// with `undefined`, so the guarded block is dead-code-eliminated.

interface ReloadResult {
  success: boolean;
  reason?: string;
  upserted?: number;
  removed?: number;
  type?: string;
}

// `import.meta.hot` isn't typed (tsconfig keeps `types: []`); narrow locally.
const hot = (import.meta as unknown as { hot?: {
  on(event: string, cb: (data: { path?: string }) => void): void;
  invalidate?(): void;
} }).hot;

if (hot) {
  hot.on("cjs:data-change", async (payload) => {
    const rel = payload?.path;
    if (!rel) return;
    const CM = (window as unknown as { CJS?: {
      ContentManager?: {
        reloadFile?(p: string): Promise<ReloadResult>;
        loadManifest?(): Promise<unknown>;
      };
    } }).CJS?.ContentManager;
    if (!CM?.reloadFile) return; // engine not up yet — next save will catch it

    try {
      const res = await CM.reloadFile(rel);
      if (res && res.success === false) {
        // Aggregate collections (quips/quiz/trivia) span every source file, so
        // a single-file merge can't rebuild them — fall back to a full reload.
        if (res.reason === "aggregate-category" && CM.loadManifest) {
          await CM.loadManifest();
          console.info(`[cjs] hot-reloaded all content (${rel} is an aggregate collection)`);
        } else {
          console.warn(`[cjs] hot-reload skipped ${rel}:`, res.reason || res);
        }
      } else if (res) {
        console.info(`[cjs] hot-reloaded ${rel} — ${res.upserted ?? 0} upserted, ${res.removed ?? 0} removed`);
      }
    } catch (e) {
      console.warn(`[cjs] hot-reload error for ${rel}:`, e);
    }
  });
}

export {};
