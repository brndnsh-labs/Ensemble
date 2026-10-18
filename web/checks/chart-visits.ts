import { expect } from './fixtures';

/** One chord the stand lit during playback: its step span and name. */
export type ChartVisit = { start: number; end: number; name: string };

const visitKey = (visit: ChartVisit) => `${visit.name}@${visit.start}-${visit.end}`;

/**
 * Assert the stand's painted chord pointer followed `lap`, repeated, in order.
 *
 * The stand reads the playhead every animation frame (#1240), so a chord goes
 * unpainted only if the main thread stalls for longer than it lasts. The lap
 * wrap used to be such a stall: the drummer's first crash rendered its nine
 * seconds of cymbal on the main thread right there, and under CI contention a
 * whole ~500ms chord went unpainted. That is fixed (`warmDrumBuffers`), so from
 * the first wrap on NO visit may be skipped.
 *
 * Starting playback is the one stall left. Under heavy contention WebKit can
 * block the main thread outside any script while the audio device comes up, so
 * the first lap may miss up to `firstLapDrops` visits. Every visit the stand DID
 * paint must still be the next one the form calls for, the form must wrap, and
 * every chord in it must be reached: a wrong chord, a wrong step span, an
 * out-of-order visit, a skipped wrap or a chord that never appears still fails.
 */
export function expectVisitsFollowForm(
    observed: ChartVisit[],
    lap: ChartVisit[],
    { laps = 2, firstLapDrops = 2 } = {},
) {
    // Walk the form as an endless repetition rather than a fixed window: a
    // dropped visit in the first lap shifts the run, and cutting at a fixed
    // number of visits would then compare a shifted slice.
    const trail = () =>
        `painted: ${observed.map(visitKey).join(' -> ')}\nform:    ${lap.map(visitKey).join(' -> ')}`;
    const startup: string[] = [];
    const dropped: string[] = [];
    let cursor = 0;
    for (const visit of observed) {
        const resume = cursor;
        while (
            visitKey(lap[cursor % lap.length]) !== visitKey(visit) &&
            cursor - resume < lap.length
        ) {
            (cursor < lap.length ? startup : dropped).push(visitKey(lap[cursor % lap.length]));
            cursor += 1;
        }
        expect(
            visitKey(lap[cursor % lap.length]),
            `the chart painted ${visitKey(visit)}, which the form never calls for here.\n${trail()}`,
        ).toBe(visitKey(visit));
        cursor += 1;
    }
    expect(
        cursor,
        `the chart should get through ${laps} laps and start another.\n${trail()}`,
    ).toBeGreaterThanOrEqual(laps * lap.length + 1);
    expect(
        dropped,
        `the chart skipped a visit after the first wrap: a main-thread stall mid-performance.\n${trail()}`,
    ).toEqual([]);
    expect(
        startup,
        `the chart skipped more than ${firstLapDrops} visits while playback started.\n${trail()}`,
    ).toHaveLength(Math.min(startup.length, firstLapDrops));

    // Drop-tolerant coverage: a sample lost in one lap is covered by the next,
    // but a chord the form never reaches at all is absent from every lap.
    expect(
        [...new Set(observed.map(visitKey))].sort(),
        `every chord in the form should be reached.\n${trail()}`,
    ).toEqual([...new Set(lap.map(visitKey))].sort());
}
