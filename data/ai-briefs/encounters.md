# Encounters — AI authoring brief

Per-world combat encounters: grid map plus starting unit placements.

| | |
| --- | --- |
| **Type** | `encounters` |
| **Category** | `encounters` |
| **Scope** | world |
| **Lives in** | `data/worlds/<world>/encounters.json` |
| **Schema** | `data/schemas/encounters.schema.json` |
| **Existing ids** | `data/ai-index/encounters.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- `width`: number
- `height`: number
- `grid`: array[]
- `units`: object[]
- **Other fields**: `objectives`, `environment`, `tags`

A grid battle. `grid` is `height` rows × `width` cols of cell-type strings; `units` place character/monster ids at `[x, y]`. Keep unit ids pointing at real combatants. `objectives` define win/lose beyond elimination.

## Example (valid — `npm run author -- encounters scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "encounters",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_encounter",
      "name": "New Encounter",
      "width": 6,
      "height": 6,
      "grid": [
        [
          "empty",
          "empty",
          "empty",
          "empty",
          "empty",
          "empty"
        ],
        [
          "empty",
          "empty",
          "empty",
          "empty",
          "empty",
          "empty"
        ],
        [
          "empty",
          "empty",
          "empty",
          "empty",
          "empty",
          "empty"
        ],
        [
          "empty",
          "empty",
          "empty",
          "empty",
          "empty",
          "empty"
        ],
        [
          "empty",
          "empty",
          "empty",
          "empty",
          "empty",
          "empty"
        ],
        [
          "empty",
          "empty",
          "empty",
          "empty",
          "empty",
          "empty"
        ]
      ],
      "units": [
        {
          "id": "new_monster",
          "pos": [
            2,
            2
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
echo '<entry json>' | npm run author -- encounters validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- encounters add --world <world>
```

Or scaffold → edit → add:
```bash
npm run author -- encounters scaffold --world <world> > /tmp/encounters.json
npm run author -- encounters add --world <world> --in /tmp/encounters.json
```
