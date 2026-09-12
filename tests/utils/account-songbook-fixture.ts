import type { ChartDocument } from '../../public/songbook/types.js';

/** Original synthetic chart; no user library or imported repertoire in sync fixtures. */
export function accountChart(title = 'A', id = 'study'): ChartDocument {
    const mix = {
        enabled: true,
        voice: 'synth',
        autoSound: false,
        volume: 0.8,
        reverb: 0.2,
    } as const;
    return {
        schemaVersion: 1,
        id,
        title,
        revision: 0,
        createdAt: '2026-09-09T12:00:00.000Z',
        updatedAt: '2026-09-09T12:00:00.000Z',
        chart: {
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                lastChordPreset: 'Study',
                sections: [{ id: 'a', label: 'A', value: 'C7 | F7', repeat: 1 }],
            },
            performance: { bpm: 120, complexity: 0.5, seed: 'ABC123', randomizeSeed: false },
            band: {
                chords: {
                    ...mix,
                    style: 'smart',
                    octave: 48,
                    instrument: 'Piano',
                    density: 'rich',
                },
                bass: { ...mix, style: 'smart', octave: 36 },
                harmony: { ...mix, style: 'smart', octave: 60, complexity: 0.5 },
                soloist: {
                    ...mix,
                    style: 'smart',
                    octave: 72,
                    preset: 'trumpet',
                    mode: 'monophonic',
                    autoMode: false,
                    phrasingIntensity: 0.5,
                    tradeMode: 'manual',
                },
                groove: {
                    ...mix,
                    measures: 1,
                    swing: 50,
                    swingSub: '8th',
                    humanize: 0,
                    lastDrumPreset: 'Basic Rock',
                    genreFeel: 'Jazz',
                    lastSmartGenre: 'Jazz',
                    pattern: [],
                },
            },
        },
    };
}
