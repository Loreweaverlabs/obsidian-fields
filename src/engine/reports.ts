// Report generation & reliability filters (§10). The engine has already produced the true
// outcome records; here each lieutenant's axes distort the PLAYER-FACING card. Every
// distortion is logged (REPORT_FILTER) and material discrepancies carry hidden evidence
// keys so discovered contradictions become CONFRONT ammunition (§9.5, D-023).
import { TUNING, contractById, hiddenById, publicById } from './data';
import { addCard, bandOf, getLt, log } from './core';
import { chance, randInt } from './rng';
import { recordTell } from './drama';
import type { WarNewsFacts } from './drama';
import type { GameState, MissionRecord, ReportCard, Tier } from './types';

function displayName(ltId: string): string {
  const pub = publicById.get(ltId)!;
  return `${pub.name} ${pub.epithet}`;
}

export function generateMissionCards(state: GameState, records: MissionRecord[]): void {
  for (const rec of records) {
    const lt = state.lts.find((l) => l.id === rec.ltId)!;
    const hidden = hiddenById.get(lt.id)!;
    const contract = rec.contractId ? contractById.get(rec.contractId) : undefined;
    const band = bandOf(lt.loyalty);

    const negotiated = rec.notes.find((n) => n.startsWith('negotiated:'))?.split(':')[1];
    const facts: Record<string, unknown> = {
      ltId: lt.id,
      name: displayName(lt.id),
      verb: rec.verb,
      contractId: rec.contractId ?? null,
      contractTitle: contract?.title ?? null,
      source: contract?.source ?? (negotiated ? negotiated.toUpperCase() : null),
      domain: rec.domain ?? null,
      troopsLost: rec.troopsLost,
      notes: [...rec.notes],
      riders: rec.riders.filter((r) => r !== 'SIDE_DEALS'), // side deals stay off the page
      latitude: rec.latitude ?? null,
    };
    let evidence: ReportCard['evidence'];
    let reportedTier: Tier | undefined = rec.tier;
    let goldClaimed = rec.goldTrue;
    const distortions: string[] = [];

    if (rec.willingness === 'REFUSED') {
      facts.refused = true;
      const card = addCard(state, {
        kind: 'MISSION',
        templateKey: 'mission_refused',
        ltId: lt.id,
        sourceTag: `${displayName(lt.id)}, to your face`,
        facts,
        recordId: rec.id,
        evidence: { ltId: lt.id, behavior: 'refusal', key: `refusal:${lt.id}:t${rec.turn}`, turn: rec.turn },
      });
      recordTell(state, lt, card, 'refusal', 2);
      continue;
    }

    // --- Reliability axes (§10.2) ---
    if (lt.id === 'vex' && rec.verb === 'TAKE_CONTRACT' && rec.tier) {
      const v = TUNING.vexSkim;
      const suppressed = state.turn <= lt.flags.skimSuppressedUntil;
      const earning = rec.goldTrue > 0 && (rec.tier === 'CRIT' || rec.tier === 'SUCCESS' || rec.tier === 'PARTIAL');
      if (earning && !suppressed) {
        const bigScore = rec.riders.includes('SIDE_DEALS') || Boolean(
          state.opportunities.find((o) => o.ltId === 'vex' && o.kind === 'SKIM_BIG' && state.turn <= o.expiresTurn),
        );
        const pct = randInt(state, v.pctMin, v.pctMax) + (bigScore ? 15 : 0);
        const skim = Math.round((rec.goldTrue * pct) / 100);
        const inflate = randInt(state, v.inflatePctMin, v.inflatePctMax);
        goldClaimed = Math.round((rec.goldTrue * (100 + inflate)) / 100);
        state.gold -= skim;
        rec.goldSkimmed = skim;
        rec.goldTrue -= skim;
        lt.flags.skimTotal += skim;
        evidence = { ltId: 'vex', behavior: 'skim', key: `skim:vex:t${rec.turn}`, turn: rec.turn };
        distortions.push(`skimmed ${skim} (${pct}%), claimed ${goldClaimed}`);
      }
      if (rec.tier === 'PARTIAL') {
        reportedTier = 'SUCCESS';
        distortions.push('reported the partial as a clean success');
        evidence = evidence ?? { ltId: 'vex', behavior: 'exaggeration', key: `exaggeration:vex:t${rec.turn}`, turn: rec.turn };
      }
      if (rec.tier === 'FAILURE' || rec.tier === 'DISASTER') {
        facts.oppositionClaim = 'three times their number, at least';
        facts.blamedExternal = true;
        evidence = { ltId: 'vex', behavior: 'exaggeration', key: `exaggeration:vex:t${rec.turn}`, turn: rec.turn };
        distortions.push('exaggerated the opposition, deflected the blame');
      }
    }
    if (lt.id === 'rooke' && rec.tier === 'CRIT') {
      reportedTier = 'SUCCESS';
      facts.hedged = true;
      distortions.push('understated a triumph as “acceptable” (calibrated, not a lie)');
    }
    if (lt.id === 'rooke') facts.hedged = true;
    if (hidden.temperaments.includes('ZEALOUS') && rec.riders.includes('OVERPURGE')) {
      facts.righteous = true;
      distortions.push('reframed collateral as righteousness');
    }
    if (
      lt.id === 'kael' &&
      (rec.tier === 'FAILURE' || rec.tier === 'DISASTER') &&
      lt.grievances.some((g) => state.turn - g.turn <= TUNING.departure.grievanceRecencyTurns)
    ) {
      facts.blamedExternal = true;
      evidence = { ltId: 'kael', behavior: 'blame_shift', key: `blame:kael:t${rec.turn}`, turn: rec.turn };
      distortions.push('shaded the blame onto the guides and the brief');
    }
    if (band === 'DISAFFECTED' || band === 'BREAKING') {
      if (!hidden.temperaments.includes('HONORABLE')) facts.sullen = true;
    }

    // SCOUT(rumor) verification: a successful rumor-chase confirms a recent contact tell,
    // producing citable CONFRONT evidence (§9.5) — the investigation loop closes.
    if (
      rec.verb === 'SCOUT' &&
      rec.notes.includes('scouted:rumor') &&
      (rec.tier === 'SUCCESS' || rec.tier === 'CRIT')
    ) {
      for (const other of state.lts) {
        const contact = other.tells.find(
          (t) => t.kind === 'opportunity_contact' && state.turn - t.turn <= 3,
        );
        if (contact && other.status === 'active') {
          facts.confirmedContact = other.id;
          facts.confirmedContactName = displayName(other.id);
          evidence = {
            ltId: other.id,
            behavior: 'contact',
            key: `scoutconfirm:${other.id}:t${rec.turn}`,
            turn: rec.turn,
          };
          break;
        }
      }
    }

    facts.reportedTier = reportedTier ?? null;
    facts.goldClaimed = goldClaimed;

    if (distortions.length > 0) {
      log(state, 'REPORT_FILTER', {
        actor: lt.id,
        inputs: { record: rec.id, trueTier: rec.tier, reportedTier, goldTrue: rec.goldTrue, goldClaimed },
        computation: `report filter (${hidden.temperaments.join('/')}): ${distortions.join('; ')}`,
        visibleToPlayer: 'the discrepancy is discoverable',
      });
    }

    const anomaly =
      rec.willingness === 'SLOW_WALK' ? 'delayed' : rec.willingness === 'SANDBAG' ? 'listless' : null;
    if (anomaly) facts.anomaly = anomaly;

    const card = addCard(state, {
      kind: 'MISSION',
      templateKey: `mission_${rec.verb.toLowerCase()}`,
      ltId: lt.id,
      sourceTag: `report of ${displayName(lt.id)}`,
      facts,
      recordId: rec.id,
      ...(evidence
        ? { evidence }
        : anomaly
          ? {
              evidence: {
                ltId: lt.id,
                behavior: rec.willingness === 'SLOW_WALK' ? 'slow_walk' : 'sandbag',
                key: `${rec.willingness === 'SLOW_WALK' ? 'slowwalk' : 'sandbag'}:${lt.id}:t${rec.turn}`,
                turn: rec.turn,
              },
            }
          : {}),
    });
    if (anomaly) {
      recordTell(state, lt, card, rec.willingness === 'SLOW_WALK' ? 'slow_walk' : 'sandbag', 1);
    }
  }
}

/** One steward line covering the lieutenants who stayed in camp. */
export function generateDutyCard(state: GameState, duties: { ltId: string; verb: string }[]): void {
  if (duties.length === 0) return;
  addCard(state, {
    kind: 'STEWARD',
    templateKey: 'camp_duty',
    sourceTag: 'the duty roster',
    facts: {
      duties: duties.map((d) => ({ ltId: d.ltId, name: displayName(d.ltId), verb: d.verb })),
    },
    citable: false,
  });
}

/** Deliver scheduled tells due by the next reports phase (§9.3 guarantee). */
export function deliverDueTells(state: GameState): void {
  const dueBy = state.turn + 1;
  const due = state.scheduledTells.filter((t) => t.dueTurn <= dueBy);
  state.scheduledTells = state.scheduledTells.filter((t) => t.dueTurn > dueBy);
  for (const tell of due) {
    const lt = state.lts.find((l) => l.id === tell.ltId)!;
    if (lt.status !== 'active') continue; // moot once they're gone
    const strength = tell.kind === 'band_breaking' ? 2 : 1;
    const card = addCard(state, {
      kind: 'RUMOR',
      templateKey: `tell_${tell.kind}`,
      ltId: lt.id,
      sourceTag: strength >= 2 ? 'your steward, in confidence' : 'heard around the fire',
      facts: { ltId: lt.id, name: displayName(lt.id), kind: tell.kind, strength },
    });
    recordTell(state, lt, card, tell.kind, strength);
  }
}

/** Rooke's audit: when she's in camp and the count is off, the count gets found (§10.2). */
export function rookeAudit(state: GameState, rookeInCamp: boolean): void {
  if (!rookeInCamp) return;
  const rooke = state.lts.find((l) => l.id === 'rooke');
  const vex = state.lts.find((l) => l.id === 'vex');
  if (!rooke || rooke.status !== 'active' || !vex || vex.status !== 'active') return;
  if (vex.flags.skimTotal <= 0) return;
  if (!chance(state, TUNING.vexSkim.auditChanceWhenRookeInCamp)) return;
  const card = addCard(state, {
    kind: 'STEWARD',
    templateKey: 'audit_discrepancy',
    ltId: 'rooke',
    sourceTag: 'Mother Rooke, ledger open',
    facts: { ltId: 'vex', name: displayName('vex'), shortBy: vex.flags.skimTotal },
    evidence: { ltId: 'vex', behavior: 'skim', key: `audit:vex:t${state.turn}`, turn: state.turn },
  });
  recordTell(state, vex, card, 'audit_discrepancy', 2);
  log(state, 'REPORT_FILTER', {
    actor: 'rooke',
    inputs: { skimTotal: vex.flags.skimTotal },
    computation: `Rooke's audit surfaced the missing gold (true vs reported, §10.2)`,
    visibleToPlayer: card.id,
  });
}

export function generateWarNewsCard(state: GameState, facts: WarNewsFacts): void {
  addCard(state, {
    kind: 'WAR',
    templateKey: 'war_news',
    sourceTag:
      facts.sourceType === 'scout'
        ? 'your own scouts'
        : facts.sourceType === 'traveler'
          ? 'a traveler on the Salt Road'
          : facts.heraldSide === 'lich'
            ? 'a herald of the Bone Court'
            : 'a herald of the Carrion Throne',
    facts: { ...facts },
    citable: false,
  });
}
