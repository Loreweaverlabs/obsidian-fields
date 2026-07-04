# Sample run: a fired Kael arc, annotated against the tell audit

Seed `kael-hunt-21`, randomPolicy, engine 0.1.0. Import `kael_betrayal_run.json`
into the game (Setup → Import a run, or ?debug=1 → Import) to replay it exactly.

**Kael betrayed on turn 14.** went over to the Bone Court, taking 13 soldiers and everything he knew.

## The tells, in order (all surfaced to the player before the check fired — §9.3)

### Turn 12 — opportunity_contact (strength 2, card t12-c96)

> A stranger in grey shared Kael's fire last night — travel-stained, well-spoken, gone by morning watch. Nobody heard the conversation. Kael hasn't mentioned it.

### Turn 13 — band_disaffected (strength 1, card t13-c109)

> Kael has stopped telling the bridge story. When the new blood asked for it, he looked at the fire and said it wasn’t worth the breath.

## The decision log around the departure

```
t9 [HOOK] micromanagement accumulator: 2 consecutive explicit orders -> -1 loyalty (§7.3)
t11 [OPPORTUNITY] opportunity POACH live turns 12..14 (checked only after its tell is visible)
t11 [BAND_CROSS] crossed down into DISAFFECTED -> tell guaranteed within 2 turns
t13 [BAND_CROSS] crossed down into DISAFFECTED -> tell guaranteed within 2 turns
t13 [DEPARTURE_SUPPRESSED] departure check suppressed: only 1 tells surfaced (< 2); legibility first (§9.3)
t14 [DEPARTURE_CHECK] pushPull 50 vs d100=8 -> FIRES
t14 [DEPARTURE] BETRAYAL fires: -13 troops (base 10%), +10 heat (he knew the books), named antagonist in war news
```

## Why this is the hindsight-audit exhibit

- Every departure requires >=2 tells surfaced in STRICTLY PRIOR turns (hard rule §9.3);
  the audit above shows 2 reached the player with at least one council in hand to act, each with the exact card that carried it.
- The DEPARTURE_CHECK entry shows the full §9.4 arithmetic (base + temperament +
  offer + grievance − power − bond vs the roll), so "was it earned?" is answerable
  mechanically, not vibes-first.
- A tester who says FELT_RANDOM about this run can be walked through these exact
  cards — that conversation is the experiment.

Final state: BANNERMEN under ZOMBIE_VICTORY; 
gold 408, troops 179; departures: kael:betrayed@t14, vex:absconded@t14.
