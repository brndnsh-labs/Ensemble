import { type BandEvent, DEFAULT_SETTINGS } from './core/types.js';
import { compileTimeline, sectionKey } from './form/timeline.js';
import { performPass } from './perform.js';
import { STYLE_IDS } from './styles/index.js';
import { score } from './test/scores.js';

describe('sectionKey', () => {
    it('reads A, A2, A3 and A′ as the same section, and keeps whole words whole', () => {
        const key = (label: string, sectionIndex = 0) => sectionKey({ label, sectionIndex });
        for (const label of ['A', 'a', ' A2 ', 'A3', 'A′', "A'", 'A 2']) {
            expect(key(label)).toBe('a');
        }
        expect(key('Intro')).toBe('intro');
        expect(key('Verse 2')).toBe('verse');
        expect(key('Bridge')).not.toBe(key('A'));
    });

    it('tells unlabelled sections apart by position', () => {
        expect(sectionKey({ label: '', sectionIndex: 1 })).not.toBe(
            sectionKey({ label: ' ', sectionIndex: 2 }),
        );
        expect(sectionKey({ label: '2', sectionIndex: 3 })).toBe('#3');
    });
});

/** Their bass rhythm bends to what surrounds a section (how a section is entered, a run into the next section, a passing
 *  tone pointed at the next chord), so a return sounds like its neighbours, not only its letter. */
const BASS_FOLLOWS_NEIGHBOURS = new Set(['country', 'acoustic', 'reggae']);

const EIGHT = 'C | Am | Dm | G | C | Am | Dm | G';
const lanes = { drums: true, bass: true, comp: false, lead: true };

/** A, B, then the third section under `second`: same bars and intensity, so only the label differs. */
function play(style: (typeof STYLE_IDS)[number], seed: string, second: string) {
    const chart = score([
        { label: 'A', bars: EIGHT, targetIntensity: 0.5 },
        { label: 'B', bars: EIGHT, targetIntensity: 0.5 },
        { label: second, bars: EIGHT, targetIntensity: 0.5 },
    ]);
    const timeline = compileTimeline(chart);
    const settings = { ...DEFAULT_SETTINGS, style, seed, lanes, lead: 'sax' as const };
    const { events } = performPass(timeline, settings, { pass: 0, looping: true });
    /** A section's notes for one lane (what and when, not how hard), positioned from its own first bar. Drums are
     *  the kick: the section-scoped pick is the pattern, while ghosts, hats and the arrival crash
     *  are per-bar or the arrangement's. The last bar carries a fill of its own, so it is left out. */
    return (visit: number, lane: BandEvent['lane']) => {
        const bars = timeline.bars.filter((b) => b.visit.sectionIndex === visit);
        const start = bars[0].start;
        const body = new Set(bars.slice(0, -1).map((b) => b.index));
        return events
            .filter(
                (e) =>
                    e.lane === lane &&
                    body.has(e.bar) &&
                    (!('piece' in e) || (e.piece === 'kick' && Math.round(e.tick - start) > 0)),
            )
            .map((e) => ({
                bar: e.bar - bars[0].index,
                tick: Math.round(e.tick - start),
                // A bass line's pitches follow where the last bar left it; its rhythm is the figure.
                what: 'piece' in e ? e.piece : lane === 'lead' ? e.midi : 'note',
            }));
    };
}

describe.each(STYLE_IDS)('%s: a repeated letter is the same section', (style) => {
    it('A2 plays the groove of A (kick pattern and bass rhythm)', () => {
        for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
            const of = play(style, seed, 'A2');
            expect(of(2, 'drums')).toEqual(of(0, 'drums'));
            if (!BASS_FOLLOWS_NEIGHBOURS.has(style)) {
                expect(of(2, 'bass')).toEqual(of(0, 'bass'));
            }
        }
    });
});

describe('the lead head', () => {
    it('plays the same notes in A and A2, and not the same as B', () => {
        for (const style of ['jazz', 'bossa'] as const) {
            const of = play(style, 'head', 'A2');
            expect(of(2, 'lead').length).toBeGreaterThan(0);
            expect(of(2, 'lead')).toEqual(of(0, 'lead'));
        }
    });
});
