/**
 * The notes a chord symbol rules out, worked out from the reference reading alone
 * (`chord-reference.ts`), never from the band's own chord scale. These are the contradictions
 * a harmony book calls wrong notes, not matters of taste: the other third, the other seventh,
 * the natural version of a note the symbol alters, and the two classic avoid notes. (The natural
 * 5th against a written ♭5 is the one nearest to convention: some books read 7♭5 as 7♯11, with
 * the 5th free. The comp is held to the letter of the symbol.)
 *
 * Everything else is left alone on purpose. An unwritten 9th or 13th, a ♭9 or ♭13 on a
 * dominant, a ♯9 on a blues dominant: those are a player's colours, and whether they are
 * *good* is Brandon's ear, not this file's.
 */
import type { ReferenceChord } from './chord-reference.js';

/** Semitones above the root (0–11) → why the symbol rules that note out. */
export function clashNotes(chord: ReferenceChord): Map<number, string> {
    const has = (interval: string) => chord.intervals.has(interval);
    const major3 = has('3M');
    const minor3 = has('3m');
    // A ♭7 without a minor 3rd: the dominants, the sus dominants among them.
    const dominant = has('7m') && !minor3;
    const out = new Map<number, string>();
    if (minor3 && !major3) {
        out.set(4, 'major 3rd on a minor chord');
    }
    // On a dominant the minor 3rd is the ♯9, a blue note every blues player adds unasked.
    // (If the comp ever grows grace notes, a ♭3 crushed into the 3rd of a plain triad will trip
    // this: exempt it by its length, do not loosen the rule.)
    if (major3 && !minor3 && !dominant && !has('9A')) {
        out.set(3, 'minor 3rd on a major chord');
    }
    if (has('7m') && !has('7M')) {
        out.set(11, 'major 7th on a ♭7 chord');
    }
    if (has('7M') || has('7d')) {
        out.set(10, has('7M') ? '♭7 on a major-7th chord' : '♭7 on a diminished 7th');
    }
    // The dictionary writes a minor chord's ♯5 as a ♭6 with no 5th (m7#5).
    if ((has('5d') || has('5A') || has('6m')) && !has('5P')) {
        out.set(7, 'natural 5th on an altered-5th chord');
    }
    if ((has('9m') || has('9A')) && !has('9M') && !has('2M')) {
        out.set(2, 'natural 9th on an altered-9th chord');
    }
    // The avoid note: a 4th a minor 9th above the chord's own major 3rd.
    if (major3 && !has('11P') && !has('4P')) {
        out.set(5, 'natural 11th over a major 3rd');
    }
    // A dominant's ♯5 is the same note as a ♭13 (the altered and whole-tone scales have no
    // natural 6th); a major 7th's ♯5 is not (lydian augmented has one).
    if ((has('13m') || has('6m') || (has('5A') && dominant)) && !has('13M') && !has('6M')) {
        out.set(9, 'natural 13th on a ♭13 chord');
    }
    // Written tensions win: a dominant that writes its 9th or 13th natural does not take the
    // altered one (the same law as `impliedTensions` in `band/form/timeline.ts`).
    if (dominant && has('9M')) {
        out.set(1, '♭9 on a natural-9th chord');
        out.set(3, '♯9 on a natural-9th chord');
    }
    if (dominant && has('13M')) {
        out.set(8, '♭13 on a natural-13th chord');
    }
    if (!dominant && !has('9m')) {
        out.set(1, '♭9 on a chord that is not a dominant');
    }
    if (major3 && !dominant && has('5P') && !has('6m') && !has('13m')) {
        out.set(8, '♭6 on a major chord');
    }
    return out;
}
