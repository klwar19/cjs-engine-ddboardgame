# Monsters — AI authoring brief

Per-world monster entries. Format applies equally to universal characters.

| | |
| --- | --- |
| **Type** | `monsters` |
| **Category** | `monsters` |
| **Scope** | world |
| **Lives in** | `data/worlds/<world>/monsters.json` |
| **Schema** | `data/schemas/monsters.schema.json` |
| **Existing ids** | `data/ai-index/monsters.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- `team`: string
- **Other fields**: `icon`, `portrait`, `rank`, `type`, `stats`, `skills`, `ultimateSkillId`, `ultimateMax`, `equipment`, `innatePassives`, `behaviorAI`, `weak`, `resist`, `immune`, `loot`, `tags`

Same shape as characters but enemy-side. Set `weak` / `resist` / `immune` elements, a `behaviorAI` archetype, and `loot`. Reference real skill ids in `skills`.

## Example (valid — `npm run author -- monsters scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "monsters",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_monster",
      "name": "New Monster",
      "team": "enemy",
      "rank": "F",
      "stats": {
        "S": 5,
        "P": 5,
        "E": 5,
        "C": 5,
        "I": 5,
        "A": 5,
        "L": 5
      },
      "skills": [],
      "weak": [],
      "resist": [],
      "tags": [
        "new"
      ]
    }
  ]
}
```

## Author it

```bash
# Validate (no write):
echo '<entry json>' | npm run author -- monsters validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- monsters add --world <world>
```

Or scaffold → edit → add:
```bash
npm run author -- monsters scaffold --world <world> > /tmp/monsters.json
npm run author -- monsters add --world <world> --in /tmp/monsters.json
```
