/**
 * Critique (#713): the comp's timing must TIGHTEN as band intensity rises, and
 * stay locked loop-to-loop.
 *
 * Pre-#713 the smart-path added three FLAT pushes after `calculateTimingOffset`
 * (`timingOffset -= 0.025`, `-= 0.01`, `+= 0.02`) that ignored intensity — so the
 * comp wandered the same ±35ms at full drive as in a ballad and never "locked in"
 * as the band pushed. B3 scales each push by the pocket's intensity elasticity
 * (`1.1 - elasticity`, ~0.7× → ~0.1×); B4's seeded humanShift landed with #712.
 * The pocket's tightness jitter is now also fed the loop-stable comp draw.
 *
 * Guards:
 *   (1) TIGHTEN — the spread of comp onset timing shrinks meaningfully as
 *       intensity goes 0.2 → 0.9.
 *   (2) LOCK — the onset timing stream is bit-identical loop-to-loop.
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { calculatePocketOffset } from '../../public/engine/groove-engine.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

const FOUR_FOUR = '4/4';
const STEPS_PER_BAR = 16;
const NUM_BARS = 12; // a 12-bar form

const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
function makeC7() {
    const intervals = [0, 4, 7, 10];
    return {
        rootMidi: 60,
        quality: '7',
        intervals,
        is7th: true,
        beats: 4,
        freqs: intervals.map((iv) => midiToFreq(60 + iv)),
        sectionId: 'Head',
    };
}

function resetCompingState() {
    compingState.currentCell = new Array(16).fill(0);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.lastChordIndex = -1;
    compingState.lastChordQuality = null;
    compingState.funkRotationIndex = 0;
    compingState.bossaRotationIndex = 0;
    compingState.currentVibe = 'balanced';
    compingState.soloistActivity = 0;
    compingState.maxGrooveLength = 4;
}

function buildState(intensity: number, currentLoopCount: number) {
    const soloist = makeSoloistMock({
        enabled: false,
        style: 'jazz',
        mode: 'monophonic',
        octave: 64,
        isResting: false,
    });
    return {
        playback: {
            bandIntensity: intensity,
            bpm: 110,
            complexity: 0.5,
            currentLoopCount,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        // why: a non-trivial pocket so calculateTimingOffset returns real offsets
        // (some drive + sub-1.0 tightness so jitter is in play, mid gravities).
        groove: {
            genreFeel: 'Blues',
            lastDrumPreset: 'Blues',
            enabled: true,
            pocket: {
                globalDrive: 0.2,
                tightness: 0.5,
                bassGravity: 0.5,
                chordGravity: 0.5,
                soloistGravity: 0.5,
            },
        },
        soloist,
        arranger: {
            timeSignature: FOUR_FOUR,
            totalSteps: STEPS_PER_BAR * NUM_BARS,
            stepMap: [],
            key: 'C',
            isMinor: false,
            progression: [],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true, lastFreq: null },
        harmony: { enabled: false, rhythmicMask: 0 },
        vizState: { enabled: false },
        midi: {},
    } as any;
}

const COORD = {
    soloistBusy: false,
    soloistResting: false,
    soloistActive: false,
    soloistNotesInPhrase: 0,
    bassHit: false,
    kickHit: false,
    snareHit: false,
    accompanimentHit: false,
    sectionOccurrence: 1,
};

// Collect the lead-voice (i===0) timing offset of every comp onset across a loop.
function collectOnsetTimings(intensity: number, currentLoopCount: number): number[] {
    resetCompingState();
    const state = buildState(intensity, currentLoopCount);
    const chord = makeC7();
    const timings: number[] = [];
    for (let bar = 0; bar < NUM_BARS; bar++) {
        for (let mStep = 0; mStep < STEPS_PER_BAR; mStep++) {
            const step = bar * STEPS_PER_BAR + mStep;
            const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
            // #714: the comp reads the shared groove pocket. Drive the REAL path —
            // publish coordination.pocketOffset the way the drum preamble does — so
            // this measures the integrated comp timing (shared pocket, which carries
            // the intensity-tightened wobble, + the comp's own #713 pushes).
            const coord = {
                ...COORD,
                pocketOffset: calculatePocketOffset(
                    state.playback,
                    state.groove,
                    step,
                    state.arranger.totalSteps,
                ),
            };
            const notes = getAccompanimentNotes(state, chord, step, step, mStep, info, coord);
            const lead = notes.find((n: any) => n && n.midi > 0 && !n.muted);
            if (lead) {
                timings.push(lead.timingOffset);
            }
        }
    }
    return timings;
}

const spread = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);

describe('Comp timing tightens with intensity and locks loop-to-loop (#713)', () => {
    it('(1) the spread of comp onset timing shrinks as intensity rises', () => {
        const loose = spread(collectOnsetTimings(0.2, 0));
        const tight = spread(collectOnsetTimings(0.9, 0));

        // Both must produce onsets to compare.
        expect(loose).toBeGreaterThan(0);

        // The high-intensity comp must lock noticeably tighter than the ballad —
        // the flat pushes used to keep these equal. Require a clear contraction.
        expect(
            tight,
            `expected high-intensity spread (${tight.toFixed(4)}s) to be well under ` +
                `low-intensity spread (${loose.toFixed(4)}s)`,
        ).toBeLessThan(loose * 0.6);
    });

    it('(2) the comp onset timing stream is bit-identical loop-to-loop', () => {
        // Same in-loop position, different loop counter → identical timings.
        const loop0 = collectOnsetTimings(0.7, 0);
        const loop1 = collectOnsetTimings(0.7, 5);
        expect(loop1).toEqual(loop0);
    });
});
