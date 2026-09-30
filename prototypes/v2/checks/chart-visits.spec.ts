import { expectVisitsFollowForm } from './chart-visits';
import { expect, test } from './fixtures';

// The matcher is a pure function; this pins what it forgives and what it catches.
test('the chart-visit matcher forgives a slow start but not a dropped visit or a wrong form', () => {
    const lap = [
        { start: 0, end: 8, name: 'C' },
        { start: 8, end: 12, name: 'Dm' },
        { start: 12, end: 16, name: 'G7' },
    ];
    const twoLaps = [...lap, ...lap, lap[0]];
    expect(() => expectVisitsFollowForm(twoLaps, lap)).not.toThrow();
    // Playback starting late: the first lap's opening visits never painted.
    expect(() => expectVisitsFollowForm([lap[2], ...lap, ...lap, lap[0]], lap)).not.toThrow();
    // …but only so many of them.
    expect(() =>
        expectVisitsFollowForm([lap[2], ...lap, ...lap, lap[0]], lap, { firstLapDrops: 1 }),
    ).toThrow();
    // A visit dropped at the wrap — the #1240 stall — is never forgiven.
    expect(() => expectVisitsFollowForm([...lap, lap[1], lap[2], ...lap, lap[0]], lap)).toThrow();
    // A chord the form never reaches (Dm missing from every lap).
    expect(() =>
        expectVisitsFollowForm([lap[0], lap[2], lap[0], lap[2], lap[0], lap[2]], lap),
    ).toThrow();
    // Out of order.
    expect(() => expectVisitsFollowForm([lap[0], lap[2], lap[1], ...lap, lap[0]], lap)).toThrow();
    // Right names, wrong step span (a meter bug).
    expect(() =>
        expectVisitsFollowForm([...lap, lap[0], { ...lap[1], end: 13 }, lap[2], lap[0]], lap),
    ).toThrow();
    // Stops short of the laps it claims to have played.
    expect(() => expectVisitsFollowForm([...lap, lap[0]], lap)).toThrow();
});
