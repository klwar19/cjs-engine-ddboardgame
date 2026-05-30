# Travel maps — AI authoring brief

Authored world/zone navigation maps (data/campaigns/<world>/travel_maps/*.json, _file.category = travelMaps). Each entry is a clickable node-and-link map with an optional VN backdrop and SVG decoration layers.

| | |
| --- | --- |
| **Type** | `travelMaps` |
| **Category** | `travelMaps` |
| **Scope** | world |
| **Lives in** | `data/campaigns/<world>/travel_maps/*.json` |
| **Schema** | `data/schemas/travelMaps.schema.json` |
| **Existing ids** | `data/ai-index/travelMaps.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: idString
- `name`: string
- `nodes`: TravelNode[]
- **Other fields**: `world`, `zone`, `defaultLocationId`, `visualMode`, `visualBackdrop`, `visualBackdropPrompt`, `visualBackdropFit`, `canvas`, `visualTheme`, `areaButtons`, `legend`, `visualLayers`, `links`
- **Ops** (`rewards` / `ops` / `suggested` / `failureConsequence`): `{ "op": "<verb>", ...payload }`. The engine's CampaignOps registry is the authority for which verbs exist — the schema only checks `op` is a non-empty string. Common verbs are listed in `data/schemas/README.md`.

A clickable node-and-link map. `nodes` carry `x`/`y` on the `canvas`; `links` connect node ids with `route`/`time`/`risk`. Node `people` / `actions` run campaign `ops` on click. `visualLayers` are decorative SVG; `visualBackdropPrompt` is the art brief.

## Example (valid — `npm run author -- travelMaps scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "<world>",
    "category": "travelMaps",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_travel_map",
      "name": "New Travel Map",
      "world": "<world>",
      "defaultLocationId": "loc_start",
      "canvas": {
        "width": 760,
        "height": 430
      },
      "nodes": [
        {
          "id": "loc_start",
          "name": "Start",
          "type": "base",
          "x": 120,
          "y": 200,
          "description": "Where the route begins."
        },
        {
          "id": "loc_next",
          "name": "Next Stop",
          "type": "scavenge",
          "x": 420,
          "y": 200,
          "description": "The first place worth visiting."
        }
      ],
      "links": [
        {
          "from": "loc_start",
          "to": "loc_next",
          "route": "road",
          "time": 1,
          "risk": "low"
        }
      ]
    }
  ]
}
```

## Author it

```bash
# Validate (no write):
echo '<entry json>' | npm run author -- travelMaps validate --world <world>
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- travelMaps add --world <world> --file <name>
```

Or scaffold → edit → add:
```bash
npm run author -- travelMaps scaffold --world <world> > /tmp/travelMaps.json
npm run author -- travelMaps add --world <world> --file <name> --in /tmp/travelMaps.json
```
