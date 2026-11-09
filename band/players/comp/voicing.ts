/**
 * Voicings: which notes of a chord the comp plays, and where. A voicing *kind* picks the
 * tones (a close triad, a rootless jazz voicing, a funk stab, a bossa drop-2, a guitar
 * shell, a power chord); `voice()` then places them for two hands on a keyboard — and
 * `fretboard.ts`'s `grip()` for a guitar — choosing the placement that moves least from the previous chord,
 * sits in the instrument's register, and avoids the clashes a player would avoid.
 */
import { type ChordFacts, fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';

/** Where a voicing may sit (MIDI), and where its top voice aims. */
export interface Slot {
    lo: number;
    hi: number;
    top: number;
    /**
     * How strongly the top voice is pulled to `top` (default 0.35). A funk guitarist stays in
     * one position on the neck; smooth voice leading alone would let the grips drift away.
     */
    pull?: number;
}

/**
 * The keyboard comp's register slot: the instrument's whole range (`COMP_INSTRUMENTS`), down to
 * C3, where a `spread` voicing's left-hand shell sits (#2025).
 */
const KEYS: Slot = { lo: 48, hi: 84, top: 72 };

/**
 * Where a one-hand voicing sits (every kind but `spread`): E3 up. why: a close or rootless
 * voicing stacks 2nds and 3rds from its bottom note, and under E3 those are mud (a minor 2nd's
 * low-interval limit is E3, a major 2nd's Eb3: `LOW_INTERVAL_LIMIT`). Only the spread's open
 * shell — a 5th, a tritone or a 7th at the bottom — belongs below it. It is also where every
 * one-hand voicing sat before the floor came down, so their placements are unchanged.
 */
const ONE_HAND: Slot = { ...KEYS, lo: 52 };

/**
 * `power`: root and fifth (and octave), whatever the chord's quality — the distorted rhythm
 * guitar's chord, since a third beating against root and fifth under drive turns to mud.
 * The fifth is the chord's own (`fifthOf`): a diminished chord gets the tritone power chord,
 * an augmented one the #5, so the chart's quality still speaks where it lives in the 5th.
 *
 * `spread`: the two-handed neo-soul keyboard voicing (#2025) — a low left-hand shell (R–7, or
 * 3–7 either way up) and the colour stacked in 4ths above it in the right hand, five notes (see
 * `spreadCandidates`). Keyboards only; a seventh chord's voicing, which falls back to the
 * compact `rootless` where it has no 4ths to stack, or while a lead phrase is live
 * (`keyboardKind`).
 */
export type VoicingKind = 'close' | 'rootless' | 'stab' | 'drop2' | 'shell' | 'power' | 'spread';

const has = (chord: ChordFacts, n: number) => chord.intervals.some((i) => mod12(i) === n);

/**
 * A written alteration of a tension wins over the default natural one; otherwise the chord's
 * scale decides. A phrygian minor 7th (iii7 in a major key) owns no natural 9, and its b9 is
 * an avoid note on a minor chord, so the 11th takes the seat (b3-5-b7-11). A dominant whose
 * scale has only the b9 takes it.
 */
function ninth(chord: ChordFacts): number {
    if (has(chord, 1)) {
        return 1;
    }
    if (has(chord, 3) && chord.third === 4) {
        return 3;
    }
    if (chord.implied) {
        return chord.implied.ninth;
    }
    if (chord.scale.includes(2)) {
        return 2;
    }
    return chord.third === 3 ? 5 : chord.scale.includes(1) ? 1 : 2;
}
function thirteenth(chord: ChordFacts): number {
    if (has(chord, 8) && chord.fifth !== 8) {
        return 8;
    }
    if (chord.implied) {
        return chord.implied.thirteenth;
    }
    // A dominant whose scale has a b13 and no 13 (mixolydian b13) voices the b13.
    return !chord.scale.includes(9) && chord.scale.includes(8) ? 8 : 9;
}

/**
 * What sits in the 5th's seat of a four-note voicing: a written b13, #11 (or a dominant's
 * 13) replaces the plain 5th, because that colour is what the chart asks to hear. An altered
 * dominant has no 5th at all.
 */
function fifthSeat(chord: ChordFacts): number {
    const written = chord.tensions;
    if (written.includes(8)) {
        return 8;
    }
    if (written.includes(6)) {
        return 6;
    }
    if (chord.family === 'dominant' && written.includes(9)) {
        return 9;
    }
    return fifthOf(chord);
}

/**
 * The written tension a close voicing must sound, or null if the chart wrote none. A close
 * voicing is a triad or seventh chord with the 5th's seat free to carry the chart's colour
 * (the bass plays the root, so the 5th is the cheapest tone to give up). Priority: the
 * altered tension that names the chord (a dominant: b13, #11, b9, #9; otherwise #11, b13, b9,
 * #9 — a major 7th's #11 is its signature), then the dominant's 13th (its identity) before the
 * plain 9th, the 11th last; a major/minor chord prefers its 9th over its 13th. Only one is
 * voiced: a second written tension (maj9#11) is left to the melody.
 */
function writtenTension(chord: ChordFacts): number | null {
    const order = chord.family === 'dominant' ? [8, 6, 1, 3, 9, 2, 5] : [6, 8, 1, 3, 2, 9, 5];
    return order.find((t) => chord.tensions.includes(t)) ?? null;
}

/** The tones (semitones above the root, < 12) a voicing kind plays for a chord. */
export function voicingTones(chord: ChordFacts, kind: VoicingKind): number[] {
    const third = chord.third ?? (has(chord, 5) ? 5 : has(chord, 2) ? 2 : null);
    const fifth = fifthOf(chord);
    const colour = chord.seventh ?? (chord.sixth ? 9 : null);
    const written = chord.tensions;
    if (kind === 'power') {
        // why: an augmented fifth (or an altered dominant's b13 in the fifth's seat) is a
        // minor 6th above the root — root+#5 reads as another chord's root+third (B7alt's
        // [0, 8] sounds like G/B), which is exactly the third-beats-against-the-fifth mud the
        // power chord exists to avoid. There's no clean fifth to voice, so the chug plays the
        // one-note statement instead: root and its octave, leaving the colour to the melody.
        return fifth === 8 ? [0] : [0, fifth];
    }
    if (chord.family === 'power') {
        return [0, 7];
    }
    if (chord.family === 'diminished' && chord.seventh === 9) {
        return [0, 3, 6, 9];
    }
    switch (kind) {
        case 'close': {
            if (chord.family === 'dominant' && chord.third === 4 && written.includes(3)) {
                return [0, 4, 10, 3]; // the "Hendrix" 7#9: root, 3rd, b7, #9 on top
            }
            // why: a written 9th/11th/b9 is part of the chord the chart asked for. Rock, country
            // and acoustic books play close voicings, which used to keep the 5th and drop the
            // tension (Fmaj9 as F A C E). The tension takes the 5th's seat instead.
            const tension = writtenTension(chord);
            // why: a major 3rd under a written 11th is a minor 9th rub (G11, C7add11), so the
            // 3rd gives way and the chord reads as the sus it is.
            const dropThird = tension === 5 && third === 4;
            const tones = [
                0,
                ...(dropThird ? [] : [third ?? 7]),
                tension ?? (colour !== null ? fifthSeat(chord) : fifth),
            ];
            if (colour !== null) {
                tones.push(colour);
            } else if (tension === null && written.length) {
                tones.push(written[0]);
            } else if (tension !== null) {
                tones.push(fifth); // add9: the triad stays whole and the tension joins it
            }
            return [...new Set(tones)];
        }
        case 'rootless': {
            if (colour === null) {
                return [...new Set([0, third ?? 7, fifth, ...(written.length ? written : [2])])];
            }
            if (chord.family === 'half-diminished') {
                return [3, 5, 6, 10]; // b3 11 b5 b7: the root would sit a b9 from nothing
            }
            // A written #11 (or b5) takes the place of the 5th/13th, so it is always heard.
            const sharpEleven = has(chord, 6);
            const upper =
                chord.family === 'dominant'
                    ? // Dominants: 9 and 13 (or their written alterations) in place of root and 5th.
                      [written.includes(8) ? 8 : sharpEleven ? 6 : thirteenth(chord), ninth(chord)]
                    : [
                          sharpEleven ? 6 : written.includes(9) ? 9 : fifth,
                          written.includes(5) ? 5 : ninth(chord),
                      ];
            return [...new Set([third ?? 7, colour, ...upper])];
        }
        case 'stab': {
            if (colour === null) {
                return [...new Set([0, third ?? 7, fifth])];
            }
            if (chord.family === 'half-diminished') {
                return [3, 6, 10]; // b3 b5 b7: the b5 is what makes it half-diminished
            }
            // Three notes: guide tones plus one colour on top (the "E9" funk chord).
            const top =
                chord.family === 'dominant'
                    ? written.includes(9)
                        ? 9
                        : ninth(chord)
                    : ninth(chord);
            return [...new Set([third ?? 7, colour, top])];
        }
        case 'shell': {
            // The swing guitarist's three-note chord: root, 3rd and 7th (or 6th) — the
            // harmony's skeleton, all a four-to-the-bar rhythm guitar needs. Half-diminished
            // adds its b5 (R-b5-b7-b3, x3434x), the tone that tells it from a minor 7th.
            if (chord.family === 'half-diminished') {
                return [0, 3, 6, 10];
            }
            return [...new Set([0, third ?? 7, colour ?? fifth])];
        }
        case 'drop2': {
            if (colour === null) {
                // A plain triad is coloured the bossa way: a 6/9 (major or minor). A minor
                // chord whose scale owns no natural 6th (aeolian vi, phrygian iii) takes its
                // b7 instead — a b6 there is an avoid note.
                if (chord.family === 'major' || chord.family === 'minor') {
                    const sixth = chord.scale.includes(9) || chord.family === 'major' ? 9 : 10;
                    return [...new Set([third ?? 7, fifth, sixth, ninth(chord)])];
                }
                return [...new Set([0, third ?? 7, fifth, written[0] ?? 0])];
            }
            // Bossa colour: the 9th (or a written b9/#9) replaces the root; a half-diminished
            // chord keeps its root, since its 9th is a minor 9th above it.
            const top = chord.family === 'half-diminished' ? 0 : ninth(chord);
            return [...new Set([third ?? 7, fifthSeat(chord), colour, top])];
        }
        case 'spread': {
            // The palette `spreadCandidates` places five tones of: the shell's root, 3rd and
            // 7th, and the colours the right hand may stack. A palette, not a voicing: the
            // kind is a keyboard's only. A guitar book never asks for it — `grip` would try to
            // finger every tone of it (a guitar's two-handed colour is its rootless grip).
            return [...new Set([0, third ?? 7, colour ?? fifth, ...spreadColours(chord)])];
        }
    }
}

/**
 * The tones a spread voicing's right hand may stack, as semitones above the root: the rootless
 * voicing's own (the 3rd, the 7th, the 9th and the 13th or 5th, with every written or implied
 * alteration already seated — one colour authority), the root, the 5th, and the natural 13th.
 * why: the 4ths stack needs a scale-wide palette to find three 4ths in — the right hand's
 * colours are chosen by stacking, not by seat. The root may sit on top (Dm9 as F-C | E-A-D);
 * a root a minor 9th over the 7th is left to `cost`. The 5th is left out where an altered
 * tone (b5/#11, b13) holds its seat, as the rootless voicing leaves it. The natural 13th joins
 * on a major or minor chord whose scale owns it (Ionian, Lydian, Dorian): Cmaj7 as C-B | E-A-D
 * is the neo-soul major 13th, while an Aeolian or Phrygian minor's b13 is an avoid note.
 */
function spreadColours(chord: ChordFacts): number[] {
    const rootless = voicingTones(chord, 'rootless');
    const third = chord.third ?? (has(chord, 5) ? 5 : has(chord, 2) ? 2 : null);
    const altered = rootless.some((t) => t === 6 || t === 8);
    const thirteenth =
        (chord.family === 'major' || chord.family === 'minor') &&
        chord.scale.includes(9) &&
        chord.fifth !== 8;
    return [
        ...new Set([
            ...rootless,
            0,
            ...(third === null ? [] : [third]),
            ...(altered ? [] : [fifthOf(chord)]),
            ...(thirteenth ? [9] : []),
        ]),
    ];
}

function candidates(tones: number[], kind: VoicingKind): number[][] {
    // Rotations of the pitch-class set in ascending order are its close positions (for a
    // rootless voicing, rotations 3-5-7-9 and 7-9-3-5 are the A and B forms).
    const pcs = [...new Set(tones)].sort((a, b) => a - b);
    const out: number[][] = [];
    for (let rotation = 0; rotation < pcs.length; rotation++) {
        const order = [...pcs.slice(rotation), ...pcs.slice(0, rotation)];
        for (let base = 36; base <= 84; base += 12) {
            const stack: number[] = [];
            let floor = base + order[0] - 1;
            for (const pc of order) {
                let m = floor + 1 + mod12(pc - (floor + 1));
                if (stack.length && m <= stack[stack.length - 1]) {
                    m += 12;
                }
                stack.push(m);
                floor = m;
            }
            let voicing = stack;
            if (kind === 'drop2' && stack.length === 4) {
                voicing = [stack[2] - 12, stack[0], stack[1], stack[3]].sort((a, b) => a - b);
            }
            if (voicing[0] >= 48 && voicing[voicing.length - 1] <= 88) {
                out.push(voicing);
            }
        }
    }
    return out;
}

/**
 * Lowest note (MIDI) for the lower voice of each interval, in semitones. `cost` weighs it for
 * every voicing; a grip shape with `bottomLaw` (`fretboard.ts`) makes it binding.
 */
export const LOW_INTERVAL_LIMIT: Record<number, number> = {
    1: 52, // m2: E3
    2: 51, // M2: Eb3
    3: 48, // m3: C3
    4: 46, // M3: Bb2
    5: 46, // P4: Bb2
    6: 47, // tritone: B2
    7: 34, // P5: Bb1
    8: 43, // m6: G2
    9: 41, // M6: F2
    10: 41, // m7: F2
    11: 41, // M7: F2
};

/**
 * Which of two keyboard voicings are `spread`s (two hands: the first two notes the left
 * hand's shell, the rest the right hand's stack). See `cost`.
 */
export interface Hands {
    prev: boolean;
    v: boolean;
}

/**
 * How good a placement is (lower is better): register, voice leading, and clashes. `hands`
 * says which of the two voicings are spreads, for the voice leading between them.
 */
export function cost(
    v: number[],
    prev: number[] | null,
    chord: ChordFacts,
    slot: Slot,
    hands?: Hands,
): number {
    let c = 0;
    const top = v[v.length - 1];
    // Register: out of the slot is forbidden in effect; the top voice aims for the sweet spot.
    for (const m of v) {
        if (m < slot.lo || m > slot.hi) {
            c += 40;
        }
    }
    c += Math.abs(top - slot.top) * (slot.pull ?? 0.35);
    // Voice leading: the smallest total movement from the last chord.
    if (prev?.length) {
        const a = [...prev].sort((x, y) => x - y);
        if (hands && (hands.prev || hands.v)) {
            // why: a spread is led hand by hand (#2025). Matched voice for voice from the
            // bottom, a four-note one-hand voicing after a five-note spread is led to the
            // spread's left hand, and the top line drops a 5th or more (Cmaj7 as C3-B3 |
            // E4-A4-D5, then A7b9 as Bb3-Db4-F4-G4: D5 to G4). A pianist leads the top line
            // with the right hand: the right hand's stack meets the one-hand voicing's top
            // voices, matched from the top down, and the left hand's shell moves to the next
            // shell (from a one-hand voicing it is free: there was no left hand to lead).
            if (hands.prev && hands.v) {
                c += (Math.abs(v[0] - a[0]) + Math.abs(v[1] - a[1])) * 0.5;
            }
            const right = hands.v ? v.slice(2) : v;
            const before = hands.prev ? a.slice(2) : a;
            const n = Math.min(right.length, before.length);
            for (let i = 1; i <= n; i++) {
                c += Math.abs(right[right.length - i] - before[before.length - i]) * 0.5;
            }
        } else {
            const n = Math.min(prev.length, v.length);
            for (let i = 0; i < n; i++) {
                c += Math.abs(v[i] - a[i]) * 0.5;
            }
        }
        c += Math.abs(top - a[a.length - 1]) * 0.6;
    }
    // Hand shape: no muddy thirds down low, no minor-9th rubs, no minor-2nd clusters on
    // chords that don't ask for them.
    // Dominants carry their colour in semitones (b7 against 13, 3 against b9/#9, the
    // altered tensions) — the rubs are the sound. Everything else avoids them.
    const tense = chord.family === 'dominant';
    // …except a #9 *below* the 3rd, which is a cluster, not the "Hendrix" 3–b7–#9.
    if (chord.family === 'dominant' && chord.third === 4) {
        const sharpNine = v.find((m) => mod12(m - chord.root) === 3);
        const third = v.find((m) => mod12(m - chord.root) === 4);
        if (sharpNine !== undefined && third !== undefined && sharpNine < third) {
            c += 20;
        }
    }
    for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
            const gap = v[j] - v[i];
            if (gap === 13 && !tense) {
                c += 12;
            }
            // In a three-note stab the rub is naked (Dm7 as E-F-C), where a fuller voicing
            // absorbs it (Em9 as F#-G-B-D).
            if (gap === 1 && !tense) {
                c += v.length <= 3 ? 24 : 8;
            }
        }
    }
    // Low interval limits: a close interval low down is mud. Each interval has a floor below
    // which its lower note shouldn't sit (the arranger's table, for the two lowest voices up).
    for (let i = 0; i + 1 < v.length; i++) {
        const limit = LOW_INTERVAL_LIMIT[v[i + 1] - v[i]];
        if (limit !== undefined && v[i] < limit) {
            c += 10;
        }
    }
    return c;
}

/** A lead note sounding over a voicing, and the share (0–1) of the voicing's time it sounds. */
export interface LeadOver {
    midi: number;
    share: number;
}

/**
 * What the lead costs a placement (lower is better): the comp leaves the soloist's note to the
 * soloist (#2014). A voice on the lead's pitch is a unison that smears the line into the
 * chord; a voice an octave from it shadows the line. Each is weighed by the share of the
 * chord's sounding time that lead note fills, so a passing sixteenth barely counts and a held
 * note decides the voicing.
 *
 * why: a close voicing that sits wholly within the octave under a lead note holds every pitch
 * class but the lead's, so a pianist sets the voicing just under the melody. The weights are
 * set against `cost`'s voice leading (0.5 per semitone per voice, 0.6 more for the top): a
 * held unison (26) outweighs moving the voicing by an inversion to clear it, so the comp steps
 * aside rather than sit on the line (a keyboard never leaves its register for it: `voice`
 * drops those candidates under a lead). A unison the search keeps anyway (the line
 * moves too much under one chord) is left out by the comp (`leaveTheLeadItsNote` in
 * idiom.ts). Sitting above the line is not weighed here: a keyboard's `yieldToLead` in
 * perform.ts drops a voice above the lead an octave only where that keeps it over the chord's
 * own bottom note, so a voicing wholly above the lead can stay there. A book that spreads its
 * hands keeps its whole voicing under the line instead (`Placement.under`, #2025); for every
 * other book, whether to keep under the lead, at the register it would cost, is an open
 * decision (#2057).
 */
export function leadCost(v: number[], lead: readonly LeadOver[]): number {
    // why: a unison is the worst — two instruments on one pitch read as one smeared note.
    // Measured (#2014): 14 left the keyboards on the line 12–24% of the time, since a guide
    // tone can't be left out and only the search can move it. 26 brings every style under
    // 12%; at 30 the keyboards began leaping an octave over a low line (top-voice moves past
    // a fifth went from ~1% of changes to ~5%), so the weight stops short of that.
    const UNISON = 26;
    // why: an octave doubles the line (a block-chord soli the soloist didn't ask for), but the
    // ear still hears two voices, and a comp that keeps its guide tones under a chord-tone line
    // can't avoid every octave — so it is a tie-breaker, about a quarter of a unison, between
    // voicings that clear the unison. Measured: without it the rock and country piano sit an
    // octave from the line 2–6 points more of the lead's time (rock head 80% against 74%).
    const OCTAVE = 7;
    let c = 0;
    for (const { midi, share } of lead) {
        for (const m of v) {
            const d = Math.abs(m - midi);
            if (d === 0) {
                c += UNISON * share;
            } else if (d === 12) {
                c += OCTAVE * share;
            }
        }
    }
    return c;
}

/**
 * A keyboard power chord: root, fifth and the root's octave, never inverted — a power chord
 * with its fifth underneath is a fourth, and loses the root the whole sound rests on.
 */
function powerCandidates(chord: ChordFacts): number[][] {
    const fifth = fifthOf(chord);
    const out: number[][] = [];
    for (let root = ONE_HAND.lo; root + 12 <= ONE_HAND.hi; root++) {
        if (mod12(root) === chord.root) {
            // why: matches voicingTones' power-chord rule — an augmented #5 (or an altered
            // dominant's b13) has no clean fifth to stack, so keys play root and octave alone.
            out.push(fifth === 8 ? [root, root + 12] : [root, root + fifth, root + 12]);
        }
    }
    return out;
}

/**
 * The highest note a spread voicing's left-hand shell may stand on: B3. why: the shell is the
 * left hand's, in the octave under middle C (C3–B3, from the keyboard's floor), the register a
 * neo-soul keyboardist puts it in — low enough to sound under the right hand as its own
 * layer, high enough over the bass (which lives around D2) not to thicken its line. Each pitch
 * class has one foot there, so the voice leading chooses between shells and stacks, not
 * octaves.
 */
const SHELL_TOP = 59;

/**
 * The widest the hands part, from the shell's upper note to the stack's lowest: a perfect 4th.
 * why: no wider than the 4ths stacked above it, so the notes read as one ladder of open
 * intervals, not a low shell and a high chord with a hole between them (a gap of a 5th or more
 * is two voicings). It also holds a 3–7 spread to an octave and a 4th to an octave and a 6th
 * (17–21 semitones): a 4th to a 5th of shell, a 4th at most, and two 4ths. An R–7 shell is
 * a 7th wide, so its spread runs to two octaves (Cmaj7 as C3-B3 | E4-A4-D5).
 */
const HAND_GAP = 5;

/**
 * The families a spread voices: the seventh chords whose colours stack in 4ths (a 7sus4's
 * R-4-5-b7-9 is a stack of 4ths already). A half-diminished or diminished chord keeps the
 * rootless voicing: its b5 breaks the stack, and its compact form is the one that names it.
 */
const SPREAD_FAMILIES = new Set<ChordFacts['family']>(['major', 'minor', 'dominant', 'sus']);

/**
 * A keyboard spread voicing (#2025): five notes, two hands. The left hand holds a shell — the
 * root and the 7th (R–7), or the 3rd (a sus chord's 4th) and the 7th either way up (3–7, 7–3)
 * — standing in the octave under middle C (`SHELL_TOP`). The right hand stacks three of the
 * chord's colours in perfect 4ths (`spreadColours`), starting within a 4th over the shell
 * (`HAND_GAP`), and never doubling a shell tone: Cmaj7 as C3-B3 | E4-A4-D5 (3-13-9), Dm7 as
 * F3-C4 | E4-A4-D5 (9-5-R), G7 as F3-B3 | E4-A4-D5 (13-9-5), C7 as E3-Bb3 | D4-G4-C5.
 * why the 4ths: a stack of 4ths names no triad, so the right hand sounds colour (the open,
 * unresolved sound of McCoy Tyner's and Herbie Hancock's 4ths over a shell, which neo-soul
 * keyboard players inherited) while the shell carries the harmony — where
 * the jazz pianist's one-hand rootless voicing packs 3rds and 2nds into one octave. why the
 * 7–3 shell too: a pitch class has one foot in the shell's octave, so with only R–7 and 3–7 a
 * chord rooted high in it (G7, A7, Bb) could only spread high (G7 as B3-F4 | A4-D5-G5), and
 * the voicing after it — a compact one under the lead included — was led up after it, onto
 * the soloist's line. Every shell and stack is a candidate, voice-led by `cost` like any other
 * kind; a chord with no stack (an altered dominant's b9/b13 hold no three 4ths, a
 * half-diminished chord isn't one of `SPREAD_FAMILIES`) has none, and `voice` falls back to
 * the rootless voicing.
 */
function spreadCandidates(chord: ChordFacts): number[][] {
    if (chord.seventh === null || !SPREAD_FAMILIES.has(chord.family)) {
        return [];
    }
    const colours = spreadColours(chord);
    const third = chord.third ?? (has(chord, 5) ? 5 : has(chord, 2) ? 2 : null);
    const seventh = chord.seventh;
    // The left hand's shells, [foot, the tone above it]: R–7, 3–7, and 3–7 the other way up.
    const shells: [number, number][] = [[0, seventh]];
    if (third !== null) {
        shells.push([third, seventh], [seventh, third]);
    }
    const out: number[][] = [];
    for (const [foot, partner] of shells) {
        const shell = [mod12(chord.root + foot), mod12(chord.root + partner)];
        for (let low = KEYS.lo; low <= SHELL_TOP; low++) {
            if (mod12(low) !== shell[0]) {
                continue;
            }
            const upper = low + 1 + mod12(shell[1] - (low + 1));
            for (const x of colours) {
                const stack = [x, x + 5, x + 10].map((t) => mod12(chord.root + t));
                if (
                    stack.some(
                        (pc) => !colours.includes(mod12(pc - chord.root)) || shell.includes(pc),
                    )
                ) {
                    continue;
                }
                const first = upper + 1 + mod12(stack[0] - (upper + 1));
                if (first - upper > HAND_GAP || first + 10 > KEYS.hi) {
                    continue;
                }
                // why: a stack note a minor 9th over a shell note is the one clash a voicing
                // never holds off a dominant (`cost`'s rule) — the 9-5-R stack over a 3–7
                // shell puts a major 7th's root a minor 9th over its 7th (Cmaj7 as E3-B3 |
                // D4-G4-C5). The right hand leaves that top note out (E3-B3 | D4-G4, the
                // spread maj9); a stack that would lose an inner note isn't a stack.
                const clash = (m: number) =>
                    chord.family !== 'dominant' && (m - low === 13 || m - upper === 13);
                const hand = [first, first + 5, first + 10];
                if (hand.slice(0, 2).some(clash)) {
                    continue;
                }
                out.push([low, upper, ...(clash(hand[2]) ? hand.slice(0, 2) : hand)]);
            }
        }
    }
    return out;
}

/**
 * The kind a keyboard plays a chord in: a `spread` closes up into the compact rootless voicing
 * while a lead phrase is live (#2057), and where the chord has no 4ths to stack
 * (`spreadCandidates`); every other kind is itself. `live`: the soloist's phrase is live over
 * the bar the chord is struck in — the caller decides once for the bar (`compIdiom`), so a
 * chord struck twice in a bar never changes hands between its strikes, and a chord pushed over
 * the barline is played the way the bar that strikes it is.
 * why: a spread reaches from C3 to the high 70s, so it straddles a soloist's register — the
 * line would sound inside the chord, not over it — and a pianist behind a soloist plays small.
 * The hands follow the soloist's phrase, not each strike: a pianist opens up in the soloist's
 * gaps, not on every rest. A phrase is live from the bar its first note sounds in through the
 * bar after its last, so the hands close as the soloist comes in (a strike before the line's
 * first note in that bar included) and open again only after a whole bar of silence; once
 * open they stay open until the line sounds again. A sparse line — two or three notes a bar,
 * a rest between them — keeps them closed, where a choice made strike by strike flipped the
 * top of the comp an octave up and down on alternate downbeats. With no lead, the spread plays.
 */
export function keyboardKind(chord: ChordFacts, kind: VoicingKind, live: boolean): VoicingKind {
    return kind === 'spread' && (live || !spreadCandidates(chord).length) ? 'rootless' : kind;
}

/** How a keyboard voicing is placed against what came before it and the lead over it. */
export interface Placement {
    /** The previous voicing is a spread, led from its right hand (`cost`). */
    prevSpread?: boolean;
    /** The lead's phrase is live over the bar (`keyboardKind`). */
    live?: boolean;
    /**
     * Keep the whole voicing under the line: its top a whole step or more under the lowest
     * lead note sounding over it (`UNDER`). A book that spreads its hands across the
     * soloist's register sets it (`CompBook.under`).
     */
    under?: boolean;
}

/**
 * How far under the lowest lead note sounding over it a keyboard voicing that keeps under the
 * line puts its top: a whole step. why: a half step under the line is a rub against the
 * soloist's note, not room for it — the same whole step `yieldToLead` (perform.ts) clears.
 */
const UNDER = 2;

/**
 * The highest a voicing that keeps under the line may reach (`Placement.under`): a whole step
 * under the lowest lead note sounding over it. No lead over it, no cap.
 */
function capUnder(lead: readonly LeadOver[], under: boolean): number {
    return under && lead.length ? Math.min(...lead.map((l) => l.midi)) - UNDER : Infinity;
}

/**
 * The kind a keyboard plays the held ending's chord in (`plan.ending`): a `spread` wherever one
 * fits wholly under the line (`capUnder`), else the compact `rootless` voicing; every other
 * kind is itself. why: the lead plays the band's final hit with it (#2178), so the ending's
 * bar is always inside the soloist's phrase (`keyboardKind`), but the last chord is the tune's
 * own last word, and its two-handed sound is the one to end on — a spread that stands under
 * the lead's last note (Cmaj7 as C3-B3 | E4-A4-D5 under an E5) leaves the line its register.
 * The hands close up only where every spread would reach the line.
 */
export function endingKind(
    chord: ChordFacts,
    kind: VoicingKind,
    lead: readonly LeadOver[],
    under = false,
): VoicingKind {
    if (kind !== 'spread') {
        return kind;
    }
    const cap = capUnder(lead, under);
    return spreadCandidates(chord).some((v) => v[v.length - 1] <= cap) ? 'spread' : 'rootless';
}

/**
 * Place a chord's voicing near the previous one, under the lead notes sounding over it.
 * `kind` is the kind the caller chose (`keyboardKind`). Deterministic.
 */
export function voice(
    chord: ChordFacts,
    kind: VoicingKind,
    prev: number[] | null,
    lead: readonly LeadOver[] = [],
    { prevSpread = false, live = lead.length > 0, under = false }: Placement = {},
): number[] {
    // why: under a live phrase a book that keeps under the line (`under`) puts its whole
    // voicing a whole step or more under the lowest lead note sounding over it, a voicing
    // struck just before the line comes in included — the soloist owns the register above.
    // Left to the search, the voicing was led from wherever the last one stood, above or
    // across a low line, and a voice on or over it was moved off it one note at a time
    // (`yieldToLead`), never the chord as a whole.
    const cap = capUnder(lead, under);
    if (kind === 'spread') {
        // A spread is played under a lead only on the ending's chord (`endingKind`), and then
        // only one that fits under the line.
        const shapes = spreadCandidates(chord).filter((v) => v[v.length - 1] <= cap);
        if (!shapes.length) {
            return voice(chord, 'rootless', prev, lead, { prevSpread, live, under });
        }
        let best = shapes[0];
        let bestCost = Infinity;
        for (const v of shapes) {
            const c = cost(v, prev, chord, KEYS, { prev: prevSpread, v: true });
            if (c < bestCost) {
                best = v;
                bestCost = c;
            }
        }
        return best;
    }
    const pcs = voicingTones(chord, kind).map((n) => mod12(chord.root + n));
    // why: after a spread, a one-hand voicing is led from its right hand (`cost`), so the top
    // line keeps its place — except while the lead's phrase is live, where the hands close up
    // because the line is there (#2057): the right hand comes down to the left, under the
    // line, so the voicing is led from the bottom, voice for voice, as from any other.
    const hands = prevSpread && !live ? { prev: true, v: false } : undefined;
    const all = kind === 'power' ? powerCandidates(chord) : candidates(pcs, kind);
    // why: a voice out of the register is cut below, and with it maybe a guide tone. The
    // lead's costs can add past the register's own (two voices on the line), so under a
    // lead an out-of-register placement isn't a candidate at all.
    const placeable = all.filter(
        (v) => !lead.length || v.every((m) => m >= ONE_HAND.lo && m <= ONE_HAND.hi),
    );
    // why: `cost` weighs a minor 2nd off a dominant against the register, and the cap takes
    // the register's other choices away: pressed under a low line, the search stood the
    // voicing on its 9th a half step under the minor 3rd (Em9 as F#3-G3-B3-D4, Dm7 as
    // E3-F3-A3-C4), a cluster at the foot of the chord. Under the cap that foot doesn't fit.
    const tense = chord.family === 'dominant';
    const fits = (v: number[]) =>
        v[v.length - 1] <= cap && (cap === Infinity || tense || v.length < 3 || v[1] - v[0] !== 1);
    let shapes = placeable.filter(fits);
    let slot = ONE_HAND;
    if (!shapes.length && cap !== Infinity) {
        // why: a line low enough that no whole voicing fits under it leaves the hand the
        // shell — the chord's guide tones — with whatever of the stack fits under the line, as
        // a pianist plays under a low guitar line: the most voices that still name the chord.
        // A colour a half step under the next voice at the foot is left out too (F#3-G3-B3-D4
        // plays G3-B3-D4); a guide tone stays, and the voicing doesn't fit.
        const guides = chord.guides.map((g) => mod12(chord.root + g));
        const cut = placeable
            .map((v) => {
                const kept = v.filter((m) => m <= cap);
                return !tense &&
                    kept.length > 2 &&
                    kept[1] - kept[0] === 1 &&
                    !guides.includes(mod12(kept[0]))
                    ? kept.slice(1)
                    : kept;
            })
            .filter(
                (v) =>
                    fits(v) && v.length >= 2 && guides.every((g) => v.some((m) => mod12(m) === g)),
            );
        const most = Math.max(0, ...cut.map((v) => v.length));
        shapes = cut.filter((v) => v.length === most);
        if (!shapes.length) {
            // Lower still (a line at D4), the shell alone: the 3rd and 7th as the left hand
            // holds them under a spread, its foot in the octave under middle C.
            shapes = shellsUnder(guides, cap);
            slot = shapes.length ? KEYS : ONE_HAND;
        }
    }
    let best: number[] | null = null;
    let bestCost = Infinity;
    // Nothing fits under a line that low (a guitar down at G3): the search places the chord
    // as it would without the rule, and the yield settles the rest.
    for (const v of shapes.length ? shapes : placeable) {
        const c = cost(v, prev, chord, slot, hands) + leadCost(v, lead);
        if (c < bestCost) {
            best = v;
            bestCost = c;
        }
    }
    return (best ?? [60, 64, 67]).filter((m) => m >= slot.lo && m <= slot.hi);
}

/**
 * The bare shells of a chord at or under `cap`: its two guide tones (the 3rd and the 7th or
 * 6th, a sus chord's 4th), either way up, the foot in the left hand's octave (C3–B3,
 * `SHELL_TOP`) — a spread's left hand without its right. A chord with one guide tone (a triad)
 * has no shell.
 */
function shellsUnder(guides: readonly number[], cap: number): number[][] {
    if (guides.length !== 2) {
        return [];
    }
    const out: number[][] = [];
    for (const [foot, partner] of [guides, [...guides].reverse()]) {
        for (let low = KEYS.lo; low <= SHELL_TOP; low++) {
            if (mod12(low) !== foot) {
                continue;
            }
            const upper = low + 1 + mod12(partner - (low + 1));
            if (upper <= cap) {
                out.push([low, upper]);
            }
        }
    }
    return out;
}
