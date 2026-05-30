# Items — AI authoring brief



| | |
| --- | --- |
| **Type** | `items` |
| **Category** | `items` |
| **Scope** | universal |
| **Lives in** | `data/universal/items.json or data/worlds/<world>/items.json` |
| **Schema** | `data/schemas/items.schema.json` |
| **Existing ids** | `data/ai-index/items.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- **Other fields**: `icon`, `description`, `rarity`, `tags`, `buyValue`, `sellValue`, `stackable`, `unique`, `slot`, `weaponType`, `armorType`, `stats`

Equipment sets `slot` (weapon/armor/accessory) + `stats`; consumables carry `effects`. Reuse `rarity` tiers and reference real status/effect ids.

## Example (valid — `npm run author -- items scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "universal",
    "category": "items",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_item",
      "name": "New Item",
      "description": "What the item does.",
      "rarity": "common",
      "slot": "consumable",
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
echo '<entry json>' | npm run author -- items validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- items add
```

Or scaffold → edit → add:
```bash
npm run author -- items scaffold > /tmp/items.json
npm run author -- items add --in /tmp/items.json
```
