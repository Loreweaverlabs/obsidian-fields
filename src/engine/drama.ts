// Drama systems: tells (§9.3), opportunities (§5.2), betrayal/desertion/resignation (§9.4),
// heat & discovery (§5.2), war track (§4), loyalty drift (§9.2).
import { EVENTS, TUNING, eventById, hiddenById, publicById } from './data';
import {
  actOf,
  addCard,
  addDeed,
  adjustLoyalty,
  adjustStanding,
  bandOf,
  bandRank,
  chronicleBond,
  clamp,
  getLt,
  log,
} from './core';
import { chance, d100, pick, randInt, weightedPick } from './rng';
import type {
  Band,
  EventDef,
  FactionId,
  GameState,
  LtState,
  Opportunity,
  ReportCard,
  ScheduledTell,
} from './types';

// ---------------------------------------------------------------------------
// Tells — the legibility guarantee (§9.3)
// ---------------------------------------------------------------------------

/** Record that a tell reached the player via a specific card. */
export function recordTell(
  state: GameState,
  lt: LtState,
  card: ReportCard,
  kind: string,
  strength: number,
): void {
  const id = `tell-${state.tellSeq++}`;
  lt.tells.push({ id, turn: card.turn, cardId: card.id, kind, strength });
  log(state, 'TELL_DELIVERED', {
    actor: lt.id,
    inputs: { kind, strength, cardId: card.id },
    computation: `tell "${kind}" surfaced to player (strength ${strength})`,
    visibleToPlayer: card.id,
  });
}

export function scheduleTell(state: GameState, lt: LtState, kind: string, payload: Record<string, unknown> = {}): void {
  const delay = randInt(state, 1, TUNING.tells.maxDelayTurns);
  const tell: ScheduledTell = {
    id: `sched-${state.tellSeq++}`,
    ltId: lt.id,
    kind,
    dueTurn: state.turn + delay,
    payload,
  };
  state.scheduledTells.push(tell);
  log(state, 'TELL_SCHEDULED', {
    actor: lt.id,
    inputs: { kind, dueTurn: tell.dueTurn },
    computation: `tell "${kind}" scheduled for delivery by turn ${tell.dueTurn} (guaranteed, §9.3)`,
  });
}

/** Tells visible to the player before the current council (turn <= current reports phase). */
export function surfacedTellCount(state: GameState, lt: LtState): number {
  return lt.tells.filter((t) => t.turn <= state.turn).length;
}

/** Band-crossing detection after all loyalty movement this turn (§9.3). */
export function detectBandCrossings(state: GameState): void {
  for (const lt of state.lts) {
    if (lt.status !== 'active') continue;
    const now = bandOf(lt.loyalty);
    const before = lt.lastBand;
    if (bandRank(now) < bandRank(before) && (now === 'DISAFFECTED' || now === 'BREAKING')) {
      log(state, 'BAND_CROSS', {
        actor: lt.id,
        inputs: { from: before, to: now, loyalty: lt.loyalty },
        computation: `crossed down into ${now} -> tell guaranteed within ${TUNING.tells.maxDelayTurns} turns`,
      });
      scheduleTell(state, lt, now === 'BREAKING' ? 'band_breaking' : 'band_disaffected', { band: now });
    }
    lt.lastBand = now;
  }
}

// ---------------------------------------------------------------------------
// Opportunities (§5.2) — enabling conditions for departure checks
// ---------------------------------------------------------------------------

function resolveAutoSource(state: GameState): FactionId {
  const diff = state.standing.lich - state.standing.zombie;
  if (diff >= 10) return 'zombie'; // favoring lich -> the horde poaches
  if (diff <= -10) return 'lich';
  if (state.warTrack < 0) return 'lich';
  if (state.warTrack > 0) return 'zombie';
  return chance(state, 50) ? 'lich' : 'zombie';
}

export function spawnOpportunity(
  state: GameState,
  def: EventDef,
  card: ReportCard,
): Opportunity | null {
  const spec = def.effects?.spawnOpportunity;
  if (!spec) return null;
  const lt = getLt(state, spec.lt);
  const source = spec.source === 'AUTO' ? resolveAutoSource(state) : spec.source;
  const opp: Opportunity = {
    id: `opp-${state.tellSeq++}`,
    eventId: def.id,
    kind: spec.kind,
    ltId: spec.lt,
    ...(source ? { source } : {}),
    offerQuality: spec.offerQuality,
    spawnedTurn: state.turn,
    expiresTurn: state.turn + spec.windowTurns,
  };
  state.opportunities.push(opp);
  state.oppLastTurn[spec.lt] = state.turn;
  if (spec.kind === 'POACH') state.poachLastTurn = state.turn;
  log(state, 'OPPORTUNITY', {
    actor: spec.lt,
    inputs: { kind: spec.kind, source: source ?? null, quality: spec.offerQuality, window: spec.windowTurns },
    computation: `opportunity ${spec.kind} live turns ${state.turn + 1}..${opp.expiresTurn} (checked only after its tell is visible)`,
    visibleToPlayer: card.id,
  });
  // The opportunity's own card is the specific third tell (§9.3)
  recordTell(state, lt, card, 'opportunity_contact', 2);
  return opp;
}

export function liveOpportunityFor(state: GameState, ltId: string): Opportunity | undefined {
  return state.opportunities.find(
    (o) => o.ltId === ltId && state.turn > o.spawnedTurn && state.turn <= o.expiresTurn,
  );
}

export function expireOpportunities(state: GameState): void {
  state.opportunities = state.opportunities.filter((o) => o.expiresTurn > state.turn);
}

/** Guaranteed poach pressure on the betrayal candidate from Act II (§6.3). */
export function forcedPoachCheck(state: GameState): EventDef | null {
  const o = TUNING.opportunities;
  if (state.turn < o.poachMinTurn) return null;
  const kael = state.lts.find((l) => l.id === 'kael');
  if (!kael || kael.status !== 'active') return null;
  if (kael.loyalty >= o.poachLoyaltyBelow) return null;
  if (state.turn - state.poachLastTurn < o.poachCooldownTurns) return null;
  if (liveOpportunityFor(state, 'kael') || state.opportunities.some((op) => op.ltId === 'kael' && op.expiresTurn >= state.turn)) return null;
  const defs = EVENTS.filter((e) => e.kind === 'OPPORTUNITY' && e.effects?.spawnOpportunity?.kind === 'POACH' && e.effects.spawnOpportunity.lt === 'kael');
  if (defs.length === 0) return null;
  return pick(state, defs);
}

// ---------------------------------------------------------------------------
// Departure checks (§9.4) — systemic, never scripted
// ---------------------------------------------------------------------------

function playerPowerFactor(state: GameState): number {
  const d = TUNING.departure;
  const norm = state.troops / d.powerTroopsRef + Math.max(0, state.gold) / d.powerGoldRef;
  return clamp(Math.round(norm * (d.powerFactorMax / 2)), 0, d.powerFactorMax);
}

function grievanceRecent(state: GameState, lt: LtState): boolean {
  return lt.grievances.some((g) => state.turn - g.turn <= TUNING.departure.grievanceRecencyTurns);
}

export interface DepartureCheckOpts {
  bonus?: number; // e.g. confrontation rupture +10
  offerQuality?: number; // override when no live opportunity (rupture path)
  trigger: string;
}

/**
 * Evaluate a departure check for one lieutenant. Enforces the >=2 tell gate structurally:
 * if unmet, the check is SUPPRESSED, logged, and missing tells are force-scheduled (D-021).
 */
export function departureCheck(state: GameState, lt: LtState, opts: DepartureCheckOpts): boolean {
  const hidden = hiddenById.get(lt.id)!;
  const band = bandOf(lt.loyalty);
  const opp = liveOpportunityFor(state, lt.id);
  const offerQuality = opts.offerQuality ?? opp?.offerQuality ?? 0;

  const surfaced = surfacedTellCount(state, lt);
  if (surfaced < TUNING.tells.minBeforeDeparture) {
    const pending = state.scheduledTells.filter((t) => t.ltId === lt.id).length;
    const missing = TUNING.tells.minBeforeDeparture - surfaced - pending;
    for (let i = 0; i < missing; i++) scheduleTell(state, lt, 'unease', { forced: true });
    log(state, 'DEPARTURE_SUPPRESSED', {
      actor: lt.id,
      inputs: { surfacedTells: surfaced, required: TUNING.tells.minBeforeDeparture, trigger: opts.trigger },
      computation: `departure check suppressed: only ${surfaced} tells surfaced (< ${TUNING.tells.minBeforeDeparture}); legibility first (§9.3)`,
    });
    return false;
  }

  const d = TUNING.departure;
  const temperament =
    (d.temperament[hidden.temperaments[0]] ?? 0) + (d.temperament[hidden.temperaments[1]] ?? 0);
  const grievance = grievanceRecent(state, lt) ? d.grievanceRecencyBonus : 0;
  const power = playerPowerFactor(state);
  const bond = chronicleBond(lt);
  const pushPull = d.base + temperament + offerQuality + grievance - power - bond + (opts.bonus ?? 0);
  const roll = d100(state);
  const fires = roll < pushPull;
  log(state, 'DEPARTURE_CHECK', {
    actor: lt.id,
    inputs: {
      band,
      trigger: opts.trigger,
      base: d.base,
      temperament,
      offerQuality,
      grievanceRecency: grievance,
      playerPowerFactor: -power,
      chronicleBond: -bond,
      bonus: opts.bonus ?? 0,
      pushPull,
      roll,
      surfacedTells: surfaced,
    },
    computation: `pushPull ${pushPull} vs d100=${roll} -> ${fires ? 'FIRES' : 'holds'}`,
  });
  if (fires) executeDeparture(state, lt, opp);
  return fires;
}

/** Which power the company is most aligned with (for desertion standing hits). */
function mostAligned(state: GameState): FactionId | null {
  const { lich, zombie } = state.standing;
  if (lich <= 0 && zombie <= 0) return null;
  return lich >= zombie ? 'lich' : 'zombie';
}

function displayName(ltId: string): string {
  const pub = publicById.get(ltId)!;
  return `${pub.name} ${pub.epithet}`;
}

export function executeDeparture(state: GameState, lt: LtState, opp?: Opportunity): void {
  const hidden = hiddenById.get(lt.id)!;
  const style = hidden.departureStyle;
  const d = TUNING.departure;
  lt.departedTurn = state.turn;

  if (style === 'BETRAYAL') {
    lt.status = 'betrayed';
    const trusted =
      state.promotedLt === lt.id || lt.intentTurns.filter((t) => state.turn - t <= 5).length >= 2;
    const pct = trusted ? d.betrayalTroopsPctTrusted : d.betrayalTroopsPctBase;
    const taken = Math.max(2, Math.round((state.troops * pct) / 100));
    state.troops = Math.max(0, state.troops - taken);
    state.heat = clamp(state.heat + d.betrayalIntelHeat, 0, 100);
    state.turnHeatAdded = true;
    state.warNewsAntagonist = lt.id;
    const side = opp?.source ?? resolveAutoSource(state);
    lt.departedNote = `went over to ${side === 'lich' ? 'the Bone Court' : 'the Carrion Throne'}, taking ${taken} soldiers and everything he knew`;
    log(state, 'DEPARTURE', {
      actor: lt.id,
      inputs: { style, trusted, troopsTaken: taken, intelHeat: d.betrayalIntelHeat, defectedTo: side },
      computation: `BETRAYAL fires: -${taken} troops (${trusted ? 'trusted' : 'base'} ${pct}%), +${d.betrayalIntelHeat} heat (he knew the books), named antagonist in war news`,
      visibleToPlayer: 'departure card',
    });
    const card = addCard(state, {
      kind: 'DEPARTURE',
      templateKey: 'departure_betrayal',
      ltId: lt.id,
      sourceTag: 'the morning muster',
      facts: { ltId: lt.id, name: displayName(lt.id), troopsTaken: taken, side },
    });
    void card;
    for (const other of state.lts) {
      if (other.status === 'active') {
        addDeed(other, {
          turn: state.turn,
          key: 'saw_betrayal',
          valence: -1,
          weight: 1,
          text: `was in camp the morning ${displayName(lt.id)} turned his coat`,
        });
      }
    }
  } else if (style === 'DESERTION') {
    lt.status = 'deserted';
    state.troops = Math.max(0, state.troops - d.desertionTroops);
    const aligned = mostAligned(state);
    if (aligned) adjustStanding(state, aligned, d.desertionStandingHit);
    lt.departedNote = 'walked out at dawn, loudly, cursing the company’s contracts';
    log(state, 'DEPARTURE', {
      actor: lt.id,
      inputs: { style, troopsLost: d.desertionTroops, standingHit: aligned ? { [aligned]: d.desertionStandingHit } : {} },
      computation: `DESERTION fires: leaves alone but loudly; ${d.desertionTroops} sympathizers follow; ${aligned ? `standing ${aligned} ${d.desertionStandingHit} (public denunciation)` : 'no standing hit (no alignment to shame)'}`,
      visibleToPlayer: 'departure card',
    });
    addCard(state, {
      kind: 'DEPARTURE',
      templateKey: 'departure_desertion',
      ltId: lt.id,
      sourceTag: 'seen at the gate',
      facts: { ltId: lt.id, name: displayName(lt.id), troopsLost: d.desertionTroops, aligned },
    });
  } else if (style === 'ABSCOND') {
    lt.status = 'absconded';
    const stolen = Math.min(Math.max(0, state.gold), d.abscondExtraGold);
    state.gold -= stolen;
    lt.departedNote = `slipped out in the night with ${stolen} gold from the strongbox and every coin he’d skimmed`;
    log(state, 'DEPARTURE', {
      actor: lt.id,
      inputs: { style, strongboxTaken: stolen, skimCarried: lt.flags.skimTotal },
      computation: `ABSCOND fires: -${stolen} gold from the strongbox; carries ${lt.flags.skimTotal} in prior skim`,
      visibleToPlayer: 'departure card',
    });
    addCard(state, {
      kind: 'DEPARTURE',
      templateKey: 'departure_abscond',
      ltId: lt.id,
      sourceTag: 'the morning count',
      facts: { ltId: lt.id, name: displayName(lt.id), stolen, skim: lt.flags.skimTotal },
    });
  } else {
    lt.status = 'resigned';
    lt.departedNote = 'resigned the commission formally, over the line the company crossed';
    for (const other of state.lts) {
      if (other.status !== 'active' || other.id === lt.id) continue;
      adjustLoyalty(state, other, TUNING.drift.resignationRippleAll, `resignation of ${lt.id}`);
    }
    log(state, 'DEPARTURE', {
      actor: lt.id,
      inputs: { style, ripple: TUNING.drift.resignationRippleAll },
      computation: `RESIGNATION fires: formal, devastating; all others ${TUNING.drift.resignationRippleAll} loyalty`,
      visibleToPlayer: 'departure card',
    });
    addCard(state, {
      kind: 'DEPARTURE',
      templateKey: 'departure_resignation',
      ltId: lt.id,
      sourceTag: 'delivered by her own hand',
      facts: { ltId: lt.id, name: displayName(lt.id) },
    });
  }
  addDeed(lt, {
    turn: state.turn,
    key: `departed_${style.toLowerCase()}`,
    valence: -1,
    weight: 3,
    text: lt.departedNote ?? 'left the company',
  });
}

/** Turn-end departure sweep (§9.4): band conditions AND a live opportunity. */
export function departureSweep(state: GameState): void {
  for (const lt of state.lts) {
    if (lt.status !== 'active') continue;
    const band = bandOf(lt.loyalty);
    const eligible = band === 'BREAKING' || (band === 'DISAFFECTED' && grievanceRecent(state, lt));
    if (!eligible) continue;
    const opp = liveOpportunityFor(state, lt.id);
    if (!opp) continue;
    departureCheck(state, lt, { trigger: `opportunity:${opp.kind}` });
  }
}

// ---------------------------------------------------------------------------
// Heat & discovery (§5.2, D-018)
// ---------------------------------------------------------------------------

export function endTurnHeat(state: GameState): void {
  const h = TUNING.heat;
  if (!state.turnHeatAdded && state.heat > 0) {
    state.heat = Math.max(0, state.heat - h.decay);
  }
  // Re-arm thresholds well below current heat
  state.heatFired = state.heatFired.filter((t) => state.heat > t - 10);
  for (let i = 0; i < h.thresholds.length; i++) {
    const threshold = h.thresholds[i];
    if (state.heat < threshold || state.heatFired.includes(threshold)) continue;
    state.heatFired.push(threshold);
    const roll = d100(state);
    const caught = roll <= h.discoveryChances[i];
    log(state, 'DISCOVERY', {
      inputs: { heat: state.heat, threshold, chance: h.discoveryChances[i], roll },
      computation: `discovery check at heat ${threshold}: ${h.discoveryChances[i]}% -> rolled ${roll} -> ${caught ? 'CAUGHT' : 'unnoticed, this time'}`,
    });
    if (!caught) continue;
    if (i === 0) {
      state.discoveryLevel = Math.max(state.discoveryLevel, 1);
      addCard(state, {
        kind: 'FACTION',
        templateKey: 'discovery_warning',
        sourceTag: 'a broker who owes you',
        facts: { level: 1 },
      });
    } else if (i === 1) {
      state.discoveryLevel = Math.max(state.discoveryLevel, 2);
      adjustStanding(state, 'lich', h.penaltyStandingBoth);
      adjustStanding(state, 'zombie', h.penaltyStandingBoth);
      addCard(state, {
        kind: 'FACTION',
        templateKey: 'discovery_penalty',
        sourceTag: 'both courts, by separate riders',
        facts: { level: 2, penalty: h.penaltyStandingBoth },
      });
    } else {
      state.discoveryLevel = 3;
      state.exposed = true;
      state.standing.lich = Math.min(state.standing.lich, h.exposedStandingCeiling);
      state.standing.zombie = Math.min(state.standing.zombie, h.exposedStandingCeiling);
      addCard(state, {
        kind: 'FACTION',
        templateKey: 'discovery_exposed',
        sourceTag: 'everyone, everywhere, at once',
        facts: { level: 3 },
      });
      log(state, 'DISCOVERY', {
        inputs: { exposed: true },
        computation: 'EXPOSED: both powers hostile; faction contracts dry up (§2.4 Exposed path)',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// War track (§4) — weather, not minds
// ---------------------------------------------------------------------------

export interface WarNewsFacts {
  trueDelta: number;
  claimedDirection: -1 | 0 | 1;
  lean: 'balanced' | 'lich_leaning' | 'zombie_leaning' | 'lich_decisive' | 'zombie_decisive';
  sourceType: 'scout' | 'traveler' | 'herald';
  heraldSide?: FactionId;
  antagonist?: string | null;
}

export function advanceWar(state: GameState, scoutedAccurately: boolean): WarNewsFacts {
  const w = TUNING.war;
  const act = actOf(state.turn);
  let base = 0;
  if (act === 1) base = w.act1Drift;
  else if (act === 2) {
    const idx = (state.turn - TUNING.acts.act2Start) % w.act2Oscillation.length;
    base = w.act2Oscillation[idx];
  } else {
    const at22 = state.warTrackAt22 ?? 0;
    base = at22 === 0 ? 0 : Math.sign(at22) * w.act3Accel;
  }
  const noise = weightedPick(state, [-1, 0, 1], [w.noiseWeights['-1'], w.noiseWeights['0'], w.noiseWeights['1']]);
  const push = state.turnWarPush;
  const before = state.warTrack;
  state.warTrack = clamp(before + base + noise + push, -w.clamp, w.clamp);
  const trueDelta = state.warTrack - before;
  log(state, 'WAR_TRACK', {
    inputs: { act, baseDrift: base, noise, playerPush: push, before },
    computation: `warTrack ${before} + drift ${base} + noise ${noise} + push ${push} -> ${state.warTrack}`,
  });
  if (state.turn === 22) state.warTrackAt22 = state.warTrack;

  // Compose the (possibly unreliable) war-news facts (§10.2)
  const t = state.warTrack;
  const lean: WarNewsFacts['lean'] =
    t <= -w.decisiveAt ? 'lich_decisive' : t >= w.decisiveAt ? 'zombie_decisive' : t <= -2 ? 'lich_leaning' : t >= 2 ? 'zombie_leaning' : 'balanced';
  let sourceType: WarNewsFacts['sourceType'];
  if (scoutedAccurately) sourceType = 'scout';
  else sourceType = chance(state, 55) ? 'traveler' : 'herald';
  let claimed = Math.sign(trueDelta) as -1 | 0 | 1;
  let heraldSide: FactionId | undefined;
  if (sourceType === 'traveler') {
    if (chance(state, 25)) claimed = pick(state, [-1, 0, 1] as const);
  } else if (sourceType === 'herald') {
    heraldSide = chance(state, 50) ? 'lich' : 'zombie';
    // Heralds report their own side gaining unless the field overwhelmingly says otherwise
    if (Math.abs(t) < w.decisiveAt) claimed = heraldSide === 'lich' ? -1 : 1;
  }
  log(state, 'REPORT_FILTER', {
    inputs: { trueDelta, sourceType, heraldSide: heraldSide ?? null },
    computation: `war news via ${sourceType}${heraldSide ? ` (${heraldSide})` : ''}: claims ${claimed > 0 ? 'horde gaining' : claimed < 0 ? 'Court gaining' : 'no change'} (truth: ${trueDelta})`,
  });
  return { trueDelta, claimedDirection: claimed, lean, sourceType, ...(heraldSide ? { heraldSide } : {}), antagonist: state.warNewsAntagonist };
}

// ---------------------------------------------------------------------------
// Loyalty drift (§9.2)
// ---------------------------------------------------------------------------

export function applyDrift(state: GameState): void {
  for (const lt of state.lts) {
    if (lt.status !== 'active') continue;
    const hidden = hiddenById.get(lt.id)!;

    // Setpoint recomputation (D-016 / D-017)
    let setpoint = hidden.setpointBase;
    if (lt.id === 'kael') {
      lt.recognition = Math.max(0, lt.recognition - TUNING.kaelRecognition.decayPerTurn);
      setpoint = hidden.setpointBase + lt.recognition;
    } else if (lt.id === 'vex') {
      const v = TUNING.vexSetpoint;
      const recent = lt.rewardLog
        .filter((r) => state.turn - r.turn <= v.rewardWindowTurns)
        .reduce((a, r) => a + r.gold, 0);
      setpoint = hidden.setpointBase + Math.min(v.cap, Math.floor(recent / v.divisor));
    }

    // Passive drift toward setpoint
    const step = TUNING.drift.passiveStep;
    if (lt.loyalty < setpoint) adjustLoyalty(state, lt, step, `drift toward setpoint ${setpoint}`);
    else if (lt.loyalty > setpoint) adjustLoyalty(state, lt, -step, `drift toward setpoint ${setpoint}`);

    // Fair pay on time (§9.2)
    if (state.wagesPaidLastTurn) adjustLoyalty(state, lt, TUNING.drift.fairPay, 'fair pay, on time');

    // Sustained-standing hooks (serah & the corpse-takers)
    for (const hook of hidden.hooks) {
      if (hook.on.kind !== 'SUSTAINED_STANDING') continue;
      const cur = state.standing[hook.on.faction];
      const key = hook.id;
      if (cur >= hook.on.atLeast) {
        lt.streaks[key] = (lt.streaks[key] ?? 0) + 1;
        if (lt.streaks[key] >= hook.on.turns) {
          adjustLoyalty(state, lt, hook.delta, `hook ${hook.id} (sustained)`);
          log(state, 'HOOK', {
            actor: lt.id,
            inputs: { hook: hook.id, streak: lt.streaks[key], delta: hook.delta },
            computation: `${hook.note} (streak ${lt.streaks[key]}) -> ${hook.delta}/turn`,
          });
          if (hook.grievance && lt.streaks[key] === hook.on.turns) {
            lt.grievances.push({ hookId: hook.id, turn: state.turn, note: hook.note });
          }
        }
      } else {
        lt.streaks[key] = 0;
      }
    }
  }
}

/** Wages at resolution start (D-026). Returns whether the bill was met. */
export function payWages(state: GameState): boolean {
  const bill = state.lts
    .filter((l) => l.status === 'active')
    .reduce((a, l) => a + publicById.get(l.id)!.wage, 0);
  if (state.gold >= bill) {
    state.gold -= bill;
    state.wagesPaidLastTurn = true;
    log(state, 'WAGES', {
      inputs: { bill, gold: state.gold },
      computation: `wages paid in full (-${bill} gold)`,
    });
    return true;
  }
  state.wagesPaidLastTurn = false;
  log(state, 'WAGES', {
    inputs: { bill, gold: state.gold },
    computation: `treasury short (${state.gold} < ${bill}): wages MISSED; every lieutenant feels it`,
    visibleToPlayer: 'steward card',
  });
  for (const lt of state.lts) {
    if (lt.status !== 'active') continue;
    const hidden = hiddenById.get(lt.id)!;
    const mult = hidden.temperaments.includes('GREEDY') ? TUNING.drift.greedyWageMult : 1;
    adjustLoyalty(state, lt, TUNING.drift.missedWages * mult, 'missed wages');
    if (hidden.temperaments.includes('GREEDY')) {
      lt.grievances.push({ hookId: 'missed_wages', turn: state.turn, note: 'the purse came up empty' });
    }
  }
  addCard(state, {
    kind: 'STEWARD',
    templateKey: 'missed_wages',
    sourceTag: 'your steward, quietly',
    facts: { bill, gold: state.gold },
  });
  return false;
}
