// The app's icon, drawn once and written in every size it is needed in.
//
//   node scripts/icons.ts
//
// The icon Brandon chose (the icon studies, `prompts/icon-study-2.md`, B1): four
// tiles of style ink edge to edge are the four bars of a chart's first line.
// The first carries E7 as the chart sets a chord; the other three carry the
// chart's mark for "the same bar again". Written into `packages/app/public/`:
//
//   icon.svg                the icon, for the manifest and anything that takes a vector
//   favicon.svg             a tab's 16 pixels: the four tiles and E7 alone, larger
//   icon-180.png            an iPhone's home screen (the phone rounds the corners)
//   icon-192.png, icon-512.png
//   icon-maskable-512.png   Android: everything that matters inside the middle 80%
//
// The pictures are made by headless Chrome, as every other picture here is.

import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const OUT = new URL("../packages/app/public/", import.meta.url);

const INK = "#1e1a4f";
// The inks of the first four styles on the wall: blues, funk, jazz, rock (`style.css`).
const BARS = ["#5aa9ff", "#ff8b2b", "#1fc2b0", "#ff5f7e"] as const;

/** A heavy slab E, 166 wide and 200 high, and its 7, 92 by 112: drawn, so no font is needed. */
const E =
  "M0 0H160V62H136L130 28H72V86H110L114 68H134V132H114L110 114H72V172H134L142 134H166V200H0V176H24V24H0Z";
const SEVEN = "M0 0H92V20L48 112H18L60 26H22V40H0Z";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** E7 centred in a box, the E `scale` times its drawn size. */
function chord(box: Box, scale: number): string {
  const seven = scale * 0.8;
  const gap = 14 * scale;
  const width = 166 * scale + gap + 92 * seven;
  const x = box.x + (box.w - width) / 2;
  const y = box.y + (box.h - 200 * scale) / 2;
  return [
    `<path transform="translate(${r(x)} ${r(y)}) scale(${r(scale)})" d="${E}"/>`,
    `<path transform="translate(${r(x + 166 * scale + gap)} ${r(y)}) scale(${r(seven)})" d="${SEVEN}"/>`,
  ].join("\n    ");
}

/** The chart's mark for the same bar again, centred in a box: a slash between two dots. */
function again(box: Box, size: number): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const [w, h, t, dot] = [0.42 * size, 0.5 * size, 0.2 * size, 0.13 * size];
  const slash = `M${r(cx - w)} ${r(cy + h)}H${r(cx - w + t)}L${r(cx + w)} ${r(cy - h)}H${r(cx + w - t)}Z`;
  const [dx, dy] = [0.3 * size, 0.27 * size];
  return [
    `<path d="${slash}"/>`,
    `<circle cx="${r(cx - dx)}" cy="${r(cy - dy)}" r="${r(dot)}"/>`,
    `<circle cx="${r(cx + dx)}" cy="${r(cy + dy)}" r="${r(dot)}"/>`,
  ].join("");
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * The icon in a square of 512. `inset` draws it smaller about the middle and
 * lets the tiles run on to the edges: what is cut from a maskable icon is only
 * more of the same ink.
 */
function icon(inset = 1): string {
  const at = (n: number) => 256 + (n - 256) * inset;
  const edge = (n: number) => (n <= 0 ? 0 : n >= 512 ? 512 : at(n));
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    const tile = { x: edge(x0), y: edge(y0), w: edge(x1) - edge(x0), h: edge(y1) - edge(y0) };
    const inner = { x: at(x0), y: at(y0), w: at(x1) - at(x0), h: at(y1) - at(y0) };
    return { tile, inner };
  };
  // The first bar is the big one; the seam under it is off the middle, as the wall's are.
  const bars = [
    box(0, 0, 340, 340),
    box(340, 0, 512, 340),
    box(0, 340, 226, 512),
    box(226, 340, 512, 512),
  ];
  const tiles = bars
    .map(
      ({ tile }, i) =>
        `<rect x="${r(tile.x)}" y="${r(tile.y)}" width="${r(tile.w)}" height="${r(tile.h)}" fill="${BARS[i]}"/>`,
    )
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Ensemble</title>
  ${tiles}
  <g fill="${INK}">
    ${chord(bars[0]!.inner, 0.98 * inset)}
    ${again(bars[1]!.inner, 104 * inset)}
    ${again(bars[2]!.inner, 104 * inset)}
    ${again(bars[3]!.inner, 104 * inset)}
  </g>
</svg>
`;
}

/** A tab's icon: at 16 pixels the marks are dust, so the four tiles and the chord alone, as large as it goes. */
function favicon(): string {
  const tiles = [
    [0, 0, 384, 384],
    [384, 0, 128, 384],
    [0, 384, 224, 128],
    [224, 384, 288, 128],
  ]
    .map(
      ([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${BARS[i]}"/>`,
    )
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Ensemble</title>
  ${tiles}
  <g fill="${INK}">
    <path transform="translate(32 32) scale(1.6)" d="${E}"/>
    <path transform="translate(320 32) scale(1.4)" d="${SEVEN}"/>
  </g>
</svg>
`;
}

const full = icon();
const maskable = icon(0.74);
await writeFile(new URL("icon.svg", OUT), full);
await writeFile(new URL("favicon.svg", OUT), favicon());

const browser = await chromium.launch({ channel: "chrome" });
const picture = async (svg: string, size: number, name: string) => {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: new URL(name, OUT).pathname });
  await page.close();
};
await picture(full, 180, "icon-180.png");
await picture(full, 192, "icon-192.png");
await picture(full, 512, "icon-512.png");
await picture(maskable, 512, "icon-maskable-512.png");
await browser.close();
console.log("icons written to packages/app/public/");
