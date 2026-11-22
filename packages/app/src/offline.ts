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

/**
 * How many files are fetched at once. There are about nine hundred, most of them small, and
 * each costs a round trip whatever its size: four at a time took fifty seconds on the test
 * site where a band's own loader, asking for all of its files together, had 267 in two. The
 * connection is one stream each (HTTP/2 and 3), and a band someone is waiting for still goes
 * first: the saver stops asking while one loads (`idle`).
 */
const AT_ONCE = 24;

/** A moment for the page to draw and for a tune to be opened before the connection is used for later. */
const SETTLE_MS = 1500;

/** A newer build has taken over from the one this page is running. */
let newer = false;
const watching = new Set<() => void>();

/** Whether a newer build of the app is on the device, ready the next time the page is loaded. */
export const newVersion = (): boolean => newer;

/** Be told when a newer build of the app has taken over (for `useSyncExternalStore`). */
export function subscribeNewVersion(tell: () => void): () => void {
  watching.add(tell);
  return () => watching.delete(tell);
}

/**
 * Register the service worker, and look for a newer build whenever the app is brought back
 * to the front: a phone can keep it open for days, and the browser looks by itself only when
 * a page is opened. In development there is none: it would serve yesterday's code.
 */
export function keepOffline(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const { serviceWorker } = navigator;
  // A page the worker had in hand when it opened runs that worker's build, and a worker that
  // takes over later brings a newer one. A page with none is a first visit or a hard reload,
  // and came from the server: the first worker to take it over carries the build it runs, and
  // only one after that is newer. The case missed: a hard reload with the worker already
  // current is never taken over by it, so the next release is taken for the page's own.
  let kept = serviceWorker.controller !== null;
  serviceWorker.addEventListener("controllerchange", () => {
    if (!kept) {
      kept = true;
      return;
    }
    if (newer) return;
    newer = true;
    for (const tell of watching) tell();
  });
  serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(
    (registration) => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        registration.update().catch(() => {
          // No connection: the next time it is brought back, or opened, it looks again.
        });
      });
    },
    () => {
      // Not served securely, or storage refused: the app runs, and keeps nothing.
    },
  );
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
