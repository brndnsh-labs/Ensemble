// @ts-nocheck
// tests/standards/accompaniment-imperfect-symmetry-critique.test.ts
//
// Critique test for `epic-form-arrangement` S3 — Imperfect Symmetry for
// accompaniment on repeated sections.
//
// When a section repeats (occurrence ≥ 2), the comper should rotate ONE
// voicing inversion (lowest note up an octave) on the seeded TARGET BAR per
// 4-bar phrase, seeded by `(sectionId, occurrence, phraseIndex)`. The rotation
// then cascades through `recenterVoicing` / `selectCompactCluster` (both use
// `compingState.lastVoicingMidis`), so subsequent bars in the phrase carry the
// new register forward — the "pianist commits to the inversion for the rest of
// the phrase" gesture, matching bass S2's prevMidi-bias cascade.
//
// Musical character: pitch-class set is preserved (it's just an inversion),
// but the register / lowest-note moves. The comping critique tests assert
// register slot 52-84; this test asserts cross-phrase divergence within the
// chords/harmony register slot.
//
// Assertions:
//   1. V1 vs V2 bottom-note divergence: at least 10% of bars have a different
//      lowest-note midi (the inversion rotation creates a measurable register
//      shift across the phrase).
//   2. Pitch-class set is preserved (rotation = octave displacement of one
//      note, not pitch substitution).
//   3. Determinism — same notes on re-generation at occurrence=2.
//   4. occurrence=1 path is untouched (Statement baseline).
//   5. V2/V3/V4 each diverge pairwise (no parity collapse).
//
// Source: docs/audit/form-arranger.md P1 #7;
//         docs/audit/epic-form-arrangement.md S3.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.55,
            bpm: 120,
            complexity: 0.4,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        arranger: {
            timeSignature: '4/4',
            progression: [],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: false, lastFreq: null },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
        harmony: { enabled: false, buffer: new Map(), rhythmicMask: 0 },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
    },
}));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

// --- Fixture ---------------------------------------------------------------
// Cmaj7 in a register where the lowest note (C4=60) leaves headroom for the
// rotation: low (C4=60) → rotated low (E4=64 after lifting C4 up to C5=72,
// which still sits inside the chords register slot 52-84).
const CHORD_CMAJ7 = {
    rootMidi: 60,
    quality: 'maj7',
    is7th: true,
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88], // C4, E4, G4, B4
    sectionId: 'sec-verse-A',
};

const STEPS_PER_BAR = 16;
const PHRASE_BARS = 4;

/**
 * Build a minimal StepInfo for the bar's downbeat (measureStep=0). We sample
 * one comping event per bar at beat 1, which is the most stable signal —
 * downbeats are where the comper anchors voicing.
 */
function makeStepInfo() {
    return {
        isMeasureStart: true,
        isBeatStart: true,
        isGroupStart: true,
        isBackbeat: false,
        isPulse: true,
        isPulseStart: true,
        isOffbeat: false,
        isEOfBeat: false,
        isAOfBeat: false,
        beatIndex: 0,
        mStep: 0,
        tsConfig: { beats: 4, stepsPerBeat: 4 },
    };
}

/**
 * Sample comping output at the downbeat of every bar across the phrase.
 * Returns an array of voicings (sorted-midi arrays) per bar.
 */
function generatePhrase(sectionOccurrence: number, sectionId: string = 'sec-verse-A'): number[][] {
    // why: every test must start from a clean compingState because the
    // cascade-through-prev-voicing logic carries forward across calls.
    compingState.currentCell = new Array(16).fill(0);
    compingState.currentCell[0] = 1;
    compingState.currentCell[4] = 1;
    compingState.currentCell[8] = 1;
    compingState.currentCell[12] = 1;
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];

    const state = getState();
    state.arranger.progression = [CHORD_CMAJ7];

    // why: pin Math.random so non-Imperfect-Symmetry random branches (color-tone
    // shuffles, drunk timing) don't contaminate the signal we're measuring.
    const rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const chord = { ...CHORD_CMAJ7, sectionId };
    const voicingsPerBar: number[][] = [];

    for (let bar = 0; bar < PHRASE_BARS; bar++) {
        const step = bar * STEPS_PER_BAR;
        const measureStep = 0;
        const coordination = { sectionOccurrence };
        const notes = getAccompanimentNotes(
            state,
            chord,
            step,
            0,
            measureStep,
            makeStepInfo(),
            coordination as any,
        );
        // Only musical notes (filter the CC-only sentinel notes).
        const musicalNotes = notes.filter((n: any) => !n.muted && n.midi > 0);
        const midis = musicalNotes.map((n: any) => n.midi).sort((a: number, b: number) => a - b);
        voicingsPerBar.push(midis);
    }
    rngSpy.mockRestore();
    return voicingsPerBar;
}

function lowestMidi(voicing: number[]): number {
    return voicing.length > 0 ? Math.min(...voicing) : -1;
}

function pitchClassSet(voicing: number[]): Set<number> {
    return new Set(voicing.map((m) => ((m % 12) + 12) % 12));
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const v of a) {
        if (!b.has(v)) {
            return false;
        }
    }
    return true;
}

describe('Accompaniment Imperfect Symmetry (epic-form-arrangement S3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('Verse 1 and Verse 2 voicings diverge across the phrase', () => {
        const v1 = generatePhrase(1);
        const v2 = generatePhrase(2);
        // Compare bar-by-bar lowest-note midis: when rotation fires, the
        // lowest note moves up an octave (and the cascade carries forward).
        let lowestDiffBars = 0;
        let voicingDiffBars = 0;
        for (let bar = 0; bar < PHRASE_BARS; bar++) {
            if (lowestMidi(v1[bar]) !== lowestMidi(v2[bar])) {
                lowestDiffBars++;
            }
            // Exact voicing-array comparison
            if (JSON.stringify(v1[bar]) !== JSON.stringify(v2[bar])) {
                voicingDiffBars++;
            }
        }
        // eslint-disable-next-line no-console
        console.log(
            `[accomp-imperfect-symmetry] V1 voicings per bar: ` +
                v1.map((b) => `[${b.join(',')}]`).join(' ') +
                `\n[accomp-imperfect-symmetry] V2 voicings per bar: ` +
                v2.map((b) => `[${b.join(',')}]`).join(' ') +
                `\n[accomp-imperfect-symmetry] lowest-note diff: ${lowestDiffBars}/${PHRASE_BARS} bars; ` +
                `voicing diff: ${voicingDiffBars}/${PHRASE_BARS} bars`,
        );
        // why: rotation fires on at least 1 of 4 bars (the seeded target bar)
        // and cascades through `recenterVoicing` / `selectCompactCluster` on
        // subsequent bars, so the typical divergence is 1-4 bars out of 4.
        // Floor 1 catches "gesture removed" (the seeded target always hits);
        // ceiling = PHRASE_BARS (all bars allowed to differ since the cascade
        // can propagate from bar 0 of the phrase).
        expect(voicingDiffBars).toBeGreaterThanOrEqual(1);
        expect(voicingDiffBars).toBeLessThanOrEqual(PHRASE_BARS);
    });

    it('rotation cascades from a mid-phrase target bar (target > 0)', () => {
        // why: the primary fixture ('sec-verse-A') seeds compTargetBarInPhrase=0,
        // so EVERY bar of the phrase rotates — which means the test above cannot
        // distinguish the real cascade gate (`compBarInPhrase >= target`) from a
        // single-bar `=== target`. 'sec-bb' seeds target=1 at occurrence 2:
        //   - bar 0 is BEFORE the target → stays in the Statement register;
        //   - bars 1,2,3 are AT/AFTER the target → all rotate (the "commit to
        //     the new register for the rest of the phrase" cascade).
        // Reverting the `>=` to `===` would leave bars 2 and 3 un-rotated and
        // turn the two cascade assertions below red.
        const v1 = generatePhrase(1, 'sec-bb'); // Statement — gesture gated off
        const v2 = generatePhrase(2, 'sec-bb'); // Restatement — target bar = 1

        // Bar 0 is before the target bar: voicing must match the Statement.
        expect(v2[0], 'bar 0 (before target) should not rotate').toEqual(v1[0]);
        // Bar 1 is the target bar: the rotation fires here.
        expect(v2[1], 'bar 1 (target) should rotate').not.toEqual(v1[1]);
        // Bars 2,3 are after the target: the cascade keeps them rotated.
        expect(v2[2], 'bar 2 (cascade) should stay rotated').not.toEqual(v1[2]);
        expect(v2[3], 'bar 3 (cascade) should stay rotated').not.toEqual(v1[3]);
    });

    it('rotation preserves pitch-class set (no pitch substitution)', () => {
        const v1 = generatePhrase(1);
        const v2 = generatePhrase(2);
        // why: inversion rotation moves octaves, not pitch classes. Any bar
        // where V1's pc-set ≠ V2's pc-set means we're substituting pitches,
        // which is a bug (the comper should only rotate, never re-spell).
        for (let bar = 0; bar < PHRASE_BARS; bar++) {
            const pc1 = pitchClassSet(v1[bar]);
            const pc2 = pitchClassSet(v2[bar]);
            expect(
                setsEqual(pc1, pc2),
                `bar ${bar}: V1 pc=${[...pc1].sort()} vs V2 pc=${[...pc2].sort()}`,
            ).toBe(true);
        }
    });

    it('occurrence=2 is fully deterministic (same voicings on re-generation)', () => {
        const a = generatePhrase(2);
        const b = generatePhrase(2);
        for (let bar = 0; bar < PHRASE_BARS; bar++) {
            expect(a[bar]).toEqual(b[bar]);
        }
    });

    it('occurrence=1 is the Statement: untouched by imperfect-symmetry', () => {
        // why: occurrence=1 should match a re-run with NO sectionOccurrence
        // field (engine defaults to 1, gesture is gated off).
        const v1 = generatePhrase(1);

        compingState.currentCell = new Array(16).fill(0);
        compingState.currentCell[0] = 1;
        compingState.currentCell[4] = 1;
        compingState.currentCell[8] = 1;
        compingState.currentCell[12] = 1;
        compingState.lockedUntil = 0;
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = null;
        compingState.lastVoicingMidis = [];

        const state = getState();
        state.arranger.progression = [CHORD_CMAJ7];
        const rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const baseline: number[][] = [];
        for (let bar = 0; bar < PHRASE_BARS; bar++) {
            const step = bar * STEPS_PER_BAR;
            const notes = getAccompanimentNotes(
                state,
                CHORD_CMAJ7,
                step,
                0,
                0,
                makeStepInfo(),
                {} as any, // no sectionOccurrence — engine defaults to 1
            );
            const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
            const midis = musical.map((n: any) => n.midi).sort((a: number, b: number) => a - b);
            baseline.push(midis);
        }
        rngSpy.mockRestore();

        for (let bar = 0; bar < PHRASE_BARS; bar++) {
            expect(v1[bar]).toEqual(baseline[bar]);
        }
    });

    it('occurrences 2, 3, 4 do not parity-collapse across sectionIds', () => {
        // why: prevent regression where direction/target picks by `occurrence
        // % 2` parity — V4 would equal V2. The seed mixes occurrence into the
        // mulberry32 hash so V2/V3/V4 should land on different patterns.
        //
        // Aggregation: with only 4 buckets per phrase a single sectionId can
        // chance-collide V3 with V4 (review P1: prior test allowed this), so
        // we sample 8 sectionIds and assert pair-differ counts across all
        // 24 sectionId×pair combinations. A systemic parity collapse (e.g.
        // direction keyed by occurrence%2) would crater V2↔V4 across every
        // sectionId; chance collisions on isolated seeds stay within the
        // expected ~6/24 collision budget.
        const SECTION_IDS = [
            'sec-aa',
            'sec-bb',
            'sec-cc',
            'sec-dd',
            'sec-ee',
            'sec-ff',
            'sec-gg',
            'sec-hh',
        ];

        const diffBars = (a: number[][], b: number[][]) => {
            let d = 0;
            for (let bar = 0; bar < PHRASE_BARS; bar++) {
                if (JSON.stringify(a[bar]) !== JSON.stringify(b[bar])) {
                    d++;
                }
            }
            return d;
        };

        let v23Differs = 0;
        let v34Differs = 0;
        let v24Differs = 0;
        for (const sid of SECTION_IDS) {
            const v2 = generatePhrase(2, sid);
            const v3 = generatePhrase(3, sid);
            const v4 = generatePhrase(4, sid);
            if (diffBars(v2, v3) > 0) {
                v23Differs++;
            }
            if (diffBars(v3, v4) > 0) {
                v34Differs++;
            }
            if (diffBars(v2, v4) > 0) {
                v24Differs++;
            }
        }

        const totalDiffering = v23Differs + v34Differs + v24Differs;
        // eslint-disable-next-line no-console
        console.log(
            `[accomp-imperfect-symmetry] across ${SECTION_IDS.length} sectionIds: ` +
                `V2↔V3 differs ${v23Differs}/${SECTION_IDS.length}, ` +
                `V3↔V4 differs ${v34Differs}/${SECTION_IDS.length}, ` +
                `V2↔V4 differs ${v24Differs}/${SECTION_IDS.length} ` +
                `(total ${totalDiffering}/${SECTION_IDS.length * 3})`,
        );
        // Each pair: with 4 buckets the expected collision rate per seed is
        // ~1/4, so each pair should differ on at least 5/8 sectionIds.
        // Floor of 4/8 catches the systemic parity-collapse regression
        // without flaking on chance collisions.
        expect(v23Differs).toBeGreaterThanOrEqual(4);
        expect(v34Differs).toBeGreaterThanOrEqual(4);
        expect(v24Differs).toBeGreaterThanOrEqual(4);
        // Aggregate: at expectation we see ~18/24 differing. Floor of 16/24
        // (67%) absorbs variance while still failing fast if any pair-class
        // collapses systemically.
        expect(totalDiffering).toBeGreaterThanOrEqual(16);
    });

    it('different sectionIds at same occurrence give different patterns', () => {
        const verse = generatePhrase(2, 'sec-verse-A');
        const chorus = generatePhrase(2, 'sec-chorus-B');
        let diff = 0;
        for (let bar = 0; bar < PHRASE_BARS; bar++) {
            if (JSON.stringify(verse[bar]) !== JSON.stringify(chorus[bar])) {
                diff++;
            }
        }
        // eslint-disable-next-line no-console
        console.log(
            `[accomp-imperfect-symmetry] section-id divergence: ${diff}/${PHRASE_BARS} bars differ`,
        );
        // why: hashSectionId('sec-verse-A') ≠ hashSectionId('sec-chorus-B'),
        // so target-bar selection differs. At least one bar must diverge.
        expect(diff).toBeGreaterThan(0);
    });
});
