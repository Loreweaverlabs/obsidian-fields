// Produce the Appendix-B sample: an exported run with a fired Kael betrayal,
// annotated against the tell audit. Writes samples/kael_betrayal_run.json and
// samples/kael_betrayal_annotated.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initGame, submitCouncil, ENGINE_VERSION } from '../engine/engine';
import { derivedRng } from '../engine/rng';
import { POLICIES } from './policies';
import { renderCardText } from '../render/templateRenderer';
import { publicById } from '../engine/data';
import type { CouncilOrders, ExportedRun, GameState } from '../engine/types';

function findKaelRun(): { seed: string; state: GameState; actions: CouncilOrders[] } {
  for (let i = 0; i < 2000; i++) {
    const seed = `kael-hunt-${i}`;
    const state = initGame(seed);
    const rng = derivedRng(seed, 'policy:random');
    const actions: CouncilOrders[] = [];
    while (!state.over) {
      const a = POLICIES.random(state, rng);
      actions.push(a);
      submitCouncil(state, a);
    }
    const kael = state.lts.find((l) => l.id === 'kael')!;
    if (kael.status === 'betrayed') return { seed, state, actions };
  }
  throw new Error('no Kael betrayal found in 2000 seeds — check tuning');
}

const { seed, state, actions } = findKaelRun();
const kael = state.lts.find((l) => l.id === 'kael')!;
const dir = fileURLToPath(new URL('../../samples/', import.meta.url));
mkdirSync(dir, { recursive: true });

const run: ExportedRun = {
  format: 'obsidian-fields-run',
  version: ENGINE_VERSION,
  seed,
  rendererMode: 'template',
  llmFallbackCards: [],
  actions,
};
writeFileSync(`${dir}kael_betrayal_run.json`, JSON.stringify(run, null, 2));

const lines: string[] = [];
lines.push('# Sample run: a fired Kael arc, annotated against the tell audit');
lines.push('');
lines.push(`Seed \`${seed}\`, randomPolicy, engine ${ENGINE_VERSION}. Import \`kael_betrayal_run.json\``);
lines.push('into the game (Setup → Import a run, or ?debug=1 → Import) to replay it exactly.');
lines.push('');
lines.push(`**Kael betrayed on turn ${kael.departedTurn}.** ${kael.departedNote}.`);
lines.push('');
lines.push('## The tells, in order (all surfaced to the player before the check fired — §9.3)');
lines.push('');
for (const t of kael.tells.filter((x) => x.turn < (kael.departedTurn ?? 99))) {
  const card = state.cards.find((c) => c.id === t.cardId);
  const text = card ? renderCardText(state, card) : '(card missing)';
  lines.push(`### Turn ${t.turn} — ${t.kind} (strength ${t.strength}, card ${t.cardId})`);
  lines.push('');
  lines.push(`> ${text.replace(/\n+/g, ' ')}`);
  lines.push('');
}
lines.push('## The decision log around the departure');
lines.push('');
lines.push('```');
for (const e of state.log.filter(
  (l) =>
    l.actor === 'kael' &&
    ['DEPARTURE_CHECK', 'DEPARTURE_SUPPRESSED', 'DEPARTURE', 'OPPORTUNITY', 'BAND_CROSS', 'HOOK', 'WILLINGNESS'].includes(l.type) &&
    l.turn >= (kael.departedTurn ?? 30) - 6,
)) {
  lines.push(`t${e.turn} [${e.type}] ${e.computation}`);
}
lines.push('```');
lines.push('');
lines.push('## Why this is the hindsight-audit exhibit');
lines.push('');
lines.push('- Every departure requires >=2 tells surfaced in STRICTLY PRIOR turns (hard rule §9.3);');
lines.push(`  the audit above shows ${kael.tells.filter((x) => x.turn < (kael.departedTurn ?? 99)).length} reached the player with at least one council in hand to act, each with the exact card that carried it.`);
lines.push('- The DEPARTURE_CHECK entry shows the full §9.4 arithmetic (base + temperament +');
lines.push('  offer + grievance − power − bond vs the roll), so "was it earned?" is answerable');
lines.push('  mechanically, not vibes-first.');
lines.push('- A tester who says FELT_RANDOM about this run can be walked through these exact');
lines.push('  cards — that conversation is the experiment.');
lines.push('');
lines.push(`Final state: ${state.epilogue?.archetype} under ${state.epilogue?.warOutcome}; `);
lines.push(`gold ${state.gold}, troops ${state.troops}; departures: ${state.lts.filter((l) => l.status !== 'active' && l.status !== 'dead').map((l) => `${l.id}:${l.status}@t${l.departedTurn}`).join(', ')}.`);
lines.push('');
writeFileSync(`${dir}kael_betrayal_annotated.md`, lines.join('\n'));

console.log(`seed ${seed}: kael betrayed t${kael.departedTurn}; ${kael.tells.length} tells; wrote samples/.`);
console.log(`others: ${state.lts.map((l) => `${l.id}=${l.status}`).join(' ')}`);
