# Passives — AI authoring brief



| | |
| --- | --- |
| **Type** | `passives` |
| **Category** | `passives` |
| **Scope** | universal |
| **Lives in** | `data/universal/passives.json or data/worlds/<world>/passives.json` |
| **Schema** | `data/schemas/passives.schema.json` |
| **Existing ids** | `data/ai-index/passives.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- **Other fields**: `icon`, `description`, `tags`, `effects`, `ranks`

Keep effects as master-effect refs where possible. `ranks` lets a passive scale with invested points.

## Example (valid — `npm run author -- passives scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "universal",
    "category": "passives",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_passive",
      "name": "New Passive",
      "description": "What the passive does.",
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
echo '<entry json>' | npm run author -- passives validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- passives add
```

Or scaffold → edit → add:
```bash
npm run author -- passives scaffold > /tmp/passives.json
npm run author -- passives add --in /tmp/passives.json
```
