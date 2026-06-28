// Canonical note-spelling policy — the single source of truth for how a pitch
// class is rendered as a letter name given a key context. Both the chord-render
// path (`chords-engine.ts`) and the chord *editor* (`ChordPicker.tsx`) spell
// through here, so a chart and the picker that edits it never disagree.
//
// Policy: pitch is always correct regardless of spelling (Gb == F#). This only
// chooses the *notation*. Sharp keys spell with sharps so charts read the way a
// musician expects (E major shows G#, not Ab); everything else stays flat, the
// app's accepted default. An explicit accidental hint always wins over the key
// context (a borrowed `bVI` stays flat even in a sharp key).

import { KEY_ORDER } from '../config.js';

const SHARP_NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Major keys whose signature is written in sharps. F#/C# are listed for
// completeness even though the all-flat KEY_ORDER picker can only reach them as
// Gb/Db today (distinct F#/C# selection is deferred — see #779).
const SHARP_FRIENDLY_MAJOR_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#']);

// Minor keys whose signature is written in sharps (their relative major is a
// sharp key): E (1♯), B (2♯), F♯ (3♯), C♯ (4♯), G♯ (5♯), D♯ (6♯), A♯ (7♯).
// A minor is signature-neutral and falls to the flat default — fine, its tonic
// carries no accidental. Keyed by the *minor* tonic: a flat-minor key like D
// minor (1♭) or G minor (2♭) must NOT inherit the major set's sharp orientation
// (#845) — D minor's ♭VI is B♭, never A♯.
const SHARP_FRIENDLY_MINOR_KEYS = new Set(['E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#']);

/**
 * Spell a pitch class as a letter name. Explicit accidentals first (a `#`/`b`
 * hint or an already-accidental note name), then the local key context.
 * Avoids flat-biased spellings like Gb inside sharp-oriented keys such as E major.
 *
 * `keyIsMinor` selects the minor signature table: the session key is a bare
 * tonic (`'D'`) with the minor flag carried separately, so without it a flat
 * minor key (D/G/C/F minor) strips to a tonic that lives in the *major* sharp
 * set and mis-spells sharp (#845).
 */
export function spellPitchClass(
    pitchClass: number,
    keyContext: string,
    accidentalHint: string = '',
    explicitNote: string = '',
    keyIsMinor: boolean = false,
): string {
    if (accidentalHint === '#' || explicitNote.includes('#')) {
        return SHARP_NOTE_ORDER[pitchClass];
    }
    if (accidentalHint === 'b' || explicitNote.includes('b')) {
        return (KEY_ORDER as any)[pitchClass];
    }

    const tonic = (keyContext || '').replace(/m$/, '');
    const sharpKeys = keyIsMinor ? SHARP_FRIENDLY_MINOR_KEYS : SHARP_FRIENDLY_MAJOR_KEYS;
    return sharpKeys.has(tonic) ? SHARP_NOTE_ORDER[pitchClass] : (KEY_ORDER as any)[pitchClass];
}
