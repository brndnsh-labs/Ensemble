# Ensemble v2 foundation preview

Isolated Next.js/React shell using Ensemble's existing browser engine and canonical chart codec.
This is a working checkpoint, not a production replacement. See [the product brief](../../docs/design/ensemble-v2.md).
Tracker: milestone 15; #1170 (preview), #1171 (chart/import design), #1172 (account/sync/hosting design).

## Run and verify

From the repository root, install the existing engine dependencies with `npm ci`, then:

```sh
npm ci --prefix prototypes/v2
npm run build --prefix prototypes/v2
npm run test:e2e --prefix prototypes/v2
```

For development, `npm run dev --prefix prototypes/v2`, then visit `http://localhost:3100/v2/`.
Offline installation only works against the built export, not the development server. The
Playwright configuration starts that static server automatically. Tests inspect actual browser
audio output; they are not a by-ear judgment. Original project gates still apply.
Install browser binaries with `npx playwright install chromium webkit` from this directory.
Chromium uses offline emulation. A minimal independent reproduction showed this Playwright
WebKit build fails even a one-page cached navigation when emulated offline, but succeeds with
its server disconnected. WebKit checks therefore make the local test server refuse real
network sockets, assert an uncached request fails, then require cache-only reload and playback.
The test-server control endpoint exists only in the local harness, never in exported/deployed files.
For remote verification use `V2_LIVE_TEST=1 npm run test:e2e -- --project=laptop` here; WebKit's
network-disconnection harness is local-only. The dedicated V2 preview workflow repeats both
local browser projects and never deploys.

## Deliberate boundaries

- Real existing worker/generators/synths; no iframe, rewritten music engine or simulated transport.
- Browser-page singleton runtime, explicit authored-content projection, stop/load/rebuild/full
  worker sync/flush lifecycle. Buffer ingestion temporarily mirrors the original bootstrap;
  extract one shared runtime before production adoption rather than maintaining two indefinitely.
- The preview bundles original TypeScript through `@engine`. A narrow type-only compatibility
  declaration preserves the non-proxied `lastActiveDrumElements` DOM field when React ambient
  types are loaded. Other deepsignal declarations and readonly state fields are unchanged.
  The unmodified engine's own typecheck also runs before every preview build.
- Persistence calls are compile-time redirected to a no-op. Neither `ensemble_currentState`
  nor `ensemble_userPresets` is migrated or overwritten. Playwright pins a legacy sentinel.
- IndexedDB `ensemble-v2-preview` holds explicit saves with atomic revision comparison. Local
  recovery keys are writer-scoped; older competing drafts remain accessible in Song actions.
  Quota errors retain the current draft in memory and warn before leaving the page where the
  browser supports that prompt. Browser eviction/clearing can still remove local data: export
  valuable charts. This preview does not promise durable cloud backup.
- Only built-in synth sounds; imports requiring packs or automatic pack selection are refused
  without changing their source. `.ensemble`/JSON file export/import works; iReal import does not.
- Accounts, cloud/outbox, sharing, admin, pack downloads, richer chart semantics, chord discovery,
  full settings inventory, section-practice controls and visualizer are later work. Genre
  changes briefly stop/restart playback in this checkpoint. Unapplied editor text is not part
  of draft recovery: Apply first. Do not use this as the only copy of important writing yet.
- Four bars per laptop/tablet row, two per portrait phone row, scrolling rather than pagination.
  Playback highlights use the existing scheduler's lookahead (not a new musical clock); manual
  wheel/touch/keyboard browsing suspends following until explicitly resumed.

## Test deployment only

After a successful build and checks, run `node scripts/deploy-test.mjs` from this directory.
The script has no production target. It uploads an immutable release under
`/var/www/html/.v2-previews/<artifact SHA256>-<unique deploy ID>/` and atomically switches the test-only `/v2`
symlink. It verifies every exported asset, the service worker and manifest through HTTPS and
checks that the existing test root did not change. `build.json` fingerprints output bytes and the offline recipe, not
just HEAD: a dirty audition build cannot masquerade as a clean commit.

Rollback means repointing `/var/www/html/v2` to the previous verified release using the same
temporary-symlink/rename operation. No database migration occurs. Keep old releases through
audition; this script never deletes them. The regular root `scripts/deploy.sh test` uses rsync
deletion and can remove this separate preview: rebuild/redeploy it afterward. No nginx, Docker,
production deployment or production data changes are needed for this checkpoint.

Observed test-host limitation: the edge currently assigns `/v2/sw.js` a four-hour cache lifetime.
The least-privilege deploy account cannot edit nginx. The first audition artifact was verified at
the canonical URL, and the deploy verifier now refuses success if that URL serves an older
worker even when a cache-busted probe matches. Before a later update, an authorized operator
should add a scoped no-cache policy (and purge the existing entry) or purge the worker URL as
part of deployment. Track this hosting prerequisite with #1172; do not escalate deployment
credentials or change production to work around it.
