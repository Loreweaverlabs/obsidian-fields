// Epilogue computation (§2.4) — the attachment payoff. Never stubbed.
import { TUNING, publicById } from './data';
import { log } from './core';
import type { Deed, EndingArchetype, Epilogue, FactionId, GameState } from './types';

export function computeEpilogue(state: GameState, reason: 'completed' | 'collapse'): Epilogue {
  const w = TUNING.war;
  const e = TUNING.epilogue;
  const warOutcome: Epilogue['warOutcome'] =
    state.warTrack <= -w.decisiveAt ? 'LICH_VICTORY' : state.warTrack >= w.decisiveAt ? 'ZOMBIE_VICTORY' : 'STALEMATE';

  const { lich, zombie } = state.standing;
  let alignedWith: FactionId | null = null;
  if (lich >= e.alignedStanding && lich - zombie >= 20) alignedWith = 'lich';
  else if (zombie >= e.alignedStanding && zombie - lich >= 20) alignedWith = 'zombie';

  let archetype: EndingArchetype;
  if (state.exposed) archetype = 'EXPOSED';
  else if (reason === 'collapse') archetype = 'COMPANY_BREAKS';
  else if (alignedWith && warOutcome !== 'STALEMATE') {
    const victor: FactionId = warOutcome === 'LICH_VICTORY' ? 'lich' : 'zombie';
    archetype = alignedWith === victor ? 'BANNERMEN' : 'BACKED_THE_LOSER';
  } else if (state.gold >= e.richGold) archetype = 'RICH_AND_FREE';
  else archetype = 'GROUND_DOWN';

  const ltSections = state.lts.map((lt) => {
    const deeds = pickDeeds(lt.chronicle, e.deedsPerLt);
    return {
      ltId: lt.id,
      status: lt.status,
      deeds,
      departedNote: lt.departedNote,
    };
  });

  const epilogue: Epilogue = {
    archetype,
    warOutcome,
    alignedWith,
    facts: {
      gold: state.gold,
      troops: state.troops,
      standing: { ...state.standing },
      warTrack: state.warTrack,
      heat: state.heat,
      discoveryLevel: state.discoveryLevel,
      contractsCompleted: state.completedContracts.length,
      contractsFailed: state.failedContracts.length,
      endedAtTurn: state.turn,
      reason,
      survivors: state.lts.filter((l) => l.status === 'active').map((l) => l.id),
    },
    ltSections,
  };
  log(state, 'END', {
    inputs: { archetype, warOutcome, alignedWith, reason, gold: state.gold, troops: state.troops },
    computation: `run ends: ${archetype} under ${warOutcome} (${reason}); epilogue pulls ${e.deedsPerLt} chronicle lines per lieutenant`,
  });
  return epilogue;
}

/** 2-3 chronicle pulls per lieutenant (§10.3): heaviest deeds, ties to the most recent. */
function pickDeeds(chronicle: Deed[], n: number): Deed[] {
  return [...chronicle]
    .sort((a, b) => b.weight - a.weight || b.turn - a.turn)
    .slice(0, n)
    .sort((a, b) => a.turn - b.turn);
}

export function displayNameOf(ltId: string): string {
  const pub = publicById.get(ltId)!;
  return `${pub.name} ${pub.epithet}`;
}
