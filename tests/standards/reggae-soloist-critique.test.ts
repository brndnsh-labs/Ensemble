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
    step: number; // absolute step
    stepInBar: number; // 0..15
    primaryMidi: number;
    device: string;
    chordRoot: number;
    chordQuality: string;
}

describe('Soloist Reggae Critique', () => {
    let soloistState: any;

    const makeState = (bandIntensity: number, complexity: number, style: string) => ({
        playback: {
            bandIntensity,
            bpm: 76,
            complexity,
            intent: {},
            lyricalBias: 0.4,
            currentLoopCount: 1,
        },
        groove: { genreFeel: 'Reggae', pocket: 0 },
        soloist: { ...soloistState, style },
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    });

    // Fresh soloist mock for a given style/profile. Rebuilt per simulate run so
    // the reggae run and the 'minimal' contrast run are hermetic — neither
    // inherits the other's accumulated sessionSteps / pitch history (a stale
    // mock would couple their seeded streams; see the contrast run below).
    const buildMock = (profile: string) =>
        makeSoloistMock({
            enabled: true,
            // The tailored 'reggae' STYLE_CONFIG profile (soloist-config.ts:476 —
            // syncopationLikelihood 0.9, restBase 0.12, targetExtensions [2,6,9],
            // device 'guitarDouble'). Since #570 this is what the Reggae genre
            // plays in smart mode — it used to be orphaned behind the generic
            // 'minimal' (see the resolution-guard below).
            style: profile,
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
                profile,
            },
        });

    beforeEach(() => {
        vi.restoreAllMocks();
        soloistState = buildMock('reggae');
        getState.mockReturnValue(makeState(0.6, 0.5, 'reggae'));
    });

    const simulatePerformance = (
        numBars: number,
        intensity: number,
        style = 'reggae',
    ): { notes: CapturedNote[]; totalSteps: number } => {
        // Fresh mock per run (hermetic): the reggae and 'minimal' contrast runs
        // each start at sessionSteps 0 with no carried pitch history.
        soloistState = buildMock(style);
        getState.mockReturnValue(makeState(intensity, 0.5, style));
        const notes: CapturedNote[] = [];
        // i-VII-VI-VII minor vamp in A (Am-G-F-G) — a one-drop reggae loop. The
        // melodic lead rides the OFFBEATS (the "and" of each beat), leaving the
        // downbeats to the one-drop bass + skank.
        const Am: SoloChord = { rootMidi: 57, quality: 'm', intervals: [0, 3, 7], beats: 4 };
        const G: SoloChord = { rootMidi: 55, quality: 'major', intervals: [0, 4, 7], beats: 4 };
        const F: SoloChord = { rootMidi: 53, quality: 'major', intervals: [0, 4, 7], beats: 4 };
        const progression = [Am, G, F, G];

        let lastFreq = 0;
        let totalSteps = 0;
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
                    style,
                    step,
                    {},
                    getStepInfo(bar * 16 + step, {
                        beats: 4,
                        stepsPerBeat: 4,
                        grouping: [4],
                        backbeat: [1, 3],
                    }),
                );
                totalSteps++;
                if (note) {
                    const arr = Array.isArray(note) ? note : [note];
                    const primary = arr[arr.length - 1];
                    lastFreq = (primary as any).frequency || 0;
                    notes.push({
                        bar,
                        step: bar * 16 + step,
                        stepInBar: step,
                        primaryMidi: primary.midi,
                        device: (primary as any).device || 'none',
                        chordRoot: chord.rootMidi,
                        chordQuality: chord.quality,
                    });
                }
                soloistState.session.sessionSteps++;
            }
        }
        return { notes, totalSteps };
    };

    it('should pass an idiom critique for a 256-bar Reggae soloist performance', () => {
        const numBars = 256;
        const { notes, totalSteps } = simulatePerformance(numBars, 0.6);

        // Step lanes on a 16-step (4/4 16th) bar:
        //   downbeats (beat onsets)  : 0, 4, 8, 12
        //   8th-note offbeats ("and"): 2, 6, 10, 14  ← the reggae skank lane
        const DOWNBEATS = new Set([0, 4, 8, 12]);
        const OFFBEAT_8THS = new Set([2, 6, 10, 14]);
        let onDownbeat = 0;
        let onOffbeat8th = 0;
        for (const n of notes) {
            if (DOWNBEATS.has(n.stepInBar)) {
                onDownbeat++;
            }
            if (OFFBEAT_8THS.has(n.stepInBar)) {
                onOffbeat8th++;
            }
        }
        const downbeatShare = onDownbeat / notes.length;
        const offbeat8thShare = onOffbeat8th / notes.length;

        // (1) SPARSE — reggae lead leaves space for bass + skank.
        const restRatio = 1 - notes.length / totalSteps;

        // (2) CONTRAST vs the generic 'minimal' it used to play — minimal is
        // square (syncopationLikelihood 0.3), so it leans harder on downbeats.
        // Re-run the same harness on 'minimal' to confirm 'reggae' is more
        // offbeat-weighted (directly guards the dead-profile fix's intent).
        const min = simulatePerformance(numBars, 0.6, 'minimal');
        let minOff = 0;
        for (const n of min.notes) {
            if (OFFBEAT_8THS.has(n.stepInBar)) {
                minOff++;
            }
        }
        const minOffShare = minOff / min.notes.length;

        // (3) REGISTER sanity.
        const midis = notes.map((n) => n.primaryMidi);
        const minMidi = Math.min(...midis);
        const maxMidi = Math.max(...midis);
        const avgMidi = midis.reduce((a, b) => a + b, 0) / midis.length;

        console.log('\n--- REGGAE SOLOIST CRITIQUE REPORT ---');
        console.log(`[Rest / Space Ratio]   ${(restRatio * 100).toFixed(1)}% (Target: sparse)`);
        console.log(
            `[Offbeat-8th share]    ${(offbeat8thShare * 100).toFixed(1)}% vs downbeat ${(downbeatShare * 100).toFixed(1)}%`,
        );
        console.log(
            `[vs minimal offbeat]   reggae ${(offbeat8thShare * 100).toFixed(1)}% vs minimal ${(minOffShare * 100).toFixed(1)}% (Target: reggae more offbeat)`,
        );
        console.log(
            `[Register min/avg/max] ${minMidi} / ${avgMidi.toFixed(1)} / ${maxMidi} (Target: floor>=52, ceil<=90)`,
        );
        console.log('--------------------------------------\n');

        // Fully seeded generation (scrambleHash over step/section/loop) → every
        // metric below is deterministic across runs. Thresholds carry fixed
        // headroom, not a flake band.

        // (1) SPARSE — the reggae lead floats over a wide-open one-drop pocket.
        // Engine delivers ~85% rest; >0.70 sits well clear of a busy line.
        expect(restRatio).toBeGreaterThan(0.7);

        // (2) OFFBEAT FLOAT — the discriminating claim. The '&' (offbeat 8th)
        // carries notably more of the line than under the square 'minimal' it
        // replaced: engine delivers offbeat 27.2% vs minimal's 13.0% — a 2.1×
        // elevation. The >minOffShare*1.6 assertion guards "meaningfully more
        // offbeat than minimal" with headroom (1.6×13.0% = 20.8% < 27.2%); the
        // absolute >0.20 floor confirms the '&' is well above the 25%-uniform
        // floor it would sit at without the live offbeat pump.
        expect(offbeat8thShare).toBeGreaterThan(minOffShare * 1.6);
        expect(offbeat8thShare).toBeGreaterThan(0.2);

        // (3) DOWNBEAT NOT LOCKED — the dead-route bug played this profile
        // downbeat-locked (~60% on beats 1/3 because syncopationLikelihood never
        // reached the live attackProb). The #570 offbeat pump damps that to
        // ~30.7%; <0.40 guards the regression back to a square, on-the-pulse line.
        expect(downbeatShare).toBeLessThan(0.4);

        // (4) REGISTER inside the soloist slot.
        expect(minMidi).toBeGreaterThanOrEqual(52);
        expect(maxMidi).toBeLessThanOrEqual(90);
    });

    // why: dead-key regression guard — the #570 bug was that Reggae in smart mode
    // resolved to 'minimal', leaving the tailored 'reggae' profile (style,
    // register, AND its targetExtensions color) fully orphaned. This pins the
    // activated routing so it can't silently regress.
    // (The full cross-genre table lives in soloist-routing-guard.test.ts.)
    it('resolves Reggae genre/style to the activated reggae profile (#570)', () => {
        // Smart mode + Reggae feel → 'reggae' (the activated routing — what a user
        // actually hears). Previously this resolved to 'minimal'.
        expect(resolveSoloistStyle('smart', 'Reggae')).toBe('reggae');
        expect(resolveSoloistStyle(undefined, 'Reggae')).toBe('reggae');
        // An explicit 'reggae' UI style is honored verbatim.
        expect(resolveSoloistStyle('reggae', 'Reggae')).toBe('reggae');
        // 'reggae' and 'minimal' are distinct profiles, not aliases.
        expect(resolveSoloistStyle('minimal', 'Reggae')).toBe('minimal');
    });
});
