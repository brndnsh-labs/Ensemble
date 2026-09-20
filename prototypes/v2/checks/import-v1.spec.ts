import { appUrl, expect, test } from './fixtures';

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

/** How many songbook rows carry the one stable v1-session document id. */
function v1SessionRows(page: import('@playwright/test').Page) {
    return page.getByRole('button', { name: 'Last session from the old Ensemble' }).count();
}

test('brings v1 songs into the songbook, plays one, and leaves v1 untouched', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seedV1Profile(page);
    await page.goto(appUrl());
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
    expect(await v1SessionRows(page)).toBe(1);
    expect(await v1KeysUnchanged(page)).toEqual({ state: true, presets: true });
    expect(errors).toEqual([]);
});

/**
 * "Not now" is permanent on this device, and the song menu is the way back (DECISION
 * 2026-09-19) — including running the import a second time, which must leave exactly one
 * `v1-session` document rather than a second copy of the same old session.
 */
test('declining is permanent, and the song menu brings the import back', async ({ page }) => {
    await seedV1Profile(page);
    await page.goto(appUrl());
    // The button that declines is the one that SAYS so (patch N1).
    await expect(page.getByTestId('v1-import').getByRole('button', { name: 'Done' })).toHaveCount(
        0,
    );
    await page.getByTestId('v1-import').getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('v1-import')).toHaveCount(0);

    // Never again by itself, whatever this device has or hasn't imported.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await expect(page.getByTestId('v1-import')).toHaveCount(0);

    async function openImportFromTheMenu() {
        await page.getByRole('button', { name: 'Song actions' }).click();
        await page.getByTestId('bring-over-v1').click();
        await expect(page.getByTestId('v1-import')).toBeVisible();
    }

    // The way back: open any song, then the permanent menu entry.
    // A starter is listed twice (the library table and the Quick Jam tiles); either opens it.
    await page.getByRole('button', { name: 'Blue pocket' }).first().click();
    await openImportFromTheMenu();
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toHaveText('Imported 3');
    expect(await v1SessionRows(page)).toBe(1);
    await page.getByTestId('v1-import').getByRole('button', { name: 'Done' }).click();

    // And again. The heading is a promise, so with everything already here it does not
    // offer to bring three songs over — and there is nothing to press but Done.
    await page.getByRole('button', { name: 'My Tune' }).click();
    await openImportFromTheMenu();
    const second = page.getByTestId('v1-import');
    await expect(
        second.getByRole('heading', { name: 'Everything from the old Ensemble is already here' }),
    ).toBeVisible();
    await expect(second).toContainText('3 songs from the old app are already in this songbook');
    await expect(second.getByRole('button', { name: 'Import' })).toHaveCount(0);
    await second.getByRole('button', { name: 'Done' }).click();
    expect(await v1SessionRows(page)).toBe(1);
    await expect(page.getByRole('button', { name: 'My Tune' })).toHaveCount(1);
    expect(await v1KeysUnchanged(page)).toEqual({ state: true, presets: true });
});

test('offers nothing on a profile that never ran v1', async ({ page }) => {
    await page.goto(appUrl());
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
    await page.goto(appUrl());
    const card = page.getByTestId('v1-import');
    await expect(
        card.getByRole('heading', { name: 'Bring over 1 song from the old Ensemble?' }),
    ).toBeVisible();
    // Reasons are readable BEFORE anything is pressed: a profile with nothing but
    // unreadable items has no Import button to click, so a reason that only exists in a
    // run's result would be unreachable (patch R1).
    await expect(card.getByTestId('v1-import-problems').locator('li')).toHaveText([
        'Your last session in the old Ensemble — its saved data is not readable.',
        'Saved progression “Broken tune” — its chords could not be read.',
    ]);

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

    // Shown once is enough: unreadable v1 data reads the same way on every load, so the
    // card does not re-open by itself for it (patch R1) …
    await page.getByTestId('v1-import').getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await expect(page.getByTestId('v1-import')).toHaveCount(0);

    // … and the way back still lists it, with its reason, for anyone who goes looking.
    await page.getByRole('button', { name: 'Good tune' }).click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('bring-over-v1').click();
    await expect(page.getByTestId('v1-import').getByTestId('v1-import-problems')).toContainText(
        'its saved data is not readable.',
    );
});

/** Whether this device has recorded the permanent "stop offering" answer. */
function declined(page: import('@playwright/test').Page) {
    return page.evaluate(
        () => localStorage.getItem('ensemble-v2-preview:v1-import-declined') !== null,
    );
}

/**
 * "Done" is not "Not now" (#1274 patch N1). A card with nothing left to offer still has a
 * button, and pressing it must not quietly mean "never tell me about the old Ensemble
 * again" — the musician who tidies up after importing is exactly the one who would then
 * never hear about next week's songs.
 */
test('Done never records the permanent decline', async ({ page }) => {
    await seedV1Profile(page);
    await page.goto(appUrl());
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toHaveText('Imported 3');
    await page.getByTestId('v1-import').getByRole('button', { name: 'Done' }).click();
    expect(await declined(page)).toBe(false);

    // Everything is here now, so the menu path offers nothing — and its Done is still Done.
    await page.getByRole('button', { name: 'My Tune' }).click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('bring-over-v1').click();
    const card = page.getByTestId('v1-import');
    await expect(
        card.getByRole('heading', { name: 'Everything from the old Ensemble is already here' }),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: 'Not now' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Done' }).click();
    expect(await declined(page)).toBe(false);

    // So next week's saved progression is still offered, by itself, on the next load.
    await page.evaluate(() => {
        const presets = JSON.parse(localStorage.getItem('ensemble_userPresets')!);
        presets.push({
            name: 'Next week',
            sections: btoa(JSON.stringify([{ l: 'A', v: 'I | V' }])),
            isMinor: false,
            timestamp: 1750000001000,
        });
        localStorage.setItem('ensemble_userPresets', JSON.stringify(presets));
    });
    await page.reload();
    await expect(
        page
            .getByTestId('v1-import')
            .getByRole('heading', { name: 'Bring over 1 song from the old Ensemble?' }),
    ).toBeVisible();
});

/**
 * A card with no Import button still has to be able to finish (#1274 patch N1c): dismissing
 * it records the unreadable items it displayed, or the automatic offer re-opens on every
 * load for data that will never read any differently.
 */
test('dismissing an unreadable-only card settles it without declining', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('ensemble_currentState', '{"sections":[{"label":"Verse"');
    });
    await page.goto(appUrl());
    const card = page.getByTestId('v1-import');
    await expect(
        card.getByRole('heading', { name: 'Some music in the old Ensemble could not be read' }),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: 'Import' })).toHaveCount(0);
    await expect(card.getByTestId('v1-import-problems')).toContainText(
        'its saved data is not readable.',
    );
    await card.getByRole('button', { name: 'Done' }).click();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await expect(page.getByTestId('v1-import')).toHaveCount(0);
    expect(await declined(page)).toBe(false);

    // And the way back still says what is wrong with it.
    await page.getByRole('button', { name: 'Blue pocket' }).first().click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('bring-over-v1').click();
    await expect(page.getByTestId('v1-import').getByTestId('v1-import-problems')).toContainText(
        'its saved data is not readable.',
    );
    // Reading it again is not agreeing to anything, so it still has not declined.
    expect(await declined(page)).toBe(false);
});
