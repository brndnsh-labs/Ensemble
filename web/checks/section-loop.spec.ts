import type { Page } from '@playwright/test';
import {
    expect,
    expectSaveDisabled,
    measureSong,
    seedGuestDocuments,
    songLink,
    test,
} from './fixtures';

/**
 * Looping a section (#1989): "Loop" in the section letter's menu plays just that section, over
 * and over, as a derived chart; the transport's "Looping B ×" ends it, and a band that is playing
 * carries on into the next section rather than stopping. Nothing about it is saved.
 *
 * A (C F) · B (Dm7 G7 Em7 A7) · C (Bb Eb) at 240 bpm: a bar a second, a lap of B four.
 */
function threeSections(id: string, title: string) {
    const doc = measureSong([id, title, 'Rock', 'C', 'C|F|Dm7|G7|Em7|A7|Bb|Eb', 240]);
    const [measures] = doc.chart.score.sections.map((section) => section.measures);
    doc.chart.score.sections = [
        { id: 'a', label: 'A', repeat: 1, measures: measures.slice(0, 2) },
        { id: 'b', label: 'B', repeat: 1, measures: measures.slice(2, 6) },
        { id: 'c', label: 'C', repeat: 1, measures: measures.slice(6) },
    ];
    return doc;
}
const LOOP_STUDY = threeSections('loop-study', 'Loop study');
const OTHER = measureSong(['loop-other', 'Other song', 'Rock', 'C', 'E|E|E|E', 240]);

const SECTION_B = ['Dm7', 'G7', 'Em7', 'A7'];
const active = (page: Page) => page.locator('.chord[aria-current="true"]');
const counter = (page: Page) => page.getByTestId('chorus-counter');
const chip = (page: Page) => page.getByRole('button', { name: 'Stop looping section B' });

async function openStudy(page: Page) {
    await seedGuestDocuments(page, [LOOP_STUDY, OTHER]);
    await songLink(page, 'Loop study').first().click();
}

async function loopB(page: Page) {
    await page.getByRole('button', { name: 'Section B', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Loop', exact: true }).click();
}

/** The chords the playhead lights over `seconds`, sampled every 150 ms. */
async function lit(page: Page, seconds: number): Promise<Set<string>> {
    const seen = new Set<string>();
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
        const text = await active(page)
            .first()
            .textContent({ timeout: 1000 })
            .catch(() => null);
        if (text) {
            seen.add(text.trim());
        }
        await page.waitForTimeout(150);
    }
    return seen;
}

test('Loop plays only that section, round and round, counting its laps', async ({ page }) => {
    test.setTimeout(60_000);
    await openStudy(page);
    await loopB(page);
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    await expect(chip(page)).toHaveText(/Looping B/);
    await expect(counter(page)).toHaveText(/^Lap 1$/, { timeout: 15_000 });
    await expect(counter(page)).toHaveText(/^Lap 2$/, { timeout: 15_000 });
    // A lap and a half more: every chord lit is B's, and B's last bar leads back to its top.
    const seen = await lit(page, 6);
    expect([...seen].every((chord) => SECTION_B.includes(chord))).toBe(true);
    expect(seen.has('A7')).toBe(true);
    expect(seen.has('Dm7')).toBe(true);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('clearing the loop while playing carries on into the next section', async ({ page }) => {
    test.setTimeout(60_000);
    await openStudy(page);
    await loopB(page);
    await expect(counter(page)).toHaveText(/^Lap 2$/, { timeout: 15_000 });
    await chip(page).click();
    await expect(chip(page)).toHaveCount(0);
    // Never stopped: the band finishes B and goes on into C, then round the song.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    await expect(active(page)).toHaveText('Bb', { timeout: 10_000 });
    await expect(counter(page)).toHaveText(/^Chorus \d+$/);
    await expect(active(page)).toHaveText('C', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('the loop holds through Stop and Play, and cleared stopped, Play plays the song', async ({
    page,
}) => {
    test.setTimeout(60_000);
    await openStudy(page);
    await loopB(page);
    await expect(active(page)).toHaveText('Dm7', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    // Still set: the next Play loops it again, from its top.
    await expect(chip(page)).toBeVisible();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(counter(page)).toHaveText(/^Lap 1$/, { timeout: 15_000 });
    await expect(active(page)).toHaveText('Dm7');
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();

    await chip(page).click();
    await expect(chip(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(counter(page)).toHaveText(/^Chorus 1$/, { timeout: 15_000 });
    await expect(active(page)).toHaveText('C');
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('another song opens without the loop, and the loop is never saved', async ({ page }) => {
    test.setTimeout(60_000);
    await openStudy(page);
    await loopB(page);
    await expect(active(page)).toHaveText('Dm7', { timeout: 10_000 });
    // Looping changes nothing in the chart: there is nothing to save.
    await expectSaveDisabled(page);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Other song').first().click();
    await expect(chip(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(counter(page)).toHaveText(/^Chorus 1$/, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    // Back to the first song: it opens as written, no loop.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Loop study').first().click();
    await expect(chip(page)).toHaveCount(0);
});

test('a loop set again and cleared while playing keeps the playhead in the section to the seam', async ({
    page,
}) => {
    test.setTimeout(60_000);
    await openStudy(page);
    // Loop B, stop, clear it stopped, then loop B again: the band still holds the first loop's
    // chart, and the stand must keep reading the bars it plays from it once cleared.
    await loopB(page);
    await expect(active(page)).toHaveText('Dm7', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await chip(page).click();
    await loopB(page);
    await expect(counter(page)).toHaveText(/^Lap 2$/, { timeout: 15_000 });
    await chip(page).click();
    // Until the band reaches C, every bar lit is B's: never the song's first bars.
    const order: string[] = [];
    const until = Date.now() + 8000;
    while (Date.now() < until && !order.includes('Bb')) {
        const text = await active(page)
            .first()
            .textContent({ timeout: 1000 })
            .catch(() => null);
        if (text && order.at(-1) !== text.trim()) {
            order.push(text.trim());
        }
        await page.waitForTimeout(50);
    }
    expect(order).toContain('Bb');
    expect(order.slice(0, order.indexOf('Bb')).every((chord) => SECTION_B.includes(chord))).toBe(
        true,
    );
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
