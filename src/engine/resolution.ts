// Mission resolution: willingness gate (§8.3), core roll (§8.1), outcome tiers (§8.2),
// temperament riders under intent latitude (§7.3), contract effects, hook firing (§6.1).
import { TUNING, contractById, hiddenById } from './data';
import { actOf, addDeed, adjustLoyalty, adjustStanding, bandOf, clamp, getLt, log } from './core';
import { chance, d100, derivedRng, pick, randInt } from './rng';
import type {
  Banked,
  ContractDef,
  Domain,
  GameState,
  Latitude,
  LtState,
  MissionRecord,
  MissionVerb,
  Offer,
  Order,
  Temperament,
  Tier,
} from './types';

const VERB_DOMAIN: Partial<Record<MissionVerb, Domain>> = {
  SCOUT: 'INTEL',
  NEGOTIATE: 'INTEL',
  RECRUIT: 'LOGISTICS',
};

function newRecord(state: GameState, ltId: string, verb: MissionVerb): MissionRecord {
  const rec: MissionRecord = {
    id: `r${state.recordSeq++}`,
    turn: state.turn,
    ltId,
    verb,
    goldTrue: 0,
    goldReported: 0,
    goldSkimmed: 0,
    troopsLost: 0,
    standingDelta: {},
    heatDelta: 0,
    riders: [],
    willingness: 'FULL',
    notes: [],
  };
  state.missionRecords.push(rec);
  return rec;
}

/** Does this contract violate one of the lieutenant's grievance hooks? (refusal grounds) */
function hookViolation(lt: LtState, contract: ContractDef): string | null {
  const hidden = hiddenById.get(lt.id)!;
  for (const hook of hidden.hooks) {
    if (!hook.grievance || hook.delta > TUNING.willingness.refusalHookDeltaAtMost) continue;
    const on = hook.on;
    if (
      (on.kind === 'TAG_COMPLETED_BY_COMPANY' || on.kind === 'TAG_ACCEPTED') &&
      contract.hookTags.includes(on.tag)
    ) {
      return hook.id;
    }
    if (on.kind === 'SOURCE_COMPLETED_BY_COMPANY' && contract.source === on.source) return hook.id;
  }
  return null;
}

/** Willingness check before the roll (§8.3). Returns C_eff penalty, or 'REFUSED'. */
function willingness(state: GameState, lt: LtState, order: Order, contract?: ContractDef): number | 'REFUSED' {
  const band = bandOf(lt.loyalty);
  if (band !== 'DISAFFECTED' && band !== 'BREAKING') return 0;
  const w = TUNING.willingness;
  if (contract) {
    const violation = hookViolation(lt, contract);
    if (violation) {
      log(state, 'WILLINGNESS', {
        actor: lt.id,
        inputs: { loyalty: lt.loyalty, band, order: `${order.verb}:${contract.id}`, hookHit: violation },
        computation: `band=${band} + hook violation (${violation}) -> REFUSED (order wasted)`,
        visibleToPlayer: 'report shows the refusal, in words',
      });
      return 'REFUSED';
    }
  }
  if (band === 'BREAKING') {
    const roll = d100(state);
    const sandbag = roll <= w.sandbagChance;
    log(state, 'WILLINGNESS', {
      actor: lt.id,
      inputs: { loyalty: lt.loyalty, band, order: order.verb, chance: w.sandbagChance, roll },
      computation: `band=BREAKING -> sandbag roll ${w.sandbagChance}% -> rolled ${roll} -> ${sandbag ? `SANDBAG (-${w.sandbagPenalty} C_eff)` : 'grudging effort'}`,
      visibleToPlayer: sandbag ? 'report quality dips; effort visibly thin' : undefined,
    });
    return sandbag ? -w.sandbagPenalty : 0;
  }
  const roll = d100(state);
  const slow = roll <= w.slowWalkChance;
  log(state, 'WILLINGNESS', {
    actor: lt.id,
    inputs: { loyalty: lt.loyalty, band, order: order.verb, chance: w.slowWalkChance, roll },
    computation: `band=DISAFFECTED -> slowWalk roll ${w.slowWalkChance}% -> rolled ${roll} -> ${slow ? `SLOW_WALK (-${w.slowWalkPenalty} C_eff)` : 'full effort'}`,
    visibleToPlayer: slow ? 'report shows delayed arrival' : undefined,
  });
  return slow ? -w.slowWalkPenalty : 0;
}

interface RollResult {
  cEff: number;
  successChance: number;
  roll: number;
  margin: number;
  tier: Tier;
  parts: string;
}

function temperamentFit(domain: Domain, temperaments: [Temperament, Temperament]): number {
  const fits = TUNING.roll.temperamentFit[domain] ?? {};
  const sum = (fits[temperaments[0]] ?? 0) + (fits[temperaments[1]] ?? 0);
  return clamp(sum, -1, 1);
}

function warMod(state: GameState, contract?: ContractDef): number {
  if (!contract?.contested) return 0;
  const t = state.warTrack;
  if (contract.source === 'LICH') return t <= -1 ? 1 : t >= 1 ? -1 : 0;
  if (contract.source === 'ZOMBIE') return t >= 1 ? 1 : t <= -1 ? -1 : 0;
  return Math.abs(t) >= TUNING.war.desperationTrackMin + 1 ? -1 : 0;
}

function rollOutcome(
  state: GameState,
  lt: LtState,
  domain: Domain,
  difficulty: number,
  latitude: Latitude,
  willingnessPenalty: number,
  contract?: ContractDef,
): RollResult {
  const hidden = hiddenById.get(lt.id)!;
  const r = TUNING.roll;
  let cEff = hidden.competence;
  const parts: string[] = [`comp ${hidden.competence}`];
  if (hidden.specialty === domain) {
    cEff += r.specialtyBonus;
    parts.push(`specialty +${r.specialtyBonus}`);
  }
  const fit = temperamentFit(domain, hidden.temperaments);
  if (fit !== 0) {
    cEff += fit;
    parts.push(`temperament ${fit > 0 ? '+' : ''}${fit}`);
  }
  const wm = warMod(state, contract);
  if (wm !== 0) {
    cEff += wm;
    parts.push(`warTrack ${wm > 0 ? '+' : ''}${wm}`);
  }
  if (hidden.hiddenMods?.antiUndeadBonus && contract?.hookTags.includes('ANTI_UNDEAD')) {
    cEff += hidden.hiddenMods.antiUndeadBonus;
    parts.push(`anti-undead +${hidden.hiddenMods.antiUndeadBonus}`);
  }
  if (hidden.hiddenMods?.logisticsBonus && domain === 'LOGISTICS') {
    cEff += hidden.hiddenMods.logisticsBonus;
    parts.push(`logistics +${hidden.hiddenMods.logisticsBonus}`);
  }
  if (latitude === 'intent') {
    const boost = Math.round((hidden.competence * r.latitudeCompetencePct) / 100);
    cEff += boost;
    parts.push(`latitude +${boost}`);
  }
  if (willingnessPenalty !== 0) {
    cEff += willingnessPenalty;
    parts.push(`willingness ${willingnessPenalty}`);
  }
  const successChance = clamp(r.base + r.slopePerPoint * (cEff - difficulty), r.clampMin, r.clampMax);
  const roll = d100(state);
  const margin = successChance - roll;
  const t = r.tiersExplicit;
  const widen = latitude === 'intent' ? r.intentTailWiden : 0;
  let tier: Tier;
  if (margin >= t.crit - widen) tier = 'CRIT';
  else if (margin >= t.success) tier = 'SUCCESS';
  else if (margin >= t.partial) tier = 'PARTIAL';
  else if (margin >= t.failure + widen) tier = 'FAILURE';
  else tier = 'DISASTER';
  return { cEff, successChance, roll, margin, tier, parts: parts.join(', ') };
}

// ---------------------------------------------------------------------------
// Temperament riders (§7.3, intent mode only) — registry, not if-else sprawl (§6.2)
// ---------------------------------------------------------------------------

interface RiderCtx {
  state: GameState;
  lt: LtState;
  rec: MissionRecord;
  contract?: ContractDef;
  payment: number;
}

type RiderFn = (ctx: RiderCtx) => void;

const RIDERS: Partial<Record<Temperament, RiderFn>> = {
  ZEALOUS: ({ state, lt, rec, contract }) => {
    // Over-execution near the undead: bonus destruction, collateral damage (§6.3 hale)
    if (!contract) return;
    const relevant = contract.hookTags.includes('ANTI_UNDEAD') || contract.domain === 'PURGE' || contract.hookTags.includes('DESECRATION');
    if (!relevant || rec.tier === 'FAILURE' || rec.tier === 'DISASTER') return;
    rec.riders.push('OVERPURGE');
    rec.notes.push('exceeded the brief: burned beyond the contracted target');
    if (contract.source === 'LICH' || contract.source === 'ZOMBIE') {
      const f = contract.source === 'LICH' ? 'lich' : 'zombie';
      adjustStanding(state, f, -3);
      rec.standingDelta[f] = (rec.standingDelta[f] ?? 0) - 3;
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'OVERPURGE', contract: contract.id },
        computation: `ZEALOUS latitude rider: over-purged; employer standing ${f} -3 (collateral)`,
      });
    } else {
      rec.troopsLost += 1;
      state.troops = Math.max(0, state.troops - 1);
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'OVERPURGE', contract: contract.id },
        computation: 'ZEALOUS latitude rider: over-purged; reckless push cost 1 soldier',
      });
    }
    addDeed(lt, {
      turn: state.turn,
      key: 'overpurge',
      valence: -1,
      weight: 1,
      text: `burned past the brief on “${contract.title}”`,
      domain: contract.domain,
    });
  },
  AMBITIOUS: (ctx) => {
    // Glory tack-on: brilliant or costly (§6.3 kael)
    const { state, lt, rec, contract } = ctx;
    if (!contract || rec.tier === 'DISASTER' || rec.tier === 'FAILURE') return;
    if (!chance(state, 40)) return;
    const hidden = hiddenById.get(lt.id)!;
    const extra = rollOutcome(state, lt, contract.domain, contract.difficulty + 1, 'intent', 0, contract);
    if (extra.margin >= 0) {
      const bonus = Math.round(ctx.payment * 0.2);
      rec.goldTrue += bonus;
      state.gold += bonus;
      rec.riders.push('GLORY_TACKON_WIN');
      rec.notes.push('seized an unasked-for objective and made it pay');
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'GLORY_TACKON', roll: extra.roll, chance: extra.successChance },
        computation: `AMBITIOUS latitude rider: tack-on objective SUCCEEDED (+${bonus} gold)`,
      });
      addDeed(lt, {
        turn: state.turn,
        key: 'glory_tackon',
        valence: 1,
        weight: 2,
        text: `turned “${contract.title}” into a bigger win than asked`,
        domain: contract.domain,
      });
      if (hidden.hooks.some((h) => h.id === 'k_glory')) {
        adjustLoyalty(state, lt, 3, 'glory seized (tack-on)');
      }
    } else {
      const lost = randInt(state, 2, 5);
      rec.troopsLost += lost;
      state.troops = Math.max(0, state.troops - lost);
      rec.riders.push('GLORY_TACKON_LOSS');
      rec.notes.push('reached past the brief and paid for it');
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'GLORY_TACKON', roll: extra.roll, chance: extra.successChance },
        computation: `AMBITIOUS latitude rider: tack-on objective FAILED (-${lost} troops)`,
      });
      addDeed(lt, {
        turn: state.turn,
        key: 'glory_overreach',
        valence: -1,
        weight: 2,
        text: `overreached on “${contract.title}” and bled the company for it`,
        domain: contract.domain,
      });
    }
  },
  CAUTIOUS: ({ state, lt, rec }) => {
    // Converts failures into safe partials, forfeits crit upside (§7.3)
    if (rec.tier === 'FAILURE') {
      rec.tier = 'PARTIAL';
      rec.riders.push('SAFE_HANDS');
      rec.notes.push('cut losses early; salvaged a partial result');
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'SAFE_HANDS' },
        computation: 'CAUTIOUS latitude rider: FAILURE -> PARTIAL (withdrew in good order)',
      });
    } else if (rec.tier === 'CRIT') {
      rec.tier = 'SUCCESS';
      rec.riders.push('CAUTION_CAPPED');
      rec.notes.push('declined to press the advantage');
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'CAUTION_CAPPED' },
        computation: 'CAUTIOUS latitude rider: CRIT -> SUCCESS (would not gamble the gain)',
      });
    }
  },
  METICULOUS: ({ state, lt, rec }) => {
    if (rec.troopsLost > 0) {
      rec.troopsLost -= 1;
      state.troops += 1;
      rec.riders.push('PROVISIONED');
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'PROVISIONED' },
        computation: 'METICULOUS latitude rider: preparation saved 1 soldier',
      });
    }
  },
  PROTECTIVE: ({ state, lt, rec }) => {
    if ((rec.tier === 'FAILURE' || rec.tier === 'DISASTER') && rec.troopsLost > 0) {
      const saved = Math.min(2, rec.troopsLost);
      rec.troopsLost -= saved;
      state.troops += saved;
      rec.riders.push('SHIELDED_THE_RANKS');
      rec.notes.push('held the rearguard herself; brought more of them home');
      log(state, 'RIDER', {
        actor: lt.id,
        inputs: { rider: 'SHIELDED_THE_RANKS', saved },
        computation: `PROTECTIVE latitude rider: covered the withdrawal, saved ${saved} soldiers`,
      });
      addDeed(lt, {
        turn: state.turn,
        key: 'shielded_ranks',
        valence: 1,
        weight: 2,
        text: 'covered the withdrawal with her own shield',
      });
    }
  },
  GREEDY: ({ state, lt, rec, contract }) => {
    if (!contract || (rec.tier !== 'SUCCESS' && rec.tier !== 'CRIT' && rec.tier !== 'PARTIAL')) return;
    rec.riders.push('SIDE_DEALS');
    log(state, 'RIDER', {
      actor: lt.id,
      inputs: { rider: 'SIDE_DEALS', contract: contract.id },
      computation: 'GREEDY latitude rider: worked side bargains along the way (widens the skim)',
    });
  },
  PRIDEFUL: ({ state, lt, rec }) => {
    if (rec.tier !== 'FAILURE') return;
    const lost = randInt(state, 1, 3);
    rec.troopsLost += lost;
    state.troops = Math.max(0, state.troops - lost);
    const upgraded = chance(state, 25);
    if (upgraded) rec.tier = 'PARTIAL';
    rec.riders.push(upgraded ? 'PRESSED_ON_WIN' : 'PRESSED_ON_LOSS');
    rec.notes.push('refused to disengage when the day was lost');
    log(state, 'RIDER', {
      actor: lt.id,
      inputs: { rider: 'PRESSED_ON', lost, upgraded },
      computation: `PRIDEFUL latitude rider: pressed on (-${lost} troops), ${upgraded ? 'clawed back a PARTIAL' : 'to no avail'}`,
    });
  },
};

function applyRiders(ctx: RiderCtx): void {
  const hidden = hiddenById.get(ctx.lt.id)!;
  for (const t of hidden.temperaments) {
    RIDERS[t]?.(ctx);
  }
}

// ---------------------------------------------------------------------------
// Hooks (§6.1) — fired on contract accept/completion
// ---------------------------------------------------------------------------

export function fireContractHooks(
  state: GameState,
  contract: ContractDef,
  phase: 'ACCEPTED' | 'COMPLETED',
  assigneeId?: string,
): void {
  for (const lt of state.lts) {
    if (lt.status !== 'active') continue;
    const hidden = hiddenById.get(lt.id)!;
    for (const hook of hidden.hooks) {
      const on = hook.on;
      let hit = false;
      if (phase === 'ACCEPTED' && on.kind === 'TAG_ACCEPTED' && contract.hookTags.includes(on.tag)) hit = true;
      if (phase === 'COMPLETED') {
        if (on.kind === 'TAG_COMPLETED_BY_COMPANY' && contract.hookTags.includes(on.tag)) hit = true;
        if (on.kind === 'TAG_COMPLETED_BY_SELF' && lt.id === assigneeId && contract.hookTags.includes(on.tag)) hit = true;
        if (on.kind === 'SOURCE_COMPLETED_BY_COMPANY' && contract.source === on.source) hit = true;
      }
      if (!hit) continue;
      adjustLoyalty(state, lt, hook.delta, `hook ${hook.id} (${contract.id})`);
      log(state, 'HOOK', {
        actor: lt.id,
        inputs: { hook: hook.id, contract: contract.id, delta: hook.delta, phase },
        computation: `${hook.note} -> loyalty ${hook.delta >= 0 ? '+' : ''}${hook.delta}`,
      });
      if (hook.grievance && hook.delta < 0) {
        lt.grievances.push({ hookId: hook.id, turn: state.turn, note: hook.note });
      }
      if (hook.delta >= 4) {
        addDeed(lt, {
          turn: state.turn,
          key: `hook_${hook.id}`,
          valence: 1,
          weight: 1,
          text: `took heart when the company chose “${contract.title}”`,
        });
      }
    }
  }
}

/** Assignment-shaped hooks: unglamorous duty, latitude-as-trust (kael). */
export function fireAssignmentHooks(state: GameState, lt: LtState, order: Order, contract?: ContractDef): void {
  const hidden = hiddenById.get(lt.id)!;
  for (const hook of hidden.hooks) {
    if (hook.on.kind === 'UNGLAMOROUS_ASSIGNMENT' && contract) {
      const u = TUNING.unglamorous;
      const dull =
        contract.hookTags.includes('UNGLAMOROUS') ||
        (u.domains.includes(contract.domain) && contract.difficulty <= u.maxDifficulty);
      if (dull) {
        adjustLoyalty(state, lt, hook.delta, `hook ${hook.id} (dull duty)`);
        lt.grievances.push({ hookId: hook.id, turn: state.turn, note: hook.note });
        log(state, 'HOOK', {
          actor: lt.id,
          inputs: { hook: hook.id, contract: contract.id, delta: hook.delta },
          computation: `${hook.note} -> loyalty ${hook.delta}`,
        });
      }
    }
    if (hook.on.kind === 'INTENT_LATITUDE_GIVEN' && order.latitude === 'intent') {
      adjustLoyalty(state, lt, hook.delta, `hook ${hook.id} (latitude)`);
      lt.recognition = clamp(lt.recognition + TUNING.kaelRecognition.latitude, 0, TUNING.kaelRecognition.max);
    }
  }
}

// ---------------------------------------------------------------------------
// Mission execution
// ---------------------------------------------------------------------------

function findHolding(state: GameState, contractId: string): { offer?: Offer; banked?: Banked } {
  return {
    offer: state.offers.find((o) => o.contractId === contractId),
    banked: state.banked.find((b) => b.contractId === contractId),
  };
}

function troopLossFor(state: GameState, contract: ContractDef, tier: Tier): number {
  const [lo, hi] = TUNING.troopLoss[contract.troopRisk][tier];
  return randInt(state, lo, hi);
}

export function resolveContractMission(state: GameState, lt: LtState, order: Order): MissionRecord {
  const contract = contractById.get(order.contractId!)!;
  const holding = findHolding(state, contract.id);
  const payment = holding.banked?.payment ?? holding.offer?.paymentAdjusted ?? contract.payment;
  const latitude: Latitude = order.latitude ?? 'explicit';
  const rec = newRecord(state, lt.id, 'TAKE_CONTRACT');
  rec.contractId = contract.id;
  rec.latitude = latitude;
  rec.domain = contract.domain;
  rec.difficulty = contract.difficulty;

  // Accept-on-assign if still on the open board
  if (holding.offer && !holding.banked) {
    acceptContract(state, contract.id);
  }

  const will = willingness(state, lt, order, contract);
  if (will === 'REFUSED') {
    rec.willingness = 'REFUSED';
    rec.notes.push('refused the order outright');
    addDeed(lt, {
      turn: state.turn,
      key: 'refused_order',
      valence: -1,
      weight: 1,
      text: `refused the company's order to take “${contract.title}”`,
      domain: contract.domain,
    });
    return rec; // contract stays banked; order wasted (§8.3)
  }
  rec.willingness = will === 0 ? 'FULL' : bandOf(lt.loyalty) === 'BREAKING' ? 'SANDBAG' : 'SLOW_WALK';
  if (rec.willingness === 'SLOW_WALK') rec.notes.push('arrived a day late; the window had narrowed');
  if (rec.willingness === 'SANDBAG') rec.notes.push('went through the motions');

  const roll = rollOutcome(state, lt, contract.domain, contract.difficulty, latitude, typeof will === 'number' ? will : 0, contract);
  rec.cEff = roll.cEff;
  rec.successChance = roll.successChance;
  rec.roll = roll.roll;
  rec.margin = roll.margin;
  rec.tier = roll.tier;
  log(state, 'ROLL', {
    actor: lt.id,
    inputs: {
      contract: contract.id,
      difficulty: contract.difficulty,
      cEff: roll.cEff,
      cEffParts: roll.parts,
      latitude,
      successChance: roll.successChance,
      roll: roll.roll,
    },
    computation: `chance ${roll.successChance}% vs d100=${roll.roll} -> margin ${roll.margin} -> ${roll.tier}`,
  });

  // Troop losses first (riders may claw back)
  rec.troopsLost = troopLossFor(state, contract, rec.tier);
  state.troops = Math.max(0, state.troops - rec.troopsLost);

  if (latitude === 'intent') {
    applyRiders({ state, lt, rec, contract, payment });
  }

  // Outcome effects by (possibly rider-adjusted) tier
  const tier = rec.tier;
  const pay = TUNING.payout;
  const pct =
    tier === 'CRIT' ? pay.critPct : tier === 'SUCCESS' ? pay.successPct : tier === 'PARTIAL' ? pay.partialPct : 0;
  const gold = Math.round((payment * pct) / 100);
  rec.goldTrue += gold;
  state.gold += gold;

  const completed = tier === 'CRIT' || tier === 'SUCCESS' || tier === 'PARTIAL';
  const half = tier === 'PARTIAL';
  const effects = completed ? contract.standing.onComplete : contract.standing.onFail;
  for (const [f, dRaw] of Object.entries(effects ?? {})) {
    const faction = f as 'lich' | 'zombie';
    let d = dRaw as number;
    if (half) d = Math.trunc(d / 2);
    if (tier === 'CRIT' && d > 0) d += 1;
    if (d !== 0) {
      adjustStanding(state, faction, d);
      rec.standingDelta[faction] = (rec.standingDelta[faction] ?? 0) + d;
    }
  }

  removeHolding(state, contract.id);
  if (completed) {
    state.completedContracts.push(contract.id);
    if (contract.source === 'LICH') state.workedFor.lich.push(state.turn);
    if (contract.source === 'ZOMBIE') state.workedFor.zombie.push(state.turn);
    fireContractHooks(state, contract, 'COMPLETED', lt.id);
    // War push (§4, D-019)
    if (
      (contract.source === 'LICH' || contract.source === 'ZOMBIE') &&
      (contract.difficulty >= TUNING.war.majorDifficulty || contract.domain === 'BATTLE')
    ) {
      state.turnWarPush += contract.source === 'LICH' ? -1 : 1;
    }
    // Conflicting pair forfeit (§5.1)
    if (contract.conflictPair) forfeitPartner(state, contract.conflictPair, contract.id);
  } else {
    state.failedContracts.push(contract.id);
  }

  // Chronicle deeds for the arc (§10.3)
  if (tier === 'CRIT') {
    addDeed(lt, {
      turn: state.turn,
      key: 'crit',
      valence: 1,
      weight: 2,
      text: pickDeedText(state, lt.id, 'crit', contract),
      domain: contract.domain,
    });
    let bonus = TUNING.drift.critBonus;
    const hidden = hiddenById.get(lt.id)!;
    const praisedRecently = lt.praiseTurns.some((t) => state.turn - t <= TUNING.peopleVerbs.praiseDiminishWindow);
    if (hidden.temperaments.includes('AMBITIOUS') && praisedRecently) bonus = TUNING.drift.critBonusAmbitiousPraised;
    adjustLoyalty(state, lt, bonus, 'mission triumph');
  } else if (tier === 'SUCCESS' && contract.difficulty >= 6) {
    addDeed(lt, {
      turn: state.turn,
      key: 'hard_win',
      valence: 1,
      weight: 1,
      text: pickDeedText(state, lt.id, 'hard_win', contract),
      domain: contract.domain,
    });
  } else if (tier === 'DISASTER') {
    addDeed(lt, {
      turn: state.turn,
      key: 'disaster',
      valence: -1,
      weight: 2,
      text: pickDeedText(state, lt.id, 'disaster', contract),
      domain: contract.domain,
    });
    maybeLtDeath(state, lt, contract, rec);
  }

  // Big troop losses grieve the protective (§3.1: troop losses feed loyalty events)
  if (rec.troopsLost >= TUNING.drift.bigLossThreshold) {
    for (const other of state.lts) {
      if (other.status !== 'active') continue;
      const h = hiddenById.get(other.id)!;
      if (h.temperaments.includes('PROTECTIVE')) {
        adjustLoyalty(state, other, TUNING.drift.bigLossPenalty, `grieves ${rec.troopsLost} soldiers lost`);
      }
    }
  }
  return rec;
}

function pickDeedText(state: GameState, ltId: string, kind: string, contract: ContractDef): string {
  const rng = derivedRng(state.seed, `deed:${ltId}:${state.turn}:${kind}`);
  const variants: Record<string, string[]> = {
    crit: [
      `carried “${contract.title}” beyond anything the contract asked`,
      `made “${contract.title}” look easy; it was not`,
      `won “${contract.title}” in a way the fires still retell`,
    ],
    hard_win: [
      `delivered “${contract.title}” when it counted`,
      `brought “${contract.title}” home against the odds`,
    ],
    disaster: [
      `presided over the ruin of “${contract.title}”`,
      `lost “${contract.title}” and much besides`,
    ],
  };
  return pick(rng, variants[kind] ?? [`served on “${contract.title}”`]);
}

function maybeLtDeath(state: GameState, lt: LtState, contract: ContractDef, rec: MissionRecord): void {
  if (contract.troopRisk !== 'HIGH') return;
  const roll = d100(state);
  const chancePct = TUNING.ltDeath.chanceOnDisasterHighRisk;
  log(state, 'ROLL', {
    actor: lt.id,
    inputs: { check: 'lieutenant death', chance: chancePct, roll },
    computation: `DISASTER on HIGH-risk contract -> death check ${chancePct}% -> rolled ${roll} -> ${roll <= chancePct ? 'DEAD' : 'survived'}`,
  });
  if (roll > chancePct) return;
  lt.status = 'dead';
  lt.departedTurn = state.turn;
  lt.departedNote = `fell during “${contract.title}”`;
  rec.riders.push('LT_DEATH');
  rec.notes.push('the lieutenant did not come back');
  for (const other of state.lts) {
    if (other.status !== 'active') continue;
    const h = hiddenById.get(other.id)!;
    const delta = h.temperaments.includes('PROTECTIVE')
      ? TUNING.drift.comradeDeathProtective
      : TUNING.drift.comradeDeath;
    adjustLoyalty(state, other, delta, `death of ${lt.id}`);
    addDeed(other, {
      turn: state.turn,
      key: 'comrade_death',
      valence: -1,
      weight: 2,
      text: `stood at the pyre for ${lt.id === 'rooke' ? 'Mother Rooke' : lt.id[0].toUpperCase() + lt.id.slice(1)}`,
    });
  }
}

function forfeitPartner(state: GameState, partnerId: string, completedId: string): void {
  const holding = findHolding(state, partnerId);
  if (!holding.offer && !holding.banked) return;
  const partner = contractById.get(partnerId)!;
  removeHolding(state, partnerId);
  state.forfeitedContracts.push(partnerId);
  for (const [f, d] of Object.entries(partner.standing.onFail ?? {})) {
    adjustStanding(state, f as 'lich' | 'zombie', d as number);
  }
  log(state, 'EVENT', {
    inputs: { forfeited: partnerId, because: completedId },
    computation: `conflicting pair: completing ${completedId} forfeited ${partnerId} (onFail standing applied)`,
    visibleToPlayer: 'faction message notes the breach',
  });
}

export function removeHolding(state: GameState, contractId: string): void {
  state.offers = state.offers.filter((o) => o.contractId !== contractId);
  state.banked = state.banked.filter((b) => b.contractId !== contractId);
}

export function acceptContract(state: GameState, contractId: string): void {
  const offer = state.offers.find((o) => o.contractId === contractId);
  if (!offer) throw new Error(`contract ${contractId} is not on offer`);
  const contract = contractById.get(contractId)!;
  state.offers = state.offers.filter((o) => o.contractId !== contractId);
  state.banked.push({
    contractId,
    acceptedTurn: state.turn,
    expiresTurn: offer.expiresTurn,
    payment: offer.paymentAdjusted,
  });
  for (const [f, d] of Object.entries(contract.standing.onAccept ?? {})) {
    adjustStanding(state, f as 'lich' | 'zombie', d as number);
  }
  // Heat on taking work while recently working the other side (D-018)
  if (contract.heatEffect > 0 && (contract.source === 'LICH' || contract.source === 'ZOMBIE')) {
    const other = contract.source === 'LICH' ? 'zombie' : 'lich';
    const recent = state.workedFor[other].some((t) => state.turn - t <= TUNING.heat.lookbackTurns);
    if (recent) {
      state.heat = clamp(state.heat + contract.heatEffect, 0, 100);
      state.turnHeatAdded = true;
      log(state, 'ACCEPT', {
        inputs: { contract: contractId, heatEffect: contract.heatEffect, workedOtherSideRecently: true },
        computation: `double-dealing: +${contract.heatEffect} heat -> ${state.heat}`,
      });
    }
  }
  fireContractHooks(state, contract, 'ACCEPTED');
  log(state, 'ACCEPT', {
    inputs: { contract: contractId },
    computation: `accepted “${contract.title}” (${contract.source}, pays ${offer.paymentAdjusted})`,
  });
}

// ---------------------------------------------------------------------------
// Non-contract mission verbs
// ---------------------------------------------------------------------------

export function resolveScout(state: GameState, lt: LtState, order: Order): MissionRecord {
  const rec = newRecord(state, lt.id, 'SCOUT');
  const will = willingness(state, lt, order);
  if (will === 'REFUSED') {
    rec.willingness = 'REFUSED';
    return rec;
  }
  rec.willingness = will === 0 ? 'FULL' : bandOf(lt.loyalty) === 'BREAKING' ? 'SANDBAG' : 'SLOW_WALK';
  const latitude: Latitude = order.latitude ?? 'explicit';
  rec.latitude = latitude;
  const target = order.scoutTarget ?? 'warFront';
  const roll = rollOutcome(state, lt, 'INTEL', TUNING.scout.difficulty, latitude, typeof will === 'number' ? will : 0);
  Object.assign(rec, {
    domain: 'INTEL',
    difficulty: TUNING.scout.difficulty,
    cEff: roll.cEff,
    successChance: roll.successChance,
    roll: roll.roll,
    margin: roll.margin,
    tier: roll.tier,
  });
  rec.notes.push(`scouted:${target}`);
  log(state, 'ROLL', {
    actor: lt.id,
    inputs: { verb: 'SCOUT', target, cEff: roll.cEff, successChance: roll.successChance, roll: roll.roll },
    computation: `chance ${roll.successChance}% vs d100=${roll.roll} -> ${roll.tier}`,
  });
  if (roll.tier === 'DISASTER') {
    const [lo, hi] = TUNING.scout.disasterTroopLoss;
    const lost = randInt(state, lo, hi);
    rec.troopsLost = lost;
    state.troops = Math.max(0, state.troops - lost);
    rec.notes.push('the patrol was ambushed');
  }
  return rec;
}

export function resolveNegotiate(state: GameState, lt: LtState, order: Order): MissionRecord {
  const rec = newRecord(state, lt.id, 'NEGOTIATE');
  const will = willingness(state, lt, order);
  if (will === 'REFUSED') {
    rec.willingness = 'REFUSED';
    return rec;
  }
  rec.willingness = will === 0 ? 'FULL' : bandOf(lt.loyalty) === 'BREAKING' ? 'SANDBAG' : 'SLOW_WALK';
  const latitude: Latitude = order.latitude ?? 'explicit';
  rec.latitude = latitude;
  const faction = order.faction ?? 'lich';
  const n = TUNING.negotiate;
  const roll = rollOutcome(state, lt, 'INTEL', n.difficulty, latitude, typeof will === 'number' ? will : 0);
  Object.assign(rec, {
    domain: 'INTEL',
    difficulty: n.difficulty,
    cEff: roll.cEff,
    successChance: roll.successChance,
    roll: roll.roll,
    margin: roll.margin,
    tier: roll.tier,
  });
  rec.notes.push(`negotiated:${faction}`);
  let delta = 0;
  if (roll.tier === 'CRIT') delta = n.standingCrit;
  else if (roll.tier === 'SUCCESS' || roll.tier === 'PARTIAL') delta = n.standingSuccess;
  else delta = n.standingFail;
  adjustStanding(state, faction, delta);
  rec.standingDelta[faction] = delta;
  if (roll.tier === 'CRIT' || roll.tier === 'SUCCESS') state.betterTerms = faction;
  log(state, 'ROLL', {
    actor: lt.id,
    inputs: { verb: 'NEGOTIATE', faction, successChance: roll.successChance, roll: roll.roll },
    computation: `chance ${roll.successChance}% vs d100=${roll.roll} -> ${roll.tier} -> standing ${faction} ${delta >= 0 ? '+' : ''}${delta}${state.betterTerms === faction ? ', better terms next offers' : ''}`,
  });
  return rec;
}

export function resolveRecruit(state: GameState, lt: LtState, order: Order): MissionRecord {
  const rec = newRecord(state, lt.id, 'RECRUIT');
  const budget = Math.min(order.gold ?? 0, state.gold);
  const will = willingness(state, lt, order);
  if (will === 'REFUSED') {
    rec.willingness = 'REFUSED';
    return rec;
  }
  rec.willingness = will === 0 ? 'FULL' : bandOf(lt.loyalty) === 'BREAKING' ? 'SANDBAG' : 'SLOW_WALK';
  const latitude: Latitude = order.latitude ?? 'explicit';
  rec.latitude = latitude;
  const r = TUNING.recruit;
  const roll = rollOutcome(state, lt, 'LOGISTICS', r.difficulty, latitude, typeof will === 'number' ? will : 0);
  Object.assign(rec, {
    domain: 'LOGISTICS',
    difficulty: r.difficulty,
    cEff: roll.cEff,
    successChance: roll.successChance,
    roll: roll.roll,
    margin: roll.margin,
    tier: roll.tier,
  });
  state.gold -= budget;
  const gained = Math.max(0, Math.floor((budget / r.goldPerTroop) * r.tierMult[roll.tier]));
  state.troops += gained;
  rec.goldTrue = -budget;
  rec.notes.push(`recruited:${gained}`);
  log(state, 'ROLL', {
    actor: lt.id,
    inputs: { verb: 'RECRUIT', budget, tier: roll.tier },
    computation: `spent ${budget} gold -> ${gained} recruits (${roll.tier})`,
  });
  return rec;
}
