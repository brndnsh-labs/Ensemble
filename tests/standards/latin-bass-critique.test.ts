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

// S4 routing critique: genreFeel='Latin' with bass style='smart' must resolve
// to 'walking-ska' via SMART_BASS_STYLE_MAP (config.ts:114). Before this story
// Latin silently fell through to fallback 'rock'. Note: 'walking-ska' is the
// ship-now floor — a dedicated 'tumbao' style (2&-3 anticipation, root/5 lower
// neighbor) is deferred to a future story per S4 partial-ship guidance.
//
// The walking-ska pattern: 8ths firing, with patternIndex (intBeat % 4) cycling
// root → 5th → 6th → octave on each beat. That gives a bouncy R-5-6-8 melodic
// signature distinct from rock's root-anchored 8ths.
describe('Latin Bassist Critique (Smart routing → walking-ska)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 130 },
            groove: {
                genreFeel: 'Latin',
                lastDrumPreset: 'Latin/Salsa',
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

        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            // Pass 'smart' so SMART_BASS_STYLE_MAP routing is exercised end-to-end.
            const active = isBassActive(getState(), 'smart', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'smart',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({
                        step: globalStep,
                        loopStep: globalStep % 16,
                        info,
                        note,
                        chord: chordC,
                    });
                    prevFreq = note.freq || 0;
                }
            }
        }
        return performance;
    };

    it('should route Latin away from rock (8th-note ska pattern fires unconditionally)', () => {
        // Walking-ska fires every 8th at BPMs ≤ 185 (no 0.4 intensity gate like rock).
        // 16 bars × 8 eighths = 128 hits expected at low intensity, where rock would
        // drop most off-beats. This is the cleanest "not rock" signal.
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.25, complexity: 0.3, bpm: 130 },
        });

        console.log(`[Latin Routing] Low-intensity hits: ${performance.length}`);
        // Walking-ska is unconditional 8ths at this BPM → 128 hits. Rock at
        // intensity 0.25 would null 60% of off-beats, dropping count below 80.
        // Floor of 110 cleanly separates the two regimes.
        expect(performance.length).toBeGreaterThan(110);
    });

    it('should cycle through R-5-6-8 melodic pattern (walking-ska signature)', () => {
        // At low intensity (no melodic variation branch), walking-ska deterministically
        // plays root on beat 1, 5th on beat 2, 6th on beat 3, octave on beat 4.
        // The 'and' between each fires the same target as the preceding beat.
        // We expect ALL four pitch classes (0, 7, 9, 12→0) to appear within a bar.
        const performance = simulatePerformance(8, {
            playback: { bandIntensity: 0.4, complexity: 0.3, bpm: 130 },
        });

        const pcSet = new Set();
        performance.forEach((p) => {
            pcSet.add(p.note.midi % 12);
        });

        console.log(
            `[Latin Routing] Pitch classes observed: ${Array.from(pcSet).sort().join(',')}`,
        );
        // Root (0), 5th (7), 6th (9) — octave collapses to root pc. At least three
        // distinct pcs (0, 7, 9) prove the R-5-6-8 cycle is firing. Rock would yield
        // only {0} with rare 5th excursions at high intensity.
        //
        // NOTE: {0,7,9} is the walking-ska fingerprint specifically. When the
        // dedicated 'tumbao' style ships per the deferred S4 follow-up, this
        // assertion should swap to {0,7,11} (root, 5th, lower-neighbor / leading
        // tone) to reflect the tumbao idiom. A failure here after a tumbao swap
        // is expected and means the assertion needs updating, not that the
        // engine regressed.
        expect(pcSet.has(0)).toBe(true);
        expect(pcSet.has(7)).toBe(true);
        expect(pcSet.has(9)).toBe(true);
    });

    it('should anchor the downbeat on the root', () => {
        // patternIndex = intBeat % 4; beat 0 → interval 0 (root). Every measure
        // start in the walking-ska branch is unambiguously the root.
        const performance = simulatePerformance(16);

        const downbeats = performance.filter((p) => p.info.isMeasureStart);
        const rootDownbeats = downbeats.filter((p) => p.note.midi % 12 === 0).length;

        console.log(`[Latin Routing] Downbeat roots: ${rootDownbeats}/${downbeats.length}`);
        // High-intensity variation branch (intensity > 0.6, 40% chance) could swap
        // the downbeat to a scale tone — at intensity 0.5 that branch is dormant
        // and every downbeat is a clean root.
        expect(rootDownbeats).toBe(downbeats.length);
    });

    it('should keep the bass in the deep register', () => {
        const performance = simulatePerformance(16);

        performance.forEach((p) => {
            // Bass slot: 23-57 per CLAUDE.md register slotting.
            expect(p.note.midi).toBeGreaterThanOrEqual(23);
            expect(p.note.midi).toBeLessThanOrEqual(57);
        });
        console.log(`[Latin Routing] Register OK across ${performance.length} hits`);
    });
});
