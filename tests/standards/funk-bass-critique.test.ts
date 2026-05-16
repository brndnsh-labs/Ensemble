// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Bass Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 },
            groove: { genreFeel: 'Funk', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ busySteps: 0 }),
            arranger: { timeSignature: '4/4', totalSteps: numBars * 16 },
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 48, quality: '7', beats: 4, intervals: [0, 4, 7, 10] };
        const tsConfig = TIME_SIGNATURES['4/4'];
        const performance = [];
        let lastMidi = null;

        for (let i = 0; i < numBars * 16; i++) {
            const stepInMeasure = i % 16;
            // Build full stepInfo so engine lanes that read isBackbeat/isOffbeat/mStep fire,
            // not the 4/4-only fallback formulas (smell (e) fix; aligns with funk-drummer fix).
            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'smart', i, stepInMeasure, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    lastMidi ? getFrequency(lastMidi) : 440,
                    48,
                    'smart',
                    0,
                    i,
                    stepInMeasure,
                    {},
                    info,
                );

                if (note) {
                    performance.push({ step: i, stepInMeasure, info, note, chord: chordC });
                    lastMidi = note.midi;
                }
            }
        }
        return performance;
    };

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const totalMeasures = 128;
        const performance = simulatePerformance(totalMeasures);

        let ghostNotes = 0;
        let downbeatHits = 0;
        let octaveJumps = 0;
        let prevMidi = null;

        performance.forEach((p) => {
            const midi = p.note.midi;
            if (p.stepInMeasure === 0) {
                downbeatHits++;
                expect(midi % 12).toBe(p.chord.rootMidi % 12);
            }
            if (p.note.muted) {
                ghostNotes++;
            }
            if (prevMidi !== null) {
                const interval = Math.abs(midi - prevMidi);
                if (interval === 12 || interval === 24) {
                    octaveJumps++;
                }
            }
            prevMidi = midi;
        });

        const totalActive = performance.length;
        const downbeatRatio = downbeatHits / totalMeasures;
        const ghostRatio = ghostNotes / totalActive;
        const octaveRatio = octaveJumps / totalMeasures;

        console.log(
            '\n--- FUNK BASS CRITIQUE REPORT ---\n' +
                `[The One Solidity]      ${(downbeatRatio * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Ghost Note Density]    ${(ghostRatio * 100).toFixed(1)}% (Target: 16-28%)\n` +
                `[Octave Pop Frequency]  ${octaveRatio.toFixed(2)} jumps/bar (Target: >2.5)\n` +
                '------------------------------------\n',
        );

        // The One: deterministic root on every bar downbeat (per bass-engine.ts:439, 509)
        expect(downbeatRatio).toBe(1.0);
        // Ghost density: engine fires chuckProb = 0.2 + intensity*0.4 = 0.56 on 16th offbeats.
        // Observed 17.5-19.7% across 10 runs; tightened from <0.4 to <0.28 (~8pt headroom).
        expect(ghostRatio).toBeGreaterThan(0.15);
        expect(ghostRatio).toBeLessThan(0.28);
        // Octave pops: engine fires popProb = 0.6 + intensity*0.4 = 0.96 on 4 "ands"/bar,
        // each ~1 octave above the prior root. Observed 3.38-3.76/bar across 10 runs;
        // tightened from >0.3 (12x too loose) to >2.5 (still ~0.9x worst-case headroom).
        expect(octaveRatio).toBeGreaterThan(2.5);
    });

    it('should suppress octave pops at low intensity', () => {
        // At intensity < 0.4 the rock/funk no-kick branch (bass-engine.ts:444-456)
        // returns null 60% of the time on non-downbeats and ghosts the rest, so the
        // engine should no longer fire the pop-prob ladder.
        const highPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 },
        });
        const lowPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.3, bpm: 110, complexity: 0.3 },
        });

        const countOctaves = (perf) => {
            let jumps = 0;
            let prev = null;
            perf.forEach((p) => {
                if (prev !== null) {
                    const interval = Math.abs(p.note.midi - prev);
                    if (interval === 12 || interval === 24) {
                        jumps++;
                    }
                }
                prev = p.note.midi;
            });
            return jumps;
        };

        const highJumps = countOctaves(highPerf);
        const lowJumps = countOctaves(lowPerf);
        const ratio = lowJumps === 0 ? Infinity : highJumps / lowJumps;
        console.log(
            `[Funk Intensity Scaling] octave jumps high=${highJumps} low=${lowJumps} ratio=${ratio.toFixed(2)}`,
        );

        // High intensity should produce at least 3x more octave pops than low.
        expect(highJumps).toBeGreaterThan(60); // ~3.5/bar over 32 bars
        expect(lowJumps).toBeLessThan(highJumps / 3);
    });
});
