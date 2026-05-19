// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Define mockState in a way that vi.mock can capture it
const { testState } = vi.hoisted(() => ({
    testState: {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: {}, lyricalBias: 0.5 },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist: makeSoloistMock({
            enabled: true,
            style: 'smart',
            mode: 'monophonic',
            octave: 64,
            sessionSteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            srdcState: 'Conclusion',
            isResting: false,
            motifBuffer: [],
            thematicSeed: [],
            thematicSeedRoot: 0,
            isReplayingMotif: false,
            isReplayingSeed: false,
            busySteps: 0,
            pitchHistory: [],
            lastInterval: 0,
            stagnationCount: 0,
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        }),
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    },
}));

vi.mock('../../public/state.js', () => ({
    stateMap: testState,
    getState: () => testState,
    dispatch: vi.fn(),
}));

describe('Soloist Musicality & Thematic Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        testState.playback.bandIntensity = 0.5;
    });

    it('should statistically resolve to chord tones in the Conclusion phase', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };
        const chordTones = [0, 4, 7, 11];

        // Simulate a conclusion phase by using a high iteration count
        // and checking for chord tone bias
        let chordToneHits = 0;
        let totalNotes = 0;
        // Engine returns null on many steps (rests / busy-step gating); push
        // iterations high enough that totalNotes lands ~150+ for a tight CI.
        const iterations = 800;

        for (let i = 0; i < iterations; i++) {
            const note = getSoloistNote(getState(), chord, chord, i, null, 64, 'scalar', i % 16);
            if (note) {
                totalNotes++;
                const primary = Array.isArray(note) ? note[0] : note;
                if (chordTones.includes(primary.midi % 12)) {
                    chordToneHits++;
                }
            }
        }

        const ratio = chordToneHits / totalNotes;
        console.log(
            `[Soloist Conclusion] Chord-tone ratio: ${(ratio * 100).toFixed(1)}% over ${totalNotes} notes (Target: >55%, random baseline 33%)`,
        );
        // Chord [0,4,7,11] = 4 of 12 chromatic pitches → 33% uniform-random
        // baseline. With srdcState='Conclusion' and the SRDC-aware chord-tone
        // multiplier (soloist-pitch-engine.ts), engine delivers ~70-82% over
        // sample runs. Threshold 0.55 is 22pt above random and ~14pt below
        // the worst observed Conclusion rate.
        expect(ratio).toBeGreaterThan(0.55);
    });

    it('should resolve to chord tones harder in Conclusion than in Departure', () => {
        // The phase-aware multiplier in soloist-pitch-engine.ts pushes
        // chord-tone weight up in Conclusion (×1.5) and down in Departure
        // (×0.7). Real soloists lean home at the end of a section and
        // explore extensions during chorus/bridge — this test pins that
        // asymmetry. Closes Open finding #1 in docs/archive/MUSICAL_AUDIT.md.
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };
        const chordTones = [0, 4, 7, 11];
        const iterations = 800;

        // Clear the SRV profile for this test so phase tilt isn't competing
        // with a profile that also favors chord tones. SRDC bias is the only
        // signal we want this test to measure.
        const originalProfile = testState.soloist.session.currentPhrase.context.profile;
        testState.soloist.session.currentPhrase.context.profile = null;

        const measure = (phase: string): { ratio: number; count: number } => {
            testState.soloist.srdcState = phase;
            let chordToneHits = 0;
            let totalNotes = 0;
            for (let i = 0; i < iterations; i++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    i,
                    null,
                    64,
                    'scalar',
                    i % 16,
                );
                if (note) {
                    totalNotes++;
                    const primary = Array.isArray(note) ? note[0] : note;
                    if (chordTones.includes(primary.midi % 12)) {
                        chordToneHits++;
                    }
                }
            }
            return { ratio: chordToneHits / totalNotes, count: totalNotes };
        };

        const conclusion = measure('Conclusion');
        const departure = measure('Departure');
        // Restore the surrounding test state for any later it() blocks.
        testState.soloist.srdcState = 'Conclusion';
        testState.soloist.session.currentPhrase.context.profile = originalProfile;

        console.log(
            `[Soloist SRDC] Conclusion: ${(conclusion.ratio * 100).toFixed(1)}% (${conclusion.count}), ` +
                `Departure: ${(departure.ratio * 100).toFixed(1)}% (${departure.count}), ` +
                `gap: ${((conclusion.ratio - departure.ratio) * 100).toFixed(1)}pt`,
        );

        // Both phases stay above the 33% random baseline (the engine still
        // prefers chord tones overall — real soloists ground occasionally
        // even during a chorus), but Conclusion should clear Departure by a
        // documented margin. The gap is the musical claim: Conclusion
        // resolves; Departure explores. Across 10 sample runs at 800
        // iterations: Conclusion landed 75-86%, Departure landed 43-59%,
        // gap 18.5-43pt. Threshold 0.10 is well below the worst observed.
        expect(conclusion.count).toBeGreaterThan(80);
        expect(departure.count).toBeGreaterThan(80);
        expect(conclusion.ratio).toBeGreaterThan(0.55);
        expect(departure.ratio).toBeGreaterThan(0.33);
        expect(conclusion.ratio - departure.ratio).toBeGreaterThan(0.1);
    });

    it('should generate notes within a consistent range', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
            const note = getSoloistNote(getState(), chord, chord, i, null, 64, 'scalar', i % 16);
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                expect(primary.midi).toBeGreaterThanOrEqual(40);
                expect(primary.midi).toBeLessThanOrEqual(100);
            }
        }
    });
});
