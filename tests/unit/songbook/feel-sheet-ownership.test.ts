import { describe, expect, it } from 'vitest';
import { STATE_OWNERSHIP_MANIFEST } from '../../../public/songbook/state-ownership.js';

/**
 * #1276 — the v2 Feel sheet (`prototypes/v2/app/feel-sheet.tsx`) assumes each of its
 * controls belongs to exactly the ownership domain named below: a `document`-owned
 * field saves with the chart (`captureContent()`'s `arrangement`/`performance`/
 * `band.groove` projection in `prototypes/v2/lib/runtime.ts` already carries every one
 * of these — no codec change was needed), a `preferences`-owned field goes to
 * `prototypes/v2/lib/session.ts`'s own device-local key (`masterVolumePreference`/
 * `rememberMasterVolume`), and a `runtime-derived` field is session-only and never
 * persisted anywhere (`docs/design/write-ownership.md` §3 — deliberate, not a gap).
 * This pins the sheet's assumption against the live manifest so a future manifest
 * change can't silently drift from what the sheet does without failing here first.
 */
const FEEL_SHEET_FIELDS = [
    { control: 'Swing', slice: 'groove', field: 'swing', owner: 'document' },
    { control: 'Swing grid', slice: 'groove', field: 'swingSub', owner: 'document' },
    { control: 'Humanize', slice: 'groove', field: 'humanize', owner: 'document' },
    { control: 'Complexity', slice: 'playback', field: 'complexity', owner: 'document' },
    { control: 'Chord notation', slice: 'arranger', field: 'notation', owner: 'document' },
    { control: 'Master volume', slice: 'playback', field: 'masterVolume', owner: 'preferences' },
    {
        control: 'Band intensity',
        slice: 'playback',
        field: 'bandIntensity',
        owner: 'runtime-derived',
    },
    {
        control: 'Auto intensity',
        slice: 'playback',
        field: 'autoIntensity',
        owner: 'runtime-derived',
    },
    { control: 'Metronome', slice: 'playback', field: 'metronome', owner: 'runtime-derived' },
] as const;

describe('v2 Feel sheet ownership table (#1276)', () => {
    it.each(FEEL_SHEET_FIELDS)(
        '$control is $owner',
        ({
            slice,
            field,
            owner,
        }: {
            slice: 'groove' | 'playback' | 'arranger';
            field: string;
            owner: string;
        }) => {
            expect(STATE_OWNERSHIP_MANIFEST[slice][field as never]).toBe(owner);
        },
    );

    it("splits document/preferences (persisted) from runtime-derived (session-only) exactly as the sheet's copy claims", () => {
        const persisted = FEEL_SHEET_FIELDS.filter((f) => f.owner !== 'runtime-derived').map(
            (f) => f.control,
        );
        const sessionOnly = FEEL_SHEET_FIELDS.filter((f) => f.owner === 'runtime-derived').map(
            (f) => f.control,
        );
        // Mirrors the sheet's own footer copy: "Band intensity, auto intensity and the
        // metronome are session settings — they don't save with the chart."
        expect(sessionOnly).toEqual(['Band intensity', 'Auto intensity', 'Metronome']);
        expect(persisted).toEqual([
            'Swing',
            'Swing grid',
            'Humanize',
            'Complexity',
            'Chord notation',
            'Master volume',
        ]);
    });
});
