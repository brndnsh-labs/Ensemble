import { decodeChartDocument } from './codec.js';
import { validateChartDocumentV2 } from './document-v2.js';
import { durationToSteps } from './score-duration.js';
import { parseChordBar } from './score-text.js';
import type { ChartDocumentV2, ScoreMeasure, ScoreSection } from './score-types.js';
import type { CodecIssue } from './types.js';

interface ConversionNote {
    path: string;
    code: 'legacy-syntax' | 'off-grid' | 'preset-detached';
    message: string;
}

type ConversionResult =
    | { kind: 'candidate'; source: string; value: ChartDocumentV2; notes: ConversionNote[] }
    | { kind: 'blocked'; source: string; issues: (CodecIssue | ConversionNote)[] };

// Deliberately conservative v1 spelling gate, not the v2 chord vocabulary. V1 uses
// partial suffix matching (e.g. C-6, C7b9#11), so accepting those as new full tokens
// would silently change meaning. More aliases need paired legacy/semantic adapter tests.
const LEGACY_CHORD =
    /^(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?)(?:maj7|m7b5|m13|m11|m9|m7|m6|m|dim7|dim|7#5|7b5|7b9|7#9|7#11|7b13|sus4|sus2|add9|13|11|9|7|6|5)?(?:\/(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?))?$/;

/**
 * Pure, source-preserving conversion proposal. Never writes storage or certifies audio
 * equivalence: even a candidate needs the future performance adapter's acceptance gate.
 * Callers retain source alongside a candidate before adopting it; blocked has no partial song.
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
    const arrangement = legacy.chart.arrangement;
    const issues: ConversionNote[] = [];
    let measureNumber = 0;
    const sections: ScoreSection[] = arrangement.sections.map((section, i) => {
        const { value, timeSignature, key, repeat, ...settings } = section;
        // V1 uses empty strings as explicit "inherit" values for section key/meter.
        const meter = timeSignature || arrangement.timeSignature;
        const measures: ScoreMeasure[] = [];
        for (const [j, bar] of value.split('|').entries()) {
            const path = `$.chart.arrangement.sections[${i}].value.bars[${j}]`;
            if (
                !bar
                    .trim()
                    .split(/\s+/)
                    .every((chord) => LEGACY_CHORD.test(chord))
            ) {
                issues.push({
                    path,
                    code: 'legacy-syntax',
                    message:
                        'This bar needs a spelling/structure review; its original text is preserved.',
                });
                continue;
            }
            const parsed = parseChordBar(bar, meter);
            if (parsed.kind !== 'ok') {
                issues.push({
                    path,
                    code: 'legacy-syntax',
                    message:
                        'This bar cannot be converted exactly; its original text is preserved.',
                });
                continue;
            }
            if (parsed.value.some((event) => durationToSteps(event.duration) === null)) {
                issues.push({
                    path,
                    code: 'off-grid',
                    message:
                        'Equal chord lengths do not fit the legacy sixteenth grid; choose timing explicitly before conversion.',
                });
                continue;
            }
            measures.push({
                id: `measure-${++measureNumber}`,
                content: { kind: 'events', events: parsed.value },
            });
        }
        return {
            ...settings,
            repeat: repeat ?? 1,
            ...(key ? { key } : {}),
            ...(timeSignature ? { meter } : {}),
            measures,
        };
    });
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
    return {
        kind: 'candidate',
        source,
        value: checked.value,
        notes: arrangement.lastChordPreset
            ? [
                  {
                      path: '$.chart.arrangement.lastChordPreset',
                      code: 'preset-detached',
                      message:
                          'The saved preset association remains in the original document; the new score owns its written music.',
                  },
              ]
            : [],
    };
}
