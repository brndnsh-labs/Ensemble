// @ts-nocheck
// cspell:ignore Bdim bdim
/**
 * Funk clav cell — key agreement (#1327).
 *
 * The clav cell builds its own 3-7-9 voicing by pitch class and SYNTHESIZES any degree the
 * written chord doesn't contain. A hardcoded b7 fallback is out of key on the I and IV of a
 * diatonic chart: `F` in C major came out A-**Eb**-G while the bass and soloist, which derive
 * their notes from the chord quality plus the key (`theory-scales.ts`), play E natural in the
 * same bar. That is a semitone collision BETWEEN lanes, which no comp-only assertion can see —
 * hence this file, which measures the comp against the key the other lanes read.
 *
 * The rule: a chord written with no seventh takes the seventh its KEY gives that root — maj7
 * where the chord is diatonic and its major 7th is in the key (I and IV of a major key, bIII
 * and bVI of a natural-minor one), b7 everywhere else. A chord that doesn't belong to the key
 * keeps the b7 (a chromatic chord in a funk chart is almost always dominant).
 *
 * Note on the oracle: the literal "every comp tone ∈ `getScaleForChord`" form is NOT
 * satisfiable for this lane, and that is a property of Funk's scale character rather than of
 * the comp — `SMART_SCALE_STYLE_MAP` sends Funk to the `funk` scale style, whose answer for a
 * plain major triad is MAJOR_BLUES `[0,2,3,4,7,9]`: no seventh of either flavour. So the
 * checkable form of the same claim is (a) every comp pitch class over a diatonic chord is in
 * the KEY, and (b) where the soloist's scale over that chord DOES have a seventh, the comp
 * sounds that one. Both below.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { sound, voice } from '../utils/voicing-probe.js';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEY_SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const INTENSITIES = [0.35, 0.65, 0.9];

/** Every pitch class the comp sounds over each chord of `chart`, across bass states. */
function compPitchClasses(chart, key, isMinor, intensity, bassOn) {
    return sound('Funk', bassOn, chart, intensity, 4, { key, isMinor }).map((heard) => {
        const pitchClasses = new Set();
        for (const degrees of heard.sets) {
            for (const degree of degrees) {
                pitchClasses.add((heard.chord.rootMidi + degree) % 12);
            }
        }
        return { name: heard.name, chord: heard.chord, pitchClasses, sets: heard.sets };
    });
}

function keyPitchClasses(key, isMinor) {
    const root = NAMES.indexOf(key);
    return new Set(
        (isMinor ? KEY_SCALES.minor : KEY_SCALES.major).map((interval) => (root + interval) % 12),
    );
}

/** The scale the soloist/bass will use over this chord, as pitch classes. */
function soloistScale(chord, key, isMinor) {
    const state = getState();
    state.groove.genreFeel = 'Funk';
    state.arranger.key = key;
    state.arranger.isMinor = isMinor;
    return getScaleForChord(state, chord).map((interval) => (chord.rootMidi + interval) % 12);
}

describe('Funk clav cell agrees with the chart key (#1327)', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    describe.each([
        ['C', false, 'C | F | G | Am'],
        ['C', false, 'C | Em | Dm | G'],
        ['A', true, 'Am | Dm | Em | F | G | C'],
    ])('key %s (minor: %s) — %s', (key, isMinor, chart) => {
        it.each(INTENSITIES)('sounds nothing outside the key at intensity %s', (intensity) => {
            const inKey = keyPitchClasses(key, isMinor);
            for (const bassOn of [true, false]) {
                const heard = compPitchClasses(chart, key, isMinor, intensity, bassOn);
                expect(heard.length, 'the comp never sounded').toBeGreaterThan(0);
                for (const { name, pitchClasses } of heard) {
                    expect(pitchClasses.size, `${name} sounded nothing`).toBeGreaterThan(0);
                    for (const pitchClass of pitchClasses) {
                        expect(
                            inKey.has(pitchClass),
                            `${name} in ${key}${isMinor ? 'm' : ''} (bass on: ${bassOn}, @${intensity}) sounds ${NAMES[pitchClass]}, outside the key`,
                        ).toBe(true);
                    }
                }
            }
        });

        it.each(INTENSITIES)(
            'sounds the same seventh the soloist scale has, where it has one (intensity %s)',
            (intensity) => {
                let checked = 0;
                for (const bassOn of [true, false]) {
                    for (const { name, chord, pitchClasses } of compPitchClasses(
                        chart,
                        key,
                        isMinor,
                        intensity,
                        bassOn,
                    )) {
                        const scale = soloistScale(chord, key, isMinor);
                        const root = ((chord.rootMidi % 12) + 12) % 12;
                        const scaleHas = (interval) => scale.includes((root + interval) % 12);
                        const compHas = (interval) => pitchClasses.has((root + interval) % 12);
                        // Only where the scale has exactly one opinion about the seventh.
                        if (scaleHas(10) === scaleHas(11)) {
                            continue;
                        }
                        checked++;
                        const where = `${name} in ${key}${isMinor ? 'm' : ''} (bass on: ${bassOn}, @${intensity})`;
                        if (scaleHas(10)) {
                            expect(compHas(11), `${where} sounds a maj7 the scale flattens`).toBe(
                                false,
                            );
                        } else {
                            expect(compHas(10), `${where} sounds a b7 the scale raises`).toBe(
                                false,
                            );
                        }
                    }
                }
                // Guard the guard: if the scale never had an opinion, this test proved nothing.
                expect(
                    checked,
                    'no chord in this chart had a scale seventh to agree with',
                ).toBeGreaterThan(0);
            },
        );
    });

    // The explicit pins from the issue's acceptance, as note names.
    it('voices C | F | G | Am with the key’s sevenths, not a blanket b7', () => {
        for (const bassOn of [true, false]) {
            for (const intensity of INTENSITIES) {
                const [c, f, g, am] = compPitchClasses(
                    'C | F | G | Am',
                    'C',
                    false,
                    intensity,
                    bassOn,
                );
                const where = `bass on: ${bassOn}, @${intensity}`;
                // I and IV: the key's seventh is MAJOR, so no Bb over C and no Eb over F.
                expect(c.pitchClasses.has(NAMES.indexOf('Bb')), `C sounds Bb (${where})`).toBe(
                    false,
                );
                expect(c.pitchClasses.has(NAMES.indexOf('B')), `C lost its maj7 (${where})`).toBe(
                    true,
                );
                expect(f.pitchClasses.has(NAMES.indexOf('Eb')), `F sounds Eb (${where})`).toBe(
                    false,
                );
                expect(f.pitchClasses.has(NAMES.indexOf('E')), `F lost its maj7 (${where})`).toBe(
                    true,
                );
                // V and vi: the key's seventh is FLAT, and that is the funk idiom intact.
                expect(g.pitchClasses.has(NAMES.indexOf('F')), `G lost its b7 (${where})`).toBe(
                    true,
                );
                expect(am.pitchClasses.has(NAMES.indexOf('G')), `Am lost its b7 (${where})`).toBe(
                    true,
                );
            }
        }
    });

    it('keeps the b7 on a chord that does not belong to the key', () => {
        // A chromatic Eb triad in C major: almost always dominant in a funk chart, and its own
        // b7 (Db) is outside the key — which is exactly why the rule asks about the CHORD.
        for (const bassOn of [true, false]) {
            const [eb] = compPitchClasses('Eb | C', 'C', false, 0.65, bassOn);
            const degrees = [...eb.pitchClasses].map(
                (pc) => (((pc - eb.chord.rootMidi) % 12) + 12) % 12,
            );
            expect(degrees, 'Eb lost its b7').toContain(10);
            expect(degrees, 'Eb gained a maj7').not.toContain(11);
        }
    });

    it('never invents a b7 on a diminished chord, nor any seventh on a power chord', () => {
        for (const intensity of INTENSITIES) {
            for (const bassOn of [true, false]) {
                const [bdim7, bdim, c5] = compPitchClasses(
                    'Bdim7 | Bdim | C5',
                    'C',
                    false,
                    intensity,
                    bassOn,
                );
                const where = `bass on: ${bassOn}, @${intensity}`;
                for (const heard of [bdim7, bdim]) {
                    const degrees = [...heard.pitchClasses].map(
                        (pc) => (((pc - heard.chord.rootMidi) % 12) + 12) % 12,
                    );
                    expect(degrees, `${heard.name} sounds a b7 (${where})`).not.toContain(10);
                    expect(degrees, `${heard.name} sounds a natural 5 (${where})`).not.toContain(7);
                    // Every voice is a tone the chord actually has: root, b3, b5, bb7. Nothing
                    // synthesized at all — which also keeps the cell inside the key, since a
                    // synthesized 9th over a leading-tone root leaves it (vii° in C -> C#).
                    for (const degree of degrees) {
                        expect(
                            [0, 3, 6, 9],
                            `${heard.name} sounds degree ${degree}, not a tone of the chord (${where})`,
                        ).toContain(degree);
                    }
                }
                const fifthDegrees = [...c5.pitchClasses].map(
                    (pc) => (((pc - c5.chord.rootMidi) % 12) + 12) % 12,
                );
                expect(fifthDegrees, `C5 sounds a third (${where})`).not.toContain(3);
                expect(fifthDegrees, `C5 sounds a third (${where})`).not.toContain(4);
                expect(fifthDegrees, `C5 sounds a seventh (${where})`).not.toContain(10);
                expect(fifthDegrees, `C5 sounds a seventh (${where})`).not.toContain(11);
            }
        }
    });

    // A chord the chart WRITES as a dominant must be untouched by all of the above: the cell
    // finds a real b7 and never reaches the key-aware fallback.
    it('leaves written dominants exactly as they were', () => {
        for (const bassOn of [true, false]) {
            for (const intensity of INTENSITIES) {
                const heard = compPitchClasses(
                    'C7 | C9 | C13 | Cm7 | Cmaj7 | C6',
                    'C',
                    false,
                    intensity,
                    bassOn,
                );
                const degreesOf = (entry) =>
                    [...entry.pitchClasses]
                        .map((pc) => (((pc - entry.chord.rootMidi) % 12) + 12) % 12)
                        .sort((a, b) => a - b);
                const rooted = bassOn ? [] : [0];
                // Written b7 chords keep the b7 they wrote; the maj7/6 chords keep theirs.
                expect(degreesOf(heard[0])).toEqual([...rooted, 2, 4, 10].sort((a, b) => a - b));
                expect(degreesOf(heard[1])).toEqual([...rooted, 2, 4, 10].sort((a, b) => a - b));
                expect(degreesOf(heard[2])).toEqual([...rooted, 2, 4, 10].sort((a, b) => a - b));
                expect(degreesOf(heard[3])).toEqual([...rooted, 2, 3, 10].sort((a, b) => a - b));
                expect(degreesOf(heard[4])).toEqual([...rooted, 2, 4, 11].sort((a, b) => a - b));
                expect(degreesOf(heard[5])).toEqual([...rooted, 2, 4, 9].sort((a, b) => a - b));
            }
        }
    });

    it('an 11 chord takes the 4th, never a synthesized major 3rd', () => {
        for (const bassOn of [true, false]) {
            const [c11] = compPitchClasses('C11 | F', 'C', false, 0.65, bassOn);
            const degrees = [...c11.pitchClasses].map(
                (pc) => (((pc - c11.chord.rootMidi) % 12) + 12) % 12,
            );
            expect(degrees, 'C11 lost its 4th').toContain(5);
            expect(degrees, 'C11 sounds a major 3rd').not.toContain(4);
        }
    });

    it('a plain suspended triad gets no synthesized seventh of either flavour', () => {
        // The key's 7th over Csus4 in C is B natural — a tritone from the suspended F,
        // which reads as G7 over C. Nobody wrote that; the cell stays inside the triad
        // (+ the 9th colour). A WRITTEN 7sus4 keeps its b7.
        for (const bassOn of [true, false]) {
            const heard = compPitchClasses('Csus4 | Csus2 | G7sus4', 'C', false, 0.65, bassOn);
            const degreesOf = ({ chord, pitchClasses }) =>
                [...pitchClasses].map((pc) => (((pc - chord.rootMidi) % 12) + 12) % 12);
            for (const triad of heard.slice(0, 2)) {
                expect(degreesOf(triad), `${triad.name} sounds a b7`).not.toContain(10);
                expect(degreesOf(triad), `${triad.name} sounds a maj7`).not.toContain(11);
                expect(degreesOf(triad), `${triad.name} sounds a 3rd`).not.toContain(4);
            }
            expect(degreesOf(heard[0])).toContain(5);
            expect(degreesOf(heard[1])).toContain(2);
            expect(degreesOf(heard[2]), 'G7sus4 lost its written b7').toContain(10);
        }
    });

    it('the parse layer is untouched by any of this', () => {
        // The cell is a LIVE-layer reducer; `chord.freqs` still comes from getIntervals.
        const [c, f] = voice('Funk', true, 'C | F', 'C', 0.35);
        expect([...c.degrees].sort((a, b) => a - b)).toEqual([0, 4, 7]);
        expect([...f.degrees].sort((a, b) => a - b)).toEqual([0, 4, 7]);
    });
});
