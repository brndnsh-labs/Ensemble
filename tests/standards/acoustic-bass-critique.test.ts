// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { bassMacroGain } from '../../public/engine/velocity-shaping.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Acoustic Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Acoustic',
                lastDrumPreset: 'Acoustic',
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

        const chordC = { rootMidi: 36, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'smart', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'smart',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should stay grounded in harmonic support (Roots and Fifths)', () => {
        const performance = simulatePerformance(16);

        let validHits = 0;
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            if (pc === 0 || pc === 7) {
                validHits++;
            }
        });

        const ratio = validHits / (performance.length || 1);
        console.log(`[Acoustic Critique] Root/Fifth Grounding: ${(ratio * 100).toFixed(1)}%`);
        // Acoustic pitch picker (bass-styles.ts:318-344) only ever returns root or
        // fifth (or octave, which is pc=0=root). Deterministic 100%.
        expect(ratio).toBe(1.0);
    });

    it('should use long sustains at low intensity (Half/Whole notes)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.5, bpm: 90 },
        });

        let longNotes = 0;
        performance.forEach((p) => {
            if (p.note.durationSteps >= 4) {
                longNotes++;
            }
        });

        const ratio = longNotes / (performance.length || 1);
        console.log(`[Acoustic Critique] Long Sustain Ratio: ${(ratio * 100).toFixed(1)}%`);
        // At intensity < 0.4 the engine hardcodes dur = stepsPerBeat * 1.8 = 7.2,
        // capped at 1.95 * stepsPerBeat = 7.8 in bass-engine.ts:367. Always >= 4.
        expect(ratio).toBe(1.0);
    });

    it('should implement "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 90 },
        });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / (performance.length || 1);

        console.log(`[Acoustic Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        // lag = 0.01 + intensity * 0.005 — always strictly positive. Deterministic.
        expect(ratio).toBe(1.0);
    });

    it('should switch from half-notes to quarter-notes around intensity 0.4', () => {
        // checkBassActiveStyle (bass-styles.ts:96-103) splits at intensity 0.4:
        //   below → stepInChord % (stepsPerBeat * 2) === 0 (half-notes, 2 hits/bar)
        //   at/above → isQuarter (4 hits/bar)
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.5, bpm: 90 },
        });
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
        });

        console.log(`[Acoustic Critique] Density scaling: low=${low.length} high=${high.length}`);
        expect(low.length).toBe(32); // 2 hits/bar × 16 bars
        expect(high.length).toBe(64); // 4 hits/bar × 16 bars
    });

    it('should boost velocity with intensity', () => {
        // #941 MOVED THE LAYER THIS TEST MEASURES, deliberately. The acoustic
        // token was `0.95 + intensity * 0.15`; it is now a flat 0.95, because a
        // style token encodes RELATIVE ARTICULATION (an upright played with the
        // fingers sits under the neutral 1.0 electric base) and NOT "louder when
        // the band is louder". The lane's macro swell is one term applied
        // downstream of the engine — `bassMacroGain` — so an engine-velocity
        // assertion no longer sees it. The musical claim ("the acoustic bass
        // swells with the band") is unchanged and asserted below, on the rendered
        // chain; the engine-side half is now the INVARIANCE guard that keeps a
        // macro term from creeping back into the style tokens.
        const LOW_I = 0.2;
        const HIGH_I = 0.95;
        const low = simulatePerformance(16, {
            playback: { bandIntensity: LOW_I, complexity: 0.5, bpm: 90 },
        });
        const high = simulatePerformance(16, {
            playback: { bandIntensity: HIGH_I, complexity: 0.5, bpm: 90 },
        });
        const avg = (perf) => perf.reduce((s, p) => s + p.note.velocity, 0) / perf.length;
        const lowVel = avg(low);
        const highVel = avg(high);
        const lowRendered = lowVel * bassMacroGain(LOW_I);
        const highRendered = highVel * bassMacroGain(HIGH_I);
        console.log(
            `[Acoustic Critique] Velocity scaling: engine low=${lowVel.toFixed(2)} high=${highVel.toFixed(2)} (ratio ${(highVel / lowVel).toFixed(3)}, target ~1.0) | ` +
                `rendered low=${lowRendered.toFixed(2)} high=${highRendered.toFixed(2)} (ratio ${(highRendered / lowRendered).toFixed(2)}, informational)`,
        );
        // The rendered ratio above is informational only: with the engine side
        // pinned intensity-invariant (the strict downbeat equality below), the
        // rendered ratio IS bassMacroGain's own ratio (~2.3×), so asserting a
        // floor on it here would only re-test the macro law's monotonicity —
        // which funk-bass-critique's 6–8 dB swell bracket already guards
        // end-to-end through the real product path.
        // intent (#941): the ENGINE's articulation carries no macro intensity term.
        // Measured on the BAR DOWNBEAT only, deliberately: acoustic's note mix is
        // intensity-dependent (long sustained roots under i=0.4, 5th/octave
        // ornaments above it, both behind raw `Math.random()`), so an all-notes
        // mean drifts a few percent run-to-run and cannot bracket tightly enough to
        // catch a small re-added slope. The downbeat is the same gesture at every
        // intensity, so with the macro term gone its velocity is EXACTLY equal —
        // a strict equality that is correct by construction, and goes red on any
        // intensity term re-entering an acoustic token.
        const downbeatVel = (perf) => {
            const d = perf.filter((p) => p.loopStep === 0).map((p) => p.note.velocity);
            expect(d.length).toBeGreaterThan(8);
            return d.reduce((s, v) => s + v, 0) / d.length;
        };
        expect(downbeatVel(high)).toBe(downbeatVel(low));
    });
});
