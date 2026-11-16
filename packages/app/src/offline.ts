// Playing with no network. The service worker keeps the app, and keeps each
// instrument file the first time it is fetched; this fetches every one of
// them once, so a style never played before still plays on a train.

import { packFiles, readPack } from "@ensemble/audio";
import { SOLO_INSTRUMENTS } from "@ensemble/engine";
import { STYLES } from "@ensemble/styles";

/** Every pack a band can be made of. */
export const PACK_IDS: readonly string[] = [
  ...new Set([
    ...STYLES.flatMap((style) => Object.values(style.sound.packs)),
    // The instruments a seat may be played on in place of the style's own.
    ...STYLES.flatMap((style) =>
      Object.values(style.sound.choices ?? {}).flatMap((offered) =>
        offered.map((choice) => choice.pack),
      ),
    ),
    ...Object.keys(SOLO_INSTRUMENTS),
  ]),
].sort();

/**
 * The order they are brought onto the device in: the instruments most bands share first (the
 * kit is in every one), so whatever tune is opened next has the least left to fetch, and the
 * soloists' own instruments last, since the soloist sits out until asked.
 */
const SAVE_ORDER: readonly string[] = [...PACK_IDS].sort((a, b) => {
  const bands = (id: string) =>
    STYLES.filter((style) => Object.values(style.sound.packs).includes(id)).length;
  return bands(b) - bands(a) || a.localeCompare(b);
});

export interface Saving {
  /** Files on the device. */
  readonly done: number;
  readonly total: number;
  /** Every file has been tried. With `done` short of `total`, some could not be fetched. */
  readonly finished: boolean;
}

/** How long to wait for the service worker to take charge of a page it did not load. */
const TAKE_CHARGE_MS = 5000;

/** How many files are fetched at once. */
const AT_ONCE = 4;

/** A moment for the page to draw and for a tune to be opened before the connection is used for later. */
const SETTLE_MS = 1500;

/** Register the service worker. In development there is none: it would serve yesterday's code. */
export function keepOffline(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

/**
 * Fetch every instrument file that is not already on the device. Resolves
 * with false where there is no service worker to keep them (a development
 * build, or a page not served securely).
 */
export async function saveInstruments(
  packsUrl: string,
  report: (saving: Saving) => void,
  /** Resolves when nobody is waiting for a band: each file fetched for later waits on it first. */
  idle: () => Promise<void> = () => Promise.resolve(),
): Promise<boolean> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return false;
  await navigator.serviceWorker.ready;
  // The worker answers this page's requests from its first visit, a moment after it is ready.
  // A page reloaded past the worker (a hard reload) is never taken charge of: nothing it
  // fetches would be kept, so it saves nothing and says nothing.
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      setTimeout(resolve, TAKE_CHARGE_MS);
    });
    if (!navigator.serviceWorker.controller) return false;
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const urls: string[] = [];
  for (const id of SAVE_ORDER) {
    await idle();
    const base = new URL(`${packsUrl}${id}/`, location.href).href;
    // The same addresses the band's loader asks for, or what is saved here would never be used.
    const source = await readPack(base);
    for (const file of packFiles(source.pack)) urls.push(source.fileUrl(file));
    // The credits page links to it.
    urls.push(`${base}LICENCE`);
  }
  const kept = await Promise.all(urls.map((url) => caches.match(url, { ignoreVary: true })));
  const missing = urls.filter((_, i) => !kept[i]);
  let done = urls.length - missing.length;
  report({ done, total: urls.length, finished: missing.length === 0 });
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < missing.length) {
        // The band someone is waiting to hear has the connection to itself.
        await idle();
        if (next >= missing.length) break;
        const url = missing[next++]!;
        try {
          // The worker keeps a good answer as it goes by; the page has no use for the bytes yet.
          const response = await fetch(url);
          await response.arrayBuffer();
          if (response.ok) report({ done: ++done, total: urls.length, finished: false });
        } catch {
          // Off the network part-way: what was saved stays, and the next visit fetches the rest.
        }
      }
    }),
  );
  report({ done, total: urls.length, finished: true });
  return true;
}
