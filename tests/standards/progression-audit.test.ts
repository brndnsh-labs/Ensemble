// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: makeSoloistMock({
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
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        }),
        chords: { enabled: true, octave: 60, density: 'standard' },
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

import { TIME_SIGNATURES } from '../../public/config.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { getState } from '../../public/state.js';
import { getStepInfo, getStepsPerMeasure } from '../../public/utils.js';

const { arranger, groove, soloist } = getState();

import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { SONG_TEMPLATES } from '../../public/data/song-templates.js';

describe('Progression Audit: Verifying All Library Presets', () => {
    const allTemplates = [...CHORD_PRESETS, ...SONG_TEMPLATES];

    beforeEach(() => {
        soloist.session.phrasing.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.session.currentPhrase.notesInPhrase = 0;
        soloist.session.phrasing.busySteps = 0;
        soloist.motifBuffer = [];
        soloist.session.memory.hookBuffer = [];
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
                soloist.session.tension = 0; // Reset tension to avoid triggering Altered scale logic during basic audit
                const soloistScale = getScaleForChord(getState(), chord, null, 'smart');
                const accompanistIntervals = chord.intervals;

                accompanistIntervals.forEach((interval) => {
                    const pc = interval % 12;
                    // Every note the accompanist plays SHOULD be in the soloist's scale
                    const isInScale = soloistScale.includes(pc);

                    // EXCEPTION: 7#9 "Hendrix Chord"
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
            soloist.session.phrasing.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.session.currentPhrase.notesInPhrase = 0;

            const ts = TIME_SIGNATURES['4/4'];
            const spm = getStepsPerMeasure(ts);

            // "Play" the first 32 steps (2 bars)
            for (let step = 0; step < 32; step++) {
                const info = getStepInfo(step, ts, [], TIME_SIGNATURES);
                const chordEntry = arranger.stepMap.find((m) => step >= m.start && step < m.end);
                if (!chordEntry) {
                    continue;
                }

                const currentChord = chordEntry.chord;
                const nextStep = step + spm;
                const nextChord = arranger.stepMap.find(
                    (m) => nextStep >= m.start && nextStep < m.end,
                )?.chord;

                // This ensures getScaleForChord doesn't crash on any chord type in the library
                const scale = getScaleForChord(getState(), currentChord, nextChord, 'smart');
                expect(scale).toBeDefined();
                expect(scale.length).toBeGreaterThan(0);

                // This ensures getSoloistNote doesn't crash
                const result = getSoloistNote(
                    getState(),
                    currentChord,
                    nextChord,
                    step,
                    440,
                    72,
                    'smart',
                    info.mStep,
                    {},
                    info,
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
                            const nextScale = getScaleForChord(
                                getState(),
                                nextChord,
                                null,
                                'smart',
                            );
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
                                `[Audit] Harmonic Clash in ${template.name}: Chord ${currentChord.absName} (${currentChord.quality}) at step ${step} plays PC ${interval}, but soloist scale is [${scale}] and next scale is [${nextChord ? getScaleForChord(getState(), nextChord, null, 'smart') : 'N/A'}]`,
                            );
                        }
                        expect(isInScale).toBe(true);
                    });
                }
            }
        });
    });
});
