# Migration Report

Generated: 2026-04-25T07:54:41.350Z

## characters

| Old ID | New ID |
|---|---|
| bin | bin |
| bowy | haven_bowy |
| mitia | haven_mitia |
| garr | haven_garr |

## passives

| Old ID | New ID |
|---|---|
| jester_luck | jester_luck |
| comedy_armor | comedy_armor |
| marksmans_eye | haven_marksmans_eye |
| iron_hide | haven_iron_hide |
| fae_blood | haven_fae_blood |
| gentle_heart | haven_gentle_heart |
| veterans_instinct | haven_veterans_instinct |
| alpha_presence | haven_alpha_presence |
| frozen_carapace | haven_frozen_carapace |

## skills

| Old ID | New ID |
|---|---|
| ember_slash | haven_ember_slash |
| taunt_mock | taunt_mock |
| jester_gambit | jester_gambit |
| basic_attack | basic_attack |
| thunder_shot | haven_thunder_shot |
| piercing_bolt | haven_piercing_bolt |
| suppressive_fire | haven_suppressive_fire |
| frost_touch | haven_frost_touch |
| ice_shield | haven_ice_shield |
| healing_light | haven_healing_light |
| hunters_strike | haven_hunters_strike |
| trap_set | haven_trap_set |
| rally_cry | haven_rally_cry |
| wolf_bite | haven_wolf_bite |
| pack_howl | haven_pack_howl |
| ice_shard | haven_ice_shard |
| chill_wind | haven_chill_wind |
| bear_maul | haven_bear_maul |
| bear_roar | haven_bear_roar |
| chimera_flame_wave | haven_chimera_flame_wave |
| chimera_frost_breath | haven_chimera_frost_breath |
| chimera_fire_swipe | haven_chimera_fire_swipe |

## items

| Old ID | New ID |
|---|---|
| rusty_sword | haven_rusty_sword |
| leather_armor | haven_leather_armor |
| thunder_crossbow | haven_thunder_crossbow |
| frost_staff | haven_frost_staff |
| hunters_blade | haven_hunters_blade |
| adventurers_cloak | haven_adventurers_cloak |
| warm_boots | haven_warm_boots |
| lucky_coin | haven_lucky_coin |
| healers_pendant | haven_healers_pendant |
| chimera_fang | haven_chimera_fang |
| frostfire_core | haven_frostfire_core |

## monsters

| Old ID | New ID |
|---|---|
| ice_wolf | haven_ice_wolf |
| frost_sprite | haven_frost_sprite |
| snow_bear | haven_snow_bear |
| frostfire_chimera | haven_frostfire_chimera |

## encounters

| Old ID | New ID |
|---|---|
| enc_wolf_pack | haven_enc_wolf_pack |
| enc_temple_floor1 | haven_enc_temple_floor1 |
| enc_chimera_boss | haven_enc_chimera_boss |
| enc_bear_cave | haven_enc_bear_cave |

## materials

| Old ID | New ID |
|---|---|
| wolf_pelt | haven_wolf_pelt |
| frost_fang | haven_frost_fang |
| sprite_dust | haven_sprite_dust |
| ice_crystal | haven_ice_crystal |
| bear_hide | haven_bear_hide |
| bear_claw | haven_bear_claw |

## Generated Materials

| ID | Name | Source |
|---|---|---|
| haven_wolf_pelt | Wolf Pelt | loot |
| haven_frost_fang | Frost Fang | loot |
| haven_sprite_dust | Sprite Dust | loot |
| haven_ice_crystal | Ice Crystal | loot |
| haven_bear_hide | Bear Hide | loot |
| haven_bear_claw | Bear Claw | loot |

## Notes

- World passives were added as first-class files in the manifest because Haven-specific passives need their own storage.
- Loot-only drops not defined in the legacy item table were generated into worlds/haven/materials.json.
