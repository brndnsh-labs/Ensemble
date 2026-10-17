import type { ChartDocumentV2 } from '../../public/songbook/score-types.js';

/** Original synthetic chart; no user library or imported repertoire in sync fixtures. */
export function accountChart(title = 'A', id = 'study'): ChartDocumentV2 {
    const mix = {
        enabled: true,
        voice: 'synth',
        autoSound: false,
        volume: 0.8,
        reverb: 0.2,
    } as const;
    return {
        schemaVersion: 2,
        id,
        title,
        revision: 0,
        createdAt: '2026-09-09T12:00:00.000Z',
        updatedAt: '2026-09-09T12:00:00.000Z',
        chart: {
            performance: { bpm: 120, seed: 'ABC123', randomizeSeed: false },
            band: {
                chords: { ...mix },
                bass: { ...mix },
                soloist: {
                    ...mix,
                    mode: 'monophonic',
                    autoMode: false,
                },
                groove: {
                    ...mix,
                    swing: 50,
                    swingSub: '8th',
                    humanize: 0,
                    genre: 'Jazz',
                },
            },
            score: {
                key: 'C',
                isMinor: false,
                notation: 'name',
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: 'a',
                        label: 'A',
                        repeat: 1,
                        measures: ['C7', 'F7'].map((symbol, index) => ({
                            id: `a-${index}`,
                            content: {
                                kind: 'events' as const,
                                events: [{ kind: 'chord' as const, symbol, duration: [4, 1] }],
                            },
                        })),
                    },
                ],
            },
        },
    } as ChartDocumentV2;
}
