// Policy bots (§13.2). Policies read only player-visible information: the board, the cards,
// the ledger, and the tells that have already been shown (each tell is the record of a card
// the player read). They never touch hidden loyalty/competence. Each policy draws from its
// own derived RNG so generated action logs are deterministic per seed and never touch game RNG.
import { contractById, publicById, TUNING } from '../engine/data';
import { chance, pick, randInt, type RngBox } from '../engine/rng';
import type { CouncilOrders, Domain, GameState, LtState, Order } from '../engine/types';

export type Policy = (state: GameState, rng: RngBox) => CouncilOrders;
export type PolicyName = 'random' | 'naiveLoyal' | 'attentive';

/** What any captain knows of their people's trades from reputation (public briefs, not hidden state). */
const KNOWN_TRADE: Record<string, Domain> = {
  serah: 'BATTLE',
  kael: 'RAID',
  rooke: 'INTEL',
  hale: 'PURGE',
  vex: 'ESCORT',
};

function coinFirst(ltId: string): boolean {
  return publicById.get(ltId)!.visibleTraits.includes('mercenary');
}

function activeLts(state: GameState): LtState[] {
  return state.lts.filter((l) => l.status === 'active');
}

/** Contracts assignable this turn (on offer or banked, unexpired). */
function availableContracts(state: GameState): string[] {
  const ids = [
    ...state.offers.filter((o) => o.expiresTurn >= state.turn).map((o) => o.contractId),
    ...state.banked.filter((b) => b.expiresTurn >= state.turn).map((b) => b.contractId),
  ];
  return [...new Set(ids)];
}

/** Tells the player has actually seen (cards up to the current reports phase). */
function seenTells(state: GameState, ltId: string, withinTurns = 99): number {
  const lt = state.lts.find((l) => l.id === ltId)!;
  return lt.tells.filter((t) => t.turn <= state.turn && state.turn - t.turn <= withinTurns).length;
}

// ---------------------------------------------------------------------------

export const randomPolicy: Policy = (state, rng) => {
  const orders: Order[] = [];
  const accepts: string[] = [];
  const usedContracts = new Set<string>();
  let peopleUsed = 0;

  for (const offer of state.offers) {
    if (chance(rng, 30)) accepts.push(offer.contractId);
  }

  const lts = activeLts(state);
  for (const lt of lts) {
    // Nobody idles 4+ turns straight (no dead cast members, §13.2)
    const recent = state.stats.assignmentsByLt[lt.id].some((t) => state.turn - t < 4);
    if (recent && !chance(rng, 75)) continue;
    // Occasionally use a people verb instead of a mission
    if (peopleUsed < TUNING.peopleVerbs.capPerTurn && chance(rng, 18)) {
      const opts: Order[] = [];
      opts.push({ ltId: lt.id, verb: 'PRAISE' });
      if (state.gold > 60) opts.push({ ltId: lt.id, verb: 'REWARD', gold: randInt(rng, 25, 60) });
      opts.push({ ltId: lt.id, verb: 'REPRIMAND' });
      if (state.turn - lt.lastTalkTurn >= TUNING.peopleVerbs.talkCooldown)
        opts.push({ ltId: lt.id, verb: 'PRIVATE_TALK' });
      if (!state.promotedLt && chance(rng, 15)) opts.push({ ltId: lt.id, verb: 'PROMOTE' });
      const citable = state.cards.filter((c) => c.turn <= state.turn && c.citable && c.ltId === lt.id);
      if (citable.length > 0 && chance(rng, 25)) {
        opts.push({ ltId: lt.id, verb: 'CONFRONT', evidenceCardIds: [pick(rng, citable).id] });
      }
      orders.push(pick(rng, opts));
      peopleUsed++;
      continue;
    }
    const avail = availableContracts(state).filter((id) => !usedContracts.has(id));
    const options: Order[] = [];
    if (avail.length > 0) {
      const cid = pick(rng, avail);
      options.push({ ltId: lt.id, verb: 'TAKE_CONTRACT', contractId: cid });
      options.push({ ltId: lt.id, verb: 'TAKE_CONTRACT', contractId: cid }); // weight toward work
    }
    options.push({ ltId: lt.id, verb: 'SCOUT', scoutTarget: pick(rng, ['warFront', 'faction', 'rumor'] as const) });
    options.push({ ltId: lt.id, verb: 'GUARD_CAMP' });
    options.push({ ltId: lt.id, verb: 'REST' });
    if (state.gold > 100) options.push({ ltId: lt.id, verb: 'RECRUIT', gold: randInt(rng, 20, 60) });
    options.push({ ltId: lt.id, verb: 'NEGOTIATE', faction: chance(rng, 50) ? 'lich' : 'zombie' });
    const order = pick(rng, options);
    if (order.verb === 'TAKE_CONTRACT') usedContracts.add(order.contractId!);
    order.latitude = chance(rng, 50) ? 'intent' : 'explicit';
    orders.push(order);
  }
  return { accepts: [...new Set(accepts)], orders };
};

// ---------------------------------------------------------------------------

export const naiveLoyalPolicy: Policy = (state, rng) => {
  // Always explicit orders, never people verbs (§13.2). Chases pay, matches specialties naively.
  const orders: Order[] = [];
  const usedContracts = new Set<string>();
  const byPay = [...state.offers]
    .filter((o) => o.expiresTurn >= state.turn)
    .sort((a, b) => b.paymentAdjusted - a.paymentAdjusted);
  const accepts = byPay.slice(0, 2).map((o) => o.contractId);

  const assignable = [...new Set([...accepts, ...availableContracts(state)])];
  const lts = activeLts(state);
  const taken = new Set<string>();
  // Greedy trade matching from public reputation
  for (const cid of assignable) {
    const def = contractById.get(cid)!;
    const free = lts.filter((l) => !taken.has(l.id));
    if (free.length === 0) break;
    const specialist = free.find((l) => KNOWN_TRADE[l.id] === def.domain);
    const ltPick = specialist ?? free[0];
    taken.add(ltPick.id);
    usedContracts.add(cid);
    orders.push({ ltId: ltPick.id, verb: 'TAKE_CONTRACT', contractId: cid, latitude: 'explicit' });
    if (orders.length >= 3) break;
  }
  for (const lt of lts) {
    if (taken.has(lt.id)) continue;
    if (state.gold > 150 && !orders.some((o) => o.verb === 'RECRUIT')) {
      orders.push({ ltId: lt.id, verb: 'RECRUIT', gold: 40, latitude: 'explicit' });
    } else if (chance(rng, 50)) {
      orders.push({ ltId: lt.id, verb: 'SCOUT', scoutTarget: 'warFront', latitude: 'explicit' });
    } else {
      orders.push({ ltId: lt.id, verb: 'GUARD_CAMP', latitude: 'explicit' });
    }
  }
  return { accepts, orders };
};

// ---------------------------------------------------------------------------

export const attentivePolicy: Policy = (state, rng) => {
  // Reads tells and repairs (§13.2): people verbs on troubled lieutenants, evidence-based
  // confrontation, hook-aware contracts, latitude where trust is earned.
  const orders: Order[] = [];
  const accepts: string[] = [];
  const usedContracts = new Set<string>();
  const orderedLts = new Set<string>();
  let peopleUsed = 0;

  const lts = activeLts(state);

  // 1. Confront when there's visible, citable proof of misbehavior (audit, refusal, anomaly)
  if (peopleUsed < 2) {
    const proofCards = state.cards.filter((c) => {
      if (!c.citable || c.turn > state.turn || state.turn - c.turn > 5 || !c.ltId) return false;
      const f = c.facts as Record<string, unknown>;
      return (
        c.templateKey === 'audit_discrepancy' ||
        c.templateKey === 'mission_refused' ||
        f.anomaly === 'delayed' ||
        f.anomaly === 'listless' ||
        f.blamedExternal === true
      );
    });
    if (proofCards.length > 0) {
      // Confront the most-evidenced lieutenant (audit beats anomaly)
      const best = proofCards.sort((a, b) => (a.templateKey === 'audit_discrepancy' ? -1 : 1) - (b.templateKey === 'audit_discrepancy' ? -1 : 1))[0];
      const target = best.templateKey === 'audit_discrepancy' ? 'vex' : best.ltId!;
      const targetLt = lts.find((l) => l.id === target);
      if (targetLt && chance(rng, 70)) {
        orders.push({ ltId: target, verb: 'CONFRONT', evidenceCardIds: [best.id] });
        orderedLts.add(target);
        peopleUsed++;
      }
    }
  }

  // 2. Repair the most-troubled lieutenant with fresh tells
  const troubled = lts
    .filter((l) => !orderedLts.has(l.id))
    .map((l) => ({ l, tells: seenTells(state, l.id, 4) }))
    .filter((x) => x.tells > 0)
    .sort((a, b) => b.tells - a.tells);
  for (const { l } of troubled) {
    if (peopleUsed >= 2) break;
    if (l.id === 'kael' && !state.promotedLt && seenTells(state, 'kael', 6) >= 2 && state.turn >= 12) {
      orders.push({ ltId: 'kael', verb: 'PROMOTE' });
    } else if (coinFirst(l.id) && state.gold > 80) {
      orders.push({ ltId: l.id, verb: 'REWARD', gold: 50 });
    } else if (state.turn - l.lastTalkTurn >= TUNING.peopleVerbs.talkCooldown && chance(rng, 50)) {
      orders.push({ ltId: l.id, verb: 'PRIVATE_TALK' });
    } else {
      orders.push({ ltId: l.id, verb: 'PRAISE' });
    }
    orderedLts.add(l.id);
    peopleUsed++;
  }

  // 3. Contracts: pick a side by mid-game and stick to it; avoid hook-violating work
  const side = dominantSide(state);
  const committed = state.turn >= 8 && side !== 'NEUTRAL';
  const offerDefs = state.offers
    .filter((o) => o.expiresTurn >= state.turn)
    .map((o) => ({ o, def: contractById.get(o.contractId)! }))
    .filter(({ def }) => !def.hookTags.includes('DESECRATION') && !def.hookTags.includes('HARMS_VILLAGE'))
    .filter(({ def }) => {
      if (def.source === 'NEUTRAL') return true;
      if (committed) return def.source === side; // one banner + neutrals: heat stays cold
      return state.heat < 20; // uncommitted early game: only dabble while nobody is watching
    })
    .sort((a, b) => b.o.paymentAdjusted - a.o.paymentAdjusted);
  for (const { o } of offerDefs.slice(0, 2)) accepts.push(o.contractId);

  const assignable = [...new Set([...accepts, ...availableContracts(state)])]
    .filter((id) => !usedContracts.has(id))
    .filter((id) => {
      const def = contractById.get(id)!;
      return !def.hookTags.includes('DESECRATION') && !def.hookTags.includes('HARMS_VILLAGE');
    });
  for (const cid of assignable) {
    const def = contractById.get(cid)!;
    // Visibly shaky people (a pile of fresh tells) don't get sent out with the company's money
    const free = lts.filter((l) => !orderedLts.has(l.id) && seenTells(state, l.id, 3) < 3);
    if (free.length === 0) break;
    // Don't hand hale to the powers; don't hand kael the dull work
    const fits = free.filter((l) => {
      if (l.id === 'hale' && def.source !== 'NEUTRAL') return false;
      if (l.id === 'kael' && (def.hookTags.includes('UNGLAMOROUS') || def.difficulty <= 3)) return false;
      return true;
    });
    const poolLts = fits.length > 0 ? fits : free;
    const specialist = poolLts.find((l) => KNOWN_TRADE[l.id] === def.domain);
    const ltPick = specialist ?? poolLts[0];
    orderedLts.add(ltPick.id);
    usedContracts.add(cid);
    const trusted = ltPick.id === 'serah' || ltPick.id === 'rooke' || ltPick.id === 'kael';
    orders.push({
      ltId: ltPick.id,
      verb: 'TAKE_CONTRACT',
      contractId: cid,
      latitude: trusted ? 'intent' : 'explicit',
    });
    if (orders.filter((x) => x.verb === 'TAKE_CONTRACT').length >= 3) break;
  }

  // 4. Remaining hands: rest the visibly weary, scout the war, mind the camp
  for (const lt of lts) {
    if (orderedLts.has(lt.id)) continue;
    if (seenTells(state, lt.id, 4) >= 2) {
      orders.push({ ltId: lt.id, verb: 'REST' });
    } else if (state.gold > 200 && !orders.some((o) => o.verb === 'RECRUIT') && state.troops < 90) {
      orders.push({ ltId: lt.id, verb: 'RECRUIT', gold: 50, latitude: 'explicit' });
    } else if (!orders.some((o) => o.verb === 'SCOUT') && chance(rng, 60)) {
      orders.push({ ltId: lt.id, verb: 'SCOUT', scoutTarget: 'warFront', latitude: 'explicit' });
    } else {
      orders.push({ ltId: lt.id, verb: 'GUARD_CAMP' });
    }
    orderedLts.add(lt.id);
  }
  return { accepts: [...new Set(accepts)], orders };
};

function dominantSide(state: GameState): 'LICH' | 'ZOMBIE' | 'NEUTRAL' {
  const d = state.standing.lich - state.standing.zombie;
  if (d >= 10) return 'LICH';
  if (d <= -10) return 'ZOMBIE';
  return 'NEUTRAL';
}

export const POLICIES: Record<PolicyName, Policy> = {
  random: randomPolicy,
  naiveLoyal: naiveLoyalPolicy,
  attentive: attentivePolicy,
};
