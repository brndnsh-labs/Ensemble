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

// Keys whose signature is written in sharps. F#/C# are listed for completeness
// even though the all-flat KEY_ORDER picker can only reach them as Gb/Db today
// (distinct F#/C# selection is deferred — see #779).
const SHARP_FRIENDLY_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#']);

/**
 * Spell a pitch class as a letter name. Explicit accidentals first (a `#`/`b`
 * hint or an already-accidental note name), then the local key context.
 * Avoids flat-biased spellings like Gb inside sharp-oriented keys such as E major.
 */
export function spellPitchClass(
    pitchClass: number,
    keyContext: string,
    accidentalHint: string = '',
    explicitNote: string = '',
): string {
    if (accidentalHint === '#' || explicitNote.includes('#')) {
        return SHARP_NOTE_ORDER[pitchClass];
    }
    if (accidentalHint === 'b' || explicitNote.includes('b')) {
        return (KEY_ORDER as any)[pitchClass];
    }

    const tonic = (keyContext || '').replace(/m$/, '');
    return SHARP_FRIENDLY_KEYS.has(tonic)
        ? SHARP_NOTE_ORDER[pitchClass]
        : (KEY_ORDER as any)[pitchClass];
}
