# Materials — AI authoring brief



| | |
| --- | --- |
| **Type** | `materials` |
| **Category** | `materials` |
| **Scope** | universal |
| **Lives in** | `data/universal/materials.json or data/worlds/<world>/materials.json` |
| **Schema** | `data/schemas/items.schema.json` |
| **Existing ids** | `data/ai-index/items.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- **Other fields**: `icon`, `description`, `rarity`, `tags`, `buyValue`, `sellValue`, `stackable`, `unique`, `slot`, `weaponType`, `armorType`, `stats`

Crafting inputs — usually just id/name/rarity/tags. They are referenced by crafting recipes and activity/quest reward ops.

## Example (valid — `npm run author -- materials scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "universal",
    "category": "materials",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_material",
      "name": "New Material",
      "description": "A crafting material.",
      "rarity": "common",
      "tags": [
        "material"
      ]
    }
  ]
}
```

## Author it

```bash
# Validate (no write):
echo '<entry json>' | npm run author -- materials validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- materials add
```

Or scaffold → edit → add:
```bash
npm run author -- materials scaffold > /tmp/materials.json
npm run author -- materials add --in /tmp/materials.json
```
