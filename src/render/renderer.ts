// Renderer contract (§11.1): renderers consume structured records and NOTHING else.
// If a fact isn't in the card record, it cannot appear on a card.
import type { GameState, ReportCard } from '../engine/types';

export interface Renderer {
  /** Render one card to in-fiction prose. Must be pure over (state.seed, card). */
  renderCard(state: GameState, card: ReportCard): Promise<string> | string;
  readonly mode: 'template' | 'llm';
}
