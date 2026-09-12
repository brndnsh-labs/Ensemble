import * as repository from './repository';
import type { ChartDocument } from './runtime';
import * as runtime from './runtime';

let boot: Promise<ChartDocument[]> | undefined;
export function start(): Promise<ChartDocument[]> {
    if (!boot) {
        boot = (async () => {
            await runtime.initialize();
            const existing = await repository.list();
            if (existing.length) {
                return existing;
            }
            const samples = [
                [
                    'Blue pocket',
                    'Blues',
                    'C',
                    'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
                    110,
                ],
                [
                    'Minor swing sketch',
                    'Jazz',
                    'A',
                    'Am6 | Am6 | Dm6 | Dm6 | E7 | E7 | Am6 | E7',
                    160,
                ],
                [
                    'After hours',
                    'Bossa',
                    'C',
                    'Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7 | Cmaj7 | Cmaj7',
                    125,
                ],
            ] as const;
            for (const [title, genre, key, value, bpm] of samples) {
                await runtime.setGenre(genre);
                const chart = runtime.captureContent();
                chart.arrangement = {
                    ...chart.arrangement,
                    key,
                    notation: 'name',
                    isMinor: key === 'A',
                    sections: [{ id: 'a', label: 'A', value, repeat: 1 }],
                };
                chart.performance.bpm = bpm;
                for (const lane of Object.values(chart.band)) {
                    lane.voice = 'synth';
                    lane.autoSound = false;
                }
                chart.band.soloist.enabled = false;
                chart.band.harmony.enabled = false;
                const now = new Date().toISOString();
                try {
                    await repository.save(
                        {
                            schemaVersion: 1,
                            id: `starter-${genre.toLowerCase()}`,
                            title,
                            createdAt: now,
                            updatedAt: now,
                            revision: 0,
                            chart,
                        },
                        null,
                    );
                } catch (error) {
                    if (!(error instanceof repository.ConflictError)) {
                        throw error;
                    }
                }
            }
            return repository.list();
        })();
    }
    return boot;
}
