# Characters — AI authoring brief

Per-world monster entries. Format applies equally to universal characters.

| | |
| --- | --- |
| **Type** | `characters` |
| **Category** | `characters` |
| **Scope** | universal |
| **Lives in** | `data/universal/characters.json or data/worlds/<world>/characters.json` |
| **Schema** | `data/schemas/monsters.schema.json` |
| **Existing ids** | `data/ai-index/characters.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- `team`: string
- **Other fields**: `icon`, `portrait`, `rank`, `type`, `stats`, `skills`, `ultimateSkillId`, `ultimateMax`, `equipment`, `innatePassives`, `behaviorAI`, `weak`, `resist`, `immune`, `loot`, `tags`

Playable/NPC units. `team` is player/enemy/neutral. `stats` is the S/P/E/C/I/A/L block (E≈HP). `skills` and `innatePassives` reference existing ids; `ultimateSkillId` sets the ultimate.

## Example (valid — `npm run author -- characters scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "universal",
    "category": "characters",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_character",
      "name": "New Character",
      "team": "player",
      "rank": "F",
      "stats": {
        "S": 5,
        "P": 5,
        "E": 6,
        "C": 5,
        "I": 5,
        "A": 5,
        "L": 5
      },
      "skills": [],
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
echo '<entry json>' | npm run author -- characters validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- characters add
```

Or scaffold → edit → add:
```bash
npm run author -- characters scaffold > /tmp/characters.json
npm run author -- characters add --in /tmp/characters.json
```
