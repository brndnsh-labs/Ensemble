// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHORD_PRESETS } from '../../../public/data/chord-presets.js';
import { SONG_TEMPLATES } from '../../../public/data/song-templates.js';
import { getAccompanimentNotes } from '../../../public/engine/accompaniment.js';
import { getBassNote, isBassActive } from '../../../public/engine/bass-engine.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { getHarmonyNotes } from '../../../public/engine/harmonies.js';
// THE live soloist engine (epic #10 — legacy getSoloistNote retired). Used here
// as a no-crash / sane-velocity smoke across the full preset×genre matrix.
import { getSoloistNotePhraseFirst as getSoloistNote } from '../../../public/engine/soloist-phrase-first.js';
import { getScaleForChord } from '../../../public/engine/theory-scales.js';
import { getState } from '../../../public/state.js';

const { arranger, playback, chords, bass, soloist, harmony, groove } = getState();

// Mock UI and Worker
vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

const GENRES = [
    'Rock',
    'Jazz',
    'Funk',
    'Blues',
    'Neo-Soul',
    'Disco',
    'Bossa Nova',
    'Reggae',
    'Acoustic',
    'Hip Hop',
    // genreFeel for the Ska-Punk genre is 'Ska' (smart-genres.ts).
    'Ska',
];

const INTENSITIES = [0.1, 0.5, 0.9];

describe('Harmonic Audit: Global Preset/Genre Compatibility', () => {
    beforeEach(() => {
        // Reset state
        arranger.key = 'C';
        arranger.isMinor = false;
        arranger.timeSignature = '4/4';
        groove.enabled = true;
        bass.enabled = true;
        soloist.enabled = true;
        harmony.enabled = true;
        chords.enabled = true;
        chords.style = 'smart';
        bass.style = 'smart';
        soloist.style = 'smart';
        harmony.style = 'smart';
    });

    const runAudit = (presetName, sections, isMinor = false) => {
        it(`Audit: ${presetName}`, () => {
            arranger.sections = sections;
            arranger.isMinor = isMinor;
            validateProgression(getState());

            const errors = [];

            GENRES.forEach((genre) => {
                groove.genreFeel = genre;

                INTENSITIES.forEach((intensity) => {
                    playback.bandIntensity = intensity;
                    playback.conductorVelocity = 0.7 + intensity * 0.45;

                    // Test first 16 steps of the progression
                    for (let step = 0; step < Math.min(16, arranger.totalSteps); step++) {
                        const stepInMeasure = step % 16;
                        const entry = arranger.stepMap.find((e) => step >= e.start && step < e.end);
                        if (!entry) {
                            continue;
                        }

                        const chord = entry.chord;
                        const stepInChord = step - entry.start;

                        // 1. Bass Check
                        if (isBassActive(getState(), bass.style, step, stepInChord)) {
                            const bassNote = getBassNote(
                                getState(),
                                chord,
                                null,
                                step / 4,
                                bass.lastFreq,
                                38,
                                bass.style,
                                0,
                                step,
                                stepInChord,
                            );
                            if (bassNote) {
                                // Velocity Check. #1331 widened the bass EMISSION
                                // domain to `BASS_VELOCITY_DOMAIN_MAX` (1.5, was
                                // 1.25), and `conductorVelocity` — a band-wide swell
                                // gain applied downstream in `scheduler-core.ts`, not
                                // part of the note's own domain — multiplies on top of
                                // it, peaking at 0.7 + 1.0*0.45 = 1.15. So the honest
                                // ceiling for this product is 1.5 * 1.15 = 1.725; the
                                // guard keeps a little slack above it and stays what it
                                // has always been: a "nothing insane escaped" tripwire,
                                // not a mix-level claim. The bass VOICE law
                                // (`bassVelocityToAmplitude`) deliberately does NOT
                                // clamp at 1.5 — humanize (`velocityMult`, up to 1.1)
                                // multiplies in after this check, so the real input the
                                // voice can see peaks near 1.5*1.15*1.1 ≈ 1.9, bounded
                                // defensively at `BASS_VOICE_INPUT_MAX` (2.0). Re-clamping
                                // the voice's law at 1.5 would reproduce this issue's
                                // original bug one layer down.
                                const finalVel = bassNote.velocity * playback.conductorVelocity;
                                if (finalVel > 1.8) {
                                    errors.push(
                                        `[${genre} @ ${intensity}] Bass Vel Overload: ${finalVel.toFixed(2)} at step ${step}`,
                                    );
                                }

                                // Range Check
                                if (bassNote.midi < 12 || bassNote.midi > 60) {
                                    errors.push(
                                        `[${genre} @ ${intensity}] Bass Range Warning: MIDI ${bassNote.midi} at step ${step}`,
                                    );
                                }

                                // Scale Check (Skip for chromatic styles)
                                if (
                                    ![
                                        'Jazz',
                                        'Blues',
                                        'Funk',
                                        'Reggae',
                                        'Neo-Soul',
                                        'Ska',
                                    ].includes(genre) &&
                                    !bassNote.muted
                                ) {
                                    const scale = getScaleForChord(
                                        getState(),
                                        chord,
                                        null,
                                        'smart',
                                    );
                                    const theoryScale = getScaleForChord(
                                        getState(),
                                        chord,
                                        null,
                                        'theory',
                                    );
                                    const interval = (bassNote.midi - chord.rootMidi + 120) % 12;

                                    // Valid if it fits the Genre Scale OR the Chord's Theoretical Scale
                                    const isValid =
                                        scale.includes(interval) || theoryScale.includes(interval);

                                    if (!isValid && bassNote.bendStartInterval === 0) {
                                        // Allow for leading tones on the last beat
                                        const isLastBeat =
                                            stepInChord === Math.round(chord.beats * 4) - 1;
                                        if (!isLastBeat) {
                                            errors.push(
                                                `[${genre} @ ${intensity}] Bass Out-of-Scale: ${bassNote.midi % 12} over ${chord.absName} (Scale: ${scale})`,
                                            );
                                        }
                                    }
                                }
                                bass.lastFreq = bassNote.freq;
                            }
                        }

                        // 2. Soloist Check
                        const soloNote = getSoloistNote(
                            getState(),
                            chord,
                            null,
                            step,
                            soloist.audio.lastFreq,
                            72,
                            soloist.style,
                            stepInChord,
                        );
                        if (soloNote) {
                            const notes = Array.isArray(soloNote) ? soloNote : [soloNote];
                            notes.forEach((n) => {
                                const finalVel = n.velocity * playback.conductorVelocity;
                                if (finalVel > 1.5) {
                                    errors.push(
                                        `[${genre} @ ${intensity}] Soloist Vel Overload: ${finalVel.toFixed(2)} at step ${step}`,
                                    );
                                }
                                if (n.midi < 40 || n.midi > 110) {
                                    errors.push(
                                        `[${genre} @ ${intensity}] Soloist Range Warning: MIDI ${n.midi} at step ${step}`,
                                    );
                                }

                                // Scale Check
                                if (
                                    ![
                                        'Jazz',
                                        'Blues',
                                        'Funk',
                                        'Reggae',
                                        'Neo-Soul',
                                        'Ska',
                                        'Acoustic',
                                        'Metal',
                                    ].includes(genre) &&
                                    !n.isDoubleStop
                                ) {
                                    const scale = getScaleForChord(
                                        getState(),
                                        chord,
                                        null,
                                        'smart',
                                    );
                                    const theoryScale = getScaleForChord(
                                        getState(),
                                        chord,
                                        null,
                                        'theory',
                                    );
                                    const interval = (n.midi - chord.rootMidi + 120) % 12;

                                    const isValid =
                                        scale.includes(interval) || theoryScale.includes(interval);

                                    if (!isValid && n.bendStartInterval === 0) {
                                        errors.push(
                                            `[${genre} @ ${intensity}] Soloist Out-of-Scale: ${n.midi % 12} over ${chord.absName}`,
                                        );
                                    }
                                }
                            });
                            const primary = Array.isArray(soloNote)
                                ? soloNote[soloNote.length - 1]
                                : soloNote;
                            soloist.audio.lastFreq = primary.freq;
                        }

                        // 3. Accompaniment Check
                        const accNotes = getAccompanimentNotes(
                            getState(),
                            chord,
                            step,
                            stepInChord,
                            stepInMeasure,
                            { isBeatStart: step % 4 === 0 },
                        );
                        accNotes.forEach((n) => {
                            if (n.midi > 0 && !n.muted) {
                                const finalVel = n.velocity * playback.conductorVelocity;
                                if (finalVel > 1.5) {
                                    errors.push(
                                        `[${genre} @ ${intensity}] Accomp Vel Overload: ${finalVel.toFixed(2)} at step ${step}`,
                                    );
                                }
                            }
                        });

                        // 4. Harmony Check
                        const harmonyNotes = getHarmonyNotes(
                            getState(),
                            chord,
                            null,
                            step,
                            60,
                            harmony.style,
                            stepInChord,
                        );
                        harmonyNotes.forEach((n) => {
                            const finalVel = n.velocity * playback.conductorVelocity;
                            if (finalVel > 1.5) {
                                errors.push(
                                    `[${genre} @ ${intensity}] Harmony Vel Overload: ${finalVel.toFixed(2)} at step ${step}`,
                                );
                            }
                            if (n.midi < 30 || n.midi > 100) {
                                errors.push(
                                    `[${genre} @ ${intensity}] Harmony Range Warning: MIDI ${n.midi} at step ${step}`,
                                );
                            }

                            // Scale Check
                            if (!['Jazz', 'Blues', 'Funk', 'Reggae', 'Neo-Soul'].includes(genre)) {
                                const scale = getScaleForChord(getState(), chord, null, 'smart');
                                const theoryScale = getScaleForChord(
                                    getState(),
                                    chord,
                                    null,
                                    'theory',
                                );
                                const interval = (n.midi - chord.rootMidi + 120) % 12;

                                const isValid =
                                    scale.includes(interval) || theoryScale.includes(interval);

                                if (!isValid) {
                                    errors.push(
                                        `[${genre} @ ${intensity}] Harmony Out-of-Scale: ${n.midi % 12} over ${chord.absName}`,
                                    );
                                }
                            }
                        });
                    }
                });
            });

            if (errors.length > 0) {
                console.warn(
                    `Audit Findings for ${presetName}:\n` +
                        errors.slice(0, 10).join('\n') +
                        (errors.length > 10 ? `\n...and ${errors.length - 10} more` : ''),
                );
            }

            // We don't necessarily want to fail the test for "warnings",
            // but we want to ensure no critical crashes or massive overloads occur.
            expect(errors.filter((e) => e.includes('Overload')).length).toBe(0);
        });
    };

    // Audit Song Templates
    SONG_TEMPLATES.forEach((template) => {
        runAudit(`Template: ${template.name}`, template.sections, template.isMinor);
    });

    // Audit Chord Presets
    CHORD_PRESETS.forEach((preset) => {
        runAudit(`Preset: ${preset.name}`, preset.sections, preset.isMinor);
    });
});
