# CJS Story Director Reference

This is the working reference for the Campaign Mode Story Director. It is meant to keep the app, tabletop play, solo-GM play, random events, rumors, side quests, and authored story beats pointed in the same direction without locking the plot forever.

The machine-readable pack lives at:

`data/campaigns/haven/story_director/haven_story_director_v1.json`

The UI lives in:

`campaign.html` -> Town -> Story Director

## Local Story Sources

This pass used the newest Arc 1 sources from:

- `C:\Users\klwar\Desktop\tai lieu nhap hoc sp\CJS\IDEAS ARC 1\CJS main story.txt`
- `C:\Users\klwar\Desktop\tai lieu nhap hoc sp\CJS\IDEAS ARC 1\ARC1_HAVEN_FULL_BRAINSTORM.md`
- `C:\Users\klwar\Desktop\tai lieu nhap hoc sp\CJS\IDEAS ARC 1\Haven_Arc1_Plot_Bible.docx`
- `C:\Users\klwar\Desktop\new story example.docx`

The most important stable pieces are:

- Bin returns to Haven after a two-month absence in Haven time.
- Garr, Bowy, and Mitia are family by choice, not background party slots.
- Frostbitten should feel alive: guild staff, rival adventurers, tavern nonsense, small debts, bad paperwork, and warm fires.
- Arc 1 escalates from return comedy to Frostwood weirdness to old temple pressure to the Frostfire Chimera.
- Pocket Haven unlocks after the Chimera and becomes the cross-world base for crafting, farming, recruiting, memory, and Earth return hooks.
- Lily remains the human anchor. The story can joke constantly, but Lily's survival path is not a cheap punchline.

## Research Touchstones

These are tone references, not content to copy:

- [Xie Yan from I'm An Evil God](https://im-an-evil-god.fandom.com/wiki/Xie_Yan): a world-travel/system protagonist whose progress is tied to provoking emotion, schemes, and performance. Useful lesson: confidence can be funny, tactical, and emotionally motivated at the same time.
- [Xu Que from Ultimate Scheming System](https://ultimate-scheming-system.fandom.com/wiki/Xu_Que): an over-the-top "act tough" style system protagonist. Useful lesson: shamelessness, fake grandeur, cooking/modern references, and ridiculous self-branding can become a running mechanical joke.
- [CLANNAD on Steam](https://store.steampowered.com/app/324160/CLANNAD/): Key-style daily life structure, emotional routes, choices, comedy tags, and character warmth. Useful lesson: small domestic scenes matter because they make later pain and hope land.
- [CLANNAD official Key page](https://key.visualarts.gr.jp/product/clannad/index.html): confirms the Key romantic adventure/VN lineage used here as daily-life structure inspiration.
- [Gintama overview](https://en.wikipedia.org/wiki/Gintama): absurd comedy, parody, character warmth, serious arcs, and action can coexist. Useful lesson: comedy is not filler if it builds attachment before danger.

For CJS, the blend should feel like this:

- Chinese webnovel/system trolling: Bin can exploit quests, weaponize embarrassment, and turn social loss into JP.
- Key-style VN warmth: quiet meals, small favors, awkward family talks, and "are you okay?" conversations matter.
- Gintama-like rhythm: a dumb paperwork joke can sit beside a real wound, and both can be true.
- Monster Girl Quest Paradox-ish RPG structure: party growth, jobs/passives, strange recruitment, odd side activities, and big systemic consequences can coexist with ridiculous scenes.
- Board game/RPG consequence: rumors, clocks, resources, side quests, map nodes, and boss prep are not just prose. They change the campaign ledger.

## Tone Contract

Do:

- Keep the voice normal, human, funny, and a bit snarky.
- Let Bin be clever without sounding superior.
- Let Peri troll, but make her mask slip rarely and meaningfully.
- Let side quests be absurd, then sometimes reveal practical or emotional value later.
- Let the party be pathetic in a lovable way: bad budget, bad plans, good hearts.
- Make victory feel earned by planning, dumb luck, friendship, and one questionable decision that somehow works.

Avoid:

- Turning every scene into mask-theme commentary.
- Making Bin a lecture machine.
- Making Peri cruel for no reason.
- Making Frostbitten only grim survival fantasy.
- Making every side quest secretly cosmic-important.
- Resolving Lily, Garr, Mitia, or Peri secrets too early just because the app rolled a cool card.

## Arc 1 Spine

### Act 1: Return And Guild Noise

Bin lands in the Frostwood like a man ejected from customer service into winter. The CJS interface flickers, caps his stats, and claims this is "calibration." Peri is delighted by the optics. Bin is less delighted by snow entering places snow should not enter.

He can go straight to the gate, sneak to Garr's hut, or stop at the Frosted Mug to hear what people say when they think the ghost is not listening. All three routes should still lead to the same emotional truth: Frostbitten grieved him.

The return should hit in layers:

- The gate guard says the quiet part: "We thought you were dead."
- Bowy punches him, then hugs him like a structural accident.
- Mitia cries and tries to pretend this is a scarf-adjusting emergency.
- Garr cooks, because Garr's emotional vocabulary includes stew and silence.

The guild scene should be crowded and alive. Lysa announces too much. Corvin produces undead-adjacent paperwork. Tessa gives him an F-rank warm-up because "not dead" is not the same as "ready." Dain tries to become the arc villain and gets undercut by everyone having better comic timing. The Brinna Twins demand three silver plus emotional interest.

Story Director goal:

- Promote `haven_qchain_ledger_of_the_ghost` early if the session needs town comedy.
- Keep `haven_qchain_three_silver_discount` as a recurring pressure valve.
- Use `guild_noise` to represent how loudly the town is turning Bin into a rumor.

### Act 2: Frostwood Opens

The first Frostwood content should feel like safe starter quests that keep failing to stay safe.

Frostcap mushrooms are the ideal tutorial because they are humble, useful, and easy to make ridiculous. Bowy can cause accidents with Thunder. Mitia can calm something she should not be able to calm. Bin can discover that his best tactic is sometimes being bait with a mouth.

The missing hunter thread is the first serious shadow. It should not begin with a huge boss reveal. It begins with a survivor who cannot explain what he saw: fire and cold in the same body, eyes like two seasons, a thing deciding whether people count as prey or punctuation.

Warm side content should still matter:

- `haven_qchain_warm_lights_cold_hands` can show Frostbitten as a place that needs supplies, warmth, and practical help.
- `haven_qchain_frostcap_fever` can introduce farming/cooking/Pocket Haven later.
- `haven_qchain_ironhand_errand` should be saved or seeded for boss prep.

Story Director goal:

- Promote one field quest, one comedy/social quest, and one threat clue.
- Do not run every available quest at once unless the campaign wants a busy open-world stretch.

### Act 3: Temple Pressure

The old temple is where comedy becomes defensive. Bin can still joke, but the environment pushes harder.

The Echo Bridge is the best optional scene from the Plot Bible for this stage. It turns fear into an encounter:

- Bin hears Lily.
- Bowy hears a voice tied to origin/family.
- Mitia hears a name or language connected to her bloodline.
- Garr hears nothing, because he has spent decades building walls.

This can be a tabletop check, app event, scene card, or full map encounter. The key is that characters can overcome the echo instead of just suffering it.

The temple token/Mitia resonance is red-risk. Use visual clues freely: frost patterns, animals responding, magic becoming too clean. Do not name the full bloodline unless the GM promotes it.

Garr's secret is also protected. He can recognize Peri, dodge questions, and imply he has old knowledge. Direct "Garr met Peri and was told X" should go through review.

Story Director goal:

- Promote `old_temple_route`.
- Make `echo_bridge` available if the group wants emotional pressure.
- Keep `haven_qchain_thunder_needs_a_voice` if Bowy needs a grounded side beat.
- Pause low-stakes debt comedy while the temple is active, then bring it back after the boss.

### Act 4: Chimera Prep

This is the underdog planning act. The party is not ready. That is the point.

Prep should turn side quests into tools:

- Hilda/Ironhand work becomes gear or lightning prep.
- Bowy/Thunder work becomes range, special ammo, or a brother moment.
- Kael scouting gives one useful detail and one haunted expression.
- Dain rivalry can become competition, alliance, or rescue complication.
- Tessa's briefing should be practical and dry: she is signing paperwork for something she is not recommending.

The party's plan should sound worse when said out loud. That is good. The plan can still work because it was built from earned side content.

Story Director goal:

- Promote `haven_qchain_ironhand_errand`.
- Promote `haven_qchain_thunder_needs_a_voice` if Bowy is central.
- Use `dain_rivalry` as a boss complication, not a full villain takeover.
- Add `chimera_preparation_pressure` to the hub if players keep delaying.

### Act 5: Frostfire Chimera

The Chimera is the Arc 1 boss and the first proof that the app/tabletop hybrid matters. The fight should use grid tactics, terrain, QTE, elemental rotation, and story beats.

Core behavior:

- Fire and ice zones change the board.
- The boss punishes clustering.
- Lightning matters.
- Physical attacks and traps matter when adaptation punishes element spam.
- Below the final threshold, the fight gets simpler and nastier: more damage, less defense, more panic.

Comeback options:

- Bin uses the Jester Gambit and becomes deliberate bait.
- Mitia's magic becomes too controlled and too beautiful for her rank.
- Garr creates the opening with old hunter timing.
- Bowy's Thunder lands the shot that makes the fight feel winnable.
- Dain's party either helps, ruins the spacing, or needs saving.
- Kael does one small useful thing while visibly regretting being born into adventure.

Do not make the fight elegant by default. It is better if the winning move is smart and embarrassing.

### Act 6: Pocket Haven Aftermath

Pocket Haven should feel like a cosmic reward and a tiny unfurnished rental at the same time.

Initial feel:

- One workbench.
- One fire pit.
- A garden plot with potential.
- A locked door that should not be opened yet.
- Peri acting like this is a palace because she enjoys lies with good lighting.

The first after-boss scenes should reconnect:

- Lily becomes visible again through the Crystal of Eos shop path.
- Frostcap/Frostwood content can become Pocket Haven crops.
- Kael, Brinna Twins, Hilda, Mara, or others can become future recruit/fire/hub loops.
- Earth heat ticks quietly in the background.

The Chimera moral wrinkle is optional: maybe it was protecting an egg or cub. This should not make the party "wrong" for killing it. It should add future texture if wanted.

Story Director goal:

- Retire or downgrade immediate `frostwood_pressure`.
- Promote `pocket_haven_garden`.
- Promote `earth_heat_hook` gently.
- Bring back comedy side quests after the boss.
- Keep the Crystal of Eos as hope with cost, not instant cure.

## Side Quest Flow

| Stage | Keep | Promote | Pause or Retire |
| --- | --- | --- | --- |
| Return & Guild Noise | Brinna debt, guild jokes, town chatter | Ledger of the Ghost | Sewer crawl or unrelated dungeon filler |
| Frostwood Opens | Brinna debt, Ironhand seed, Warm Lights | Frostcap Fever, Missing Hunter, one survival quest | Pure tavern color if pacing is crowded |
| Temple Pressure | Thunder Needs A Voice, Garr soft clues | Old Temple Route, Echo Bridge | Brinna debt until tension releases |
| Chimera Prep | Ironhand, Dain rivalry, Kael | Lightning Prep, Thunder, scouting, boss gear | Warm Stew Shortage becomes background if unresolved |
| Pocket Haven Aftermath | Brinna comedy, Kael recruitment, Hilda/Mara loops | Pocket garden, Crystal of Eos hope, Earth heat | Frostwood Pressure after Chimera falls |

## How The App Should Use This

The Story Director is not a novel autoplayer. It is a solo-GM assistant and campaign memory tool.

It should:

- Roll scene beats.
- Roll Peri interruptions.
- Roll memory shards.
- Roll pressure ticks.
- Save selected beats to the campaign ledger.
- Apply chosen consequences as normal CampaignOps.
- Queue red-risk content for review.
- Sync side quest flow once per stage.
- Let players/GM reject rolls without penalty.

It should not:

- Force canon reveals.
- Replace the GM.
- Require a fixed chapter order.
- Treat all random events as true.
- Let side quests bloat the main arc until the Chimera disappears under errands.

## How To Change The Plot Later

To change story without engine edits:

1. Open `data/campaigns/haven/story_director/haven_story_director_v1.json`.
2. Add or edit `stages` to change the arc timeline.
3. Add cards under `sceneBeats`, `periInterruptions`, `memoryShards`, or `pressureTicks`.
4. Put `stageIds` on each card so it appears only when relevant.
5. Use `canonRisk`:
   - `green`: safe to apply.
   - `yellow`: soft warning, okay but watch implications.
   - `red`: review before canon.
6. Add `suggestedChoices` with normal CampaignOps.
7. Use `sideQuestFlow` to keep, promote, or retire side content per stage.
8. Add the file to `data/_manifest.json` only if you create a new pack file.

To make an alternate Arc 1:

- Copy the JSON pack.
- Rename the pack ID, for example `haven_story_director_alt_chimera_v2`.
- Add the new pack ID to `storyDirectorPacks` in the campaign file.
- Keep the same operation contracts so saves remain compatible.

## Future Expansion Ideas

Good next plot modules:

- Earth Return Pack: Lily hospital, Luna organization pressure, Leo/Meilin daily-life comedy, Zhao/Ling Ling social knives.
- Bazaar Pack: broken-chain merchants, Stardust economy, Peri debt jokes, Black Tortoise attention.
- Pocket Haven Pack: garden, forge, recruitment fire, locked door, memory garden.
- Dain Rivalry Pack: annoying rival, public duel, failed hero moment, reluctant assist.
- Mitia Bloodline Pack: dreams, language, controlled ice, Fae legacy, power without cruelty.
- Garr Secret Pack: Weaver of Fools history, old temple sealing, why he raised Bin the way he did.
- Peri Previous Candidates Pack: red-risk slips, emotional mask cracks, Ethereal Judge foreshadowing.
- Chimera Cub Pack: optional companion/complication, not mandatory canon.

The best long-term structure is one Story Director pack per arc or sub-arc. The engine should stay boring and flexible; the packs should carry the flavor.
