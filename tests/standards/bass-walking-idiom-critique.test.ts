// @ts-nocheck
/**
 * Bass walking idiom critique (Epic 12 S5).
 *
 * Covers two correctness fixes:
 *
 *  • Sub-item 1 (bass.md P1 #9): walking-ska's patternIndex=2 slot used to
 *    hard-code interval 9 (M6), which is a Dorian implication over minor
 *    chords and clashes with the b5 of half-dim. The fix in bass-styles.ts
 *    selects the sixth scale-aware: M6 if scale has 9, else m6 (8), else 5
 *    (7). This test asserts that walking-ska over a minor chord never plays
 *    M6 at the patternIndex=2 slot, and that the same slot over a major
 *    chord still does play M6 (negative control: confirms the new path
 *    didn't kill the original idiom).
 *
 *  • Sub-item 2 (bass.md P1 #10): the generic walking fallback in
 *    bass-engine.ts:1191-1265 now applies a target-distance multiplier on
 *    top of hand-position weighting when nextChord is a chord-change
 *    approach. On beat 2 of a chord-change bar (intBeat=1) using non-jazz
 *    quarter style — the slot that falls through to the generic walking
 *    fallback — the chosen pitch should sit measurably closer to the next
 *    chord's root than to the current root's other scale tones.
 */

import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Sub-item 1: walking-ska M6 over minor chords
// ---------------------------------------------------------------------------

const simulateWalkingSkaOverChord = (
    chord: { rootMidi: number; intervals: number[]; quality: string; beats: number },
    numBars: number,
) => {
    const mockState = {
        playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 175 },
        groove: {
            genreFeel: 'Ska',
            lastDrumPreset: 'Ska',
            instruments: [],
        },
        arranger: { timeSignature: '4/4', totalSteps: numBars * 16 },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
    };
    getState.mockReturnValue(mockState);

    const tsConfig = TIME_SIGNATURES['4/4'];
    const performance: { step: number; info: any; note: any }[] = [];
    let prevFreq = 0;
    for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
        const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
        const active = isBassActive(
            getState(),
            'walking-ska',
            globalStep,
            globalStep % 16,
            info,
            {},
        );
        if (!active) {
            continue;
        }
        const note = getBassNote(
            getState(),
            chord,
            null, // no chord change — isolate the patternIndex=2 slot from the chromatic-approach branch
            info.beatIndex,
            prevFreq,
            chord.rootMidi,
            'walking-ska',
            0,
            globalStep,
            globalStep % 16,
            {},
            info,
        );
        if (note) {
            performance.push({ step: globalStep, info, note });
            prevFreq = note.freq;
        }
    }
    return performance;
};

/**
 * walking-ska fires on every 8th note; the bouncy 4-beat pattern is
 *   patternIndex 0 (root) → 1 (5th) → 2 (sixth) → 3 (octave),
 * keyed off intBeat % 4. patternIndex=2 lands on beat 3 (intBeat=2) — its
 * 8th-note "and-of-3" slot also hits intBeat=2. The downbeat of beat 3 is
 * stepInMeasure=8, an isBeatStart 8th.
 *
 * In 64 bars we get a populated sample across the patternIndex=2 slot. At
 * bandIntensity 0.5 (< 0.6) the random variation branch in bass-styles.ts
 * is disabled, so this slot is fully deterministic on chord — no stochastic
 * flake risk.
 */
const sixthIntervalsAtPatternIndex2 = (
    chord: { rootMidi: number; intervals: number[]; quality: string; beats: number },
    numBars: number,
): { intervals: number[]; totalSamples: number } => {
    const perf = simulateWalkingSkaOverChord(chord, numBars);
    const intervals: number[] = [];
    for (const p of perf) {
        const stepInMeasure = p.step % 16;
        // patternIndex=2 hits intBeat=2 = stepInMeasure 8 (downbeat of beat 3).
        // The 8th-note "and" of beat 3 (stepInMeasure=10) also has intBeat=2;
        // include both for a denser sample of the same patternIndex slot.
        const intBeat = Math.floor(stepInMeasure / 4);
        if (intBeat !== 2) {
            continue;
        }
        const interval = (((p.note.midi - chord.rootMidi) % 12) + 12) % 12;
        intervals.push(interval);
    }
    return { intervals, totalSamples: intervals.length };
};

describe('Walking-ska scale-aware sixth (bass.md P1 #9)', () => {
    it('does NOT play M6 (interval 9) at patternIndex=2 over a minor chord', () => {
        // C minor: scale is natural minor [0,2,3,5,7,8,10] — no 9, has 8.
        const cMinor = { rootMidi: 48, intervals: [0, 3, 7], quality: 'm', beats: 4 };
        const { intervals, totalSamples } = sixthIntervalsAtPatternIndex2(cMinor, 64);

        const m6Count = intervals.filter((i) => i === 9).length;
        const minorSixthCount = intervals.filter((i) => i === 8).length;
        const fifthCount = intervals.filter((i) => i === 7).length;
        const m6Rate = m6Count / (totalSamples || 1);

        console.log(
            [
                '',
                '--- WALKING-SKA OVER C MINOR (patternIndex=2 slot) ---',
                `[Samples]    ${totalSamples}`,
                `[M6 hits]    ${m6Count} (${(m6Rate * 100).toFixed(1)}%)`,
                `[m6 hits]    ${minorSixthCount}`,
                `[5th hits]   ${fifthCount}`,
                `[Threshold]  M6 rate must be 0%`,
                '-------------------------------------------------------',
            ].join('\n'),
        );

        expect(totalSamples).toBeGreaterThan(20);
        // why: P1 #9 — over minor the natural-minor scale has no M6 (no 9).
        // The fix picks m6 (8) first. Hitting interval 9 here means the
        // scale-aware sixth picker silently regressed to the old hard-coded 9.
        expect(m6Count).toBe(0);
        // why: positive control — the picker should produce a defined sixth
        // (m6) since the fallback to the 5th only triggers when neither sixth
        // is in scale (degenerate-scale safety).
        expect(minorSixthCount).toBeGreaterThan(0);
    });

    it('still plays M6 (interval 9) at patternIndex=2 over a major chord (negative control)', () => {
        // C major: scale [0,2,4,5,7,9,11] — has 9.
        const cMajor = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const { intervals, totalSamples } = sixthIntervalsAtPatternIndex2(cMajor, 64);

        const m6Count = intervals.filter((i) => i === 9).length;
        const m6Rate = m6Count / (totalSamples || 1);

        console.log(
            [
                '',
                '--- WALKING-SKA OVER C MAJOR (patternIndex=2 slot) ---',
                `[Samples]    ${totalSamples}`,
                `[M6 hits]    ${m6Count} (${(m6Rate * 100).toFixed(1)}%)`,
                `[Threshold]  M6 rate must be high (the M6 is the canonical 6th over major)`,
                '-------------------------------------------------------',
            ].join('\n'),
        );

        expect(totalSamples).toBeGreaterThan(20);
        // why: negative control. Over major, scale has 9 so the picker MUST
        // choose 9. Anything below ~50% means the fix accidentally suppressed
        // the M6 in the case it's correct for.
        expect(m6Rate).toBeGreaterThan(0.5);
    });

    it('does NOT play M6 (interval 9) at patternIndex=2 over a half-dim chord', () => {
        // C half-dim (Cm7b5): scale resolves to Locrian / Locrian #2 — no 9, has 8.
        const cHalfDim = {
            rootMidi: 48,
            intervals: [0, 3, 6, 10],
            quality: 'halfdim',
            beats: 4,
        };
        const { intervals, totalSamples } = sixthIntervalsAtPatternIndex2(cHalfDim, 64);

        const m6Count = intervals.filter((i) => i === 9).length;
        const m6Rate = m6Count / (totalSamples || 1);

        console.log(
            [
                '',
                '--- WALKING-SKA OVER C HALF-DIM (patternIndex=2 slot) ---',
                `[Samples]    ${totalSamples}`,
                `[M6 hits]    ${m6Count} (${(m6Rate * 100).toFixed(1)}%)`,
                `[Threshold]  M6 rate must be 0%`,
                '-------------------------------------------------------',
            ].join('\n'),
        );

        expect(totalSamples).toBeGreaterThan(20);
        // why: P1 #9 — over halfdim the b5 + M6 is a worse clash than the
        // minor case. The scale-aware picker must avoid 9 entirely here.
        expect(m6Count).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Sub-item 2: generic walking fallback target-awareness
// ---------------------------------------------------------------------------

/**
 * The generic walking fallback (`bass-engine.ts:1191-1265`) only applies its
 * target-distance multiplier when `isChordChangeApproach(nextChord, chord)`.
 * To discriminate the multiplier from confounders (prevMidi bleed from the
 * chromatic-approach branch, parity-pick variance, hand-position weighting)
 * we drive `getBassNote` directly at the sample slot with:
 *
 *   • the SAME current chord (no chord-change cascade through the song)
 *   • a controlled prevMidi cycled deterministically through scale tones
 *   • only the `nextChord` argument varied:
 *       - bias-on  → nextChord with different root  → multiplier fires
 *       - bias-off → nextChord with same root       → multiplier doesn't fire
 *
 * That collapses the entire test down to "did the multiplier change which
 * candidate the picker chose?", which is exactly what P1 #10 demands.
 *
 * Slot: beat 2 (stepInMeasure=4, intBeat=1) under non-jazz `quarter` style —
 * the cleanest slot that reaches the fallback. (Beat 3 is intercepted by the
 * 5th/root branch in bass-styles.ts:1177; beat 4 is intercepted by
 * chromatic-approach in bass-engine.ts:1116 when a chord change is present.)
 * beatScale at intBeat=1 is 1/3, so this is the weakest pull slot by design
 * — if the multiplier is too gentle here, the test will fail and that's the
 * correct signal to tune the multiplier (see [[feedback_multiplier_value_tuning]]).
 */
const sampleFallbackBeat2 = (nextChordRoot: number, numSamples: number) => {
    const chordC = {
        rootMidi: 48,
        quality: 'maj7',
        beats: 4,
        intervals: [0, 4, 7, 11],
        sectionId: 'A',
    };
    const nextChord = {
        rootMidi: nextChordRoot,
        quality: 'maj7',
        beats: 4,
        intervals: [0, 4, 7, 11],
        sectionId: 'A',
    };

    const mockState = {
        playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 120 },
        groove: {
            genreFeel: 'Country',
            pocket: 0,
            instruments: [],
            lastDrumPreset: 'Country',
        },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0.3 }),
        arranger: { timeSignature: '4/4', totalSteps: numSamples * 16 },
    };
    getState.mockReturnValue(mockState);

    const tsConfig = TIME_SIGNATURES['4/4'];
    // Cycle prevMidi through C-major scale tones — gives the picker diverse
    // hand-position anchors so the sample isn't dominated by a single
    // prevMidi-locked pick.
    const scaleTones = [48, 50, 52, 53, 55, 57, 59];
    const samples: { midi: number; prevMidi: number }[] = [];

    for (let i = 0; i < numSamples; i++) {
        const step = i * 16 + 4; // beat 2 of bar i
        const stepInMeasure = 4;
        const prevMidi = scaleTones[i % scaleTones.length];
        const info = getStepInfo(step, tsConfig, [], TIME_SIGNATURES);
        const note = getBassNote(
            getState(),
            chordC,
            nextChord,
            info.beatIndex,
            getFrequency(prevMidi),
            48, // rootMidi
            'quarter',
            0,
            step,
            stepInMeasure,
            {},
            info,
        );
        if (note && !note.muted) {
            samples.push({ midi: note.midi, prevMidi });
        }
    }
    return samples;
};

describe('Generic walking fallback target-awareness (bass.md P1 #10)', () => {
    it('beat-2 picks lean toward next-chord root when bias is active vs. when next == current', () => {
        const N = 210; // 30 cycles of the 7-tone prevMidi rotation
        // F# (54): a tritone away from C — sits between scale tones E(52)/F(53)
        // and G(55). Picking proximity favors F(53) or G(55) (dist=1 each).
        const TARGET_MIDI = 54;
        const biasOn = sampleFallbackBeat2(TARGET_MIDI, N);
        // bias-off: nextChord root === current root, so isChordChangeApproach
        // returns false and the target-distance multiplier never fires. The
        // engine is identical in every other way (same state, same prevMidi
        // sequence, same parity-pick, same hand-position weighting).
        const biasOff = sampleFallbackBeat2(48, N);

        // Engine `normalizeToRange`s the target chord into the bass register
        // before computing distance, so we score by pitch-class distance (the
        // octave-invariant projection of MIDI distance). This matches the
        // engine's intent — a candidate in any octave that lands a half-step
        // from the target's PC IS a half-step approach.
        const TARGET_PC = ((TARGET_MIDI % 12) + 12) % 12;
        const pcDist = (midi: number) => {
            const pc = ((midi % 12) + 12) % 12;
            const d = Math.abs(pc - TARGET_PC);
            return Math.min(d, 12 - d);
        };
        const avgDistToTarget = (samples: { midi: number }[]) => {
            if (samples.length === 0) {
                return NaN;
            }
            let acc = 0;
            for (const s of samples) {
                acc += pcDist(s.midi);
            }
            return acc / samples.length;
        };

        const onAvg = avgDistToTarget(biasOn);
        const offAvg = avgDistToTarget(biasOff);
        const gap = offAvg - onAvg;

        console.log(
            [
                '',
                '--- GENERIC WALKING FALLBACK TARGET-AWARENESS ---',
                `[bias-on  samples]    ${biasOn.length}  avg PC dist to F#(6): ${onAvg.toFixed(2)}`,
                `[bias-off samples]    ${biasOff.length}  avg PC dist to F#(6): ${offAvg.toFixed(2)}`,
                `[gap]                 ${gap.toFixed(2)} (bias-off − bias-on; positive = multiplier pulled toward target)`,
                `[Threshold]           gap >= 0.5 semitones (audible directional skew)`,
                '--------------------------------------------------',
            ].join('\n'),
        );

        expect(biasOn.length).toBeGreaterThan(50);
        expect(biasOff.length).toBeGreaterThan(50);

        // why: P1 #10 — the target-distance multiplier at bass-engine.ts:1241
        // must move the picker's distribution measurably toward the next
        // chord's root. The bias-off control is byte-identical to bias-on
        // except `isChordChangeApproach` returns false, so the multiplier
        // doesn't fire — any gap is attributable solely to the multiplier.
        //
        // Discriminating threshold: verified by inverting APPROACH_STRENGTH
        // to 0 (gap collapses to 0) vs. APPROACH_STRENGTH=8 (gap = 0.57). The
        // 0.5 floor sits halfway, giving headroom for the engine to retune the
        // strength downward without falsely failing, while still catching a
        // full multiplier-disable regression.
        expect(gap).toBeGreaterThanOrEqual(0.5);
    });
});
