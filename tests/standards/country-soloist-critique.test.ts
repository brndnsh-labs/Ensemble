import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

interface SoloChord {
    rootMidi: number;
    quality: string;
    intervals: number[];
    beats: number;
}

interface CapturedNote {
    bar: number;
    midis: number[];
    primaryMidi: number;
    device: string;
    isDoubleStop: boolean;
    chordRoot: number;
    chordQuality: string;
}

describe('Soloist Country Critique', () => {
    let soloistState: any;

    const makeState = (bandIntensity: number, complexity: number) => ({
        playback: {
            bandIntensity,
            bpm: 110,
            complexity,
            intent: {},
            lyricalBias: 0.4,
            currentLoopCount: 1,
        },
        groove: { genreFeel: 'Country', pocket: 0 },
        soloist: soloistState,
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    });

    beforeEach(() => {
        vi.restoreAllMocks();

        soloistState = makeSoloistMock({
            enabled: true,
            // Explicit 'country' STYLE_CONFIG profile. The Country *genre* in
            // smart mode also resolves here (SMART_GENRES.Country.soloist =
            // 'country' AND GENRE_STYLE_MAPPING.Country = 'country'), so unlike
            // Rock→shred there is no genre→profile drift — the resolution guard
            // below pins that. This is the profile a user actually hears.
            style: 'country',
            mode: 'guitar',
            octave: 64,
            sessionSteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            srdcState: 'Statement',
            qaState: 'Question',
            isResting: true,
            motifBuffer: [],
            thematicSeed: [],
            thematicSeedRoot: 0,
            isReplayingMotif: false,
            isReplayingSeed: false,
            busySteps: 0,
            pitchHistory: [],
            lastInterval: 0,
            stagnationCount: 0,
            deviceBuffer: [],
            lastFreq: 0,
            currentCell: null,
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'country',
            },
        });

        getState.mockReturnValue(makeState(0.85, 0.7));
    });

    const simulatePerformance = (numBars: number, intensity: number): CapturedNote[] => {
        getState.mockReturnValue(makeState(intensity, 0.7));
        const history: CapturedNote[] = [];
        // I-IV-V country progression in G (G-C-D) with one relative-minor (Em)
        // bar so the harness exercises both the major-pentatonic branch (the
        // signature claim) and the minor-pentatonic branch of the country
        // chord-scale (theory-scales.ts:111-121). The pentatonic assertions
        // below measure ONLY the major-chord notes.
        const G: SoloChord = { rootMidi: 55, quality: 'major', intervals: [0, 4, 7], beats: 4 };
        const C: SoloChord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
        const D: SoloChord = { rootMidi: 62, quality: 'major', intervals: [0, 4, 7], beats: 4 };
        const Em: SoloChord = { rootMidi: 64, quality: 'm', intervals: [0, 3, 7], beats: 4 };
        const progression = [G, G, C, G, D, C, Em, D];

        let lastFreq = 0;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = progression[bar % progression.length];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    'country',
                    step,
                    {},
                    // Real getStepInfo so the engine's beat/backbeat/offbeat lanes
                    // see live step metadata (avoids smell-e: a hand-rolled stepInfo
                    // would silence the lanes the soloist's rhythm planner reads).
                    getStepInfo(bar * 16 + step, {
                        beats: 4,
                        stepsPerBeat: 4,
                        grouping: [4],
                        backbeat: [1, 3],
                    }),
                );
                if (note) {
                    const arr = Array.isArray(note) ? note : [note];
                    const primary = arr[arr.length - 1];
                    lastFreq = (primary as any).frequency || 0;
                    history.push({
                        bar,
                        midis: arr.map((n) => n.midi),
                        primaryMidi: primary.midi,
                        device: (primary as any).device || 'none',
                        isDoubleStop: arr.length > 1 || (primary as any).isDoubleStop === true,
                        chordRoot: chord.rootMidi,
                        chordQuality: chord.quality,
                    });
                }
                soloistState.session.sessionSteps++;
            }
        }
        return history;
    };

    it('should pass an idiom critique for a 256-bar Country soloist performance', () => {
        const numBars = 256;
        const notes = simulatePerformance(numBars, 0.85);

        // --- Hard-coded target sets (NOT re-derived from the engine's chord-scale
        // predicate — re-using theory-scales would be smell-a). ---
        // Signature country lead scale = pure MAJOR PENTATONIC {0,2,4,7,9}
        // (theory-scales.ts:121).
        const MAJOR_PENT = new Set([0, 2, 4, 7, 9]);
        // Diatonic major collection — the frame for the low-chromaticism claim.
        const DIATONIC_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
        // Double-stop classes idiomatic to country (parallel 3rds & 6ths):
        // 3rds = {3,4}, 6ths (and their octave-folded minor/major form) = {8,9}.
        const THIRD_SIXTH = new Set([3, 4, 8, 9]);

        let majChordNotes = 0;
        let majPentOnMaj = 0;
        let diatonicOnMaj = 0;
        let chromaticOnMaj = 0;

        let doubleStopAttacks = 0;
        let dsClassifiable = 0;
        let dsThirdSixth = 0;

        const devices: Record<string, number> = {};

        for (const n of notes) {
            const rel = (n.primaryMidi - n.chordRoot + 120) % 12;

            // Pentatonic / chromaticism metrics: measure ONLY notes over MAJOR
            // chords (the named claim is "major-pentatonic on major chords").
            if (n.chordQuality === 'major') {
                majChordNotes++;
                if (MAJOR_PENT.has(rel)) {
                    majPentOnMaj++;
                }
                if (DIATONIC_MAJOR.has(rel)) {
                    diatonicOnMaj++;
                } else {
                    chromaticOnMaj++;
                }
            }

            devices[n.device] = (devices[n.device] || 0) + 1;

            if (n.isDoubleStop && n.midis.length >= 2) {
                doubleStopAttacks++;
                const iv = Math.abs(n.midis[n.midis.length - 1] - n.midis[0]) % 12;
                dsClassifiable++;
                if (THIRD_SIXTH.has(iv)) {
                    dsThirdSixth++;
                }
            }
        }

        const majPentShare = majPentOnMaj / majChordNotes;
        const diatonicShare = diatonicOnMaj / majChordNotes;
        const chromaticShare = chromaticOnMaj / majChordNotes;
        const doubleStopRate = doubleStopAttacks / notes.length;
        const thirdSixthShare = dsClassifiable ? dsThirdSixth / dsClassifiable : 0;

        const countryBendShareHi = (devices.countryBend || 0) / notes.length;
        const chickenPickShareHi = (devices.chickenPick || 0) / notes.length;

        // --- Random baselines (explicit, for the share assertions) ---
        // MAJOR_PENT = 5/12 PCs → uniform-chromatic baseline 0.4167.
        const MAJ_PENT_BASELINE = MAJOR_PENT.size / 12; // 0.4167
        // DIATONIC_MAJOR = 7/12 PCs → uniform-chromatic in-scale baseline 0.5833,
        // so the chromatic (out-of-scale) baseline is 5/12 = 0.4167.
        const CHROMATIC_BASELINE = (12 - DIATONIC_MAJOR.size) / 12; // 0.4167
        // THIRD_SIXTH = 4/12 interval classes → uniform baseline 0.3333.
        const THIRD_SIXTH_BASELINE = THIRD_SIXTH.size / 12; // 0.3333

        // --- Low-intensity comparison run for the device "at intensity" claim ---
        // countryBend / chickenPick are intensity-gated flourishes; the same
        // engine at low intensity must emit far fewer (a flat rate across
        // intensities would mean the gate is dead — smell-c discriminator).
        const loNotes = simulatePerformance(numBars, 0.2);
        const loDevices: Record<string, number> = {};
        for (const n of loNotes) {
            loDevices[n.device] = (loDevices[n.device] || 0) + 1;
        }
        const countryBendShareLo = (loDevices.countryBend || 0) / loNotes.length;
        const chickenPickShareLo = (loDevices.chickenPick || 0) / loNotes.length;

        console.log('\n--- COUNTRY SOLOIST CRITIQUE REPORT ---');
        console.log(
            `[Major-Pent Share /maj]   ${(majPentShare * 100).toFixed(1)}% (Target: >0.80; baseline ${MAJ_PENT_BASELINE.toFixed(3)})`,
        );
        console.log(
            `[Diatonic Share /maj]     ${(diatonicShare * 100).toFixed(1)}% (in-scale frame)`,
        );
        console.log(
            `[Chromatic Share /maj]    ${(chromaticShare * 100).toFixed(1)}% (Target: <0.12; baseline ${CHROMATIC_BASELINE.toFixed(3)})`,
        );
        console.log(
            `[Double-Stop Rate]        ${(doubleStopRate * 100).toFixed(1)}% (Target: >0.30)`,
        );
        console.log(
            `[DS 3rd/6th Share]        ${(thirdSixthShare * 100).toFixed(1)}% (Target: >0.65; baseline ${THIRD_SIXTH_BASELINE.toFixed(3)})`,
        );
        console.log(
            `[countryBend @0.85]       ${(countryBendShareHi * 100).toFixed(2)}% (Target: >0.025)`,
        );
        console.log(
            `[countryBend @0.20]       ${(countryBendShareLo * 100).toFixed(2)}% (Target: <0.015, < hi)`,
        );
        console.log(
            `[chickenPick @0.85]       ${(chickenPickShareHi * 100).toFixed(2)}% (Target: >0.025)`,
        );
        console.log(
            `[chickenPick @0.20]       ${(chickenPickShareLo * 100).toFixed(2)}% (Target: < hi)`,
        );
        console.log('---------------------------------------\n');

        // The soloist path is fully seeded (scrambleHash over step/section/loop).
        // Post-#617 there is no remaining non-seeded jitter: chickenPick's 3-vs-4
        // double-stop interval (the last Math.random in the device path) is now
        // scrambleHash(pickerSeedBase + 63), so this critique is bit-deterministic
        // across runs (measured 92.5% major-pent share, fixed). Thresholds carry
        // fixed headroom well clear of that value.

        // (a) MAJOR-PENTATONIC SHARE ON MAJOR CHORDS. Engine delivers ~92.1%.
        // Uniform-chromatic baseline is 0.417 (5/12 PCs); >0.80 sits ~38pp above
        // baseline and ~12pp below the engine's real output. Hard-coded target
        // set, measured only over major chords — the literal named claim.
        expect(majPentShare).toBeGreaterThan(0.8);

        // (d) LOW CHROMATICISM. Country is diatonic; out-of-scale notes over
        // major chords run ~4.3%. The uniform-chromatic out-of-scale baseline is
        // 0.417, so the engine sits ~37pp BELOW random — the opposite direction
        // from baseline, which is the point. <0.12 guards a regression that lets
        // the line wander chromatic, with ~7.7pp headroom over the engine's 4.3%.
        expect(chromaticShare).toBeLessThan(0.12);
        expect(chromaticShare).toBeLessThan(CHROMATIC_BASELINE);

        // (b) DOUBLE-STOPS PREDOMINANTLY 3rds/6ths. Two parts:
        //  - the country lead leans hard on double-stops (config doubleStopProb
        //    0.5): engine delivers ~49.8% of attacks as double-stops. >0.30
        //    guards the feature is alive with ~20pp headroom.
        //  - of those, the interval is a 3rd or 6th ~89.2% of the time. Uniform
        //    baseline over the 12 interval classes is 0.333; >0.65 sits ~32pp
        //    above baseline and ~24pp below the engine's output. "Predominantly"
        //    = a strict majority of classified double-stops, which 0.65 enforces.
        expect(doubleStopRate).toBeGreaterThan(0.3);
        expect(thirdSixthShare).toBeGreaterThan(0.65);
        expect(thirdSixthShare).toBeGreaterThan(THIRD_SIXTH_BASELINE);

        // (c) countryBend / chickenPick FIRE AT INTENSITY. Engine at 0.85:
        // countryBend ~5.4% share, chickenPick ~4.8% share. At 0.20: countryBend
        // ~0.2%, chickenPick ~1.1%. Two assertions each:
        //  - presence at high intensity (>0.025, ~2.9/2.3pp headroom)
        //  - the intensity gate is real (hi > lo; countryBend lo also stays
        //    near-zero <0.015). A flat rate would mean the intensity-scaled
        //    deviceProb gate is dead.
        expect(countryBendShareHi).toBeGreaterThan(0.025);
        expect(chickenPickShareHi).toBeGreaterThan(0.025);
        expect(countryBendShareHi).toBeGreaterThan(countryBendShareLo);
        expect(chickenPickShareHi).toBeGreaterThan(chickenPickShareLo);
        expect(countryBendShareLo).toBeLessThan(0.015);
    });

    // why: style-resolution guard (the reggae dead-profile / Rock→shred class of
    // bug). Unlike Rock (smart → 'shred', NOT 'rock'), the Country GENRE resolves
    // to the 'country' profile in BOTH paths — SMART_GENRES.Country.soloist =
    // 'country' and GENRE_STYLE_MAPPING.Country = 'country'. This pins that so a
    // future re-route can't silently make this critique test the wrong profile.
    it('resolves Country genre/style to the canonical country soloist profile', () => {
        // Smart mode + Country feel → 'country' (the SMART_GENRES routing).
        expect(resolveSoloistStyle('smart', 'Country')).toBe('country');
        // Absent explicit style also resolves via the genre feel → 'country'.
        expect(resolveSoloistStyle(undefined, 'Country')).toBe('country');
        // An explicit 'country' UI style is honored verbatim and not rewritten.
        expect(resolveSoloistStyle('country', 'Country')).toBe('country');
    });
});
