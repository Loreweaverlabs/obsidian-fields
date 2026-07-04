// Core type system for The Obsidian Fields engine.
// The engine is pure and DOM-free; all randomness flows through the RngBox in GameState.

export type FactionId = 'lich' | 'zombie';
export type Source = 'LICH' | 'ZOMBIE' | 'NEUTRAL';
export type Domain = 'BATTLE' | 'RAID' | 'ESCORT' | 'INTEL' | 'LOGISTICS' | 'PURGE';
export type Temperament =
  | 'HONORABLE'
  | 'AMBITIOUS'
  | 'CAUTIOUS'
  | 'ZEALOUS'
  | 'GREEDY'
  | 'PRIDEFUL'
  | 'PROTECTIVE'
  | 'METICULOUS';
export type Band = 'DEVOTED' | 'SOLID' | 'WAVERING' | 'DISAFFECTED' | 'BREAKING';
export type Tier = 'CRIT' | 'SUCCESS' | 'PARTIAL' | 'FAILURE' | 'DISASTER';
export type Latitude = 'explicit' | 'intent';
export type TroopRisk = 'LOW' | 'MED' | 'HIGH';
export type LtStatus = 'active' | 'resigned' | 'deserted' | 'betrayed' | 'absconded' | 'dead';
export type DepartureStyle = 'BETRAYAL' | 'DESERTION' | 'ABSCOND' | 'RESIGNATION';
export type HookTag =
  | 'HARMS_VILLAGE'
  | 'HELPS_VILLAGE'
  | 'SERVES_UNDEAD'
  | 'GLORY'
  | 'DESECRATION'
  | 'ANTI_UNDEAD'
  | 'PROTECT_NEUTRAL'
  | 'UNGLAMOROUS';

export type MissionVerb = 'TAKE_CONTRACT' | 'SCOUT' | 'GUARD_CAMP' | 'RECRUIT' | 'NEGOTIATE' | 'REST';
export type PeopleVerb = 'PRAISE' | 'REWARD' | 'REPRIMAND' | 'PRIVATE_TALK' | 'PROMOTE' | 'CONFRONT';
export type Verb = MissionVerb | PeopleVerb;

export const MISSION_VERBS: readonly MissionVerb[] = [
  'TAKE_CONTRACT',
  'SCOUT',
  'GUARD_CAMP',
  'RECRUIT',
  'NEGOTIATE',
  'REST',
];
export const PEOPLE_VERBS: readonly PeopleVerb[] = [
  'PRAISE',
  'REWARD',
  'REPRIMAND',
  'PRIVATE_TALK',
  'PROMOTE',
  'CONFRONT',
];

// ---------------------------------------------------------------------------
// Content data (authored JSON under data/)
// ---------------------------------------------------------------------------

export interface StandingEffects {
  onAccept?: Partial<Record<FactionId, number>>;
  onComplete?: Partial<Record<FactionId, number>>;
  onFail?: Partial<Record<FactionId, number>>;
}

export interface ContractDef {
  id: string;
  source: Source;
  title: string;
  flavor: string;
  difficulty: number; // 1..10
  domain: Domain;
  payment: number;
  troopRisk: TroopRisk;
  standing: StandingEffects;
  heatEffect: number; // applies only when double-dealing (D-018)
  hookTags: HookTag[];
  expiresIn: number; // turns on offer before it lapses
  acts: number[]; // acts (1..3) in which it may be dealt
  contested?: boolean; // war-track ±1 C_eff modifier (D-020)
  conflictPair?: string; // id of the mutually exclusive partner contract
  weight?: number; // deal weight, default 1
}

export type EventKind = 'CAMP' | 'FACTION' | 'OPPORTUNITY' | 'DISCOVERY' | 'WAR';

export interface EventTrigger {
  minTurn?: number;
  maxTurn?: number;
  acts?: number[];
  ltActive?: string; // lieutenant must be active
  ltBandAtMost?: { lt: string; band: Band }; // lt band <= given (i.e. this bad or worse)
  ltGrievanceActive?: string; // lt has a grievance within tuning.grievanceRecencyTurns
  standingAtLeast?: Partial<Record<FactionId, number>>;
  standingAtMost?: Partial<Record<FactionId, number>>;
  heatAtLeast?: number;
  goldAtLeast?: number;
  goldAtMost?: number;
  notExposed?: boolean;
}

export interface EventEffects {
  gold?: number;
  troops?: number;
  standing?: Partial<Record<FactionId, number>>;
  heat?: number;
  loyalty?: { lt: string | 'all'; delta: number };
  spawnOpportunity?: {
    kind: OpportunityKind;
    lt: string;
    /** POACH source resolution: 'AUTO' = power the company is not favoring (or ascendant if neutral) */
    source?: FactionId | 'AUTO';
    offerQuality: number; // 0..15 (§9.4)
    windowTurns: number;
  };
}

export interface EventDef {
  id: string;
  kind: EventKind;
  title: string;
  text: string; // authored flavor; renderer may re-voice but facts stay structural
  sourceTag: string; // in-fiction source, e.g. "heard around the fire"
  acts: number[];
  once?: boolean;
  weight?: number;
  requires?: EventTrigger;
  effects?: EventEffects;
  lt?: string; // subject lieutenant (vignettes, opportunities)
}

export type OpportunityKind = 'POACH' | 'SKIM_BIG' | 'WALK_OUT';

export interface Opportunity {
  id: string;
  eventId: string;
  kind: OpportunityKind;
  ltId: string;
  source?: FactionId; // POACH: who is poaching
  offerQuality: number;
  spawnedTurn: number;
  expiresTurn: number;
}

// Hooks: data-driven triggers on lieutenant hidden state (§6.1)
export type HookTrigger =
  | { kind: 'TAG_COMPLETED_BY_COMPANY'; tag: HookTag }
  | { kind: 'TAG_COMPLETED_BY_SELF'; tag: HookTag }
  | { kind: 'TAG_ACCEPTED'; tag: HookTag }
  | { kind: 'SOURCE_COMPLETED_BY_COMPANY'; source: Source }
  | { kind: 'SUSTAINED_STANDING'; faction: FactionId; atLeast: number; turns: number }
  | { kind: 'UNGLAMOROUS_ASSIGNMENT' } // domain/difficulty per tuning
  | { kind: 'INTENT_LATITUDE_GIVEN' }
  | { kind: 'PASSED_OVER' };

export interface HookDef {
  id: string;
  on: HookTrigger;
  delta: number; // loyalty delta when it fires (per-turn delta for SUSTAINED_STANDING)
  grievance?: boolean; // negative hooks that count as an "active hook grievance" (§9.4)
  note: string;
}

export interface CastPublic {
  id: string;
  name: string;
  epithet: string;
  portraitToken: string; // short initials + color token; real art can replace via data
  portraitColor: string;
  archetype: string;
  visibleTraits: string[];
  reputationBlurb: string;
  wage: number;
  voice: { signaturePhrases: string[]; reportStyleTags: string[] };
}

export interface CastHidden {
  id: string;
  loyaltyStart: number;
  setpointBase: number;
  competence: number;
  specialty: Domain;
  temperaments: [Temperament, Temperament];
  departureStyle: DepartureStyle;
  hooks: HookDef[];
  /** extra C_eff mods, e.g. hale vs undead forces */
  hiddenMods?: { antiUndeadBonus?: number; logisticsBonus?: number };
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface Grievance {
  hookId: string;
  turn: number;
  note: string;
}

export interface Deed {
  turn: number;
  key: string; // e.g. 'held_the_line', 'refused_order'
  valence: 1 | -1;
  weight: number; // 1..3
  text: string; // short human line, already in-fiction ("held the ford at the Glass Bridge")
  domain?: Domain;
}

export interface SurfacedTell {
  id: string;
  turn: number; // turn whose reports phase carried it
  cardId: string;
  kind: string; // e.g. 'band_drop', 'opportunity_contact', 'refusal', 'slow_walk'
  strength: number; // 1 = soft rumor, 2 = specific/observed
}

export interface ScheduledTell {
  id: string;
  ltId: string;
  kind: string;
  dueTurn: number; // deliver no later than this turn's report generation
  payload: Record<string, unknown>;
}

export interface LtFlags {
  skimTotal: number; // gold vex has pocketed (true ledger drift)
  skimSuppressedUntil: number; // turn until which REPRIMAND/confession suppresses skimming
  confessed: string[]; // behaviors already confessed/repaired
}

export interface LtState {
  id: string;
  status: LtStatus;
  departedTurn: number | null;
  departedNote: string | null;
  loyalty: number;
  recognition: number; // kael setpoint driver (D-017)
  rewardLog: { turn: number; gold: number }[]; // vex setpoint driver (D-016)
  consecutiveExplicit: number;
  praiseTurns: number[];
  intentTurns: number[]; // turns given intent latitude (trust signal, §9.4 consequences)
  lastTalkTurn: number;
  lastBand: Band;
  grievances: Grievance[];
  streaks: Record<string, number>; // sustained-standing hook counters
  flags: LtFlags;
  tells: SurfacedTell[];
  chronicle: Deed[];
}

export interface Offer {
  contractId: string;
  offeredTurn: number;
  expiresTurn: number;
  paymentAdjusted: number; // war-desperation pay bump applied at deal time
}

export interface Banked {
  contractId: string;
  acceptedTurn: number;
  expiresTurn: number;
  payment: number;
}

export type CardKind =
  | 'MISSION'
  | 'RUMOR'
  | 'WAR'
  | 'FACTION'
  | 'STEWARD'
  | 'TALK'
  | 'CONFRONT'
  | 'EVENT'
  | 'ARRIVAL'
  | 'DEPARTURE'
  | 'EPILOGUE';

export interface CardEvidence {
  ltId: string;
  behavior: string; // 'skim' | 'slow_walk' | 'blame_shift' | 'exaggeration' | 'contact'
  key: string; // unique, e.g. 'skim:vex:t12'
  turn: number; // when the behavior happened (evidence goes stale, §9.5)
}

export interface ReportCard {
  id: string; // 't12-c3'
  turn: number; // reports phase at which it is shown
  kind: CardKind;
  templateKey: string; // renderer dispatch key
  ltId?: string;
  sourceTag: string; // in-fiction source line
  facts: Record<string, unknown>; // REPORTED facts (post reliability filter)
  recordId?: string; // pointer to the true MissionRecord
  evidence?: CardEvidence; // hidden: CONFRONT validity (D-023)
  citable: boolean;
}

/** True outcome record — the ground truth behind a mission card (§10.2). */
export interface MissionRecord {
  id: string;
  turn: number;
  ltId: string;
  verb: MissionVerb;
  contractId?: string;
  latitude?: Latitude;
  domain?: Domain;
  difficulty?: number;
  cEff?: number;
  successChance?: number;
  roll?: number;
  margin?: number;
  tier?: Tier;
  goldTrue: number; // what the company actually gained (after skim)
  goldReported: number; // what the lieutenant claimed
  goldSkimmed: number;
  troopsLost: number;
  standingDelta: Partial<Record<FactionId, number>>;
  heatDelta: number;
  riders: string[]; // structured rider facts, e.g. 'OVERPURGE', 'GLORY_TACKON_WIN'
  willingness: 'FULL' | 'SLOW_WALK' | 'SANDBAG' | 'REFUSED';
  notes: string[];
}

export type LogType =
  | 'INIT'
  | 'WAGES'
  | 'PEOPLE_VERB'
  | 'ACCEPT'
  | 'WILLINGNESS'
  | 'ROLL'
  | 'RIDER'
  | 'HOOK'
  | 'DRIFT'
  | 'BAND_CROSS'
  | 'TELL_SCHEDULED'
  | 'TELL_DELIVERED'
  | 'OPPORTUNITY'
  | 'DEPARTURE_CHECK'
  | 'DEPARTURE_SUPPRESSED'
  | 'DEPARTURE'
  | 'CONFRONT'
  | 'DISCOVERY'
  | 'WAR_TRACK'
  | 'CONTRACT_DRAW'
  | 'EVENT'
  | 'REPORT_FILTER'
  | 'PROMOTION'
  | 'END';

export interface LogEntry {
  i: number;
  turn: number;
  type: LogType;
  actor?: string;
  inputs: Record<string, unknown>;
  computation: string;
  visibleToPlayer?: string; // what the player could see of this, usually a cardId
}

export interface Order {
  ltId: string;
  verb: Verb;
  latitude?: Latitude; // mission verbs; default 'explicit'
  contractId?: string; // TAKE_CONTRACT
  scoutTarget?: 'warFront' | 'faction' | 'rumor';
  gold?: number; // RECRUIT budget / REWARD amount
  faction?: FactionId; // NEGOTIATE
  evidenceCardIds?: string[]; // CONFRONT
}

export interface CouncilOrders {
  accepts: string[]; // contract ids to accept-and-bank this turn
  orders: Order[];
}

export interface RunStats {
  explicitOrders: Record<string, number>;
  intentOrders: Record<string, number>;
  peopleVerbsUsed: Record<string, number>;
  assignmentsByLt: Record<string, number[]>; // turns each lt got any assignment
  contractsCompleted: number;
  contractsFailed: number;
}

export type EndingArchetype =
  | 'BANNERMEN'
  | 'BACKED_THE_LOSER'
  | 'RICH_AND_FREE'
  | 'EXPOSED'
  | 'COMPANY_BREAKS'
  | 'GROUND_DOWN';

export interface Epilogue {
  archetype: EndingArchetype;
  warOutcome: 'LICH_VICTORY' | 'ZOMBIE_VICTORY' | 'STALEMATE';
  alignedWith: FactionId | null;
  facts: Record<string, unknown>;
  ltSections: {
    ltId: string;
    status: LtStatus;
    deeds: Deed[]; // 2-3 chronicle pulls (§10.3)
    departedNote: string | null;
  }[];
}

export interface GameState {
  version: string;
  seed: string;
  rngS: number;
  turn: number; // current reports/council turn, 1..30
  over: boolean;
  endReason: string | null;
  gold: number;
  troops: number;
  standing: Record<FactionId, number>;
  heat: number;
  heatFired: number[]; // thresholds already triggered this arming cycle
  discoveryLevel: number; // 0 clean, 1 warned, 2 penalized, 3 exposed
  exposed: boolean;
  warTrack: number;
  warTrackAt22: number | null;
  workedFor: Record<FactionId, number[]>; // turns on which a contract was completed per power
  lts: LtState[];
  offers: Offer[];
  banked: Banked[];
  completedContracts: string[];
  failedContracts: string[];
  forfeitedContracts: string[];
  dealtContracts: Record<string, number>; // contract id -> turn last dealt (re-dealable after a gap)
  usedEvents: string[];
  eventLastFired: Record<string, number>;
  opportunities: Opportunity[];
  scheduledTells: ScheduledTell[];
  tellSeq: number;
  cards: ReportCard[];
  cardSeq: number;
  missionRecords: MissionRecord[];
  recordSeq: number;
  log: LogEntry[];
  logSeq: number;
  promotedLt: string | null;
  goldShortStreak: number;
  warNewsAntagonist: string | null; // departed betrayer named in war news
  betterTerms: FactionId | null; // NEGOTIATE success: next deal from this faction pays more
  epilogue: Epilogue | null;
  stats: RunStats;
  // per-resolution transients (reset at the top of each submitCouncil)
  turnWarPush: number;
  turnHeatAdded: boolean;
  guardActive: boolean;
  wagesPaidLastTurn: boolean;
  poachLastTurn: number;
  oppLastTurn: Record<string, number>; // opportunity cooldowns per lieutenant
}

export interface ExportedRun {
  format: 'obsidian-fields-run';
  version: string;
  seed: string;
  rendererMode: 'template' | 'llm';
  llmFallbackCards: string[];
  actions: CouncilOrders[];
  exportedAt?: string; // stamped by UI at export time (not by engine — determinism)
}
