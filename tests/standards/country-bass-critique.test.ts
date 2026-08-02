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

describe('Country Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}, chordSequence = null) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 115 },
            groove: {
                genreFeel: 'Country',
                lastDrumPreset: 'Country (Two-Step)',
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
        // Default: held C major across the whole simulation (preserves legacy tests).
        const chords = chordSequence || Array(numBars).fill(chordC);
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const barIndex = Math.floor(globalStep / 16);
            const stepInChord = globalStep % 16;
            const chord = chords[barIndex];
            const nextChord = chords[barIndex + 1] || null;

            const active = isBassActive(getState(), 'country', globalStep, stepInChord, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chord,
                    nextChord,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'country',
                    0,
                    globalStep,
                    stepInChord,
                    {},
                    info,
                );
                if (note) {
                    performance.push({
                        step: globalStep,
                        loopStep: stepInChord,
                        info,
                        note,
                        chord,
                        nextChord,
                    });
                    prevFreq = note.freq || 0;
                }
            }
        }
        return performance;
    };

    it('should play the Two-Step half-note pattern: Root on beats 1 and 3', () => {
        // Engine reality: `style === 'country'` in checkBassActiveStyle returns
        // `step % (stepsPerBeat * 2) === 0`, so only beats 0 and 2 (musical 1 and 3) fire.
        // The Two-Step is a half-note bass pattern, not a quarter-note Root-Fifth alternation.
        const performance = simulatePerformance(16);

        const beats = performance.map((p) => p.info.beatIndex);
        expect(performance.length).toBe(32); // 16 bars × 2 hits/bar
        expect(beats.every((b) => b === 0 || b === 2)).toBe(true);

        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            expect(pc).toBe(p.chord.rootMidi % 12); // Root on every fired beat
        });
    });

    it('should keep the root in the deep register (below C2)', () => {
        const performance = simulatePerformance(16);
        const rootMidi = 48; // C2

        performance.forEach((p) => {
            // safeCenterMidi shifts via registerShift = floor(intensity*7) but country
            // doesn't get the extended-range carve-out, so notes should clamp <= rootMidi.
            expect(p.note.midi).toBeLessThanOrEqual(rootMidi);
        });
    });

    it('should simplify to Downbeat-Only at very low intensity', () => {
        // bass-styles.ts:255-257 returns null on `intensity < 0.2 && !isDownbeat`,
        // dropping the beat-3 half-note. Expect exactly 16 fired hits, all on bar 1.
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.1, complexity: 0.3, bpm: 115 },
        });
        const totalBars = 16;
        const allOnDownbeat = performance.every((p) => p.info.isMeasureStart);

        console.log(`[Country Critique] Low-intensity hits: ${performance.length}/${totalBars}`);
        expect(performance.length).toBe(totalBars);
        expect(allOnDownbeat).toBe(true);
    });

    it('should promote to quarter-note Root-Fifth tier at intensity > 0.6', () => {
        // Engine reality: bass-styles.ts checkBassActiveStyle for 'country' now
        // returns `isQuarter` when intensity > 0.6, and getBassNoteStyle plays
        // R-5-R-5 (root on beats 1, 3; fifth on beats 2, 4). Previously the engine
        // returned `step % 8 === 0` unconditionally — the `isFifthBeat` branch was
        // dead code (docs/archive/MUSICAL_AUDIT.md Open #1, bass.md P1 #6).
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.85, complexity: 0.5, bpm: 115 },
        });

        const beats = performance.map((p) => p.info.beatIndex);
        // 16 bars * 4 quarter notes = 64 hits expected.
        expect(performance.length).toBe(64);
        // Every beat 0-3 should be represented.
        expect(beats.filter((b) => b === 0).length).toBe(16);
        expect(beats.filter((b) => b === 1).length).toBe(16);
        expect(beats.filter((b) => b === 2).length).toBe(16);
        expect(beats.filter((b) => b === 3).length).toBe(16);

        // Pitch classes: beats 1, 3 are root; beats 2, 4 are fifth.
        const rootPC = 48 % 12; // C
        const fifthPC = (48 + 7) % 12; // G

        const rootBeatPCs = performance
            .filter((p) => p.info.beatIndex === 0 || p.info.beatIndex === 2)
            .map((p) => p.note.midi % 12);
        const fifthBeatPCs = performance
            .filter((p) => p.info.beatIndex === 1 || p.info.beatIndex === 3)
            .map((p) => p.note.midi % 12);

        expect(rootBeatPCs.every((pc) => pc === rootPC)).toBe(true);
        expect(fifthBeatPCs.every((pc) => pc === fifthPC)).toBe(true);

        // Fifth must sit BELOW root (4th-below = "boom-chick" deep register).
        // Locks the musical-taste decision against accidental flip to fifth-above.
        const rootHits = performance.filter(
            (p) => p.info.beatIndex === 0 || p.info.beatIndex === 2,
        );
        const fifthHits = performance.filter(
            (p) => p.info.beatIndex === 1 || p.info.beatIndex === 3,
        );
        // Compare each fifth hit to the immediately preceding root hit.
        for (let i = 0; i < fifthHits.length; i++) {
            const rootHit = rootHits[i];
            const fifthHit = fifthHits[i];
            if (!rootHit || !fifthHit) {
                continue;
            }
            expect(fifthHit.note.midi).toBeLessThan(rootHit.note.midi); // intent: the fifth must sit below the root (boom-chick deep register) — a musical-taste decision, not a measurement
        }
        console.log(
            `[Country Critique] Quarter-tier: ${performance.length} hits, R-5-R-5 verified, fifth-below confirmed`,
        );
    });

    it('should hold Two-Step half-notes at exactly intensity 0.6 (tier boundary)', () => {
        // The tier boundary is `intensity > 0.6` exactly. At 0.6 we stay Two-Step
        // (the engine's `>` is strict; 0.6 is at-or-below). Guards against accidental
        // tier promotion if the comparison flips to `>=`.
        const performance = simulatePerformance(8, {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 115 },
        });
        // 8 bars × 2 hits = 16 (Two-Step floor).
        expect(performance.length).toBe(16);
        const beats = performance.map((p) => p.info.beatIndex);
        expect(beats.every((b) => b === 0 || b === 2)).toBe(true);
        // Pitch shape: Two-Step is R-R (not R-5). Locks musical-taste call
        // against silent drift to R-5 honky-tonk at the boundary.
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            expect(pc).toBe(p.chord.rootMidi % 12);
        });
    });

    it('should build a 2-note walk-up into chord changes (chromatic on the &)', () => {
        // Engine reality: getBassNoteStyle for 'country' now fires walk-up tones on
        // the last beat and last "&" of the bar before a chord change, when
        // intensity > 0.5. The "&" tone is a chromatic neighbor (±1 semitone) of
        // the next root, replacing the previous single-note approach
        // (bass-styles.ts: walk-up branch).
        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const chordG = { rootMidi: 55, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        // Alternate C → G → C → G ... so every bar is a chord change.
        const sequence = Array(16)
            .fill(null)
            .map((_, i) => (i % 2 === 0 ? chordC : chordG));

        // Suppress chromatic-approach RNG nondeterminism that might cross over from
        // shared engine paths by fixing intensity comfortably above the walk-up
        // threshold but below quarter-tier so we isolate the walk-up shape.
        const performance = simulatePerformance(
            16,
            { playback: { bandIntensity: 0.55, complexity: 0.4, bpm: 115 } },
            sequence,
        );

        // Find all hits on the "&" of beat 4 (step 14 within a bar). With 16 bars
        // and every bar being a chord change, we expect a walk-up "&" on bars
        // 0..14 (bar 15 has no nextChord).
        const lastAndHits = performance.filter((p) => p.loopStep === 14);
        expect(lastAndHits.length).toBeGreaterThanOrEqual(14); // 15 expected, allow some slack

        // Each "&" hit should be a half-step neighbor of the upcoming root.
        for (const hit of lastAndHits) {
            const nextRoot = hit.nextChord.rootMidi;
            const nextRootPC = ((nextRoot % 12) + 12) % 12;
            const hitPC = ((hit.note.midi % 12) + 12) % 12;
            const distToNext = Math.min(
                (hitPC - nextRootPC + 12) % 12,
                (nextRootPC - hitPC + 12) % 12,
            );
            expect(distToNext).toBe(1); // chromatic neighbor
        }

        // Each "beat 4" hit (loopStep 12) on a chord-change bar should be a walk-up
        // tone within ±4 semitones of the upcoming root, distinct from root and
        // not the adjacent half-step (that's reserved for the "&").
        const beat4Hits = performance.filter((p) => p.loopStep === 12);
        // We allow a band: 14-15 expected (15 chord-change bars).
        expect(beat4Hits.length).toBeGreaterThanOrEqual(14);
        let stepwiseCount = 0;
        for (const hit of beat4Hits) {
            const nextRoot = hit.nextChord.rootMidi;
            const nextRootPC = ((nextRoot % 12) + 12) % 12;
            const hitPC = ((hit.note.midi % 12) + 12) % 12;
            const distToNext = Math.min(
                (hitPC - nextRootPC + 12) % 12,
                (nextRootPC - hitPC + 12) % 12,
            );
            // Walk-up beat-4 tone is 2-4 semitones from the upcoming root
            // (whole-step or scale-tone — the "&" carries the half-step).
            if (distToNext >= 2 && distToNext <= 4) {
                stepwiseCount++;
            }
        }
        // Almost all chord-change beat-4 tones should be stepwise (≥80%).
        expect(stepwiseCount / beat4Hits.length).toBeGreaterThanOrEqual(0.8);

        console.log(
            `[Country Critique] Walk-up: ${lastAndHits.length} "&" hits (all chromatic), ${stepwiseCount}/${beat4Hits.length} stepwise beat-4 walk tones`,
        );
    });

    it('should NOT fire walk-up notes on held chords', () => {
        // Walk-up gates on `isChordChangeApproach`. With a held single chord, no
        // walk-up should fire — only the Two-Step floor (beats 1, 3) plays.
        // Use intensity 0.55 (walk-up active, quarter-tier inactive) to isolate.
        const performance = simulatePerformance(8, {
            playback: { bandIntensity: 0.55, complexity: 0.4, bpm: 115 },
        });
        // 8 bars × 2 hits = 16 (Two-Step). No beat-4 or "&" hits on held chord.
        expect(performance.length).toBe(16);
        const lastAndHits = performance.filter((p) => p.loopStep === 14);
        const beat4Hits = performance.filter((p) => p.loopStep === 12);
        expect(lastAndHits.length).toBe(0);
        expect(beat4Hits.length).toBe(0);
    });

    it('should boost velocity with intensity', () => {
        // pluckVel = 0.95 + intensity * 0.3 (bass-styles.ts:285) — the engine's
        // intensity axis is loudness, not density. Verify scaling.
        const low = simulatePerformance(8, {
            playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 115 },
        });
        const high = simulatePerformance(8, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 115 },
        });

        const avg = (perf) => perf.reduce((s, p) => s + p.note.velocity, 0) / perf.length;
        const lowVel = avg(low);
        const highVel = avg(high);
        console.log(
            `[Country Critique] Velocity scaling: low=${lowVel.toFixed(2)} high=${highVel.toFixed(2)}`,
        );

        // Expected: pluckVel 0.95 + 0.3*0.3 = 1.04 vs 0.95 + 0.95*0.3 = 1.235,
        // each then times the intensity/envelope terms. #1331 moved the engine's
        // emission clamp from the AUTHORING ceiling (1.25) to the DOMAIN ceiling
        // (`BASS_VELOCITY_DOMAIN_MAX` = 1.5), so the high-intensity mean rose
        // 1.25 -> 1.50: at 0.95 intensity country's quarter-tier notes were
        // previously all sitting on the old rail. They now sit on the new one —
        // the residual triple-stacked intensity multiplication is #1336, not this
        // test's business. This assertion measures ENGINE velocity; the rendered
        // dynamics (what a listener hears through `bassVelocityToAmplitude`) are
        // asserted in `funk-bass-critique.test.ts`.
        expect(highVel).toBeGreaterThan(lowVel * 1.1); // measured: engine delivers low=0.88, high=1.50 (~1.70x); floor 1.1x leaves ~0.6x headroom
    });
});
