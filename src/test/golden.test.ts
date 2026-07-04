// Golden-seed snapshot tests (spec §0.2, §13.3): fixed (seed, action script) pairs whose
// full outcome log is snapshotted. Any engine change that alters outcomes breaks these
// loudly; update deliberately with `npm run golden:gen` (if actions must change) and
// `npx vitest run -u`, and flag the change in DECISIONS.md.
import { describe, expect, it } from 'vitest';
import { replay } from '../engine/engine';
import type { CouncilOrders, GameState } from '../engine/types';
import alpha from './fixtures/golden-alpha.json';
import beta from './fixtures/golden-beta.json';
import gamma from './fixtures/golden-gamma.json';

interface Fixture {
  seed: string;
  policy: string;
  actions: CouncilOrders[];
}

function outcomeText(state: GameState): string {
  const lines: string[] = [];
  lines.push(`seed=${state.seed} version=${state.version}`);
  lines.push(
    `end turn=${state.turn} reason=${state.endReason} archetype=${state.epilogue?.archetype} war=${state.epilogue?.warOutcome}`,
  );
  lines.push(
    `gold=${state.gold} troops=${state.troops} lich=${state.standing.lich} zombie=${state.standing.zombie} heat=${state.heat} track=${state.warTrack}`,
  );
  for (const lt of state.lts) {
    lines.push(
      `lt ${lt.id}: status=${lt.status} loyalty=${lt.loyalty} tells=${lt.tells.length} deeds=${lt.chronicle.length}${lt.departedTurn ? ` departed=t${lt.departedTurn}` : ''}`,
    );
  }
  lines.push(`cards=${state.cards.length} records=${state.missionRecords.length}`);
  lines.push('--- decision log ---');
  for (const e of state.log) {
    lines.push(`t${String(e.turn).padStart(2, '0')} [${e.type}]${e.actor ? ` ${e.actor}` : ''} ${e.computation}`);
  }
  return lines.join('\n');
}

describe('golden seeds', () => {
  const fixtures = [alpha, beta, gamma] as unknown as Fixture[];
  for (const fx of fixtures) {
    it(`${fx.seed} (${fx.policy}) replays to the snapshotted outcome`, async () => {
      const state = replay(fx.seed, fx.actions);
      expect(state.over).toBe(true);
      await expect(outcomeText(state)).toMatchFileSnapshot(`__snapshots__/${fx.seed}.outcome.txt`);
    });
  }

  it('replay is deterministic (same seed + actions -> identical outcome)', () => {
    const fx = fixtures[0];
    const a = outcomeText(replay(fx.seed, fx.actions));
    const b = outcomeText(replay(fx.seed, fx.actions));
    expect(a).toBe(b);
  });
});
