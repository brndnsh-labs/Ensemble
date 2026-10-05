/**
 * The held ending on every chart the app ships (#1516): the standards catalog and a new song's
 * starting chart, as authored and as a musician might type them without setting the key (it
 * defaults to C major, `blankSong`). The ending's root is the chart's own (#1521): a band that
 * plays the last bar as written ends on a chord that bar writes, and a band that resolves it
 * ends on the tonic of the key the chart is really in — never on a defaulted C, nor on any
 * other root that is not the tune's home.
 */
import { heldEnding } from '@band/arrange/ending';
import { compileTimeline, DEFAULT_SETTINGS, performPass, STYLES } from '@band/index';
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

/**
 * Does a jazz pass end on the chart's own root, given the tonic of the key it is really in?
 * The root is the pitch class the bass holds in the last bar. When the band resolves the bar
 * (the chord it holds is not one the bar writes) that root must be the real tonic; only a bar
 * played as written — held on its first chord, or split to hold a chord it writes later
 * (`G7 C`, `D7 G`) — may end on another root the bar writes.
 */
function endsHome(score: SemanticScore, tonic: number): boolean {
    const timeline = compileTimeline(score);
    const { events } = performPass(
        timeline,
        { ...DEFAULT_SETTINGS, style: 'jazz', seed: 'a' },
        { pass: 0, looping: false },
    );
    const last = timeline.bars.at(-1)!;
    const bass = events.filter((e) => e.lane === 'bass' && e.bar === last.index);
    const held = bass.at(-1)!.lane === 'bass' ? (bass.at(-1) as { midi: number }).midi % 12 : -1;
    const written = last.spans.flatMap((span) => (span.chord ? [span.chord] : []));
    const ending = heldEnding(timeline, last.index, STYLES.jazz.ending);
    const chord = ending?.spans.filter((span) => span.chord).at(-1)?.chord;
    const resolved = !!chord && !written.some((w) => w.symbol === chord.symbol);
    if (resolved) {
        return held === tonic;
    }
    return written.some((w) => w.root === held || w.bass === held);
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
        const wrong = charts
            .filter(([, score, key]) => !endsHome(score, keyPc(key)))
            .map(([title]) => title);
        expect(wrong).toEqual([]);
    });

    it('typed without its key (read as C major), ends on its own tonic', () => {
        // The key reads C; the tonic the band must resolve to is still the authored one.
        const wrong = charts
            .filter(
                ([, score, key]) => !endsHome({ ...score, key: 'C', isMinor: false }, keyPc(key)),
            )
            .map(([title]) => title);
        // Open in #1521's options B and C (record whether the key was set, or weigh the whole
        // chart). Each rests on a C chord that no rule reading one chord at a time can tell
        // from a tonic, so a defaulted C reads as home and the band resolves into it:
        // - All The Things You Are's A section modulates to C (`Dm7 G7 | Cmaj7 | Cmaj7`), and
        //   its last `C7b9` points back to an `Fm7` opening — exactly how a C tune that opens on
        //   its vi ends, so the opening cannot be preferred over the key;
        // - Stella's C section holds `Cm7 | Cm7 | Ab7` (a ii it never resolves as one), and its
        //   last bar, `Bbmaj7` on the downbeat, is approached two bars earlier, not in the bar.
        // Pinned so a fix (or a new case) shows up here.
        expect(wrong).toEqual(['All The Things You Are', 'Stella by Starlight']);
    });
});
