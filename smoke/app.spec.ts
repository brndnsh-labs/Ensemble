// What only a real browser can prove about the app. The list is fixed in
// docs/TESTING.md.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("the app loads and shows the library", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Ensemble" })).toBeVisible();
  // Somewhere to start, a tap from playing, before anything has been played.
  await expect(page.getByRole("link", { name: "12-Bar Blues" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play / })).not.toHaveCount(0);
  // The wall: each style is a way into the one library. A chart of any style is a few letters
  // away, and what the search finds is the library showing it, with the way home at its top.
  await expect(page.getByRole("link", { name: /^Jazz/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a chart" }).fill("rhythm");
  await expect(page.getByRole("link", { name: "Rhythm Changes" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Where you are" }).getByRole("link", { name: "Home" }),
  ).toBeVisible();
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
  await page.getByRole("link", { name: "12-Bar Blues" }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.locator(".bar")).toHaveCount(12);
});

test("a chart typed in the editor renders, and an error shows a diagnostic in place", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New chart" }).click();
  // The editor opens on the chart itself. A bar pressed and typed is drawn, and is the text:
  // a bar line in what is typed spreads it over the bar after.
  await page.getByRole("button", { name: /^Bar 1 of A/ }).click();
  await page.keyboard.type("F7 | Bb7");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Bar 2 of A: Bb7" })).toBeVisible();
  // The text is the other way in, a press away, and it has what was typed on the chart.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const text = page.getByRole("textbox", { name: "The chart's text" });
  await expect(text).toHaveValue(/\| F7 \| Bb7 \| NC \| NC \|/);
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
  // What is rarely wanted, the files among it, is behind More, in a sheet over the screen.
  const exported = async (button: string, path: string) => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("dialog").getByRole("button", { name: button }).click(),
    ]);
    await download.saveAs(path);
    return download.suggestedFilename();
  };
  const take = info.outputPath("take.json");
  const app = info.outputPath("app.mid");
  const again = info.outputPath("again.mid");
  const cli = info.outputPath("cli.mid");

  // The take is to be had as a file where it is played, while it plays, without keeping it first.
  await page.goto("./#/chart/jazz-rhythm-changes-bb");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  expect(await exported("Export MIDI", app)).toBe("Rhythm Changes.mid");

  // The CLI plays a take from its recipe, which a kept take's own screen exports. Leaving the
  // screen by its row of places stops the band; the chart is then the poster at the top of home,
  // and its kept take is on its screen.
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByRole("button", { name: "Kept" })).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Where you are" })
    .getByRole("link", { name: "Home" })
    .click();
  await page.getByRole("link", { name: "Rhythm Changes" }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /^Kept take/ })
    .click();
  expect(await exported("Export take", take)).toBe("Rhythm Changes.take.json");
  expect(await exported("Export MIDI", again)).toBe("Rhythm Changes.mid");

  const root = resolve(import.meta.dirname, "..");
  execFileSync("node", ["packages/cli/src/main.ts", "replay", take, "--out", cli], { cwd: root });
  const ours = readFileSync(app);
  expect(ours.length).toBeGreaterThan(100);
  expect(ours.equals(readFileSync(cli))).toBe(true);
  // The kept take's screen hands over the same file.
  expect(readFileSync(again).equals(readFileSync(cli))).toBe(true);
});

test("the app counts its use on production only, and only what it says it counts", async ({
  browser,
  baseURL,
}) => {
  const UMAMI = "https://umami.brndn.zip/api/send";
  const base = baseURL!;
  const own = new URL(base).origin;

  /** A fresh visit, told before it loads what it is to take itself for. Nothing it asks of another origin leaves the machine. */
  const visit = async (as: { production?: boolean; doNotTrack?: boolean; play?: boolean }) => {
    // No service worker: the instruments it would save are not wanted here, nor the count of their saving.
    const context = await browser.newContext({ baseURL: base, serviceWorkers: "block" });
    const sent: unknown[] = [];
    const wrong: string[] = [];
    // Caught before anything is done: the endpoint answered here, anywhere else refused.
    await context.route(
      (url) => url.origin !== own,
      async (route) => {
        const request = route.request();
        if (request.url() !== UMAMI) {
          wrong.push(request.url());
          return route.abort();
        }
        const cors = {
          "access-control-allow-origin": own,
          "access-control-allow-headers": "content-type",
        };
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        sent.push(request.postDataJSON());
        // Nothing beside the payload says who or where from: no cookie, no referrer.
        const headers = await request.allHeaders();
        if (headers.cookie !== undefined || headers.referer !== undefined) wrong.push(UMAMI);
        return route.fulfill({ status: 200, headers: cors, json: {} });
      },
    );
    await context.addInitScript((as) => {
      // The app's own hook (`counts.ts`), which only a script run before it loads can set.
      if (as.production)
        (window as unknown as { ensembleCountsAsProduction: boolean }).ensembleCountsAsProduction =
          true;
      if (as.doNotTrack)
        Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" });
      // Every request for another origin and what it carries, in the order the page makes them:
      // there is no waiting to see that none was, and two sent together cannot pass each other.
      const asked: { url: string; body: unknown }[] = [];
      (window as unknown as { asked: typeof asked }).asked = asked;
      const fetched = window.fetch;
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin !== location.origin)
          asked.push({
            url: url.href,
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
          });
        return fetched(input, init);
      };
    }, as);
    const page = await context.newPage();

    // A chart opened, played, stopped and given another style.
    await page.goto("./");
    await page.getByRole("link", { name: "12-Bar Blues" }).click();
    if (as.play !== false) {
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(page.locator(".bar").nth(0)).toHaveAttribute("aria-current", "true");
      await page.getByRole("button", { name: "Stop", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Style:/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Rock", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Style:/ })).toHaveText(/Rock/);

    const asked = () =>
      page.evaluate(() => (window as unknown as { asked: { url: string; body: unknown }[] }).asked);
    return { context, sent, wrong, asked };
  };

  // As served, which is not production: nothing goes to another origin.
  const served = await visit({});
  expect(await served.asked()).toEqual([]);
  expect(served.sent).toEqual([]);
  expect(served.wrong).toEqual([]);
  await served.context.close();

  // Taken for production: each of those is counted, with its fields and nothing more.
  const production = await visit({ production: true });
  const events = [
    { name: "session_class", data: { device: "desktop", installed: false } },
    { name: "chart_opened", data: { from: "library", chart: "blues-12-bar-a" } },
    {
      name: "play_started",
      data: { style: "blues", meter: "4/4", mode: "jam", soloist: "none", chart: "blues-12-bar-a" },
    },
    { name: "play_ended", data: { how: "stopped", length: "0-1" } },
    { name: "style_changed", data: { style: "rock" } },
  ];
  const paths = ["/", "/chart", "/chart", "/chart", "/chart"];
  const payloads = events.map((event, i) => ({
    type: "event",
    payload: {
      website: "3b7ffbc5-a7bd-4dcd-9587-8eef4053c0ad",
      hostname: new URL(own).hostname,
      url: paths[i],
      title: "Ensemble",
      referrer: "",
      language: expect.any(String),
      screen: expect.stringMatching(/^\d+x\d+$/),
      ...event,
    },
  }));
  // In the order the page sent them, each to the endpoint and nowhere else; and each caught there.
  expect(await production.asked()).toEqual(payloads.map((body) => ({ url: UMAMI, body })));
  await expect.poll(() => production.sent.length).toBe(events.length);
  expect(production.sent).toEqual(expect.arrayContaining(payloads));
  expect(production.wrong).toEqual([]);
  await production.context.close();

  // Taken for production, with do-not-track set: nothing at all. No play, to keep it short: the
  // visit, the chart opened and the style changed would each have been counted.
  const declined = await visit({ production: true, doNotTrack: true, play: false });
  expect(await declined.asked()).toEqual([]);
  expect(declined.sent).toEqual([]);
  expect(declined.wrong).toEqual([]);
  await declined.context.close();
});
