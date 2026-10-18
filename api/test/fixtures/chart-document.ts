import type { ChartDocumentV2 } from '../../../core/songbook/score-types.js';

/**
 * One valid chart for the Save tests — schema 2, the only one the shared codec the endpoint
 * decodes with accepts since #1740. `id` is overridable because the sync identifier grammar is
 * stricter than the codec's and a test wants several documents per owner.
 */
export function makeChartDocument(id = 'chart-ada-001'): ChartDocumentV2 {
    return {
        schemaVersion: 2,
        id,
        title: 'Odd-Meter Study',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:30:00.000Z',
        revision: 3,
        chart: {
            score: {
                key: 'Gb',
                isMinor: false,
                notation: 'roman',
                meter: '5/4',
                grouping: [2, 3],
                sections: [
                    {
                        id: 'section-a',
                        label: 'A',
                        repeat: 2,
                        seamless: true,
                        targetIntensity: 0.62,
                        instruments: {
                            groove: true,
                            bass: true,
                            chords: false,
                            harmony: true,
                            soloist: false,
                        },
                        measures: [
                            {
                                id: 'm1',
                                content: {
                                    kind: 'events',
                                    events: [{ kind: 'chord', symbol: 'Gb^7', duration: [5, 1] }],
                                },
                            },
                        ],
                    },
                ],
            },
            performance: {
                bpm: 117,
                seed: 'A1B2C3',
                randomizeSeed: false,
            },
            band: {
                chords: {
                    enabled: true,
                    voice: 'pack:grand',
                    autoSound: false,
                    volume: 0.82,
                    reverb: 0.24,
                },
                bass: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    volume: 0.9,
                    reverb: 0.12,
                },
                soloist: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    volume: 0.88,
                    reverb: 0.3,
                    mode: 'monophonic',
                    autoMode: false,
                },
                groove: {
                    enabled: true,
                    voice: 'pack:studio-kit',
                    autoSound: false,
                    volume: 0.95,
                    reverb: 0.18,
                    swing: 56,
                    swingSub: '16th',
                    humanize: 23,
                    genre: 'Jazz',
                },
            },
        },
    };
}

/**
 * The same chart as a text chart (schema 1), the format retired in #1740: exactly what an older
 * build's outbox would still send. Not a valid document any more, so it is a plain object.
 */
export function makeTextChart(id = 'chart-ada-001'): Record<string, unknown> {
    const { chart, ...envelope } = makeChartDocument(id);
    return {
        ...envelope,
        schemaVersion: 1,
        chart: {
            arrangement: {
                sections: [{ id: 'section-a', label: 'A', value: 'Imaj7 | IVmaj7', repeat: 2 }],
                key: 'Gb',
                timeSignature: '5/4',
                grouping: [2, 3],
                isMinor: false,
                notation: 'roman',
            },
            performance: chart.performance,
            band: chart.band,
        },
    };
}
