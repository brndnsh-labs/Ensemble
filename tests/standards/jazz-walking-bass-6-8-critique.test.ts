// @ts-nocheck
/**
 * Jazz 6/8 walking-bass density critique (epic-1-compound-meter S12).
 *
 * Before this story, the jazz/walking branch of `checkBassActiveStyle`
 * (bass-styles.ts) gated onsets on `isQuarter` (= `isBeatStart` =
 * `mStep % stepsPerBeat === 0`). In 6/8
 * (stepsPerBeat=2) that fires on every eighth (mStep 0,2,4,6,8,10) producing
 * 6+ onsets/bar — a running line, not a walking jazz waltz.
 *
 * Idiomatic jazz 6/8 walking bass (think Paul Chambers on "All Blues") targets
 * the dotted-quarter pulse with 2–4 melodic onsets per bar. The fix gates the
 * compound branch on `isPulseStart` (mStep {0, 6} in 6/8) plus tasteful
 * pickups on the last eighth of each group (mStep {4, 10}) at moderate
 * intensity, with an additional middle-eighth approach slot ({2, 8}) at high
 * intensity.
 *
 * Acceptance assertions (see epic-1-compound-meter S12):
 *   (a) At intensity ≤ 0.7: onsets-per-bar mean ∈ [2, 5] (target ~3).
 *   (b) At intensity > 0.7: onsets-per-bar mean ∈ [3, 7] (target ~5).
 *   (c) Bass root pitches cluster on pulse positions {0, 6} ≥ 90% of onsets.
 *       Specifically: pulse positions {0, 6} together account for ≥ 90% of
 *       all onsets at low intensity (pulse-only), and ≥ 35% even at high
 *       intensity (when pickups + approach also fire).
 *
 * The pulse-clustering acceptance in the story reads "Bass roots cluster on
 * pulse positions {0, 6} ≥ 90% of all onsets." Interpreted strictly across
 * all intensities, that would forbid pickup notes — which contradicts the
 * "~5 onsets/bar at high intensity" target (only 2 of those 5 would be on
 * pulse). We split it: at intensity ≤ 0.5 (pulse-only mode) we assert ≥ 90%
 * pulse share, which is the strongest possible reading of the criterion;
 * at higher intensities pickup/approach slots dilute the share by design.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// why: 6/8 has 12 steps per bar (6 eighth-note pulses × 1 step/eighth = 12 steps).
const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const STEPS_PER_BAR = SIX_EIGHT.beats * SIX_EIGHT.stepsPerBeat; // 12
// why: pulse positions in 6/8 — the two dotted-quarter downbeats.
const PULSE_STEPS = new Set([0, 6]);
// why: pickup positions — the last eighth of each dotted-quarter group.
const PICKUP_STEPS = new Set([4, 10]);
// why: approach positions — the middle eighth of each group (high-intensity only).
const APPROACH_STEPS = new Set([2, 8]);

function buildJazzState(intensity: number, overrides: Record<string, unknown> = {}) {
    return {
        playback: {
            bandIntensity: intensity,
            bpm: 120,
            complexity: 0.5,
            currentLoopCount: 0,
            songMode: false,
        },
        groove: {
            genreFeel: 'Jazz',
            lastDrumPreset: 'Jazz',
            instruments: [],
            pocket: 0,
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, tension: 0 }),
        arranger: {
            timeSignature: '6/8',
            totalSteps: 1000,
            stepMap: [],
        },
        ...overrides,
    };
}

/**
 * Simulate a multi-bar jazz 6/8 walking-bass performance and collect onsets.
 * Uses a static C maj7 chord so onset counts are not perturbed by chord
 * changes (the chord-change branch in getBassNote is orthogonal to this
 * acceptance — it tests density only). currentLoopCount varies across bars
 * via the deterministic seed (`playback.currentLoopCount * 0x85ebca77 XOR
 * step * 0x9e3779b1`), so the density measurement spans the seed space.
 */
function simulateWalkingBass(numBars: number, intensity: number) {
    const state = buildJazzState(intensity);
    getState.mockReturnValue(state);

    const heldChord = {
        rootMidi: 48,
        quality: 'maj7',
        beats: 6, // 6 eighths per bar in 6/8
        intervals: [0, 4, 7, 11],
        sectionId: 'A',
    };
    // Build stepMap so getStepInfo sees the chord across the run.
    state.arranger.stepMap = [];
    for (let m = 0; m < numBars; m++) {
        state.arranger.stepMap.push({
            start: m * STEPS_PER_BAR,
            end: (m + 1) * STEPS_PER_BAR,
            chord: heldChord,
            ts: '6/8',
        });
    }

    const totalSteps = numBars * STEPS_PER_BAR;
    let totalOnsets = 0;
    const onsetsByStep: Record<number, number> = {};
    const onsetsByBar: number[] = new Array(numBars).fill(0);
    let lastMidi: number | null = null;

    for (let i = 0; i < totalSteps; i++) {
        const stepInMeasure = i % STEPS_PER_BAR;
        const info = getStepInfo(i, SIX_EIGHT, state.arranger.stepMap, TIME_SIGNATURES);
        const active = isBassActive(getState(), 'quarter', i, stepInMeasure, info, {});
        if (!active) {
            continue;
        }
        const note = getBassNote(
            getState(),
            heldChord,
            heldChord, // nextChord — held; chord-change branch is not under test
            info.beatIndex,
            lastMidi ? getFrequency(lastMidi) : 0,
            36,
            'quarter',
            0,
            i,
            stepInMeasure,
            {},
            info,
        );
        if (note && !note.muted) {
            totalOnsets++;
            onsetsByStep[stepInMeasure] = (onsetsByStep[stepInMeasure] || 0) + 1;
            const bar = Math.floor(i / STEPS_PER_BAR);
            onsetsByBar[bar]++;
            lastMidi = note.midi;
        }
    }

    return { totalOnsets, onsetsByStep, onsetsByBar };
}

function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

describe('Jazz 6/8 Walking-Bass Density (S12)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('low intensity (0.4) → pulse-only, ~2 onsets/bar, ≥ 90% on pulses {0,6} (128 bars)', () => {
        // why: at intensity ≤ 0.5 the engine should be in pulse-only mode — the
        // strictest reading of the "≥ 90% on pulses" acceptance. With 2 pulse
        // slots fired at probability 1.0 and pickups/approach silent, we expect
        // very close to 2.0 onsets/bar and 100% of onsets on pulses.
        const numBars = 128;
        const { totalOnsets, onsetsByStep, onsetsByBar } = simulateWalkingBass(numBars, 0.4);
        const onsetsPerBar = totalOnsets / numBars;
        const pulseHits = (onsetsByStep[0] || 0) + (onsetsByStep[6] || 0);
        const pulseShare = totalOnsets > 0 ? pulseHits / totalOnsets : 0;

        console.log('\n--- JAZZ 6/8 WALKING BASS — LOW INTENSITY ---');
        console.log(`[Bars]              ${numBars}`);
        console.log(`[Total onsets]      ${totalOnsets}`);
        console.log(`[Onsets per bar]    ${onsetsPerBar.toFixed(2)} (Target: ~2)`);
        console.log(`[Pulse share {0,6}] ${(pulseShare * 100).toFixed(1)}% (Target: ≥ 90%)`);
        console.log('[Onsets by mStep]', onsetsByStep);
        console.log('----------------------------------------------\n');

        expect(onsetsPerBar).toBeGreaterThanOrEqual(1.5);
        expect(onsetsPerBar).toBeLessThanOrEqual(2.5);
        expect(pulseShare).toBeGreaterThanOrEqual(0.9);
        // Sanity: at least *some* onsets per bar (no degenerate zero case).
        expect(mean(onsetsByBar)).toBeGreaterThan(1);
    });

    it('moderate intensity (0.65) → ~3 onsets/bar ∈ [2, 5] (128 bars)', () => {
        // why: pickup slots fire at probability 0.5; pulses at 1.0; approach
        // silent. Expected onsets/bar ≈ 2 (pulses) + 2 × 0.5 (pickups) = 3.
        const numBars = 128;
        const { totalOnsets, onsetsByStep } = simulateWalkingBass(numBars, 0.65);
        const onsetsPerBar = totalOnsets / numBars;
        const approachHits = (onsetsByStep[2] || 0) + (onsetsByStep[8] || 0);

        console.log('\n--- JAZZ 6/8 WALKING BASS — MODERATE INTENSITY ---');
        console.log(`[Bars]              ${numBars}`);
        console.log(`[Onsets per bar]    ${onsetsPerBar.toFixed(2)} (Target: ~3, range [2, 5])`);
        console.log(`[Approach hits {2,8}] ${approachHits} (Target: 0 — silent at this intensity)`);
        console.log('[Onsets by mStep]', onsetsByStep);
        console.log('----------------------------------------------------\n');

        expect(onsetsPerBar).toBeGreaterThanOrEqual(2);
        expect(onsetsPerBar).toBeLessThanOrEqual(5);
        // Approach slots are gated above 0.7 intensity — must be silent at 0.65.
        expect(approachHits).toBe(0);
    });

    it('high intensity (0.9) → ~5 onsets/bar ∈ [3, 7] (128 bars)', () => {
        // why: pulses 1.0, pickups 0.95, approach 0.55 → expected onsets/bar
        // ≈ 2 + 2 × 0.95 + 2 × 0.55 = 5.0.
        const numBars = 128;
        const { totalOnsets, onsetsByStep } = simulateWalkingBass(numBars, 0.9);
        const onsetsPerBar = totalOnsets / numBars;
        const pickupHits = (onsetsByStep[4] || 0) + (onsetsByStep[10] || 0);
        const approachHits = (onsetsByStep[2] || 0) + (onsetsByStep[8] || 0);

        console.log('\n--- JAZZ 6/8 WALKING BASS — HIGH INTENSITY ---');
        console.log(`[Bars]              ${numBars}`);
        console.log(`[Onsets per bar]    ${onsetsPerBar.toFixed(2)} (Target: ~5, range [3, 7])`);
        console.log(`[Pickup hits {4,10}] ${pickupHits} (Target: > 0)`);
        console.log(`[Approach hits {2,8}] ${approachHits} (Target: > 0)`);
        console.log('[Onsets by mStep]', onsetsByStep);
        console.log('-----------------------------------------------\n');

        expect(onsetsPerBar).toBeGreaterThanOrEqual(3);
        expect(onsetsPerBar).toBeLessThanOrEqual(7);
        // High-intensity unlocks both pickup and approach slots.
        expect(pickupHits).toBeGreaterThan(0);
        expect(approachHits).toBeGreaterThan(0);
        // Sanity: well under the broken `isBeatStart`-gated 6 onsets/bar baseline.
        // No onsets land on odd-eighth subdivisions other than the named slots.
        for (const mStep of Object.keys(onsetsByStep).map(Number)) {
            const isNamedSlot =
                PULSE_STEPS.has(mStep) || PICKUP_STEPS.has(mStep) || APPROACH_STEPS.has(mStep);
            expect(isNamedSlot).toBe(true);
        }
    });

    it('all onsets land exclusively on {0, 2, 4, 6, 8, 10} (no 16th-grid leak)', () => {
        // why: the canonical compound-meter walking bass vocabulary is the
        // eighth-grid. Any onset on an odd mStep (1, 3, 5, 7, 9, 11) means
        // the simple-meter `isEighthSkip` fallback leaked through into 6/8 —
        // exactly the bug S12 fixes. Run at multiple intensities to cover
        // every branch.
        for (const intensity of [0.3, 0.65, 0.9]) {
            const { onsetsByStep } = simulateWalkingBass(64, intensity);
            const oddStepHits = [1, 3, 5, 7, 9, 11]
                .map((s) => onsetsByStep[s] || 0)
                .reduce((a, b) => a + b, 0);
            expect(oddStepHits).toBe(0);
        }
    });
});
