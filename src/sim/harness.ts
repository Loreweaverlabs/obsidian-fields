// Headless sim harness (§13.2): 500 seeds per policy, distribution assertions, sim_report.md.
// Run: npm run sim [-- --seeds 500] [--quick]
// Exits non-zero if any assertion fails. The report is the tuning arbiter (§13.1).
import { writeFileSync } from 'node:fs';
import { initGame, submitCouncil } from '../engine/engine';
import { derivedRng } from '../engine/rng';
import { POLICIES, type PolicyName } from './policies';
import type { GameState } from '../engine/types';

const argIdx = process.argv.indexOf('--seeds');
const SEEDS = process.argv.includes('--quick') ? 100 : argIdx >= 0 ? Number(process.argv[argIdx + 1]) : 500;
const POLICY_NAMES: PolicyName[] = ['random', 'naiveLoyal', 'attentive'];

interface RunResult {
  seed: string;
  policy: PolicyName;
  ok: boolean;
  error?: string;
  endReason: string | null;
  endTurn: number;
  archetype: string | null;
  warOutcome: string | null;
  gold: number;
  troops: number;
  heat: number;
  departures: { lt: string; status: string; turn: number; priorTells: number }[];
  windowViolations: number; // (lt, 5-turn window) pairs with zero assignments
  collapseBeforeT10: boolean;
  nanSeen: boolean;
  explicitOrders: number;
  intentOrders: number;
  peopleVerbs: number;
}

function runOne(seed: string, policy: PolicyName): RunResult {
  const base: RunResult = {
    seed,
    policy,
    ok: false,
    endReason: null,
    endTurn: 0,
    archetype: null,
    warOutcome: null,
    gold: 0,
    troops: 0,
    heat: 0,
    departures: [],
    windowViolations: 0,
    collapseBeforeT10: false,
    nanSeen: false,
    explicitOrders: 0,
    intentOrders: 0,
    peopleVerbs: 0,
  };
  try {
    const state = initGame(seed);
    const rng = derivedRng(seed, `policy:${policy}`);
    let guard = 0;
    while (!state.over && guard++ < 40) {
      submitCouncil(state, POLICIES[policy](state, rng));
      if (!Number.isFinite(state.gold) || !Number.isFinite(state.troops)) base.nanSeen = true;
    }
    base.ok = state.over;
    base.endReason = state.endReason;
    base.endTurn = state.turn;
    base.archetype = state.epilogue?.archetype ?? null;
    base.warOutcome = state.epilogue?.warOutcome ?? null;
    base.gold = state.gold;
    base.troops = state.troops;
    base.heat = state.heat;
    base.collapseBeforeT10 = state.endReason === 'collapse' && state.turn < 10;
    for (const lt of state.lts) {
      if (lt.status !== 'active' && lt.status !== 'dead') {
        base.departures.push({
          lt: lt.id,
          status: lt.status,
          turn: lt.departedTurn ?? 0,
          // strictly prior turns (§9.3): the player had a council between tell and fire
          priorTells: lt.tells.filter((t) => t.turn < (lt.departedTurn ?? 0)).length,
        });
      }
      // 5-turn assignment windows while active (§13.2 "no dead cast members")
      const lastTurn = lt.departedTurn ?? state.turn;
      const turns = new Set(state.stats.assignmentsByLt[lt.id]);
      for (let w = 1; w + 4 <= lastTurn; w += 5) {
        let any = false;
        for (let t = w; t < w + 5; t++) if (turns.has(t)) any = true;
        if (!any) base.windowViolations++;
      }
    }
    base.explicitOrders = Object.values(state.stats.explicitOrders).reduce((a, b) => a + b, 0);
    base.intentOrders = Object.values(state.stats.intentOrders).reduce((a, b) => a + b, 0);
    base.peopleVerbs = Object.values(state.stats.peopleVerbsUsed).reduce((a, b) => a + b, 0);
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
  }
  return base;
}

console.log(`Running ${SEEDS} seeds x ${POLICY_NAMES.length} policies...`);
const t0 = Date.now();
const results: Record<PolicyName, RunResult[]> = { random: [], naiveLoyal: [], attentive: [] };
for (const policy of POLICY_NAMES) {
  for (let i = 0; i < SEEDS; i++) {
    results[policy].push(runOne(`sim-${i}`, policy));
  }
  console.log(`  ${policy}: done`);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// ---------------------------------------------------------------------------
// Aggregate & assert
// ---------------------------------------------------------------------------

const pct = (n: number, d: number): string => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;

interface Assertion {
  name: string;
  pass: boolean;
  detail: string;
}
const assertions: Assertion[] = [];

function agg(policy: PolicyName) {
  const rs = results[policy];
  const completed = rs.filter((r) => r.ok && !r.error);
  const withDeparture = rs.filter((r) => r.departures.length > 0);
  const archetypes = new Map<string, number>();
  for (const r of rs) archetypes.set(r.archetype ?? 'NONE', (archetypes.get(r.archetype ?? 'NONE') ?? 0) + 1);
  const depByLt = new Map<string, number>();
  for (const r of rs) for (const d of r.departures) depByLt.set(`${d.lt}:${d.status}`, (depByLt.get(`${d.lt}:${d.status}`) ?? 0) + 1);
  return { rs, completed, withDeparture, archetypes, depByLt };
}

const A = { random: agg('random'), naiveLoyal: agg('naiveLoyal'), attentive: agg('attentive') };

// 1. 100% complete without error
for (const p of POLICY_NAMES) {
  const bad = A[p].rs.filter((r) => !r.ok || r.error);
  assertions.push({
    name: `[${p}] 100% of runs complete without error`,
    pass: bad.length === 0,
    detail: bad.length === 0 ? `${A[p].rs.length}/${A[p].rs.length}` : `${bad.length} failed; first: ${bad[0].seed}: ${bad[0].error ?? 'did not finish'}`,
  });
}

// 2. Departure rate 10-35% under random; meaningfully lower under attentive
const randRate = A.random.withDeparture.length / SEEDS;
const attRate = A.attentive.withDeparture.length / SEEDS;
assertions.push({
  name: 'betrayal/desertion/resignation fires in 10-35% of randomPolicy runs',
  pass: randRate >= 0.1 && randRate <= 0.35,
  detail: `random: ${pct(A.random.withDeparture.length, SEEDS)}`,
});
assertions.push({
  name: 'attentivePolicy departure share meaningfully lower (<= 60% of random rate)',
  pass: attRate <= randRate * 0.6,
  detail: `attentive: ${pct(A.attentive.withDeparture.length, SEEDS)} vs random ${pct(A.random.withDeparture.length, SEEDS)}`,
});

// 3. 100% of departures preceded by >=2 tells (all policies)
{
  let total = 0;
  let violations = 0;
  for (const p of POLICY_NAMES)
    for (const r of results[p])
      for (const d of r.departures) {
        total++;
        if (d.priorTells < 2) violations++;
      }
  assertions.push({
    name: '100% of fired departures had >=2 tells surfaced before (hindsight audit)',
    pass: violations === 0,
    detail: `${total - violations}/${total} departures`,
  });
}

// 4. No dead cast members under randomPolicy
{
  const totalViolations = A.random.rs.reduce((a, r) => a + r.windowViolations, 0);
  assertions.push({
    name: 'every lieutenant gets >=1 assignment per 5-turn window (randomPolicy)',
    pass: totalViolations === 0,
    detail: `${totalViolations} empty (lt, window) pairs across ${SEEDS} runs`,
  });
}

// 5. Ending archetype spread under random
{
  const max = [...A.random.archetypes.entries()].sort((a, b) => b[1] - a[1])[0];
  assertions.push({
    name: 'no single ending archetype >60% under randomPolicy',
    pass: max[1] / SEEDS <= 0.6,
    detail: [...A.random.archetypes.entries()].map(([k, v]) => `${k} ${pct(v, SEEDS)}`).join(', '),
  });
}

// 6. Numeric sanity + death spirals
{
  const nan = POLICY_NAMES.flatMap((p) => results[p]).filter((r) => r.nanSeen);
  assertions.push({
    name: 'gold/troops never NaN',
    pass: nan.length === 0,
    detail: nan.length === 0 ? 'clean' : `${nan.length} runs saw NaN`,
  });
  const spirals = A.random.rs.filter((r) => r.collapseBeforeT10).length;
  assertions.push({
    name: 'death spirals (collapse before turn 10) <=5% under randomPolicy',
    pass: spirals / SEEDS <= 0.05,
    detail: pct(spirals, SEEDS),
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const lines: string[] = [];
lines.push(`# sim_report.md — ${SEEDS} seeds/policy, ${elapsed}s`);
lines.push('');
lines.push('## Assertions (§13.2)');
lines.push('');
lines.push('| assertion | result | detail |');
lines.push('|---|---|---|');
for (const a of assertions) lines.push(`| ${a.name} | ${a.pass ? 'PASS' : '**FAIL**'} | ${a.detail} |`);
lines.push('');
for (const p of POLICY_NAMES) {
  const { rs, withDeparture, archetypes, depByLt } = A[p];
  lines.push(`## ${p} (${rs.length} runs)`);
  lines.push('');
  const completedRate = pct(rs.filter((r) => r.ok).length, rs.length);
  const collapse = rs.filter((r) => r.endReason === 'collapse').length;
  lines.push(`- completed: ${completedRate}; collapses: ${pct(collapse, rs.length)}`);
  lines.push(`- runs with a departure: ${pct(withDeparture.length, rs.length)}`);
  lines.push(
    `- departures by lieutenant: ${[...depByLt.entries()].sort().map(([k, v]) => `${k} ${pct(v, rs.length)}`).join(', ') || 'none'}`,
  );
  lines.push(`- endings: ${[...archetypes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, rs.length)}`).join(', ')}`);
  const wars = new Map<string, number>();
  for (const r of rs) wars.set(r.warOutcome ?? 'NONE', (wars.get(r.warOutcome ?? 'NONE') ?? 0) + 1);
  lines.push(`- war outcomes: ${[...wars.entries()].map(([k, v]) => `${k} ${pct(v, rs.length)}`).join(', ')}`);
  const avg = (f: (r: RunResult) => number): number => Math.round(rs.reduce((a, r) => a + f(r), 0) / rs.length);
  lines.push(`- avg end: gold ${avg((r) => r.gold)}, troops ${avg((r) => r.troops)}, heat ${avg((r) => r.heat)}`);
  lines.push(
    `- orders: explicit ${avg((r) => r.explicitOrders)}/run, intent ${avg((r) => r.intentOrders)}/run, people verbs ${avg((r) => r.peopleVerbs)}/run`,
  );
  lines.push('');
}
lines.push('## Departure timing (all policies)');
lines.push('');
{
  const buckets = new Map<string, number>();
  for (const p of POLICY_NAMES)
    for (const r of results[p])
      for (const d of r.departures) {
        const act = d.turn <= 10 ? 'act1' : d.turn <= 22 ? 'act2' : 'act3';
        buckets.set(`${d.lt}/${act}`, (buckets.get(`${d.lt}/${act}`) ?? 0) + 1);
      }
  lines.push([...buckets.entries()].sort().map(([k, v]) => `${k}: ${v}`).join(', ') || 'none');
}
lines.push('');

const report = lines.join('\n');
writeFileSync(new URL('../../sim_report.md', import.meta.url), report);
console.log(report);

const failed = assertions.filter((a) => !a.pass);
if (failed.length > 0) {
  console.error(`\n${failed.length} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nAll assertions PASS');
