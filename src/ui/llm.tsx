// LLMRenderer (§11.3): re-voices cards from the SAME structured records, behind the
// Renderer toggle chosen at session start. Silent fallback to TemplateRenderer on any
// API failure (testers never see errors); affected cards are marked in the run export.
// The OPERATOR, however, gets full diagnostics: captured error details, a connection
// test, and a retry action — reachable from the "voiced" chip in the top bar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CAST_PUBLIC, STRINGS } from '../engine/data';
import type { ReportCard } from '../engine/types';
import { loadSettings, persist, saveSettings, type Session } from './store';

const API_URL = 'https://api.anthropic.com/v1/messages';

function systemPrompt(): string {
  const bible = CAST_PUBLIC.map(
    (c) =>
      `- ${c.name} ${c.epithet} (${c.archetype}): traits ${c.visibleTraits.join(', ')}; report style ${c.voice.reportStyleTags.join(', ')}; signature phrases: ${c.voice.signaturePhrases.join(' / ')}`,
  ).join('\n');
  return [
    `You are the text renderer for "${STRINGS.setting}", a grim text drama about a free mercenary company between two undead powers (${STRINGS.factions.lich.power} / its agents ${STRINGS.factions.lich.agents}, and ${STRINGS.factions.zombie.power} / its agents ${STRINGS.factions.zombie.agents}).`,
    '',
    'THE IRONCLAD CONSTRAINT: render ONLY the facts in the provided record; add no events, numbers, names, or outcomes that are not present in the record. Every number you mention must appear verbatim in the record. If a detail is not in the record, it does not exist.',
    '',
    'Character bible:',
    bible,
    '',
    'Register: terse, grim, mercenary. 1–3 short paragraphs, no headings, no lists. No modern idiom, no fourth wall, and never game-mechanics vocabulary ("loyalty", "roll", "tier", "points" must not appear). Mission reports (kind MISSION) are written in first person by the named lieutenant, in their voice, and may work in a signature phrase naturally. Rumors, war news, faction messages and steward notes are short third-person camp reports matching their sourceTag.',
    '',
    'Reply with the rendered prose only.',
  ].join('\n');
}

function recordFor(card: ReportCard): string {
  return JSON.stringify(
    { kind: card.kind, templateKey: card.templateKey, sourceTag: card.sourceTag, lieutenant: card.ltId ?? null, facts: card.facts },
    null,
    1,
  );
}

/** POST to the Messages API. Throws an Error whose message names the exact failure. */
async function callApi(body: Record<string, unknown>, apiKey: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // fetch itself rejecting = network layer: offline, DNS, adblocker/extension, or CORS block
    throw new Error(
      `network error before reaching the API (${err instanceof Error ? err.message : String(err)}) — check connectivity, VPN/adblock extensions, or a firewall blocking api.anthropic.com`,
    );
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = (await res.json()) as { error?: { type?: string; message?: string } };
      if (parsed.error) detail = `${res.status} ${parsed.error.type ?? ''}: ${parsed.error.message ?? ''}`;
    } catch {
      /* body not JSON; keep status */
    }
    throw new Error(detail);
  }
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('the API returned an empty response');
  return text;
}

async function voiceCard(card: ReportCard, apiKey: string, model: string): Promise<string> {
  return callApi(
    {
      model,
      max_tokens: 350,
      temperature: 0.2,
      system: systemPrompt(),
      messages: [{ role: 'user', content: recordFor(card) }],
    },
    apiKey,
  );
}

/** One tiny request to prove key + model + network work. Returns a human-readable verdict. */
export async function testConnection(apiKey: string, model: string): Promise<{ ok: boolean; detail: string }> {
  if (!apiKey.trim()) return { ok: false, detail: 'no API key entered' };
  try {
    await callApi(
      {
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      },
      apiKey.trim(),
    );
    return { ok: true, detail: `connected — key and model "${model}" are working` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export interface LlmDiagnostics {
  texts: Map<string, string>;
  llmStatus: string;
  lastError: string | null;
  failedCount: number;
  retryFailed: () => void;
}

/** Merge template texts with LLM voicings; queue new cards for voicing in llm mode. */
export function useLlmTexts(
  session: Session | null,
  templateTexts: Map<string, string>,
  onUpdate: () => void,
): LlmDiagnostics {
  const cache = useRef(new Map<string, string>());
  const inFlight = useRef(new Set<string>());
  const [pendingCount, setPendingCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [, setRetryTick] = useState(0);

  const mode = session?.rendererMode ?? 'template';
  const cardCount = session?.state.cards.length ?? 0;
  const failedCount = session?.llmFallbackCards.length ?? 0;

  useEffect(() => {
    if (!session || mode !== 'llm') return;
    const { apiKey, model } = loadSettings();
    if (!apiKey.trim()) {
      setLastError('no API key entered — open the voiced settings (click the "voiced" chip) and paste one');
      return;
    }
    const todo = session.state.cards.filter(
      (c) =>
        !cache.current.has(c.id) &&
        !inFlight.current.has(c.id) &&
        !session.llmFallbackCards.includes(c.id),
    );
    if (todo.length === 0) return;
    let cancelled = false;
    const queue = [...todo].reverse(); // newest first
    setPendingCount(queue.length);
    const workers = Array.from({ length: 2 }, async () => {
      while (queue.length > 0 && !cancelled) {
        const card = queue.pop()!;
        inFlight.current.add(card.id);
        try {
          const text = await voiceCard(card, apiKey.trim(), model);
          cache.current.set(card.id, text);
          setLastError(null);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          // silent for the player (§11.3): template text stands in, card marked in export.
          // loud for the operator: captured here + console breadcrumb.
          console.error(`[obsidian-fields] LLM voicing failed for ${card.id}: ${detail}`);
          setLastError(detail);
          if (!session.llmFallbackCards.includes(card.id)) {
            session.llmFallbackCards.push(card.id);
            persist(session);
          }
        } finally {
          inFlight.current.delete(card.id);
          setPendingCount((n) => Math.max(0, n - 1));
          onUpdate();
        }
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cardCount, session, failedCount === 0]);

  const texts = useMemo(() => {
    if (mode !== 'llm') return templateTexts;
    const merged = new Map(templateTexts);
    for (const [id, text] of cache.current) merged.set(id, text);
    return merged;
  }, [templateTexts, mode, pendingCount]);

  const retryFailed = (): void => {
    if (!session) return;
    session.llmFallbackCards = [];
    persist(session);
    setLastError(null);
    setRetryTick((t) => t + 1); // effect re-runs via failedCount dep
    onUpdate();
  };

  const llmStatus =
    mode !== 'llm'
      ? ''
      : pendingCount > 0
        ? `voicing ${pendingCount}…`
        : lastError
          ? 'failing'
          : failedCount > 0
            ? 'fallback'
            : '';
  return { texts, llmStatus, lastError, failedCount, retryFailed };
}

export function LlmSettingsBox(props: { onSettingsChange?: () => void }): JSX.Element {
  const [settings, setSettings] = useState(loadSettings());
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function update(patch: Partial<typeof settings>): void {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    setTestResult(null);
    props.onSettingsChange?.();
  }

  async function runTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    const result = await testConnection(settings.apiKey, settings.model);
    setTestResult(result);
    setTesting(false);
  }

  return (
    <div className="llm-settings">
      <label>
        Anthropic API key (stays in this browser)
        <input
          type="password"
          value={settings.apiKey}
          placeholder="sk-ant-…"
          onChange={(e) => update({ apiKey: e.target.value })}
          spellCheck={false}
        />
      </label>
      <label>
        Model
        <input value={settings.model} onChange={(e) => update({ model: e.target.value })} spellCheck={false} />
      </label>
      <div className="row">
        <button onClick={() => void runTest()} disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && (
          <span className={testResult.ok ? 'llm-test ok' : 'llm-test bad'}>{testResult.detail}</span>
        )}
      </div>
      <p className="dim">
        Cards render from the same structured records in both modes; on any API failure the
        templated text stands in silently and the card is marked in the export.
      </p>
    </div>
  );
}

/** Mid-session operator panel: settings + live error + retry, behind the "voiced" chip. */
export function LlmStatusOverlay(props: {
  diagnostics: LlmDiagnostics;
  onClose: () => void;
}): JSX.Element {
  const { diagnostics } = props;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <h2>Voiced mode</h2>
        {diagnostics.lastError ? (
          <div className="toast">Last error: {diagnostics.lastError}</div>
        ) : (
          <p className="dim">No errors recorded{diagnostics.failedCount > 0 ? ' since the last failure batch' : ''}.</p>
        )}
        {diagnostics.failedCount > 0 && (
          <p className="dim">
            {diagnostics.failedCount} card{diagnostics.failedCount > 1 ? 's' : ''} fell back to templated
            text (marked in the export). After fixing the key or connection, retry them:
          </p>
        )}
        <div className="row" style={{ marginBottom: 12 }}>
          {diagnostics.failedCount > 0 && (
            <button className="primary" onClick={diagnostics.retryFailed}>
              Re-voice {diagnostics.failedCount} failed card{diagnostics.failedCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <LlmSettingsBox />
        <div className="row">
          <button onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
