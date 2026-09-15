import type { ChartDocument } from '../../../../public/songbook/types.js';

/**
 * One valid schema-1 chart for the Save tests — the same shape the root
 * `tests/unit/songbook/codec.test.ts` fixture uses, so it passes the shared codec the endpoint
 * decodes with. `id` is overridable because the sync identifier grammar is stricter than the
 * codec's and a test wants several documents per owner.
 */
export function makeChartDocument(id = 'chart-ada-001'): ChartDocument {
    return {
        schemaVersion: 1,
        id,
        title: 'Odd-Meter Study',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:30:00.000Z',
        revision: 3,
        chart: {
            arrangement: {
                sections: [
                    {
                        id: 'section-a',
                        label: 'A',
                        value: 'Imaj7 | IVmaj7',
                        repeat: 2,
                        key: 'Gb',
                        isMinor: false,
                        timeSignature: '5/4',
                        seamless: true,
                        targetIntensity: 0.62,
                        instruments: {
                            groove: true,
                            bass: true,
                            chords: false,
                            harmony: true,
                            soloist: false,
                        },
                    },
                ],
                key: 'Gb',
                timeSignature: '5/4',
                grouping: [2, 3],
                isMinor: false,
                notation: 'roman',
                lastChordPreset: 'User Study',
            },
            performance: {
                bpm: 117,
                complexity: 0.67,
                seed: 'A1B2C3',
                randomizeSeed: false,
            },
            band: {
                chords: {
                    enabled: true,
                    voice: 'pack:grand',
                    autoSound: false,
                    style: 'smart',
                    instrument: 'Piano',
                    octave: 48,
                    density: 'rich',
                    volume: 0.82,
                    reverb: 0.24,
                },
                bass: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    octave: 38,
                    volume: 0.9,
                    reverb: 0.12,
                },
                soloist: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    preset: 'trumpet',
                    octave: 72,
                    volume: 0.88,
                    reverb: 0.3,
                    mode: 'monophonic',
                    autoMode: false,
                    phrasingIntensity: 0.74,
                    tradeMode: 'sections',
                },
                harmony: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    octave: 60,
                    volume: 0.7,
                    reverb: 0.4,
                    complexity: 0.58,
                },
                groove: {
                    enabled: true,
                    voice: 'pack:studio-kit',
                    autoSound: false,
                    volume: 0.95,
                    reverb: 0.18,
                    measures: 2,
                    swing: 56,
                    swingSub: '16th',
                    humanize: 23,
                    lastDrumPreset: 'Basic Rock',
                    genreFeel: 'Jazz',
                    lastSmartGenre: 'Jazz',
                    pattern: [
                        { name: 'Kick', steps: [1, 0, 0, 0, 2, 0, 0, 0] },
                        { name: 'Snare', steps: [0, 0, 1, 0, 0, 0, 1, 0] },
                    ],
                },
            },
        },
    };
}
