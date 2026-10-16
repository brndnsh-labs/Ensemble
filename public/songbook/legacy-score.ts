// cspell:ignore iimaj mmaj majadd madd minadd susb sus4b dom9 dom13
import { TIME_SIGNATURES } from '../config.js';
import { type LegacyChordToken, readLegacyChordToken } from '../engine/chords-engine.js';
import { decodeChartDocument } from './codec.js';
import { validateChartDocumentV2 } from './document-v2.js';
import { scoreDuration, scoreMeter } from './score-duration.js';
import { isScoreChord } from './score-text.js';
import type { ChartDocumentV2, ScoreEvent, ScoreMeasure, ScoreSection } from './score-types.js';
import type { CodecIssue } from './types.js';

/**
 * One thing the conversion did or could not do. A refusal (`legacy-syntax`, `off-grid`,
 * `empty-song`) blocks the song; the rest ride along with a candidate. A note about one bar
 * names where it is — the song, the section's label, the bar's number among the section's
 * non-empty bars (from 1, as the sheet shows them) and the bar's text as written.
 *
 * `respelled` is notation only: the chord sounds as written. `tones-dropped` writes a chord
 * that leaves out a written tone (the one the old parser also left out, or less), because no
 * chart spelling holds the whole of it.
 */
export interface ConversionNote {
    path: string;
    code:
        | 'legacy-syntax'
        | 'off-grid'
        | 'empty-song'
        | 'empty-bar'
        | 'empty-section'
        | 'respelled'
        | 'tones-dropped'
        | 'preset-detached';
    message: string;
    song?: string;
    section?: string;
    bar?: number;
    text?: string;
}

type ConversionResult =
    | { kind: 'candidate'; source: string; value: ChartDocumentV2; notes: ConversionNote[] }
    | { kind: 'blocked'; source: string; issues: (CodecIssue | ConversionNote)[] };

export type LegacyTokenConversion =
    | { kind: 'chord'; symbol: string; change: 'none' | 'notation' | 'tones-dropped' }
    | { kind: 'no-chord' }
    | { kind: 'refused'; why: string };

/**
 * Spellings the chart vocabulary writes differently, keyed by the old parser's normalised
 * suffix (case folded, `()`, `/` and spaces gone). Each is the same chord, tone for tone.
 */
const EQUIVALENT_SPELLINGS: Readonly<Record<string, string>> = Object.assign(Object.create(null), {
    // A bare capital M is the major triad (`CM`), as `CMaj` and `CMA` are.
    M: '',
    mmaj: 'mMaj7',
    mmaj7: 'mMaj7',
    mmaj9: '-^9',
    mmaj11: 'min^11',
    mmaj13: 'min^13',
    m69: '-69',
    min69: '-69',
    m6add9: '-69',
    maj69: '69',
    maj6: '6',
    majadd9: 'add9',
    'maj9#11': '^9#11',
    '△9#11': '^9#11',
    '△7#11': 'maj7#11',
    '△7#5': 'maj7#5',
    '+maj7': 'maj7#5',
    augmaj7: 'maj7#5',
    '7sus4b9': '7b9sus',
    '7susb9': '7b9sus',
    '7b9sus4': '7b9sus',
    '7sus4b13': '7b13sus',
    '7susb13': '7b13sus',
    '7b13sus4': '7b13sus',
    m7b6: 'min7b6',
    '-7b6': 'min7b6',
    m9b6: 'min9b6',
    '-9b6': 'min9b6',
    m9b5: 'h9',
    min9b5: 'h9',
    '-9b5': 'h9',
    ø9: 'h9',
    aug9: '9#5',
    '+9': '9#5',
    add4: 'maj(add4)',
    majadd4: 'maj(add4)',
    madd4: 'min(add4)',
    minadd4: 'min(add4)',
    '7add13': '7(add13)',
    '7add6': '7(add13)',
    dom9: '9',
    dom13: '13',
    // A raised 5th written with `+`: the augmented triad, a minor triad with a ♯5 (bare `m+`
    // has no 7th to make it ambiguous), a 9th chord with a ♯5.
    '+5': '+',
    'm+': 'm#5',
    'min+': 'm#5',
    '-+': 'm#5',
    '9+': '9#5',
    // A dominant 11th with a ♭9: 1 5 ♭7 ♭9 11, the suspended ♭9 chord.
    '11b9': '7b9sus',
    // A 6th with a ♭7 over it (`C6/7`): the 7th chord with an added 13th.
    '67': '7(add13)',
    // Natural tensions in parentheses over a 7th chord (`C7(9)`, `C7(9,13)`, `Cm7(9)`), once
    // the parentheses and commas are gone.
    '79': '9',
    '7913': '13',
    '79#11': '9#11',
    '79#1113': '13#11',
    '7b913': '13b9',
    '7#913': '13#9',
    '913': '13',
    '713': '7(add13)',
    m79: 'm9',
    '-79': '-9',
    m7911: 'm11',
    '-7911': '-11',
    m7913: 'm13',
    maj79: 'maj9',
    maj7913: 'maj13',
    'maj79#11': '^9#11',
    mMaj79: '-^9',
});

/**
 * A fake book's spellings, onto the vocabulary's: an alteration written `-`/`+` after a digit
 * (`m7-5`, `7-9`, `7b9+5`, `7+11`; a leading `-` still means minor), and the Brazilian `7M`
 * for a major 7th (`C7M`, `Cm7M`).
 */
function fakeBook(tail: string): string {
    return tail
        .replace(/^(m|-|min|mi)?7M/, (_, minor) => (minor ? 'mMaj7' : 'maj7'))
        .replace(/(?<=\d)-(?=5|9|13)/g, 'b')
        .replace(/(?<=\d)\+(?=5|9|11|13)/g, '#');
}

/** A tone in parentheses straight after the root is added, not a 7th chord's: `C(9)` is Cadd9. */
function addedTone(written: string): string {
    return written.replace(/^(m|-|min|mi)?\((?:9|2)\)$/, (_, minor) => (minor ? 'madd9' : 'add9'));
}

/** The alterations at the end of a suffix: `7b9#11` is `7` with `b9` and `#11`. */
const ALTERATIONS = /^(.*?)((?:[#b+](?:13|11|9|5))*)$/;

function permutations<T>(items: T[]): T[][] {
    return items.length <= 1
        ? [items]
        : items.flatMap((item, i) =>
              permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
                  item,
                  ...rest,
              ]),
          );
}

/** The spellings a written suffix may take with no tone changed: as written, then reordered. */
function sameChordSpellings(tail: string): string[] {
    const [, base, altText] = ALTERATIONS.exec(tail) ?? [tail, tail, ''];
    const alterations = altText.match(/[#b+](?:13|11|9|5)/g) ?? [];
    const orders =
        alterations.length > 1 && alterations.length <= 4
            ? permutations(alterations).map((order) => base + order.join(''))
            : [tail];
    return [tail, ...orders].flatMap((spelling) =>
        Object.hasOwn(EQUIVALENT_SPELLINGS, spelling)
            ? [spelling, EQUIVALENT_SPELLINGS[spelling]]
            : [spelling],
    );
}

/** The numbers a suffix names (`m11b5` names 11 and 5): what a respelling must keep. */
const named = (suffix: string) => new Set(suffix.match(/\d+/g) ?? []);

/**
 * One chord of a measure-less chart as a chart symbol (#1737), read the way the old parser
 * (`readLegacyChordToken`, its own steps) read it, in this order:
 *
 * 1. **As written**, when the chart vocabulary (`isScoreChord`) holds the token. `♭`/`♯` are
 *    read as written (the old parser did not know them and played the bare letter's chord).
 * 2. **Respelled, no tone changed** (`notation`): case folded and `()`, `,`, `/` and spaces
 *    dropped the way the old parser dropped them (`CMaj7`, `C7(b9,#11)` → `C7b9#11`),
 *    a fake book's `-`/`+` alterations and Brazilian `7M` (`Cm7-5` → `Cm7b5`, `C7M` →
 *    `Cmaj7`), alterations reordered (`C7#11b9` → `C7b9#11`), or a known equivalent spelling
 *    (`Cm6/9` → `C-69`, `CmMaj9` → `C-^9`, `C7(9,13)` → `C13`, `CM` → `C`). A 9 in
 *    parentheses straight after the root is an added tone, by its intent: `C(9)` → `Cadd9`
 *    (the old parser played C9).
 * 3. **The longest written prefix the vocabulary holds** (`tones-dropped`), never shorter than
 *    the spelling the old parser matched: `C7b9#11b13` → `C7b9#11`, where the old parser
 *    played C7b9.
 * 4. **The chord the old parser played**, root as written (`notation` when it read all of the
 *    suffix and kept every number it names, else `tones-dropped`).
 *
 * A slash bass with more than a note after it keeps the note (`C/G7` → `C/G`, tones dropped).
 * `N.C.` is no chord. Refused, with the reason, where the old parser guessed: no root it knew
 * (it played the key's own chord there), no quality it knew (it played major), or a respelling
 * that would sound a tone the chart rules out (`Cmaj7sus4`: no chart spelling keeps the sus4
 * and the major 7th, and the old parser's Cmaj7 writes the 3rd the sus excludes).
 *
 * The band then plays the chart's chord: where the old parser dropped or rounded a written
 * tone, the written one sounds. `tests/unit/songbook/legacy-score.test.ts` lists each case.
 */
export function convertLegacyChordToken(token: string): LegacyTokenConversion {
    if (/^N\.?C\.?$/i.test(token)) {
        return { kind: 'no-chord' };
    }
    const ascii = token.replaceAll('♭', 'b').replaceAll('♯', '#');
    const read = readLegacyChordToken(ascii);
    if (!read.root) {
        return {
            kind: 'refused',
            why: `“${token}” starts with no root the old parser could read (it played the key's own chord there).`,
        };
    }
    if (!read.details.suffix && !read.details.recognised && read.normalised !== 'M') {
        return {
            kind: 'refused',
            why: `The old parser read no chord quality in “${read.written}” of “${token}” (it played a plain major chord).`,
        };
    }
    const bassDropped = read.bassText !== undefined && read.bass !== read.bassText;
    if (isScoreChord(token) && !bassDropped) {
        return { kind: 'chord', symbol: token, change: 'none' };
    }
    const bass = read.bass ? `/${read.bass}` : '';
    const held = (tail: string) => isScoreChord(read.root + tail + bass);
    const chord = (tail: string, lossy: boolean): LegacyTokenConversion => ({
        kind: 'chord',
        symbol: read.root + tail + bass,
        change: lossy || bassDropped ? 'tones-dropped' : 'notation',
    });
    // The old parser kept commas; read past them (`7(b9,#11)` is 7b9#11).
    const normalised = fakeBook(read.normalised.replaceAll(',', ''));
    const literal = fakeBook(addedTone(read.written).replace(/[(),\s]/g, ''));
    const lossless = [literal, normalised].flatMap(sameChordSpellings).find(held);
    if (lossless !== undefined) {
        return chord(lossless, false);
    }
    const suspends = (suffix: string) => /sus|no|omit/.test(suffix);
    const prefix = longestHeldPrefix(read, normalised, held);
    // A kept prefix that loses a written sus gives way to the old parser's chord, if that kept it.
    const kept =
        prefix !== undefined && suspends(normalised) && !suspends(prefix) ? undefined : prefix;
    if (suspends(normalised) && !suspends(kept ?? read.suffix)) {
        return {
            kind: 'refused',
            why: `No chart spelling holds “${token}”, and the old parser's ${read.root}${read.suffix} sounds the 3rd it leaves out.`,
        };
    }
    if (kept !== undefined) {
        return chord(kept, true);
    }
    if (!held(read.suffix)) {
        return {
            kind: 'refused',
            why: `No chart spelling holds “${token}” (the old parser played ${read.root}${read.suffix}).`,
        };
    }
    const keepsEveryNumber = [...named(read.details.suffix)].every((n) =>
        named(read.suffix).has(n),
    );
    return chord(read.suffix, !read.details.recognised || !keepsEveryNumber);
}

/**
 * The longest prefix of the written suffix, cut at an alteration, that the vocabulary holds
 * with no tone changed — but never shorter than the spelling the old parser matched, so it
 * holds at least what the old parser played. Undefined when none does.
 */
function longestHeldPrefix(
    read: LegacyChordToken,
    normalised: string,
    held: (tail: string) => boolean,
): string | undefined {
    if (read.details.recognised && normalised === read.details.suffix) {
        return undefined;
    }
    const cuts = [...normalised.matchAll(/[#b+](?:13|11|9|5)/g)]
        .map((match) => match.index)
        .filter((at) => at >= read.details.suffix.length)
        .sort((a, b) => b - a);
    for (const at of cuts) {
        const found = sameChordSpellings(normalised.slice(0, at)).find(held);
        if (found !== undefined) {
            return found;
        }
    }
    return undefined;
}

/**
 * Each chord's length in sixteenths, the way the old parser timed a bar: it shared the bar's
 * beats equally and rounded each chord to whole sixteenths (`updateProgressionCache`), so three
 * chords in 4/4 played 5 + 5 + 5 and the bar came out a sixteenth short. Every onset is kept
 * where the old parser put it, and the last chord takes whatever is left of the written bar
 * (5 + 5 + 6) — unless that leaves it under half the others' length (six in 4/4 would end on a
 * single sixteenth), when the chords spread evenly on the grid instead, each onset rounded up
 * (3 + 3 + 2 + 3 + 3 + 2). Null when there are more chords than sixteenths.
 */
export function legacyBarSteps(chords: number, meter: string): number[] | null {
    const v1 = TIME_SIGNATURES[meter] || TIME_SIGNATURES['4/4'];
    const each = Math.round((v1.beats / chords) * v1.stepsPerBeat);
    const [n, d] = scoreMeter(meter).length;
    const bar = (n * 4) / d;
    if (chords > bar) {
        return null;
    }
    const last = bar - each * (chords - 1);
    if (each > 0 && last * 2 >= each) {
        return [...Array(chords - 1).fill(each), last];
    }
    const onset = (k: number) => Math.ceil((k * bar) / chords);
    return Array.from({ length: chords }, (_, k) => onset(k + 1) - onset(k));
}

/**
 * Pure, source-preserving conversion of a measure-less (schema 1) chart into a score, playing
 * what the old parser (`validateProgression`) played. Never writes storage. Callers retain
 * source alongside a candidate before adopting it; blocked has no partial song, and names every
 * bar it could not convert.
 *
 * An empty bar (`C | | G`) and an empty section are dropped: the old parser gave them no chord
 * and no time, and its lead sheet drew no bar for them, so the band went straight on. A rest
 * bar would add silence that never played. The text before a leading `|` or after a trailing
 * one is not a bar at all, and goes without a note. A bar of `%` repeats the bar before it.
 */
export function proposeLegacyScoreConversion(source: string): ConversionResult {
    const decoded = decodeChartDocument(source);
    if (decoded.kind !== 'ok') {
        return {
            kind: 'blocked',
            source,
            issues:
                decoded.kind === 'invalid'
                    ? decoded.issues
                    : [
                          {
                              path: '$.schemaVersion',
                              code: 'invalid-value',
                              message: 'Only version-1 documents can be converted here.',
                          },
                      ],
        };
    }
    const legacy = decoded.value;
    const song = legacy.title;
    const arrangement = legacy.chart.arrangement;
    const issues: ConversionNote[] = [];
    const notes: ConversionNote[] = [];
    let measureNumber = 0;
    /** The last bar converted, for `%`: the measure holding its events, and its meter. */
    let previous: { source: string; meter: string } | null = null;
    const sections: ScoreSection[] = [];
    for (const [i, section] of arrangement.sections.entries()) {
        const { value, timeSignature, key, repeat, ...settings } = section;
        // V1 uses empty strings as explicit "inherit" values for section key/meter.
        const meter = timeSignature || arrangement.timeSignature;
        const measures: ScoreMeasure[] = [];
        const refusedBefore = issues.length;
        const pieces = value.split('|').map((bar) => bar.split(/\s+/).filter(Boolean));
        const first = pieces.findIndex((tokens) => tokens.length);
        const last = pieces.length - 1 - [...pieces].reverse().findIndex((tokens) => tokens.length);
        let barNumber = 0;
        for (const [j, tokens] of pieces.entries()) {
            const path = `$.chart.arrangement.sections[${i}].value.bars[${j}]`;
            if (!tokens.length) {
                // Only between two bars: an empty section gets its empty-section note alone.
                if (first >= 0 && j > first && j < last) {
                    notes.push({
                        path,
                        song,
                        section: section.label,
                        code: 'empty-bar',
                        message: `An empty bar after bar ${barNumber} played no time; it is left out.`,
                    });
                }
                continue;
            }
            const where = {
                path,
                song,
                section: section.label,
                bar: ++barNumber,
                text: tokens.join(' '),
            };
            const id = `measure-${measureNumber + 1}`;
            if (tokens.length === 1 && tokens[0] === '%') {
                if (!previous || previous.meter !== meter) {
                    issues.push({
                        ...where,
                        code: 'legacy-syntax',
                        message: previous
                            ? `“%” repeats a bar in another meter; write the chords.`
                            : `“%” has no bar before it to repeat.`,
                    });
                    continue;
                }
                measureNumber++;
                measures.push({
                    id,
                    content: { kind: 'repeat', measureId: previous.source, display: 'one-bar' },
                });
                continue;
            }
            const converted = tokens.map(convertLegacyChordToken);
            const refused = converted.flatMap((c) => (c.kind === 'refused' ? [c.why] : []));
            if (refused.length) {
                issues.push({ ...where, code: 'legacy-syntax', message: refused.join(' ') });
                continue;
            }
            const steps = legacyBarSteps(tokens.length, meter);
            if (!steps) {
                issues.push({
                    ...where,
                    code: 'off-grid',
                    message: `${tokens.length} chords do not fit one bar of ${meter} in sixteenths; choose their lengths.`,
                });
                continue;
            }
            const events: ScoreEvent[] = converted.map((c, k) => {
                const duration = scoreDuration(steps[k], 4);
                if (c.kind === 'no-chord') {
                    return { kind: 'no-chord', duration };
                }
                if (c.kind !== 'chord') {
                    throw new Error('unreachable: refusals are reported above');
                }
                if (c.change !== 'none') {
                    notes.push({
                        ...where,
                        code: c.change === 'notation' ? 'respelled' : 'tones-dropped',
                        message:
                            c.change === 'notation'
                                ? `“${tokens[k]}” is written ${c.symbol}.`
                                : `“${tokens[k]}” is written ${c.symbol}: no chart spelling holds all of it.`,
                    });
                }
                return { kind: 'chord', symbol: c.symbol, duration };
            });
            measureNumber++;
            measures.push({ id, content: { kind: 'events', events } });
            previous = { source: id, meter };
        }
        if (!measures.length) {
            if (issues.length === refusedBefore) {
                notes.push({
                    path: `$.chart.arrangement.sections[${i}]`,
                    song,
                    section: section.label,
                    code: 'empty-section',
                    message: 'A section with no chords played no time; it is left out.',
                });
            }
            continue;
        }
        sections.push({
            ...settings,
            repeat: repeat ?? 1,
            ...(key ? { key } : {}),
            ...(timeSignature ? { meter } : {}),
            measures,
        });
    }
    if (!issues.length && !sections.length) {
        issues.push({
            path: '$.chart.arrangement.sections',
            song,
            code: 'empty-song',
            message: 'The chart has no chords, so there is nothing to play.',
        });
    }
    if (issues.length) {
        return { kind: 'blocked', source, issues };
    }
    const candidate: ChartDocumentV2 = {
        ...legacy,
        schemaVersion: 2,
        chart: {
            performance: legacy.chart.performance,
            band: legacy.chart.band,
            score: {
                key: arrangement.key,
                isMinor: arrangement.isMinor,
                notation: arrangement.notation,
                meter: arrangement.timeSignature,
                grouping: arrangement.grouping,
                sections,
            },
        },
    };
    const checked = validateChartDocumentV2(candidate);
    if (checked.kind !== 'ok') {
        return {
            kind: 'blocked',
            source,
            issues: checked.kind === 'invalid' ? checked.issues : [],
        };
    }
    if (arrangement.lastChordPreset) {
        notes.push({
            path: '$.chart.arrangement.lastChordPreset',
            code: 'preset-detached',
            message:
                'The saved preset association remains in the original document; the new score owns its written music.',
        });
    }
    return { kind: 'candidate', source, value: checked.value, notes };
}
