// Engine orchestration: initGame, council validation, turn resolution (§3.2, D-010), replay.
// A run is fully reconstructable from (seed, actionLog) — spec §0.2.
import {
  CAST_HIDDEN,
  CAST_PUBLIC,
  TUNING,
  contractById,
  hiddenById,
  validateData,
} from './data';
import { actOf, addCard, addCardNow, adjustLoyalty, bandOf, clamp, getLt, log } from './core';
import { hashSeed } from './rng';
import {
  acceptContract,
  fireAssignmentHooks,
  resolveContractMission,
  resolveNegotiate,
  resolveRecruit,
  resolveScout,
} from './resolution';
import {
  advanceWar,
  applyDrift,
  departureSweep,
  detectBandCrossings,
  endTurnHeat,
  expireOpportunities,
  payWages,
  recordTell,
  scheduleTell,
} from './drama';
import {
  applyConfront,
  applyPraise,
  applyPrivateTalk,
  applyPromote,
  applyReprimand,
  applyReward,
} from './people';
import { drawEvents, drawOffers, tickExpiries } from './decks';
import {
  deliverDueTells,
  generateDutyCard,
  generateMissionCards,
  generateWarNewsCard,
  rookeAudit,
} from './reports';
import { computeEpilogue } from './epilogue';
import { MISSION_VERBS, PEOPLE_VERBS } from './types';
import type {
  CouncilOrders,
  GameState,
  LtState,
  MissionRecord,
  MissionVerb,
  Order,
  PeopleVerb,
} from './types';

export const ENGINE_VERSION = '0.1.0';

export function initGame(seed: string): GameState {
  validateData();
  const lts: LtState[] = CAST_PUBLIC.map((pub) => {
    const hidden = hiddenById.get(pub.id)!;
    return {
      id: pub.id,
      status: 'active',
      departedTurn: null,
      departedNote: null,
      loyalty: hidden.loyaltyStart,
      recognition: 0,
      rewardLog: [],
      consecutiveExplicit: 0,
      praiseTurns: [],
      intentTurns: [],
      lastTalkTurn: -99,
      lastBand: bandOf(hidden.loyaltyStart),
      grievances: [],
      streaks: {},
      flags: { skimTotal: 0, skimSuppressedUntil: -1, confessed: [] },
      tells: [],
      chronicle: [],
    };
  });
  const state: GameState = {
    version: ENGINE_VERSION,
    seed,
    rngS: hashSeed(seed),
    turn: 0,
    over: false,
    endReason: null,
    gold: TUNING.start.gold,
    troops: TUNING.start.troops,
    standing: { lich: 0, zombie: 0 },
    heat: 0,
    heatFired: [],
    discoveryLevel: 0,
    exposed: false,
    warTrack: 0,
    warTrackAt22: null,
    workedFor: { lich: [], zombie: [] },
    lts,
    offers: [],
    banked: [],
    completedContracts: [],
    failedContracts: [],
    forfeitedContracts: [],
    dealtContracts: {},
    usedEvents: [],
    eventLastFired: {},
    opportunities: [],
    scheduledTells: [],
    tellSeq: 0,
    cards: [],
    cardSeq: 0,
    missionRecords: [],
    recordSeq: 0,
    log: [],
    logSeq: 0,
    promotedLt: null,
    goldShortStreak: 0,
    warNewsAntagonist: null,
    betterTerms: null,
    epilogue: null,
    stats: {
      explicitOrders: {},
      intentOrders: {},
      peopleVerbsUsed: {},
      assignmentsByLt: Object.fromEntries(lts.map((l) => [l.id, []])),
      contractsCompleted: 0,
      contractsFailed: 0,
    },
    turnWarPush: 0,
    turnHeatAdded: false,
    guardActive: false,
    wagesPaidLastTurn: true,
    poachLastTurn: -99,
    oppLastTurn: {},
  };
  log(state, 'INIT', {
    inputs: { seed, gold: state.gold, troops: state.troops },
    computation: `run initialized (engine ${ENGINE_VERSION}); cast of ${lts.length}; determinism root ${state.rngS}`,
  });
  // Opening board + fiction (cards stamped for turn 1 via addCard while turn=0)
  addCard(state, {
    kind: 'ARRIVAL',
    templateKey: 'arrival',
    sourceTag: 'the company, at the edge of the Fields',
    facts: { gold: state.gold, troops: state.troops },
    citable: false,
  });
  generateWarNewsCard(state, {
    trueDelta: 0,
    claimedDirection: 0,
    lean: 'balanced',
    sourceType: 'traveler',
    antagonist: null,
  });
  drawOffers(state);
  state.turn = 1;
  return state;
}

// ---------------------------------------------------------------------------
// Validation (throws; UI prevents, policies are legal by construction)
// ---------------------------------------------------------------------------

function isPeopleVerb(v: string): v is PeopleVerb {
  return (PEOPLE_VERBS as readonly string[]).includes(v);
}
function isMissionVerb(v: string): v is MissionVerb {
  return (MISSION_VERBS as readonly string[]).includes(v);
}

export function validateCouncil(state: GameState, council: CouncilOrders): void {
  if (state.over) throw new Error('the run is over');
  const seen = new Set<string>();
  let people = 0;
  const contractsAssigned = new Set<string>();
  for (const id of council.accepts) {
    if (!state.offers.some((o) => o.contractId === id)) throw new Error(`accept: ${id} is not on offer`);
  }
  for (const order of council.orders) {
    const lt = state.lts.find((l) => l.id === order.ltId);
    if (!lt) throw new Error(`unknown lieutenant ${order.ltId}`);
    if (lt.status !== 'active') throw new Error(`${order.ltId} is no longer with the company`);
    if (seen.has(order.ltId)) throw new Error(`${order.ltId} was given two assignments`);
    seen.add(order.ltId);
    if (isPeopleVerb(order.verb)) {
      people++;
      if (people > TUNING.peopleVerbs.capPerTurn)
        throw new Error(`people-verb cap is ${TUNING.peopleVerbs.capPerTurn} per turn (§3.2)`);
      if (order.verb === 'PRIVATE_TALK' && state.turn - lt.lastTalkTurn < TUNING.peopleVerbs.talkCooldown)
        throw new Error(`private talk with ${order.ltId} is on cooldown`);
      if (order.verb === 'PROMOTE' && state.promotedLt) throw new Error('a First Captain has already been named');
      if (order.verb === 'REWARD' && !(order.gold && order.gold > 0)) throw new Error('reward needs gold');
      if (order.verb === 'CONFRONT' && (order.evidenceCardIds?.length ?? 0) > 2)
        throw new Error('cite at most 2 cards as evidence');
    } else if (isMissionVerb(order.verb)) {
      if (order.verb === 'TAKE_CONTRACT') {
        const cid = order.contractId;
        if (!cid) throw new Error('TAKE_CONTRACT needs a contract');
        const held =
          state.offers.some((o) => o.contractId === cid && o.expiresTurn >= state.turn) ||
          state.banked.some((b) => b.contractId === cid && b.expiresTurn >= state.turn);
        if (!held) throw new Error(`contract ${cid} is not available`);
        if (contractsAssigned.has(cid)) throw new Error(`contract ${cid} assigned twice`);
        contractsAssigned.add(cid);
      }
      if (order.verb === 'RECRUIT' && !(order.gold && order.gold > 0)) throw new Error('recruiting needs a budget');
      if (order.verb === 'NEGOTIATE' && !order.faction) throw new Error('negotiate with whom?');
    } else {
      throw new Error(`unknown verb ${order.verb}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Turn resolution (§3.2 resolution phase; ordering per D-010)
// ---------------------------------------------------------------------------

export function submitCouncil(state: GameState, council: CouncilOrders): void {
  validateCouncil(state, council);
  state.turnWarPush = 0;
  state.turnHeatAdded = false;
  state.guardActive = false;

  // 1. Wages (D-026)
  payWages(state);

  // 2. Explicit accepts (bank for later)
  for (const id of council.accepts) acceptContract(state, id);

  // 3. People verbs — before missions, so same-turn repair is possible (D-010)
  const peopleOrders = council.orders.filter((o) => isPeopleVerb(o.verb));
  for (const order of peopleOrders) {
    const lt = getLt(state, order.ltId);
    state.stats.peopleVerbsUsed[order.verb] = (state.stats.peopleVerbsUsed[order.verb] ?? 0) + 1;
    state.stats.assignmentsByLt[order.ltId].push(state.turn); // a people verb is that lt's assignment (§3.2)
    if (lt.status !== 'active') continue; // may have ruptured out mid-phase
    switch (order.verb as PeopleVerb) {
      case 'PRAISE':
        applyPraise(state, lt);
        break;
      case 'REWARD':
        applyReward(state, lt, order.gold ?? 0);
        break;
      case 'REPRIMAND':
        applyReprimand(state, lt);
        break;
      case 'PRIVATE_TALK': {
        const tellSpec = applyPrivateTalk(state, lt);
        if (tellSpec) {
          const card = state.cards.find((c) => c.id === tellSpec.cardId)!;
          recordTell(state, lt, card, tellSpec.kind, 1);
        }
        break;
      }
      case 'PROMOTE':
        applyPromote(state, lt);
        break;
      case 'CONFRONT':
        applyConfront(state, lt, order);
        break;
    }
  }

  // 4. Mission assignments in roster order (deterministic RNG consumption)
  const records: MissionRecord[] = [];
  const duties: { ltId: string; verb: string }[] = [];
  const missionByLt = new Map(council.orders.filter((o) => isMissionVerb(o.verb)).map((o) => [o.ltId, o]));
  let rookeInCamp = false;
  for (const lt of state.lts) {
    if (lt.status !== 'active') continue;
    const order = missionByLt.get(lt.id);
    if (!order) {
      if (!peopleOrders.some((o) => o.ltId === lt.id)) duties.push({ ltId: lt.id, verb: 'HOLD' });
      if (lt.id === 'rooke') rookeInCamp = true;
      continue;
    }
    state.stats.assignmentsByLt[lt.id].push(state.turn);
    const latitude = order.latitude ?? 'explicit';
    if (order.verb === 'TAKE_CONTRACT' || order.verb === 'SCOUT' || order.verb === 'NEGOTIATE' || order.verb === 'RECRUIT') {
      if (latitude === 'explicit') state.stats.explicitOrders[lt.id] = (state.stats.explicitOrders[lt.id] ?? 0) + 1;
      else state.stats.intentOrders[lt.id] = (state.stats.intentOrders[lt.id] ?? 0) + 1;
      trackMicromanagement(state, lt, latitude);
    }
    const contract = order.contractId ? contractById.get(order.contractId) : undefined;
    fireAssignmentHooks(state, lt, order, contract);
    switch (order.verb as MissionVerb) {
      case 'TAKE_CONTRACT':
        records.push(resolveContractMission(state, lt, order));
        break;
      case 'SCOUT':
        records.push(resolveScout(state, lt, order));
        break;
      case 'NEGOTIATE':
        records.push(resolveNegotiate(state, lt, order));
        break;
      case 'RECRUIT':
        records.push(resolveRecruit(state, lt, order));
        break;
      case 'GUARD_CAMP':
        state.guardActive = true;
        duties.push({ ltId: lt.id, verb: 'GUARD_CAMP' });
        if (lt.id === 'rooke') rookeInCamp = true;
        break;
      case 'REST':
        adjustLoyalty(state, lt, TUNING.rest.loyalty, 'a day of rest');
        lt.consecutiveExplicit = 0;
        duties.push({ ltId: lt.id, verb: 'REST' });
        if (lt.id === 'rooke') rookeInCamp = true;
        break;
    }
  }

  // 5. Events (camp, faction pressure, opportunities incl. guaranteed poach)
  drawEvents(state);

  // 6. War track — weather, not minds (§4)
  const scoutedWar = records.some(
    (r) =>
      r.verb === 'SCOUT' &&
      r.notes.includes('scouted:warFront') &&
      (r.tier === 'SUCCESS' || r.tier === 'CRIT'),
  );
  const warFacts = advanceWar(state, scoutedWar);

  // 7. Loyalty drift (§9.2)
  applyDrift(state);

  // 8. Band crossings -> guaranteed tells (§9.3)
  detectBandCrossings(state);

  // 9. Departure checks (§9.4) — only sees tells the player has already read
  departureSweep(state);

  // 10. Heat decay + discovery thresholds (§5.2)
  endTurnHeat(state);

  // 11. Expire opportunities & contracts; deal the next board
  expireOpportunities(state);
  tickExpiries(state);
  drawOffers(state);

  // 12. Reports for the next morning (§10)
  generateMissionCards(state, records);
  generateDutyCard(state, duties);
  rookeAudit(state, rookeInCamp);
  generateWarNewsCard(state, warFacts);
  deliverDueTells(state);

  // 13. End-of-run checks (D-024)
  if (state.gold < 0) state.goldShortStreak++;
  else state.goldShortStreak = 0;
  const active = state.lts.filter((l) => l.status === 'active').length;
  const collapsed =
    state.troops < TUNING.collapse.troopsFloor ||
    state.goldShortStreak >= TUNING.collapse.goldDebtTurns ||
    active < TUNING.collapse.minActiveLts;
  if (collapsed) {
    state.over = true;
    state.endReason = 'collapse';
    state.epilogue = computeEpilogue(state, 'collapse');
  } else if (state.turn >= TUNING.turns) {
    state.over = true;
    state.endReason = 'completed';
    state.epilogue = computeEpilogue(state, 'completed');
  } else {
    state.turn += 1;
  }
}

/** Micromanagement resentment (§7.3): cumulative, tracked, and eventually told. */
function trackMicromanagement(state: GameState, lt: LtState, latitude: 'explicit' | 'intent'): void {
  const hidden = hiddenById.get(lt.id)!;
  const applies = hidden.temperaments.some((t) => TUNING.micromanage.appliesTo.includes(t));
  if (!applies) return;
  if (latitude === 'intent') {
    lt.consecutiveExplicit = 0;
    lt.intentTurns.push(state.turn);
    return;
  }
  lt.consecutiveExplicit++;
  if (lt.consecutiveExplicit % TUNING.micromanage.ordersPerPenalty === 0) {
    adjustLoyalty(state, lt, -TUNING.micromanage.penalty, 'micromanagement resentment');
    log(state, 'HOOK', {
      actor: lt.id,
      inputs: { consecutiveExplicit: lt.consecutiveExplicit },
      computation: `micromanagement accumulator: ${lt.consecutiveExplicit} consecutive explicit orders -> -${TUNING.micromanage.penalty} loyalty (§7.3)`,
    });
  }
  if (lt.consecutiveExplicit === 4 || lt.consecutiveExplicit === 8) {
    scheduleTell(state, lt, 'micromanage_grumble', { count: lt.consecutiveExplicit });
  }
}

// ---------------------------------------------------------------------------
// Replay (§0.2): a run is (seed, actionLog)
// ---------------------------------------------------------------------------

export function replay(seed: string, actions: CouncilOrders[]): GameState {
  const state = initGame(seed);
  for (const action of actions) {
    if (state.over) break;
    submitCouncil(state, action);
  }
  return state;
}

export { actOf };
