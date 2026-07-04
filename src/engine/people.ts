// People verbs (§7.2) — the diagnosis instruments — and confrontation & repair (§9.5).
import { TUNING, hiddenById, publicById } from './data';
import { addCard, addDeed, adjustLoyalty, bandOf, clamp, getLt, log } from './core';
import { chance } from './rng';
import { departureCheck } from './drama';
import type { Band, GameState, LtState, Order } from './types';

function displayName(ltId: string): string {
  const pub = publicById.get(ltId)!;
  return `${pub.name} ${pub.epithet}`;
}

export function applyPraise(state: GameState, lt: LtState): void {
  const p = TUNING.peopleVerbs;
  const hidden = hiddenById.get(lt.id)!;
  let base = p.praiseBase;
  if (hidden.temperaments.some((t) => p.praiseHungry.includes(t))) base *= p.praiseHungryMult;
  else if (hidden.temperaments.some((t) => p.praiseStoic.includes(t))) base *= p.praiseStoicMult;
  const recent = lt.praiseTurns.filter((t) => state.turn - t <= p.praiseDiminishWindow).length;
  const effect = Math.max(1, Math.round(base / (1 + recent)));
  lt.praiseTurns.push(state.turn);
  adjustLoyalty(state, lt, effect, 'public praise');
  if (lt.id === 'kael') {
    lt.recognition = clamp(lt.recognition + TUNING.kaelRecognition.praise, 0, TUNING.kaelRecognition.max);
  }
  log(state, 'PEOPLE_VERB', {
    actor: lt.id,
    inputs: { verb: 'PRAISE', base, recentPraises: recent, effect },
    computation: `praise: base ${base} / (1+${recent} recent) -> +${effect} loyalty${recent > 0 ? ' (diminishing returns)' : ''}`,
    visibleToPlayer: 'praise noted in next reports',
  });
  addCard(state, {
    kind: 'STEWARD',
    templateKey: 'praise_done',
    ltId: lt.id,
    sourceTag: 'at the evening muster',
    facts: { ltId: lt.id, name: displayName(lt.id), diminished: recent > 0 },
    citable: false,
  });
  addDeed(lt, {
    turn: state.turn,
    key: 'praised',
    valence: 1,
    weight: 1,
    text: 'was named with honor before the whole company',
  });
}

export function applyReward(state: GameState, lt: LtState, gold: number): void {
  const p = TUNING.peopleVerbs;
  const hidden = hiddenById.get(lt.id)!;
  const spend = Math.min(gold, Math.max(0, state.gold));
  state.gold -= spend;
  let points = Math.min(p.rewardMaxPoints, Math.floor(spend / p.rewardGoldPerPoint));
  if (hidden.temperaments.includes('GREEDY')) points = Math.round(points * p.rewardGreedyMult);
  adjustLoyalty(state, lt, points, `bonus pay (${spend} gold)`);
  lt.rewardLog.push({ turn: state.turn, gold: spend });
  log(state, 'PEOPLE_VERB', {
    actor: lt.id,
    inputs: { verb: 'REWARD', gold: spend, points },
    computation: `reward ${spend} gold -> +${points} loyalty${hidden.temperaments.includes('GREEDY') ? ' (greedy: coin speaks loudest)' : ''}`,
  });
  addCard(state, {
    kind: 'STEWARD',
    templateKey: 'reward_done',
    ltId: lt.id,
    sourceTag: 'from the strongbox',
    facts: { ltId: lt.id, name: displayName(lt.id), gold: spend },
    citable: false,
  });
  addDeed(lt, { turn: state.turn, key: 'rewarded', valence: 1, weight: 1, text: 'took the captain’s bonus with both hands' });
}

export function applyReprimand(state: GameState, lt: LtState): void {
  const p = TUNING.peopleVerbs;
  const hidden = hiddenById.get(lt.id)!;
  let delta = p.reprimandBase;
  if (hidden.temperaments.includes('PRIDEFUL')) delta += p.reprimandPridefulExtra;
  adjustLoyalty(state, lt, delta, 'public reprimand');
  lt.grievances.push({ hookId: 'reprimanded', turn: state.turn, note: 'dressed down before the company' });
  let suppressed: string | null = null;
  if (lt.flags.skimTotal > 0 || lt.id === 'vex') {
    lt.flags.skimSuppressedUntil = state.turn + p.reprimandSuppressTurns;
    suppressed = 'skimming';
  }
  log(state, 'PEOPLE_VERB', {
    actor: lt.id,
    inputs: { verb: 'REPRIMAND', delta, suppressed },
    computation: `reprimand: ${delta} loyalty${hidden.temperaments.includes('PRIDEFUL') ? ' (prideful backlash)' : ''}${suppressed ? `; ${suppressed} suppressed ${p.reprimandSuppressTurns} turns` : ''}`,
  });
  addCard(state, {
    kind: 'STEWARD',
    templateKey: 'reprimand_done',
    ltId: lt.id,
    sourceTag: 'at the evening muster',
    facts: { ltId: lt.id, name: displayName(lt.id), suppressed },
    citable: false,
  });
}

/** PRIVATE_TALK: band-level hint filtered through the lieutenant's honesty (§7.2).
 * Returns a tell spec when the talk itself surfaced legible trouble (recorded by engine.ts). */
export function applyPrivateTalk(state: GameState, lt: LtState): { cardId: string; kind: string } | null {
  lt.lastTalkTurn = state.turn;
  const band = bandOf(lt.loyalty);
  const hidden = hiddenById.get(lt.id)!;
  let hint: Band | 'DEFLECTED' = band;
  let honesty = 'straight';
  if (lt.id === 'vex') {
    const order: Band[] = ['BREAKING', 'DISAFFECTED', 'WAVERING', 'SOLID', 'DEVOTED'];
    hint = order[Math.min(order.indexOf(band) + 1, order.length - 1)];
    honesty = 'one band optimistic (he lies)';
  } else if (
    hidden.temperaments.includes('PRIDEFUL') &&
    lt.grievances.some((g) => state.turn - g.turn <= TUNING.departure.grievanceRecencyTurns)
  ) {
    hint = 'DEFLECTED';
    honesty = 'deflects while the grievance is fresh';
  }
  log(state, 'PEOPLE_VERB', {
    actor: lt.id,
    inputs: { verb: 'PRIVATE_TALK', trueBand: band, hint, honesty },
    computation: `private talk: true band ${band} -> reported "${hint}" (${honesty}); cooldown ${TUNING.peopleVerbs.talkCooldown} turns`,
    visibleToPlayer: 'talk card next morning',
  });
  const card = addCard(state, {
    kind: 'TALK',
    templateKey: 'private_talk',
    ltId: lt.id,
    sourceTag: 'by your own fire, after the watch changed',
    facts: { ltId: lt.id, name: displayName(lt.id), hint, trueForDebug: band },
    citable: false,
  });
  // A talk that reveals trouble (or a deflection) is itself legibility (§9.3)
  if (hint === 'DEFLECTED' || hint === 'DISAFFECTED' || hint === 'BREAKING') {
    return { cardId: card.id, kind: hint === 'DEFLECTED' ? 'talk_deflect' : 'talk_reveal' };
  }
  return null;
}

export function applyPromote(state: GameState, lt: LtState): void {
  const p = TUNING.peopleVerbs;
  state.promotedLt = lt.id;
  const hidden = hiddenById.get(lt.id)!;
  const hungry = hidden.temperaments.some((t) => p.praiseHungry.includes(t));
  const bonus = hungry ? p.promoteHungryBonus : p.promoteBonus;
  adjustLoyalty(state, lt, bonus, 'promoted to First Captain');
  if (lt.id === 'kael') {
    lt.recognition = clamp(lt.recognition + TUNING.kaelRecognition.promote, 0, TUNING.kaelRecognition.max);
  }
  addDeed(lt, {
    turn: state.turn,
    key: 'promoted',
    valence: 1,
    weight: 3,
    text: 'was named First Captain before the assembled company',
  });
  log(state, 'PROMOTION', {
    actor: lt.id,
    inputs: { bonus },
    computation: `promotion: +${bonus} loyalty; hook-check for everyone passed over (§7.2)`,
    visibleToPlayer: 'promotion card',
  });
  addCard(state, {
    kind: 'STEWARD',
    templateKey: 'promotion',
    ltId: lt.id,
    sourceTag: 'proclaimed at muster',
    facts: { ltId: lt.id, name: displayName(lt.id) },
    citable: false,
  });
  for (const other of state.lts) {
    if (other.status !== 'active' || other.id === lt.id) continue;
    const oh = hiddenById.get(other.id)!;
    const hook = oh.hooks.find((h) => h.on.kind === 'PASSED_OVER');
    if (hook) {
      adjustLoyalty(state, other, hook.delta, `hook ${hook.id} (passed over)`);
      other.grievances.push({ hookId: hook.id, turn: state.turn, note: hook.note });
      log(state, 'HOOK', {
        actor: other.id,
        inputs: { hook: hook.id, delta: hook.delta },
        computation: `${hook.note} -> ${hook.delta} loyalty`,
      });
    } else if (oh.temperaments.includes('AMBITIOUS') || oh.temperaments.includes('PRIDEFUL')) {
      adjustLoyalty(state, other, p.passedOverDefault, 'passed over for First Captain');
    }
  }
}

/** CONFRONT with cited evidence (§9.5). */
export function applyConfront(state: GameState, lt: LtState, order: Order): void {
  const p = TUNING.peopleVerbs;
  const cited = (order.evidenceCardIds ?? [])
    .map((id) => state.cards.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const valid = cited.find(
    (c) =>
      c.evidence &&
      c.evidence.ltId === lt.id &&
      state.turn - c.evidence.turn <= p.evidenceRecencyTurns,
  );
  if (!valid) {
    adjustLoyalty(state, lt, p.confrontInvalidPenalty, 'baseless accusation');
    lt.grievances.push({ hookId: 'confront_baseless', turn: state.turn, note: 'accused without proof' });
    log(state, 'CONFRONT', {
      actor: lt.id,
      inputs: { cited: cited.map((c) => c.id), valid: false },
      computation: `confrontation WITHOUT valid evidence: indignation, ${p.confrontInvalidPenalty} loyalty`,
      visibleToPlayer: 'confront card',
    });
    addCard(state, {
      kind: 'CONFRONT',
      templateKey: 'confront_baseless',
      ltId: lt.id,
      sourceTag: 'in your tent, witnesses outside',
      facts: { ltId: lt.id, name: displayName(lt.id), outcome: 'indignant' },
      citable: false,
    });
    return;
  }
  const behavior = valid.evidence!.behavior;
  const confesses = lt.loyalty >= p.confessLoyaltyFloor || chance(state, p.confessFallbackChance);
  if (confesses) {
    adjustLoyalty(state, lt, p.confrontRepairBonus, 'confession and repair');
    lt.flags.confessed.push(behavior);
    if (behavior === 'skim' || behavior === 'exaggeration') {
      lt.flags.skimSuppressedUntil = 9999;
    }
    lt.grievances = [];
    log(state, 'CONFRONT', {
      actor: lt.id,
      inputs: { evidence: valid.id, behavior, loyalty: lt.loyalty },
      computation: `confrontation with evidence -> CONFESSION: +${p.confrontRepairBonus} loyalty, behavior "${behavior}" cleared, grievances wiped (repair, §9.5)`,
      visibleToPlayer: 'confront card',
    });
    addCard(state, {
      kind: 'CONFRONT',
      templateKey: 'confront_confession',
      ltId: lt.id,
      sourceTag: 'in your tent, alone',
      facts: { ltId: lt.id, name: displayName(lt.id), behavior, outcome: 'confessed' },
      citable: false,
    });
    addDeed(lt, {
      turn: state.turn,
      key: 'came_clean',
      valence: 1,
      weight: 2,
      text: 'was caught out, and chose to come clean rather than run',
    });
  } else {
    log(state, 'CONFRONT', {
      actor: lt.id,
      inputs: { evidence: valid.id, behavior, loyalty: lt.loyalty },
      computation: `confrontation with evidence -> RUPTURE: immediate departure check at +${p.confrontRuptureBonus} (§9.5)`,
      visibleToPlayer: 'confront card',
    });
    addCard(state, {
      kind: 'CONFRONT',
      templateKey: 'confront_rupture',
      ltId: lt.id,
      sourceTag: 'in your tent; the whole camp heard',
      facts: { ltId: lt.id, name: displayName(lt.id), behavior, outcome: 'rupture' },
      citable: false,
    });
    addDeed(lt, {
      turn: state.turn,
      key: 'rupture',
      valence: -1,
      weight: 2,
      text: 'was confronted with proof and threw it back in the captain’s face',
    });
    departureCheck(state, lt, {
      trigger: 'confront_rupture',
      bonus: p.confrontRuptureBonus,
      offerQuality: TUNING.departure.ruptureOfferQuality,
    });
  }
}
