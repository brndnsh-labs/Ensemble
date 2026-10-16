// cspell:ignore iimaj
import { TIME_SIGNATURES } from '../config.js';
import { readLegacyChordToken } from '../engine/chords-engine.js';
import { decodeChartDocument } from './codec.js';
import { validateChartDocumentV2 } from './document-v2.js';
import { scoreDuration, scoreMeter } from './score-duration.js';
import { isScoreChord } from './score-text.js';
import type { ChartDocumentV2, ScoreEvent, ScoreMeasure, ScoreSection } from './score-types.js';
import type { CodecIssue } from './types.js';

/**
 * One thing the conversion did or could not do. A refusal (`legacy-syntax`, `off-grid`,
 * `empty-song`) blocks the song; the rest ride along with a candidate. A note about one bar
 * names where it is — the song, the section's label, the bar's number within the section
 * (from 1) and the bar's text as written — so whoever reads it can find the bar.
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
    | { kind: 'ok'; symbol: string; respelled: boolean }
    | { kind: 'refused'; why: string };

/**
 * One chord of a measure-less chart as a chart symbol that plays what the old parser played
 * (`readLegacyChordToken`, the parser's own steps). Two outcomes:
 *
 * - **As written**, when the chart vocabulary (`isScoreChord`) holds the token, or holds it
 *   once the Real Book's parentheses are dropped (`C-7(b5)` → `C-7b5`). The band then reads the
 *   written chord. Where the old parser dropped a written tone (it played a subset: `C7b9#11`
 *   as C7b9, `C13b9` as C7b9), the band now plays the tone the chart wrote; where it rounded two
 *   alterations to `7alt` (`C7#9b5`), the band plays the two written; and a lowercase numeral
 *   is read literally as minor (DECISION 2026-10-12, #1662) where the old parser kept a major
 *   third (`iimaj7#11`, `ii7alt`). `tests/unit/songbook/legacy-score.test.ts` lists each one.
 * - **Respelled** to the root as written plus the suffix the old parser played (its display
 *   name's), when the chart vocabulary has no such token — `CMaj7`, `Cm(maj7)`, `C7b9#11b13`
 *   — so the chord sounds exactly what the old parser played.
 *
 * Refused, with the reason, where the old parser guessed rather than read: no root it knew (it
 * fell back to the key's root, so `N.C.`, `%` or `C♯` played the wrong chord), no quality it
 * knew (it fell back to major), or a slash bass with more than a note after it.
 */
export function convertLegacyChordToken(token: string): LegacyTokenConversion {
    const read = readLegacyChordToken(token);
    if (!read.root) {
        return {
            kind: 'refused',
            why: `“${token}” starts with no root the old parser could read (it played the key's own chord there).`,
        };
    }
    if (read.bassText !== undefined && read.bass !== read.bassText) {
        return {
            kind: 'refused',
            why: `“${token}” has more than a note after its slash.`,
        };
    }
    if (!read.details.suffix && !read.details.recognised) {
        return {
            kind: 'refused',
            why: `The old parser read no chord quality in “${read.written}” of “${token}” (it played a plain major chord).`,
        };
    }
    if (isScoreChord(token)) {
        return { kind: 'ok', symbol: token, respelled: false };
    }
    // The Real Book's parentheses around an alteration (`C7(b9)`, `Cm7(b5)`) are notation the
    // old parser stripped; without them the chart vocabulary may hold the written chord.
    const bare = token.replace(/[()]/g, '');
    if (isScoreChord(bare)) {
        return { kind: 'ok', symbol: bare, respelled: true };
    }
    const symbol = `${read.root}${read.suffix}${read.bass ? `/${read.bass}` : ''}`;
    return isScoreChord(symbol)
        ? { kind: 'ok', symbol, respelled: true }
        : {
              kind: 'refused',
              why: `No chart spelling holds “${token}” (the old parser played ${symbol}).`,
          };
}

/**
 * Each chord's length in sixteenths, the way the old parser timed a bar: it shared the bar's
 * beats equally and rounded each chord to whole sixteenths (`updateProgressionCache`), so three
 * chords in 4/4 played 5 + 5 + 5 and the bar came out a sixteenth short. Every onset is kept
 * where the old parser put it; the last chord takes whatever is left of the written bar, so the
 * bar is whole (5 + 5 + 6). Null when the old onsets run past the bar's end.
 */
export function legacyBarSteps(chords: number, meter: string): number[] | null {
    const v1 = TIME_SIGNATURES[meter] || TIME_SIGNATURES['4/4'];
    const each = Math.round((v1.beats / chords) * v1.stepsPerBeat);
    const [n, d] = scoreMeter(meter).length;
    const bar = (n * 4) / d;
    const last = bar - each * (chords - 1);
    return each > 0 && last > 0 ? [...Array(chords - 1).fill(each), last] : null;
}

/**
 * Pure, source-preserving conversion of a measure-less (schema 1) chart into a score, playing
 * what the old parser (`validateProgression`) played. Never writes storage. Callers retain
 * source alongside a candidate before adopting it; blocked has no partial song, and names every
 * bar it could not convert.
 *
 * An empty bar (`C | | G`, or the empty text after a trailing `|`) and an empty section are
 * dropped: the old parser gave them no chord and no time, and its lead sheet drew no bar for
 * them, so the band went straight on. A rest bar would add silence that never played.
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
    const sections: ScoreSection[] = [];
    for (const [i, section] of arrangement.sections.entries()) {
        const { value, timeSignature, key, repeat, ...settings } = section;
        // V1 uses empty strings as explicit "inherit" values for section key/meter.
        const meter = timeSignature || arrangement.timeSignature;
        const measures: ScoreMeasure[] = [];
        const refusedBefore = issues.length;
        for (const [j, bar] of value.split('|').entries()) {
            const where = {
                path: `$.chart.arrangement.sections[${i}].value.bars[${j}]`,
                song,
                section: section.label,
                bar: j + 1,
                text: bar.trim(),
            };
            const tokens = bar.split(/\s+/).filter(Boolean);
            if (!tokens.length) {
                notes.push({
                    ...where,
                    code: 'empty-bar',
                    message: 'An empty bar played no time; it is left out.',
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
                if (c.kind !== 'ok') {
                    throw new Error('unreachable: refusals are reported above');
                }
                if (c.respelled) {
                    notes.push({
                        ...where,
                        code: 'respelled',
                        message: `“${tokens[k]}” is written ${c.symbol}, the chord it played.`,
                    });
                }
                return { kind: 'chord', symbol: c.symbol, duration: scoreDuration(steps[k], 4) };
            });
            measures.push({
                id: `measure-${++measureNumber}`,
                content: { kind: 'events', events },
            });
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
