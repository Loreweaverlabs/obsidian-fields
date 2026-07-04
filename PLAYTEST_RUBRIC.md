# PLAYTEST_RUBRIC.md — debrief instrument (spec §15.2–15.3)

Administer per tester, **immediately after their run**, one-on-one. Record answers
verbatim where you can. Ask in this order; don't lead. Have their exported run open in
the debug viewer (`?debug=1` → Import) so you can check claims against the tell audit
afterward — not during.

## The debrief

1. **Unprompted retell.** "Tell me what happened in your run."
   - *Record. Count afterward: named lieutenants mentioned; causal chains ("X because Y");
     emotional language (angry, betrayed, proud, guilty...).*
2. **Attachment probe.** "Was there anyone you'd have taken a real loss to protect?
   Anyone you wanted gone?"
3. **Hindsight probe** *(only if a betrayal/desertion/resignation fired)*.
   "Did you see it coming? Looking back, were the signs there?"
   - *Classify: SAW_IT / SHOULD_HAVE_SEEN_IT / FELT_RANDOM.*
   - *Then (yourself, later): open the Tell audit for that lieutenant and compare what was
     shown against what they say they saw.*
4. **Diagnosis probe.** "When something went wrong on a mission, could you usually tell
   why? Give an example."
5. **Flatness probe.** "Which stretch dragged?" — *map their answer to acts (1–10 / 11–22 / 23–30).*
6. **Authorship probe.** "What were you trying to do overall? Did the game let you pursue it?"
7. **Name recall** *(day 3–7, by message)*: "Without looking — name the lieutenants you
   remember, and one thing about each."

## Logging sheet (one per tester)

| Field | Value |
|---|---|
| Tester / date / arm (template or voiced) | |
| Run export received? | |
| Retell: lieutenants named | |
| Retell: causal chains counted | |
| Retell: emotional language present? | |
| Attachment: protect / wanted gone | |
| Departure fired? which? | |
| Hindsight class (SAW / SHOULD_HAVE / RANDOM) | |
| Tell audit agrees? (tells were shown: y/n, count) | |
| Diagnosis example given? sound? | |
| Dragged: act | |
| Authorship: goal + was it pursuable | |
| Name recall (day 3–7): names + facts | |

## Verdict gates (§15.3) — with 5 testers, template mode

- **PASS:** ≥3 testers produce an unprompted retell naming ≥2 lieutenants with ≥1 causal
  chain; ≥3 distinct ending archetypes across the pool; among fired-departure runs,
  SHOULD_HAVE_SEEN_IT + SAW_IT outnumber FELT_RANDOM; ≥3 testers recall ≥3 lieutenant
  names at follow-up.
- **DIAGNOSE (not fail):** gates miss on attachment/flatness BUT decision logs show sound
  causality and tells were surfaced → run the LLM-voice arm with 3–5 fresh testers before
  judging the concept. If voiced passes where template failed: "causality works; templated
  prose is the bottleneck" — a build finding, not a concept failure.
- **FAIL:** retells absent or generic in both arms, or FELT_RANDOM dominates despite the
  tell audit confirming tells were shown. Concept-level result: stop and rethink before
  any Phase 1 work.

## Mechanics of a session

- Send testers the playtest page (`/playtest.html` on the deployed URL), not the game
  root — it carries the spoiler request.
- Template arm is the default; do NOT give testers an API key. The voiced arm is run by
  you, supervised, with your key (Setup → "Voiced by a language model").
- Collect the export blob from every run, even abandoned ones. Import them with
  `?debug=1` and skim: the Decision log answers "bug, tuning, or working-as-intended?";
  the Tell audit answers "were the signs there?" mechanically.
