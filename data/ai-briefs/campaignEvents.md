# Campaign event tables — AI authoring brief

Authored weighted event tables (data/campaigns/<world>/events/*.table.json, _file.category = campaignEvents). Each entry is a named table; its inner `entries` are the rollable events.

| | |
| --- | --- |
| **Type** | `campaignEvents` |
| **Category** | `campaignEvents` |
| **Scope** | world |
| **Lives in** | `data/campaigns/<world>/events/*.table.json` |
| **Schema** | `data/schemas/campaignEvents.schema.json` |
| **Existing ids** | `data/ai-index/campaignEvents.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: idString
- `name`: string
- `entries`: EventEntry[]
- **Other fields**: `world`, `zone`, `hubId`, `tags`, `settings`
- **Ops** (`rewards` / `ops` / `suggested` / `failureConsequence`): `{ "op": "<verb>", ...payload }`. The engine's CampaignOps registry is the authority for which verbs exist — the schema only checks `op` is a non-empty string. Common verbs are listed in `data/schemas/README.md`.

A weighted table; inner `entries` are rolled by `weight`. `suggested` are campaign ops the GM can apply. `requiresParty` gates an event on a party member; `settings` / `locationKinds` gate on context. Link `oracleTableId` to deepen an event.

## Example (valid — `npm run author -- campaignEvents scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "campaignEvents",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_event_table",
      "name": "New Event Table",
      "world": "<world>",
      "tags": [
        "new"
      ],
      "settings": [
        "town"
      ],
      "entries": [
        {
          "weight": 10,
          "id": "new_event",
          "type": "social",
          "title": "New Event",
          "prompt": "A short description of what the party encounters.",
          "suggested": [
            {
              "op": "log",
              "text": "Something happened."
            }
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
echo '<entry json>' | npm run author -- campaignEvents validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- campaignEvents add --world <world> --file <name>
```

Or scaffold → edit → add:
```bash
npm run author -- campaignEvents scaffold --world <world> > /tmp/campaignEvents.json
npm run author -- campaignEvents add --world <world> --file <name> --in /tmp/campaignEvents.json
```
