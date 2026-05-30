# Food — AI authoring brief



| | |
| --- | --- |
| **Type** | `food` |
| **Category** | `food` |
| **Scope** | universal |
| **Lives in** | `data/universal/food.json or data/worlds/<world>/food.json` |
| **Schema** | `data/schemas/items.schema.json` |
| **Existing ids** | `data/ai-index/items.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- **Other fields**: `icon`, `description`, `rarity`, `tags`, `buyValue`, `sellValue`, `stackable`, `unique`, `slot`, `weaponType`, `armorType`, `stats`

Cookable ingredients and dishes. Dishes carry `effects`; ingredients are plain. Referenced by the cooking minigame and farm crops.

## Example (valid — `npm run author -- food scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "universal",
    "category": "food",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_food",
      "name": "New Food",
      "description": "A cookable ingredient or dish.",
      "rarity": "common",
      "tags": [
        "food"
      ]
    }
  ]
}
```

## Author it

```bash
# Validate (no write):
echo '<entry json>' | npm run author -- food validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- food add
```

Or scaffold → edit → add:
```bash
npm run author -- food scaffold > /tmp/food.json
npm run author -- food add --in /tmp/food.json
```
