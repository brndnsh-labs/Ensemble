import { vi } from 'vitest';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { getSoloistNote } from '../../public/soloist.js';

// --- MOCKS ---
const mockState = {
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: true,
        pitchHistory: [],
        deviceBuffer: [],
        motifBuffer: [],
        sessionSteps: 0,
    },
    groove: { genreFeel: 'Jazz' },
    playback: { bandIntensity: 0.8, bpm: 120, complexity: 0.8, intent: { soloistMod: 0 } },
    arranger: { timeSignature: '4/4' },
    chords: {},
    bass: {},
    harmony: { enabled: false, rhythmicMask: 0 },
};

vi.mock('../../public/state.js', () => ({ getState: () => mockState }));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4, grouping: [4] } },
    STYLE_CONFIG: {},
}));
vi.mock('../../public/utils.js', () => ({
    getFrequency: () => 440,
    getMidi: () => 60,
    calculateTimingOffset: vi.fn(() => 0),
}));
vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11],
}));

import { describe, it } from 'vitest';

describe('Soloist Phrasing Debugger', () => {
    function debugGenre(genreName, measures = 64) {
        mockState.groove.genreFeel = genreName;
        mockState.playback.bandIntensity = 0.8;

        // Reset state
        mockState.soloist = {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: true,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 0,
        };

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const totalSteps = measures * 16;

        console.log(`\n--- DEBUGGING GENRE: ${genreName} (Intensity: 0.8) ---`);
        console.log(`Step | State | NotesInPhrase | PhraseSteps | Note?`);

        for (let s = 0; s < totalSteps; s++) {
            const stepInMeasure = s % 16;
            const res = getSoloistNote(chord, chord, s, 440, 60, 'smart', stepInMeasure, false);

            const status = mockState.soloist.isResting ? 'REST' : 'PLAY';
            const noteChar = res ? '♫' : '.';

            // Log every step where something happens, or every 4 steps for rhythm
            if (res || s % 16 === 0) {
                const measure = Math.floor(s / 16);
                const beat = Math.floor((s % 16) / 4) + 1;
                const m_b = `${measure + 1}:${beat}`.padEnd(5);

                console.log(
                    `${m_b} | ${status} | ${String(mockState.soloist.notesInPhrase).padStart(13)} | ${String(mockState.soloist.currentPhraseSteps).padStart(11)} | ${noteChar}`,
                );
            }

            // Track for "Dead Air" detection
            // (We could log internal restProb here if we modified soloist.js to expose it,
            // but for now we'll just watch the state transitions)
        }
    }

    it('Logs Jazz phrasing transitions', () => {
        debugGenre('Jazz', 32);
    });

    it('Logs Ska-Punk phrasing transitions', () => {
        debugGenre('Ska-Punk', 32);
    });
});
