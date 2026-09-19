// @ts-nocheck
// #1313 — "leave room for the bass" (a register floor) and "rootless voicing" (drop
// the root for shell tones) are different things. Rootless is only for chords the
// chart WRITES as 7ths/extensions, and only while a bass line is actually sounding;
// muting the bass means the player is covering that part, so the comp states the
// harmony itself.
//
// Two layers, because they can disagree: the PARSE layer (`validateProgression` ->
// `chord.freqs`, the voicing every comp lane starts from) and the LIVE layer
// (`getAccompanimentNotes`, where each lane re-reduces that voicing — Funk's clav
// cell, Neo-Soul's cluster window, the low-intensity two-voice thinning). A parse-only
// test passed while Funk still sounded Am6 as C-G-B; the live block is what guards
// the audible claim.
import { beforeEach, describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import {
    compingState,
    getAccompanimentNotes,
    resetCompingState,
} from '../../../public/engine/accompaniment.js';
import { getChordDetails, validateProgression } from '../../../public/engine/chords-engine.js';
import { getRootlessVoicing } from '../../../public/engine/chords-styles.js';
import { BASS_SPACE_FEELS, COMP_REGISTER_FLOOR } from '../../../public/engine/voicing-policy.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';
import { getStepInfo } from '../../../public/utils.js';

const FEELS = [...BASS_SPACE_FEELS];
const toMidi = (f) => Math.round(69 + 12 * Math.log2(f / 440));

// The chord style Smart Genres selects for each feel (`smart-genres.ts` `chord:`).
const STYLE_FOR_FEEL = { Jazz: 'jazz', Blues: 'jazz', Funk: 'funk' };
const degreeOf = (midi, chord) => (((midi - chord.rootMidi) % 12) + 12) % 12;

function voice(feel, bassOn, progression, key = 'C', practiceMode = true, intensity = 0.35) {
    const state = getState();
    state.groove.genreFeel = feel;
    state.chords.style = STYLE_FOR_FEEL[feel] || 'smart';
    state.bass.enabled = bassOn;
    state.playback.practiceMode = practiceMode;
    state.playback.bandIntensity = intensity; // 0.35 default: below the 0.6 colour tier
    state.chords.density = 'standard';
    state.arranger.key = key;
    state.arranger.sections = [{ id: 'a', label: 'A', value: progression, repeat: 1 }];
    validateProgression(state);
    return state.arranger.progression.map((chord) => {
        const midis = chord.freqs.map(toMidi);
        return {
            name: chord.absName,
            midis,
            // pitch classes measured from the chord root: 0 = root, 9 = 6th, 10 = b7
            degrees: new Set(midis.map((m) => degreeOf(m, chord))),
        };
    });
}

// Every distinct set of notes the comp actually SOUNDS for each chord, over 8 laps
// of the chart, as root-relative degree sets (largest first).
function sound(feel, bassOn, progression, intensity) {
    voice(feel, bassOn, progression, 'C', true, intensity);
    const state = getState();
    resetCompingState(compingState);
    const ts = TIME_SIGNATURES['4/4'];
    const lapSteps = state.arranger.progression.length * 16;
    return state.arranger.progression.map((chord, chordIndex) => {
        const hits = new Map();
        for (let lap = 0; lap < 8; lap++) {
            for (let mStep = 0; mStep < 16; mStep++) {
                const step = lap * lapSteps + chordIndex * 16 + mStep;
                state.playback.step = step;
                const midis = getAccompanimentNotes(
                    state,
                    chord,
                    step,
                    mStep,
                    mStep,
                    getStepInfo(step, ts),
                    { bassEffectiveEnabled: bassOn },
                )
                    .filter((note) => note.midi > 0 && !note.muted)
                    .map((note) => note.midi);
                if (midis.length > 0) {
                    const degrees = [...new Set(midis.map((m) => degreeOf(m, chord)))].sort(
                        (a, b) => a - b,
                    );
                    hits.set(degrees.join(','), degrees);
                }
            }
        }
        const sets = [...hits.values()].sort((a, b) => b.length - a.length);
        return { name: chord.absName, sets };
    });
}

describe('Voicing root policy (#1313)', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    it('covers the seven bass-space feels', () => {
        expect(FEELS).toHaveLength(7);
    });

    describe.each(FEELS)('%s', (feel) => {
        it.each([true, false])(
            'parses a plain minor triad rooted, no invented b7 below the colour tier (bass on: %s)',
            (bassOn) => {
                const [, , am] = voice(feel, bassOn, 'C | G | Am | F');
                expect(am.name).toBe('Am');
                expect(am.degrees.has(0)).toBe(true); // A — without it Am reads as C major
                expect(am.degrees.has(3)).toBe(true);
                expect(am.degrees.has(10)).toBe(false); // no G: the chart wrote a triad
            },
        );

        it.each([true, false])(
            'parses an m6 with its 6th and never a b7 (bass on: %s)',
            (bassOn) => {
                for (const chord of voice(feel, bassOn, 'Am6 | Dm6', 'A')) {
                    expect(chord.degrees.has(0)).toBe(true);
                    expect(chord.degrees.has(3)).toBe(true);
                    expect(chord.degrees.has(9)).toBe(true); // the 6th IS the chord
                    expect(chord.degrees.has(10)).toBe(false);
                }
            },
        );

        it('a written m7 is rootless over a sounding bass and rooted over a muted one', () => {
            const [withBass] = voice(feel, true, 'Am7');
            const [muted] = voice(feel, false, 'Am7');
            expect(withBass.degrees.has(0)).toBe(false);
            expect(muted.degrees.has(0)).toBe(true);
            expect(muted.degrees.has(10)).toBe(true);
        });

        // Decision B on #1313: over a sounding bass the altered/augmented qualities
        // play their rootless shells; bass muted they keep the root. Either way the
        // tones that NAME the chord must sound — asserting only "root present?" let a
        // Cmaj7#5 voiced as a C7 shell (E-G-Bb) sail through.
        it.each([
            // symbol, defining degrees, degrees that would misname it
            ['Cmaj7#5', [4, 8, 11], [7, 10]],
            ['G7#9', [4, 10, 3], [11]],
            ['G7b9', [4, 10, 1], [11]],
            ['G7alt', [4, 10], [7, 11]],
            ['G7b5', [4, 6, 10], [7, 11]],
            ['G+7', [4, 8, 10], [7, 11]],
        ])('%s keeps its defining tones in both bass states', (symbol, defining, misnaming) => {
            const [withBass] = voice(feel, true, symbol);
            const [muted] = voice(feel, false, symbol);
            for (const chord of [withBass, muted]) {
                for (const degree of defining) {
                    expect(chord.degrees.has(degree), `${symbol} needs degree ${degree}`).toBe(
                        true,
                    );
                }
                for (const degree of misnaming) {
                    expect(chord.degrees.has(degree), `${symbol} must not sound ${degree}`).toBe(
                        false,
                    );
                }
            }
            // A lean shell spends every voice on a different chord tone — the old 7#9
            // shell doubled the major 3rd directly above the #9 (16 = 4 + 12).
            expect(withBass.degrees.size, `${symbol} doubles a pitch class`).toBe(
                withBass.midis.length,
            );
            expect(withBass.degrees.has(0), `${symbol} is a rootless shell over the bass`).toBe(
                false,
            );
            expect(muted.degrees.has(0), `${symbol} is rooted with the bass muted`).toBe(true);
        });

        it('dim and half-dim stay rooted in both bass states', () => {
            // shouldUseRootlessVoicing never routes them rootless at the parse layer.
            for (const symbol of ['Bm7b5', 'Bdim7']) {
                for (const bassOn of [true, false]) {
                    const [chord] = voice(feel, bassOn, symbol);
                    expect(chord.degrees.has(0), `${symbol} bass on: ${bassOn}`).toBe(true);
                    expect(chord.degrees.has(3)).toBe(true);
                    expect(chord.degrees.has(6)).toBe(true);
                }
            }
        });

        // The comp register is a fixed slot (tick-logic clamps chords to 52-84 per
        // note), so a bass-aware parse floor only ever got its low notes folded up
        // one at a time. This pins that no voicing is parsed into the fold zone.
        it('never parses a voicing below the comp register, bass on or muted', () => {
            expect(COMP_REGISTER_FLOOR).toBe(52);
            for (const bassOn of [true, false]) {
                for (const intensity of [0.35, 0.65, 0.9]) {
                    const chart = 'C | Dm | Eb | Am | Am6 | Dm7 | G7 | Cmaj7';
                    for (const chord of voice(feel, bassOn, chart, 'C', true, intensity)) {
                        expect(
                            Math.min(...chord.midis),
                            `${chord.name} bass on: ${bassOn} @${intensity}`,
                        ).toBeGreaterThanOrEqual(COMP_REGISTER_FLOOR);
                    }
                }
            }
        });

        it('practiceMode no longer changes any voicing', () => {
            const chart = 'C | Am | Am6 | Dm7 | G7alt | Bm7b5 | Cmaj7';
            for (const bassOn of [true, false]) {
                const on = voice(feel, bassOn, chart, 'C', true).map((c) => c.midis);
                const off = voice(feel, bassOn, chart, 'C', false).map((c) => c.midis);
                expect(on).toEqual(off);
            }
        });
    });

    describe.each(FEELS)('%s — what actually sounds', (feel) => {
        it.each([0.35, 0.65])(
            'an m6 never sounds a b7, bass on or muted (intensity %s)',
            (intensity) => {
                for (const bassOn of [true, false]) {
                    for (const chord of sound(feel, bassOn, 'Am6 | Dm6', intensity)) {
                        expect(chord.sets.length).toBeGreaterThan(0);
                        for (const degrees of chord.sets) {
                            expect(degrees, `${chord.name} bass on: ${bassOn}`).not.toContain(10);
                        }
                    }
                }
            },
        );

        it.each([0.35, 0.65])(
            'with the bass muted, the fullest Am the comp plays states A and C (intensity %s)',
            (intensity) => {
                const [am] = sound(feel, false, 'Am | F', intensity);
                // The fullest hit is the statement; sparser answers/ghosts echo under it.
                expect(am.sets[0]).toContain(0);
                expect(am.sets[0]).toContain(3);
                // No hit may be a bare major third on the b3 (C-E): alone, that IS C major.
                for (const degrees of am.sets) {
                    expect(degrees.join(','), 'bare C-E dyad').not.toBe('3,7');
                }
            },
        );
    });

    it('getChordDetails never marks an m6 as a 7th chord (Am6/9\'s "9" is not a 7th)', () => {
        expect(getChordDetails('m6')).toMatchObject({ quality: 'm6', is7th: false });
        expect(getChordDetails('m6/9')).toMatchObject({ quality: 'm6', is7th: false });
        const [am69] = voice('Jazz', true, 'Am6/9', 'A');
        expect(am69.degrees.has(10)).toBe(false);
    });

    it('written minor extensions reach their own branches outside the bass-space feels', () => {
        // getIntervals' generic minor-family test used to shadow m6/m9/m11/m13.
        const [am6, am9] = voice('Acoustic', true, 'Am6 | Am9');
        expect(am6.degrees.has(9)).toBe(true);
        expect(am9.degrees.has(10)).toBe(true);
        expect(am9.degrees.has(2)).toBe(true);
    });

    it('getRootlessVoicing refuses m6 rather than answering with a minor-7 shell', () => {
        expect(getRootlessVoicing(getState(), 'm6', false, false)).toBeNull();
        expect(getRootlessVoicing(getState(), 'm6', false, true)).toBeNull();
    });
});
