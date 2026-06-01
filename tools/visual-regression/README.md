# Visual regression harness (Phase K.2)

Renders every campaign React tab (and each always-mounted chrome strip)
against a **single fixed `CampaignState` fixture**, serializes the DOM tree
with `react-dom/server`, and diffs it against a committed snapshot. An
unexpected diff fails CI — that is the regression signal.

This realizes `MIGRATION_PHASE_D_PLAN.md` K.2 and protects the React tree the
D–H migration produced: a stray `className`, reordered element, or dropped
node in any tab shows up as a snapshot diff in review.

## Run it

```bash
npm run vr          # check rendered output against committed snapshots
npm run vr:update   # re-baseline after an INTENTIONAL UI change
node tools/visual-regression/run.cjs --list   # list case names
```

`node test_visual_regression.js` (part of `npm test`, so it runs in CI) does
the same check in-process and additionally enforces the **coverage contract**:
every tab in `CampaignShell`'s `REACT_TAB_COMPONENTS` map must have a
`tab-<id>` case, and no orphan snapshots may linger.

## How it works (no new dependencies)

- `load-tsx.cjs` — a recursive CommonJS loader that transpiles the project's
  `.ts/.tsx` with the installed `typescript` package (`jsx: react-jsx`, the
  same transform vite uses), resolves relative imports, and delegates bare
  imports (`react`, `react-dom/server`) to the one installed package. This is
  the existing `test_selector_store.js` / `test_virtual_list.js` pattern,
  generalized to a whole import graph.
- `env.cjs` — minimal `window`/`document`/`ResizeObserver` shims.
  `renderToStaticMarkup` never touches the DOM, so these are inert stubs (no
  jsdom dependency).
- `cases.tsx` — the **type-checked** case registry + the shared `CampaignState`
  fixture + `installEngine()` (the bounded `window.CJS.*` engine surface the
  data bridges read). Because `tsconfig` includes this file, every `state={…}`
  / `data={…}` prop is verified against the real component contract, so a
  fixture cannot drift from the shape it stands in for.
- `run.cjs` — loads the real TS util modules,
  installs the engine stub, renders each case, normalizes
  the HTML, and writes (`--update`) or diffs (`--list`/default) the snapshots.

## Adding a tab or component

1. Add the component + its fixture data to `cases.tsx` (`tab(...)`).
2. `npm run vr:update` to write the snapshot.
3. Commit the new `__snapshots__/*.html` alongside the code.

`test_visual_regression.js` fails until a registered tab has a case, so new
tabs can't ship un-snapshotted.

## Scope notes (intentional)

- **External-module tabs** (`inventory` / `shops` / `craft` / `cook` / `farm`
  / `relationships`) are React wrappers around vanilla island HTML that the
  plan keeps out of the JSX migration. Their modules return a clearly-labeled
  `[<name> island body]` sentinel, so the snapshot pins the **wrapper** (the
  migrated React part), not fabricated island content.
- **World map / activities** render their honest empty-state: the travel-map
  SVG is an explicit out-of-scope bridged island (`campaign-world-map.js`), so
  the fixture does not synthesize SVG geometry. The snapshot still pins the
  React wrapper's empty branch.
- The **roster detail row** is now JSX. The snapshot exercises the migrated
  hero / vitals / stats / detail-card tree with a fixture member (base
  character/job records resolve to graceful fallbacks).
