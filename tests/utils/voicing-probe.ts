// @ts-nocheck
/**
 * Shared chord-voicing probes for the two layers that can disagree about what a
 * written chord actually sounds like.
 *
 * - `voice()` — the PARSE layer: `validateProgression` bakes `chord.freqs` once per
 *   chart, and every comp lane starts from that voicing.
 * - `sound()` / `voicings()` — the LIVE layer: `getAccompanimentNotes`, where each
 *   genre re-reduces the parse voicing (Funk's clav cell rebuilds it by pitch class,
 *   Neo-Soul windows three contiguous notes, smart-comp thins to two voices under
 *   intensity 0.4, Jazz re-places altered dominants). A parse-only assertion passed
 *   while Funk still sounded Am6 as C-G-B (#1313), which is why both layers are
 *   probed from the same helper rather than re-derived per test file.
 *
 * `sound()` keys hits by root-relative DEGREE set — the right frame for "which tones
 * sound". `voicings()` keeps every raw emission, which is what a spacing/ordering
 * claim needs (two registers of the same pitch classes collapse to one degree set).
 *
 * Consumers: tests/unit/engine/voicing-root-policy.test.ts (#1313 and #1316/#1318),
 * tests/unit/engine/chord-identity-matrix.test.ts (the spelling matrix).
 */
import { TIME_SIGNATURES } from '../../public/config.js';
import {
    compingState,
    getAccompanimentNotes,
    resetCompingState,
} from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const toMidi = (freq) => Math.round(69 + 12 * Math.log2(freq / 440));

/** Root-relative pitch class: 0 = root, 3 = b3, 4 = 3, 5 = 4, 9 = 6, 10 = b7, 11 = maj7. */
export const degreeOf = (midi, chord) => (((midi - chord.rootMidi) % 12) + 12) % 12;

/** The chord style Smart Genres selects for each feel (`smart-genres.ts` `chord:`). */
const STYLE_FOR_FEEL = { Jazz: 'jazz', Blues: 'jazz', Funk: 'funk' };

/**
 * Parse a chart and return each chord's baked voicing as note-independent facts.
 * `options.isMinor` sets the key's minor flag (roman-numeral spelling + the
 * lowercase-numeral remap read it).
 */
export function voice(
    feel,
    bassOn,
    progression,
    key = 'C',
    practiceMode = true,
    intensity = 0.35,
    options = {},
) {
    const state = getState();
    state.groove.genreFeel = feel;
    state.chords.style = options.style || STYLE_FOR_FEEL[feel] || 'smart';
    state.bass.enabled = bassOn;
    state.playback.practiceMode = practiceMode;
    state.playback.bandIntensity = intensity; // 0.35 default: below the 0.6 colour tier
    state.chords.density = options.density || 'standard';
    state.arranger.key = key;
    state.arranger.isMinor = Boolean(options.isMinor);
    state.arranger.sections = [{ id: 'a', label: 'A', value: progression, repeat: 1 }];
    validateProgression(state);
    return state.arranger.progression.map((chord) => {
        const midis = chord.freqs.map(toMidi);
        return {
            name: chord.absName,
            quality: chord.quality,
            is7th: chord.is7th,
            intervals: chord.intervals,
            midis,
            degrees: new Set(midis.map((m) => degreeOf(m, chord))),
        };
    });
}

function eachEmission(feel, bassOn, progression, intensity, laps, visit, options = {}) {
    voice(feel, bassOn, progression, options.key || 'C', true, intensity, options);
    const state = getState();
    resetCompingState(compingState);
    const ts = TIME_SIGNATURES['4/4'];
    const lapSteps = state.arranger.progression.length * 16;
    state.arranger.progression.forEach((chord, chordIndex) => {
        for (let lap = 0; lap < laps; lap++) {
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
                    .map((note) => note.midi)
                    .sort((a, b) => a - b);
                if (midis.length > 0) {
                    visit(chordIndex, chord, midis);
                }
            }
        }
    });
    return state.arranger.progression;
}

/**
 * Every DISTINCT set of notes the comp sounds for each chord, as root-relative degree
 * sets (largest first). 8 laps by default: enough for the ghost/answer/economy
 * branches that only fire on some steps.
 */
export function sound(feel, bassOn, progression, intensity, laps = 8, options = {}) {
    const perChord = new Map();
    const progressionChords = eachEmission(
        feel,
        bassOn,
        progression,
        intensity,
        laps,
        (chordIndex, chord, midis) => {
            const degrees = [...new Set(midis.map((m) => degreeOf(m, chord)))].sort(
                (a, b) => a - b,
            );
            if (!perChord.has(chordIndex)) {
                perChord.set(chordIndex, new Map());
            }
            perChord.get(chordIndex).set(degrees.join(','), degrees);
        },
        options,
    );
    return progressionChords.map((chord, chordIndex) => ({
        name: chord.absName,
        chord,
        sets: [...(perChord.get(chordIndex)?.values() ?? [])].sort((a, b) => b.length - a.length),
    }));
}

/**
 * Every voicing the comp emits for each chord, as raw sorted midi arrays — the frame
 * for register/spacing claims, which `sound()`'s degree-set keying erases.
 */
export function voicings(feel, bassOn, progression, intensity, laps = 8, options = {}) {
    const perChord = new Map();
    const progressionChords = eachEmission(
        feel,
        bassOn,
        progression,
        intensity,
        laps,
        (chordIndex, _chord, midis) => {
            if (!perChord.has(chordIndex)) {
                perChord.set(chordIndex, []);
            }
            perChord.get(chordIndex).push(midis);
        },
        options,
    );
    return progressionChords.map((chord, chordIndex) => ({
        name: chord.absName,
        chord,
        emitted: perChord.get(chordIndex) ?? [],
    }));
}
