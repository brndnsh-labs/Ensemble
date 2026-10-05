/**
 * The held ending on every chart the app ships (#1516): the standards catalog and a new song's
 * starting chart, as authored and as a musician might type them without setting the key (it
 * defaults to C major, `blankSong`). The ending's root is the chart's own (#1521): as authored,
 * a band that plays the last bar as written ends on a chord that bar writes, and a band that
 * resolves it ends on the tonic of the key the chart is really in; typed without its key, it
 * ends on the same root it does as authored, the known exceptions pinned.
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

/** The pitch class the bass holds at the end of a jazz pass's last bar: the ending's root. */
function heldRoot(timeline: ReturnType<typeof compileTimeline>): number {
    const { events } = performPass(
        timeline,
        { ...DEFAULT_SETTINGS, style: 'jazz', seed: 'a' },
        { pass: 0, looping: false },
    );
    const last = timeline.bars.at(-1)!;
    const bass = events.filter((e) => e.lane === 'bass' && e.bar === last.index);
    return bass.at(-1)!.lane === 'bass' ? (bass.at(-1) as { midi: number }).midi % 12 : -1;
}

/**
 * Does a jazz pass end on the chart's own root, given the tonic of the key it is really in?
 * When the band resolves the bar (the chord it holds is not one the bar writes) that root must
 * be the real tonic; only a bar played as written — held on its first chord, or split to hold a
 * chord it writes later (`G7 C`, `D7 G`) — may end on another root the bar writes.
 */
function endsHome(score: SemanticScore, tonic: number): boolean {
    const timeline = compileTimeline(score);
    const held = heldRoot(timeline);
    const last = timeline.bars.at(-1)!;
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

    it('typed without its key (read as C major), ends on the root it ends on as authored', () => {
        // Forcing the key to C must not move the ending: the root the band holds is the one it
        // holds with the chart's own key.
        const wrong = charts
            .filter(
                ([, score]) =>
                    heldRoot(compileTimeline({ ...score, key: 'C', isMinor: false })) !==
                    heldRoot(compileTimeline(score)),
            )
            .map(([title]) => title);
        // Open in #1521's options B and C (record whether the key was set, or weigh the whole
        // chart); no rule reading one chord at a time tells these from a chart in C:
        // - All The Things You Are rests on `Cmaj7` (its A section's `Dm7 G7 | Cmaj7 | Cmaj7`),
        //   which states C as home, and resolves into it;
        // - Stella rests on `Cm7 | Cm7 | Ab7`, a minor tonic on C, and resolves into C minor;
        // - Canon and Andalusian end on a V triad (`A`, `E`), which is not read as a V7 pointing
        //   home (a triad a fifth above is as often a I–IV the other way round), so the
        //   unbacked bar is played as written;
        // - Funk (i-IV) ends on its dorian IV7 (`A7`), which points nowhere by a fifth;
        // - Alternative Loop ends on its borrowed iv, `Cm`: on the defaulted tonic, it reads as
        //   home.
        // Pinned so a fix (or a new case) shows up here.
        expect(wrong).toEqual([
            'All The Things You Are',
            'Stella by Starlight',
            'Canon',
            'Andalusian',
            'Funk (i-IV)',
            'Alternative Loop',
        ]);
    });
});
