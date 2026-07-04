# sim_report.md — 500 seeds/policy, 1.1s

## Assertions (§13.2)

| assertion | result | detail |
|---|---|---|
| [random] 100% of runs complete without error | PASS | 500/500 |
| [naiveLoyal] 100% of runs complete without error | PASS | 500/500 |
| [attentive] 100% of runs complete without error | PASS | 500/500 |
| betrayal/desertion/resignation fires in 10-35% of randomPolicy runs | PASS | random: 27.6% |
| attentivePolicy departure share meaningfully lower (<= 60% of random rate) | PASS | attentive: 1.0% vs random 27.6% |
| 100% of fired departures had >=2 tells surfaced before (hindsight audit) | PASS | 370/370 departures |
| every lieutenant gets >=1 assignment per 5-turn window (randomPolicy) | PASS | 0 empty (lt, window) pairs across 500 runs |
| no single ending archetype >60% under randomPolicy | PASS | RICH_AND_FREE 27.0%, BANNERMEN 40.4%, GROUND_DOWN 14.6%, BACKED_THE_LOSER 17.6%, EXPOSED 0.2%, COMPANY_BREAKS 0.2% |
| gold/troops never NaN | PASS | clean |
| death spirals (collapse before turn 10) <=5% under randomPolicy | PASS | 0.0% |

## random (500 runs)

- completed: 100.0%; collapses: 0.2%
- runs with a departure: 27.6%
- departures by lieutenant: hale:deserted 13.0%, kael:betrayed 7.2%, vex:absconded 16.2%
- endings: BANNERMEN 40.4%, RICH_AND_FREE 27.0%, BACKED_THE_LOSER 17.6%, GROUND_DOWN 14.6%, EXPOSED 0.2%, COMPANY_BREAKS 0.2%
- war outcomes: ZOMBIE_VICTORY 50.2%, LICH_VICTORY 35.4%, STALEMATE 14.4%
- avg end: gold 676, troops 172, heat 29
- orders: explicit 32/run, intent 32/run, people verbs 19/run

## naiveLoyal (500 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 36.6%
- departures by lieutenant: hale:deserted 36.6%
- endings: RICH_AND_FREE 57.0%, BANNERMEN 22.8%, BACKED_THE_LOSER 18.6%, EXPOSED 1.6%
- war outcomes: STALEMATE 14.2%, ZOMBIE_VICTORY 48.2%, LICH_VICTORY 37.6%
- avg end: gold 2253, troops 377, heat 62
- orders: explicit 111/run, intent 0/run, people verbs 0/run

## attentive (500 runs)

- completed: 100.0%; collapses: 0.0%
- runs with a departure: 1.0%
- departures by lieutenant: hale:deserted 1.0%
- endings: BACKED_THE_LOSER 40.6%, BANNERMEN 38.4%, RICH_AND_FREE 21.0%
- war outcomes: LICH_VICTORY 37.6%, STALEMATE 14.2%, ZOMBIE_VICTORY 48.2%
- avg end: gold 3016, troops 98, heat 35
- orders: explicit 34/run, intent 34/run, people verbs 32/run

## Departure timing (all policies)

hale/act2: 128, hale/act3: 125, kael/act2: 29, kael/act3: 7, vex/act2: 66, vex/act3: 15
