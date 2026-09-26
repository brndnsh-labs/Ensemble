import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, test } from './fixtures';

interface PlaybackEvidence {
    armed: boolean;
    highlights: { start: number; end: number; name: string }[];
    nonzeroAudioSamples: number;
    secondLapAudioSamples: number;
}

declare global {
    interface Window {
        __semanticPlaybackEvidence: PlaybackEvidence;
    }
}

async function observePlayback(page: Page) {
    await page.addInitScript(() => {
        const evidence: PlaybackEvidence = {
            armed: false,
            highlights: [],
            nonzeroAudioSamples: 0,
            secondLapAudioSamples: 0,
        };
        window.__semanticPlaybackEvidence = evidence;

        // Capture the visible active-chord sequence at DOM mutation time rather
        // than polling from Node and potentially missing a quarter-note chord.
        //
        // Read the RECORDS, not the DOM: an observer callback runs once per
        // microtask checkpoint with every mutation since the last one, so when
        // the tab is starved (three CI workers on four cores, #1223) two chord
        // transitions can land in one batch and `querySelector` would only ever
        // see the last of them — the middle chord was highlighted, just never
        // observed. The stand sets `aria-current="true"` and otherwise removes
        // the attribute, so a record whose `oldValue` is not "true" is a chord
        // becoming current, in commit order; a removal record is ignored (using
        // it would put the lap wrap out of order, because the first chord is set
        // before the last one is cleared). A `data-start-step` change on the current chord
        // (a repeat visit re-labelling the same element) still counts as a move.
        const highlight = (chord: Element) => {
            const next = {
                start: Number(chord.getAttribute('data-start-step')),
                end: Number(chord.getAttribute('data-end-step')),
                name: chord.textContent?.trim() ?? '',
            };
            if (evidence.highlights.at(-1)?.start !== next.start) {
                evidence.highlights.push(next);
            }
        };
        new MutationObserver((records) => {
            if (!evidence.armed) {
                return;
            }
            for (const record of records) {
                const target = record.target as Element;
                if (!target.classList?.contains('chord')) {
                    continue;
                }
                if (record.attributeName === 'aria-current' && record.oldValue !== 'true') {
                    highlight(target);
                } else if (
                    record.attributeName === 'data-start-step' &&
                    target.getAttribute('aria-current') === 'true'
                ) {
                    highlight(target);
                }
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['aria-current', 'data-start-step'],
        });

        // Branch an analyser from the existing final output connection. The
        // audible route stays intact; no oscillator/source is fabricated here.
        const probes: { analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> }[] = [];
        const contexts = new WeakSet<BaseAudioContext>();
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (
            this: AudioNode,
            destination: AudioNode | AudioParam,
            ...rest: number[]
        ) {
            const result = Reflect.apply(connect, this, [destination, ...rest]);
            if (destination === this.context.destination && !contexts.has(this.context)) {
                contexts.add(this.context);
                const analyser = this.context.createAnalyser();
                analyser.fftSize = 256;
                Reflect.apply(connect, this, [analyser]);
                probes.push({ analyser, samples: new Float32Array(analyser.fftSize) });
            }
            return result;
        } as AudioNode['connect'];
        window.setInterval(() => {
            if (!evidence.armed) {
                return;
            }
            for (const { analyser, samples } of probes) {
                analyser.getFloatTimeDomainData(samples);
                if (samples.some((sample) => Math.abs(sample) > 0.00001)) {
                    evidence.nonzeroAudioSamples++;
                    if (evidence.highlights.filter((chord) => chord.start === 0).length >= 2) {
                        evidence.secondLapAudioSamples++;
                    }
                }
            }
        }, 20);
    });
}

test('section practice loop (#1211) confines playback and clears on release, Escape and Stop', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await observePlayback(page);
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Section loop study');
    // The new-song default already gives section A four distinct bars
    // (C, G, Am, F) — no bar editing needed there. Add a second section with a
    // chord name ('Dm7') that never appears in A, so the highlight sequence
    // alone proves whether playback ever crossed the section boundary.
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('Dm7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
    await expect(page.locator('.error-banner')).toHaveCount(0);

    const sectionA = page.getByRole('button', {
        name: 'Section A · hold to practice-loop',
        exact: true,
    });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // Long-press (simulated as a held click) arms the loop on section A.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.section-loop.active')).toHaveCount(1);

    await page.evaluate(() => {
        const evidence = window.__semanticPlaybackEvidence;
        evidence.highlights = [];
        evidence.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();

    // Two-plus laps of the looped section (the fourth 'C' visit) must land
    // with zero 'Dm7' visits: the loop fold never lets the form cross into B.
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        window.__semanticPlaybackEvidence.highlights.filter(
                            (chord) => chord.name === 'C',
                        ).length,
                ),
            {
                timeout: 25_000,
                message: 'Section A should loop at least twice while armed',
            },
        )
        .toBeGreaterThanOrEqual(3);
    const confinedHighlights = await page.evaluate(
        () => window.__semanticPlaybackEvidence.highlights,
    );
    expect(confinedHighlights.every((chord) => chord.name !== 'Dm7')).toBe(true);

    // Long-press again releases the loop; the form then resumes into section B.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);
    await expect
        .poll(
            () =>
                page.evaluate(() =>
                    window.__semanticPlaybackEvidence.highlights.some(
                        (chord) => chord.name === 'Dm7',
                    ),
                ),
            {
                timeout: 20_000,
                message: 'Form should resume into section B once the loop is released',
            },
        )
        .toBe(true);

    // Stop clears an armed/live loop (#1211 acceptance): re-arm on A, start again,
    // confirm the fold, then Stop and verify the loop drops immediately.
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => {
        const evidence = window.__semanticPlaybackEvidence;
        evidence.highlights = [];
        evidence.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        window.__semanticPlaybackEvidence.highlights.filter(
                            (chord) => chord.name === 'C',
                        ).length,
                ),
            { timeout: 20_000 },
        )
        .toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // Escape clears an armed (not-yet-playing) loop too.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // The keyboard path to the same toggle: a long-press has no keyboard
    // equivalent, so 'L' on the focused label is the accessible route in,
    // straight to the toggle — bypassing the section menu (#1422) Enter opens
    // (native button semantics; the menu itself is `section-menu.spec.ts`'s).
    await sectionA.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'Section A' })).toBeVisible();
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(sectionA).toBeFocused();
    await page.keyboard.press('l');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.section-loop.active')).toHaveCount(1);
    await page.keyboard.press('l');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');

    await page.evaluate(() => {
        window.__semanticPlaybackEvidence.armed = false;
    });
    expect(pageErrors).toEqual([]);
});
