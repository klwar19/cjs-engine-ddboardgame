# Haven Story Summary

Read this first for Haven story work. Open the referenced files only when you need exact dialogue, operations, or node data.

## Current Arc

Haven Arc 1 is the active authored story. It follows Bin's return to Frostbitten after two missing months, branches through gate or tavern entry routes, reconverges around Lily and the rude-candle coin mystery, then closes with family dinner and a larger Arc 2 hook.

## Chapter And Branch Summary

| Chapter | Branch | File | Summary | Next |
| --- | --- | --- | --- | --- |
| 1.1 Snow on the Road Home | Trunk | `data/campaigns/haven/sequences/story/arc1/ch01_return/part01_frostwood_return.json` | Bin wakes in the Frostwood, survives the road, finds a strange coin, and chooses how to enter Frostbitten. | Gate Route or Tavern Route |
| 1.1.a Gate Office Day | Gate | `data/campaigns/haven/sequences/story/arc1/ch01_return/part01a_gate_office_day.json` | Lysa makes Bin handle gate-office paperwork; the frostcap shortage and coin trail enter official records. | 1.2.a |
| 1.1.b Back Door at the Frosted Mug | Tavern | `data/campaigns/haven/sequences/story/arc1/ch01_return/part01b_mug_back_door.json` | Bin sneaks through the Mug, gets soup and gossip, brawls, and inherits the screaming-log problem. | 1.2.b |
| 1.2.a Apothecary's Apprentice | Gate | `data/campaigns/haven/sequences/story/arc1/ch02_apprentice/part02a_apothecary_apprentice.json` | Bin reaches Mitia's apothecary, finds Lily working there, and follows the frostcap shortage into the grove. | 1.3 |
| 1.2.b The Haunted Firewood | Tavern | `data/campaigns/haven/sequences/story/arc1/ch02_apprentice/part02b_haunted_firewood.json` | The screaming log contains a rude frost sprite; Bin delivers it toward the apothecary and meets Lily through comedy. | 1.3 |
| 1.3 The Cat Job | Converged | `data/campaigns/haven/sequences/story/arc1/ch03_cat/part03_cat_job.json` | Bin and Lily find a missing tavern cat at Hermit Rolf's, fight wolves, and confirm the coin trail is tied to cough questions. | 1.4 |
| 1.4 Bread, Stew, and a Knock at the Door | Trunk | `data/campaigns/haven/sequences/story/arc1/ch04_dinner/part04_family_dinner.json` | Family dinner at Garr's closes Arc 1 with warmth, Garr's journal, the mystery buyer, and a sealed-envelope hook. | Arc 2 later |

## Side Story Integration

Side-story chains live in `data/campaigns/haven/quest_chains/frostbitten_quest_chains.json`. They should feel like optional VN mini-arcs that feed the same hub state: comedy in early return, practical field jobs during Frostwood opening, prep during temple/chimera pressure, and comfort loops after Pocket Haven.

Best first chains:

- `haven_qchain_ledger_of_the_ghost`: paperwork comedy that supports Bin's public return.
- `haven_qchain_three_silver_discount`: recurring tavern/rival comedy.
- `haven_qchain_frostcap_fever`: first field run and food supply bridge.

Prep chains:

- `haven_qchain_warm_lights_cold_hands`: firemoss supply trail, escort, hub warmth.
- `haven_qchain_ironhand_errand`: forge repair and gear-prep loop.
- `haven_qchain_thunder_needs_a_voice`: Bowy character chain, yellow risk only because it brushes Garr-adjacent memory routes.

## Protected Truths

Do not force direct reveals for Bin's Haven origin, Garr's Peri secret, Mitia's hidden bloodline, Lily's cure path, previous Jesters, major deaths, or final romance decisions. Use green/yellow clues and parked rumors unless the GM promotes a red-risk beat.

## Where To Read Next

- Fast branch index: `data/campaigns/haven/sequences/_sequence_index.json`
- Arc guidance and pressure rules: `data/campaigns/haven/story_director/haven_story_director_v1.json`
- Side-story chains: `data/campaigns/haven/quest_chains/frostbitten_quest_chains.json`
- Hub places: `data/campaigns/haven/hubs/hub_frostbitten.json`
- Battle hooks: `data/campaigns/haven/battle_sets/frostbitten_battle_sets.json`
- Map hooks: `data/campaigns/haven/map_seeds/frostbitten_map_seeds.json`
