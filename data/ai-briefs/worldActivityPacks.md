# World activity packs — AI authoring brief

Authored world activity loops (data/campaigns/<world>/activity_packs/*.json, _file.category = worldActivityPacks). Each entry is a pack of location-bound activities (scavenge, build, etc.) plus optional journal entries.

| | |
| --- | --- |
| **Type** | `worldActivityPacks` |
| **Category** | `worldActivityPacks` |
| **Scope** | world |
| **Lives in** | `data/campaigns/<world>/activity_packs/*.json` |
| **Schema** | `data/schemas/worldActivityPacks.schema.json` |
| **Existing ids** | `data/ai-index/worldActivities.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: idString
- `name`: string
- `activities`: WorldActivity[]
- **Other fields**: `version`, `world`, `zone`, `hubId`, `journalEntries`
- **Ops** (`rewards` / `ops` / `suggested` / `failureConsequence`): `{ "op": "<verb>", ...payload }`. The engine's CampaignOps registry is the authority for which verbs exist — the schema only checks `op` is a non-empty string. Common verbs are listed in `data/schemas/README.md`.

Location-bound loops (scavenge/build/etc.). Each `activity` lists `locationIds` (travel-map node ids), an optional `cost` bucket, and `ops` on use. `conditions.requiresMilestones` gates availability; `conditions.any` is an OR-group.

## Example (valid — `npm run author -- worldActivityPacks scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "worldActivityPacks",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_activity_pack",
      "name": "New Activity Pack",
      "version": 1,
      "world": "<world>",
      "activities": [
        {
          "id": "new_activity",
          "type": "scavenge",
          "title": "New Activity",
          "locationIds": [
            "loc_start"
          ],
          "summary": "What the player does here.",
          "buttonLabel": "Do It",
          "rewardText": "materials +1",
          "ops": [
            {
              "op": "give_material",
              "id": "some_material",
              "qty": 1
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
echo '<entry json>' | npm run author -- worldActivityPacks validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- worldActivityPacks add --world <world> --file <name>
```

Or scaffold → edit → add:
```bash
npm run author -- worldActivityPacks scaffold --world <world> > /tmp/worldActivityPacks.json
npm run author -- worldActivityPacks add --world <world> --file <name> --in /tmp/worldActivityPacks.json
```
