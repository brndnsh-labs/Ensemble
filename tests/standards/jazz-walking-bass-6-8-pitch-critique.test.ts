// @ts-nocheck
/**
 * Jazz 6/8 walking-bass PITCH critique (epic-1-compound-meter S15).
 *
 * The S12 density gate (commit 82c4e547) fires the engine on the right STEPS
 * in 6/8 — pulses {0, 6}, pickups {4, 10}, approach {2, 8} at high intensity.
 * But the pitch picker in the "--- QUARTER NOTE (WALKING) STYLE ---" branch of
 * `getBassNoteStyle` (bass-styles.ts) was still 4/4-shaped:
 *   - `intBeat === 2` ("beat 3 → fifth" 4/4 idiom) fires on mStep 4 in 6/8 —
 *     the PICKUP slot — and played the 5th 70% of the time instead of a
 *     chromatic / scale-step leading-tone into the next pulse.
 *   - On held-chord pulses (no chord change at mStep 6), the picker falls
 *     through to the generic scale-tone fallback, which can return the 3rd,
 *     5th, or 7th of the held chord instead of the root.
 *
 * Canonical Paul Chambers walking 6/8 ("All Blues"):
 *   - Pulses anchor on the chord root.
 *   - Pickups lean leading-tone / scale-step approaches into the next pulse.
 *   - Approach slots (when they fire) voice-lead with chord tones.
 *
 * Acceptance assertions (epic-1-compound-meter S15):
 *   (a) Bass pitches on pulses {0, 6} match the current chord's root
 *       pitch-class ≥ 90% across the run, including a 4-bar progression
 *       with at least one held chord (Cmaj7 held bar 3 → bar 4).
 *   (b) At intensity > 0.7, pickup pitches at mStep {4, 10} are within
 *       ±2 semitones of the next pulse's root pitch-class ≥ 80%.
 *
 * The S12 critique covers density; this file covers pitch selection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getMidi, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const STEPS_PER_BAR = SIX_EIGHT.beats * SIX_EIGHT.stepsPerBeat; // 12
const PULSE_STEPS = [0, 6];
const PICKUP_STEPS = [4, 10];

// why: 4-bar ii-V-I with the I held into bar 4 so we exercise the held-chord
// pulse path (the bug-trigger pre-S15: held-chord pulses fell through to the
// generic scale-tone fallback and were not guaranteed to land on the root).
// Roots: Dm7 (D=62), G7 (G=67), Cmaj7 (C=60), Cmaj7 (C=60, held).
function buildProgression() {
    return [
        {
            rootMidi: 62, // D
            quality: 'm7',
            beats: 6, // 6 eighths = 1 bar of 6/8
            intervals: [0, 3, 7, 10],
            sectionId: 'A',
        },
        {
            rootMidi: 67, // G
            quality: '7',
            beats: 6,
            intervals: [0, 4, 7, 10],
            sectionId: 'A',
        },
        {
            rootMidi: 60, // C
            quality: 'maj7',
            beats: 6,
            intervals: [0, 4, 7, 11],
            sectionId: 'A',
        },
        {
            rootMidi: 60, // C (held — same chord as bar 3)
            quality: 'maj7',
            beats: 6,
            intervals: [0, 4, 7, 11],
            sectionId: 'A',
        },
    ];
}

function buildJazzState(
    intensity: number,
    loopCount: number,
    overrides: Record<string, unknown> = {},
) {
    return {
        playback: {
            bandIntensity: intensity,
            bpm: 120,
            complexity: 0.5,
            currentLoopCount: loopCount,
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
 * Simulate `numLoops` passes through the 4-bar progression at the given
 * intensity, varying `playback.currentLoopCount` so the deterministic seed
 * sweeps. Returns onset records with (step, midi, chordRootPc, nextChordRootPc).
 */
function simulateProgression(numLoops: number, intensity: number) {
    const progression = buildProgression();
    const numBars = progression.length;
    const totalSteps = numBars * STEPS_PER_BAR;
    const onsets: Array<{
        bar: number;
        mStep: number;
        midi: number;
        chordRootPc: number;
        nextChordRootPc: number;
    }> = [];

    for (let loop = 0; loop < numLoops; loop++) {
        const state = buildJazzState(intensity, loop);
        getState.mockReturnValue(state);
        state.arranger.stepMap = [];
        for (let m = 0; m < numBars; m++) {
            state.arranger.stepMap.push({
                start: m * STEPS_PER_BAR,
                end: (m + 1) * STEPS_PER_BAR,
                chord: progression[m],
                ts: '6/8',
            });
        }

        let lastMidi: number | null = null;
        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % STEPS_PER_BAR;
            const bar = Math.floor(i / STEPS_PER_BAR);
            const chord = progression[bar];
            const nextChord = progression[(bar + 1) % numBars];
            const info = getStepInfo(i, SIX_EIGHT, state.arranger.stepMap, TIME_SIGNATURES);
            const active = isBassActive(getState(), 'quarter', i, stepInMeasure, info, {});
            if (!active) {
                continue;
            }
            const note = getBassNote(
                getState(),
                chord,
                nextChord,
                info.beatIndex,
                lastMidi ? getFrequency(lastMidi) : 0,
                36,
                'quarter',
                bar,
                i,
                stepInMeasure,
                {},
                info,
            );
            if (note && !note.muted) {
                const midi = note.midi ?? getMidi(note.frequency);
                onsets.push({
                    bar,
                    mStep: stepInMeasure,
                    midi,
                    chordRootPc: ((chord.rootMidi % 12) + 12) % 12,
                    // why: "next pulse's root" is what the pickup leads to. Pickup
                    // at mStep 4 leads to pulse at mStep 6 of the SAME bar
                    // (current chord root). Pickup at mStep 10 leads to pulse at
                    // mStep 0 of the NEXT bar (next chord root). Compute per-slot.
                    nextChordRootPc:
                        stepInMeasure === 10
                            ? ((nextChord.rootMidi % 12) + 12) % 12
                            : ((chord.rootMidi % 12) + 12) % 12,
                });
                lastMidi = midi;
            }
        }
    }
    return onsets;
}

describe('Jazz 6/8 Walking-Bass PITCH (S15)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('pulses {0, 6}: bass pitch matches current chord root ≥ 90% across loops', () => {
        // why: 30 loops × 4 bars = 120 bars. Held-chord exposure: bar 4 across
        // every loop reuses Cmaj7 — confirms held-chord pulse path stays on root.
        // Runs at moderate intensity 0.5 (pulse-only mode) to isolate pulse pitch
        // measurement: at intensity ≤ 0.5 the density gate fires pulses only, so
        // every recorded onset IS a pulse-root.
        const NUM_LOOPS = 30;
        const onsets = simulateProgression(NUM_LOOPS, 0.5);
        const pulseOnsets = onsets.filter((o) => PULSE_STEPS.includes(o.mStep));
        expect(pulseOnsets.length).toBeGreaterThan(0);
        const matches = pulseOnsets.filter(
            (o) => ((o.midi % 12) + 12) % 12 === o.chordRootPc,
        ).length;
        const matchShare = matches / pulseOnsets.length;

        console.log('\n--- JAZZ 6/8 WALKING BASS — PULSE ROOT SHARE (moderate intensity) ---');
        console.log(`[Loops]                ${NUM_LOOPS}`);
        console.log(`[Pulse onsets]         ${pulseOnsets.length}`);
        console.log(
            `[Pulse root-pc matches] ${matches} (${(matchShare * 100).toFixed(1)}% — target ≥ 90%)`,
        );
        console.log('--------------------------------------------------------------------\n');

        expect(matchShare).toBeGreaterThanOrEqual(0.9);
    });

    it('held-chord pulse (bar 3 → bar 4 Cmaj7): pulse 2 lands on root ≥ 90%', () => {
        // why: surgical guard on the bug-trigger case. Bar 4 reuses Cmaj7 from
        // bar 3; pre-S15 the held-chord mStep-6 pulse fell through to the generic
        // scale-tone fallback. Measure pitch-class share on bar-4 pulses
        // specifically. Pulse-only intensity so density doesn't shadow the test.
        const NUM_LOOPS = 30;
        const onsets = simulateProgression(NUM_LOOPS, 0.5);
        const heldBarPulses = onsets.filter((o) => o.bar === 3 && PULSE_STEPS.includes(o.mStep));
        expect(heldBarPulses.length).toBeGreaterThan(0);
        const matches = heldBarPulses.filter(
            (o) => ((o.midi % 12) + 12) % 12 === o.chordRootPc,
        ).length;
        const share = matches / heldBarPulses.length;

        console.log('\n--- JAZZ 6/8 WALKING BASS — HELD-CHORD PULSE (bar 4 Cmaj7) ---');
        console.log(`[Held-bar pulse onsets] ${heldBarPulses.length}`);
        console.log(
            `[Root-pc matches]       ${matches} (${(share * 100).toFixed(1)}% — target ≥ 90%)`,
        );
        console.log('----------------------------------------------------------------\n');

        expect(share).toBeGreaterThanOrEqual(0.9);
    });

    it('pickups {4, 10} at high intensity: within ±2 semitones of next-pulse root ≥ 80%', () => {
        // why: 30 loops at intensity 0.9. Pickup pitches should lean leading-
        // tone / scale-step approaches into the next pulse's root (chromatic ±1
        // is the canonical choice; ±2 leaves headroom for register clamping that
        // may shift the candidate by a whole step when the chromatic neighbor
        // falls out of the bass register slot).
        const NUM_LOOPS = 30;
        const onsets = simulateProgression(NUM_LOOPS, 0.9);
        const pickupOnsets = onsets.filter((o) => PICKUP_STEPS.includes(o.mStep));
        expect(pickupOnsets.length).toBeGreaterThan(0);
        const within = pickupOnsets.filter((o) => {
            const pc = ((o.midi % 12) + 12) % 12;
            // distance in pitch-class space (min of clockwise / counterclockwise)
            const diff = Math.min(
                (pc - o.nextChordRootPc + 12) % 12,
                (o.nextChordRootPc - pc + 12) % 12,
            );
            return diff <= 2;
        }).length;
        const share = within / pickupOnsets.length;

        console.log('\n--- JAZZ 6/8 WALKING BASS — PICKUP LEADING-TONE SHARE (high intensity) ---');
        console.log(`[Pickup onsets]      ${pickupOnsets.length}`);
        console.log(
            `[Within ±2 semitones] ${within} (${(share * 100).toFixed(1)}% — target ≥ 80%)`,
        );
        console.log(
            '---------------------------------------------------------------------------\n',
        );

        expect(share).toBeGreaterThanOrEqual(0.8);
    });

    it('pickup direction split: chromatic-below and chromatic-above roughly balanced across seeds', () => {
        // why: the pulse-root and pickup-±2 assertions above are routing
        // guards (100% by construction once the compound branch owns the
        // slot). This assertion is a distribution probe — it actually
        // measures the seeded PRNG's output. The picker uses scrambleHash
        // to pick chromatic-below vs chromatic-above at 50/50; a
        // regression that hardcoded one direction or swapped scrambleHash
        // for Math.random would skew this share. Memory note: the 4/4
        // jazz walking path also uses 50/50, so this should match.
        // 25-75% tolerance is generous — at 240 onsets the binomial 95% CI
        // around 50% is ±6.5pp, so 25/75 is ~7σ off-distribution.
        const NUM_LOOPS = 30;
        const onsets = simulateProgression(NUM_LOOPS, 0.9);
        const pickupOnsets = onsets.filter((o) => PICKUP_STEPS.includes(o.mStep));
        expect(pickupOnsets.length).toBeGreaterThan(0);

        // chromatic-below = pickup midi is one semitone below target;
        // chromatic-above = one semitone above.
        const below = pickupOnsets.filter((o) => {
            const pc = ((o.midi % 12) + 12) % 12;
            return (o.nextChordRootPc - pc + 12) % 12 === 1;
        }).length;
        const above = pickupOnsets.filter((o) => {
            const pc = ((o.midi % 12) + 12) % 12;
            return (pc - o.nextChordRootPc + 12) % 12 === 1;
        }).length;
        const classified = below + above;
        const belowShare = below / classified;

        console.log('\n--- JAZZ 6/8 WALKING BASS — PICKUP DIRECTION SPLIT (seeded PRNG probe) ---');
        console.log(`[Pickup onsets]         ${pickupOnsets.length}`);
        console.log(`[Chromatic-below]       ${below}`);
        console.log(`[Chromatic-above]       ${above}`);
        console.log(
            `[Below share]           ${(belowShare * 100).toFixed(1)}% (target ∈ [25%, 75%])`,
        );
        console.log(
            '---------------------------------------------------------------------------\n',
        );

        expect(belowShare).toBeGreaterThanOrEqual(0.25);
        expect(belowShare).toBeLessThanOrEqual(0.75);
    });
});
