// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Neo-Soul',
                creativity: true,
                lastDrumPreset: 'Neo-Soul',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'neo', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'neo',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                    if (globalStep < 32) {
                        console.log(`Step ${globalStep}: MIDI ${note.midi}`);
                    }
                }
            }
        }
        return performance;
    };

    it('should implement heavy "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / performance.length;

        console.log(`[Neo-Soul Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.9);
    });

    it('should stay grounded in the deep register', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.5 } });

        // Deep register for 5-string player includes B and E strings, and the A string root (up to MIDI 38)
        const deepNotes = performance.filter((p) => p.note.midi <= 38);
        const ratio = deepNotes.length / performance.length;

        console.log(`[Neo-Soul Critique] Deep Register Ratio: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.75);
    });

    it('should implement syncopated "hammer-ons" at high complexity', () => {
        // The neo-soul bass engine (bass-engine.ts:399-431) fires anchors on the
        // downbeat and beat 3, then on the 8th-note "& of each beat" picks
        // probabilistically between root, 5th, and a "hammer-on" interval — a
        // half or whole step above the root with shortened duration (0.2). That
        // is the genre-defining ornament the test name claims to enforce.
        //
        // The previous metric just counted `p.info.mStep % 4 !== 0` and asserted
        // `> 5` over 16 bars (0.3 syncopated notes per bar). That captures "any
        // note not on a beat start," not "syncopated hammer-ons" — a root on
        // step 6 and a hammer-on on step 6 both incremented the same counter.
        //
        // We now check both halves of the claim: (a) the note lands on a
        // syncopated 8th-note offbeat (steps 2, 6, 10, 14), and (b) the pitch
        // is a half or whole step above the chord root (the hammer-on interval).
        const numBars = 64; // longer simulation for stable rates
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9, complexity: 0.9 },
        });

        const SYNCOPATED_POSITIONS = new Set([2, 6, 10, 14]); // 8th-note "&" of each beat
        const chordRoot = 36;

        const syncopatedHits = performance.filter((p) => SYNCOPATED_POSITIONS.has(p.loopStep));
        const hammerOnHits = syncopatedHits.filter((p) => {
            const interval = (((p.note.midi - chordRoot) % 12) + 12) % 12;
            return interval === 1 || interval === 2;
        });

        const hammerOnRate = hammerOnHits.length / (syncopatedHits.length || 1);
        const hammerOnsPerBar = hammerOnHits.length / numBars;

        console.log(
            `[Neo-Soul Critique] Syncopated 8th-note hits: ${syncopatedHits.length}, ` +
                `of which hammer-ons (root ± half/whole step): ${hammerOnHits.length} ` +
                `(${(hammerOnRate * 100).toFixed(1)}%), ${hammerOnsPerBar.toFixed(2)} per bar`,
        );

        // Engine expectation at intensity 0.9 / complexity 0.9: upbeat hitProb
        // ≈ 0.83; of those hits, the hammer-on branch fires ~30% (rand 0.4-0.7).
        // 4 upbeats/bar × 0.83 × 0.3 ≈ 1 hammer-on/bar. A floor of 0.5/bar gives
        // headroom while still requiring the genre ornament to be audible.
        expect(hammerOnsPerBar).toBeGreaterThan(0.5);
        // And at least some meaningful share of the syncopated hits should be
        // the hammer-on interval — otherwise the engine is producing syncopation
        // without the genre's signature ornament.
        expect(hammerOnRate).toBeGreaterThan(0.15);
    });
});
