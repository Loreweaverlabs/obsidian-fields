# DECISIONS.md — running log of non-obvious implementation decisions

Per spec §0.1: pure implementation details are decided by the agent and recorded here.
Anything touching drama design gets flagged to the project lead instead. Entries marked
**[LEAD-REVIEW]** are interpretations that sit near the drama-design line — they fill gaps
the spec leaves open without (in the agent's judgment) changing specified behavior, but the
lead should skim them and veto any that feel wrong.

## Stack & architecture

- **D-001 — Stack.** TypeScript everywhere. Engine is a pure, DOM-free module under `src/engine/`
  so the same code runs in the browser, the headless sim harness (Node via `tsx`), and vitest.
  UI: React 18 + Vite (static build, deployable to any static host). No other runtime deps.
- **D-002 — Determinism mechanics.** Single mulberry32 RNG seeded by xmur3 string hash. RNG state
  is a plain integer stored *inside* `GameState`, so state is fully serializable. All engine
  randomness draws from it in a fixed resolution order. UI/renderer never touch the game RNG:
  template-variant selection uses a *separate* RNG derived from `(seed, cardId)` so prose variety
  can't perturb replay.
- **D-003 — Replay model.** A run is `(seed, actionLog)` where each action is one full council
  submission. `replay(seed, actions)` folds them over `initGame(seed)`. Autosave stores seed +
  actionLog (not state) and replays on load — exercising the determinism guarantee constantly.
- **D-004 — Golden seeds.** Action scripts for the three golden runs are *frozen JSON fixtures*
  (generated once by a seeded scripted policy via `npm run golden:gen`, then committed). The test
  replays them and snapshots the full decision log + final state. Engine changes that alter
  outcomes break the snapshot loudly; update deliberately with `vitest -u`.
- **D-005 — Data files.** All content (cast, contracts, events, epilogues, templates, tuning) is
  JSON under `data/`, imported via `resolveJsonModule` so both Node and Vite load it identically.
  Faction/proper-noun strings live in `data/strings.json` so a lore rename is a one-file edit.

## Engine semantics (gap-filling interpretations)

- **D-010 — Resolution order within a turn.** Wages → people verbs → contract accepts →
  mission willingness+resolution (roster order) → camp/faction/opportunity events → war track →
  loyalty drift → band-cross tell scheduling → opportunity spawn checks → betrayal/desertion
  checks → heat discovery checks → deliver due tells → draw next offers → generate report cards →
  advance turn. Fixed order = deterministic RNG consumption. People verbs land *before* missions
  so same-turn repair (praise then mission) is possible — this makes `attentivePolicy` repair
  meaningfully effective, which §13.2 requires.
- **D-011 — People-verb results arrive next morning.** PRIVATE_TALK/CONFRONT outcomes appear as
  cards in the *next* Reports phase (orders are issued at the evening council; the conversation
  happens overnight). Keeps one uniform report loop; loyalty effects still apply immediately.
- **D-012 — "Hold camp" default ≠ GUARD_CAMP verb.** Default idle is a no-op. Explicit GUARD_CAMP
  is a real assignment that suppresses negative camp events that turn (and feeds Rooke's audit
  chance when she holds camp). [LEAD-REVIEW]
- **D-013 — Banked contracts keep ticking.** Accepting banks a contract but expiry still counts
  down; expiring while banked = quiet forfeit with the contract's onFail standing effect halved.
  Prevents risk-free option-hoarding. [LEAD-REVIEW]
- **D-014 — Departure styles are cast data.** §9.4's temperament parenthetical is implemented as
  a per-lieutenant `departureStyle` field: kael→BETRAYAL (defects with troops+intel, becomes named
  antagonist), vex→ABSCOND (steals skim + treasury cut), hale→DESERTION (loud, public, standing
  hit with the company's most-aligned power, small troop loss as sympathizers follow),
  serah→RESIGNATION (formal; every other lieutenant loses a little loyalty — the anchor leaving
  is felt). [LEAD-REVIEW]
- **D-015 — Hale's secondary temperament.** Brief says "ZEALOUS / AGGRESSIVE-rider" but AGGRESSIVE
  is not in the §6.2 vocabulary and the over-execution behavior is ZEALOUS's intent-latitude rider.
  Rather than grow the vocabulary (drama-design change), Hale is ZEALOUS/PRIDEFUL and the
  over-purge rider is attached to ZEALOUS. [LEAD-REVIEW]
- **D-016 — Vex's pay-tracking setpoint.** `setpoint = base + min(cap, rewardGoldLast8Turns / divisor)`
  (tuning keys `vexSetpointBase/Cap/Divisor`). Rewards literally raise where his loyalty drifts to.
- **D-017 — Kael's recognition setpoint.** `setpoint = base + praise/promotion recognition level`
  (recent praise, latitude orders, promotion each add tuning-defined recognition; decays 1/turn).
- **D-018 — Heat mechanics.** A contract's `heatEffect` applies only if the company completed a
  contract for the *other* power within the last `heatLookback` (5) turns. Heat decays
  `heatDecay` (2)/turn when no heat was added. Discovery checks fire once per upward crossing of
  each threshold (40/70/90); re-crossing after decay re-arms the *lower* thresholds only.
  Escalation ladder: warning card → standing penalty with both powers → EXPOSED flag (both
  standings slammed hostile; faction contracts dry up; Exposed epilogue path).
- **D-019 — War push.** ±1 warTrack per completed *major* faction contract (difficulty ≥ 6 or
  domain BATTLE), per §4 "major contract".
- **D-020 — Contested-zone modifier.** Contracts flagged `contested: true` get ±1 C_eff: +1 if
  the contract's source is currently ascendant on the war track (fighting with momentum), −1 if
  losing. Neutral contested contracts: −1 when |warTrack| ≥ 5 (the fields are a battlefield).
  [LEAD-REVIEW]
- **D-021 — Tell scheduling.** Band-drop tells are scheduled for delivery 1–2 turns out (seeded
  pick) with a hard deadline: anything still pending at deadline is force-delivered that turn.
  Betrayal checks that find <2 surfaced tells are SUPPRESSED (logged with type
  `BETRAYAL_SUPPRESSED`), and the missing tells are force-scheduled for the next turn, so the
  arc can only fire after legibility is satisfied — the ≥2 guarantee is structural.
- **D-022 — Confrontation branch.** With valid evidence: confession+repair if the lieutenant's
  loyalty ≥ tuning.confessLoyaltyFloor (35) or a seeded 50% roll succeeds; otherwise rupture →
  immediate departure check at +10 pushPull. Without valid evidence: indignation, −loyalty
  (temperament-scaled). [LEAD-REVIEW]
- **D-023 — Evidence validity.** Report cards carry hidden `evidence` keys when their displayed
  claims materially diverge from the true record (skim, slow-walk delay, blame-shift, exaggerated
  opposition) or when a tell card directly witnesses a behavior. CONFRONT(lt, cards) is valid iff
  a cited card's evidence names that lieutenant and the matching behavior is active/recent.
- **D-024 — Collapse conditions.** Company breaks when troops < 10 at end of turn, or gold goes
  negative two turns running (creditors), or ≤1 lieutenant remains active. Any of these ends the
  run in the "company breaks" epilogue.
- **D-025 — Content timing vs milestones.** Full contract/event data (~45/~35) is authored during
  M3, not M4, because the §13.2 distribution assertions (ending spread, no death spirals) are
  meaningless against a thin deck. M4 then covers the template library and a flavor-text polish
  pass. Same gates, honest sequencing.
- **D-026 — Wages cadence.** Wages are auto-paid at resolution start each turn. If the treasury
  can't cover the full bill, nobody is paid (partial pay would need a priority rule the spec
  doesn't define) and every active lieutenant takes the missed-wage hit (GREEDY doubled).
  [LEAD-REVIEW]
- **D-027 — Sealed values.** Exact hidden integers live only in `data/cast_hidden.json` (which the
  lead avoids reading), the debug viewer, and the decision log. This file and DECISIONS.md quote
  bands only.
