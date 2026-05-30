# Oracle tables — AI authoring brief

Authored oracle keyword/prompt tables (data/campaigns/<world>/oracles/*.json, _file.category = oracleTables). The solo/GM loop rolls a keyword bank or a pre-written prompt. No runtime AI is required.

| | |
| --- | --- |
| **Type** | `oracleTables` |
| **Category** | `oracleTables` |
| **Scope** | world |
| **Lives in** | `data/campaigns/<world>/oracles/*.json` |
| **Schema** | `data/schemas/oracleTables.schema.json` |
| **Existing ids** | `data/ai-index/oracleTables.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: idString
- `name`: string
- **Other fields**: `world`, `zone`, `hubId`, `notes`, `defaultCanonRisk`, `tables`, `prompts`

`tables` are keyword banks the oracle composes (adjectives/nouns/verbs/objects/twists); `prompts` are pre-written results. No runtime AI — the GM/solo loop rolls and decides. `canonRisk` (green/yellow/red) gates how freely a result becomes canon.

## Example (valid — `npm run author -- oracleTables scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "oracleTables",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_oracle",
      "name": "New Oracle",
      "world": "<world>",
      "defaultCanonRisk": "green",
      "tables": {
        "adjectives": [
          "cracked",
          "warm"
        ],
        "nouns": [
          "bell",
          "lantern"
        ],
        "verbs": [
          "remembers",
          "follows"
        ]
      },
      "prompts": [
        {
          "id": "new_prompt",
          "text": "The cracked bell remembers something it should not.",
          "suggestedUse": "Travel omen.",
          "canonRisk": "green",
          "tags": [
            "omen"
          ]
        }
      ]
    }
  ]
}
```

## Author it

```bash
# Validate (no write):
echo '<entry json>' | npm run author -- oracleTables validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- oracleTables add --world <world> --file <name>
```

Or scaffold → edit → add:
```bash
npm run author -- oracleTables scaffold --world <world> > /tmp/oracleTables.json
npm run author -- oracleTables add --world <world> --file <name> --in /tmp/oracleTables.json
```
