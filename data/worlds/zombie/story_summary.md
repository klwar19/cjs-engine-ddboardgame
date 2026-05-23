# Last Light Story Summary

Read this first for Zombie world story work. Last Light is the survival expedition loop: route planning, scavenging, building, medical salvage, and deciding what limited resources mean.

## Current Arc

Zombie world has no full authored sequence arc yet. The current playable slice is the Last Light visual travel map plus safehouse activity pack. It should feel tense, practical, and resource-driven, with Burnice as the first strong route-planner NPC.

## Chapter And Branch Summary

| Chapter | Branch | Source | Summary | Next |
| --- | --- | --- | --- | --- |
| Z-00 First City Slice | Trunk | `data/campaigns/zombie/activity_packs/zombie_safehouse_activity_pack.json` | Recap: Last Light is travel, scavenge, build, and resource triage. | Z-01 |
| Z-01 Last Light Map | Trunk | `data/campaigns/zombie/travel_maps/zombie_last_light_travel_map.json` | The player starts at Rooftop Safehouse and can route to Mall District, Clinic Block, Subway Line, and Broadcast Tower. | Scavenge/build/objective branches |
| Z-01.s Mall Sweep | Scavenge | `data/campaigns/zombie/activity_packs/zombie_safehouse_activity_pack.json` | Mall Shelf Sweep gives food/scrap, raises noise, and sets `milestone.zombie.first_scavenge`. | Unlocks Earth/Bazaar medical hooks |
| Z-01.m Clinic Medicine Run | Medical | `data/campaigns/zombie/activity_packs/zombie_safehouse_activity_pack.json` | Clinic runs produce `zombie_med_gel`, sterile wrap, and infection pressure. | Earth med-gel analysis |
| Z-01.b Safehouse Build | Build | `data/campaigns/zombie/activity_packs/zombie_safehouse_activity_pack.json` | Barricade and infirmary upgrades convert scrap into survival stability. | Future defense events |
| Z-01.bu Burnice Routes | Character | `data/campaigns/zombie/travel_maps/zombie_last_light_travel_map.json` and activity pack | Meeting Burnice unlocks flare route, clinic cover burn, and stair firebreak activities. | Character route and better scavenge pacing |

## Map Art Prompt

The active image prompt is stored in `data/campaigns/zombie/travel_maps/zombie_last_light_travel_map.json` as `visualBackdropPrompt`. A copy also lives in `docs/MAP_ART_PROMPTS.md`.

## Integration Rules

Zombie materials can support Earth hospital routes and Bazaar auctions. Noise and infection pressure should rise when rewards are strong. Keep gore low and decision pressure high.

## Where To Read Next

- Travel map: `data/campaigns/zombie/travel_maps/zombie_last_light_travel_map.json`
- Activities: `data/campaigns/zombie/activity_packs/zombie_safehouse_activity_pack.json`
- Map art prompts: `docs/MAP_ART_PROMPTS.md`
