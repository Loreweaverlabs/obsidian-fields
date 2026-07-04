// Engine invariants beyond the golden snapshots.
import { describe, expect, it } from 'vitest';
import { initGame, replay, submitCouncil } from '../engine/engine';
import { derivedRng, hashSeed, rand } from '../engine/rng';
import { POLICIES } from '../sim/policies';
import type { CouncilOrders, GameState } from '../engine/types';

function runPolicy(seed: string, policy: keyof typeof POLICIES): GameState {
  const state = initGame(seed);
  const rng = derivedRng(seed, `policy:${policy}`);
  while (!state.over) {
    submitCouncil(state, POLICIES[policy](state, rng));
  }
  return state;
}

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = { rngS: hashSeed('x') };
    const b = { rngS: hashSeed('x') };
    for (let i = 0; i < 100; i++) expect(rand(a)).toBe(rand(b));
  });
  it('derived streams never touch the parent', () => {
    const a = { rngS: hashSeed('x') };
    const before = a.rngS;
    const d = derivedRng('x', 'child');
    rand(d);
    expect(a.rngS).toBe(before);
  });
});

describe('run invariants', () => {
  const seeds = ['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5'];
  for (const seed of seeds) {
    it(`${seed}: completes; numbers sane; tell gate holds`, () => {
      const state = runPolicy(seed, 'random');
      expect(state.over).toBe(true);
      expect(Number.isFinite(state.gold)).toBe(true);
      expect(Number.isFinite(state.troops)).toBe(true);
      expect(state.troops).toBeGreaterThanOrEqual(0);
      expect(state.epilogue).not.toBeNull();
      // Hard rule §9.3: every departure had >=2 tells surfaced in prior turns
      for (const lt of state.lts) {
        if (lt.status === 'active' || lt.status === 'dead') continue;
        const prior = lt.tells.filter((t) => t.turn <= (lt.departedTurn ?? 0));
        expect(prior.length, `${lt.id} departed with only ${prior.length} surfaced tells`).toBeGreaterThanOrEqual(2);
      }
      // Epilogue pulls chronicle lines (§2.4)
      for (const sec of state.epilogue!.ltSections) {
        const lt = state.lts.find((l) => l.id === sec.ltId)!;
        if (lt.chronicle.length >= 2) expect(sec.deeds.length).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it('exported (seed, actions) fully reconstructs a run', () => {
    const seed = 'roundtrip';
    const state = initGame(seed);
    const rng = derivedRng(seed, 'policy:random');
    const actions: CouncilOrders[] = [];
    while (!state.over) {
      const a = POLICIES.random(state, rng);
      actions.push(a);
      submitCouncil(state, a);
    }
    const replayed = replay(seed, actions);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(state));
  });
});
