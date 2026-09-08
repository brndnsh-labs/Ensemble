# Foundation review receipt

Scope: #1170, isolated preview. No production adoption or musical acceptance implied.

Independent source review plus an inline correctness/security pass covered document ownership,
worker synchronization, input validation, asynchronous UI intent, recovery, offline installation
and TEST deployment. No new original-engine fields/messages or generators were added.

Findings fixed before audition:

1. Older competing drafts hidden after newer saves: expose retained drafts explicitly.
2. Async navigation/title races: disable competing intents while an operation is pending.
3. Automatic sound selection could load packs: reject that unsupported input without alteration.
4. Reverb hydration left existing buses stale: use the engine's canonical per-lane send sync.
5. Failed recovery could lose a draft on navigation: keep a per-song in-memory fallback, mark
   it tab-only, retain a persistent warning and request the browser's unload prompt.
6. Opening an older recovery could overwrite the current recovery: open an independent copy.
7. Worker-only updates shared cache/release identity: include the offline recipe in cache
   fingerprints and stage each deployment in a unique directory before switching.
8. Existing root service worker could falsely satisfy readiness: await the preview registration.

The independent closure pass found no remaining source-review blocker. Automated browser checks
cover actual nonzero audio, offline reload, explicit save/revert, draft recovery, competing tabs,
quota failures, detached import/export, 13 feel selections, transposition/mutes, long charts and
responsive legibility. Chromium and WebKit use the same application artifact; the WebKit offline
harness refuses real server sockets because offline emulation fails a minimal independent cached
HTML reproduction (documented in README). This is not a skipped offline assertion.

Human test still required: audible continuity/quality, laptop usability, real iPhone touch,
legibility and offline startup. Remaining product limitations are in README. A heavyweight human
code review is worthwhile before turning this prototype bridge into the production runtime.

## Manual sounds follow-on (#1174)

An inline pass and an independent second-model review covered the injected asset-fetch boundary,
compatible manual voice validation, asynchronous selection/play preparation, content-addressed
cache integrity, v1 isolation, and on-demand packaging. The independent review found stale
built-in-only documentation (F1); it was corrected and independently confirmed closed. No further
source-review blocker was found. No generator, sample, gain, or audio-graph tuning changed.

Browser checks instrument decoded nonzero sample buffers at actual source playback, exercise all
catalog downloads and all five sampled lanes, Save/Revert/export/import, offline cold reload,
partial eviction, corrupt responses, storage quota failure, and successful retry. These are
functional checks, not a human judgment of timbre or real-device audio continuity.

The test-host cache prerequisite was resolved on 2026-09-08 with a test-preview-only Caddy rule
and a user-performed Cloudflare purge. Deployment verified all 258 assets, the canonical worker,
the manifest and unchanged original test root. The audition source is `62ef0b3e`; GitHub PR #1173
records its artifact fingerprint and the current human-test status.

Live acceptance exposed an import-test timing race: disabled Save also meant "busy," so the test
could submit an invalid second file before the first import finished. A slow file-read fixture
reproduced the failure; waiting for Song actions to become enabled fixes the test without
changing the application or weakening invalid-input assertions.
