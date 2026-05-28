/**
 * Critique: 6/8 comping must LOCK — deterministic loop-to-loop + stable pulse.
 *
 * The comping has two layers: a phrase-stable, seeded cell generator
 * (generateCompingPattern) and an emission overlay in getAccompanimentNotes
 * that modulates the cell with coordination + pulse-anchoring decisions. The
 * overlay used raw Math.random for ~10 gates, so the comp re-randomized every
 * bar AND every loop — "unpredictable / off-time," worst in 6/8 where there are
 * only two dotted-quarter pulses {0, 6} to lock to.
 *
 * The fix seeds every overlay gate on (step, loopCount) — the same shape
 * bass/drums/soloist use — so the comp is deterministic (repeats given the same
 * step + loop) and the dotted-quarter pulses are reliably anchored.
 *
 * Guards:
 *   (1) determinism — identical (step, loop) inputs produce byte-identical comp.
 *   (2) pulse stability — in 6/8 the {0, 6} pulses land in nearly every bar.
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

const SIX_EIGHT = '6/8';
const STEPS_PER_BAR = 12;
const NUM_BARS = 24;

const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
function makeG7() {
    const intervals = [0, 4, 7, 10];
    return {
        rootMidi: 67,
        quality: '7',
        intervals,
        is7th: true,
        beats: 6,
        freqs: intervals.map((iv) => midiToFreq(67 + iv)),
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
    // why: persistent groove-memory fields — must reset for a clean
    // pass-to-pass determinism comparison (soloistActivity is a converging
    // smoother, so omitting it makes the first pass differ from later passes).
    compingState.soloistActivity = 0;
    compingState.maxGrooveLength = 4;
}

function buildState(currentLoopCount: number) {
    const soloist = makeSoloistMock({
        enabled: true,
        style: 'jazz',
        mode: 'monophonic',
        octave: 64,
        sessionSteps: 0,
        phrasingState: 'active',
        isResting: false,
        phraseContext: { role: 'call', sectionLabel: 'Head', sectionOccurrence: 0 },
    });
    return {
        playback: {
            bandIntensity: 0.7,
            bpm: 90,
            // why: < 0.7 so the soloist-busy displacement gate stays off — we're
            // measuring the pulse anchoring, not the breath gesture.
            complexity: 0.5,
            currentLoopCount,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        groove: { genreFeel: 'Jazz', lastDrumPreset: 'Jazz', pocket: 0, enabled: true },
        soloist,
        arranger: {
            timeSignature: SIX_EIGHT,
            totalSteps: STEPS_PER_BAR * NUM_BARS,
            stepMap: [],
            key: 'G',
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

// why: exercise every overlay gate (bass yield, conversational answer, ...) so
// the determinism check is meaningful. soloistResting stays false so the
// phrase-end thin doesn't fire.
const COORD = {
    soloistBusy: false,
    soloistResting: false,
    soloistActive: true,
    soloistNotesInPhrase: 0,
    bassHit: true,
    kickHit: true,
    snareHit: true,
    accompanimentHit: false,
    sectionOccurrence: 1,
};

/** Drive getAccompanimentNotes over NUM_BARS and return per-bar hit steps. */
function runPass(currentLoopCount: number): boolean[][] {
    resetCompingState();
    const state = buildState(currentLoopCount);
    const chord = makeG7();
    const bars: boolean[][] = [];
    for (let bar = 0; bar < NUM_BARS; bar++) {
        const row = new Array(STEPS_PER_BAR).fill(false);
        for (let mStep = 0; mStep < STEPS_PER_BAR; mStep++) {
            const step = bar * STEPS_PER_BAR + mStep;
            const info = getStepInfo(step, SIX_EIGHT, [], TIME_SIGNATURES);
            const notes = getAccompanimentNotes(state, chord, step, step, mStep, info, COORD);
            row[mStep] = notes.some((n: any) => n && n.midi > 0 && !n.muted);
        }
        bars.push(row);
    }
    return bars;
}

describe('6/8 comping locks (determinism + pulse stability)', () => {
    it('(1) is deterministic loop-to-loop: identical (step, loop) → identical comp', () => {
        const a = runPass(0);
        const b = runPass(0);
        expect(b).toEqual(a);
    });

    it('(2) anchors the dotted-quarter pulses {0, 6} in nearly every bar', () => {
        const bars = runPass(0);
        let pulseCompleteBars = 0;
        let downbeatBars = 0;
        let secondPulseBars = 0;
        for (const row of bars) {
            if (row[0]) {
                downbeatBars++;
            }
            if (row[6]) {
                secondPulseBars++;
            }
            if (row[0] && row[6]) {
                pulseCompleteBars++;
            }
        }
        const completeShare = pulseCompleteBars / bars.length;
        console.log('\n[6/8 comping pulse anchoring]');
        console.log(`  downbeat {0} present:    ${downbeatBars}/${bars.length}`);
        console.log(`  second pulse {6} present:${secondPulseBars}/${bars.length}`);
        console.log(`  both pulses present:     ${pulseCompleteBars}/${bars.length}`);

        // Both dotted-quarter pulses should land in ~every bar — the waltz spine.
        expect(completeShare).toBeGreaterThanOrEqual(0.9);
    });

    it('(3) a different loop produces a coherent (still pulse-anchored) variation', () => {
        // Loop evolution is intended (like bass/drums) — a later loop may differ
        // but stays locked to the pulse rather than dissolving into randomness.
        const loop2 = runPass(2);
        const pulseShare = (bars: boolean[][]) =>
            bars.filter((r) => r[0] && r[6]).length / bars.length;
        expect(pulseShare(loop2)).toBeGreaterThanOrEqual(0.9);
        // Deterministic given the loop index: re-running loop 2 matches.
        expect(runPass(2)).toEqual(loop2);
    });
});
