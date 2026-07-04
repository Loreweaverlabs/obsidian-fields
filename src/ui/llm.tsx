// LLMRenderer (§11.3): re-voices cards from the SAME structured records, behind the
// Renderer toggle chosen at session start. Silent fallback to TemplateRenderer on any
// API failure; affected cards are marked in the run export (llmFallbackCards).
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

async function voiceCard(card: ReportCard, apiKey: string, model: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 350,
      temperature: 0.2,
      system: systemPrompt(),
      messages: [{ role: 'user', content: recordFor(card) }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('empty response');
  return text;
}

/** Merge template texts with LLM voicings; queue new cards for voicing in llm mode. */
export function useLlmTexts(
  session: Session | null,
  templateTexts: Map<string, string>,
  onUpdate: () => void,
): { texts: Map<string, string>; llmStatus: string } {
  const cache = useRef(new Map<string, string>());
  const inFlight = useRef(new Set<string>());
  const [pendingCount, setPendingCount] = useState(0);
  const [failedRecently, setFailedRecently] = useState(false);

  const mode = session?.rendererMode ?? 'template';
  const cardCount = session?.state.cards.length ?? 0;

  useEffect(() => {
    if (!session || mode !== 'llm') return;
    const { apiKey, model } = loadSettings();
    if (!apiKey) return; // no key: template text shows; operator sets key in setup
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
          const text = await voiceCard(card, apiKey, model);
          cache.current.set(card.id, text);
          setFailedRecently(false);
        } catch {
          // silent fallback (§11.3): template text stands in; card marked in export
          if (!session.llmFallbackCards.includes(card.id)) {
            session.llmFallbackCards.push(card.id);
            persist(session);
          }
          setFailedRecently(true);
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
  }, [mode, cardCount, session]);

  const texts = useMemo(() => {
    if (mode !== 'llm') return templateTexts;
    const merged = new Map(templateTexts);
    for (const [id, text] of cache.current) merged.set(id, text);
    return merged;
  }, [templateTexts, mode, pendingCount]);

  const llmStatus =
    mode !== 'llm' ? '' : pendingCount > 0 ? `voicing ${pendingCount}…` : failedRecently ? 'fallback' : '';
  return { texts, llmStatus };
}

export function LlmSettingsBox(): JSX.Element {
  const [settings, setSettings] = useState(loadSettings());
  function update(patch: Partial<typeof settings>): void {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
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
      <p className="dim">
        Cards render from the same structured records in both modes; on any API failure the
        templated text stands in silently and the card is marked in the export.
      </p>
    </div>
  );
}
