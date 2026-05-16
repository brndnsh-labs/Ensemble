// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Jazz Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Jazz',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Jazz comping performance', () => {
        const chordC = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let charlestonHits = 0;
        let totalStabs = 0;
        let guideToneRatioSum = 0;
        let totalMidiIntervals = 0;
        let sumMidiIntervals = 0;
        let lastMidis = [];

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const stepInTwoBars = i % 32;
            const notes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                i,
                64,
                'smart',
                stepInMeasure,
                null,
                {},
            );

            if (notes.length > 0) {
                totalStabs++;
                const midis = notes.map((n) => n.midi);

                // 1. Rhythmic Alignment (Charleston focus on 0, 6 in bar 1, or syncopations in bar 2)
                if ([0, 6, 16, 22, 14, 30].includes(stepInTwoBars)) {
                    charlestonHits++;
                }

                // 2. Harmonic Content (Guide Tones: 3rds and 7ths)
                const guideTones = notes.filter((n) => {
                    const pc = n.midi % 12;
                    return [3, 4, 10, 11].includes((pc - (chordC.rootMidi % 12) + 12) % 12);
                });
                guideToneRatioSum += guideTones.length / notes.length;

                // 3. Melodic Smoothness (Voice Leading)
                if (lastMidis.length > 0) {
                    const avg1 = lastMidis.reduce((a, b) => a + b, 0) / lastMidis.length;
                    const avg2 = midis.reduce((a, b) => a + b, 0) / midis.length;
                    sumMidiIntervals += Math.abs(avg1 - avg2);
                    totalMidiIntervals++;
                }
                lastMidis = midis;
                mockState.harmony.lastMidis = midis; // Update state for engine
            }
        }

        const charlestonScore = charlestonHits / totalStabs;
        const avgGuideToneRatio = guideToneRatioSum / totalStabs;
        const avgVoiceLeadingJump = sumMidiIntervals / totalMidiIntervals;

        console.log(
            '\n--- JAZZ HARMONY CRITIQUE REPORT ---\n' +
                `[Charleston Frequency]  ${(charlestonScore * 100).toFixed(1)}% (Target: >40%)\n` +
                `[Guide Tone Weight]     ${(avgGuideToneRatio * 100).toFixed(1)}% (Target: >50%)\n` +
                `[Voice Leading Smooth]  ${avgVoiceLeadingJump.toFixed(2)} semitones (Target: <3.0)\n` +
                '------------------------------------\n',
        );

        expect(charlestonScore).toBeGreaterThan(0.4);
        expect(avgGuideToneRatio).toBeGreaterThan(0.5);
        expect(avgVoiceLeadingJump).toBeLessThan(3.0);
    });

    it('should yield space to the soloist by tier: defaults thin for jazz, thins further when crowded', () => {
        // The harmony engine (getHarmonyNotes) is the band's harmony-pad/shadow layer,
        // NOT the piano comp (that's getAccompanimentNotes, tested elsewhere). For Jazz
        // it starts at rootless guide-tone shells (2 notes) by default — that's already
        // tasteful comping. It only thins further when the band is genuinely crowded:
        // soloist busy AND another accompaniment voice is hitting the same step.
        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [0, 4, 7, 11, 2, 9],
            sectionId: 'A',
        };

        // Scenario 1: Soloist resting — default jazz comp shell.
        mockState.soloist.session.phrasing.isResting = true;
        const notesQuiet = getHarmonyNotes(getState(), chord, null, 0, 64, 'smart', 0, null, {});

        // Scenario 2: Soloist busy, no crowding — should not exceed quiet, and should drop tensions.
        mockState.soloist.session.phrasing.isResting = false;
        mockState.soloist.session.currentPhrase.notesInPhrase = 5;
        const notesBusy = getHarmonyNotes(
            getState(),
            chord,
            null,
            0,
            64,
            'smart',
            0,
            { midi: 72 },
            { soloistActive: true, soloistBusy: true },
        );

        // Scenario 3: Crowded — soloist busy AND another accompaniment voice is hitting.
        // This is the path that actually thins the harmony pad below guide-tone shells.
        const notesCrowded = getHarmonyNotes(
            getState(),
            chord,
            null,
            0,
            64,
            'smart',
            0,
            { midi: 72 },
            { soloistActive: true, soloistBusy: true, accompanimentHit: true },
        );

        console.log(
            `[Coordination] Quiet: ${notesQuiet.length}, Busy: ${notesBusy.length}, Crowded: ${notesCrowded.length}`,
        );

        // Default jazz comp shell is non-empty and tasteful.
        expect(notesQuiet.length).toBeGreaterThan(0);
        expect(notesQuiet.length).toBeLessThanOrEqual(3);

        // Busy must not exceed quiet, and must not include 9th/13th extensions.
        expect(notesBusy.length).toBeLessThanOrEqual(notesQuiet.length);
        const busyHasHighExtension = notesBusy.some((n) =>
            [2, 9].includes(((n.midi % 12) - (chord.rootMidi % 12) + 12) % 12),
        );
        expect(busyHasHighExtension).toBe(false);

        // Crowded must thin strictly below busy (the engine's real coordination path).
        expect(notesCrowded.length).toBeLessThan(notesBusy.length);
    });
});
