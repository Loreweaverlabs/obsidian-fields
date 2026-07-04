# sim_report.md — 100 seeds/policy, 0.3s

## Assertions (§13.2)

| assertion | result | detail |
|---|---|---|
| [random] 100% of runs complete without error | PASS | 100/100 |
| [naiveLoyal] 100% of runs complete without error | PASS | 100/100 |
| [attentive] 100% of runs complete without error | PASS | 100/100 |
| betrayal/desertion/resignation fires in 10-35% of randomPolicy runs | PASS | random: 22.0% |
| attentivePolicy departure share meaningfully lower (<= 60% of random rate) | PASS | attentive: 0.0% vs random 22.0% |
| 100% of fired departures had >=2 tells surfaced before (hindsight audit) | PASS | 62/62 departures |
| every lieutenant gets >=1 assignment per 5-turn window (randomPolicy) | PASS | 0 empty (lt, window) pairs across 100 runs |
| no single ending archetype >60% under randomPolicy | PASS | RICH_AND_FREE 26.0%, BANNERMEN 45.0%, GROUND_DOWN 16.0%, BACKED_THE_LOSER 12.0%, EXPOSED 1.0% |
| gold/troops never NaN | PASS | clean |
| death spirals (collapse before turn 10) <=5% under randomPolicy | PASS | 0.0% |

## random (100 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 22.0%
- departures by lieutenant: hale:deserted 10.0%, kael:betrayed 5.0%, vex:absconded 11.0%
- endings: BANNERMEN 45.0%, RICH_AND_FREE 26.0%, GROUND_DOWN 16.0%, BACKED_THE_LOSER 12.0%, EXPOSED 1.0%
- war outcomes: ZOMBIE_VICTORY 50.0%, LICH_VICTORY 35.0%, STALEMATE 15.0%
- avg end: gold 691, troops 184, heat 32
- orders: explicit 32/run, intent 33/run, people verbs 19/run

## naiveLoyal (100 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 36.0%
- departures by lieutenant: hale:deserted 36.0%
- endings: RICH_AND_FREE 58.0%, BANNERMEN 21.0%, BACKED_THE_LOSER 18.0%, EXPOSED 3.0%
- war outcomes: STALEMATE 9.0%, ZOMBIE_VICTORY 48.0%, LICH_VICTORY 43.0%
- avg end: gold 2249, troops 378, heat 62
- orders: explicit 110/run, intent 0/run, people verbs 0/run

## attentive (100 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 0.0%
- departures by lieutenant: none
- endings: BACKED_THE_LOSER 42.0%, BANNERMEN 36.0%, RICH_AND_FREE 22.0%
- war outcomes: LICH_VICTORY 35.0%, STALEMATE 16.0%, ZOMBIE_VICTORY 49.0%
- avg end: gold 2996, troops 98, heat 35
- orders: explicit 33/run, intent 35/run, people verbs 33/run

## Departure timing (all policies)

hale/act2: 24, hale/act3: 22, kael/act2: 4, kael/act3: 1, vex/act2: 11
