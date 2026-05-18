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

// S4 routing critique: genreFeel='Shred' with bass style='smart' must resolve
// to 'metal' via SMART_BASS_STYLE_MAP (config.ts:114). Before this story Shred
// silently fell through to fallback 'rock'. The tests below assert two things:
// (1) the routing is no longer rock (rock-style 16ths never fire), and (2) the
// metal-bass floor is in effect (8th-note pedal + gallop 16ths at high intensity).
//
// Companion test: metal-bass-critique.test.ts exercises the metal style
// directly with style='metal'. This file is routing-only and intentionally
// trails metal-bass-critique's density floor by ~12pt (>0.6 vs >0.72) so a
// tightening there doesn't cascade here. If you tighten this file, confirm
// you're tightening for routing reasons, not engine reasons.
describe('Shred Bassist Critique (Smart routing → metal)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 140 },
            groove: {
                genreFeel: 'Shred',
                creativity: true,
                lastDrumPreset: 'Metal (Speed)',
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

        const chordC = { rootMidi: 36, intervals: [0, 3, 7], quality: 'm', beats: 4 };
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
                    36,
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
                    });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should route Shred away from rock (16th-note hits prove metal branch)', () => {
        // Rock style fires only on 8ths (step % 2 === 0). If Shred → rock (the
        // pre-S4 bug), then NO 16th-subdivision steps (odd) would have hits.
        // Metal fires 8ths AND gallop 16ths at intensity > 0.6, so we expect
        // a non-trivial count of odd-step hits.
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.85, complexity: 0.7, bpm: 140 },
        });

        const sixteenthHits = performance.filter((p) => p.step % 2 !== 0).length;
        console.log(`[Shred Routing] 16th-subdivision hits: ${sixteenthHits}`);

        // 16 bars × 8 odd-step opportunities = 128. With gallopProb ≈ 0.5+0.7*0.4 ≈ 0.78
        // the engine fires ~100 across runs. Floor of 20 leaves ample headroom while
        // making this an unambiguous "not rock" signal (rock would yield 0).
        expect(sixteenthHits).toBeGreaterThan(20);
    });

    it('should anchor on the root at intensity 0.6 (shared floor — not a not-rock signal)', () => {
        // NOTE: at intensity 0.6, BOTH rock and metal anchor 100% on root
        // (rock's 5th/octave variation is gated to higher intensity; metal's
        // chromatic neighbors are gated to intensity > 0.75). This test is
        // therefore a regression guard on the shared floor, NOT proof that
        // routing landed on metal. The "not rock" signal lives in the
        // 16th-subdivision test above (rock never fires odd-step hits).
        const performance = simulatePerformance(16);

        let rootHits = 0;
        performance.forEach((p) => {
            if (p.note.midi % 12 === 0) {
                rootHits++;
            }
        });

        const ratio = rootHits / (performance.length || 1);
        console.log(`[Shred Routing] Root grounding: ${(ratio * 100).toFixed(1)}%`);
        // Metal at intensity 0.6 is deterministic 100% root (matches metal-bass-critique).
        expect(ratio).toBe(1.0);
    });

    it('should deliver high hit density at maximum intensity (gallop signature)', () => {
        // The metal branch fires 100% of 8ths + ~86% of 16ths × ~91% chord-tone
        // selection at intensity 0.95. Rock-bass tops out at 50% (8ths only).
        // A density > 0.6 therefore is a strict rock-rejection signal.
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.9, bpm: 140 },
        });

        const totalSteps = 16 * 16;
        const hitDensity = performance.length / totalSteps;
        console.log(`[Shred Routing] Max-intensity hit density: ${(hitDensity * 100).toFixed(1)}%`);

        // Mirrors metal-bass-critique's >0.72 threshold; >0.6 is the absolute
        // rock-rejection floor (rock-bass can never exceed 50%).
        expect(hitDensity).toBeGreaterThan(0.6);
    });

    it('should scale density with intensity', () => {
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.3, complexity: 0.3, bpm: 140 },
        });
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.9, bpm: 140 },
        });
        const ratio = high.length / low.length;
        console.log(
            `[Shred Routing] Density scaling: low=${low.length} high=${high.length} ratio=${ratio.toFixed(2)}`,
        );
        // High should be at least 1.6x denser than low — the canonical metal signature
        // (mirrors metal-bass-critique).
        expect(ratio).toBeGreaterThan(1.6);
    });
});
