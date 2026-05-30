# Campaign quests — AI authoring brief

Authored campaign quest-template collections (data/campaigns/<world>/quests/*.json, _file.category = campaignQuests). Each entry is a named bundle of quest templates the GM/solo loop can instantiate.

| | |
| --- | --- |
| **Type** | `campaignQuests` |
| **Category** | `campaignQuests` |
| **Scope** | world |
| **Lives in** | `data/campaigns/<world>/quests/*.json` |
| **Schema** | `data/schemas/campaignQuests.schema.json` |
| **Existing ids** | `data/ai-index/campaignQuests.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: idString
- `name`: string
- `templates`: QuestTemplate[]
- **Other fields**: `world`, `zone`, `hubId`, `notes`, `tags`
- **Ops** (`rewards` / `ops` / `suggested` / `failureConsequence`): `{ "op": "<verb>", ...payload }`. The engine's CampaignOps registry is the authority for which verbs exist — the schema only checks `op` is a non-empty string. Common verbs are listed in `data/schemas/README.md`.

Each set bundles `templates`. Objectives advance via `progressTriggers` (tag-matched battle outcomes — `requiresAnyTags` like `defeated_tag:wolf`). `rewards` / `failureConsequence` are campaign ops. `linkedScenario` / `battleSetIds` / `linkedMapNodes` reference existing scenario / battle-set / travel-node ids. `repeat.variants` make a quest re-rollable.

## Example (valid — `npm run author -- campaignQuests scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "campaignQuests",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_quest_set",
      "name": "New Quest Set",
      "world": "<world>",
      "templates": [
        {
          "id": "new_quest",
          "title": "New Quest",
          "status": "idea",
          "giver": "Quest Giver",
          "summary": "One-line pitch for the quest.",
          "objectives": [
            {
              "id": "obj_one",
              "label": "Do the first thing",
              "current": 0,
              "required": 1
            }
          ],
          "rewards": [
            {
              "op": "give_jp",
              "amount": 1
            }
          ],
          "tags": [
            "new"
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
echo '<entry json>' | npm run author -- campaignQuests validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- campaignQuests add --world <world> --file <name>
```

Or scaffold → edit → add:
```bash
npm run author -- campaignQuests scaffold --world <world> > /tmp/campaignQuests.json
npm run author -- campaignQuests add --world <world> --file <name> --in /tmp/campaignQuests.json
```
