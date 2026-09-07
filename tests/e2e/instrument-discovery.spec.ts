// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

async function settingsSnapshot(page) {
    return page.evaluate(() => {
        const s = window.ensemble.getState();
        return {
            playing: s.playback.isPlaying,
            genre: s.groove.lastSmartGenre,
            lanes: Object.fromEntries(
                ['groove', 'bass', 'chords', 'harmony', 'soloist'].map((module) => {
                    const lane = s[module];
                    return [
                        module,
                        {
                            enabled: lane.enabled,
                            style: lane.style,
                            voice: lane.voice,
                            autoSound: lane.autoSound,
                            volume: lane.volume,
                            reverb: lane.reverb,
                            density: lane.density,
                            phrasingIntensity: lane.phrasingIntensity,
                        },
                    ];
                }),
            ),
        };
    });
}

async function expectInViewport(page, locator) {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

for (const [genre, label, value] of [
    ['Jazz', 'Jazz comping', 'jazz'],
    ['Acoustic', 'Piano arpeggio', 'arp'],
]) {
    test(`${genre} names its player and opens the chooser without changing the part`, async ({
        page,
    }, testInfo) => {
        await gotoHydrated(page, `/?genre=${genre}`);
        const row = page.locator('#panel-chords');
        await expect(row.locator('.workspace-studio-player-summary')).toHaveText(label);
        const action = row.getByRole('button', { name: 'Chords settings: Change player' });
        await expect(action).toHaveText('Change player›');
        const before = await settingsSnapshot(page);
        await action.focus();
        await page.keyboard.press('Enter');
        const chooser = page.getByLabel('Playing style', { exact: true });
        await expect(chooser).toBeFocused();
        await expect(chooser).toHaveValue(value);
        await expect(chooser.locator('option[value="modern-piano"]')).toHaveCount(1);
        await expect(chooser.locator('option[value="open-modal"]')).toHaveCount(1);
        // No installed packs in this fresh context: players stay available.
        expect(await settingsSnapshot(page)).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(action).toBeFocused();
        expect(await settingsSnapshot(page)).toEqual(before);
        if (genre === 'Jazz') {
            await page.screenshot({
                path: testInfo.outputPath('instrument-discovery-desktop.png'),
            });
        }
    });
}

test('non-player lanes open real controls and retain muted and pinned settings', async ({
    page,
}) => {
    await gotoHydrated(page, '/?genre=Rock');
    const row = page.locator('#panel-chords');
    await expect(row.getByText('Change player', { exact: true })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Chords settings: Voicing' })).toBeVisible();
    for (const [label, action, selector] of [
        ['Drums', 'Sound', '.instrument-sound-source button[aria-pressed="true"]'],
        ['Bass', 'Sound', '.instrument-sound-source button[aria-pressed="true"]'],
        ['Chords', 'Voicing', '#densitySelect'],
        ['Harmony', 'Sound', '.instrument-sound-source button[aria-pressed="true"]'],
        ['Soloist', 'Phrasing', '#soloistPhrasingIntensity'],
    ]) {
        const trigger = page.getByRole('button', { name: `${label} settings: ${action}` });
        const before = await settingsSnapshot(page);
        await trigger.click();
        const panel = page.getByRole('dialog', { name: `${label} settings`, exact: true });
        await expect(panel.locator(selector)).toBeFocused();
        expect(await settingsSnapshot(page)).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
    }
    await row.getByRole('button', { name: 'Toggle Chords' }).click();
    await row.getByRole('button', { name: 'Chords settings: Voicing' }).click();
    await page
        .locator('.instrument-sound-source')
        .getByRole('button', { name: 'Synth', exact: true })
        .click();
    await page.keyboard.press('Escape');
    const pinned = await settingsSnapshot(page);
    expect(pinned.lanes.chords.enabled).toBe(false);
    expect(pinned.lanes.chords.autoSound).toBe(false);
    await row.getByRole('button', { name: 'Chords settings: Voicing' }).click();
    await page.keyboard.press('Escape');
    expect(await settingsSnapshot(page)).toEqual(pinned);
});

test('saved explicit players remain discoverable outside their genre and follow genre changes', async ({
    page,
}) => {
    await gotoHydrated(page, '/?genre=Rock&style=open-modal');
    const row = page.locator('#panel-chords');
    await expect(row.locator('.workspace-studio-player-summary')).toHaveText('Open modal piano');
    await row.getByRole('button', { name: 'Chords settings: Change player' }).click();
    await expect(page.locator('#chordPlayerSelect')).toBeFocused();
    await expect(page.locator('#chordPlayerSelect')).toHaveValue('open-modal');
    await page.locator('#chordPlayerSelect').selectOption('modern-piano');
    await page.keyboard.press('Escape');
    await expect(row.locator('.workspace-studio-player-summary')).toHaveText('Modern jazz piano');
    await page.waitForFunction(
        () =>
            JSON.parse(localStorage.getItem('ensemble_currentState') || '{}').chords?.style ===
            'modern-piano',
    );
    await page.evaluate(() => history.replaceState(null, '', '/'));
    await page.reload();
    await page.waitForSelector('html[data-hydrated="true"]');
    await expect(row.locator('.workspace-studio-player-summary')).toHaveText('Modern jazz piano');
    await page.locator('.workspace-studio-genre-button').click();
    await page.getByRole('button', { name: 'Funk', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(row.getByRole('button', { name: 'Chords settings: Voicing' })).toBeVisible();
    await expect(row.locator('.workspace-studio-player-summary')).toHaveCount(0);
    await page.locator('.workspace-studio-genre-button').click();
    await page.getByRole('button', { name: 'Acoustic', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(row.locator('.workspace-studio-player-summary')).toHaveText('Piano arpeggio');
});

test('compact mix exposes a touch-sized player action and restores nested focus @mobile', async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHydrated(page, '/?genre=Acoustic');
    await page.locator('.mobile-action-bar__btn', { hasText: 'Mix' }).click();
    const sheet = page.locator('.mobile-mix-sheet');
    const row = sheet.locator('#panel-chords');
    const trigger = row.getByRole('button', { name: 'Chords settings: Change player' });
    await expect(row.locator('.workspace-studio-player-summary')).toHaveText('Piano arpeggio');
    await trigger.scrollIntoViewIfNeeded();
    await expectInViewport(page, trigger);
    expect((await trigger.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('instrument-discovery-mobile.png') });
    const before = await settingsSnapshot(page);
    await trigger.tap();
    const chooser = page.locator('#chordPlayerSelect');
    await expect(chooser).toBeFocused();
    await expectInViewport(page, chooser);
    await page.screenshot({
        path: testInfo.outputPath('instrument-discovery-mobile-settings.png'),
    });
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await settingsSnapshot(page)).toEqual(before);
});
