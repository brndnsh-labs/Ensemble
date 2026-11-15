// The app's service worker: it keeps the app and the instruments on the
// device, so Ensemble opens and plays with no network. The build fills in the
// three names below (vite.config.ts) and writes the result out as `sw.js`.

/** The app itself: one cache per build, filled when the worker is installed. */
const SHELL = "shell-__SHELL__";
/** The instrument packs: kept across builds, and filled as they are first fetched. */
const PACKS = "packs-__PACKS__";
const FILES = __FILES__;
/**
 * A kept file answers any request for its address. Some hosts mark responses as varying by
 * a request header, and a script asked for by a page then would not match the one kept at
 * install.
 */
const SAME = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(FILES))
      // A new build takes over at once: nothing in an open page depends on the old cache.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL && name !== PACKS)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== "GET" || url.origin !== scope.origin) return;
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (url.pathname.startsWith(`${scope.pathname}packs/`)) {
    event.respondWith(fromPacks(request));
    return;
  }
  event.respondWith(
    caches.open(SHELL).then(async (cache) => {
      // Every address of the app is its one page.
      const kept = await cache.match(request.mode === "navigate" ? scope.href : request, SAME);
      return kept ?? fetch(request);
    }),
  );
});

/** An instrument's file from the device, or from the network once and kept. */
async function fromPacks(request) {
  const cache = await caches.open(PACKS);
  const kept = await cache.match(request, SAME);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
