# CJS Multi-File Data Layout

This folder now contains the multi-file, multi-world content layout for the editor and combat runtime.

Current runtime status:
- `editor.html` and `combat.html` should load through `data/_manifest.json` first
- legacy files remain as migration input and fallback only
- files marked `status: "stub"` are placeholders for future worlds, not active content

Why this exists:
- future content can grow by world without forcing tools to read one giant bundle
- future AI should be able to read only `data/_manifest.json`, one world `_meta.json`, and one category file
- combat code can stay mostly unchanged if the future loader fills `DataStore` with the same runtime entity shape

How to read this as an AI/editor tool:
1. Start with `data/_manifest.json`
2. Check the manifest entry for the needed `category`, `scope`, and optional `world`
3. Read only the file(s) relevant to the requested world and category
4. Avoid scanning unrelated world folders
5. Treat files marked `status: "stub"` as placeholders, not active game content

Scopes:
- `system`: rules and global data shared by the whole game
- `universal`: cross-world content
- `world`: content that belongs to exactly one world

Common categories:
- `effects`, `statuses`, `quizBank`, `quips` live in `data/system`
- `characters`, `passives`, `skills`, `items`, `food` can be `universal`
- `characters`, `passives`, `monsters`, `skills`, `items`, `materials`, `crafting`, `crops`, `shops`, `encounters`, `zones`, `stories`, `quips` can be `world`

World IDs currently scaffolded:
- `haven`
- `zombie`
- `cyberpunk`
- `neo_starcraft`
- `wuxia_jianghu`
- `wuxia_immortal`
- `fantasy_eldenring`

Stub collection format:

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "haven",
    "category": "items",
    "status": "stub"
  },
  "entries": []
}
```

World meta format:

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-world-meta",
    "scope": "world",
    "world": "haven"
  },
  "world": {
    "id": "haven",
    "displayName": "Haven",
    "ceiling": "S",
    "order": 1,
    "tone": "fantasy_warm",
    "color": "#3b82f6",
    "status": "stub"
  }
}
```

Loader contract:
- load `data/_manifest.json`
- fetch only listed files
- tag loaded entries with `_origin` and `_world`
- merge them into `DataStore`
- preserve current combat/editor runtime interfaces
