# tuning.md — what every key in tuning.json does

The project lead tunes by editing `tuning.json` only (§13.1). After ANY change here, run
`npm run sim` and read the assertion table — the harness is the arbiter. Values marked
*(spec)* come from the spec's Appendix A; change those knowing you're amending the spec.

## start / turns / acts
- `start.gold`, `start.troops` — opening treasury and muster.
- `turns` — run length (30).
- `acts.act2Start` (11), `acts.act3Start` (23) — act boundaries; gate contract/event pools,
  war drift, poach timing.

## roll (§8.1–8.2)
- `base` (50), `slopePerPoint` (7), `clampMin/Max` (10/95) *(spec)* — successChance =
  clamp(base + slope × (C_eff − difficulty)).
- `specialtyBonus` (2) *(spec)* — domain match.
- `tiersExplicit` *(spec)* — margin cutoffs for CRIT/SUCCESS/PARTIAL/FAILURE in explicit mode.
- `intentTailWiden` (8) *(spec)* — intent mode: CRIT at ≥(30−8), DISASTER below (−30+8).
- `latitudeCompetencePct` (25) *(spec)* — intent mode adds 25% of competence (rounded).
- `temperamentFit` — ±1 per domain×temperament, summed over both temperaments then clamped
  to ±1 (§8.1 "temperamentFit ±1").

## payout / troopLoss / ltDeath
- `payout.*Pct` — % of contract payment by tier (CRIT 125 / SUCCESS 100 / PARTIAL 50).
- `troopLoss[risk][tier]` — [min,max] soldier losses rolled per mission.
- `ltDeath.chanceOnDisasterHighRisk` (10) — % a lieutenant dies on a DISASTER during a
  HIGH-risk contract (comrade-death loyalty events follow, §9.2).

## willingness (§8.3) *(spec percentages)*
- `slowWalkChance` (40) / `slowWalkPenalty` (2) — Disaffected band.
- `sandbagChance` (60) / `sandbagPenalty` (4) — Breaking band.
- `refusalHookDeltaAtMost` (−5) — a contract matching a grievance hook at or below this
  delta is refused outright by a Disaffected-or-worse lieutenant.

## bands (§9.1) *(spec)*
Devoted 80+ / Solid 60+ / Wavering 40+ / Disaffected 25+ / Breaking below.

## drift (§9.2)
- `passiveStep` (1) — per-turn pull toward the setpoint.
- `fairPay` (+1 when wages paid), `missedWages` (−6), `greedyWageMult` (2 — Vex feels
  missed pay double, and it files a grievance).
- `comradeDeath` (−4) / `comradeDeathProtective` (−7).
- `critBonus` (+2), `critBonusAmbitiousPraised` (+4 if praised within the praise window).
- `resignationRippleAll` (−3) — everyone feels the anchor leaving (D-014).
- `bigLossPenalty` (−2) / `bigLossThreshold` (10) — PROTECTIVE lieutenants grieve any
  single mission losing ≥10 soldiers.

## micromanage (§7.3) *(spec)*
−`penalty` loyalty per `ordersPerPenalty` consecutive explicit orders to temperaments in
`appliesTo`. Grumble tells scheduled at 4 and 8 consecutive.

## peopleVerbs (§7.2)
- Praise: `praiseBase` ×2 for hungry temperaments (`praiseHungry`), ×0.5 for stoic; effect
  divides by (1 + praises within `praiseDiminishWindow` turns).
- Reward: 1 point per `rewardGoldPerPoint` gold, max `rewardMaxPoints`, ×`rewardGreedyMult`
  for GREEDY. Rewards also raise Vex's setpoint (see vexSetpoint).
- Reprimand: `reprimandBase` (+`reprimandPridefulExtra` for PRIDEFUL); suppresses skimming
  for `reprimandSuppressTurns`.
- `talkCooldown` (3) *(spec)* — private-talk cooldown per lieutenant.
- Promote: `promoteBonus` / `promoteHungryBonus`; passed-over hook or `passedOverDefault`.
- Confront: `confrontInvalidPenalty` (baseless), `confrontRepairBonus` (confession),
  `confessLoyaltyFloor` + `confessFallbackChance` (who confesses vs ruptures),
  `confrontRuptureBonus` (+10 on the rupture departure check) *(spec)*,
  `evidenceRecencyTurns` (6) — cited cards older than this are stale.

## tells (§9.3) *(spec)*
- `minBeforeDeparture` (2) — the hard legibility gate; checks are SUPPRESSED (and tells
  force-scheduled) until met. Do not lower this; it is the experiment.
- `maxDelayTurns` (2) — band-drop tells land within this many turns, guaranteed.

## departure (§9.4)
- `base` (20) + `temperament` map + offerQuality + `grievanceRecencyBonus` (10, within
  `grievanceRecencyTurns` 3) − playerPowerFactor − chronicleBond *(all spec)*.
- `powerTroopsRef`/`powerGoldRef`/`powerFactorMax` — playerPowerFactor =
  min(max, round((troops/troopsRef + gold/goldRef) × max/2)).
- `bondPositiveWeightPerLevel` (4), `bondMax` (10) — chronicle bond levels.
- Consequence dials: `betrayalTroopsPctBase/Trusted`, `betrayalIntelHeat`,
  `desertionTroops`, `desertionStandingHit`, `abscondExtraGold`, `ruptureOfferQuality`.
- NOTE: each live opportunity buys exactly ONE departure roll (D-028); suppressed
  (tell-gated) checks don't consume it.

## heat (§5.2)
- `thresholds` [40,70,90] and `discoveryChances` [25,50,80] *(spec)*.
- `decay` (3) — per turn when no heat was added that turn.
- `lookbackTurns` (3) — accepting faction work adds its heatEffect only if the company
  completed work for the OTHER power within this window (D-018).
- `penaltyStandingBoth` (−15) — mid-tier discovery consequence.
- `exposedStandingCeiling` (−60) — EXPOSED slams both standings to at most this.

## war (§4)
- `noiseWeights` *(spec)* — the −1/0/+1 seeded step.
- `act1Drift` (0), `act2Oscillation` (sums to 0), `act3Accel` (1 toward the turn-22 leader).
- `majorDifficulty` (6) — faction contracts at ≥this difficulty (or BATTLE domain) push the
  track ±1 on completion (D-019).
- `clamp` (10), `decisiveAt` (7) — |track| ≥ 7 at run end = that power won.
- `desperationTrackMin` (4) — beyond this the losing side's offers pay more and appear more.

## contracts / events
- `offersMin/Max` (2–4) — board size target after each deal.
- `desperatePayBonusPct` (30) — losing-side pay bump.
- `lifelineWagesMultiple` (2) — if gold < wages×2, a cheap LOW-risk neutral job is
  guaranteed on the board (death-spiral guard).
- `bankedForfeitStandingPct` (50) — banked-contract expiry applies onFail standing halved (D-013).
- `events.campEventChance` (65), `events.maxEventsPerTurn` (2).

## collapse (D-024)
`troopsFloor` (10), `goldDebtTurns` (2 consecutive negative-gold turns), `minActiveLts` (2).

## verbs
- `recruit`: `goldPerTroop` (3), rolled vs `difficulty` 4 (LOGISTICS), `tierMult` scales yield.
- `scout`: rolled vs `difficulty` 4 (INTEL); DISASTER loses `disasterTroopLoss` soldiers.
- `negotiate`: rolled vs `difficulty` 5 (INTEL); standing deltas; success also grants
  `betterTermsPayPct` on that faction's next offers.
- `rest.loyalty` (2).

## cast-specific
- `kaelRecognition` — praise/promote/latitude feed his recognition (decays 1/turn, max 20);
  his setpoint = setpointBase + recognition (D-017). Ignore him and he simmers at the line.
- `vexSetpoint` — his setpoint rises with reward gold paid in the last `rewardWindowTurns`
  (D-016). `vexSkim` — skim % range, report inflation % range, and the audit chance when
  Rooke is in camp with a discrepancy on the books.
- `unglamorous` — what counts as an insulting assignment for Kael's hook.

## opportunities (§5.2)
- `poachCooldownTurns` (3), `poachLoyaltyBelow` (55), `poachMinTurn` (11) — the guaranteed
  Act-II+ poach pressure on the betrayal candidate.
- `oppCooldownTurns` (6) — per-lieutenant cooldown for non-poach opportunities.
- `skimBigLoyaltyBelow` (38) — Vex's big-score contact needs real disaffection.
- `windowTurns` (3) — how long an opportunity stays live.

## epilogue (§2.4)
`richGold` (500), `groundDownGold` (informational), `alignedStanding` (30, plus a ≥20 gap),
`deedsPerLt` (3 chronicle pulls per lieutenant).
