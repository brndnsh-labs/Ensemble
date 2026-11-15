// What only a real browser can prove about the app. The list is fixed in
// docs/TESTING.md.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

test("export downloads a MIDI file that matches the CLI's output for the same take", async ({
  page,
}, info) => {
  await page.goto("./#/chart/jazz-rhythm-changes-bb");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByRole("button", { name: "Kept" })).toBeDisabled();
  // Leaving the screen stops the band: the transport's own Stop waits behind Finish, which would change the take.
  await page.getByRole("link", { name: "Back to the charts" }).click();
  await page.getByRole("link", { name: /^Rhythm Changes in Bb.*kept/ }).click();

  const exported = async (button: string, path: string) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: button }).click(),
    ]);
    await download.saveAs(path);
    return download.suggestedFilename();
  };
  const take = info.outputPath("take.json");
  const app = info.outputPath("app.mid");
  const cli = info.outputPath("cli.mid");
  expect(await exported("Export take", take)).toBe("Rhythm Changes in Bb.take.json");
  expect(await exported("Export MIDI", app)).toBe("Rhythm Changes in Bb.mid");

  const root = resolve(import.meta.dirname, "..");
  execFileSync("node", ["packages/cli/src/main.ts", "replay", take, "--out", cli], { cwd: root });
  const ours = readFileSync(app);
  expect(ours.length).toBeGreaterThan(100);
  expect(ours.equals(readFileSync(cli))).toBe(true);
});
