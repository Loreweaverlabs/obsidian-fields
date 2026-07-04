// Session plumbing for the web UI: autosave/resume (localStorage), export/import,
// and the card-text cache. The save IS (seed, actionLog) — loading replays it (D-003).
import { initGame, replay, submitCouncil, ENGINE_VERSION } from '../engine/engine';
import { TemplateSession, renderCardWithSession } from '../render/templateRenderer';
import type { CouncilOrders, ExportedRun, GameState } from '../engine/types';

const SAVE_KEY = 'obsidian-fields-save-v1';
const SETTINGS_KEY = 'obsidian-fields-settings-v1';

export type RendererMode = 'template' | 'llm';

export interface Session {
  seed: string;
  actions: CouncilOrders[];
  rendererMode: RendererMode;
  llmFallbackCards: string[];
  state: GameState;
}

export interface LlmSettings {
  apiKey: string;
  model: string;
}

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as LlmSettings;
  } catch {
    /* fresh */
  }
  return { apiKey: '', model: 'claude-haiku-4-5-20251001' };
}

export function saveSettings(s: LlmSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

interface SaveBlob {
  format: 'obsidian-fields-save';
  version: string;
  seed: string;
  rendererMode: RendererMode;
  llmFallbackCards: string[];
  actions: CouncilOrders[];
}

export function newSession(seed: string, rendererMode: RendererMode): Session {
  return { seed, actions: [], rendererMode, llmFallbackCards: [], state: initGame(seed) };
}

export function persist(session: Session): void {
  const blob: SaveBlob = {
    format: 'obsidian-fields-save',
    version: ENGINE_VERSION,
    seed: session.seed,
    rendererMode: session.rendererMode,
    llmFallbackCards: session.llmFallbackCards,
    actions: session.actions,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
}

export function resume(): Session | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (blob.format !== 'obsidian-fields-save') return null;
    const state = replay(blob.seed, blob.actions);
    return {
      seed: blob.seed,
      actions: blob.actions,
      rendererMode: blob.rendererMode ?? 'template',
      llmFallbackCards: blob.llmFallbackCards ?? [],
      state,
    };
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function applyCouncil(session: Session, orders: CouncilOrders): void {
  submitCouncil(session.state, orders); // throws on invalid; caller catches
  session.actions.push(orders);
  persist(session);
}

export function exportRun(session: Session): string {
  const run: ExportedRun = {
    format: 'obsidian-fields-run',
    version: ENGINE_VERSION,
    seed: session.seed,
    rendererMode: session.rendererMode,
    llmFallbackCards: session.llmFallbackCards,
    actions: session.actions,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(run, null, 2);
}

export function importRun(json: string): Session {
  const run = JSON.parse(json) as ExportedRun;
  if (run.format !== 'obsidian-fields-run') throw new Error('not an Obsidian Fields run export');
  const state = replay(run.seed, run.actions);
  return {
    seed: run.seed,
    actions: run.actions,
    rendererMode: run.rendererMode ?? 'template',
    llmFallbackCards: run.llmFallbackCards ?? [],
    state,
  };
}

/**
 * Render every card to text in a stable order (card creation order) with a fresh
 * template session, so the no-repeat window sees the same sequence on every rebuild —
 * identical output across reloads, imports, and replays (D-002/D-003).
 */
export function buildCardTexts(state: GameState): Map<string, string> {
  const session = new TemplateSession();
  const map = new Map<string, string>();
  for (const card of state.cards) {
    map.set(card.id, renderCardWithSession(state, card, session));
  }
  return map;
}

export function randomSeed(): string {
  const words = ['glass', 'ash', 'bone', 'crow', 'salt', 'ember', 'frost', 'grave', 'brass', 'thorn'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.random().toString(36).slice(2, 8)}`;
}
