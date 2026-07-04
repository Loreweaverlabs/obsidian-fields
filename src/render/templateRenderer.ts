// TemplateRenderer (§11.2): library keyed by (recordType × lieutenant-persona × outcomeTier),
// slot-filling, signature phrases, variety minimums with recent-use tracking.
// Variant choice uses a derived RNG from (seed, cardId) — never the game RNG (D-002).
import { STRINGS, publicById } from '../engine/data';
import { derivedRng, pick, rand } from '../engine/rng';
import type { GameState, ReportCard, Tier } from '../engine/types';
import type { Renderer } from './renderer';
import { TEMPLATES, type TemplateLibrary } from './templates';

const NO_REPEAT_WINDOW = 5; // turns (§11.2)

interface RecentUse {
  turn: number;
  variantIdx: number;
}

export class TemplateSession {
  private recent = new Map<string, RecentUse[]>();

  pickVariant(key: string, count: number, turn: number, roll: number): number {
    const used = (this.recent.get(key) ?? []).filter((u) => turn - u.turn < NO_REPEAT_WINDOW);
    const banned = new Set(used.map((u) => u.variantIdx));
    let candidates: number[] = [];
    for (let i = 0; i < count; i++) if (!banned.has(i)) candidates.push(i);
    if (candidates.length === 0) candidates = Array.from({ length: count }, (_, i) => i);
    const idx = candidates[Math.floor(roll * candidates.length)];
    used.push({ turn, variantIdx: idx });
    this.recent.set(key, used);
    return idx;
  }
}

const defaultSession = new TemplateSession();

export function fillSlots(template: string, facts: Record<string, unknown>, extra: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => {
    if (key in extra) return extra[key];
    const v = facts[key];
    if (v === null || v === undefined) return m;
    return String(v);
  });
}

function factionName(source: unknown): string {
  if (source === 'LICH') return STRINGS.factions.lich.agents;
  if (source === 'ZOMBIE') return STRINGS.factions.zombie.agents;
  return 'the client';
}

/** Resolve the variant list for a card: persona/tier-specific first, then fallbacks. */
function resolveVariants(lib: TemplateLibrary, card: ReportCard): { key: string; variants: string[] } {
  const persona = card.ltId ?? 'ANY';
  const tier = (card.facts.reportedTier as Tier | null) ?? 'ANY';
  const tryKeys = [
    `${card.templateKey}.${persona}.${tier}`,
    `${card.templateKey}.${persona}.ANY`,
    `${card.templateKey}.ANY.${tier}`,
    `${card.templateKey}.ANY.ANY`,
    `${card.templateKey}`,
  ];
  for (const key of tryKeys) {
    const variants = lib[key];
    if (variants && variants.length > 0) return { key, variants };
  }
  return { key: 'fallback', variants: ['{__raw}'] };
}

export function renderCardWithSession(state: GameState, card: ReportCard, session: TemplateSession): string {
  // Authored event text passes straight through — it is already the structured record's prose
  if (card.templateKey.startsWith('event_') && typeof card.facts.text === 'string') {
    return card.facts.text as string;
  }
  const { key, variants } = resolveVariants(TEMPLATES, card);
  const rng = derivedRng(state.seed, `card:${card.id}`);
  const idx = session.pickVariant(key, variants.length, card.turn, rand(rng));
  const template = variants[idx];
  const pub = card.ltId ? publicById.get(card.ltId) : undefined;
  const sig = pub ? pick(rng, pub.voice.signaturePhrases) : '';
  const extra: Record<string, string> = {
    name: pub ? `${pub.name} ${pub.epithet}` : '',
    shortName: pub ? pub.name : '',
    sig,
    faction: factionName(card.facts.source),
    setting: STRINGS.setting,
    company: STRINGS.company,
    __raw: JSON.stringify(card.facts),
    ...computedSlots(card),
  };
  let text = fillSlots(template, card.facts, extra);
  // Structured embellishments the template opts into via markers
  text = text.replace(/\s*\{anomalyLine\}/g, anomalyLine(card));
  text = text.replace(/\s*\{riderLines\}/g, riderLines(card));
  return text.trim();
}

/** Enum->phrase mappings for facts that need wording, computed per templateKey family. */
function computedSlots(card: ReportCard): Record<string, string> {
  const f = card.facts as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (card.templateKey === 'war_news') {
    const dir = f.claimedDirection as number;
    out.directionPhrase =
      dir < 0
        ? `${STRINGS.factions.lich.faction} gained ground this week.`
        : dir > 0
          ? `${STRINGS.factions.zombie.faction} pressed forward this week.`
          : 'The front barely moved this week.';
    const lean = f.lean as string;
    out.leanPhrase =
      lean === 'balanced'
        ? 'Taken whole, the war still hangs level.'
        : lean === 'lich_leaning'
          ? `Taken whole, the glass tilts toward ${STRINGS.factions.lich.power}.`
          : lean === 'zombie_leaning'
            ? `Taken whole, the glass tilts toward ${STRINGS.factions.zombie.power}.`
            : lean === 'lich_decisive'
              ? `The war is being decided, and it is ${STRINGS.factions.lich.power} deciding it.`
              : `The war is being decided, and it is ${STRINGS.factions.zombie.power} deciding it.`;
    out.antagonistLine = f.antagonist
      ? ' Riders swear a turncoat captain — late of your own company — was seen ordering enemy skirmishers with your old signals.'
      : '';
  }
  if (card.templateKey.startsWith('mission_take_contract')) {
    out.blameLine =
      f.blamedExternal === true
        ? 'The guides sold us a dry ford that wasn’t, and the brief undersold the watch by half — that failure was purchased upstream of me.'
        : 'The draw was honest and it beat us.';
  }
  if (card.templateKey === 'mission_scout') {
    const notes = (f.notes as string[]) ?? [];
    const target = notes.find((n) => n.startsWith('scouted:'))?.split(':')[1] ?? 'warFront';
    const tier = f.reportedTier as string;
    if (f.confirmedContact) {
      out.scoutLine = `the rumor was run to ground and it is true — the meeting happened, the stranger was real, and the trail ends at ${f.confirmedContactName}’s fire.`;
    } else if (target === 'warFront') {
      out.scoutLine =
        tier === 'CRIT' || tier === 'SUCCESS'
          ? 'the counts are good; today’s war news can be trusted to the digit.'
          : tier === 'PARTIAL'
            ? 'half a picture; weight today’s war news accordingly.'
            : 'dust, distance, and guesses; today’s war news is worth what rumor is worth.';
    } else if (target === 'faction') {
      out.scoutLine =
        tier === 'CRIT' || tier === 'SUCCESS'
          ? 'the envoys’ camps are mapped and their tempers taken; their next demand will not surprise us.'
          : 'the envoys keep their tents closed; little learned.';
    } else {
      out.scoutLine =
        tier === 'CRIT' || tier === 'SUCCESS'
          ? 'the rumor dissolved on inspection — smoke, no fire, this time.'
          : 'the rumor could not be run down; it keeps its teeth.';
    }
  }
  if (card.templateKey === 'mission_negotiate') {
    const tier = f.reportedTier as string;
    out.negotiateLine =
      tier === 'CRIT'
        ? 'The terms came out better than asked, and the courtesies were almost warm. Expect it in the next offers.'
        : tier === 'SUCCESS' || tier === 'PARTIAL'
          ? 'Ground was gained at the table; the next offers should show it.'
          : 'The talks soured over precedence and old debts. We gave back a little standing to leave with the rest.';
  }
  if (card.templateKey === 'mission_recruit') {
    const notes = (f.notes as string[]) ?? [];
    const n = notes.find((x) => x.startsWith('recruited:'))?.split(':')[1] ?? '0';
    const spent = Math.abs(Number(f.goldClaimed ?? 0));
    out.recruitLine =
      Number(n) > 0
        ? `${n} hands signed the roll for ${spent} gold spent — glasspickers, deserters, and one blacksmith worth the rest combined.`
        : `${spent} gold went out and almost nothing signed; the roads offered only the unwilling and the unable.`;
  }
  if (card.templateKey === 'private_talk') {
    const hint = f.hint as string;
    const nm = String(f.name ?? '');
    out.talkLine =
      hint === 'DEFLECTED'
        ? `You kept ${nm} back after the watch changed. They answered every question at length and said nothing at all — the grievance under the words was audible, but its shape never surfaced.`
        : hint === 'BREAKING'
          ? `You spoke with ${nm} alone, and it was worse than you thought. Whatever binds a soldier to a banner, you watched it hang by threads across one short fire.`
          : hint === 'DISAFFECTED'
            ? `You spoke with ${nm} alone. The words were correct and the tone was not; resentment kept surfacing between sentences like glass through topsoil.`
            : hint === 'WAVERING'
              ? `You spoke with ${nm} alone. Neither here nor gone — half out some door, and undecided about the half.`
              : hint === 'SOLID'
                ? `You spoke with ${nm} alone. The footing there is sound; the complaints are a soldier’s ordinary complaints.`
                : `You spoke with ${nm} alone and left no room for doubt: with you to the glass and past it.`;
  }
  if (card.templateKey === 'camp_duty') {
    const duties = (f.duties as { name: string; verb: string }[]) ?? [];
    out.dutyList = duties
      .map((d) =>
        d.verb === 'GUARD_CAMP' ? `${d.name} on the pickets` : d.verb === 'REST' ? `${d.name} stood down` : `${d.name} held camp`,
      )
      .join('; ');
  }
  return out;
}

function anomalyLine(card: ReportCard): string {
  const a = card.facts.anomaly;
  if (a === 'delayed') return ' The column arrived a day later than it should have. No explanation was volunteered.';
  if (a === 'listless') return ' The work reads thinner than the hand that usually signs it.';
  return '';
}

function riderLines(card: ReportCard): string {
  const riders = (card.facts.riders as string[] | undefined) ?? [];
  const lines: string[] = [];
  if (riders.includes('OVERPURGE'))
    lines.push(' More was burned than the contract named. The report calls this thoroughness.');
  if (riders.includes('GLORY_TACKON_WIN'))
    lines.push(' An objective nobody ordered was taken along the way — profitably, this once.');
  if (riders.includes('GLORY_TACKON_LOSS'))
    lines.push(' An objective nobody ordered was attempted along the way. The butcher’s bill says how it went.');
  if (riders.includes('SAFE_HANDS'))
    lines.push(' When it soured, the column withdrew in good order rather than gamble.');
  if (riders.includes('CAUTION_CAPPED'))
    lines.push(' The advantage was there to press. It was not pressed.');
  if (riders.includes('PRESSED_ON_WIN') || riders.includes('PRESSED_ON_LOSS'))
    lines.push(' Disengagement was available and was refused.');
  if (riders.includes('SHIELDED_THE_RANKS'))
    lines.push(' The rearguard was held personally so the ranks came home.');
  if (riders.includes('LT_DEATH')) lines.push(' The command tent is one voice quieter tonight.');
  return lines.join('');
}

export class TemplateRenderer implements Renderer {
  readonly mode = 'template' as const;
  private session = new TemplateSession();
  renderCard(state: GameState, card: ReportCard): string {
    return renderCardWithSession(state, card, this.session);
  }
}

/** Convenience for CLI/tools: module-level session keeps the no-repeat window across a run. */
export function renderCardText(state: GameState, card: ReportCard): string {
  return renderCardWithSession(state, card, defaultSession);
}
