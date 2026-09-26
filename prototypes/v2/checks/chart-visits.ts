import { expect } from './fixtures';

/** One chord the stand lit during playback: its step span and name. */
export type ChartVisit = { start: number; end: number; name: string };

const visitKey = (visit: ChartVisit) => `${visit.name}@${visit.start}-${visit.end}`;

/**
 * Assert the stand's painted chord pointer followed `lap`, repeated, in order.
 *
 * What the DOM shows is a SAMPLE of the performance, not every frame of it: the
 * runtime publishes `chords.lastActiveChordIndex` off a 50ms interval (`followPlayhead`) and React paints
 * the result, so a main-thread stall longer than a chord drops that chord from
 * the chart even though the audio — scheduled ahead on the audio thread — is
 * unaffected. Under CI contention (three WebKit workers on a four-core runner)
 * that happens at the lap wrap, where the turnaround does the most work: an
 * instrumented run caught F@44-60 followed directly by Dm@8-12, with C@0-8's
 * ~500ms window painted in neither the mutation records nor an independent
 * requestAnimationFrame sampler.
 *
 * So assert the musical claim rather than the frame-rate one. Every visit the
 * stand DID paint must be the next one the form calls for, the form must wrap,
 * and every chord in it must be reached. A wrong chord, a wrong step span, an
 * out-of-order visit, a skipped wrap or a chord that never appears at all still
 * fails; only a bounded number of dropped SAMPLES is forgiven.
 */
export function expectVisitsFollowForm(
    observed: ChartVisit[],
    lap: ChartVisit[],
    { laps = 2, maxDroppedSamples = 2 } = {},
) {
    // Walk the form as an endless repetition rather than a fixed window: a
    // dropped sample pushes the run into a later lap, and cutting at a fixed
    // number of visits would then compare a shifted slice and fail for the very
    // reason this matcher exists to forgive.
    const trail = () =>
        `painted: ${observed.map(visitKey).join(' -> ')}\nform:    ${lap.map(visitKey).join(' -> ')}`;
    const dropped: string[] = [];
    let cursor = 0;
    for (const visit of observed) {
        const resume = cursor;
        while (
            visitKey(lap[cursor % lap.length]) !== visitKey(visit) &&
            cursor - resume < lap.length
        ) {
            dropped.push(visitKey(lap[cursor % lap.length]));
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
        `the chart skipped more than ${maxDroppedSamples} visits, which is a stalled main ` +
            `thread rather than a sampling hiccup.\n${trail()}`,
    ).toHaveLength(Math.min(dropped.length, maxDroppedSamples));

    // Drop-tolerant coverage: a sample lost in one lap is covered by the next,
    // but a chord the form never reaches at all is absent from every lap.
    expect(
        [...new Set(observed.map(visitKey))].sort(),
        `every chord in the form should be reached.\n${trail()}`,
    ).toEqual([...new Set(lap.map(visitKey))].sort());
}
