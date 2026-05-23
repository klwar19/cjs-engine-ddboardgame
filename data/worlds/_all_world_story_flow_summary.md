# All-World Story Flow Summary

Read this first before developing cross-world story. It explains what to open next and what can stay summarized.

## Active Flow

1. Earth is the human anchor: Lily, school, delivery work, Luna/Meilin suspicion, and Earth Heat.
2. Haven Arc 1 is the main authored story: Bin returns to Frostbitten, splits into gate/tavern branches, finds Lily, follows the coin trail, and closes with family dinner.
3. Haven side-story chains support the hub between main chapters: paperwork comedy, tavern debt comedy, frostcap gathering, firemoss supply, forge prep, and Bowy's character route.
4. Earth return hooks process the emotional consequences after Haven: hospital visits, crystal support, med-gel analysis, old notebooks, and ordinary work.
5. Zombie world is the survival expedition loop: Last Light map, Burnice, scavenge, clinic medicine, safehouse building, noise, and infection pressure.
6. Bazaar is the optional cross-world economy loop: arena, auction, food row, prize board, Bazaar Renown, and Bazaar Debt.
7. Future worlds are parked by rank and tone: Neo-Kowloon, Sectors, Jianghu, Immortal Realms, and Sundered Lands.

## Read Order For AI

Always read the compact structured context before opening full prose or authored content files:

- `data/worlds/_ai_story_context_index.json`
- `data/worlds/<world>/story_context/index.json`
- `data/worlds/<world>/story_summary.md` only when you need fuller prose
- exact sequence, quest, event, travel map, or activity files only after choosing the current arc/bucket

After any AI-authored story, event, quest, or branch, update or propose a `story_context_update` for the matching world `story_context/index.json`. Keep it short: new content summary, previous-arc carryover if the arc closed, event/quest fit, and current plus potential consequence points.

If writing Haven main story, read:

- `data/worlds/haven/story_summary.md`
- `data/worlds/haven/story_context/index.json`
- `data/campaigns/haven/sequences/_sequence_index.json`
- The exact sequence file for the chosen chapter
- `data/campaigns/haven/story_director/haven_story_director_v1.json` only when pressure, side-flow, or protected-truth guidance matters

If writing Haven side content, read:

- `data/worlds/haven/story_summary.md`
- `data/worlds/haven/story_context/index.json`
- `data/campaigns/haven/quest_chains/frostbitten_quest_chains.json`
- `data/campaigns/haven/battle_sets/frostbitten_battle_sets.json`
- `data/campaigns/haven/map_seeds/frostbitten_map_seeds.json`

If writing Earth, Zombie, or Bazaar, read that world's `story_context/index.json`, then `story_summary.md` if needed, then its `travel_maps` and `activity_packs` files.

If writing future stub worlds, read only the world's `story_context/index.json`, `story_summary.md`, and `_meta.json` unless new campaign files have been added.

## Cross-World Consequence Rules

- Lily's cure path is hope-with-cost. Do not instantly cure her.
- Earth Heat rises when cross-world activity becomes visible or socially suspicious.
- Zombie materials can support Earth hospital paths and Bazaar lots.
- Bazaar rewards should create Renown, Debt, or future obligations.
- Haven protected truths stay parked unless the GM promotes them.
- Future worlds should not overwrite the active Earth/Haven emotional spine.
