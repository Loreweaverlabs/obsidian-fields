// Contract offers and the event deck (§5). War state and player state shape the deal.
import { CONTRACTS, EVENTS, STRINGS, TUNING, contractById, publicById } from './data';
import { actOf, addCard, adjustStanding, bandAtMost, bandOf, getLt, log } from './core';
import { chance, randInt, weightedPick } from './rng';
import { forcedPoachCheck, liveOpportunityFor, spawnOpportunity } from './drama';
import { adjustLoyalty } from './core';
import type { ContractDef, EventDef, EventTrigger, GameState } from './types';

function wagesBill(state: GameState): number {
  return state.lts.filter((l) => l.status === 'active').reduce((a, l) => a + publicById.get(l.id)!.wage, 0);
}

/** Which power is losing badly enough to get desperate (§4). */
function desperateSide(state: GameState): 'LICH' | 'ZOMBIE' | null {
  const w = TUNING.war;
  if (state.warTrack >= w.desperationTrackMin) return 'LICH'; // zombie ascendant -> lich desperate
  if (state.warTrack <= -w.desperationTrackMin) return 'ZOMBIE';
  return null;
}

export function tickExpiries(state: GameState): void {
  const c = TUNING.contracts;
  for (const offer of state.offers) {
    if (offer.expiresTurn <= state.turn) {
      log(state, 'CONTRACT_DRAW', {
        inputs: { contract: offer.contractId },
        computation: `offer “${contractById.get(offer.contractId)!.title}” lapsed unclaimed`,
      });
    }
  }
  state.offers = state.offers.filter((o) => o.expiresTurn > state.turn);
  const lapsedBanked = state.banked.filter((b) => b.expiresTurn <= state.turn);
  state.banked = state.banked.filter((b) => b.expiresTurn > state.turn);
  for (const b of lapsedBanked) {
    const def = contractById.get(b.contractId)!;
    state.forfeitedContracts.push(b.contractId);
    for (const [f, d] of Object.entries(def.standing.onFail ?? {})) {
      const halved = Math.trunc(((d as number) * c.bankedForfeitStandingPct) / 100);
      if (halved !== 0) adjustStanding(state, f as 'lich' | 'zombie', halved);
    }
    log(state, 'CONTRACT_DRAW', {
      inputs: { contract: b.contractId },
      computation: `banked contract “${def.title}” expired unexecuted -> quiet forfeit (halved onFail standing, D-013)`,
      visibleToPlayer: 'faction message',
    });
    addCard(state, {
      kind: 'FACTION',
      templateKey: 'contract_lapsed',
      sourceTag: def.source === 'NEUTRAL' ? 'a cool note from the client' : 'a cold note from the court',
      facts: { contractId: def.id, title: def.title, source: def.source },
    });
  }
}

export function drawOffers(state: GameState): void {
  const forTurn = state.turn + 1;
  if (forTurn > TUNING.turns) return;
  const act = actOf(forTurn);
  const c = TUNING.contracts;
  const desperate = desperateSide(state);
  const poor = state.gold < wagesBill(state) * c.lifelineWagesMultiple;

  const held = new Set([...state.offers.map((o) => o.contractId), ...state.banked.map((b) => b.contractId)]);
  const gone = new Set([...state.completedContracts, ...state.failedContracts, ...state.forfeitedContracts]);
  const candidates = CONTRACTS.filter((def) => {
    if (!def.acts.includes(act)) return false;
    if (held.has(def.id) || gone.has(def.id)) return false;
    const lastDealt = state.dealtContracts[def.id];
    if (lastDealt != null && forTurn - lastDealt < 3) return false;
    if (state.exposed && def.source !== 'NEUTRAL') return false;
    if (def.conflictPair && gone.has(def.conflictPair)) return false;
    return true;
  });

  const weightOf = (def: ContractDef): number => {
    let w = def.weight ?? 1;
    if (desperate && def.source === desperate) w *= 1.5;
    if (poor && def.source === 'NEUTRAL' && def.difficulty <= 3) w *= 3;
    return w;
  };

  const addOffer = (def: ContractDef): void => {
    let pay = def.payment;
    if (desperate && def.source === desperate) pay = Math.round((pay * (100 + c.desperatePayBonusPct)) / 100);
    if (state.betterTerms && def.source !== 'NEUTRAL' && def.source.toLowerCase() === state.betterTerms) {
      pay = Math.round((pay * (100 + TUNING.negotiate.betterTermsPayPct)) / 100);
    }
    state.offers.push({
      contractId: def.id,
      offeredTurn: forTurn,
      expiresTurn: forTurn + def.expiresIn - 1,
      paymentAdjusted: pay,
    });
    state.dealtContracts[def.id] = forTurn;
    log(state, 'CONTRACT_DRAW', {
      inputs: { contract: def.id, act, pay, desperationBoost: desperate === def.source, source: def.source },
      computation: `dealt “${def.title}” (${def.source}, diff ${def.difficulty}, pays ${pay}, expires t${forTurn + def.expiresIn - 1})`,
      visibleToPlayer: 'contract offer card',
    });
    addCard(state, {
      kind: 'FACTION',
      templateKey: 'contract_offer',
      sourceTag:
        def.source === 'LICH'
          ? STRINGS.factions.lich.envoy
          : def.source === 'ZOMBIE'
            ? STRINGS.factions.zombie.envoy
            : 'a petitioner at the gate',
      facts: {
        contractId: def.id,
        title: def.title,
        source: def.source,
        pay,
        risk: def.troopRisk,
        difficultyHint: def.difficulty <= 3 ? 'light work' : def.difficulty <= 6 ? 'real work' : 'grave work',
        flavor: def.flavor,
        expiresTurn: forTurn + def.expiresIn - 1,
      },
      citable: false,
    });
  };

  const target = randInt(state, c.offersMin, c.offersMax);
  const pool = [...candidates];
  while (state.offers.length < target && pool.length > 0) {
    const def = weightedPick(state, pool, pool.map(weightOf));
    pool.splice(pool.indexOf(def), 1);
    addOffer(def);
    // Conflicting pairs are dealt together when both are available (§5.1)
    if (def.conflictPair) {
      const partnerIdx = pool.findIndex((p) => p.id === def.conflictPair);
      if (partnerIdx >= 0 && actOf(forTurn) >= 2) {
        const partner = pool[partnerIdx];
        pool.splice(partnerIdx, 1);
        addOffer(partner);
      }
    }
  }
  state.betterTerms = null;

  // Lifeline: never leave a broke company without cheap honest work (§13.2 death-spiral guard)
  if (poor) {
    const hasLifeline = state.offers.some((o) => {
      const d = contractById.get(o.contractId)!;
      return d.source === 'NEUTRAL' && d.difficulty <= 3 && d.troopRisk === 'LOW';
    });
    if (!hasLifeline) {
      const lifelines = CONTRACTS.filter(
        (d) =>
          d.source === 'NEUTRAL' &&
          d.difficulty <= 3 &&
          d.troopRisk === 'LOW' &&
          d.acts.includes(act) &&
          !held.has(d.id) &&
          !gone.has(d.id) &&
          !state.offers.some((o) => o.contractId === d.id),
      );
      if (lifelines.length > 0) {
        addOffer(lifelines[0]);
        log(state, 'CONTRACT_DRAW', {
          inputs: { gold: state.gold },
          computation: 'lifeline: treasury thin, guaranteed one cheap low-risk neutral job on the board',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Event deck (§5.2)
// ---------------------------------------------------------------------------

function triggerMet(state: GameState, req: EventTrigger | undefined): boolean {
  if (!req) return true;
  if (req.minTurn != null && state.turn < req.minTurn) return false;
  if (req.maxTurn != null && state.turn > req.maxTurn) return false;
  if (req.acts && !req.acts.includes(actOf(state.turn))) return false;
  if (req.ltActive) {
    const lt = state.lts.find((l) => l.id === req.ltActive);
    if (!lt || lt.status !== 'active') return false;
  }
  if (req.ltBandAtMost) {
    const lt = state.lts.find((l) => l.id === req.ltBandAtMost!.lt);
    if (!lt || lt.status !== 'active') return false;
    if (!bandAtMost(bandOf(lt.loyalty), req.ltBandAtMost.band)) return false;
  }
  if (req.ltGrievanceActive) {
    const lt = state.lts.find((l) => l.id === req.ltGrievanceActive);
    if (!lt) return false;
    if (!lt.grievances.some((g) => state.turn - g.turn <= TUNING.departure.grievanceRecencyTurns)) return false;
  }
  for (const [f, min] of Object.entries(req.standingAtLeast ?? {})) {
    if (state.standing[f as 'lich' | 'zombie'] < (min as number)) return false;
  }
  for (const [f, max] of Object.entries(req.standingAtMost ?? {})) {
    if (state.standing[f as 'lich' | 'zombie'] > (max as number)) return false;
  }
  if (req.heatAtLeast != null && state.heat < req.heatAtLeast) return false;
  if (req.goldAtLeast != null && state.gold < req.goldAtLeast) return false;
  if (req.goldAtMost != null && state.gold > req.goldAtMost) return false;
  if (req.notExposed && state.exposed) return false;
  return true;
}

function fireEvent(state: GameState, def: EventDef): void {
  if (def.once) state.usedEvents.push(def.id);
  state.eventLastFired[def.id] = state.turn;
  const kind = def.kind === 'OPPORTUNITY' ? 'RUMOR' : def.kind === 'FACTION' ? 'FACTION' : def.kind === 'WAR' ? 'WAR' : 'EVENT';
  const card = addCard(state, {
    kind,
    templateKey: `event_${def.id}`,
    ...(def.lt ? { ltId: def.lt } : {}),
    sourceTag: def.sourceTag,
    facts: { eventId: def.id, title: def.title, text: def.text, ltId: def.lt ?? null },
    ...(def.effects?.spawnOpportunity
      ? {
          evidence: {
            ltId: def.effects.spawnOpportunity.lt,
            behavior: 'contact',
            key: `contact:${def.effects.spawnOpportunity.lt}:t${state.turn}`,
            turn: state.turn,
          },
        }
      : {}),
  });
  const fx = def.effects;
  const applied: string[] = [];
  if (fx) {
    if (fx.gold) {
      state.gold += fx.gold;
      applied.push(`gold ${fx.gold >= 0 ? '+' : ''}${fx.gold}`);
    }
    if (fx.troops) {
      state.troops = Math.max(0, state.troops + fx.troops);
      applied.push(`troops ${fx.troops >= 0 ? '+' : ''}${fx.troops}`);
    }
    for (const [f, d] of Object.entries(fx.standing ?? {})) {
      adjustStanding(state, f as 'lich' | 'zombie', d as number);
      applied.push(`standing.${f} ${(d as number) >= 0 ? '+' : ''}${d}`);
    }
    if (fx.heat) {
      state.heat = Math.min(100, Math.max(0, state.heat + fx.heat));
      if (fx.heat > 0) state.turnHeatAdded = true;
      applied.push(`heat ${fx.heat >= 0 ? '+' : ''}${fx.heat}`);
    }
    if (fx.loyalty) {
      const targets = fx.loyalty.lt === 'all' ? state.lts.filter((l) => l.status === 'active') : [getLt(state, fx.loyalty.lt)];
      for (const lt of targets) adjustLoyalty(state, lt, fx.loyalty.delta, `event ${def.id}`);
      applied.push(`loyalty(${fx.loyalty.lt}) ${fx.loyalty.delta >= 0 ? '+' : ''}${fx.loyalty.delta}`);
    }
    if (fx.spawnOpportunity) {
      spawnOpportunity(state, def, card);
      applied.push(`opportunity ${fx.spawnOpportunity.kind} for ${fx.spawnOpportunity.lt}`);
    }
  }
  log(state, 'EVENT', {
    ...(def.lt ? { actor: def.lt } : {}),
    inputs: { event: def.id, kind: def.kind, effects: applied },
    computation: `event “${def.title}” fired${applied.length ? ` (${applied.join(', ')})` : ''}`,
    visibleToPlayer: card.id,
  });
}

function repeatable(state: GameState, def: EventDef): boolean {
  if (!def.acts.includes(actOf(state.turn))) return false;
  if (def.once && state.usedEvents.includes(def.id)) return false;
  const last = state.eventLastFired[def.id];
  if (last != null && state.turn - last < 3) return false;
  return true;
}

export function drawEvents(state: GameState): void {
  let fired = 0;
  const cap = TUNING.events.maxEventsPerTurn;

  // 1. Guaranteed poach pressure on the betrayal candidate (§6.3) — outside the cap
  const poachDef = forcedPoachCheck(state);
  if (poachDef && repeatable(state, poachDef)) {
    fireEvent(state, poachDef);
    fired++;
  }

  // 2. Other hidden-state opportunities (max 1/turn)
  if (fired < cap) {
    const o = TUNING.opportunities;
    const oppCandidates = EVENTS.filter((def) => {
      if (def.kind !== 'OPPORTUNITY') return false;
      const spawn = def.effects?.spawnOpportunity;
      if (spawn?.kind === 'POACH') return false; // handled above
      if (!repeatable(state, def) || !triggerMet(state, def.requires)) return false;
      if (spawn) {
        const lt = state.lts.find((l) => l.id === spawn.lt);
        if (!lt || lt.status !== 'active') return false;
        if (liveOpportunityFor(state, spawn.lt)) return false;
        const lastOpp = state.oppLastTurn[spawn.lt];
        if (lastOpp != null && state.turn - lastOpp < o.oppCooldownTurns) return false;
        if (spawn.kind === 'SKIM_BIG' && lt.loyalty >= o.skimBigLoyaltyBelow) return false;
      }
      return true;
    });
    if (oppCandidates.length > 0 && chance(state, 50)) {
      const def = weightedPick(state, oppCandidates, oppCandidates.map((d) => d.weight ?? 1));
      fireEvent(state, def);
      fired++;
    }
  }

  // 3. Faction pressure & war beats (trigger-based)
  for (const def of EVENTS) {
    if (fired >= cap) break;
    if (def.kind !== 'FACTION' && def.kind !== 'WAR') continue;
    if (!repeatable(state, def) || !triggerMet(state, def.requires)) continue;
    fireEvent(state, def);
    fired++;
  }

  // 4. Camp texture
  if (fired < cap && chance(state, TUNING.events.campEventChance)) {
    const campCandidates = EVENTS.filter((def) => {
      if (def.kind !== 'CAMP') return false;
      if (!repeatable(state, def) || !triggerMet(state, def.requires)) return false;
      if (state.guardActive) {
        const fx = def.effects;
        const negative = (fx?.troops ?? 0) < 0 || (fx?.gold ?? 0) < 0;
        if (negative) return false; // a guarded camp shrugs off trouble (D-012)
      }
      return true;
    });
    if (campCandidates.length > 0) {
      const def = weightedPick(state, campCandidates, campCandidates.map((d) => d.weight ?? 1));
      fireEvent(state, def);
      fired++;
    }
  }
}
