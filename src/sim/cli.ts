// CLI playthrough (M2 gate): run a full game headless with a policy, dump the text.
// Usage: npm run cli -- --seed myseed --policy random [--verbose] [--log kael] [--raw]
import { initGame, submitCouncil } from '../engine/engine';
import { derivedRng } from '../engine/rng';
import { POLICIES, type PolicyName } from './policies';
import { renderCardText } from '../render/templateRenderer';
import { publicById } from '../engine/data';
import type { CouncilOrders, GameState } from '../engine/types';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1];
  return fallback;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const seed = arg('seed', 'obsidian-demo')!;
const policyName = (arg('policy', 'random') as PolicyName)!;
const verbose = flag('verbose');
const raw = flag('raw');
const logActor = arg('log');

const policy = POLICIES[policyName];
if (!policy) {
  console.error(`unknown policy ${policyName}; use random | naiveLoyal | attentive`);
  process.exit(1);
}

const state = initGame(seed);
const policyRng = derivedRng(seed, `policy:${policyName}`);
const actions: CouncilOrders[] = [];

function name(ltId?: string): string {
  if (!ltId) return '';
  const p = publicById.get(ltId);
  return p ? `${p.name} ${p.epithet}` : ltId;
}

function printReports(s: GameState, turn: number): void {
  const cards = s.cards.filter((c) => c.turn === turn);
  for (const card of cards) {
    const text = raw ? JSON.stringify(card.facts) : renderCardText(s, card);
    console.log(`  [${card.kind}${card.ltId ? `:${card.ltId}` : ''}] (${card.sourceTag})`);
    for (const line of text.split('\n')) console.log(`      ${line}`);
  }
}

console.log(`=== THE OBSIDIAN FIELDS — seed "${seed}", policy ${policyName} ===\n`);
console.log(`--- Turn 1, morning reports ---`);
printReports(state, 1);

while (!state.over) {
  const turn = state.turn;
  const orders = policy(state, policyRng);
  actions.push(orders);
  if (verbose) {
    console.log(`\n  > council (turn ${turn}): accepts=[${orders.accepts.join(', ')}]`);
    for (const o of orders.orders) {
      console.log(
        `  > ${name(o.ltId)} <- ${o.verb}${o.contractId ? `(${o.contractId})` : ''}${o.latitude ? ` [${o.latitude}]` : ''}${o.gold ? ` ${o.gold}g` : ''}${o.evidenceCardIds?.length ? ` citing ${o.evidenceCardIds.join('+')}` : ''}`,
      );
    }
  }
  submitCouncil(state, orders);
  const shownTurn = state.over ? turn + 1 : state.turn;
  console.log(`\n--- Turn ${shownTurn} reports (gold ${state.gold}, troops ${state.troops}, lich ${state.standing.lich}, zombie ${state.standing.zombie}, heat ${state.heat}, war ${state.warTrack}) ---`);
  printReports(state, shownTurn);
}

console.log(`\n=== RUN ENDS (${state.endReason}) at turn ${state.turn} ===`);
if (state.epilogue) {
  const e = state.epilogue;
  console.log(`Archetype: ${e.archetype} | War: ${e.warOutcome} | Aligned: ${e.alignedWith ?? 'no banner'}`);
  console.log(`Treasury ${state.gold} gold, ${state.troops} troops\n`);
  const { composeEpilogue } = await import('../render/epilogueText');
  for (const sec of composeEpilogue(state, e)) {
    if (sec.heading) console.log(`  — ${sec.heading} —`);
    for (const line of sec.body.split('\n')) console.log(`  ${line}`);
    console.log('');
  }
}

// Departure audit: were the tells there? (§9.3 hindsight audit)
const departed = state.lts.filter((l) => l.status !== 'active' && l.status !== 'dead');
if (departed.length > 0) {
  console.log('\n=== TELL AUDIT (hindsight, §9.3) ===');
  for (const lt of departed) {
    console.log(`  ${name(lt.id)} (${lt.status}, turn ${lt.departedTurn}):`);
    for (const t of lt.tells) {
      console.log(`      turn ${t.turn}: [${t.kind}] via card ${t.cardId} (strength ${t.strength})`);
    }
  }
}

if (logActor) {
  console.log(`\n=== DECISION LOG (${logActor}) ===`);
  for (const entry of state.log.filter((l) => l.actor === logActor || logActor === 'all')) {
    console.log(`  t${entry.turn} [${entry.type}] ${entry.computation}`);
  }
}
