# Phase 0 Build Spec — *The Obsidian Fields*
## A text-drama prototype for *Forgotten Runes: Warlords*

**Version 1.0 — July 2026**
**Audience:** an AI coding agent (Claude Code / Fable 5) executing the build, directed by a novice-coder project lead.

---

## 0. How to use this document (read first, agent)

This spec is the contract. Follow the build order in §14 strictly — do not begin UI work before the engine milestones gate-pass. Two standing rules:

1. **Ambiguity protocol.** For pure implementation details (file layout, naming, library minutiae): decide yourself and record every non-obvious decision in a running `DECISIONS.md`. For anything that touches *drama design* — changing when betrayal can fire, adding/removing order verbs, altering the cast, changing tell guarantees, changing tuning semantics — **stop and ask the project lead first.** When in doubt about which category something is: ask.
2. **Determinism is non-negotiable.** All randomness flows from a single seeded RNG. A run is fully reconstructable from `(seed, actionLog)`. Maintain a golden-seed snapshot test from the first engine commit: a fixed seed + fixed action script whose full outcome log is snapshotted. Any change that alters the snapshot must be flagged and the snapshot updated deliberately, never silently.

**What this prototype is:** a ~30-turn, text-only, single-player web prototype testing ONE hypothesis — that rules-driven character agents with hidden state produce outcomes players experience as *drama* (memorable characters, retellable stories, betrayals that feel earned in hindsight) rather than noise or predictability.

**What it is not (hard non-goals):** no map, no hexes, no tactical combat, no procedural cast, no meta-progression, no accounts, no backend, no blockchain, no audio, no art pipeline (placeholder portraits only), no balance polish beyond the sim-harness assertions, no mobile-native polish (must merely be usable in a phone browser).

---

## 1. Purpose & success criteria

### 1.1 The hypothesis under test

Order → interpretation → filtered report → diagnosis. The player issues orders to lieutenants whose hidden loyalty, competence, and temperament shape how those orders execute and how truthfully outcomes are reported. The player must diagnose *why* things went sideways. If that loop generates stories testers retell unprompted, the core of *Warlords* is validated. If it doesn't, the concept fails cheaply, here.

### 1.2 Definition of done (build)

- [ ] Headless sim harness passes all distribution assertions (§13) over 500 seeded runs
- [ ] A full 30-turn playthrough completes in a browser in under 75 minutes
- [ ] Golden-seed snapshot test in place and passing
- [ ] Run export/import works (a tester can send the project lead a JSON blob; lead can replay it with the debug viewer)
- [ ] Decision log is human-readable for every agent choice (§8.4)
- [ ] Template variety minimums met (§11.2)
- [ ] LLM renderer toggle functional behind the renderer interface (§11.3)
- [ ] Deployed to a public static URL with the playtest kit page (§15)

### 1.3 Definition of done (test) — decided by humans, not the agent

Playtest gates live in §15.3. The build is a success if it lets those gates be *measured*, whichever way they resolve.

---

## 2. Fiction & scenario

### 2.1 Setting

The **Obsidian Fields**: a contested black-glass wasteland rich in salvage, relics, and glasswork resources. Two undead powers grind against each other for supremacy here — the forces of the **Lich Lord** and the horde of the **Zombie King**. *(Both faction names and all proper nouns in this spec are placeholders pending the project lead's lore pass. Build them as data, not string literals, so a rename is a one-file edit.)*

The player commands a **free mercenary company** newly arrived on the Fields. Contracts come from three directions: agents of the Lich Lord, agents of the Zombie King, and neutral parties (scavenger guilds, surviving villages, relic merchants). The company can align with either power, or play both sides for coin — double-dealing pays best and risks the most.

### 2.2 Player role & fantasy

The player is the company's captain — never directly on a battlefield in this prototype. They sit at the command table each evening: read the day's reports, weigh what (and whom) to believe, and issue the next day's orders. The fantasy is *command under uncertainty*, not tactics.

### 2.3 The 30-turn arc

Three acts, paced by the contract/event decks and the war track:

- **Act I — Arrival (turns 1–10):** low-stakes contracts, both powers courting the company, cast establishes voice, first reliability wobbles appear.
- **Act II — The Squeeze (turns 11–22):** the war intensifies; both powers demand commitment; contracts start conflicting (taking one burns standing with the other); lieutenant hooks activate; the double-dealing discovery risk becomes real; poach attempts on the betrayal candidate begin.
- **Act III — Convergence (turns 23–30):** the war track resolves toward one power's dominance (or stalemate); final high-stakes contracts; the epilogue is computed from end state.

### 2.4 Endings

The epilogue is templated from final state (war outcome × standings × treasury × roster survival). Minimum ending archetypes to implement: **Bannermen of the victor** (aligned, victor won), **Backed the loser** (aligned, victor lost), **Rich and free** (neutral, treasury high), **Exposed** (double-dealing discovered late, both powers hostile), **The company breaks** (roster/troop collapse), **Ground down** (survived, poor, diminished). The epilogue MUST pull 2–3 chronicle lines (§10.3) per surviving lieutenant and memorialize dead or departed ones. This is the attachment payoff — do not stub it.

---

## 3. Game state model

### 3.1 Company state

| Variable | Type | Notes |
|---|---|---|
| `gold` | int | Treasury. Pays wages, bonuses, recruitment. |
| `troops` | int | Abstracted company strength (soldiers as a number). Spent/risked on contracts; recruited back with gold. |
| `standing.lich` | −100..+100 | Reputation with the Lich Lord's faction |
| `standing.zombie` | −100..+100 | Reputation with the Zombie King's faction |
| `heat` | 0..100 | Double-dealing suspicion. Rises when working both sides in ways that could be observed; decays slowly. At thresholds, discovery-check events fire. |
| `warTrack` | −10..+10 | Front position. Negative = Lich ascendant, positive = Zombie ascendant. See §4. |
| `turn` | 1..30 | |

No supplies/food system. No morale meter for the company (morale lives inside per-lieutenant loyalty; troop losses feed loyalty events instead).

### 3.2 Turn structure

1. **Reports phase** — the player reads the day's report cards (§10): mission results (as told by the lieutenants), camp rumors, war news, faction messages, tell events.
2. **Council phase** — the player issues orders: each lieutenant may be given **one** assignment (mission verb or people verb); unassigned lieutenants default to *Hold camp*. Maximum **2 people-verbs per turn** total (prevents probe-spamming the diagnosis instrument).
3. **Resolution phase** — the engine resolves all assignments against hidden state (§8), advances the war track (§4), applies loyalty drift (§9), draws next-turn contracts/events, appends to the chronicle and decision log.

Target pace: ≤2 minutes of player attention per turn.

---

## 4. The war track (background pressure — NOT agents)

**Scope guard, stated as strongly as possible: the Lich Lord and Zombie King are weather, not minds.** Do not build strategic AI, unit simulation, or decision-making for either power. The war between them is a single scripted-stochastic track.

- Each turn, `warTrack` moves by `baseDrift(turn) + noise + playerPush`.
  - `baseDrift` comes from a hand-authored per-act curve in `tuning.json` (e.g., Act I ~0, Act II oscillates, Act III accelerates toward whichever side leads at turn 22 — creating a "the war is being decided" feel).
  - `noise` = small seeded random step (−1, 0, +1 weighted).
  - `playerPush` = small contribution from completed faction contracts that turn (±1 per major contract). The player influences the war but does not control it.
- `warTrack` position modifies: contract deck weights (the losing side offers more desperate, better-paying, dirtier contracts), event deck weights, and a ±1 situational modifier on missions in contested zones.
- War news reports (§10) narrate the track's movement with source-appropriate unreliability.

---

## 5. Contracts & events

### 5.1 Contract anatomy

```
Contract {
  id, source: LICH | ZOMBIE | NEUTRAL,
  title, flavorText,
  difficulty: 1..10,
  domain: BATTLE | RAID | ESCORT | INTEL | LOGISTICS | PURGE,
  payment: gold,
  troopRisk: LOW | MED | HIGH,
  standingEffects: { onAccept, onComplete, onFail } per faction,
  heatEffect: int (nonzero when taking this while also working the other side),
  hookTags: [lieutenant hook triggers, e.g. HARMS_VILLAGE, SERVES_UNDEAD, GLORY, DESECRATION, ANTI_UNDEAD],
  expiresIn: turns
}
```

- 2–4 contracts on offer per turn; accepting assigns it to a lieutenant this turn or banks it until expiry.
- **Conflicting pairs:** from Act II, some turns deal contracts flagged as mutually exclusive (completing one fails/forfeits the other, with standing consequences). This is the authorship pressure — the player's pattern of choices here IS their strategy.
- Neutral contracts pay less but carry no standing/heat cost and feed specific hooks (e.g., defending Mother Rooke's village — §6.3).

### 5.2 Event deck

Non-contract events drawn per turn by act and state triggers:

- **Camp events:** brawls, gambling, weather, a lieutenant's signature moment (voice-establishing vignettes in Act I).
- **Faction pressure events:** envoys demanding exclusivity (Act II+), gifts, threats tied to standings.
- **Opportunity events:** the enabling conditions for betrayal/desertion checks (§9.4) — e.g., a rival's poach offer to Kael, a chance for Vex to skim big, an opening for a disaffected lieutenant to walk. Opportunity events are drawn by *hidden state triggers*, not fixed turns.
- **Tell events:** emitted by the loyalty system (§9.3), delivered as camp rumors or observable moments.
- **Discovery events:** at `heat` thresholds (40/70/90), a seeded discovery check fires; failure escalates from warning → standing penalty → the *Exposed* path.

### 5.3 Content volume targets

Minimum authored content: **~45 contracts** (15 per source, spread across domains/difficulties/acts), **~35 events**, **6 ending epilogue frames**. Written as data files. The agent drafts all flavor text in a consistent grim-mercenary register; the project lead will do a voice/lore pass afterward — flag every proper noun in a `LORE_TODO.md`.

---

## 6. The lieutenants

### 6.1 Data model

```
Lieutenant {
  id, name, epithet, portraitToken (placeholder),
  publicProfile: { archetype, visibleTraits[], reputationBlurb },   // what the player is told
  hidden: {
    loyalty: 0..100 (drifts),
    loyaltySetpoint: int,            // passive drift target, temperament-derived
    competence: 1..10,
    specialty: domain (+2 effective competence in that domain),
    temperamentPrimary, temperamentSecondary,   // categorical, see §6.2
    hooks: [ {trigger, loyaltyDelta or behavior} ]
  },
  voice: { signaturePhrases[], reportStyleTags[] },   // feeds the template renderer
  chronicle: []   // per-lieutenant event log, see §10.3
}
```

### 6.2 Temperament vocabulary (v0)

`HONORABLE, AMBITIOUS, CAUTIOUS, ZEALOUS, GREEDY, PRIDEFUL, PROTECTIVE, METICULOUS`. Each temperament defines: (a) an order-interpretation rider under intent-latitude (§7.3), (b) a report-reliability filter (§10.2), (c) loyalty drift sensitivities (§9.2). Implement as data-driven rider functions, not if-else sprawl — the vocabulary will grow in later phases.

### 6.3 The cast (authored briefs — exact hidden integers are assigned by the agent, sealed)

**Sealed-values instruction:** the briefs below give qualitative bands. The agent assigns exact starting integers within those bands and writes them to `data/cast_hidden.json`. The project lead will avoid reading that file so they can playtest semi-blind. Never print exact hidden values in the normal UI — only in the debug viewer.

1. **Serah "the Anvil"** — second-in-command. *The stable anchor.* Battle specialist, competence high (8–9). Loyalty starts Solid-high (68–76), setpoint high. HONORABLE / PROTECTIVE. Hooks: loyalty drops on DESECRATION-tagged contracts and on sustained high standing with the Zombie King's corpse-takers; rises when the company protects neutrals. She will never betray — but she *can* resign on principle if pushed far past her line, and the run feels it.
2. **Kael the Ember** — young captain. *The systemic betrayal candidate.* Raid/skirmish specialist, competence 7. Loyalty starts Wavering-high (54–62); setpoint tied to recognition. AMBITIOUS / PRIDEFUL. Hooks: loyalty rises on GLORY contracts, command latitude, public praise, promotion; falls on micromanagement, being passed over, unglamorous assignments. From Act II, poach opportunity events arrive from whichever power the company is NOT favoring (or the ascendant one if neutral). His flip is a §9.4 check — it can fire in some runs and never in others. That variance is the point; do not script it.
3. **Mother Rooke** — quartermaster & spymaster. *Reliable but hedged.* Intel/logistics specialist, competence 8. Loyalty starts Devoted-low (74–82). CAUTIOUS / METICULOUS. Reports are accurate but conservative — she understates success chances and pads risk estimates (a *calibrated* distortion, not a lie). Hook: kin in a neutral village on the Fields; contracts tagged HARMS_VILLAGE cut her deeply; defending it earns devotion.
4. **Brother Hale** — warrior-priest of a sun order (placeholder faith). *The principled friction engine.* PURGE/anti-undead specialist (+2 vs both powers' forces), competence 6. Loyalty starts Solid (62–70) but drops on EVERY contract taken FOR either undead power and rises on every contract fighting them. ZEALOUS / AGGRESSIVE-rider (under intent latitude near undead, he over-executes: bonus destruction, collateral standing damage, "purged the crypt too"). Most likely deserter in aligned runs; a rock in anti-undead runs. He makes the player's grand-strategy choice *cost something human*.
5. **Vex Coinsworn** — sellsword. *The chronic noise-maker.* Escort/plunder specialist, competence 5–6. Loyalty starts Wavering (45–55), setpoint tracks pay. GREEDY. Reports are self-serving: inflates loot (and skims the difference into his pocket — the engine tracks true vs reported gold), deflects blame on failures, exaggerates opposition. Low-stakes, high-frequency unreliability so the diagnosis muscle is exercised constantly, not only at the big betrayal beat.

**Why this composition:** every lieutenant fails differently. A botched mission might be Serah facing a genuinely hard draw, Kael slow-walking out of resentment, Rooke's caution leaving profit on the table, Hale's zeal blowing past the brief, or Vex lying about what happened. Same visible symptom, five different diagnoses — that contrast is the experiment.

*(Names are placeholders. The project lead may recast any brief with a specific Forgotten Runes Warrior he owns; treat name/epithet/portrait as data.)*

---

## 7. Orders & the latitude dial

### 7.1 Mission verbs

`TAKE_CONTRACT(contract)`, `SCOUT(target: warFront | faction | rumor)`, `GUARD_CAMP`, `RECRUIT(goldBudget)`, `NEGOTIATE(faction)` *(improves contract terms / standing; INTEL-domain check)*, `REST` *(small loyalty recovery for that lieutenant)*.

### 7.2 People verbs (max 2/turn, the diagnosis instruments)

- `PRAISE(lt)` — public recognition. +loyalty (scaled by temperament: large for Kael, mild for Serah). Overuse decays (diminishing returns tracked).
- `REWARD(lt, gold)` — bonus pay. +loyalty scaled by GREEDY/temperament.
- `REPRIMAND(lt)` — −loyalty but can suppress a specific active behavior (e.g., after catching Vex skimming). Temperament-scaled backlash.
- `PRIVATE_TALK(lt)` — the probe. Returns a *band-level* hint about the lieutenant's state, filtered through their honesty: Rooke gives you a straight band; Vex lies one band optimistic; Kael deflects if PRIDEFUL grievance is active. Cooldown: 3 turns per lieutenant.
- `PROMOTE(lt)` — one-time: name a First Captain. Big +loyalty for the promoted (huge for Kael), a hook-check for those passed over.
- `CONFRONT(lt)` — accusation. If the player has evidence (specific report contradictions the UI lets them cite), can force a confession/repair or a rupture; without evidence, −loyalty. See §9.5.

### 7.3 The latitude dial (per mission order)

Every mission verb is issued in one of two modes:

- **Explicit instruction** — low variance. Outcome hews to the resolution roll; temperament riders suppressed; results are more predictable and more mediocre (crit range narrowed as well as disaster range). Systemic cost: each explicit order to a PRIDEFUL or AMBITIOUS lieutenant applies a small cumulative loyalty penalty (*micromanagement resentment*, tracked and reported via tells).
- **Intent directive** — high latitude. Temperament riders activate (Hale over-purges; CAUTIOUS Rooke converts some failures into safe partials but forfeits crit upside; AMBITIOUS Kael may tack on a glory objective — brilliant or costly). Crit and disaster ranges both widen. Competence matters more (its coefficient rises).

Log which mode every order used. Which mode testers gravitate toward, per lieutenant, per act, is itself an experimental result — surface it in the run-summary export.

---

## 8. Resolution engine

### 8.1 Core roll

For an assignment with difficulty `D` by lieutenant with effective competence `C`:

```
C_eff = competence
      + specialtyBonus (if domain match, +2)
      + temperamentFit (±1, data-driven per verb×temperament)
      + warMod (±1 from warTrack when contract is in a contested zone)
      + hiddenModifiers (hook-driven, e.g. Hale +2 vs undead)
      + latitudeCompetenceBoost (intent mode only: +25% of competence, rounded)

successChance = clamp( 50 + 7 × (C_eff − D), 10, 95 )   // percent
roll = seededD100()
margin = successChance − roll
```

### 8.2 Outcome tiers

| Condition (explicit mode) | Tier |
|---|---|
| margin ≥ +30 | CRIT |
| margin ≥ 0 | SUCCESS |
| margin ≥ −15 | PARTIAL |
| margin ≥ −30 | FAILURE |
| margin < −30 | DISASTER |

Intent mode widens the tails: CRIT at ≥ +22, DISASTER at < −22 (values in `tuning.json`). Tier effects (gold, troops, standing, heat, hook triggers) are defined per contract/verb in data. Temperament riders then decorate the outcome (extra objective, collateral, skim, etc.) as *structured facts in the event log*, never as prose-only flourishes.

### 8.3 Loyalty gating on execution

Before the roll, a **willingness check**: lieutenants in the *Disaffected* band may slow-walk (−2 C_eff, logged), refuse hook-violating orders outright (logged, order wasted), or in *Breaking* band sandbag (−4). Refusals and slow-walks emit report-visible consequences. This is how loyalty corrupts execution *before* any betrayal — the early-warning texture.

### 8.4 Decision explainability (mandatory, first-class)

Every resolver decision — every roll, willingness check, drift application, tell emission, betrayal evaluation — appends a structured, human-readable entry:

```
{ turn: 17, actor: "kael", type: "WILLINGNESS",
  inputs: { loyalty: 34, band: "DISAFFECTED", order: "TAKE_CONTRACT:c31", hookHit: "UNGLAMOROUS" },
  computation: "band=DISAFFECTED → slowWalk roll 40% → rolled 22 → SLOW_WALK (−2 C_eff)",
  visibleToPlayer: "report shows delayed arrival" }
```

The debug viewer (§12.3) renders this log filterable by actor/turn/type. This log is simultaneously the novice lead's triage instrument ("bug, tuning, or working-as-intended?") and the raw material for the hindsight audit ("were the tells actually there?").

---

## 9. Loyalty, tells, betrayal & desertion

### 9.1 Bands

Devoted 80+ · Solid 60–79 · Wavering 40–59 · Disaffected 25–39 · Breaking <25.

### 9.2 Drift

- Passive: ±1/turn toward `loyaltySetpoint`.
- Event-driven deltas (all in `tuning.json`): fair pay on time +1/turn baseline; missed wages −6; hook violations −5..−10 (per brief); hook affirmations +4..+8; comrade death −4 (PROTECTIVE −7); praise/reward/promote per §7.2; micromanagement accumulator per §7.3; mission CRIT +2 (AMBITIOUS +4 if praised); public blame −4.

### 9.3 Tells (the legibility guarantee)

**Hard rule: no betrayal, desertion, or resignation may fire unless ≥2 tells for that lieutenant were surfaced to the player in prior turns.** Enforce structurally: crossing DOWN into Disaffected emits a tell within 2 turns (guaranteed by scheduling, not probability); each further band drop emits another; opportunity-event preconditions emit a third, more specific tell (Kael "seen speaking with a stranger in grey"). Tells are delivered as camp rumors, report anomalies (quality dip, delay), or observable moments — each tagged with a source of appropriate reliability. The debug log records every tell with a pointer to the visible report card that carried it, so the hindsight audit is mechanical.

### 9.4 Betrayal / desertion check (systemic, never scripted)

Evaluated only when (a) lieutenant is in Breaking band — or Disaffected with an active hook grievance — AND (b) an opportunity event is live:

```
pushPull = base(20)
         + temperament (AMBITIOUS +15, GREEDY +10, HONORABLE −20, ZEALOUS: ±0 but desertion→resignation)
         + offerQuality (poach offer size / escape viability, 0..15)
         + grievanceRecency (+10 if hook violated within 3 turns)
         − playerPowerFactor (troops+gold percentile, 0..15)
         − chronicleBond (+levels of positive shared history, 0..10)   // attachment is mechanically protective
roll d100 < pushPull → FIRES
```

Consequences scale with delegated trust: a betraying Kael leaves WITH troops and intel (larger if recently promoted / given latitude) and resurfaces as a named antagonist in war news for the rest of the run. Hale deserts alone, loudly, with a standing hit. Vex absconds with skimmed gold. Serah's version is resignation — formal, devastating, chronicled. **One systemic candidate arc (Kael) must be fully implemented; the lighter desertion paths (Hale, Vex, Serah resignation) must at minimum fire correctly with basic consequences.**

### 9.5 Confrontation & repair

`CONFRONT` with cited evidence (the UI lets the player select 1–2 prior report cards as exhibits; the engine checks whether those cards actually contain the contradiction) → forced honesty: confession + repair path (+loyalty, behavior flag cleared) or rupture (immediate desertion check with +10). Without valid evidence → indignation, −loyalty. Repairing Kael before the poach lands should be a winnable, satisfying arc — the betrayal must be *evitable* or the diagnosis game is pointless.

---

## 10. Reports, reliability & the chronicle

### 10.1 Report cards

Each turn's Reports phase presents cards: **Mission reports** (one per assignment, authored in-fiction by that lieutenant), **Camp rumors** (tells, vignettes; sourced "heard around the fire," "your steward mentions…"), **War news** (war track narration; sourced from scouts/travelers/faction heralds with varying reliability), **Faction messages** (contract offers, envoy pressure, discovery warnings).

### 10.2 Reliability filters (the unification)

A mission report is generated in two steps: the engine produces the **true outcome record** (already in the decision log), then the reporting lieutenant's axes distort the *player-facing card*: GREEDY inflates loot and skims (true vs reported gold both tracked); low loyalty shades blame; CAUTIOUS pads risk and understates margin; ZEALOUS reframes collateral as righteousness; high-loyalty/high-competence reports are near-clean. Every card carries its source tag. Discrepancies must be *discoverable* (e.g., treasury math doesn't add up; Rooke's audit event can surface Vex's skim) because discovered contradictions are CONFRONT evidence.

### 10.3 The chronicle (attachment engine — mandatory)

Append-only per-lieutenant deed log: `{ turn, deed, valence, weight }` for mission outcomes, saves, wounds, refusals, praise, shared hardships. Two consumption points: **recall lines** — templates that resurface a relevant past deed at charged moments ("Serah, who held the ford at the Glass Bridge, meets your eye…" before a similar mission; before a CONFRONT; in tells) — and the **epilogue** (§2.4). The chronicle also feeds `chronicleBond` in §9.4, making attachment mechanically real. This system is cheap (an event log plus templated recall) and is explicitly NOT deferrable.

---

## 11. Text rendering

### 11.1 Architecture: renderers consume the log, nothing else

`Renderer` interface takes structured event/report records and returns prose. Two implementations. Game logic must never emit prose directly — if a fact isn't in the structured record, it cannot appear on a card. This is what makes the A/B test clean.

### 11.2 TemplateRenderer (primary)

Template library keyed by `(recordType × temperament × outcomeTier)`, with slot-filling and per-lieutenant signature phrases from `voice`. **Variety minimums: ≥3 variants per common template key; ≥2 per rare key; no exact-repeat within any 5-turn window (enforced by simple recent-use tracking).** Register: terse, grim, in-character; lieutenants report in first person.

### 11.3 LLMRenderer (the A/B toggle)

Selected at session start (mode recorded in the run export). Calls the Anthropic Messages API (model configurable, default a fast/cheap model; key entered by the operator in a settings panel, stored in localStorage, sent with the direct-browser-access header). Prompt contract: system prompt contains the character bible + register guide + the ironclad constraint **"render ONLY the facts in the provided record; add no events, numbers, names, or outcomes"**; user turn contains the structured record(s). Low temperature. On any API failure, fall back silently to TemplateRenderer and mark the affected cards in the export. LLM mode is for supervised/self playtests; remote testers default to template mode.

### 11.4 Tone guard

No modern idiom, no fourth-wall, no game-mechanics vocabulary in prose ("loyalty," "roll," "tier" never appear in-fiction — bands surface as behavior, not numbers).

---

## 12. UI requirements (single page, deliberately plain)

### 12.1 Screens/panels

- **Reports** (turn opener): the day's cards, newest turn expanded, prior turns collapsible. Cards citable (checkbox) for CONFRONT evidence.
- **Council** (orders): roster with one assignment slot each; contract board; latitude toggle per mission order; people-verb menu (2/turn cap enforced); "End Turn."
- **Roster:** public profiles only — name, epithet, placeholder portrait (colored token + initials; portrait image path is data so real art can drop in), visible traits, wage, *player-observable* condition notes (recent behavior summary drawn from surfaced tells — never hidden numbers).
- **Chronicle:** per-lieutenant deed timeline.
- **Ledger:** gold/troops/standings/heat (heat shown qualitatively: Quiet / Whispers / Watched / Marked), war-front gauge.
- **Epilogue** screen at turn 30 or on company collapse.

### 12.2 Session mechanics

Autosave to localStorage every turn; resume on reload. **Export run** (copyable JSON blob + download) and **Import run** for replay. A 90-second inline "how to play" intro. Target total session ≤75 min.

### 12.3 Dev/debug mode

URL flag (`?debug=1`): decision-log viewer (filter by actor/turn/type), true-state inspector (hidden values, true vs reported gold), tell audit view (every fired tell + the card that carried it), fast-forward with a scripted random policy. Never linked from the player UI.

### 12.4 Aesthetics

Minimal, readable, dark parchment-terminal vibe is fine. **Do not spend agent cycles on visual polish** — this prototype lives or dies on text and causality. Must be usable on a phone browser (single column collapse), optimized for desktop.

---

## 13. Tuning & sim harness

### 13.1 `tuning.json`

Every constant referenced in §§4–9 lives in one JSON file with comments (or a sibling `tuning.md` documenting each key). No magic numbers in code. The project lead tunes by editing this file only.

### 13.2 Headless sim harness

Node script running the engine module directly (no browser) with policy bots: `randomPolicy`, `naiveLoyalPolicy` (always explicit orders, never people-verbs), `attentivePolicy` (responds to tells with repair verbs). Over **500 seeds per policy**, assert:

- 100% of runs complete without error
- Betrayal/desertion/resignation fires in **10–35%** of `randomPolicy` runs, **and in a meaningfully lower share** of `attentivePolicy` runs (repair must work; exact bound tunable)
- In 100% of fired betrayals, ≥2 tells preceded (mechanical hindsight audit)
- Every lieutenant receives ≥1 assignment per 5-turn window under `randomPolicy` (no dead cast members)
- Ending archetype distribution: no single archetype >60% under `randomPolicy`
- Gold/troops never NaN/negative-locked; no unwinnable-by-turn-5 death spirals >5% of runs

Harness output: distribution report (`sim_report.md`) regenerated on demand. The agent must run the harness after any tuning or engine change and include the report diff in its summary.

### 13.3 Golden seeds

Three fixed `(seed, scripted action log)` pairs snapshotted end-to-end. CI-style check via `npm test`.

---

## 14. Build order (strict milestones)

Work in a fresh repo. **Do not scaffold UI before Milestone 3 gate-passes.**

- **M1 — Engine core.** Types, RNG, cast/contract/event/tuning data files, resolution roll + tiers, willingness gate, loyalty drift, decision log, golden-seed test. *Gate: golden seeds pass; decision log readable.*
- **M2 — Drama systems.** Tells with the ≥2 guarantee, opportunity events, betrayal/desertion/resignation checks, Kael arc, confrontation/repair, chronicle + bond factor, war track, heat/discovery, reliability filters (true vs reported records), epilogue computation. *Gate: a CLI playthrough (text dump, no templates needed yet) shows a full run with visible tells preceding a fired betrayal.*
- **M3 — Sim harness + first tuning pass.** Policies, 500-seed assertions, `sim_report.md`. *Gate: all §13.2 assertions pass.*
- **M4 — TemplateRenderer + content fill.** Full template library to variety minimums; all contracts/events/epilogues authored; `LORE_TODO.md`. *Gate: CLI run reads as coherent in-fiction prose.*
- **M5 — Web UI.** All §12 screens, autosave, export/import, debug mode. *Gate: lead completes a full run in-browser <75 min; exports it; replays it in debug.*
- **M6 — LLMRenderer + A/B plumbing.** Toggle, settings, fallback, mode logging. *Gate: same run renders in both modes; LLM mode adds zero facts (spot-audit 20 cards against records).*
- **M7 — Deploy + playtest kit.** Static deploy (GitHub Pages / Netlify / Vercel — pick simplest), §15 kit page, tester run-collection instructions. *Gate: cold-start test from a phone via the public URL.*

Rough effort expectation for the agent: M1–M3 is the bulk of the *thinking*; M4 is the bulk of the *writing*; M5 is plumbing. If any milestone balloons, stop and report rather than silently descoping drama systems.

---

## 15. Playtest kit (ships with the build)

### 15.1 Tester instructions page

One screen: premise (2 sentences), how to play (30 turns, ~1 hr, issue orders, read reports, trust whom you will), **spoiler request** ("the cast is the same for everyone — please don't compare notes until after your debrief"), and an export-and-send button/instructions at game end.

### 15.2 Debrief instrument (for the project lead to administer — bundle as `PLAYTEST_RUBRIC.md`)

Administered per tester, immediately after their run, answers recorded:

1. **Unprompted retell:** "Tell me what happened in your run." *(Record. Count: named lieutenants mentioned; causal chains ("X because Y"); emotional language.)*
2. **Attachment probe:** "Was there anyone you'd have taken a real loss to protect? Anyone you wanted gone?"
3. **Hindsight probe (only if a betrayal/desertion/resignation fired):** "Did you see it coming? Looking back, were the signs there?" *(Classify: SAW_IT / SHOULD_HAVE_SEEN_IT / FELT_RANDOM.)*
4. **Diagnosis probe:** "When something went wrong on a mission, could you usually tell why? Give an example."
5. **Flatness probe:** "Which stretch dragged?" *(Map to acts.)*
6. **Authorship probe:** "What were you trying to do overall? Did the game let you pursue it?"
7. *(Day 3–7 follow-up message)* **Name recall:** "Without looking — name the lieutenants you remember, and one thing about each."

### 15.3 Pass/fail gates (the actual Phase 0 verdict)

With 5 testers, template mode:

- **PASS:** ≥3 testers produce an unprompted retell naming ≥2 lieutenants with ≥1 causal chain; ≥3 distinct ending archetypes across the pool; among fired-betrayal runs, SHOULD_HAVE_SEEN_IT + SAW_IT outnumber FELT_RANDOM; ≥3 testers recall ≥3 lieutenant names at follow-up.
- **DIAGNOSE (not fail):** gates miss on attachment/flatness BUT decision logs show sound causality and tells were surfaced → run the LLM-voice arm with 3–5 fresh testers before judging the concept. If voiced mode passes where template mode failed, the finding is "causality works; templated prose is the bottleneck" — a build finding, not a concept failure.
- **FAIL:** retells are absent or generic in both arms, or FELT_RANDOM dominates despite the tell audit confirming tells were shown. That is a concept-level result: the hidden-state drama loop does not land. Stop and rethink before any Phase 1 work.

---

## Appendix A — starting tuning values

All first-pass; the sim harness (§13.2) is the arbiter. Key values: base success 50%, slope 7%/point, clamp 10–95; explicit-mode tiers +30/0/−15/−30; intent-mode tail widening ±8; willingness slow-walk −2 (40% chance in Disaffected), sandbag −4 (60% in Breaking); micromanagement accumulator −1 loyalty per 2 consecutive explicit orders to PRIDEFUL/AMBITIOUS; betrayal base 20 with modifiers per §9.4; heat thresholds 40/70/90 with discovery chances 25/50/80%; passive drift ±1/turn; probe cooldown 3 turns; people-verb cap 2/turn; war-track noise weights {−1: 25%, 0: 50%, +1: 25%} before act curve.

## Appendix B — deliverable checklist for the agent's final report

Repo with README (run, test, deploy instructions a novice can follow verbatim) · `DECISIONS.md` · `LORE_TODO.md` · `tuning.json` + docs · `sim_report.md` · deployed URL · playtest kit · export/import round-trip demo · a sample exported run with a fired Kael arc, annotated against the tell audit.
