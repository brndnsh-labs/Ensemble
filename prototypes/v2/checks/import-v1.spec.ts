import { expect, test } from './fixtures';

/**
 * The v1 import offer, end to end (#1274).
 *
 * `/` and `/v2/` share an origin in production, so the stand reads v1's `localStorage`
 * directly; here the profile is seeded with `addInitScript` before the app loads. The
 * shapes below are what v1's own writers emit (`saveCurrentState` and the compressed
 * `saveProgression` payload) — the byte-level fidelity of that claim is owned by
 * `tests/unit/songbook/v1-import.test.ts`, which produces its fixtures by running those
 * writers. This spec owns the flow: the offer, the import, playback of what landed, the
 * offer staying gone, and v1's keys coming out byte-identical.
 */
async function seedV1Profile(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        const lane = (extra: Record<string, unknown>) => ({
            enabled: true,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.2,
            ...extra,
        });
        const session = {
            sections: [
                { id: 'verse', label: 'Verse', value: 'I | vi | IV | V', key: '' },
                { id: 'bridge', label: 'Bridge', value: 'ii | V | I', key: 'F' },
            ],
            key: 'G',
            timeSignature: '4/4',
            grouping: null,
            isMinor: false,
            notation: 'name',
            lastChordPreset: 'Old session',
            seed: '',
            randomizeSeed: false,
            bpm: 96,
            complexity: 0.3,
            mixerVersion: 2,
            chords: lane({ style: 'smart', octave: 65, density: 'standard', reverb: 0.3 }),
            bass: lane({ style: 'smart', octave: 36, reverb: 0.05 }),
            soloist: lane({
                enabled: false,
                style: 'smart',
                preset: 'trumpet',
                octave: 72,
                reverb: 0.6,
                mode: 'monophonic',
                autoMode: true,
                phrasingIntensity: 0.5,
            }),
            harmony: lane({
                enabled: false,
                style: 'smart',
                octave: 60,
                reverb: 0.4,
                complexity: 0.5,
            }),
            groove: lane({
                swing: 0,
                swingSub: '8th',
                humanize: 20,
                lastDrumPreset: 'Basic Rock',
                genreFeel: 'Rock',
                lastSmartGenre: 'Rock',
                sectionSeedMap: {},
                pattern: [
                    { name: 'Kick', steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
                    { name: 'Snare', steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
                    { name: 'HiHat', steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
                ],
            }),
        };
        // The exact envelope `saveProgression` writes: a name, the Base64 of the minified
        // sections, the minor flag and the save time.
        const preset = (name: string, sections: unknown[], isMinor: boolean) => ({
            name,
            sections: btoa(JSON.stringify(sections)),
            isMinor,
            timestamp: 1750000000000,
        });
        const state = JSON.stringify(session);
        const presets = JSON.stringify([
            preset('My Tune', [{ l: 'Head', v: 'I | vi | ii | V', k: 'G' }], false),
            preset('Minor thing', [{ l: 'A', v: 'i | bVI | bVII | i' }], true),
        ]);
        // Never clobber real v1 data: seed only what is absent, exactly as the legacy
        // sentinel in foundation.spec.ts does.
        if (!localStorage.getItem('ensemble_currentState')) {
            localStorage.setItem('ensemble_currentState', state);
        }
        if (!localStorage.getItem('ensemble_userPresets')) {
            localStorage.setItem('ensemble_userPresets', presets);
        }
        Object.assign(window, { __v1Seed: { state, presets } });
    });
}

function v1KeysUnchanged(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
        const seed = (window as unknown as { __v1Seed: { state: string; presets: string } })
            .__v1Seed;
        return {
            state: localStorage.getItem('ensemble_currentState') === seed.state,
            presets: localStorage.getItem('ensemble_userPresets') === seed.presets,
        };
    });
}

test('brings v1 songs into the songbook, plays one, and leaves v1 untouched', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seedV1Profile(page);
    await page.goto('/v2/');
    const card = page.getByTestId('v1-import');
    await expect(
        card.getByRole('heading', { name: 'Bring over 3 songs from the old Ensemble?' }),
    ).toBeVisible();

    await card.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toHaveText('Imported 3');
    await expect(page.getByRole('button', { name: 'My Tune' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minor thing' })).toBeVisible();
    expect(await v1KeysUnchanged(page)).toEqual({ state: true, presets: true });

    await page.getByRole('button', { name: 'My Tune' }).click();
    await expect(page.getByRole('heading', { name: 'My Tune', exact: true })).toBeVisible();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('96');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();

    // The offer is remembered per v1 item, so a reload does not ask again — and the
    // imported songs are still there.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await expect(page.getByTestId('v1-import')).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Last session from the old Ensemble' }),
    ).toBeVisible();
    expect(await v1KeysUnchanged(page)).toEqual({ state: true, presets: true });
    expect(errors).toEqual([]);
});

test('offers nothing on a profile that never ran v1', async ({ page }) => {
    await page.goto('/v2/');
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await expect(page.getByTestId('v1-import')).toHaveCount(0);
});

test('lists v1 data it cannot read instead of quietly importing nothing', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('ensemble_currentState', '{"sections":[{"label":"Verse"');
        localStorage.setItem(
            'ensemble_userPresets',
            JSON.stringify([
                { name: 'Broken tune', sections: '!!!not-base64!!!', isMinor: false },
                { name: 'Good tune', sections: btoa('[{"l":"A","v":"I | IV"}]'), isMinor: false },
            ]),
        );
    });
    await page.goto('/v2/');
    const card = page.getByTestId('v1-import');
    await expect(
        card.getByRole('heading', { name: 'Bring over 1 song from the old Ensemble?' }),
    ).toBeVisible();
    await expect(card).toContainText('2 items could not be read');

    await card.getByRole('button', { name: 'Import' }).click();
    const result = page.getByTestId('v1-import-result');
    await expect(result).toContainText('Imported 1');
    await expect(result).toContainText('its saved data is not readable.');
    await expect(result).toContainText(
        'Saved progression “Broken tune” — its chords could not be read.',
    );
    await expect(page.getByRole('button', { name: 'Good tune' })).toBeVisible();
    // The unreadable blob is still exactly as v1 left it: nothing repaired, nothing removed.
    expect(await page.evaluate(() => localStorage.getItem('ensemble_currentState'))).toBe(
        '{"sections":[{"label":"Verse"',
    );
});
