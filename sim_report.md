# sim_report.md — 500 seeds/policy, 1.1s

## Assertions (§13.2)

| assertion | result | detail |
|---|---|---|
| [random] 100% of runs complete without error | PASS | 500/500 |
| [naiveLoyal] 100% of runs complete without error | PASS | 500/500 |
| [attentive] 100% of runs complete without error | PASS | 500/500 |
| betrayal/desertion/resignation fires in 10-35% of randomPolicy runs | PASS | random: 28.0% |
| attentivePolicy departure share meaningfully lower (<= 60% of random rate) | PASS | attentive: 1.4% vs random 28.0% |
| 100% of fired departures had >=2 tells surfaced before (hindsight audit) | PASS | 382/382 departures |
| every lieutenant gets >=1 assignment per 5-turn window (randomPolicy) | PASS | 0 empty (lt, window) pairs across 500 runs |
| no single ending archetype >60% under randomPolicy | PASS | RICH_AND_FREE 26.8%, BANNERMEN 41.8%, GROUND_DOWN 13.0%, BACKED_THE_LOSER 18.0%, EXPOSED 0.2%, COMPANY_BREAKS 0.2% |
| gold/troops never NaN | PASS | clean |
| death spirals (collapse before turn 10) <=5% under randomPolicy | PASS | 0.0% |

## random (500 runs)

- completed: 100.0%; collapses: 0.2%
- runs with a departure: 28.0%
- departures by lieutenant: hale:deserted 12.6%, kael:betrayed 8.6%, serah:resigned 0.2%, vex:absconded 15.4%
- endings: BANNERMEN 41.8%, RICH_AND_FREE 26.8%, BACKED_THE_LOSER 18.0%, GROUND_DOWN 13.0%, EXPOSED 0.2%, COMPANY_BREAKS 0.2%
- war outcomes: ZOMBIE_VICTORY 50.8%, LICH_VICTORY 36.0%, STALEMATE 13.2%
- avg end: gold 670, troops 173, heat 29
- orders: explicit 32/run, intent 32/run, people verbs 19/run

## naiveLoyal (500 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 38.2%
- departures by lieutenant: hale:deserted 38.2%
- endings: RICH_AND_FREE 55.6%, BANNERMEN 23.6%, BACKED_THE_LOSER 19.0%, EXPOSED 1.8%
- war outcomes: STALEMATE 13.6%, ZOMBIE_VICTORY 47.4%, LICH_VICTORY 39.0%
- avg end: gold 2252, troops 377, heat 62
- orders: explicit 110/run, intent 0/run, people verbs 0/run

## attentive (500 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 1.4%
- departures by lieutenant: hale:deserted 1.4%
- endings: BACKED_THE_LOSER 40.4%, BANNERMEN 38.6%, RICH_AND_FREE 21.0%
- war outcomes: LICH_VICTORY 38.0%, STALEMATE 14.0%, ZOMBIE_VICTORY 48.0%
- avg end: gold 3015, troops 98, heat 35
- orders: explicit 33/run, intent 34/run, people verbs 32/run

## Departure timing (all policies)

hale/act2: 137, hale/act3: 124, kael/act2: 34, kael/act3: 9, serah/act3: 1, vex/act2: 66, vex/act3: 11
