/** Pitch-class helpers. A pitch class (pc) is 0–11 with C = 0. */

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** `C`, `F#`, `Bb` → pc. Case-insensitive letter, `#`/`b` accidental. */
export function notePc(name: string): number {
    const letter = LETTER_PC[name[0].toUpperCase()];
    if (letter === undefined) {
        throw new Error(`Not a note name: ${name}`);
    }
    const accidental = name.slice(1);
    return mod12(letter + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
}

export interface KeyContext {
    tonic: number;
    minor: boolean;
}

/**
 * The MIDI note of pitch class `pc` nearest to `target`, optionally clamped into
 * [lo, hi] by octave folding. Ties resolve downward (a bass lands lower, not higher).
 */
export function nearestMidi(pc: number, target: number, lo = 0, hi = 127): number {
    let m = target - mod12(target - pc);
    if (target - m > 6) {
        m += 12;
    }
    while (m < lo) {
        m += 12;
    }
    while (m > hi) {
        m -= 12;
    }
    return m;
}
