// Template variety minimums (§11.2): >=3 variants per common key, >=2 per rare key,
// no exact repeat within a 5-turn window (session tracker).
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../render/templates';
import { TemplateSession } from '../render/templateRenderer';

// Keys that recur many times in a normal 30-turn run.
const COMMON_KEYS = [
  'war_news.ANY.ANY',
  'contract_offer.ANY.ANY',
  'contract_lapsed.ANY.ANY',
  'camp_duty.ANY.ANY',
  'missed_wages.ANY.ANY',
  'praise_done.ANY.ANY',
  'reward_done.ANY.ANY',
  'reprimand_done.ANY.ANY',
  'private_talk.ANY.ANY',
  'mission_refused.ANY.ANY',
  'mission_scout.ANY.SUCCESS',
  'mission_negotiate.ANY.ANY',
  'mission_recruit.ANY.ANY',
  'tell_band_disaffected.ANY.ANY',
  'tell_band_breaking.ANY.ANY',
  'tell_unease.ANY.ANY',
  'mission_take_contract.serah.SUCCESS',
  'mission_take_contract.kael.SUCCESS',
  'mission_take_contract.rooke.SUCCESS',
  'mission_take_contract.hale.SUCCESS',
  'mission_take_contract.vex.SUCCESS',
];

describe('template variety minimums (§11.2)', () => {
  it('every key has >=2 variants', () => {
    for (const [key, variants] of Object.entries(TEMPLATES)) {
      expect(variants.length, `${key} has only ${variants.length} variant(s)`).toBeGreaterThanOrEqual(2);
    }
  });
  it('common keys have >=3 variants', () => {
    for (const key of COMMON_KEYS) {
      const variants = TEMPLATES[key];
      expect(variants, `${key} missing from library`).toBeDefined();
      expect(variants.length, `${key} has only ${variants?.length} variant(s)`).toBeGreaterThanOrEqual(3);
    }
  });
  it('session never repeats a variant within the 5-turn window while alternatives remain', () => {
    const session = new TemplateSession();
    const picks: number[] = [];
    for (let turn = 1; turn <= 3; turn++) picks.push(session.pickVariant('k', 3, turn, 0));
    expect(new Set(picks).size).toBe(3);
  });
});
