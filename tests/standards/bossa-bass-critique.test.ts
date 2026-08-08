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

describe('Bossa Nova Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 120 },
            groove: {
                genreFeel: 'Bossa Nova',
                lastDrumPreset: 'Bossa Nova',
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
            const active = isBassActive(getState(), 'bossa', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'bossa',
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

    it('should implement the authentic Bossa rhythm (1, &2, 3, &4)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 120 },
        });

        let correctSteps = 0;
        performance.forEach((p) => {
            const s = p.loopStep;
            if ([0, 6, 8, 14].includes(s)) {
                correctSteps++;
            }
        });

        const ratio = correctSteps / performance.length;
        console.log(`[Bossa Critique] Rhythmic Accuracy: ${(ratio * 100).toFixed(1)}%`);

        // Bossa active pattern hard-codes steps 0, 6, 8, 14 (bass-styles.ts:31-39).
        // Engine returns null on every other step. Deterministic 100%.
        expect(ratio).toBe(1.0);
        expect(performance.length).toBe(64); // 4 hits/bar × 16 bars
    });

    it('should alternate Root and Fifth between downbeats and upbeats', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        let rootHits = 0;
        let fifthHits = 0;

        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            if (p.loopStep === 0 || p.loopStep === 8) {
                if (pc === 0) {
                    rootHits++;
                }
            } else if (p.loopStep === 6 || p.loopStep === 14) {
                if (pc === 7) {
                    fifthHits++;
                }
            }
        });

        console.log(
            `[Bossa Critique] Root Consistency: ${rootHits}/32, Fifth Consistency: ${fifthHits}/32`,
        );

        // Pitch class on the named positions should be stable across all 16 bars
        // (octave displacement preserves PC; only the voicing breathes).
        expect(rootHits).toBe(32);
        expect(fifthHits).toBe(32);
    });

    it('should breathe across bars rather than repeating a single voicing for 16 bars', () => {
        // Real bossa players octave-displace the root or fifth occasionally so the line
        // doesn't read as "MIDI demo file." The engine should produce more than one distinct
        // bar-shape over a 16-bar static-chord stretch.
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        // Group notes into bars (loopStep 0–15) and stringify each bar's MIDI sequence.
        const barShapes = new Map(); // step→midi signature per bar
        performance.forEach((p) => {
            const barIdx = Math.floor(p.step / 16);
            if (!barShapes.has(barIdx)) {
                barShapes.set(barIdx, []);
            }
            barShapes.get(barIdx).push(`${p.loopStep}:${p.note.midi}`);
        });
        const distinctShapes = new Set();
        for (const seq of barShapes.values()) {
            distinctShapes.add(seq.join(','));
        }

        console.log(
            `[Bossa Critique] Distinct bar shapes over ${barShapes.size} bars: ${distinctShapes.size}`,
        );

        // At least 3 distinct shapes across 16 bars — a meaningful amount of variation
        // without losing the bossa identity. Anything ≤ 1 means the bass is mechanical.
        expect(distinctShapes.size).toBeGreaterThanOrEqual(3);
    });

    it('should implement "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.8, complexity: 0.5, bpm: 120 },
        });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / performance.length;

        console.log(`[Bossa Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        // lag = 0.01 + intensity * 0.005 is always strictly positive. Deterministic.
        expect(ratio).toBe(1.0);
    });

    it('should scale velocity and lay-back with intensity', () => {
        // Bossa keeps density constant across intensity (always 4 hits/bar).
        // The intensity axis is loudness and lay-back (0.01 + intensity*0.005).
        //
        // #941 moved WHERE the loudness axis lives. Bossa's tokens were
        // `1.1 + intensity*0.1` (downbeat anchors) and `1.0 + intensity*0.15`
        // (offbeat anticipations); they are now flat 1.1 / 1.0. That is the
        // hierarchy `EVEN_ACCENT_BASS_STYLES` exists to protect, and the old
        // slopes were NARROWING it as the band got louder (0.1 apart at i=0,
        // 0.05 at i=1) before the emission clamp flattened both above i≈0.88.
        // The lane's swell is one downstream term now (`bassMacroGain`), so the
        // loudness claim is asserted on the rendered chain and the engine side
        // becomes the invariance guard.
        const LOW_I = 0.2;
        const HIGH_I = 0.95;
        const low = simulatePerformance(8, {
            playback: { bandIntensity: LOW_I, complexity: 0.5, bpm: 120 },
        });
        const high = simulatePerformance(8, {
            playback: { bandIntensity: HIGH_I, complexity: 0.5, bpm: 120 },
        });

        expect(low.length).toBe(high.length); // density constant
        const avgVel = (perf) => perf.reduce((s, p) => s + p.note.velocity, 0) / perf.length;
        const avgLag = (perf) => perf.reduce((s, p) => s + p.note.timingOffset, 0) / perf.length;
        const lowRendered = avgVel(low) * bassMacroGain(LOW_I);
        const highRendered = avgVel(high) * bassMacroGain(HIGH_I);
        console.log(
            `[Bossa Critique] Intensity scaling: engine vel low=${avgVel(low).toFixed(2)} high=${avgVel(high).toFixed(2)} (ratio ${(avgVel(high) / avgVel(low)).toFixed(3)}, target 1.000) | ` +
                `rendered low=${lowRendered.toFixed(2)} high=${highRendered.toFixed(2)} (ratio ${(highRendered / lowRendered).toFixed(2)}, informational), ` +
                `lag low=${avgLag(low).toFixed(3)} high=${avgLag(high).toFixed(3)}`,
        );
        // Rendered ratio is informational only: with engine velocity pinned
        // exactly equal (below), the rendered ratio IS bassMacroGain's own ratio
        // (~2.1×) — a floor here would only re-test the macro law's
        // monotonicity, which funk-bass-critique's 6–8 dB bracket guards
        // end-to-end.
        // intent (#941): bossa's density AND note selection are both intensity-
        // invariant, so with the macro term gone from the tokens the engine's mean
        // velocity is EXACTLY equal at the two intensities — a strict equality is
        // correct here by construction, not a snapshot. Re-introduce any intensity
        // term into a bossa token and this is the assertion that catches it.
        expect(avgVel(high)).toBe(avgVel(low));
        expect(avgLag(high)).toBeGreaterThan(avgLag(low));
    });
});
