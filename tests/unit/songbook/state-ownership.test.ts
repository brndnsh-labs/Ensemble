import { describe, expect, it } from 'vitest';
import { STATE_OWNERSHIP_MANIFEST } from '../../../core/songbook/state-ownership.js';

// The manifest's completeness is a compile-time guard (`satisfies` in state-ownership.ts); this
// pins the classification decisions themselves, including every field the Feel sheet
// (`web/app/band-groove.tsx`) leans on: a `document` field saves with the chart, a `preferences`
// one goes to the device-local key, a `runtime-derived` one is session-only.
type Row = readonly [keyof typeof STATE_OWNERSHIP_MANIFEST, string, string];
const OWNERS: Row[] = [
    ['arranger', 'notation', 'document'],
    ['groove', 'swing', 'document'],
    ['groove', 'swingSub', 'document'],
    ['groove', 'humanize', 'document'],
    ...(['chords', 'bass', 'soloist', 'groove'] as const).flatMap((lane): Row[] => [
        [lane, 'volume', 'document'],
        [lane, 'reverb', 'document'],
    ]),
    // A chart's energy (DECISION 2026-09-26): saved with the chart, set only by the user.
    ['playback', 'bandIntensity', 'document'],
    ['playback', 'autoIntensity', 'document'],
    ['playback', 'masterVolume', 'preferences'],
    ['playback', 'metronome', 'runtime-derived'],
    ['playback', 'audioGraph', 'runtime-derived'],
    ['soloist', 'audio', 'runtime-derived'],
];

describe('Songbook state ownership manifest (#1044, #1276)', () => {
    it.each(OWNERS)('%s.%s is %s', (slice, field, owner) => {
        expect((STATE_OWNERSHIP_MANIFEST[slice] as Record<string, string>)[field]).toBe(owner);
    });
});
