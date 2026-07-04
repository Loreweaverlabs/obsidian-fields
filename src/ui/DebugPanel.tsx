// Dev/debug mode (§12.3), behind ?debug=1. Shows hidden state — never linked from player UI.
import { useMemo, useState } from 'react';
import { publicById } from '../engine/data';
import { bandOf } from '../engine/core';
import { derivedRng } from '../engine/rng';
import { POLICIES, type PolicyName } from '../sim/policies';
import type { LogType } from '../engine/types';
import { applyCouncil, type Session } from './store';

const LOG_TYPES: LogType[] = [
  'INIT', 'WAGES', 'PEOPLE_VERB', 'ACCEPT', 'WILLINGNESS', 'ROLL', 'RIDER', 'HOOK', 'DRIFT',
  'BAND_CROSS', 'TELL_SCHEDULED', 'TELL_DELIVERED', 'OPPORTUNITY', 'DEPARTURE_CHECK',
  'DEPARTURE_SUPPRESSED', 'DEPARTURE', 'CONFRONT', 'DISCOVERY', 'WAR_TRACK', 'CONTRACT_DRAW',
  'EVENT', 'REPORT_FILTER', 'PROMOTION', 'END',
];

type DebugTab = 'log' | 'state' | 'tells' | 'audit' | 'ff';

export function DebugPanel(props: {
  session: Session;
  cardTexts: Map<string, string>;
  onChanged: () => void;
}): JSX.Element {
  const state = props.session.state;
  const [tab, setTab] = useState<DebugTab>('log');
  const [actor, setActor] = useState('');
  const [type, setType] = useState('');
  const [turnMin, setTurnMin] = useState(1);
  const [turnMax, setTurnMax] = useState(30);
  const [ffTurns, setFfTurns] = useState(5);
  const [ffPolicy, setFfPolicy] = useState<PolicyName>('random');
  const [ffError, setFfError] = useState('');

  const filtered = useMemo(
    () =>
      state.log.filter(
        (e) =>
          (!actor || e.actor === actor) &&
          (!type || e.type === type) &&
          e.turn >= turnMin &&
          e.turn <= turnMax,
      ),
    [state.log, state.log.length, actor, type, turnMin, turnMax],
  );

  function fastForward(): void {
    setFfError('');
    try {
      const policy = POLICIES[ffPolicy];
      for (let i = 0; i < ffTurns && !state.over; i++) {
        const rng = derivedRng(props.session.seed, `ff:${props.session.actions.length}`);
        applyCouncil(props.session, policy(state, rng));
      }
      props.onChanged();
    } catch (err) {
      setFfError(err instanceof Error ? err.message : String(err));
      props.onChanged();
    }
  }

  return (
    <div className="debug">
      <div className="debug-warn">DEBUG VIEW — true hidden state. Not for players.</div>
      <nav className="tabs">
        {(['log', 'state', 'tells', 'audit', 'ff'] as DebugTab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t === 'log' ? 'Decision log' : t === 'state' ? 'True state' : t === 'tells' ? 'Tell audit' : t === 'audit' ? 'Renderer audit' : 'Fast-forward'}
          </button>
        ))}
      </nav>

      {tab === 'log' && (
        <>
          <div className="row debug-filters">
            <select value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">any actor</option>
              {state.lts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">any type</option>
              {LOG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label>
              from t<input type="number" value={turnMin} min={1} max={30} onChange={(e) => setTurnMin(Number(e.target.value))} />
            </label>
            <label>
              to t<input type="number" value={turnMax} min={1} max={30} onChange={(e) => setTurnMax(Number(e.target.value))} />
            </label>
            <span className="dim">{filtered.length} entries</span>
          </div>
          <div className="log-table">
            {filtered.map((e) => (
              <div key={e.i} className="log-row">
                <span className="log-turn">t{e.turn}</span>
                <span className={`log-type type-${e.type.toLowerCase()}`}>{e.type}</span>
                <span className="log-actor">{e.actor ?? ''}</span>
                <span className="log-comp">
                  {e.computation}
                  {e.visibleToPlayer ? <em className="log-visible"> · visible: {e.visibleToPlayer}</em> : null}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'state' && (
        <div className="truestate">
          <h4>Company</h4>
          <pre>
            {JSON.stringify(
              {
                turn: state.turn,
                gold: state.gold,
                troops: state.troops,
                standing: state.standing,
                heat: state.heat,
                discoveryLevel: state.discoveryLevel,
                exposed: state.exposed,
                warTrack: state.warTrack,
                warTrackAt22: state.warTrackAt22,
                promoted: state.promotedLt,
                antagonist: state.warNewsAntagonist,
              },
              null,
              1,
            )}
          </pre>
          <h4>Lieutenants (hidden)</h4>
          <table className="debug-table">
            <thead>
              <tr>
                <th>lt</th><th>status</th><th>loyalty</th><th>band</th><th>recognition</th><th>grievances</th><th>skim held</th><th>tells</th>
              </tr>
            </thead>
            <tbody>
              {state.lts.map((l) => (
                <tr key={l.id}>
                  <td>{l.id}</td>
                  <td>{l.status}</td>
                  <td>{l.loyalty}</td>
                  <td>{bandOf(l.loyalty)}</td>
                  <td>{l.recognition}</td>
                  <td>{l.grievances.map((g) => `${g.hookId}@t${g.turn}`).join(', ') || '—'}</td>
                  <td>{l.flags.skimTotal}</td>
                  <td>{l.tells.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>Mission records — true vs reported (§10.2)</h4>
          <table className="debug-table">
            <thead>
              <tr>
                <th>t</th><th>lt</th><th>verb</th><th>contract</th><th>tier</th><th>will</th><th>gold true</th><th>claimed</th><th>skim</th><th>troops−</th><th>riders</th>
              </tr>
            </thead>
            <tbody>
              {state.missionRecords.map((r) => (
                <tr key={r.id}>
                  <td>{r.turn}</td>
                  <td>{r.ltId}</td>
                  <td>{r.verb}</td>
                  <td>{r.contractId ?? ''}</td>
                  <td>{r.tier ?? ''}</td>
                  <td>{r.willingness}</td>
                  <td>{r.goldTrue}</td>
                  <td>{r.goldReported}</td>
                  <td>{r.goldSkimmed}</td>
                  <td>{r.troopsLost}</td>
                  <td>{r.riders.join(',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>Live opportunities / scheduled tells</h4>
          <pre>{JSON.stringify({ opportunities: state.opportunities, scheduledTells: state.scheduledTells }, null, 1)}</pre>
        </div>
      )}

      {tab === 'tells' && (
        <div className="tellaudit">
          {state.lts.map((l) => (
            <div key={l.id} className="tell-block">
              <h4>
                {l.id} — {l.tells.length} tells{l.departedTurn ? ` (departed t${l.departedTurn})` : ''}
              </h4>
              {l.tells.length === 0 ? (
                <p className="dim">none surfaced</p>
              ) : (
                <ul>
                  {l.tells.map((t) => (
                    <li key={t.id}>
                      <b>t{t.turn}</b> [{t.kind}] strength {t.strength} → card {t.cardId}
                      <div className="tell-cardtext dim">{props.cardTexts.get(t.cardId) ?? '(card not found)'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="renderaudit">
          <p className="dim">
            Latest cards, facts beside prose — for the zero-added-facts spot audit (M6 gate).
          </p>
          {state.cards.slice(-30).map((c) => (
            <div key={c.id} className="audit-row">
              <div className="audit-facts">
                <b>{c.id}</b> <span className="dim">{c.templateKey}</span>
                <pre>{JSON.stringify(c.facts, null, 1)}</pre>
              </div>
              <div className="audit-text">{props.cardTexts.get(c.id)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ff' && (
        <div className="ff">
          <p className="dim">Runs a scripted policy from the current position. Actions are appended to the real action log, so exports stay replayable.</p>
          <div className="row">
            <select value={ffPolicy} onChange={(e) => setFfPolicy(e.target.value as PolicyName)}>
              <option value="random">randomPolicy</option>
              <option value="naiveLoyal">naiveLoyalPolicy</option>
              <option value="attentive">attentivePolicy</option>
            </select>
            <label>
              turns <input type="number" min={1} max={30} value={ffTurns} onChange={(e) => setFfTurns(Number(e.target.value))} />
            </label>
            <button className="primary" onClick={fastForward} disabled={state.over}>
              Run
            </button>
            {ffError && <span className="toast inline">{ffError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
