# Story director packs — AI authoring brief

Authored solo/GM story-director guidance (data/campaigns/<world>/story_director/*.json, _file.category = storyDirectorPacks). Each entry is an arc guide: stages, rollable beats (scenes, Peri interruptions, memory shards, pressure ticks), protected truths, and side-quest flow.

| | |
| --- | --- |
| **Type** | `storyDirectorPacks` |
| **Category** | `storyDirectorPacks` |
| **Scope** | world |
| **Lives in** | `data/campaigns/<world>/story_director/*.json` |
| **Schema** | `data/schemas/storyDirectorPacks.schema.json` |
| **Existing ids** | `data/ai-index/storyDirector.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: idString
- `name`: string
- `stages`: object[]
- `sceneBeats`: Beat[]
- **Other fields**: `version`, `world`, `zone`, `hubId`, `summary`, `pressureRule`, `defaultCanonRisk`, `tonePillars`, `plotPolicy`, `metrics`, `protectedTruths`, `periInterruptions`, `memoryShards`, `pressureTicks`, `sideQuestFlow`
- **Ops** (`rewards` / `ops` / `suggested` / `failureConsequence`): `{ "op": "<verb>", ...payload }`. The engine's CampaignOps registry is the authority for which verbs exist — the schema only checks `op` is a non-empty string. Common verbs are listed in `data/schemas/README.md`.

Arc guidance for solo/GM play. `stages` map to chapter ranges; rollable beats (`sceneBeats`, `periInterruptions`, `memoryShards`, `pressureTicks`) carry a `prompt` + `suggestedChoices` (each a label + campaign `ops`). `protectedTruths` mark reveals that must stay red until promoted. `metrics` are the trackable arc pressures.

## Example (valid — `npm run author -- storyDirectorPacks scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "storyDirectorPacks",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_story_director",
      "name": "New Story Director",
      "version": 1,
      "world": "<world>",
      "summary": "Arc guidance for this world.",
      "defaultCanonRisk": "green",
      "stages": [
        {
          "id": "stage_one",
          "name": "Opening",
          "chapterMin": 1,
          "chapterMax": 1,
          "summary": "How the arc opens.",
          "tags": [
            "intro"
          ]
        }
      ],
      "sceneBeats": [
        {
          "id": "beat_one",
          "title": "Opening Beat",
          "stageIds": [
            "stage_one"
          ],
          "canonRisk": "green",
          "weight": 10,
          "tags": [
            "intro"
          ],
          "prompt": "Something story-shaped the GM/solo player can drop in.",
          "suggestedChoices": [
            {
              "label": "An option",
              "ops": [
                {
                  "op": "give_jp",
                  "amount": 1
                }
              ]
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
echo '<entry json>' | npm run author -- storyDirectorPacks validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- storyDirectorPacks add --world <world> --file <name>
```

Or scaffold → edit → add:
```bash
npm run author -- storyDirectorPacks scaffold --world <world> > /tmp/storyDirectorPacks.json
npm run author -- storyDirectorPacks add --world <world> --file <name> --in /tmp/storyDirectorPacks.json
```
