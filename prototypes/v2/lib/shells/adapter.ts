/**
 * Ensemble's chords, read as shells (#1585). The engine voices six qualities as three-note
 * R/3/7 grips; this adapter is the only place a chart chord becomes one. It reads the band's
 * chord authority (`parseChord`'s `ChordFacts`) rather than re-parsing the symbol, and spells
 * the root with the chart sheet's own key-aware speller (`spellPitchClass`), so the neck names
 * a chord the way the chart above it does: B♭ major has E♭, never D♯.
 *
 * Everything outside the six shells reduces the way a rhythm player (Freddie Green style)
 * would comp it, and says so in `approximation`. Extensions and alterations on a 7th chord
 * are not approximations: a shell never plays them anyway, and the 7th chord underneath is
 * the harmony.
 */
import type { ChordFacts } from '@band/index';
import { spellPitchClass } from '@engine/engine/note-spelling';
import { LETTERS } from './theory';
import type { Quality, Spelled } from './types';

export interface ShellChord {
    root: Spelled;
    quality: Quality;
    /** What the shell changes about the written chord, or null when it is a faithful reading. */
    approximation: string | null;
}

/** An ASCII note name (`Eb`, `F#`) as the engine's `Spelled` (`E♭`, `F♯`). */
function spelled(name: string, pc: number): Spelled {
    const glyphs = name.slice(1).replaceAll('#', '♯').replaceAll('b', '♭');
    return { name: name[0] + glyphs, pc, letter: LETTERS.indexOf(name[0]) };
}

/**
 * Spell a pitch class in a key, the chart sheet's way. `written` is the chart's own letter name
 * for the note when it has one (`chordNames`' root): an accidental written there wins over the
 * key, exactly as it does on the chart.
 */
export function spellRoot(pc: number, key: string, isMinor: boolean, written = ''): Spelled {
    return spelled(spellPitchClass(pc, key, '', written, isMinor), pc);
}

type Reading = [Quality, string | null];

/** The six shells, and the reduction (with its reason) for every other chord. */
function read(chord: ChordFacts): Reading {
    const { third, fifth, seventh, sixth } = chord;
    if (third === null) {
        // No third to voice, so the shell supplies one. A sus resolves to its dominant (the
        // 3rd replaces the 4th); a power chord keeps whichever 7th it wrote, else the plain maj7.
        if (chord.family === 'power') {
            return seventh === 10
                ? ['dom7', 'power chord played as a 7 (adds the 3rd)']
                : ['maj7', 'power chord played as maj7 (adds the 3rd and 7th)'];
        }
        return seventh === 11
            ? ['maj7', 'sus chord played as maj7 (the 3rd replaces the 4th)']
            : ['dom7', 'sus chord played as a dominant 7 (the 3rd replaces the 4th)'];
    }
    if (third === 3) {
        if (fifth === 6) {
            // The diminished family keeps its ♭5: m7♭5 voices it, °7 is symmetrical without it.
            if (seventh === 10) {
                return ['m7b5', null];
            }
            if (seventh === 9) {
                return ['dim7', null];
            }
            // A diminished triad is a °7 with the 7th left out: adding it keeps the colour.
            return [
                'dim7',
                seventh === 11
                    ? 'diminished major 7 played as °7 (the 7th is lowered)'
                    : 'diminished triad played as a °7 shell',
            ];
        }
        // Every other minor chord is a m7 shell: the ♭3 and ♭7 are what a minor chord sounds like.
        if (fifth === 8) {
            return ['m7', 'minor ♯5 played as m7 (the ♯5 is not played)'];
        }
        if (seventh === 10) {
            return ['m7', null];
        }
        if (seventh === 11) {
            return ['m7', 'minor-major 7 played as m7 (the 7th is lowered)'];
        }
        if (sixth) {
            return ['m7', 'm6 played as m7 (♭7 instead of 6)'];
        }
        if (chord.intervals.some((n) => n % 12 === 8)) {
            return ['m7', 'minor ♭6 played as m7 (♭7 instead of ♭6)'];
        }
        return ['m7', 'minor triad played as m7 (adds the ♭7)'];
    }
    // Major third. An augmented chord is named for its ♯5, which no shell plays, so it is an
    // approximation; a ♭5, ♭9 or ♯9 on a 7th is colour over the same dominant, and is not.
    if (fifth === 8) {
        return seventh === 11
            ? ['maj7', 'augmented major 7 played as maj7 (the ♯5 is not played)']
            : ['dom7', 'augmented chord played as a 7 (the ♯5 is not played)'];
    }
    if (seventh === 11) {
        return ['maj7', null];
    }
    if (seventh === 10) {
        return ['dom7', null];
    }
    if (sixth) {
        return ['six', null];
    }
    return ['maj7', 'major triad played as maj7 (adds the 7th)'];
}

/**
 * A chart chord as the shell the engine voices. `key`/`isMinor` are the chord's own key context
 * (a key change mid-chart spells by the new key); `written` is the chart's letter name for the
 * root, when it has one, so a written accidental agrees with the chart sheet.
 */
export function shellChord(
    chord: ChordFacts,
    key: string,
    isMinor: boolean,
    written = '',
): ShellChord {
    const [quality, reduction] = read(chord);
    // A shell starts on the root, so a slash chord's bass is left to the bass player.
    const bass =
        chord.bass !== chord.root
            ? `bass note ${spellRoot(chord.bass, key, isMinor).name} not played`
            : null;
    const notes = [reduction, bass].filter((note): note is string => note !== null);
    return {
        root: spellRoot(chord.root, key, isMinor, written),
        quality,
        approximation: notes.length ? notes.join('; ') : null,
    };
}
