// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

// Mock state.js
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

// Mock config.js
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

describe('Soloist Blues Critique', () => {
    let soloistState;

    beforeEach(() => {
        vi.restoreAllMocks();

        soloistState = makeSoloistMock({
            enabled: true,
            style: 'blues',
            mode: 'monophonic',
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
                profile: 'srv',
            },
        });

        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.6,
                bpm: 90,
                complexity: 0.5,
                intent: {},
                lyricalBias: 0.5,
            },
            groove: { genreFeel: 'Blues', pocket: 0 },
            soloist: soloistState,
            harmony: { enabled: false },
            arranger: { timeSignature: '4/4' },
        });
    });

    const simulatePerformance = (numBars) => {
        const history = [];
        const C7 = { rootMidi: 60, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const F7 = { rootMidi: 65, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };

        // 12-bar blues progression
        const progression = [C7, C7, C7, C7, F7, F7, C7, C7, G7, F7, C7, C7];

        let lastFreq = 0;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = progression[bar % 12];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    'blues',
                    step,
                    // Thread coordination + a real stepInfo so the critique measures the
                    // PRODUCTION path. Without stepInfo the engine falls back to
                    // isBackbeat=false hardcoded (soloist.ts) and a measureStep-derived
                    // pulse; in 4/4 that fallback is mathematically close but it silences
                    // any backbeat-aware phrasing lane. (Wave-3 audit finding B-F4.)
                    {},
                    getStepInfo(bar * 16 + step, {
                        beats: 4,
                        stepsPerBeat: 4,
                        grouping: [4],
                        backbeat: [1, 3],
                    }),
                );
                if (note) {
                    const primary = Array.isArray(note) ? note[0] : note;
                    lastFreq = primary.frequency || 0;
                    history.push({
                        step: bar * 16 + step,
                        bar,
                        stepInBar: step,
                        midi: primary.midi,
                        velocity: primary.velocity,
                        bend: primary.bendStartInterval || 0,
                        chordRoot: chord.rootMidi,
                    });
                }
                soloistState.session.sessionSteps++;
            }
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Blues soloist performance', () => {
        const numBars = 128;
        const notes = simulatePerformance(numBars);

        let totalIntervals = 0;
        let sumIntervals = 0;
        let blueNotes = 0; // b3 or b5
        let flatThirds = 0; // b3 specifically — the +500-reward-driven blues signal
        let chordTones = 0; // 1, 3, 5, 7
        let bendsOnBlueNotes = 0;

        const largeIntervals = [];
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            const relativePitch = (n.midi - n.chordRoot + 120) % 12;

            // Harmonic alignment
            if ([0, 4, 7, 10].includes(relativePitch)) {
                chordTones++;
            }
            if (relativePitch === 3 || relativePitch === 6) {
                blueNotes++;
                if (relativePitch === 3) {
                    flatThirds++;
                }
                if (n.bend !== 0) {
                    bendsOnBlueNotes++;
                }
            }

            // Melodic smoothness (within phrase)
            if (i > 0 && n.step - notes[i - 1].step <= 4) {
                const interval = Math.abs(n.midi - notes[i - 1].midi);
                totalIntervals++;
                sumIntervals += interval;
                if (interval > 10) {
                    largeIntervals.push({
                        from: notes[i - 1].midi,
                        to: n.midi,
                        interval,
                        step: n.step,
                    });
                }
            }
        }

        if (largeIntervals.length > 0) {
            console.log(
                `Detected ${largeIntervals.length} large intervals (>10 semitones). Examples:`,
            );
            largeIntervals.slice(0, 5).forEach((li) => {
                console.log(`  Step ${li.step}: ${li.from} -> ${li.to} (dist: ${li.interval})`);
            });
        }

        const avgInterval = sumIntervals / (totalIntervals || 1);
        const chordToneRatio = chordTones / notes.length;
        const blueNoteRatio = blueNotes / notes.length;
        const flatThirdRatio = flatThirds / notes.length;
        const blueNoteBendRatio = bendsOnBlueNotes / (blueNotes || 1);
        const notesPerBar = notes.length / numBars;

        console.log('\n--- BLUES SOLOIST CRITIQUE REPORT ---');
        console.log(`[Melodic Smoothness]    ${avgInterval.toFixed(2)} semitones (Target: <5.0)`);
        console.log(`[Chord Tone Ratio]      ${(chordToneRatio * 100).toFixed(1)}% (Target: >45%)`);
        console.log(`[Blue Note Presence]    ${(blueNoteRatio * 100).toFixed(1)}% (Target: >18%)`);
        console.log(
            `[Flat-Third Emphasis]   ${(flatThirdRatio * 100).toFixed(1)}% b3 (Target: >13%)`,
        );
        console.log(
            `[Blue Note Inflection]  ${(blueNoteBendRatio * 100).toFixed(1)}% bends (Target: >50%)`,
        );
        console.log(
            `[Note Density]          ${notesPerBar.toFixed(2)} notes/bar (Target: 2.0-6.0)`,
        );
        console.log('------------------------------------\n');

        // Honest thresholds: reflect what the engine actually delivers (logged targets above)
        // with a real headroom argument, not placeholders below the random baseline.
        //
        // Melodic Smoothness: engine ~3.4 semitones; report says <6 (singable blues phrasing).
        // Anything > 5 starts to read as angular rather than vocal-like.
        expect(avgInterval).toBeLessThan(5.0);
        // Chord Tones: engine ~55%. Random pitch over blues scale (7 notes, 3 are chord tones)
        // gives ~43% baseline. >45% guards "engine has chord-tone bias on top of scale shape."
        expect(chordToneRatio).toBeGreaterThan(0.45);
        // Blue Notes (b3 + b5) — production path: engine delivers ~23.9% (deterministic;
        // seed inputs are pinned). The OLD comment justified >0.15 against "uniform over
        // 12 chromatic semitones ≈ 17%" — a fictional baseline (Wave-3 audit finding B-F1,
        // smell-b). The engine never selects uniformly over 12 PCs: it picks from the dom7
        // blues candidate set ({0,2,3,4,5,(6),7,9,10} ≈ 9 reachable PCs, 2 of them blue),
        // AND it has a strong chord-tone bias (chordTone ~59%) that further shrinks the
        // non-chord-tone share. The realistic neutral baseline for the combined b3+b5 ratio
        // is therefore ~0.18-0.22, so the old 0.15 floor sat AT or BELOW baseline and proved
        // nothing. The combined ratio is a weak discriminator here; it stays only as a loose
        // "blues-scale shape didn't collapse to a flat-7 jazz line" sanity floor at >0.18
        // (engine 0.239 → ~5.9pp headroom).
        expect(blueNoteRatio).toBeGreaterThan(0.18);
        // The REAL blues signal is the b3 emphasis, which `applyBluesBends` + the +500 b3
        // reward (soloist-pitch-engine.ts) actively drive. Production b3 ratio ~16.2%
        // (deterministic) vs a neutral b3 share of ~0.08-0.11 (b3 is 1 of ~9 candidate PCs,
        // suppressed further by chord-tone bias) — a genuine ~5pp separation. >0.13 guards
        // that the b3-reward path is actually firing: a regression that removed the reward
        // would drop b3 toward its neutral share and trip this, where the combined-blue
        // floor would not. This is the assertion the smell-b finding asked for.
        expect(flatThirdRatio).toBeGreaterThan(0.13);
        // Bend coverage: engine ~100% bends on blue notes (`applyBluesBends` in utils.ts).
        // The report claim ">30%" was already implied by the engine design. >50% leaves
        // headroom but guards a real regression if the bend path stops firing.
        expect(blueNoteBendRatio).toBeGreaterThan(0.5);
        // Note Density: engine ~3.5/bar; report claims 2.0-6.0 as the singable range.
        // Anything below 2 is sparse to the point of "comping more than soloing"; above 6
        // crosses into bebop territory, not blues.
        expect(notesPerBar).toBeGreaterThan(2.0);
        expect(notesPerBar).toBeLessThan(6.0);
    });
});
