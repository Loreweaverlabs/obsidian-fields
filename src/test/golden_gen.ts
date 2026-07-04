// Regenerate golden-run fixtures (D-004). Run only when deliberately re-baselining:
//   npm run golden:gen && npm test -- -u
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initGame, submitCouncil } from '../engine/engine';
import { derivedRng } from '../engine/rng';
import { POLICIES, type PolicyName } from '../sim/policies';
import type { CouncilOrders } from '../engine/types';

const FIXTURES: { seed: string; policy: PolicyName }[] = [
  { seed: 'golden-alpha', policy: 'random' },
  { seed: 'golden-beta', policy: 'naiveLoyal' },
  { seed: 'golden-gamma', policy: 'attentive' },
];

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
mkdirSync(dir, { recursive: true });

for (const { seed, policy } of FIXTURES) {
  const state = initGame(seed);
  const rng = derivedRng(seed, `policy:${policy}`);
  const actions: CouncilOrders[] = [];
  while (!state.over) {
    const a = POLICIES[policy](state, rng);
    actions.push(a);
    submitCouncil(state, a);
  }
  writeFileSync(`${dir}${seed}.json`, JSON.stringify({ seed, policy, actions }, null, 2));
  console.log(
    `${seed} (${policy}): ${actions.length} councils, end=${state.endReason}, archetype=${state.epilogue?.archetype}, log=${state.log.length} entries`,
  );
}
