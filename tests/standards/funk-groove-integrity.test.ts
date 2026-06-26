// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should assign valid Funk Motifs based on seed and complexity', () => {
        expect(getDrumMotif(((0 * 137 + 0) % 256) / 256, 'Funk', 0.2)).toBe(0); // Low complexity = Standard

        // At high complexity, we expect non-zero motifs depending on the barIndex seed
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Funk', 0.8));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
    });

    describe('Apply Groove Overrides - Funk Motifs', () => {
        const mockState = {
            playback: { bandIntensity: 0.8, bpm: 110, songMode: false },
            groove: {
                genreFeel: 'Funk',
                lastDrumPreset: 'Funk',
                sectionSeedMap: { 1: 0.5 }, // Consistent seed for tests
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            arranger: {
                timeSignature: '4/4',
                stepMap: [{ start: 0, end: 1000, chord: { sectionId: '1' } }],
            },
        };

        const createParams = (step, instName, stepVal = 0) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: mockState.playback,
                groove: mockState.groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isPulse: info.isPulse,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                tsConfig: info.tsConfig,
            };
        };

        it('should play structured ghost notes for Motif 1 (The Funky Drummer)', () => {
            getState.mockReturnValue(mockState);

            // Force a seed that maps to Motif 1 (0.2 - 0.5)
            mockState.groove.sectionSeedMap['1'] = 0.3;

            // #790: the ghost roll is now deterministic (seeded), so the old
            // `vi.spyOn(Math, 'random').mockReturnValue(0.01)` no longer steers
            // it — and pinning one magic step is brittle. Instead scan the bar
            // and assert the STRUCTURAL property: the Funky Drummer lays a spread
            // of quiet Sidestick ghosts on the non-beat 16ths (never on a beat
            // start, always soft). This is the real musical claim.
            const ts44 = TIME_SIGNATURES['4/4'];
            const sidesticks = [];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                const r = applyGrooveOverrides(getState(), createParams(step, 'Snare'));
                if (r.shouldPlay && r.soundName === 'Sidestick') {
                    sidesticks.push({ step, velocity: r.velocity, isBeatStart: info.isBeatStart });
                }
            }

            // The Funky Drummer signature is a spread of QUIET ghosts on the
            // non-beat 16ths — expect several soft ones (a louder syncopation
            // Sidestick may also appear; that's a different, intentional gesture).
            const softGhosts = sidesticks.filter((g) => g.velocity < 0.5);
            expect(softGhosts.length).toBeGreaterThanOrEqual(4);
            // Ghosts/syncopations never clobber a beat start — the downbeats stay
            // clean for the kick and the backbeat crack.
            expect(sidesticks.every((g) => !g.isBeatStart)).toBe(true);
        });

        it('should displace the backbeat for Motif 2 (Cold Sweat Style) — structural per phrase', () => {
            getState.mockReturnValue(mockState);
            // #806: motif 2 (Displaced backbeat) is a loop-2+ behavior (Chorus
            // Evolution holds back The Head); test at the established-feel loop.
            // Restored to 0 at the end so the shared mockState doesn't leak loop 2
            // into the following bark tests.
            mockState.playback.currentLoopCount = 2;
            // drums.md P1 #9: motif 2 picks ONE displacement amount per
            // 2-bar phrase (via getPhraseSeed salt 17), then fires
            // deterministically. Old behavior was `roll(0.5)` per step =
            // scatter. New behavior is structural: BOTH backbeats land at
            // the same displaced slot within a phrase, and `Math.random`
            // doesn't affect the snare-displacement decision.
            const ts44 = TIME_SIGNATURES['4/4'];

            // No Math.random mocking — the new path is deterministic.
            // We sweep multiple section seeds to verify each bucket appears
            // and that within a single seed, both backbeats land on the
            // SAME displacement slot.
            const seenPatterns = new Set();
            for (const seed of [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
                mockState.groove.sectionSeedMap['1'] = seed;
                const strongHits = [];
                for (let step = 0; step < 16; step++) {
                    const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                    // Limit scan to the two backbeat regions (steps 4-6 and 12-14)
                    // so motif-1/3 ghost notes elsewhere don't confuse the test.
                    if (
                        (info.beatIndex === 1 || info.beatIndex === 3) &&
                        (info.isBackbeat || info.isEOfBeat || info.isOffbeat)
                    ) {
                        const params = createParams(step, 'Snare');
                        const result = applyGrooveOverrides(getState(), params);
                        if (result.shouldPlay && result.velocity > 0.8) {
                            strongHits.push(step);
                        }
                    }
                }
                if (strongHits.length === 0) {
                    continue;
                }
                const b1 = strongHits.filter((s) => s >= 4 && s <= 6);
                const b3 = strongHits.filter((s) => s >= 12 && s <= 14);
                // Each backbeat region: at most one strong hit (the deterministic
                // displacement target). This is the no-scatter guarantee.
                expect(b1.length).toBeLessThanOrEqual(1);
                expect(b3.length).toBeLessThanOrEqual(1);
                if (b1.length === 1 && b3.length === 1) {
                    const offsetB1 = b1[0] - 4;
                    const offsetB3 = b3[0] - 12;
                    // Both backbeats must displace by the same amount.
                    expect(offsetB1).toBe(offsetB3);
                    seenPatterns.add(offsetB1);
                }
            }
            // Sweep should hit at least two distinct displacement buckets
            // (the bucket distribution covers normal/+1/+2 across phraseSeed
            // space). 10 seeds sampling phraseSeed via salt 17 lands in
            // multiple buckets.
            expect(seenPatterns.size).toBeGreaterThanOrEqual(2);
            // Restore loop 0 so the shared mockState is clean for later tests.
            mockState.playback.currentLoopCount = 0;
        });

        it('should trigger anticipatory hi-hat barks on phrase turnarounds', () => {
            getState.mockReturnValue(mockState);
            mockState.groove.sectionSeedMap['1'] = 0.5;

            // Set up a turnaround
            mockState.arranger.sectionMap = [{ start: 0, end: 64 }]; // 4 bar section
            const beat4And = 62; // Step 62 is "and" of 4 in bar 4 (3*16 + 14)

            // Force math.random to trigger the turnaround
            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            const closedLane = applyGrooveOverrides(getState(), createParams(beat4And, 'HiHat'));
            const openLane = applyGrooveOverrides(getState(), createParams(beat4And, 'Open'));

            // Should resolve to the Open lane as a short turnaround bark
            expect(closedLane.shouldPlay).toBe(false);
            expect(openLane.shouldPlay).toBe(true);
            expect(openLane.soundName).toBe('Open');
            expect(openLane.velocity).toBeGreaterThan(0.9);
            expect(openLane.instTimeOffset).toBeLessThan(0);

            mockMath.mockRestore();
        });

        it('should route phrase-release barks as a half-open hat without doubling the 16th stream', () => {
            getState.mockReturnValue(mockState);
            mockState.groove.sectionSeedMap['1'] = 0.8;

            const releaseStep = 14; // & of 4
            const closedLane = applyGrooveOverrides(getState(), createParams(releaseStep, 'HiHat'));
            const openLane = applyGrooveOverrides(getState(), createParams(releaseStep, 'Open'));

            // Epic 4 S3: the funk "bark" is a half-open hat (a quick
            // open-then-choke), not a full Open wash. A half-open is not
            // 'Open', so it owns the closed (HiHat) lane — the Open lane stays
            // silent, so the 16th stream is still single, never doubled.
            expect(closedLane.shouldPlay).toBe(true);
            expect(closedLane.soundName).toBe('HiHatHalf');
            expect(openLane.shouldPlay).toBe(false);
        });
    });
});
