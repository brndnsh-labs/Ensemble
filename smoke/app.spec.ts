// What only a real browser can prove about the app. The list is fixed in
// docs/TESTING.md; journeys 3 and 5 arrive with the editor and with export.

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
