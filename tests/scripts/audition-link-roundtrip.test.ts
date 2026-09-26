// A generated audition link is only useful if the app's REAL link reader reads it back as the
// scenario that was asked for — a param the reader silently ignores yields a link that plays
// something else with no error. The reader is the v2 stand's old-link path
// (`prototypes/v2/lib/v1-link.ts`, #1279); v1's own `loadFromUrl` went with its load/save layer
// (#1424). What that reader does not take yet (`int`, `bnd`, `autoplay`) is #1382.
import { describe, expect, it } from 'vitest';
import { openV1ShareLink } from '../../prototypes/v2/lib/v1-link.js';
import type { ChartContent } from '../../public/songbook/types.js';
import { runAuditionLink } from '../../scripts/audition-link.js';

const lane = { enabled: true, voice: 'synth', autoSound: true, volume: 1, reverb: 0.2 } as const;

/** The songbook document a link opens against: all it lends a link is the soloist's trading. */
const BASE: Pick<ChartContent, 'performance' | 'band'> = {
    performance: { bpm: 100, seed: '', randomizeSeed: true },
    band: {
        chords: lane,
        bass: lane,
        soloist: { ...lane, enabled: false, mode: 'monophonic', autoMode: true },
        groove: { ...lane, swing: 0, swingSub: '8th', humanize: 20, genre: 'Rock' },
    },
};

function open(...argv: string[]) {
    let out = '';
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
        out += chunk;
        return true;
    }) as typeof process.stdout.write;
    try {
        expect(runAuditionLink(argv)).toBe(0);
    } finally {
        process.stdout.write = write;
    }
    const url = new URL(out.trim());
    const outcome = openV1ShareLink(url.search, BASE);
    if (outcome.kind !== 'ok') {
        throw new Error(`the link did not open: ${outcome.kind}`);
    }
    return outcome.document.chart;
}

describe("audition link -> the stand's link reader, round trip", () => {
    it('restores the progression (accidentals intact), genre, key, tempo and meter', () => {
        const chart = open(
            '--prog=Cm7 | Cm7#5 | C+ | Cm(b6)',
            '--genre=Neo-Soul',
            '--key=Eb',
            '--int=0.8',
            '--bpm=92',
            '--ts=6/8',
        );
        expect(chart.arrangement.sections.map((s) => s.value)).toEqual([
            'Cm7 | Cm7#5 | C+ | Cm(b6)',
        ]);
        expect(chart.band.groove.genre).toBe('Neo-Soul');
        expect(chart.arrangement.key).toBe('Eb');
        expect(chart.performance.bpm).toBe(92);
        expect(chart.arrangement.timeSignature).toBe('6/8');
    });
});
