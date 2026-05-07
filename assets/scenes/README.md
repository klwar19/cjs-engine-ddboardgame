# Mini Scene Video Assets

Drop short scene clips here and register them in `data/scene-manifest.json`.

Recommended first test file:

```text
assets/scenes/campaign/roll-event-01.mp4
```

Suggested layout:

```text
assets/scenes/
  campaign/
    roll-event-01.mp4
    random-battle-01.mp4
    oracle-01.mp4
    frostbitten/
      roll-event-01.mp4
  combat/
    attack-01.mp4
  posters/
    roll-event-01.jpg
```

Keep clips brief and lightweight. A good target is 1-3 seconds, muted,
and under roughly 1 MB when possible. MP4 works for testing; WebM plus MP4
fallback is a good later upgrade for smaller files.

## Naming

Use clear, sortable names:

```text
assets/scenes/<area>/<world-or-shared>/<function>-NN.mp4
```

Examples:

```text
assets/scenes/campaign/roll-event-01.mp4
assets/scenes/campaign/frostbitten/roll-event-01.mp4
assets/scenes/campaign/frostbitten/random-battle-01.mp4
assets/scenes/combat/attack-01.mp4
```

## Manifest Pointers

`data/scene-manifest.json` controls which clip plays for each game function.

- `triggers.campaignSources` maps CampaignState sources like `event_roll`
  to a scene key.
- `triggers.combatLogTypes` maps combat log event types like `hit`.
- `scenes.*.clips[].src` points to the video file.
- `clips[].world` can be `any` or a specific world id.
- `clips[].sort` keeps clips ordered for editing.
- `clips[].weight` changes random-pick frequency when several clips match.
- If a clip matches the current world, it is preferred over `world: "any"`.

To add a world-specific roll-event scene, add the file and then add another
clip entry under `scenes.campaign.roll_event.clips`:

```json
{
  "id": "frostbitten-roll-event-01",
  "src": "assets/scenes/campaign/frostbitten/roll-event-01.mp4",
  "world": "frostbitten",
  "functionKey": "roll_event",
  "tags": ["campaign", "roll", "event", "frostbitten"],
  "sort": 20,
  "weight": 1
}
```

To add a new function later, add a new scene under `scenes`, then point a
trigger to it. Existing code reads those trigger mappings from the manifest,
so many future source-to-video changes can be done by editing JSON only.
