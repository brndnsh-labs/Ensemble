/**
 * Ensemble's chords, read as shells (#1585) and triads (#1588). The engine voices eight 7th-chord
 * qualities (maj7, 7, m7, m7♭5, °7, 6, and since #1817 7sus4 and m6) as three-note R/3/7 grips,
 * plain triads (major, minor, dim, aug, sus4, sus2) as closed triad grips, on a ukulele an add9
 * as its major triad's grip with the 9th in the doubled seat (#1820), and a power chord as
 * root–5th–octave; this adapter is the only place a chart chord becomes one. It reads the band's
 * chord authority (`parseChord`'s `ChordFacts`) rather than re-parsing the symbol, and spells
 * the root with the chart sheet's own key-aware speller (`spellPitchClass`), so the neck names
 * a chord the way the chart above it does: B♭ major has E♭, never D♯.
 *
 * Everything else reduces the way a rhythm player (Freddie Green style)
 * would comp it, and says so in `approximation`. Extensions and alterations on a 7th chord
 * are not approximations: a shell never plays them anyway, and the 7th chord underneath is
 * the harmony.
 */
import type { ChordFacts } from '@band/index';
import { spellPitchClass } from '@core/engine/note-spelling';
import { DEGREES, LETTERS, QUALITIES } from './theory';
import type { InstrumentDef, Quality, Spelled } from './types';
import { allowedShapes } from './voicing';

// A type alias, not an interface: `ChartChord`'s extra-fields index signature needs one.
export type VoicingChord = {
    root: Spelled;
    quality: Quality;
    /** What the shell changes about the written chord, or null when it is a faithful reading. */
    approximation: string | null;
};

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

/** How the approximation notice names a triad grip ("played as a plain major triad"). */
const TRIAD_WORDS: Partial<Record<Quality, string>> = {
    maj: 'major triad',
    min: 'minor triad',
    dim: 'diminished triad',
    aug: 'augmented triad',
    sus4: 'sus4',
    sus2: 'sus2',
    five: 'power chord',
};

/** An added tone's name as a chart writes it, by its interval above the root. */
const ADDED_NAMES: Record<number, string> = {
    1: '♭2',
    2: '2',
    3: '♯2',
    5: '4',
    6: '♯4',
    8: '♭6',
    13: '♭9',
    14: '9',
    15: '♯9',
    17: '11',
    18: '♯11',
    20: '♭13',
};

/**
 * A chord with no 7th and no 6th as the triad grip that plays it (#1588), or null when it is not
 * one of the six triads or a power chord (a minor ♯5, say, keeps the shell reduction). Added tones
 * (add9, add4, a minor ♭6) are left out: the triad under them is the harmony, and a guitar's
 * closed triad grip has no string to spare, so the notice names what the grip doesn't play.
 *
 * Except a major add9 on an instrument that has grips for it (#1820, `addsNinth`): a ukulele
 * triad doubles one tone to fill four strings, and the 9th takes that string, as the chord
 * charts print it (Cadd9 0-2-0-3); `parseChord` reads an add2 as the same chord. Only the 9th
 * alone: a 9th beside another added tone keeps the reduction. So does a minor add9: the same
 * shapes put half its roots at the nut on grips no chart prints (Fm(add9) 1-5-3-3, Dm(add9)
 * 2-4-1-5, where the books give 0-5-4-3 and 7-5-5-7).
 */
function readTriad(chord: ChordFacts, addsNinth: boolean): Reading | null {
    const { third, fifth, seventh, sixth, family, intervals } = chord;
    if (seventh !== null || sixth || fifth === null) {
        return null;
    }
    let quality: Quality | null = null;
    if (family === 'power' && fifth === 7) {
        quality = 'five';
    } else if (family === 'sus' && fifth === 7) {
        // The 4th wins a sus2/4: it is the suspension that resolves to the 3rd.
        quality = intervals.includes(5) ? 'sus4' : 'sus2';
    } else if (third === 4) {
        quality = fifth === 7 ? 'maj' : fifth === 8 ? 'aug' : null;
    } else if (third === 3) {
        quality = fifth === 7 ? 'min' : fifth === 6 ? 'dim' : null;
    }
    if (quality === null) {
        return null;
    }
    const q = QUALITIES[quality];
    const played = new Set([0, DEGREES[q.five].int, ...(q.third ? [DEGREES[q.third].int] : [])]);
    const added = intervals.filter((n) => !played.has(n % 12));
    if (!added.length) {
        return [quality, null];
    }
    if (addsNinth && quality === 'maj' && added.length === 1 && added[0] === 14) {
        return ['add9', null];
    }
    const names = added.map((n) => ADDED_NAMES[n] ?? String(n)).join(', ');
    return [
        quality,
        `played as a plain ${TRIAD_WORDS[quality]} (the added ${names} ${added.length > 1 ? 'are' : 'is'} not played)`,
    ];
}

/**
 * The triads, the add9s where the instrument voices them, the eight shells, and the reduction
 * (with its reason) for every other chord.
 */
function read(chord: ChordFacts, addsNinth: boolean): Reading {
    const triad = readTriad(chord, addsNinth);
    if (triad) {
        return triad;
    }
    const { third, fifth, seventh, sixth } = chord;
    if (third === null) {
        // A power chord with a 7th: the shell supplies the 3rd, and keeps whichever 7th it wrote,
        // else the plain maj7.
        if (chord.family === 'power') {
            return seventh === 10
                ? ['dom7', 'power chord played as a 7 (adds the 3rd)']
                : ['maj7', 'power chord played as maj7 (adds the 3rd and 7th)'];
        }
        // A 7sus4 holds its 4th in the shell's 3rd seat, as a sus triad does (#1817). The 9sus4,
        // 13sus4 and 11 (a 9sus4 by another name) are the same shell: it drops their 9th and
        // 13th as it drops a dom9's, and an altered 9th or 13th is colour over the same chord.
        if (seventh === 10 && chord.intervals.some((n) => n % 12 === 5)) {
            return ['7sus4', null];
        }
        // No other sus chord with a 7th reaches here today (the codec writes no 7sus2 or
        // maj7sus4); were one to, it resolves to the 7th chord under it.
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
        // Every other minor chord but the m6 is a m7 shell: the ♭3 and ♭7 are what a minor chord
        // sounds like.
        if (fifth === 8) {
            return ['m7', 'minor ♯5 played as m7 (the ♯5 is not played)'];
        }
        if (seventh === 10) {
            return ['m7', null];
        }
        if (seventh === 11) {
            return ['m7', 'minor-major 7 played as m7 (the 7th is lowered)'];
        }
        // A m6 (and a m6/9, whose 9th the shell drops) is R–♭3–6, the 6th in the 7th's seat
        // as in a 6 chord (#1817).
        if (sixth) {
            return ['m6', null];
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
 * root, when it has one, so a written accidental agrees with the chart sheet. `instrument` is the
 * one the chord will be voiced on: an add9 is read as one only where that instrument has grips
 * for it (#1820, the ukulele), else as its plain triad with a notice, as it is with none given.
 */
export function voicingChord(
    chord: ChordFacts,
    key: string,
    isMinor: boolean,
    written = '',
    instrument: InstrumentDef | null = null,
): VoicingChord {
    const addsNinth =
        instrument !== null && allowedShapes(instrument, undefined, 'add9').length > 0;
    const [quality, reduction] = read(chord, addsNinth);
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
