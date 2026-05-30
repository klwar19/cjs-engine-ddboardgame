# Statuses — AI authoring brief

Status registry (buffs/debuffs/environments). Note: the legacy data/system/statuses.json may omit the _file envelope; the lint allows that as a transitional shape.

| | |
| --- | --- |
| **Type** | `statuses` |
| **Category** | `statuses` |
| **Scope** | system |
| **Lives in** | `data/system/statuses.json` |
| **Schema** | `data/schemas/statuses.schema.json` |
| **Existing ids** | `data/ai-index/statuses.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- **Other fields**: `icon`, `desc`, `category`, `maxStacks`, `defaultDuration`, `tags`

`category` is buff/debuff/neutral/environment. `tickEffect` runs each turn; `onApplyEffects` / `onRemoveEffects` fire at the edges. Use `maxStacks` + `defaultDuration` for stacking DoTs/buffs.

## Example (valid — `npm run author -- statuses scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "system",
    "category": "statuses",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_status",
      "name": "New Status",
      "desc": "What the status does.",
      "category": "buff",
      "maxStacks": 1,
      "defaultDuration": 2,
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
echo '<entry json>' | npm run author -- statuses validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- statuses add
```

Or scaffold → edit → add:
```bash
npm run author -- statuses scaffold > /tmp/statuses.json
npm run author -- statuses add --in /tmp/statuses.json
```
