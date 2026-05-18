// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Reggae', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Reggae skank performance', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'minor',
            intervals: [0, 3, 7],
            freqs: [261.63, 311.13, 392.0],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;

        // Genre-defining positions, not exclusions. The original metric was
        // `stepInMeasure !== 0 && stepInMeasure !== 8` — i.e. "not silent on the
        // two downbeats." That counts a stab on step 5 (no reggae meaning) the
        // same as a stab on step 4 (the actual skank). We now check the real
        // reggae piano lanes (live path: `accompaniment.ts` reggae branch in
        // `getAccompanimentNotes`, around line 1899 post-S5):
        //   • Skanks: backbeat starts — 16th-steps 4 and 12 (beats 2 and 4)
        //   • Bubbles: 8th-note "&" of every beat — 16th-steps 2, 6, 10, 14
        //     (post-S5 the chord channel no longer emits these — bubble moved
        //     to harmony channel per FOLLOWUPS.md; tracker keeps the position
        //     set for the overlap-counter check)
        //   • Non-reggae: 0, 1, 3, 5, 7, 8, 9, 11, 13, 15 (downbeats and
        //     16th-note offbeats — the engine's reggae lane should never land
        //     here)
        //
        // The previous version also passed `{ isBeatStart: ... }` as the
        // stepInfo object, which lacked the `isBackbeat` property the engine's
        // skank lane checks — silencing the skank lane entirely. We now build
        // a real stepInfo via `getStepInfo`.
        const SKANK_POSITIONS = new Set([4, 12]);
        const BUBBLE_POSITIONS = new Set([2, 6, 10, 14]);
        const ts = TIME_SIGNATURES['4/4'];

        let skankHits = 0;
        let bubbleHits = 0;
        let offGenreHits = 0;
        let totalStabs = 0;
        let measuresWithBothSkanks = 0;
        let measuresWithOverlap = 0; // S5: bars that fire BOTH a skank AND a bubble

        for (let m = 0; m < totalMeasures; m++) {
            let sawStep4 = false;
            let sawStep12 = false;
            let barSkankHits = 0;
            let barBubbleHits = 0;
            for (let s = 0; s < 16; s++) {
                const i = m * 16 + s;
                mockState.playback.step = i;
                const info = getStepInfo(i, ts, [], TIME_SIGNATURES);
                const notes = getAccompanimentNotes(getState(), chordC, i, s, s, info, {});
                if (notes.length > 0 && notes[0].midi > 0) {
                    totalStabs++;
                    if (SKANK_POSITIONS.has(s)) {
                        skankHits++;
                        barSkankHits++;
                        if (s === 4) {
                            sawStep4 = true;
                        }
                        if (s === 12) {
                            sawStep12 = true;
                        }
                    } else if (BUBBLE_POSITIONS.has(s)) {
                        bubbleHits++;
                        barBubbleHits++;
                    } else {
                        offGenreHits++;
                    }
                }
            }
            if (sawStep4 && sawStep12) {
                measuresWithBothSkanks++;
            }
            if (barSkankHits > 0 && barBubbleHits > 0) {
                measuresWithOverlap++;
            }
        }

        const skankRate = skankHits / (totalMeasures * 2); // 2 expected per bar
        const offGenreRate = offGenreHits / (totalStabs || 1);
        const bothSkanksRate = measuresWithBothSkanks / totalMeasures;
        const overlapRate = measuresWithOverlap / totalMeasures;
        const density = totalStabs / totalMeasures;

        console.log(
            '\n--- REGGAE PIANO CRITIQUE REPORT ---\n' +
                `[Skank Coverage]        ${(skankRate * 100).toFixed(1)}% of expected ` +
                `skank hits (Target: >90%)\n` +
                `[Both-Skank Bars]       ${(bothSkanksRate * 100).toFixed(1)}% of bars hit ` +
                `both skank positions (Target: >90%)\n` +
                `[Off-Genre Hits]        ${(offGenreRate * 100).toFixed(1)}% of stabs land ` +
                `on non-reggae positions (Target: <10%)\n` +
                `[Same-Bar Overlap]      ${(overlapRate * 100).toFixed(1)}% of bars fire ` +
                `BOTH skank AND bubble (Target: 0%)\n` +
                `[Bubble Hits]           ${bubbleHits} (filler 16th-offbeats; informational)\n` +
                `[Rhythmic Density]      ${density.toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        // Real assertions: skanks land where reggae says they should, and the engine
        // does not pile up stabs on non-reggae positions (steps 0, 2, 6, 8, 10, 14).
        expect(skankRate).toBeGreaterThan(0.9);
        expect(bothSkanksRate).toBeGreaterThan(0.9);
        expect(offGenreRate).toBeLessThan(0.1);
        expect(density).toBeGreaterThanOrEqual(2.0);
        // S5: lane exclusivity — at low/medium non-organ intensity the engine
        // is in skank-only mode, so zero bars should contain a bubble hit.
        expect(overlapRate).toBe(0);
    });

    // why: epic-chords-voicing.md S5 — intensity does NOT swap the lane on the
    // chord channel. The chord channel = the keyboardist, and the keyboardist
    // in reggae plays the skank at every intensity. High energy is expressed
    // through per-step velocity (`0.4 + intensity*0.4`), not through a lane
    // swap into bubble. Bubble is the organist's job and belongs on the
    // harmony channel (follow-up). This test guards against any future
    // re-introduction of a bubble lane in `getAccompanimentNotes`.
    it('S5: high band intensity on piano keeps the skank lane — zero bubbles', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'minor',
            intervals: [0, 3, 7],
            freqs: [261.63, 311.13, 392.0],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        mockState.playback.bandIntensity = 0.85; // high-energy passage on piano
        const totalMeasures = 64;
        const SKANK_POSITIONS = new Set([4, 12]);
        const BUBBLE_POSITIONS = new Set([2, 6, 10, 14]);
        const ts = TIME_SIGNATURES['4/4'];

        let skankHits = 0;
        let bubbleHits = 0;

        for (let m = 0; m < totalMeasures; m++) {
            for (let s = 0; s < 16; s++) {
                const i = m * 16 + s;
                mockState.playback.step = i;
                const info = getStepInfo(i, ts, [], TIME_SIGNATURES);
                const notes = getAccompanimentNotes(getState(), chordC, i, s, s, info, {});
                if (notes.length > 0 && notes[0].midi > 0) {
                    if (SKANK_POSITIONS.has(s)) {
                        skankHits++;
                    } else if (BUBBLE_POSITIONS.has(s)) {
                        bubbleHits++;
                    }
                }
            }
        }

        console.log(`[S5 high-intensity piano] skanks=${skankHits} bubbles=${bubbleHits}`);

        // Skank lane is fully deterministic for this config:
        //   isSkank (backbeat) × isBeatStart × every bar × 64 bars = 128 hits.
        // Tight equality is intentional — any future bar-skip or lane-swap
        // mechanism should fail this test loudly at the point it lands.
        expect(skankHits).toBe(128);
        expect(bubbleHits).toBe(0);
    });
});
