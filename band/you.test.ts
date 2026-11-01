import { leadRoleAt } from './arrange/plan.js';
import { type BandSettings, DEFAULT_SETTINGS, type Lane } from './core/types.js';
import { compileTimeline } from './form/timeline.js';
import { performPass } from './perform.js';
import { STYLE_IDS } from './styles/index.js';
import { FIXTURES } from './test/scores.js';

// "What do you play?" (#1992): a lane muted because it is the musician's own instrument leaves a
// hole for them. The band plays exactly as it would with that player there — every other lane's
// notes are the ones it plays with the lane on — and only the musician's lane goes quiet. A lane
// that is simply switched off keeps today's meaning: the band plays without that player.

const LANES: Lane[] = ['drums', 'bass', 'comp', 'lead'];
const timeline = compileTimeline(FIXTURES.bossa);

function play(settings: BandSettings) {
    return performPass(timeline, settings, { pass: 0, looping: true }).events;
}

describe.each(STYLE_IDS)('%s: your own lane is a hole', (style) => {
    for (const you of LANES) {
        it(`with you on ${you}, the rest of the band plays note for note as with ${you} on`, () => {
            const settings: BandSettings = {
                ...DEFAULT_SETTINGS,
                style,
                seed: 'you',
                lanes: { drums: true, bass: true, comp: true, lead: true },
            };
            const full = play(settings);
            const holed = play({ ...settings, you });
            expect(holed.some((e) => e.lane === you)).toBe(false);
            expect(holed).toEqual(full.filter((e) => e.lane !== you));
        });
    }
});

it('a bassist hears the guitar keep its band shapes, where a band with no bass gets its alone ones', () => {
    // Blues' rhythm guitar plays root dyads low on the neck (`alone`) when no bass is in the band:
    // right for a band without a bassist, wrong under a bassist practising.
    const settings: BandSettings = {
        ...DEFAULT_SETTINGS,
        style: 'blues',
        comp: 'guitar',
        seed: 'bassist',
        lanes: { drums: true, bass: true, comp: true, lead: false },
    };
    const comp = (s: BandSettings) =>
        performPass(compileTimeline(FIXTURES.blues), s, {
            pass: 0,
            looping: true,
        }).events.filter((e) => e.lane === 'comp');
    const withBass = comp(settings);
    const bassist = comp({ ...settings, you: 'bass' });
    const noBass = comp({ ...settings, lanes: { ...settings.lanes, bass: false } });
    expect(bassist).toEqual(withBass);
    // The switched-off bass is a different band: the guitar covers the bottom itself.
    expect(noBass).not.toEqual(withBass);
});

it('never trades with your own lane: its turns would be silence', () => {
    const base: BandSettings = {
        ...DEFAULT_SETTINGS,
        style: 'jazz',
        seed: 'trade',
        lanes: { drums: true, bass: true, comp: true, lead: true },
        trade: { with: 'lead', bars: 4, choruses: null },
    };
    const traded = (s: BandSettings) =>
        timeline.bars.some((_, i) => leadRoleAt(timeline, s, true, i, 1).kind === 'trade');
    expect(traded(base)).toBe(true);
    expect(traded({ ...base, you: 'lead' })).toBe(false);
    const drums: BandSettings = { ...base, trade: { with: 'drums', bars: 4, choruses: null } };
    expect(traded(drums)).toBe(true);
    expect(traded({ ...drums, you: 'drums' })).toBe(false);
    // Heard again (`you: null`), the trade comes back.
    expect(traded({ ...base, you: null })).toBe(true);
});

describe('the hole holds on every path a pass takes', () => {
    const all: BandSettings['lanes'] = { drums: true, bass: true, comp: true, lead: true };
    // A bridge the chart says has no bass: the arrangement holds for the phantom too.
    const sectionMuted = structuredClone(FIXTURES.rhythmChanges);
    sectionMuted.sections[1].instruments = { bass: false };
    const charts = { ending: FIXTURES.blues, fermata: FIXTURES.awkward, sectionMute: sectionMuted };
    for (const style of ['blues', 'jazz', 'country', 'acoustic'] as const) {
        for (const [name, chart] of Object.entries(charts)) {
            const tl = compileTimeline(chart);
            for (const you of LANES) {
                it(`${style}, ${name}, you on ${you}: to its end, and resumed mid-pass`, () => {
                    const settings: BandSettings = {
                        ...DEFAULT_SETTINGS,
                        style,
                        seed: 'paths',
                        lanes: all,
                    };
                    // Not looping: the held ending and its fermatas.
                    const full = performPass(tl, settings, { pass: 0, looping: false });
                    const holed = performPass(
                        tl,
                        { ...settings, you },
                        { pass: 0, looping: false },
                    );
                    expect(holed.events).toEqual(full.events.filter((e) => e.lane !== you));
                    expect(holed.memory).toEqual(full.memory);
                    if (name === 'sectionMute') {
                        // The bridge (section 1) really has no bass, for the band and the phantom.
                        const bridge = new Set(
                            tl.bars.filter((b) => b.visit.sectionIndex === 1).map((b) => b.index),
                        );
                        expect(bridge.size).toBeGreaterThan(0);
                        expect(
                            full.events.some((e) => e.lane === 'bass' && bridge.has(e.bar)),
                        ).toBe(false);
                    }
                    // A chunk resumed at a barline from its snapshot (a settings change, #1665).
                    const from = Math.min(3, tl.bars.length - 1);
                    const window = { from, to: tl.bars.length, origin: 0 };
                    const until = Math.min(from + 2, tl.bars.length);
                    const chunk = (s: BandSettings, memory: typeof full.memory) =>
                        performPass(tl, s, { pass: 0, looping: true, memory, window, until });
                    const fullChunk = chunk(settings, full.snapshots[from]);
                    expect(fullChunk.events.length).toBeGreaterThan(0);
                    const holedChunk = chunk({ ...settings, you }, holed.snapshots[from]);
                    expect(holedChunk.events).toEqual(
                        fullChunk.events.filter((e) => e.lane !== you),
                    );
                    expect(holedChunk.memory).toEqual(fullChunk.memory);
                });
            }
        }
    }
});

it('every style that covers for a missing bass keeps its band shapes under a bassist', () => {
    // Each of these comps plays something of its own where no bass is (`alone`, the boom, the
    // thumb): a bassist must get the band they play in, not that one.
    for (const [style, comp] of [
        ['blues', 'guitar'],
        ['country', 'guitar'],
        ['acoustic', 'guitar'],
        ['bossa', 'nylon'],
    ] as const) {
        const settings: BandSettings = {
            ...DEFAULT_SETTINGS,
            style,
            comp,
            seed: 'alone',
            lanes: { drums: true, bass: true, comp: true, lead: false },
        };
        const compOf = (s: BandSettings) =>
            performPass(timeline, s, { pass: 0, looping: true }).events.filter(
                (e) => e.lane === 'comp',
            );
        const band = compOf(settings);
        expect(compOf({ ...settings, you: 'bass' }), style).toEqual(band);
        expect(
            compOf({ ...settings, lanes: { ...settings.lanes, bass: false } }),
            style,
        ).not.toEqual(band);
    }
});
