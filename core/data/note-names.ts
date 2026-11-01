// Canonical flat-oriented pitch-class names. Keep this leaf independent of the
// full config/genre tables so notation-only editors can load on demand.
export const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * The key names the key picker offers, each spelled the way that key is usually written (no key
 * with more than 6 accidentals): a major key is `Db` not `C#`, `F#` not `Gb`; a minor key is `C#`
 * not `Db`, `G#` not `Ab`, `F#` not `Gb`. The stored key is the picked name, so chord spelling
 * (`spellPitchClass`) follows it. `KEY_ORDER` stays the pitch-class table (index = semitones).
 */
export const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MINOR_KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
