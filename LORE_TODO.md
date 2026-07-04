# LORE_TODO.md — every proper noun awaiting the project lead's lore pass

All of these are **data, not string literals** (spec §2.1). Rename in ONE file —
`data/strings.json` — and every card, contract, event, and epilogue picks it up.
Cast names/epithets/portraits live in `data/cast_public.json`. A handful of nouns are
embedded in authored flavor text (flagged below) and need a find-replace in that file.

## Factions (strings.json → `factions`)
| Placeholder | Where used | Notes |
|---|---|---|
| the Lich Lord | war news, epilogues | spec-named placeholder power |
| the Bone Court | contract offers, envoys, discovery | the Lich Lord's agents |
| "a pale legate of the Bone Court" | offer/envoy source lines | envoy archetype |
| "bone legions", "bone banners" | war news phrasing | troop descriptors |
| the Zombie King | war news, epilogues | spec-named placeholder power |
| the Carrion Throne | contract offers, envoys, discovery | the Zombie King's agents |
| "a fly-crowned herald of the Carrion Throne" | offer/envoy source lines | envoy archetype |
| "shambling columns", "the horde" | war news phrasing | troop descriptors |

## Places (strings.json → `places`)
| Placeholder | Flavor role |
|---|---|
| the Obsidian Fields / the Fields | the setting itself |
| the Glass Bridge | contested crossing; Serah's recall-line anchor |
| Cinder Ridge | beacon country |
| the Hollow Crypt | revenant nest |
| the Salt Road | main road |
| the Broken Spire | Bone Court ritual seat |
| the Mirror Flats | the war's deciding field |
| Bleakgate | horde-held gate town |

## Neutrals (strings.json → `neutrals`)
| Placeholder | Role |
|---|---|
| Marrowbrook | the neutral village; Mother Rooke's kin live here |
| the Glasspickers' Guild | salvage guild client |
| Ossian the relic-broker | recurring neutral fixer |

## Faith (strings.json → `faith`)
| Placeholder | Role |
|---|---|
| the Order of the Returning Sun | Brother Hale's order ("Returning Sun" also in his epithet in cast_public.json) |

## Cast (cast_public.json — lead may recast with owned Forgotten Runes Warriors)
| Placeholder | Brief |
|---|---|
| Serah "the Anvil" | second-in-command, the anchor |
| Kael "the Ember" | young captain, betrayal candidate |
| Mother Rooke "the Ledger" | quartermaster & spymaster |
| Brother Hale "of the Returning Sun" | warrior-priest |
| Vex "Coinsworn" | sellsword |

## Nouns embedded in authored flavor (need find-replace in the named file)
- `data/events.json`: "the bridge at Veld" (Kael's vignette story), "sun-order pilgrims"
  (Hale walkout event), "Ossian's factor" / "Ossian's rivals" (salvage + Vex events).
- `data/contracts.json`: "Ossian" appears in c_n04, c_n06, c_n14 flavor; "the Ninth
  Column" (c_l10/c_z10 pair); "the quarry fort" (c_z09).
- `src/render/templates.ts`: faction/place references are slot-driven, but a few texture
  words ("bone-lacquer", "fly-crown" in discovery_penalty) echo the envoy designs.
- `data/epilogues.json`: war outcome paragraphs reference lime/glass imagery and the
  phrase "the Salt Road" once.

## Register guide used throughout (for the lead's pass)
Terse, grim, mercenary. No modern idiom, no fourth wall, no mechanics vocabulary in
prose (§11.4). Lieutenants report in first person; rumors are sourced ("heard around
the fire", "your steward mentions", "seen around camp"); factions never speak warmly.
