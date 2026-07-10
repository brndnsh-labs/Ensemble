// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHarmonyMemory, getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// why: epic-deterministic-phrasing S5. The 8 Math.random() call sites in
// harmonies.ts (response trigger, melodic-shadow reinforce, hype-man push,
// busy-suppression, accompaniment/bass collision yield, anchor-tutti latch,
// per-voice timing jitter) all flipped raw coins in otherwise-seeded harmony
// logic, making antiphonal response and density flake across loops. Each is
// now seeded via a scrambleHash of (motif.seed | chord.rootMidi, step, tag).
//
// This test confirms two identical runs over a 128-bar passage produce
// bit-identical harmony output. It also stubs Math.random() to a fixed value
// to mask any *other* RNG sources (e.g. the comping-pattern picker, drum
// engines reached via mocks) — proving the harmony engine alone is the source
// of determinism, not test setup.

describe('Harmony Determinism (S5)', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, currentLoopCount: 1 },
            groove: {
                genreFeel: 'Jazz',
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
            chords: { style: 'smart' },
        };
        getState.mockReturnValue(mockState);
        clearHarmonyMemory(mockState);
    });

    // why: stubbing Math.random() to the same value across both runs would make
    // any test pass trivially. By stubbing to DIFFERENT values per run (0.05 vs
    // 0.95 — bracketing all eight probability thresholds in the file: 0.3, 0.4,
    // 0.5, 0.6, plus the variable response/reinforce/push probabilities which
    // clamp into [0, 1]), we prove the harmony engine's output is independent
    // of Math.random altogether. Any surviving Math.random() call would land on
    // different sides of any threshold between 0.05 and 0.95, causing divergence.

    const chordC = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
    const totalMeasures = 64;
    const totalSteps = totalMeasures * 16;

    const collectRun = (stubValue: number, ctx: any) => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(stubValue);
        try {
            mockState.harmony.lastMidis = [];
            clearHarmonyMemory(mockState);
            const events: Array<{ step: number; midis: number[] }> = [];
            for (let i = 0; i < totalSteps; i++) {
                const stepInMeasure = i % 16;
                const notes = getHarmonyNotes(
                    getState(),
                    chordC,
                    null,
                    i,
                    64,
                    'smart',
                    stepInMeasure,
                    null,
                    {
                        soloistPhraseEnd: stepInMeasure === 0,
                        soloistActive: false,
                        ...ctx,
                    },
                );
                if (notes.length > 0) {
                    events.push({ step: i, midis: notes.map((n) => n.midi) });
                }
            }
            return events;
        } finally {
            spy.mockRestore();
        }
    };

    // why: each fixture flips a different branch in playShadowMode / playComperMode
    // / finalizeHarmonyNotes, covering all 8 seeded sites across the suite.
    const fixtures: Array<{
        name: string;
        bandIntensity: number;
        seedNotes: Array<{ step: number; isAnchor: boolean; midi: number }> | null;
        ctx: any;
    }> = [
        {
            name: 'baseline (tags 1, 8: response + timing-jitter)',
            bandIntensity: 0.6,
            seedNotes: null,
            ctx: { soloistResting: true, soloistNotesInPhrase: 0 },
        },
        {
            name: 'soloist seed populated (tags 2, 3: reinforce + hype-man)',
            bandIntensity: 0.6,
            // 16 anchored seed notes across the 16-step loop ensure tag 2's
            // reinforceProb branch and tag 3's hype-man branch are both reached.
            seedNotes: Array.from({ length: 16 }, (_, k) => ({
                step: k,
                isAnchor: k % 4 === 0,
                midi: 60 + (k % 12),
            })),
            ctx: { soloistResting: true, soloistNotesInPhrase: 0 },
        },
        {
            name: 'soloist busy + accomp/bass hits (tags 4, 5, 6: yield gates)',
            bandIntensity: 0.6,
            seedNotes: null,
            ctx: {
                soloistResting: false,
                soloistNotesInPhrase: 5,
                soloistBusy: true,
                accompanimentHit: true,
                bassHit: true,
            },
        },
        {
            name: 'high intensity + isLatched anchor (tag 7: anchor-tutti)',
            bandIntensity: 0.95,
            // Latched anchor: a seedNote whose step matches the early stepInLoop;
            // when reached the path returns isLatched=true to finalizeHarmonyNotes
            // which then hits the tag-7 coin.
            seedNotes: [{ step: 0, isAnchor: true, midi: 67 }],
            ctx: { soloistResting: true, soloistNotesInPhrase: 0 },
        },
    ];

    for (const fixture of fixtures) {
        it(`bit-identical across stubs 0.05/0.95 — ${fixture.name}`, () => {
            mockState.playback.bandIntensity = fixture.bandIntensity;
            mockState.soloist.session.seed = fixture.seedNotes
                ? { notes: fixture.seedNotes, loopLengthSteps: 16 }
                : null;

            const run1 = collectRun(0.05, fixture.ctx);
            const run2 = collectRun(0.95, fixture.ctx);

            console.log(
                `\n--- HARMONY DETERMINISM (S5): ${fixture.name} ---\n` +
                    `[Run 1 events]  ${run1.length}\n` +
                    `[Run 2 events]  ${run2.length}\n` +
                    `[Bit-identical] ${JSON.stringify(run1) === JSON.stringify(run2)}\n` +
                    '----------------------------------\n',
            );

            expect(run1.length).toBeGreaterThan(0);
            expect(run1).toEqual(run2);
        });
    }
});
