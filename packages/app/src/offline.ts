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
    ...Object.keys(SOLO_INSTRUMENTS),
  ]),
].sort();

export interface Saving {
  readonly done: number;
  readonly total: number;
}

/** How many files are fetched at once. */
const AT_ONCE = 4;

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
): Promise<boolean> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return false;
  await navigator.serviceWorker.ready;
  // The worker answers this page's requests from its first visit, a moment after it is ready.
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
    );
  }
  const urls: string[] = [];
  for (const id of PACK_IDS) {
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
  report({ done, total: urls.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < missing.length) {
        const url = missing[next++]!;
        // The worker keeps it as it goes by; the page has no use for the bytes yet.
        await (await fetch(url)).arrayBuffer();
        report({ done: ++done, total: urls.length });
      }
    }),
  );
  return true;
}
