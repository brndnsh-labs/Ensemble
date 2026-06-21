import { describe, expect, it, vi } from 'vitest';
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
    primaryMidi: number;
    device: string;
    chordRoot: number;
    chordQuality: string;
}

// Two profiles share the SAME idiom claim: over dominant chords a shredder
// plays the harmonic-minor-flavored PHRYGIAN_DOMINANT, not generic MIXOLYDIAN.
// #550: `shred` had no branch in getScaleForChord → it fell to MIXOLYDIAN while
// `metal` got PHRYGIAN_DOMINANT, so shred leads sounded generic-rock. The fix
// extends the metal scale branch to cover shred; this test pins BOTH.
const STYLES: Array<{ style: string; genreFeel: string }> = [
    { style: 'metal', genreFeel: 'Metal' },
];

describe('Soloist Metal Critique', () => {
    let soloistState: any;

    const makeState = (genreFeel: string, bandIntensity: number) => ({
        playback: {
            bandIntensity,
            bpm: 160,
            complexity: 0.8,
            intent: {},
            lyricalBias: 0.1,
            currentLoopCount: 1,
        },
        groove: { genreFeel, pocket: 0 },
        soloist: soloistState,
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4', key: 'E', isMinor: true },
    });

    const buildSoloistState = (style: string) =>
        makeSoloistMock({
            enabled: true,
            style,
            mode: 'guitar',
            octave: 64,
            sessionSteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            srdcState: 'Statement',
            qaState: 'Question',
            isResting: true,
            // tension stays low so the high-tension ALTERED branch
            // (theory-scales.ts:180) never overrides the metal/shred scale branch
            // we're actually testing.
            tension: 0,
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
                profile: style,
            },
        });

    const simulatePerformance = (
        style: string,
        genreFeel: string,
        numBars: number,
        intensity: number,
    ): CapturedNote[] => {
        soloistState = buildSoloistState(style);
        getState.mockReturnValue(makeState(genreFeel, intensity));
        const history: CapturedNote[] = [];

        // A cycle-of-fifths DOMINANT-7 progression (all quality '7'): every chord
        // routes through the dominant branch of getScaleForChord. The next chord is
        // always dominant (never minor), so the V7→i "resolves to minor" branch
        // (:197) never fires — the only path that can return PHRYGIAN_DOMINANT here
        // is the metal/shred style branch at :212, which is the fix under test.
        const dom = (rootMidi: number): SoloChord => ({
            rootMidi,
            quality: '7',
            intervals: [0, 4, 7, 10],
            beats: 4,
        });
        // E7 A7 D7 G7 C7 F7 (descending fifths, all dominant)
        const progression = [dom(52), dom(57), dom(50), dom(55), dom(48), dom(53)];

        let lastFreq = 0;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = progression[bar % progression.length];
            const nextChord = progression[(bar + 1) % progression.length];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord as any,
                    nextChord as any,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    style,
                    step,
                    {},
                    // Real getStepInfo so the engine's beat/offbeat lanes see live
                    // step metadata (avoids smell-e: a hand-rolled stepInfo would
                    // silence the lanes the soloist's rhythm planner reads).
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
                        primaryMidi: primary.midi,
                        device: (primary as any).device || 'none',
                        chordRoot: chord.rootMidi,
                        chordQuality: chord.quality,
                    });
                }
                soloistState.session.sessionSteps++;
            }
        }
        return history;
    };

    // --- Hard-coded target sets (NOT re-derived from the engine's chord-scale
    // predicate — re-using theory-scales would be smell-a). ---
    // PHRYGIAN_DOMINANT = {0,1,4,5,7,8,10} (theory-scales.ts:41). The old
    // fallback bug returned MIXOLYDIAN = {0,2,4,5,7,9,10}. The two scales share
    // chord tones {0,4,5,7,10}, so chord-tone emphasis can't tell them apart. What
    // CAN: the color tones each owns exclusively — phrygian {b2=1, b6=8} vs
    // mixolydian {maj2=2, maj6=9}. The per-degree counts below read those.
    const PHRYGIAN_DOMINANT = new Set([0, 1, 4, 5, 7, 8, 10]);

    for (const { style, genreFeel } of STYLES) {
        it(`plays phrygian-dominant (not mixolydian) over dominant chords — ${style}`, () => {
            const numBars = 256;
            const notes = simulatePerformance(style, genreFeel, numBars, 0.85);

            let inPhrygianDom = 0;
            // 6th degree: b6 (8) is phrygian-dominant; maj6 (9) is mixolydian.
            // NEITHER is a targetExtension, so this contrast PURELY reflects the
            // scale the engine chose — the cleanest read on the fix.
            let flatSix = 0;
            let majSix = 0;
            // 2nd degree: b2 (1, phrygian) vs maj2 (2, mixolydian). Contaminated —
            // both profiles set targetExtensions:[2] (the natural 9), which rewards
            // maj2 regardless of scale, so this contrast is reported but NOT gated.
            let flatTwo = 0;
            let majTwo = 0;
            const devices: Record<string, number> = {};

            for (const n of notes) {
                const rel = (n.primaryMidi - n.chordRoot + 120) % 12;
                if (PHRYGIAN_DOMINANT.has(rel)) {
                    inPhrygianDom++;
                }
                if (rel === 8) {
                    flatSix++;
                }
                if (rel === 9) {
                    majSix++;
                }
                if (rel === 1) {
                    flatTwo++;
                }
                if (rel === 2) {
                    majTwo++;
                }
                devices[n.device] = (devices[n.device] || 0) + 1;
            }

            const pdConformance = inPhrygianDom / notes.length;
            // Of the notes that play SOME 6th, the fraction that play the flat 6th.
            // Phrygian dominant has b6 and no maj6; mixolydian has maj6 and no b6,
            // so a phrygian-dominant line lands here near 1.0, a mixolydian line
            // near 0.0. Baseline (uniform over the two PCs) is 0.5; the fix pushes
            // it well above. This is THE discriminator (uncontaminated by config).
            const sixthPicks = flatSix + majSix;
            const flatSixShare = sixthPicks ? flatSix / sixthPicks : 0;
            // The phrygian b2 IS present (proves harmonic-minor color reaches the
            // 2nd too); reported for context — gated only as "non-vacuous".
            const secondPicks = flatTwo + majTwo;
            const flatTwoShare = secondPicks ? flatTwo / secondPicks : 0;

            // scalar-run density: both profiles allow the 'run' device with a high
            // deviceProb (metal 0.5 / shred 0.4) — the shredder's signature fast
            // scalar bursts. A dead 'run' lane would read as 0 here.
            const runShare = (devices.run || 0) / notes.length;

            console.log(`\n--- METAL/SHRED SOLOIST CRITIQUE (${style}) ---`);
            console.log(
                `[Phrygian-Dom conformance] ${(pdConformance * 100).toFixed(1)}% (Target: >0.62)`,
            );
            console.log(
                `[b6 share of 6ths]         ${(flatSixShare * 100).toFixed(1)}% (Target: >0.52; clean scale read, baseline 0.5)`,
            );
            console.log(`[b6 count]                 ${flatSix}  [maj6 count] ${majSix}`);
            console.log(
                `[b2 share of 2nds]         ${(flatTwoShare * 100).toFixed(1)}% (config targets maj2, so ~0.4-0.5 expected; not gated)`,
            );
            console.log(`[b2 count]                 ${flatTwo}  [maj2 count] ${majTwo}`);
            console.log(
                `[Run device share]         ${(runShare * 100).toFixed(1)}% (Target: >0.05)`,
            );
            console.log('-------------------------------------------\n');

            // (a) SCALE-COHERENCE FLOOR (not the discriminator). The line lives in
            // a 7-note dominant collection: metal 67.5% / shred 76.8%. Random
            // 7-of-12 baseline is 0.583, lifted by the chord-tone floor. NB: this
            // does NOT separate phrygian from mixolydian (mixolydian conforms just
            // as well — bug-state shred sits at 71%); it only guards the line from
            // wandering atonal. The real discriminator is (b).
            expect(pdConformance).toBeGreaterThan(0.62);

            // (b) THE FIX, on its cleanest discriminator — the 6th. Phrygian
            // dominant owns b6; mixolydian owns maj6; NEITHER is a targetExtension,
            // so of the 6ths the line plays, the b6 share reads the chosen scale
            // with no config pulling on it. Calibrated against the bug (shred
            // reverted to the mixolydian fallback):
            //     bug shred 42.4%  →  fixed shred 65.0% ;  metal (ref) 56.9%
            // The fix flips shred across the 0.5 random baseline. >0.52 sits just
            // above baseline: both fixed profiles clear it (metal +4.9pp, shred
            // +13pp) while the bug state fails by ~10pp. (The 2nd is contaminated
            // by targetExtensions:[2] rewarding maj2, so it is reported, not gated.)
            expect(flatSixShare).toBeGreaterThan(0.52);
            // b2 IS emitted (harmonic-minor color reaches the 2nd too) — not
            // vacuously zero, even though the maj2 targetExtension competes for it.
            expect(flatTwo).toBeGreaterThan(0);

            // (c) SCALAR-RUN DENSITY. The 'run' device is alive for the shredder.
            // Engine: metal 73.5% / shred 47.0%. >0.05 guards the lane isn't dead.
            expect(runShare).toBeGreaterThan(0.05);
        });
    }

    // why: style-resolution guard (the reggae dead-profile / Rock→shred class of
    // bug — see the project memory "Genre→profile resolution-guard"). #550's root
    // cause was a profile reached only by an alias path. This pins every route to
    // the shred/metal profiles so a future re-route can't silently make this
    // critique test exercise the wrong scale.
    it('resolves Metal genre + aliases to the canonical metal soloist profile', () => {
        // Metal genre (smart) → 'metal' (SMART_GENRES.Metal.soloist).
        expect(resolveSoloistStyle('smart', 'Metal')).toBe('metal');
        expect(resolveSoloistStyle('metal', 'Metal')).toBe('metal');
        // #628: the `shred` phantom profile is retired (Shred was never a live
        // genre). Its former routes now gracefully degrade — the legacy 'evh'
        // alias re-points to 'rock', and the unknown 'Shred' feel maps to the
        // neutral 'scalar' fallback rather than a dedicated phantom profile.
        expect(resolveSoloistStyle('evh', undefined)).toBe('rock');
        expect(resolveSoloistStyle('smart', 'Shred')).toBe('scalar');
        // NEGATIVE guard: the Rock genre deliberately keeps its own bluesy 'rock'
        // profile (#592) — it must NOT drift onto metal/phrygian dominant.
        expect(resolveSoloistStyle('smart', 'Rock')).toBe('rock');
    });
});
