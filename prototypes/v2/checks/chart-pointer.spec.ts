import { appUrl, editorRevealed, expect, test } from './fixtures';

type Paint = { step: number; at: number };
/** One animation frame: its wall time, and the band's audio clock as that frame read it. */
type Frame = { at: number; audio: number };

/** A sixteenth at 240 bpm, the shortest chord the stand is asked to show. */
const SIXTEENTH_MS = 62.5;
/** Two reads of `currentTime` in one frame can straddle one render quantum (128 frames). */
const QUANTUM_SLACK_MS = 6;

/**
 * #1240 — the chart pointer is painted from the playhead every animation frame, so even a chord
 * one sixteenth long at the fastest tempo (62.5ms at 240 bpm) is lit. When the pointer was a
 * 60ms sample of a 50ms sample, a chord that short could fall between two samples and never show.
 *
 * #1485 — what that promises is per FRAME: a chord goes unpainted only when no frame reads the
 * playhead inside it. On a loaded CI runner the main thread does go without a frame (measured
 * locally under contention: 50-80ms frames on most barlines, one of 484ms), and the sixteenth
 * after the downbeat went unpainted with it, three times in a day. The playhead is the band's
 * audio clock, which a starved runner also advances in jumps. So the page records, every frame,
 * the audio clock that frame saw, and a skipped chord passes only when the clock moved past all
 * of it between two consecutive frames: no frame could have painted it. A painter that falls
 * behind the frames, as the old sampler did, skips chords the frames did see, and still fails.
 */
test('a sixteenth-note chord at 240 bpm is painted', async ({ page }) => {
    // On a CPU-starved WebKit the band's clock runs at a third of real time, and reaching the
    // second lap took over 30s in 8 of 12 runs under heavy local contention (#1485).
    test.setTimeout(90_000);
    // The band's clock, so each frame can record the time the playhead was read at.
    await page.addInitScript(() => {
        const w = window as unknown as { bandClocks: AudioContext[] };
        w.bandClocks = [];
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
            constructor(options?: AudioContextOptions) {
                super(options);
                w.bandClocks.push(this);
            }
        };
    });
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Sixteenths');
    // Sixteen chords share the first 4/4 bar equally: one step each.
    const names = 'C Db D Eb E F Gb G Ab A Bb B C7 D7 E7 F7'.split(' ');
    await page.getByLabel('Chords in this bar').fill(names.join(' '));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord').first()).toHaveText('C');
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');

    await page.evaluate(() => {
        const w = window as unknown as {
            painted: Paint[];
            frames: Frame[];
            bandClocks: AudioContext[];
        };
        w.painted = [];
        w.frames = [];
        // Stamped when the clock is read, not with the frame's own timestamp: a throttled
        // WebKit runs a late frame's callbacks long after the time it hands them.
        const frame = () => {
            const clock = w.bandClocks.at(-1);
            if (clock) {
                w.frames.push({ at: performance.now(), audio: clock.currentTime * 1000 });
            }
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        new MutationObserver(() => {
            const start = document
                .querySelector('.chord[aria-current="true"]')
                ?.getAttribute('data-start-step');
            if (start !== null && start !== undefined && w.painted.at(-1)?.step !== Number(start)) {
                w.painted.push({ step: Number(start), at: performance.now() });
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-current', 'data-start-step'],
        });
    });
    const recorded = () =>
        page.evaluate(() => {
            const w = window as unknown as { painted: Paint[]; frames: Frame[] };
            return { painted: [...w.painted], frames: [...w.frames] };
        });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    // The second lap's first bar: past playback's start-up, which on a loaded WebKit can stall
    // outside any script while audio comes up (`expectVisitsFollowForm`'s `firstLapDrops`). It
    // runs from the paint the form wrapped to (the 0, or the chord after it if the 0 itself went
    // unpainted) to the second bar, and keeps the paint before it so the wrap is checked too.
    const secondLap = (painted: Paint[]) => {
        const lapOneBarTwo = painted.findIndex((p) => p.step === 16);
        const from =
            lapOneBarTwo < 0 ? -1 : painted.findIndex((p, i) => i > lapOneBarTwo && p.step < 16);
        const to = from < 0 ? -1 : painted.findIndex((p, i) => i > from && p.step === 16);
        return to < 0 ? null : painted.slice(from - 1, to + 1);
    };
    await expect
        .poll(async () => secondLap((await recorded()).painted) !== null, { timeout: 60_000 })
        .toBe(true);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();

    const { painted, frames } = await recorded();
    const lap = secondLap(painted)!;
    // In playing order, the bar before the wrap (48) first and the second bar (16) last.
    const order = (step: number) => (step === 48 ? -1 : step);
    const skips: string[] = [];
    for (let i = 1; i < lap.length; i++) {
        const before = lap[i - 1];
        const after = lap[i];
        const skipped = order(after.step) - order(before.step) - 1;
        expect(
            skipped,
            `the pointer went backwards or repeated a chord: ${before.step} then ${after.step}`,
        ).toBeGreaterThanOrEqual(0);
        if (skipped === 0) {
            continue;
        }
        // The furthest the audio clock moved between two consecutive frames around the two
        // paints. The frame that read `before` ran up to a render task ahead of its paint, hence
        // the 100ms of slack.
        let jump = 0;
        let wait = 0;
        for (let k = 1; k < frames.length; k++) {
            if (frames[k].at >= before.at - 100 && frames[k - 1].at <= after.at) {
                jump = Math.max(jump, frames[k].audio - frames[k - 1].audio);
                wait = Math.max(wait, frames[k].at - frames[k - 1].at);
            }
        }
        if (jump <= skipped * SIXTEENTH_MS - QUANTUM_SLACK_MS) {
            skips.push(
                `${skipped} chord(s) between ${before.step} and ${after.step}, though the audio ` +
                    `clock moved at most ${jump.toFixed(0)}ms between two frames there ` +
                    `(longest frame ${wait.toFixed(0)}ms)`,
            );
        }
    }
    expect(
        skips,
        `a chord went unpainted while frames ran: ${lap.map((p) => p.step).join(' -> ')}`,
    ).toEqual([]);
});
