// Typed access to authored data. All content is JSON under data/ (spec §5.3, §13.1).
import tuningJson from '../../data/tuning.json';
import stringsJson from '../../data/strings.json';
import castPublicJson from '../../data/cast_public.json';
import castHiddenJson from '../../data/cast_hidden.json';
import contractsJson from '../../data/contracts.json';
import eventsJson from '../../data/events.json';
import epiloguesJson from '../../data/epilogues.json';
import type {
  Band,
  CastHidden,
  CastPublic,
  ContractDef,
  Domain,
  EventDef,
  FactionId,
  Temperament,
  Tier,
  TroopRisk,
} from './types';

export interface Tuning {
  start: { gold: number; troops: number };
  turns: number;
  acts: { act2Start: number; act3Start: number };
  roll: {
    base: number;
    slopePerPoint: number;
    clampMin: number;
    clampMax: number;
    specialtyBonus: number;
    tiersExplicit: { crit: number; success: number; partial: number; failure: number };
    intentTailWiden: number;
    latitudeCompetencePct: number;
    temperamentFit: Record<Domain, Partial<Record<Temperament, number>>>;
  };
  payout: { critPct: number; successPct: number; partialPct: number; failurePct: number; disasterPct: number };
  troopLoss: Record<TroopRisk, Record<Tier, [number, number]>>;
  ltDeath: { chanceOnDisasterHighRisk: number };
  willingness: {
    slowWalkChance: number;
    slowWalkPenalty: number;
    sandbagChance: number;
    sandbagPenalty: number;
    refusalHookDeltaAtMost: number;
  };
  bands: { devoted: number; solid: number; wavering: number; disaffected: number };
  drift: {
    passiveStep: number;
    fairPay: number;
    missedWages: number;
    greedyWageMult: number;
    comradeDeath: number;
    comradeDeathProtective: number;
    critBonus: number;
    critBonusAmbitiousPraised: number;
    resignationRippleAll: number;
    bigLossPenalty: number;
    bigLossThreshold: number;
  };
  micromanage: { ordersPerPenalty: number; penalty: number; appliesTo: Temperament[] };
  peopleVerbs: {
    capPerTurn: number;
    praiseBase: number;
    praiseHungryMult: number;
    praiseStoicMult: number;
    praiseHungry: Temperament[];
    praiseStoic: Temperament[];
    praiseDiminishWindow: number;
    rewardGoldPerPoint: number;
    rewardMaxPoints: number;
    rewardGreedyMult: number;
    reprimandBase: number;
    reprimandPridefulExtra: number;
    reprimandSuppressTurns: number;
    talkCooldown: number;
    promoteBonus: number;
    promoteHungryBonus: number;
    passedOverDefault: number;
    confrontInvalidPenalty: number;
    confrontRepairBonus: number;
    confessLoyaltyFloor: number;
    confessFallbackChance: number;
    confrontRuptureBonus: number;
    evidenceRecencyTurns: number;
  };
  tells: { minBeforeDeparture: number; maxDelayTurns: number };
  departure: {
    base: number;
    temperament: Partial<Record<Temperament, number>>;
    grievanceRecencyTurns: number;
    grievanceRecencyBonus: number;
    powerTroopsRef: number;
    powerGoldRef: number;
    powerFactorMax: number;
    bondPositiveWeightPerLevel: number;
    bondMax: number;
    betrayalTroopsPctBase: number;
    betrayalTroopsPctTrusted: number;
    betrayalIntelHeat: number;
    desertionTroops: number;
    desertionStandingHit: number;
    abscondExtraGold: number;
    ruptureOfferQuality: number;
  };
  heat: {
    thresholds: number[];
    discoveryChances: number[];
    decay: number;
    lookbackTurns: number;
    penaltyStandingBoth: number;
    exposedStandingCeiling: number;
  };
  war: {
    noiseWeights: Record<string, number>;
    act1Drift: number;
    act2Oscillation: number[];
    act3Accel: number;
    majorDifficulty: number;
    clamp: number;
    decisiveAt: number;
    desperationTrackMin: number;
  };
  contracts: {
    offersMin: number;
    offersMax: number;
    desperatePayBonusPct: number;
    lifelineWagesMultiple: number;
    bankedForfeitStandingPct: number;
  };
  events: { campEventChance: number; maxEventsPerTurn: number };
  collapse: { troopsFloor: number; goldDebtTurns: number; minActiveLts: number };
  recruit: { goldPerTroop: number; difficulty: number; tierMult: Record<Tier, number> };
  scout: { difficulty: number; disasterTroopLoss: [number, number] };
  negotiate: { difficulty: number; standingCrit: number; standingSuccess: number; standingFail: number; betterTermsPayPct: number };
  rest: { loyalty: number };
  kaelRecognition: { praise: number; promote: number; latitude: number; decayPerTurn: number; max: number };
  vexSetpoint: { cap: number; divisor: number; rewardWindowTurns: number };
  vexSkim: { pctMin: number; pctMax: number; inflatePctMin: number; inflatePctMax: number; auditChanceWhenRookeInCamp: number };
  unglamorous: { domains: Domain[]; maxDifficulty: number };
  sustainedStandingCheckTurns: number;
  opportunities: {
    poachCooldownTurns: number;
    poachLoyaltyBelow: number;
    poachMinTurn: number;
    walkoutLoyaltyBelow: number;
    skimBigLoyaltyBelow: number;
    windowTurns: number;
    oppCooldownTurns: number;
  };
  epilogue: { richGold: number; groundDownGold: number; alignedStanding: number; deedsPerLt: number };
}

export interface LoreStrings {
  setting: string;
  settingShort: string;
  company: string;
  companyFormal: string;
  factions: Record<FactionId, { power: string; faction: string; agents: string; envoy: string; troops: string }>;
  neutrals: { village: string; villageDesc: string; guild: string; merchant: string };
  places: Record<string, string>;
  faith: string;
}

export interface EpilogueData {
  warOutcomes: Record<string, string>;
  archetypes: Record<string, { title: string; text: string }>;
  ltMemorial: Record<string, string>;
}

export const TUNING = tuningJson as unknown as Tuning;
export const STRINGS = stringsJson as unknown as LoreStrings;
export const EPILOGUES = epiloguesJson as unknown as EpilogueData;

/** Fill {place} lore slots so engine facts carry final strings (one-file rename, spec §2.1). */
export function fillLore(text: string): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => {
    if (key === 'village') return STRINGS.neutrals.village;
    if (key === 'guild') return STRINGS.neutrals.guild;
    if (key === 'merchant') return STRINGS.neutrals.merchant;
    if (key === 'faith') return STRINGS.faith;
    const place = STRINGS.places[key];
    return place ?? m;
  });
}

export const CAST_PUBLIC: CastPublic[] = castPublicJson as unknown as CastPublic[];
export const CAST_HIDDEN: CastHidden[] = (castHiddenJson as unknown as { cast: CastHidden[] }).cast;

export const CONTRACTS: ContractDef[] = (contractsJson as unknown as ContractDef[]).map((c) => ({
  ...c,
  title: fillLore(c.title),
  flavor: fillLore(c.flavor),
}));

export const EVENTS: EventDef[] = (eventsJson as unknown as EventDef[]).map((e) => ({
  ...e,
  title: fillLore(e.title),
  text: fillLore(e.text),
}));

export const contractById = new Map(CONTRACTS.map((c) => [c.id, c]));
export const eventById = new Map(EVENTS.map((e) => [e.id, e]));
export const publicById = new Map(CAST_PUBLIC.map((c) => [c.id, c]));
export const hiddenById = new Map(CAST_HIDDEN.map((c) => [c.id, c]));

let validated = false;
/** One-time content sanity check; throws on authoring errors. */
export function validateData(): void {
  if (validated) return;
  const ids = new Set<string>();
  for (const c of CONTRACTS) {
    if (ids.has(c.id)) throw new Error(`duplicate contract id ${c.id}`);
    ids.add(c.id);
    if (c.difficulty < 1 || c.difficulty > 10) throw new Error(`contract ${c.id} difficulty out of range`);
    if (c.conflictPair) {
      const p = contractById.get(c.conflictPair);
      if (!p) throw new Error(`contract ${c.id} conflictPair ${c.conflictPair} missing`);
      if (p.conflictPair !== c.id) throw new Error(`conflictPair asymmetry ${c.id}<->${p.id}`);
    }
    if (c.acts.length === 0) throw new Error(`contract ${c.id} has no acts`);
  }
  const evIds = new Set<string>();
  for (const e of EVENTS) {
    if (evIds.has(e.id)) throw new Error(`duplicate event id ${e.id}`);
    evIds.add(e.id);
    if (e.lt && !publicById.get(e.lt)) throw new Error(`event ${e.id} unknown lt ${e.lt}`);
  }
  for (const pub of CAST_PUBLIC) {
    if (!hiddenById.get(pub.id)) throw new Error(`cast ${pub.id} missing hidden values`);
  }
  if (CAST_PUBLIC.length !== CAST_HIDDEN.length) throw new Error('cast public/hidden mismatch');
  validated = true;
}
