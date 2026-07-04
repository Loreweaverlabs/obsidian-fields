# The Obsidian Fields

A ~30-turn, text-only, single-player web prototype for **Forgotten Runes: Warlords** —
Phase 0 of testing one hypothesis: that rules-driven character agents with hidden state
produce outcomes players experience as *drama* (memorable characters, retellable stories,
betrayals that feel earned in hindsight) rather than noise or predictability.

You captain a free mercenary company between two undead powers. You never see a battle.
You read your lieutenants' reports, decide what — and whom — to believe, and issue the
next day's orders. The full build contract is in [docs/SPEC.md](docs/SPEC.md).

## Quickstart (novice-verbatim)

You need [Node.js](https://nodejs.org) 20 or newer. Then, in this folder:

```bash
npm install        # once, ~1 minute
npm run dev        # starts the game at the printed local URL (usually http://localhost:5173)
```

Open the printed URL in a browser. That's the whole game. Progress autosaves in the
browser after every turn.

Other commands:

```bash
npm test           # golden-seed snapshots + engine invariants + template variety (must pass)
npm run sim        # 500 seeds x 3 policy bots; writes sim_report.md; exits nonzero on any failed assertion
npm run sim -- --quick        # same, 100 seeds (fast iteration while tuning)
npm run cli -- --seed myseed --policy random          # full headless playthrough in the terminal
npm run cli -- --seed myseed --policy random --verbose --log kael   # + orders and one actor's decision log
npm run golden:gen # re-baseline golden fixtures (ONLY when a change is deliberate; then: npx vitest run -u)
npm run sample:kael# regenerate samples/ (a run with a fired Kael betrayal, annotated)
npm run build      # production build into dist/
```

## Playing / playtesting

- Send testers to **`/playtest.html`** on the deployed site (it carries the premise and
  the spoiler request), not the game root.
- The debrief script and pass/fail gates are in [PLAYTEST_RUBRIC.md](PLAYTEST_RUBRIC.md).
- Testers export their run from the final screen and send you the JSON blob.

### Replaying a tester's run

1. Open the deployed game with `?debug=1` added to the URL (e.g. `.../index.html?debug=1`).
2. If a game is in progress, finish or export it first (importing replaces the session).
3. Use **Import a run** (setup screen) or **Export → Import** and paste their blob.
4. The Debug tab now has: the full **decision log** (filter by actor/turn/type — this is
   the "bug, tuning, or working-as-intended?" instrument), **true state** (hidden loyalty,
   true-vs-reported gold per mission), the **tell audit** (every tell + the exact card that
   carried it), and **fast-forward** (script the rest of a run with a policy bot).

The debug view is never linked from the player UI. Don't share `?debug=1` with testers.

### The two report voices (A/B arms)

- **Templated** (default): no key, fully offline, deterministic prose.
- **Voiced**: chosen at session start (Setup → "Voiced by a language model"). Enter an
  Anthropic API key (stored only in that browser's localStorage; calls go directly from
  the browser to the API). On any API failure the templated text stands in silently and
  the affected card ids are recorded in the run export (`llmFallbackCards`). To spot-audit
  the zero-added-facts constraint (M6 gate), open `?debug=1` → **Renderer audit** and
  compare each card's facts JSON against its prose.

## Tuning

Every constant lives in [data/tuning.json](data/tuning.json), documented key-by-key in
[data/tuning.md](data/tuning.md). Workflow: edit the JSON → `npm run sim` → read the
assertion table in [sim_report.md](sim_report.md). The harness is the arbiter (spec §13).
If a deliberate change breaks golden snapshots: `npm run golden:gen && npx vitest run -u`,
and note it in [DECISIONS.md](DECISIONS.md).

Content lives beside it: contracts, events, epilogue frames, cast (public), lore strings —
all JSON in `data/`. **`data/cast_hidden.json` is sealed**: the project lead should not
read it before playtesting (spec §6.3). Proper nouns awaiting the lore pass are indexed in
[LORE_TODO.md](LORE_TODO.md).

## Deploying

Pushing to `main` on GitHub deploys automatically via GitHub Actions to GitHub Pages
(workflow in `.github/workflows/deploy.yml`; Pages must be set to "GitHub Actions" as the
source, which the workflow requests on first run). Any other static host also works:
`npm run build`, then upload the `dist/` folder as-is (all asset paths are relative).

## Project layout

```
data/              all authored content + tuning (JSON) — the lead edits here
docs/SPEC.md       the Phase 0 build contract
src/engine/        pure deterministic engine (no DOM): state, resolution, drama systems
src/render/        Renderer interface, TemplateRenderer (+ variety), epilogue composer
src/sim/           policy bots, 500-seed harness, CLI, sample generator
src/test/          golden-seed snapshots + invariants + template variety tests
src/ui/            React single-page app + debug viewer + LLM renderer
samples/           an exported run with a fired Kael arc, annotated against the tell audit
```

Determinism contract: a run is fully reconstructable from `(seed, actionLog)` — that pair
is exactly what saves and exports contain. All randomness flows from one seeded RNG in
`GameState`; presentation variety uses a separate derived stream so prose can never
perturb replay. See [DECISIONS.md](DECISIONS.md) for every non-obvious call.
