// The five play screens + epilogue (§12.1). Public information only — hidden numbers
// never render here (they live in the debug viewer).
import { useMemo, useState } from 'react';
import { CONTRACTS, STRINGS, contractById, publicById } from '../engine/data';
import { actOf } from '../engine/engine';
import { composeEpilogue } from '../render/epilogueText';
import type {
  CardKind,
  CouncilOrders,
  GameState,
  LtState,
  Order,
  ReportCard,
} from '../engine/types';
import type { Session } from './store';

const CARD_ORDER: Record<CardKind, number> = {
  ARRIVAL: 0,
  DEPARTURE: 1,
  STEWARD: 2,
  MISSION: 3,
  TALK: 4,
  CONFRONT: 5,
  RUMOR: 6,
  EVENT: 7,
  FACTION: 8,
  WAR: 9,
  EPILOGUE: 10,
};

const KIND_LABEL: Record<CardKind, string> = {
  ARRIVAL: 'Arrival',
  DEPARTURE: 'Departure',
  STEWARD: 'Steward',
  MISSION: 'Mission report',
  TALK: 'Private talk',
  CONFRONT: 'Confrontation',
  RUMOR: 'Camp rumor',
  EVENT: 'In camp',
  FACTION: 'Faction message',
  WAR: 'War news',
  EPILOGUE: 'Epilogue',
};

function ltName(id: string | undefined): string {
  if (!id) return '';
  const p = publicById.get(id);
  return p ? `${p.name} ${p.epithet}` : id;
}

function Card(props: {
  card: ReportCard;
  text: string;
  cited: boolean;
  citedCount: number;
  onToggleEvidence?: (id: string) => void;
}): JSX.Element {
  const { card, text } = props;
  return (
    <article className={`card kind-${card.kind.toLowerCase()}`}>
      <header>
        <span className="card-kind">{KIND_LABEL[card.kind]}</span>
        <span className="card-source">{card.sourceTag}</span>
        {props.onToggleEvidence && card.citable && (
          <label className="cite" title="Mark this card as evidence for a confrontation (max 2)">
            <input
              type="checkbox"
              checked={props.cited}
              onChange={() => props.onToggleEvidence?.(card.id)}
            />
            cite
          </label>
        )}
      </header>
      {text.split('\n').map((p, i) => (p.trim() ? <p key={i}>{p}</p> : null))}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function ReportsPanel(props: {
  state: GameState;
  cardTexts: Map<string, string>;
  evidence: string[];
  onToggleEvidence: (id: string) => void;
}): JSX.Element {
  const { state } = props;
  const turns: number[] = [];
  for (let t = state.turn; t >= 1; t--) turns.push(t);
  return (
    <div className="reports">
      {props.evidence.length > 0 && (
        <div className="evidence-note">
          {props.evidence.length} card{props.evidence.length > 1 ? 's' : ''} marked as evidence — use
          them with a confrontation at the Council.
        </div>
      )}
      {turns.map((t) => {
        const cards = state.cards
          .filter((c) => c.turn === t)
          .sort((a, b) => CARD_ORDER[a.kind] - CARD_ORDER[b.kind]);
        if (cards.length === 0) return null;
        return (
          <details key={t} open={t === state.turn} className="turn-block">
            <summary>
              Turn {t}
              {t === state.turn ? ' — this morning' : ''}
            </summary>
            {cards.map((c) => (
              <Card
                key={c.id}
                card={c}
                text={props.cardTexts.get(c.id) ?? ''}
                cited={props.evidence.includes(c.id)}
                citedCount={props.evidence.length}
                onToggleEvidence={props.onToggleEvidence}
              />
            ))}
          </details>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Council
// ---------------------------------------------------------------------------

interface Draft {
  verb: string; // 'HOLD' | mission | people
  contractId?: string;
  scoutTarget?: 'warFront' | 'faction' | 'rumor';
  faction?: 'lich' | 'zombie';
  gold?: number;
  latitude: 'explicit' | 'intent';
}

const MISSION_OPTIONS = [
  ['HOLD', 'Hold camp (no orders)'],
  ['TAKE_CONTRACT', 'Execute a contract'],
  ['SCOUT', 'Scout'],
  ['GUARD_CAMP', 'Guard the camp'],
  ['RECRUIT', 'Recruit'],
  ['NEGOTIATE', 'Negotiate'],
  ['REST', 'Stand down / rest'],
] as const;

const PEOPLE_OPTIONS = [
  ['PRAISE', 'Praise publicly'],
  ['REWARD', 'Reward (bonus pay)'],
  ['REPRIMAND', 'Reprimand'],
  ['PRIVATE_TALK', 'Private talk'],
  ['PROMOTE', 'Promote to First Captain'],
  ['CONFRONT', 'Confront (with evidence)'],
] as const;

const PEOPLE_VERB_SET = new Set(PEOPLE_OPTIONS.map(([v]) => v as string));
const ROLLED_VERBS = new Set(['TAKE_CONTRACT', 'SCOUT', 'RECRUIT', 'NEGOTIATE']);

export function CouncilPanel(props: {
  session: Session;
  evidence: string[];
  cardTexts: Map<string, string>;
  onEndTurn: (orders: CouncilOrders) => boolean;
}): JSX.Element {
  const state = props.session.state;
  const active = state.lts.filter((l) => l.status === 'active');
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(active.map((l) => [l.id, { verb: 'HOLD', latitude: 'explicit' } as Draft])),
  );
  const [accepted, setAccepted] = useState<string[]>([]);

  const offers = state.offers.filter((o) => o.expiresTurn >= state.turn);
  const banked = state.banked.filter((b) => b.expiresTurn >= state.turn);
  const assignable: { id: string; label: string }[] = [
    ...banked.map((b) => {
      const d = contractById.get(b.contractId)!;
      return { id: b.contractId, label: `${d.title} (banked, ${b.payment}g, until t${b.expiresTurn})` };
    }),
    ...offers.map((o) => {
      const d = contractById.get(o.contractId)!;
      return { id: o.contractId, label: `${d.title} (${o.paymentAdjusted}g, until t${o.expiresTurn})` };
    }),
  ];

  const peopleCount = Object.values(drafts).filter((d) => PEOPLE_VERB_SET.has(d.verb)).length;
  const takenContracts = new Set(
    Object.values(drafts)
      .filter((d) => d.verb === 'TAKE_CONTRACT' && d.contractId)
      .map((d) => d.contractId as string),
  );

  function setDraft(ltId: string, patch: Partial<Draft>): void {
    setDrafts((prev) => ({ ...prev, [ltId]: { ...prev[ltId], ...patch } }));
  }

  function submit(): void {
    const orders: Order[] = [];
    for (const lt of active) {
      const d = drafts[lt.id];
      if (!d || d.verb === 'HOLD') continue;
      const order: Order = { ltId: lt.id, verb: d.verb as Order['verb'] };
      if (ROLLED_VERBS.has(d.verb)) order.latitude = d.latitude;
      if (d.verb === 'TAKE_CONTRACT') order.contractId = d.contractId;
      if (d.verb === 'SCOUT') order.scoutTarget = d.scoutTarget ?? 'warFront';
      if (d.verb === 'NEGOTIATE') order.faction = d.faction ?? 'lich';
      if (d.verb === 'RECRUIT' || d.verb === 'REWARD') order.gold = d.gold ?? 30;
      if (d.verb === 'CONFRONT') order.evidenceCardIds = props.evidence;
      orders.push(order);
    }
    const ok = props.onEndTurn({ accepts: accepted.filter((id) => state.offers.some((o) => o.contractId === id)), orders });
    if (!ok) return;
  }

  return (
    <div className="council">
      <section className="board">
        <h3>The board</h3>
        {offers.length === 0 && banked.length === 0 && <p className="dim">No contracts on offer. The Fields are quiet — or done with you.</p>}
        {banked.map((b) => {
          const def = contractById.get(b.contractId)!;
          return (
            <div key={b.contractId} className={`offer source-${def.source.toLowerCase()}`}>
              <div className="offer-head">
                <b>{def.title}</b>
                <span className="badge">{def.source === 'NEUTRAL' ? 'neutral' : def.source === 'LICH' ? STRINGS.factions.lich.agents : STRINGS.factions.zombie.agents}</span>
                <span className="badge banked">accepted</span>
              </div>
              <div className="offer-meta">
                {b.payment}g · {def.troopRisk} risk · {def.domain.toLowerCase()} · expires t{b.expiresTurn}
              </div>
            </div>
          );
        })}
        {offers.map((o) => {
          const def = contractById.get(o.contractId)!;
          const conflictHeld =
            def.conflictPair &&
            (offers.some((x) => x.contractId === def.conflictPair) || banked.some((x) => x.contractId === def.conflictPair));
          return (
            <details key={o.contractId} className={`offer source-${def.source.toLowerCase()}`}>
              <summary>
                <div className="offer-head">
                  <b>{def.title}</b>
                  <span className="badge">{def.source === 'NEUTRAL' ? 'neutral' : def.source === 'LICH' ? STRINGS.factions.lich.agents : STRINGS.factions.zombie.agents}</span>
                </div>
                <div className="offer-meta">
                  {o.paymentAdjusted}g · {def.troopRisk} risk · {def.domain.toLowerCase()} · expires t{o.expiresTurn}
                  {conflictHeld ? ' · ⚔ conflicts with another offer' : ''}
                </div>
              </summary>
              <p className="offer-flavor">{def.flavor}</p>
              <div className="offer-terms dim">
                {Object.entries(def.standing.onComplete ?? {}).length > 0 && (
                  <span>
                    On completion:{' '}
                    {Object.entries(def.standing.onComplete ?? {})
                      .map(([f, v]) => `${f} ${v as number > 0 ? '+' : ''}${v}`)
                      .join(', ')}
                    .{' '}
                  </span>
                )}
                {conflictHeld && <span>Completing this forfeits its rival contract. </span>}
              </div>
              <button
                disabled={accepted.includes(o.contractId)}
                onClick={() => setAccepted((prev) => [...prev, o.contractId])}
              >
                {accepted.includes(o.contractId) ? 'Will be accepted' : 'Accept (bank without assigning)'}
              </button>
            </details>
          );
        })}
      </section>

      <section className="orders">
        <h3>
          Orders <span className="dim">({peopleCount}/2 people-verbs)</span>
        </h3>
        {active.map((lt) => {
          const pub = publicById.get(lt.id)!;
          const d = drafts[lt.id];
          const talkReady = state.turn - lt.lastTalkTurn >= 3;
          return (
            <div key={lt.id} className="order-row">
              <div className="order-lt">
                <span className="token" style={{ background: pub.portraitColor }}>
                  {pub.portraitToken}
                </span>
                <div>
                  <b>{pub.name}</b> <span className="dim">{pub.epithet}</span>
                </div>
              </div>
              <div className="order-controls">
                <select
                  value={d.verb}
                  onChange={(e) => setDraft(lt.id, { verb: e.target.value, contractId: undefined })}
                >
                  <optgroup label="Missions">
                    {MISSION_OPTIONS.map(([v, label]) => (
                      <option key={v} value={v} disabled={v === 'TAKE_CONTRACT' && assignable.length === 0}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`People (${peopleCount}/2)`}>
                    {PEOPLE_OPTIONS.map(([v, label]) => {
                      const isCurrent = d.verb === v;
                      let disabled = !isCurrent && peopleCount >= 2;
                      if (v === 'PRIVATE_TALK' && !talkReady) disabled = true;
                      if (v === 'PROMOTE' && state.promotedLt) disabled = true;
                      if (v === 'CONFRONT' && props.evidence.length === 0) disabled = false; // allowed; baseless has a cost
                      return (
                        <option key={v} value={v} disabled={disabled}>
                          {label}
                          {v === 'PRIVATE_TALK' && !talkReady ? ' (cooling off)' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>

                {d.verb === 'TAKE_CONTRACT' && (
                  <select
                    value={d.contractId ?? ''}
                    onChange={(e) => setDraft(lt.id, { contractId: e.target.value })}
                  >
                    <option value="" disabled>
                      choose a contract…
                    </option>
                    {assignable.map((a) => (
                      <option key={a.id} value={a.id} disabled={takenContracts.has(a.id) && d.contractId !== a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
                {d.verb === 'SCOUT' && (
                  <select
                    value={d.scoutTarget ?? 'warFront'}
                    onChange={(e) => setDraft(lt.id, { scoutTarget: e.target.value as Draft['scoutTarget'] })}
                  >
                    <option value="warFront">the war front</option>
                    <option value="faction">the envoys</option>
                    <option value="rumor">a rumor</option>
                  </select>
                )}
                {d.verb === 'NEGOTIATE' && (
                  <select
                    value={d.faction ?? 'lich'}
                    onChange={(e) => setDraft(lt.id, { faction: e.target.value as 'lich' | 'zombie' })}
                  >
                    <option value="lich">{STRINGS.factions.lich.agents}</option>
                    <option value="zombie">{STRINGS.factions.zombie.agents}</option>
                  </select>
                )}
                {(d.verb === 'RECRUIT' || d.verb === 'REWARD') && (
                  <input
                    type="number"
                    min={10}
                    max={Math.max(10, state.gold)}
                    step={5}
                    value={d.gold ?? 30}
                    onChange={(e) => setDraft(lt.id, { gold: Number(e.target.value) })}
                  />
                )}
                {d.verb === 'CONFRONT' && (
                  <span className="dim confront-note">
                    {props.evidence.length > 0
                      ? `citing ${props.evidence.length} card${props.evidence.length > 1 ? 's' : ''}`
                      : 'no evidence cited — accusation will be baseless'}
                  </span>
                )}

                {ROLLED_VERBS.has(d.verb) && (
                  <div className="latitude" title="Explicit: predictable, modest. Intent: your officer's judgment — and temperament — takes over.">
                    <label className={d.latitude === 'explicit' ? 'lat active' : 'lat'}>
                      <input
                        type="radio"
                        checked={d.latitude === 'explicit'}
                        onChange={() => setDraft(lt.id, { latitude: 'explicit' })}
                      />
                      explicit
                    </label>
                    <label className={d.latitude === 'intent' ? 'lat active' : 'lat'}>
                      <input
                        type="radio"
                        checked={d.latitude === 'intent'}
                        onChange={() => setDraft(lt.id, { latitude: 'intent' })}
                      />
                      intent
                    </label>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="endturn-row">
          <button className="primary big" onClick={submit}>
            End turn {state.turn}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const TELL_NOTES: Record<string, string> = {
  band_disaffected: 'Signs of discontent around the fires.',
  band_breaking: 'By every account, near some edge.',
  unease: 'Something is off, say the soldiers.',
  micromanage_grumble: 'Chafes under close orders.',
  opportunity_contact: 'Keeping company with strangers.',
  slow_walk: 'Recent work arrived late.',
  sandbag: 'Recent work looked half-hearted.',
  refusal: 'Refused an order outright.',
  talk_deflect: 'Deflected your last private talk.',
  talk_reveal: 'Spoke frankly of discontent.',
  audit_discrepancy: 'The count disagrees with the reports.',
};

export function RosterPanel(props: { state: GameState }): JSX.Element {
  const { state } = props;
  return (
    <div className="roster">
      {state.lts.map((lt) => {
        const pub = publicById.get(lt.id)!;
        const recent = lt.tells.filter((t) => t.turn <= state.turn && state.turn - t.turn <= 5);
        const notes = [...new Set(recent.map((t) => TELL_NOTES[t.kind]).filter(Boolean))].slice(0, 3);
        return (
          <div key={lt.id} className={`profile ${lt.status !== 'active' ? 'departed' : ''}`}>
            <div className="profile-head">
              <span className="token big" style={{ background: pub.portraitColor }}>
                {pub.portraitToken}
              </span>
              <div>
                <h3>
                  {pub.name} <span className="dim">{pub.epithet}</span>
                  {state.promotedLt === lt.id && <span className="badge gold">First Captain</span>}
                </h3>
                <div className="dim">
                  {pub.archetype} · {pub.visibleTraits.join(' · ')} · {pub.wage}g/turn
                </div>
              </div>
            </div>
            <p className="blurb">{pub.reputationBlurb}</p>
            {lt.status === 'active' ? (
              <div className="condition">
                {notes.length > 0 ? (
                  notes.map((n) => (
                    <div key={n} className="note">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="note steady">No troubling word in camp.</div>
                )}
              </div>
            ) : (
              <div className="condition">
                <div className="note gone">
                  {lt.status.toUpperCase()}
                  {lt.departedTurn ? ` — turn ${lt.departedTurn}` : ''}
                  {lt.departedNote ? `. ${lt.departedNote}.` : ''}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chronicle
// ---------------------------------------------------------------------------

export function ChroniclePanel(props: { state: GameState }): JSX.Element {
  return (
    <div className="chronicle">
      {props.state.lts.map((lt) => {
        const pub = publicById.get(lt.id)!;
        return (
          <div key={lt.id} className="chron-block">
            <h3>
              {pub.name} <span className="dim">{pub.epithet}</span>
            </h3>
            {lt.chronicle.length === 0 ? (
              <p className="dim">Nothing in the book yet.</p>
            ) : (
              <ul>
                {lt.chronicle.map((d, i) => (
                  <li key={i} className={d.valence > 0 ? 'deed good' : 'deed bad'}>
                    <span className="deed-turn">t{d.turn}</span> {pub.name} {d.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

function heatWord(heat: number): string {
  if (heat < 20) return 'Quiet';
  if (heat < 40) return 'Whispers';
  if (heat < 70) return 'Watched';
  return 'Marked';
}

export function LedgerPanel(props: { state: GameState }): JSX.Element {
  const { state } = props;
  const wages = state.lts.filter((l) => l.status === 'active').reduce((a, l) => a + publicById.get(l.id)!.wage, 0);
  const trackPct = ((state.warTrack + 10) / 20) * 100;
  const recentLich = state.workedFor.lich.filter((t) => state.turn - t <= 5).length;
  const recentZombie = state.workedFor.zombie.filter((t) => state.turn - t <= 5).length;
  return (
    <div className="ledger">
      <div className="ledger-grid">
        <div className="stat">
          <div className="stat-label">Treasury</div>
          <div className="stat-value">{state.gold} gold</div>
          <div className="dim">wages {wages}g / turn</div>
        </div>
        <div className="stat">
          <div className="stat-label">Muster</div>
          <div className="stat-value">{state.troops} swords</div>
        </div>
        <div className="stat">
          <div className="stat-label">Suspicion</div>
          <div className="stat-value">{heatWord(state.heat)}</div>
          <div className="dim">how the courts talk about you</div>
        </div>
        <div className="stat">
          <div className="stat-label">Contracts</div>
          <div className="stat-value">
            {state.completedContracts.length} done · {state.failedContracts.length} failed
          </div>
          <div className="dim">
            last 5 turns: {recentLich} for the Court, {recentZombie} for the Throne
          </div>
        </div>
      </div>

      <h3>Standings</h3>
      <StandingBar label={STRINGS.factions.lich.power} value={state.standing.lich} />
      <StandingBar label={STRINGS.factions.zombie.power} value={state.standing.zombie} />

      <h3>The war</h3>
      <div className="war-gauge">
        <span className="war-side">{STRINGS.factions.lich.power}</span>
        <div className="war-bar">
          <div className="war-dot" style={{ left: `${trackPct}%` }} />
        </div>
        <span className="war-side">{STRINGS.factions.zombie.power}</span>
      </div>
      <p className="dim war-note">
        Where the front stands, as best the company can judge it. War news varies with the teller.
      </p>
    </div>
  );
}

function StandingBar(props: { label: string; value: number }): JSX.Element {
  const pct = ((props.value + 100) / 200) * 100;
  return (
    <div className="standing">
      <span className="standing-label">{props.label}</span>
      <div className="standing-bar">
        <div className="standing-zero" />
        <div className="standing-dot" style={{ left: `${pct}%` }} />
      </div>
      <span className="standing-num">{props.value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Epilogue
// ---------------------------------------------------------------------------

export function EpiloguePanel(props: {
  session: Session;
  onExport: () => void;
  onNewGame: () => void;
}): JSX.Element {
  const state = props.session.state;
  const sections = useMemo(
    () => (state.epilogue ? composeEpilogue(state, state.epilogue) : []),
    [state, state.epilogue],
  );
  const stats = state.stats;
  return (
    <div className="epilogue">
      <h2 className="epilogue-title">The Company’s Account</h2>
      {sections.map((s, i) => (
        <section key={i} className="epi-section">
          {s.heading && <h3>{s.heading}</h3>}
          {s.body.split('\n').map((p, j) => (p.trim() ? <p key={j}>{p}</p> : null))}
        </section>
      ))}
      <section className="epi-section run-summary">
        <h3>The captain’s ledger, for the record</h3>
        <p className="dim">
          {state.completedContracts.length} contracts completed, {state.failedContracts.length} failed ·{' '}
          {state.gold} gold and {state.troops} swords at the end · suspicion stood at {heatWord(state.heat)}.
        </p>
        <table className="summary-table">
          <thead>
            <tr>
              <th>Lieutenant</th>
              <th>explicit orders</th>
              <th>intent orders</th>
            </tr>
          </thead>
          <tbody>
            {state.lts.map((lt) => (
              <tr key={lt.id}>
                <td>{ltName(lt.id)}</td>
                <td>{stats.explicitOrders[lt.id] ?? 0}</td>
                <td>{stats.intentOrders[lt.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="row epi-actions">
        <button className="primary big" onClick={props.onExport}>
          Export this run
        </button>
        <button className="big" onClick={props.onNewGame}>
          Muster a new company
        </button>
      </div>
      <p className="dim">
        Please export your run and send it with your debrief — it replays your whole campaign exactly.
      </p>
    </div>
  );
}
