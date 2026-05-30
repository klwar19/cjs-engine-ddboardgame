# Skills — AI authoring brief

Authored skills. Each entry maps to a SkillEntry in src/content/types.ts.

| | |
| --- | --- |
| **Type** | `skills` |
| **Category** | `skills` |
| **Scope** | universal |
| **Lives in** | `data/universal/skills.json or data/worlds/<world>/skills.json` |
| **Schema** | `data/schemas/skills.schema.json` |
| **Existing ids** | `data/ai-index/skills.compact.json` |

Read the compact index first to learn existing ids and avoid collisions.

## Contract

- **IDs**: lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), unique within a file.
- **Required fields** (top-level entry):
- `id`: string
- `name`: string
- `power`: number
- `ap`: number
- `mp`: number
- **Other fields**: `icon`, `description`, `spCost`, `cooldown`, `damageType`, `element`, `scalingStat`, `range`, `aoe`, `aoeSize`, `qte`, `effects`, `levelScaling`, `isUltimate`, `ultimateCost`, `requiredWeaponTypes`, `tags`

`power` is the base; `scalingStat` (S/P/E/C/I/A/L) picks the stat it scales with. Reuse existing `element` / `damageType` / status ids from the compact indexes. Ultimate skills set `isUltimate: true` + `ultimateCost`. `effects` are master-effect refs (`{ effectId, overrides }`) or inline `{ type, ... }`.

## Example (valid — `npm run author -- skills scaffold`)

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "universal",
    "category": "skills",
    "status": "active"
  },
  "entries": [
    {
      "id": "new_skill",
      "name": "New Skill",
      "description": "What the skill does.",
      "power": 10,
      "ap": 1,
      "mp": 0,
      "damageType": "Physical",
      "element": "Physical",
      "scalingStat": "S",
      "range": 1,
      "aoe": null,
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
echo '<entry json>' | npm run author -- skills validate
# Add (validates, writes, registers in the manifest):
echo '<entry json>' | npm run author -- skills add
```

Or scaffold → edit → add:
```bash
npm run author -- skills scaffold > /tmp/skills.json
npm run author -- skills add --in /tmp/skills.json
```
