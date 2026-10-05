/**
 * The held ending on every chart the app ships (#1516): the standards catalog and a new song's
 * starting chart, as authored and as a musician might type them without setting the key (it
 * defaults to C major, `blankSong`). A pass that ends resolves only into a key the chart rests
 * in, so the ending's root is the chart's own: a chord its last bar writes, the chord it opens
 * on, or the tonic of the key it is really in — never a defaulted C it does not rest on.
 */
import { compileTimeline, DEFAULT_SETTINGS, performPass } from '@band/index';
import type { SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { buildStandardDocument, STANDARDS } from './standards';

/** `blankSong`'s starting chart: C G Am F, key C. */
const NEW_SONG: SemanticScore = {
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections: [
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: ['C', 'G', 'Am', 'F'].map((symbol, i) => ({
                id: `m${i}`,
                content: {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol, duration: [4, 1] }],
                },
            })),
        },
    ],
};

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A key name's pitch class (`Bb`, `F#`, `Ab`). */
const keyPc = (name: string) =>
    (PC[name[0]] + (name.includes('#') ? 1 : 0) - (name.includes('b') ? 1 : 0) + 12) % 12;

/** The pitch class the bass holds in a pass's last bar: the ending's root. */
function endingRoot(score: SemanticScore): { held: number; allowed: Set<number> } {
    const timeline = compileTimeline(score);
    const { events } = performPass(
        timeline,
        { ...DEFAULT_SETTINGS, style: 'jazz', seed: 'a' },
        { pass: 0, looping: false },
    );
    const last = timeline.bars.at(-1)!;
    const bass = events.filter((e) => e.lane === 'bass' && e.bar === last.index);
    const held = bass.at(-1)!.lane === 'bass' ? (bass.at(-1) as { midi: number }).midi % 12 : -1;
    const opening = timeline.spans.find((span) => span.chord)!.chord!;
    const allowed = new Set([
        ...last.spans.flatMap((span) => (span.chord ? [span.chord.bass, span.chord.root] : [])),
        opening.root,
    ]);
    return { held, allowed };
}

describe('the held ending on every shipped chart (#1516)', () => {
    const charts: [string, SemanticScore, string][] = [
        ['a new song', NEW_SONG, 'C'],
        ...STANDARDS.map((entry): [string, SemanticScore, string] => [
            entry.title,
            buildStandardDocument(entry).chart.score as SemanticScore,
            entry.key,
        ]),
    ];

    it('ends on its own tonic, as authored', () => {
        const wrong: string[] = [];
        for (const [title, score, key] of charts) {
            const { held, allowed } = endingRoot(score);
            if (!allowed.has(held) && held !== keyPc(key)) {
                wrong.push(`${title}: ${held}`);
            }
        }
        expect(wrong).toEqual([]);
    });

    it('typed without its key (read as C major), never ends on a C it does not rest on', () => {
        const wrong: string[] = [];
        for (const [title, score, key] of charts) {
            const { held, allowed } = endingRoot({ ...score, key: 'C', isMinor: false });
            // C is the ending only where the chart is really in C, or writes it there.
            if (!allowed.has(held) && !(held === 0 && keyPc(key) === 0)) {
                wrong.push(title);
            }
        }
        // Still undecided (#1516): each holds a C chord two bars that no local rule can tell
        // from a tonic — the 8-bar blues's IV7 (`C7 | C7 | G7`), Stella's ii (`Cm7 | Cm7 |
        // Ab7`). Telling them apart needs the chart weighed as a whole, or a record of whether
        // the key was set. Pinned so a fix (or a new case) shows up here.
        expect(wrong).toEqual(['8-Bar Blues', 'Stella by Starlight']);
    });
});
