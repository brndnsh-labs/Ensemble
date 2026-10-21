import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, seedStarters, songLink, test, typeBar } from './fixtures';

/**
 * The most of each preview element on the board in any frame over `ms` of playback: the preview
 * lives on the last beat only, so a fixed-interval poll could keep missing it.
 */
function previewSeen(page: Page, ms: number) {
    return page.evaluate(
        (ms) =>
            new Promise<{ ghosts: number; arrows: number; targets: number }>((resolve) => {
                const seen = { ghosts: 0, arrows: 0, targets: 0 };
                const end = performance.now() + ms;
                const count = (selector: string) =>
                    document.querySelectorAll(`.neck-view ${selector}`).length;
                const frame = () => {
                    seen.ghosts = Math.max(seen.ghosts, count('.neck-ghost-dot'));
                    seen.arrows = Math.max(seen.arrows, count('.neck-arrow'));
                    seen.targets = Math.max(seen.targets, count('.neck-target'));
                    if (performance.now() < end) {
                        requestAnimationFrame(frame);
                    } else {
                        resolve(seen);
                    }
                };
                frame();
            }),
        ms,
    );
}

/**
 * The stand's Neck mode (#1587): a third view beside Chart and Edit chart that shows the grip for
 * the chord sounding now, previews the next one, follows the band, and is remembered per device.
 */
test('the neck shows the grip, follows the band and is remembered', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Neck study');
    for (const [i, bar] of ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'].entries()) {
        await typeBar(page, i + 1, bar);
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);

    // Neck replaces the chart sheet; stopped, it shows the first grip and points at the second.
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByRole('button', { name: 'Chart', exact: true })).not.toHaveClass(
        /active/,
    );
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chord chart' })).toHaveCount(0);
    await expect(view.locator('svg.neck')).toBeVisible();
    await expect(view.locator('.neck-dot')).toHaveCount(3);
    await expect(view.getByTestId('neck-current')).toHaveText('Dm7');
    // The shell Dm7 x 5 3 5 x x leaves three strings silent, each marked × as a chord chart
    // marks them (#1811), and the board's text names them.
    await expect(view.locator('.neck-mute')).toHaveCount(3);
    expect(
        await view
            .locator('.neck-mute')
            .evaluateAll((marks) => marks.map((m) => m.getAttribute('data-mute'))),
    ).toEqual(['6', '2', '1']);
    await expect(view.locator('.neck-strum')).toHaveAttribute(
        'aria-label',
        /^Hear Dm7: .*; 6th, 2nd and 1st strings not played$/,
    );
    await expect(view.getByTestId('neck-next')).toContainText('G7');
    const headline = view.locator('.neck-headline');
    await expect(headline).toContainText('then G7');
    await expect(headline).toContainText('root moves to the 6th string');
    // The finger-by-finger detail is off until asked for, and remembered once it is.
    await expect(view.locator('.neck-fingers')).toHaveCount(0);
    const sayFingers = view.getByRole('checkbox', { name: 'Say the fingers' });
    await expect(sayFingers).not.toBeChecked();
    await sayFingers.check();
    await expect(view.locator('.neck-fingers')).toBeVisible();
    // Dm7 x 5 3 5 x x (2-1-3) to G7 3 x 3 4 x x (1-2-3): no finger stays on the F both chords
    // fret, so the line names the note and its two jobs (#1618), then the fingers that move —
    // the 7th slides down to G7's 3rd.
    const fingers = view.locator('.neck-fingers');
    await expect(fingers).toContainText(
        'F is in both chords: the 3rd becomes the 7th; finger 2 takes it over',
    );
    await expect(fingers).not.toContainText('finger 2 moves');
    await expect(fingers).toContainText('finger 1 moves to');
    await expect(fingers).toContainText('finger 3 slides down 1 fret');
    await page.reload();
    await songLink(page, 'Neck study').first().click();
    await expect(view.getByRole('checkbox', { name: 'Say the fingers' })).toBeChecked();
    await expect(view.locator('.neck-fingers')).toBeVisible();

    // The phone keeps the page inside the screen in Neck mode — the finger line included, which
    // wraps inside the strip instead of widening it.
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
        await fingers.evaluate((el) => {
            const strip = el.parentElement!.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return (
                el.scrollWidth <= el.clientWidth &&
                box.left >= strip.left &&
                box.right <= strip.right &&
                box.right <= window.innerWidth
            );
        }),
    ).toBe(true);

    // The hand position is the neck's own slider; it starts in first position (#1598, #1840).
    const hand = view.getByRole('slider', { name: 'Hand position' });
    await expect(hand).toHaveAttribute('aria-valuenow', '1');
    await hand.focus();
    await hand.press('ArrowRight');
    await expect(hand).toHaveAttribute('aria-valuenow', '2');

    // A ukulele has four strings, a guitar six.
    const instrument = view.getByLabel('Instrument', { exact: true });
    await instrument.selectOption('uke');
    await expect(view.locator('.neck-string')).toHaveCount(4);
    await expect(view.getByLabel('Root strings')).toHaveCount(0);
    await instrument.selectOption('guitar');
    await expect(view.locator('.neck-string')).toHaveCount(6);

    // Playing, the neck follows the band to the second chord. "Say the fingers" is on, so the
    // last beat before each change draws the finger arrows (#1592) — a frame-polled wait, since
    // that beat is a quarter of each bar.
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(view.getByTestId('neck-current')).toHaveText('G7', { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('.neck-view .neck-arrow') !== null);
    await expect(headline).toContainText('Next: Cmaj7');
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();

    // Stopped, one step on: G7 to Cmaj7 keeps the ring finger on its note, and the line still
    // says so — now with the note and what it becomes (#1618).
    await view.getByRole('button', { name: 'Next chord' }).click();
    await expect(view.getByTestId('neck-current')).toHaveText('G7');
    await expect(view.getByTestId('neck-next')).toContainText('Cmaj7');
    await expect(fingers).toContainText('Finger 3 stays down on B: the 3rd becomes the 7th');

    // Neck mode is remembered on this device.
    await page.reload();
    await songLink(page, 'Neck study').first().click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByRole('region', { name: 'Neck' }).locator('.neck-dot')).toHaveCount(3);
    // The editor overlays the neck without forgetting it: leaving the editor by Play (no mode
    // button pressed) lands back on Neck, the mode a reload would bring back too.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await editorRevealed(page);
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await expect(page.getByRole('region', { name: 'Neck' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Neck' }).locator('svg.neck')).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    // The mode buttons hide while the band plays; stopped, Neck is the active one.
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    // Chart brings the sheet back.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(errors).toEqual([]);
});

test('the preview shows where the next grip is; the fingers on request (#1592)', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view.locator('svg.neck')).toBeVisible();
    // Stopped: the grip only, the strip names what's next.
    await expect(view.locator('.neck-ghost-dot, .neck-rootpath, .neck-arrow')).toHaveCount(0);

    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    const play = async () => {
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(
            page.getByRole('button', { name: 'Stop playback', exact: true }),
        ).toBeEnabled();
    };
    const stop = async () => {
        await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeEnabled();
    };

    // Default: ghost dots on the last beat (a bar is a second at 240), never the finger detail.
    await play();
    const where = await previewSeen(page, 3_000);
    expect(where.ghosts).toBeGreaterThan(0);
    expect(where.arrows).toBe(0);
    expect(where.targets).toBe(0);
    await stop();

    // "Say the fingers" turns on the arrows and numbered targets with the text.
    await view.getByRole('checkbox', { name: 'Say the fingers' }).check();
    await play();
    const how = await previewSeen(page, 3_000);
    expect(how.ghosts).toBeGreaterThan(0);
    expect(how.targets).toBeGreaterThan(0);
    await stop();
    expect(errors).toEqual([]);
});

/**
 * Which changes the board drew a strong preview for over `ms` of playback, and which chords it
 * showed with no preview at all: `Dm7>G7` is a frame with Dm7 sounding and ghost dots up while
 * the strip names G7 next. Read per frame from one commit of the page, so the chord and its
 * preview are never from two different paints.
 */
function previewedChanges(page: Page, ms: number) {
    return page.evaluate(
        (ms) =>
            new Promise<{ previewed: string[]; plain: string[] }>((resolve) => {
                const previewed = new Set<string>();
                const plain = new Set<string>();
                const end = performance.now() + ms;
                const read = (testId: string) =>
                    document
                        .querySelector(`.neck-view [data-testid="${testId}"]`)
                        ?.textContent?.replace('→', '')
                        .trim() ?? '';
                const frame = () => {
                    const current = read('neck-current');
                    if (document.querySelector('.neck-view .neck-ghost-dot')) {
                        previewed.add(`${current}>${read('neck-next')}`);
                    } else {
                        plain.add(current);
                    }
                    if (performance.now() < end) {
                        requestAnimationFrame(frame);
                    } else {
                        resolve({ previewed: [...previewed], plain: [...plain] });
                    }
                };
                frame();
            }),
        ms,
    );
}

test('two chords in a bar: each change is previewed on its own last beat (#1590)', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Two to the bar');
    // `| Dm7 G7 | Cmaj7 | Cmaj7 | Cmaj7 |`: the change to G7 lands on beat 3, inside the bar.
    await typeBar(page, 1, 'Dm7 G7');
    // A new song is four bars: the other three are all Cmaj7, one run with no change inside it.
    for (let bar = 2; bar <= 4; bar++) {
        await typeBar(page, bar, 'Cmaj7');
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Cmaj7']);
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view.getByTestId('neck-current')).toHaveText('Dm7');

    // 120, not the 240 the other cases hurry at: the chart's next-bar cue opens a fixed real-time
    // lead before the barline (`BandHost.inLastPulse`), and at 240 that lead reaches back past
    // beat 3 — so a neck still timed to the barline would preview G7 over Dm7 there by accident.
    // At 120 the bar's cue opens after G7 has landed, and only the slot's own last beat can.
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('120');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    // Once G7 is under the playhead the count-in is over; the form is 8s, so 9s is a full lap.
    await expect(view.getByTestId('neck-current')).toHaveText('G7', { timeout: 20_000 });
    const seen = await previewedChanges(page, 9_000);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();

    // The mid-bar change, the barline's, and the loop back to the top.
    expect(seen.previewed).toContain('Dm7>G7');
    expect(seen.previewed).toContain('G7>Cmaj7');
    expect(seen.previewed).toContain('Cmaj7>Dm7');
    // Until that beat each chord is the grip alone — G7 too, which sits wholly inside the bar.
    expect(seen.plain).toEqual(expect.arrayContaining(['Dm7', 'G7', 'Cmaj7']));
    expect(errors).toEqual([]);
});

test('a phone board follows the hand; a laptop shows the whole neck (#1593)', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view.locator('svg.neck')).toBeVisible();
    const scale = () =>
        view.locator('.neck-zoom').evaluate((el) => {
            const m = /scale\(([\d.]+)\)/.exec((el as SVGGElement).style.transform);
            return m ? Number(m[1]) : 1;
        });
    const phone = (page.viewportSize()?.width ?? 1280) <= 760;
    if (!phone) {
        await expect.poll(scale).toBe(1);
        return;
    }
    await expect.poll(scale).toBeGreaterThan(1.4);
    const before = await scale();
    // The board follows a home-window move (every chart starts on frets 1–6, #1840).
    const hand = view.getByRole('slider', { name: 'Hand position' });
    await hand.focus();
    for (let i = 0; i < 4; i++) {
        await hand.press('ArrowRight');
    }
    await expect(hand).toHaveAttribute('aria-valuenow', '5');
    await expect.poll(scale).not.toBe(before);
    // The zoomed board stays inside the screen.
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});

test('the hand sits in first position until the musician moves it (#1598, #1840)', async ({
    page,
}) => {
    await seedStarters(page);
    const view = page.getByRole('region', { name: 'Neck' });
    const hand = view.getByRole('slider', { name: 'Hand position' });
    const open = (title: string) => songLink(page, title).first().click();
    // 'Blue pocket' is in C: first position.
    await open('Blue pocket');
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    await expect(hand).toHaveAttribute('aria-valuetext', 'frets 1 to 6');
    // 'Minor swing sketch' is in A minor, whose E7 is rooted at the 7th fret: first position
    // too, whatever the key (it was frets 2–7 until #1840). Neck mode is remembered, so the
    // song opens on the neck.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await open('Minor swing sketch');
    await expect(hand).toHaveAttribute('aria-valuetext', 'frets 1 to 6');
    // A window the musician moved stays put on the next chart.
    await hand.focus();
    await hand.press('ArrowRight');
    await expect(hand).toHaveAttribute('aria-valuetext', 'frets 2 to 7');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await open('Blue pocket');
    await expect(hand).toHaveAttribute('aria-valuetext', 'frets 2 to 7');
});

test('stopped, the neck steps through the changes and the board strums (#1595, #1596)', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    const current = view.getByTestId('neck-current');
    const position = view.getByTestId('neck-position');
    const headline = view.locator('.neck-headline');
    await expect(current).toHaveText('C7');
    await expect(position).toHaveText(/^1 \/ \d+$/);
    const count = Number((await position.textContent())!.split('/')[1]);
    expect(count).toBeGreaterThan(2);
    await expect(headline).toContainText('Starts on C7');

    // Next: the second grip, previewing the third, in the playing form's words.
    await view.getByRole('button', { name: 'Next chord', exact: true }).click();
    await expect(current).toHaveText('F7');
    await expect(position).toHaveText(`2 / ${count}`);
    await expect(headline).toContainText('Next:');
    await expect(view.locator('.neck-ghost-dot').first()).toBeVisible();
    await expect(view.locator('.neck-rootpath')).toHaveCount(1);
    // Prev twice: back to the top, then wrapped to the form's last change.
    await view.getByRole('button', { name: 'Previous chord', exact: true }).click();
    await expect(current).toHaveText('C7');
    await view.getByRole('button', { name: 'Previous chord', exact: true }).click();
    await expect(position).toHaveText(`${count} / ${count}`);
    // The arrows step too, with the neck focused.
    await view.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(position).toHaveText(`${count - 1} / ${count}`);
    await page.keyboard.press('ArrowRight');
    await expect(position).toHaveText(`${count} / ${count}`);
    await view.getByRole('button', { name: 'Next chord', exact: true }).click();
    await expect(current).toHaveText('C7');
    await page.keyboard.press('ArrowRight');
    await expect(current).toHaveText('F7');

    // The board is a button stopped: a tap (or Enter) strums the grip shown. It is heard, not
    // seen, so this checks the plumbing: focusable, a pointer, and nothing breaks.
    const board = view.locator('.neck-strum');
    await expect(board).toHaveAttribute('role', 'button');
    await expect(board).toHaveAttribute('aria-label', /^Hear F7: /);
    expect(await board.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
    await view.locator('.neck-wood').click();
    await board.focus();
    await page.keyboard.press('Enter');
    await expect(current).toHaveText('F7');

    // Play hands the neck back to the band: no steps, no strum, and it follows.
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(view.getByRole('button', { name: 'Next chord', exact: true })).toHaveCount(0);
    await expect(view.locator('.neck-strum')).toHaveCount(0);
    await expect(headline).toContainText('Next:', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    // Stopped again: back to the top.
    await expect(current).toHaveText('C7');
    await expect(position).toHaveText(`1 / ${count}`);
    await expect(headline).toContainText('Starts on C7');
    expect(errors).toEqual([]);
});

test('a ukulele B5 marks the G and C strings it leaves silent (#1811)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Power on the uke');
    for (const [i, bar] of ['B', 'B5', 'B', 'B'].entries()) {
        await typeBar(page, i + 1, bar);
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await view.getByLabel('Instrument', { exact: true }).selectOption('uke');
    // B 4 3 2 2 sounds all four strings: nothing marked.
    await expect(view.getByTestId('neck-current')).toHaveText('B');
    await expect(view.locator('.neck-dot')).toHaveCount(4);
    await expect(view.locator('.neck-mute')).toHaveCount(0);
    // B5 x x 2 2: a × on the G and C strings, and the board's text names them.
    await view.getByRole('button', { name: 'Next chord', exact: true }).click();
    await expect(view.getByTestId('neck-current')).toHaveText('B5');
    await expect(view.locator('.neck-dot')).toHaveCount(2);
    await expect(view.locator('.neck-mute')).toHaveCount(2);
    expect(
        await view
            .locator('.neck-mute')
            .evaluateAll((marks) => marks.map((m) => m.getAttribute('data-mute'))),
    ).toEqual(['4', '3']);
    await expect(view.locator('.neck-strum')).toHaveAttribute(
        'aria-label',
        /^Hear B5: .*; G and C strings not played$/,
    );
    expect(errors).toEqual([]);
});
