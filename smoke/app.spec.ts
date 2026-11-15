// What only a real browser can prove about the app. The list is fixed in
// docs/TESTING.md; journey 5 arrives with export.

import { expect, test } from "@playwright/test";

test("the app loads and shows the library", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Ensemble" })).toBeVisible();
  // A chart from each of the styles that ship.
  for (const title of ["12-Bar Blues in A", "Rhythm Changes in Bb"]) {
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /^Play / })).not.toHaveCount(0);
});

test("after install, the app loads offline", async ({ page, context }) => {
  await page.goto("./");
  // Installed: the service worker has the app's files and answers for this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    }
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ensemble" })).toBeVisible();
  // A chart opens too: the whole app is on the device, not just its front page.
  await page.getByRole("link", { name: "12-Bar Blues in A" }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.locator(".bar")).toHaveCount(12);
});

test("a chart typed in the editor renders, and an error shows a diagnostic in place", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New chart" }).click();
  const text = page.getByRole("textbox", { name: "The chart's text" });
  await text.fill("title: Typed\nkey: F\n\n| F7 | Bb7 | F7 | C7 |\n| Bb7 | Bb7 | F7 | F7 |\n");
  await expect(page.getByRole("heading", { name: "Typed" })).toBeVisible();
  await expect(page.locator(".bar")).toHaveCount(8);
  await expect(page.getByText("Nothing to fix.")).toBeVisible();

  // A chord the parser cannot read: the message says so, and the mark sits under those letters.
  await text.press("ControlOrMeta+End");
  await text.pressSequentially("| F7 | Hq7 |");
  await expect(page.getByText(/Unrecognized chord Hq7/)).toBeVisible();
  const mark = page.locator(".source-copy mark.error");
  await expect(mark).toHaveText("Hq7");
  expect(await mark.textContent()).toBe("Hq7");
  const [marked, box] = await Promise.all([mark.boundingBox(), text.boundingBox()]);
  expect(marked!.y).toBeGreaterThan(box!.y);
  expect(marked!.y + marked!.height).toBeLessThan(box!.y + box!.height);
});

test("pressing play starts audio and advances the playhead", async ({ page }) => {
  // Listen at the output: whatever is connected to the speakers also feeds a meter.
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect as (this: AudioNode, ...to: unknown[]) => AudioNode;
    AudioNode.prototype.connect = function (this: AudioNode, ...to: unknown[]) {
      const heard = window as unknown as { meter?: AnalyserNode };
      if (to[0] instanceof AudioDestinationNode && !heard.meter) {
        heard.meter = to[0].context.createAnalyser();
        connect.call(this, heard.meter);
      }
      return connect.apply(this, to);
    } as typeof AudioNode.prototype.connect;
  });
  // A fast tune: its count-in is over in a second and a half.
  await page.goto("./#/chart/jazz-rhythm-changes-bb");
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const bars = page.locator(".bar");
  await expect(bars.nth(0)).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { meter } = window as unknown as { meter?: AnalyserNode };
        if (!meter) return 0;
        const samples = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(samples);
        return samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
      }),
    )
    .toBeGreaterThan(0.01);
  await expect(bars.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(bars.nth(0)).not.toHaveAttribute("aria-current", "true");
});
