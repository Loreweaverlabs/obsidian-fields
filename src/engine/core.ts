// Shared helpers: bands, acts, logging, cards, chronicle, small math.
import { TUNING } from './data';
import type {
  Band,
  CardKind,
  Deed,
  GameState,
  LogEntry,
  LogType,
  LtState,
  ReportCard,
} from './types';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function bandOf(loyalty: number): Band {
  const b = TUNING.bands;
  if (loyalty >= b.devoted) return 'DEVOTED';
  if (loyalty >= b.solid) return 'SOLID';
  if (loyalty >= b.wavering) return 'WAVERING';
  if (loyalty >= b.disaffected) return 'DISAFFECTED';
  return 'BREAKING';
}

export const BAND_ORDER: Band[] = ['BREAKING', 'DISAFFECTED', 'WAVERING', 'SOLID', 'DEVOTED'];

export function bandRank(band: Band): number {
  return BAND_ORDER.indexOf(band);
}

/** true if a is the same band as b or worse (lower) */
export function bandAtMost(a: Band, b: Band): boolean {
  return bandRank(a) <= bandRank(b);
}

export function actOf(turn: number): 1 | 2 | 3 {
  if (turn >= TUNING.acts.act3Start) return 3;
  if (turn >= TUNING.acts.act2Start) return 2;
  return 1;
}

export function activeLts(state: GameState): LtState[] {
  return state.lts.filter((l) => l.status === 'active');
}

export function getLt(state: GameState, id: string): LtState {
  const lt = state.lts.find((l) => l.id === id);
  if (!lt) throw new Error(`unknown lieutenant ${id}`);
  return lt;
}

/** Append a structured decision-log entry (§8.4). Returns the entry for chaining a card pointer. */
export function log(
  state: GameState,
  type: LogType,
  fields: { actor?: string; inputs: Record<string, unknown>; computation: string; visibleToPlayer?: string },
): LogEntry {
  const entry: LogEntry = {
    i: state.logSeq++,
    turn: state.turn,
    type,
    ...(fields.actor ? { actor: fields.actor } : {}),
    inputs: fields.inputs,
    computation: fields.computation,
    ...(fields.visibleToPlayer ? { visibleToPlayer: fields.visibleToPlayer } : {}),
  };
  state.log.push(entry);
  return entry;
}

/**
 * Create a report card for the NEXT reports phase.
 * During resolution of turn N, cards are stamped turn N+1 (read the next morning).
 */
export function addCard(
  state: GameState,
  card: Omit<ReportCard, 'id' | 'turn' | 'citable'> & { citable?: boolean },
): ReportCard {
  const showTurn = state.turn + 1;
  const full: ReportCard = {
    id: `t${showTurn}-c${state.cardSeq++}`,
    turn: showTurn,
    citable: card.citable ?? true,
    ...card,
  };
  state.cards.push(full);
  return full;
}

/** Cards for the CURRENT turn's reports phase (used only during initGame for turn 1). */
export function addCardNow(
  state: GameState,
  card: Omit<ReportCard, 'id' | 'turn' | 'citable'> & { citable?: boolean },
): ReportCard {
  const full: ReportCard = {
    id: `t${state.turn}-c${state.cardSeq++}`,
    turn: state.turn,
    citable: card.citable ?? true,
    ...card,
  };
  state.cards.push(full);
  return full;
}

export function addDeed(lt: LtState, deed: Deed): void {
  lt.chronicle.push(deed);
}

/** chronicleBond (§9.4): positive shared history is mechanically protective. */
export function chronicleBond(lt: LtState): number {
  const positive = lt.chronicle.filter((d) => d.valence > 0).reduce((a, d) => a + d.weight, 0);
  return clamp(Math.floor(positive / TUNING.departure.bondPositiveWeightPerLevel), 0, TUNING.departure.bondMax);
}

export function adjustLoyalty(state: GameState, lt: LtState, delta: number, reason: string): number {
  const before = lt.loyalty;
  lt.loyalty = clamp(Math.round(lt.loyalty + delta), 0, 100);
  const applied = lt.loyalty - before;
  if (applied !== 0) {
    log(state, 'DRIFT', {
      actor: lt.id,
      inputs: { before, delta, reason },
      computation: `loyalty ${before} ${delta >= 0 ? '+' : ''}${delta} -> ${lt.loyalty} (${reason})`,
    });
  }
  return applied;
}

export function adjustStanding(state: GameState, faction: 'lich' | 'zombie', delta: number): void {
  state.standing[faction] = clamp(state.standing[faction] + delta, -100, 100);
}

export function fmtGold(n: number): string {
  return `${n} gold`;
}
