// Look at the app: open it in headless Chrome at a size, do a few things, and
// save a picture. For checking one's own work, not a test.
//
//   node scripts/look.ts <out.png> <width>x<height> <address> [dark] [step...]
//
// A step is `click:<text>`, `wait:<ms>`, `select:<label>=<value>`, or
// `eval:<javascript>` (its result is printed).

import { chromium } from "@playwright/test";

const [out, size, address, ...rest] = process.argv.slice(2);
if (!out || !size || !address) {
  console.error(
    "usage: node scripts/look.ts <out.png> <width>x<height> <address> [dark] [step...]",
  );
  process.exit(1);
}
const [width, height] = size.split("x").map(Number) as [number, number];
const dark = rest[0] === "dark";
const steps = dark ? rest.slice(1) : rest;

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--password-store=basic", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 2,
  colorScheme: dark ? "dark" : "light",
});
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning")
    console.log(`[${message.type()}]`, message.text());
});
page.on("pageerror", (error) => console.log("[page error]", error.message));
page.on("response", (response) => {
  if (response.status() >= 400) console.log(`[${response.status()}]`, response.url());
});
await page.goto(address);
await page.waitForLoadState("networkidle");
for (const step of steps) {
  const [kind, ...parts] = step.split(":");
  const value = parts.join(":");
  if (kind === "click") await page.getByText(value, { exact: true }).first().click();
  else if (kind === "wait") await page.waitForTimeout(Number(value));
  else if (kind === "select") {
    const [label, option] = value.split("=") as [string, string];
    await page.getByLabel(label).selectOption(option);
  } else if (kind === "eval") console.log(await page.evaluate(value));
  else throw new Error(`unknown step ${step}`);
}
await page.screenshot({ path: out });
await browser.close();
