// Root app: setup -> play (Reports / Council / Roster / Chronicle / Ledger) -> Epilogue.
// Deliberately plain (§12.4). Debug viewer behind ?debug=1, never linked from the UI.
import { useEffect, useMemo, useRef, useState } from 'react';
import { STRINGS } from '../engine/data';
import { actOf } from '../engine/engine';
import type { CouncilOrders } from '../engine/types';
import {
  applyCouncil,
  buildCardTexts,
  clearSave,
  exportRun,
  importRun,
  newSession,
  persist,
  randomSeed,
  resume,
  type RendererMode,
  type Session,
} from './store';
import { CouncilPanel, ChroniclePanel, EpiloguePanel, LedgerPanel, ReportsPanel, RosterPanel } from './panels';
import { DebugPanel } from './DebugPanel';
import { LlmSettingsBox, useLlmTexts } from './llm';

type Tab = 'reports' | 'council' | 'roster' | 'chronicle' | 'ledger' | 'debug';

const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

export function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(() => resume());
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [tab, setTab] = useState<Tab>('reports');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [showIntro, setShowIntro] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<number | undefined>(undefined);

  const state = session?.state ?? null;
  const templateTexts = useMemo(() => (state ? buildCardTexts(state) : new Map<string, string>()), [state, state?.turn, state?.over]);
  const { texts: cardTexts, llmStatus } = useLlmTexts(session, templateTexts, bump);

  useEffect(() => {
    if (error) {
      window.clearTimeout(errorTimer.current);
      errorTimer.current = window.setTimeout(() => setError(null), 6000);
    }
  }, [error]);

  function startNew(seed: string, mode: RendererMode): void {
    const s = newSession(seed.trim() || randomSeed(), mode);
    persist(s);
    setSession(s);
    setTab('reports');
    setEvidence([]);
    setShowIntro(true);
  }

  function endTurn(orders: CouncilOrders): boolean {
    if (!session) return false;
    try {
      applyCouncil(session, orders);
      setEvidence([]);
      setTab('reports');
      bump();
      window.scrollTo({ top: 0 });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  function toggleEvidence(cardId: string): void {
    setEvidence((prev) => {
      if (prev.includes(cardId)) return prev.filter((c) => c !== cardId);
      return [...prev.slice(-1), cardId]; // keep at most 2, newest wins
    });
  }

  function doImport(json: string): void {
    try {
      const s = importRun(json);
      persist(s);
      setSession(s);
      setShowImport(false);
      setTab(s.state.over ? 'reports' : 'reports');
      bump();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!session || !state) {
    return (
      <SetupScreen
        onStart={startNew}
        onImport={() => setShowImport(true)}
        showImport={showImport}
        onImportSubmit={doImport}
        onImportClose={() => setShowImport(false)}
        error={error}
      />
    );
  }

  const act = state.over ? 3 : actOf(state.turn);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">The Obsidian Fields</span>
          <span className="brand-sub">
            {state.over ? 'the run is over' : `Turn ${state.turn} of 30 — Act ${['I', 'II', 'III'][act - 1]}`}
          </span>
        </div>
        <div className="vitals">
          <span title="treasury">{state.gold}g</span>
          <span title="soldiers">{state.troops} swords</span>
          <span title="renderer mode" className="dim">
            {session.rendererMode === 'llm' ? `voiced${llmStatus ? ` (${llmStatus})` : ''}` : 'templated'}
          </span>
        </div>
      </header>

      {!state.over && (
        <nav className="tabs">
          {(['reports', 'council', 'roster', 'chronicle', 'ledger'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t === 'reports' ? `Reports` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          {DEBUG && (
            <button className={tab === 'debug' ? 'tab active debug' : 'tab debug'} onClick={() => setTab('debug')}>
              Debug
            </button>
          )}
          <span className="tab-spacer" />
          <button className="tab minor" onClick={() => setShowIntro(true)}>
            How to play
          </button>
          <button className="tab minor" onClick={() => setShowExport(true)}>
            Export
          </button>
        </nav>
      )}

      {error && <div className="toast">{error}</div>}

      <main>
        {state.over ? (
          <>
            <EpiloguePanel
              session={session}
              onExport={() => setShowExport(true)}
              onNewGame={() => {
                clearSave();
                setSession(null);
              }}
            />
            {DEBUG && <DebugPanel session={session} cardTexts={cardTexts} onChanged={bump} />}
          </>
        ) : tab === 'reports' ? (
          <ReportsPanel state={state} cardTexts={cardTexts} evidence={evidence} onToggleEvidence={toggleEvidence} />
        ) : tab === 'council' ? (
          <CouncilPanel key={state.turn} session={session} evidence={evidence} cardTexts={cardTexts} onEndTurn={endTurn} />
        ) : tab === 'roster' ? (
          <RosterPanel state={state} />
        ) : tab === 'chronicle' ? (
          <ChroniclePanel state={state} />
        ) : tab === 'ledger' ? (
          <LedgerPanel state={state} />
        ) : (
          DEBUG && <DebugPanel session={session} cardTexts={cardTexts} onChanged={bump} />
        )}
      </main>

      {showIntro && <IntroOverlay onClose={() => setShowIntro(false)} />}
      {showExport && (
        <ExportOverlay json={exportRun(session)} onClose={() => setShowExport(false)} />
      )}
      {showImport && (
        <ImportOverlay onSubmit={doImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetupScreen(props: {
  onStart: (seed: string, mode: RendererMode) => void;
  onImport: () => void;
  showImport: boolean;
  onImportSubmit: (json: string) => void;
  onImportClose: () => void;
  error: string | null;
}): JSX.Element {
  const [seed, setSeed] = useState(randomSeed());
  const [mode, setMode] = useState<RendererMode>('template');
  return (
    <div className="setup">
      <h1>The Obsidian Fields</h1>
      <p className="setup-blurb">
        A free company arrives on {STRINGS.setting}, where {STRINGS.factions.lich.power} and{' '}
        {STRINGS.factions.zombie.power} grind against each other for supremacy. You command from the
        table, not the field: thirty days of contracts, reports, and lieutenants — some of whom will
        tell you the truth.
      </p>
      <div className="setup-form">
        <label>
          Campaign seed
          <input value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
        </label>
        <fieldset>
          <legend>Report voice</legend>
          <label className="radio">
            <input type="radio" checked={mode === 'template'} onChange={() => setMode('template')} />
            Templated (default — no key needed)
          </label>
          <label className="radio">
            <input type="radio" checked={mode === 'llm'} onChange={() => setMode('llm')} />
            Voiced by a language model (operator setting; needs an API key)
          </label>
          {mode === 'llm' && <LlmSettingsBox />}
        </fieldset>
        <div className="setup-actions">
          <button className="primary" onClick={() => props.onStart(seed, mode)}>
            Muster the company
          </button>
          <button onClick={props.onImport}>Import a run</button>
        </div>
        {props.error && <div className="toast">{props.error}</div>}
      </div>
      {props.showImport && <ImportOverlay onSubmit={props.onImportSubmit} onClose={props.onImportClose} />}
      <p className="setup-foot">
        A ~60–75 minute, 30-turn text prototype. Progress saves in your browser after every turn.
      </p>
    </div>
  );
}

function IntroOverlay(props: { onClose: () => void }): JSX.Element {
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <ul className="howto">
          <li>
            <b>Each turn has two halves.</b> Read the morning <b>Reports</b>; then, at the{' '}
            <b>Council</b>, give each lieutenant one order and end the turn.
          </li>
          <li>
            <b>Contracts pay the wages.</b> Accept work from either dead power, or from neutrals.
            Working both sides pays best — and someone is always watching.
          </li>
          <li>
            <b>Reports are written by people.</b> Some lieutenants understate, some embellish, some
            lie. The ledger, the rumors, and your own memory are your instruments.
          </li>
          <li>
            <b>People need handling.</b> Praise, reward, reprimand, private talks, one promotion, and
            — with evidence — confrontation. At most two of these per turn.
          </li>
          <li>
            <b>Orders come in two grips.</b> Explicit instruction is predictable and modest. An
            intent directive gives latitude: your people’s strengths and flaws both come out.
          </li>
          <li>
            <b>Watch for the quiet signs.</b> When something is wrong with one of yours, the camp
            usually knows before you do. It shows up in the reports — if you’re reading them.
          </li>
          <li>
            <b>Thirty turns.</b> Then the war resolves, and the company gets the ending it earned.
          </li>
        </ul>
        <button className="primary" onClick={props.onClose}>
          To the table
        </button>
      </div>
    </div>
  );
}

function ExportOverlay(props: { json: string; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <h2>Export run</h2>
        <p className="dim">
          Send this blob to the project lead — it replays your entire run exactly.
        </p>
        <textarea className="export-area" readOnly value={props.json} onFocus={(e) => e.target.select()} />
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              void navigator.clipboard.writeText(props.json).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
          <button
            onClick={() => {
              const blob = new Blob([props.json], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'obsidian-fields-run.json';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download .json
          </button>
          <button onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ImportOverlay(props: { onSubmit: (json: string) => void; onClose: () => void }): JSX.Element {
  const [text, setText] = useState('');
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <h2>Import run</h2>
        <p className="dim">Paste an exported run. It replays deterministically, then takes over this session.</p>
        <textarea
          className="export-area"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"format":"obsidian-fields-run", ...}'
        />
        <div className="row">
          <button className="primary" onClick={() => props.onSubmit(text)}>
            Replay it
          </button>
          <button onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
