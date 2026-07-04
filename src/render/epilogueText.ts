// Compose the full epilogue prose (§2.4) from the structured Epilogue record.
// Used by the CLI, the web Epilogue screen, and exportable summaries.
import { EPILOGUES, publicById } from '../engine/data';
import type { Epilogue, GameState } from '../engine/types';

export interface EpilogueSection {
  heading: string;
  body: string;
  ltId?: string;
}

export function composeEpilogue(state: GameState, epilogue: Epilogue): EpilogueSection[] {
  const sections: EpilogueSection[] = [];
  const arch = EPILOGUES.archetypes[epilogue.archetype];
  sections.push({ heading: arch.title, body: EPILOGUES.warOutcomes[epilogue.warOutcome] });
  sections.push({ heading: '', body: arch.text });

  for (const sec of epilogue.ltSections) {
    const pub = publicById.get(sec.ltId)!;
    const name = `${pub.name} ${pub.epithet}`;
    const lines: string[] = [];
    if (sec.status === 'active') {
      lines.push(deedsIntro(name, sec.deeds.length));
    } else {
      const memorialKey =
        sec.status === 'dead'
          ? 'dead'
          : sec.status === 'betrayed'
            ? 'betrayed'
            : sec.status === 'deserted'
              ? 'deserted'
              : sec.status === 'absconded'
                ? 'absconded'
                : 'resigned';
      lines.push(
        EPILOGUES.ltMemorial[memorialKey].replace('{name}', pub.name).replace('{epithet}', pub.epithet),
      );
      if (sec.departedNote) lines.push(`The record shows it plainly: ${sec.departedNote}.`);
    }
    const intros = [
      (t: number) => `In the company’s book, under turn ${t}:`,
      (t: number) => `Under turn ${t}:`,
      (t: number) => `And later, turn ${t}:`,
    ];
    sec.deeds.forEach((d, i) => {
      lines.push(`${intros[i % intros.length](d.turn)} ${pub.name} ${d.text}.`);
    });
    sections.push({ heading: name, body: lines.join(' '), ltId: sec.ltId });
  }
  return sections;
}

function deedsIntro(name: string, deedCount: number): string {
  if (deedCount === 0) return `${name} marched out with the company, service unremarked by the book — which is its own kind of service.`;
  return `${name} marched out with the company when it was over.`;
}
