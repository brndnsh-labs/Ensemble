/**
 * Critique (#714): the rhythm section locks to ONE shared groove pocket.
 *
 * Pre-#714 chords / bass / harmony each ran their own `calculateTimingOffset`
 * off independent (unseeded) jitter — so the comping lanes could not lock to
 * each other or to the drum pocket. #714 publishes one shared pocket on
 * `coordination.pocketOffset` (drum preamble), and every melodic lane adds THAT
 * + a small fixed per-lane feel constant. (Drums anchor the grid at
 * instTimeOffset 0; the soloist intentionally still floats with its own pocket.)
 *
 * Guards:
 *   (1) SHARED BASE — shifting `coordination.pocketOffset` by Δ shifts the chords
 *       AND bass lead-note timing by exactly Δ (they read the same pocket).
 *   (2) LOCK — the shared pocket is deterministic and repeats loop-to-loop
 *       (seeded off the in-loop step, not Math.random or the global step).
 *   (3) LANE-AGNOSTIC — the pocket carries no per-instrument gravity term.
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote } from '../../public/engine/bass-engine.js';
import { calculatePocketOffset } from '../../public/engine/groove-engine.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({ getState: vi.fn(), dispatch: vi.fn() }));

const FOUR_FOUR = '4/4';
const STEPS_PER_BAR = 16;
const NUM_BARS = 12;
const TOTAL = STEPS_PER_BAR * NUM_BARS;

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

const POCKET = {
    globalDrive: 0.3,
    tightness: 0.5,
    bassGravity: 0.8,
    chordGravity: 0.6,
    soloistGravity: 0.4,
};

function resetCompingState() {
    compingState.currentCell = new Array(16).fill(1); // force comp onsets every step
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

function makeState() {
    return {
        playback: {
            bandIntensity: 0.6,
            bpm: 110,
            complexity: 0.5,
            currentLoopCount: 0,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        groove: { genreFeel: 'Rock', lastDrumPreset: 'Rock', enabled: true, pocket: POCKET },
        soloist: makeSoloistMock({ enabled: false, style: 'rock', isResting: false }),
        arranger: {
            timeSignature: FOUR_FOUR,
            totalSteps: TOTAL,
            stepMap: [],
            measureMap: [],
            key: 'C',
            isMinor: false,
            progression: [],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true, style: 'rock', lastFreq: null, octave: 38 },
        harmony: { enabled: false, rhythmicMask: 0 },
        vizState: { enabled: false },
        midi: {},
    } as any;
}

// The lead comp onset's timingOffset at a downbeat step, given a pocketOffset.
function chordLeadTiming(pocketOffset: number): number {
    resetCompingState();
    const state = makeState();
    const chord = makeC7();
    const coord: any = { soloistBusy: false, sectionOccurrence: 1, pocketOffset };
    const step = STEPS_PER_BAR; // bar 1 downbeat
    const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
    const notes = getAccompanimentNotes(state, chord, step, 0, 0, info, coord);
    const lead = notes.find((n: any) => n && n.midi > 0 && !n.muted);
    return lead.timingOffset;
}

// The bass note's timingOffset at a downbeat, given a pocketOffset (passed via
// context.stepCoordination — the shape tick-logic uses).
function bassTiming(pocketOffset: number): number {
    const state = makeState();
    const chord = makeC7();
    const ctx = {
        sectionStart: 0,
        sectionEnd: TOTAL,
        stepCoordination: { pocketOffset, kickHit: false },
    };
    const step = STEPS_PER_BAR;
    const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
    const res = getBassNote(state, chord, null, 0, null, 38, 'rock', 0, step, 0, ctx, info);
    return res?.timingOffset ?? Number.NaN;
}

describe('Rhythm section locks to one shared pocket (#714)', () => {
    it('(1) shifting the shared pocket shifts chords AND bass timing by the same delta', () => {
        const delta = 0.02;

        const chordA = chordLeadTiming(0);
        const chordB = chordLeadTiming(delta);
        expect(chordB - chordA).toBeCloseTo(delta, 9);

        const bassA = bassTiming(0);
        const bassB = bassTiming(delta);
        expect(bassA).not.toBeNaN();
        expect(bassB - bassA).toBeCloseTo(delta, 9);
    });

    it('(2) the shared pocket is deterministic and locks loop-to-loop', () => {
        const playback = { bandIntensity: 0.6 };
        const groove = { pocket: POCKET, genreFeel: 'Rock' };

        // Deterministic: same args → same value (no Math.random).
        expect(calculatePocketOffset(playback, groove, 40, TOTAL)).toBe(
            calculatePocketOffset(playback, groove, 40, TOTAL),
        );

        // Loop-stable: the SAME in-loop step in a later loop reproduces the pocket,
        // even though the global step differs.
        expect(calculatePocketOffset(playback, groove, 40, TOTAL)).toBe(
            calculatePocketOffset(playback, groove, 40 + TOTAL, TOTAL),
        );
        expect(calculatePocketOffset(playback, groove, 40, TOTAL)).toBe(
            calculatePocketOffset(playback, groove, 40 + 2 * TOTAL, TOTAL),
        );
    });

    it('(3) the shared pocket carries no per-instrument gravity term (lane-agnostic)', () => {
        const playback = { bandIntensity: 0.6 };
        // Two pockets that differ ONLY in the per-instrument gravities must give
        // the same shared offset — the pocket is lane-agnostic now.
        const a = calculatePocketOffset(
            { ...playback },
            { pocket: { ...POCKET, bassGravity: 0.1, chordGravity: 0.1, soloistGravity: 0.1 } },
            40,
            TOTAL,
        );
        const b = calculatePocketOffset(
            { ...playback },
            { pocket: { ...POCKET, bassGravity: 0.9, chordGravity: 0.9, soloistGravity: 0.9 } },
            40,
            TOTAL,
        );
        expect(a).toBe(b);
    });
});
