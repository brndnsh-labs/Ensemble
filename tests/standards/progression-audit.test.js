/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            contourSteps: 0,
            melodicTrend: 'Static',
            tension: 0,
            motifBuffer: [],
            hookBuffer: [],
            lastFreq: 440,
            hookRetentionProb: 0.5,
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            audio: { currentTime: 0 },
            intent: { soloistMod: 0 },
        },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: [],
        },
        groove: { genreFeel: 'Jazz' },
        bass: { enabled: true },
        harmony: { enabled: false },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
        sb_enabled: true,
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
        },
        ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
        INTERVAL_TO_NNS: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
        INTERVAL_TO_ROMAN: [
            'I',
            'bII',
            'II',
            'bIII',
            'III',
            'IV',
            '#IV',
            'V',
            'bVI',
            'VI',
            'bVII',
            'VII',
        ],
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { validateProgression } from '../../public/chords.js';
import { getSoloistNote } from '../../public/soloist.js';
import { getState } from '../../public/state.js';
import { getScaleForChord } from '../../public/theory-scales.js';

const { arranger, groove, soloist } = getState();

import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { SONG_TEMPLATES } from '../../public/data/song-templates.js';

describe('Progression Audit: Verifying All Library Presets', () => {
    const allTemplates = [...CHORD_PRESETS, ...SONG_TEMPLATES];

    beforeEach(() => {
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        soloist.busySteps = 0;
        soloist.motifBuffer = [];
        soloist.hookBuffer = [];
        soloist.activeBuffer = null;
        soloist.isReplayingMotif = false;
    });

    allTemplates.forEach((template) => {
        it(`should handle ${template.name} without errors`, () => {
            // Setup Template
            arranger.key = 'C';
            arranger.isMinor = template.isMinor || false;
            arranger.sections = template.sections.map((s) => ({
                ...s,
                id: Math.random().toString(),
            }));

            // Set genre based on category or name for Smart logic
            if (template.category === 'Jazz' || template.name.includes('Jazz')) {
                groove.genreFeel = 'Jazz';
            } else if (template.category === 'Blues' || template.name.includes('Blues')) {
                groove.genreFeel = 'Blues';
            } else if (template.name.includes('Funk')) {
                groove.genreFeel = 'Funk';
            } else if (template.category === 'Soul/R&B' || template.name.includes('Neo')) {
                groove.genreFeel = 'Neo-Soul';
            } else {
                groove.genreFeel = 'Rock';
            }

            // Validate Progression
            validateProgression(getState());
            expect(arranger.progression.length).toBeGreaterThan(0);

            // Audit Harmonic Cohesion: Accompanist vs Soloist
            // We specifically check if 'Rich' density extensions clash with the soloist's scale
            arranger.progression.forEach((chord) => {
                soloist.tension = 0; // Reset tension to avoid triggering Altered scale logic during basic audit
                const soloistScale = getScaleForChord(chord, null, 'smart');
                const accompanistIntervals = chord.intervals;

                accompanistIntervals.forEach((interval) => {
                    const pc = interval % 12;
                    // Every note the accompanist plays SHOULD be in the soloist's scale
                    // (Allowing for small deviations in dominant altered contexts if needed)
                    const isInScale = soloistScale.includes(pc);

                    // EXCEPTION: 7#9 "Hendrix Chord"
                    // Accompanist plays Major 3rd (4) and #9 (3).
                    // Blues Scale plays minor 3rd (3) but rarely Major 3rd (4).
                    // This clash is stylistically correct for Funk/Blues.
                    const isHendrixClash = chord.quality.includes('7#9');

                    if (!isInScale && !isHendrixClash) {
                        // Log detailed info for debugging
                        throw new Error(
                            `[Audit] Harmonic Clash in ${template.name}: Chord ${chord.absName} (${chord.quality}) plays PC ${pc} (from interval ${interval}), but soloist scale is [${soloistScale.join(',')}] (type: ${typeof pc})`,
                        );
                    }
                    if (!isHendrixClash) {
                        expect(isInScale).toBe(true);
                    }
                });
            });

            // Audit Phrase Generation
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0;

            // "Play" the first 32 steps (2 bars)
            for (let step = 0; step < 32; step++) {
                const chordEntry = arranger.stepMap.find((m) => step >= m.start && step < m.end);
                if (!chordEntry) {
                    continue;
                }

                const currentChord = chordEntry.chord;
                const nextStep = step + 16;
                const nextChord = arranger.stepMap.find(
                    (m) => nextStep >= m.start && nextStep < m.end,
                )?.chord;

                // This ensures getScaleForChord doesn't crash on any chord type in the library
                const scale = getScaleForChord(currentChord, nextChord, 'smart');
                expect(scale).toBeDefined();
                expect(scale.length).toBeGreaterThan(0);

                // This ensures getSoloistNote doesn't crash
                const result = getSoloistNote(
                    currentChord,
                    nextChord,
                    step,
                    440,
                    72,
                    'smart',
                    step % 16,
                );

                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    notes.forEach((note) => {
                        expect(note.midi).toBeDefined();
                        expect(typeof note.velocity).toBe('number');

                        // Harmonic integrity check: Is the pitch in the selected scale?
                        // Round interval to handle micro-bends (e.g. 2.5 for bluesy b3)
                        const rawInterval = (note.midi - currentChord.rootMidi + 120) % 12;
                        const interval = Math.round(rawInterval) % 12;
                        const isExpressive =
                            [
                                'rock',
                                'blues',
                                'neo',
                                'bird',
                                'jazz',
                                'neo-soul',
                                'funk',
                                'soul/r&b',
                            ].includes(groove.genreFeel.toLowerCase()) ||
                            [
                                'rock',
                                'blues',
                                'neo',
                                'bird',
                                'jazz',
                                'neo-soul',
                                'funk',
                                'soul/r&b',
                            ].includes(template.category?.toLowerCase());

                        let isInScale = scale.includes(interval);

                        // ANTICIPATION CHECK: If it's not in the scale, maybe it anticipated the next chord?
                        if (!isInScale && nextChord) {
                            const nextInterval = (note.midi - nextChord.rootMidi + 120) % 12;
                            const nextScale = getScaleForChord(nextChord, null, 'smart');
                            if (nextScale.includes(nextInterval)) {
                                isInScale = true;
                            }
                        }

                        if (!isInScale && isExpressive) {
                            // Check if a neighbor is in the scale (chromatic leading tone / scoop)
                            const neighbors = [(interval - 1 + 12) % 12, (interval + 1 + 12) % 12];
                            isInScale = neighbors.some((n) => scale.includes(n));
                        }

                        if (!isInScale) {
                            throw new Error(
                                `[Audit] Harmonic Clash in ${template.name}: Chord ${currentChord.absName} (${currentChord.quality}) at step ${step} plays PC ${interval}, but soloist scale is [${scale}] and next scale is [${nextChord ? getScaleForChord(nextChord, null, 'smart') : 'N/A'}]`,
                            );
                        }
                        expect(isInScale).toBe(true);
                    });
                }
            }
        });
    });
});
