# Foundation review receipt

Scope: #1170, isolated preview. No production adoption or musical acceptance implied.

Independent source review plus an inline correctness/security pass covered document ownership,
worker synchronization, input validation, asynchronous UI intent, recovery, offline installation
and TEST deployment. No new original-engine fields/messages or generators were added.

Findings fixed before audition:

1. Older competing drafts hidden after newer saves: expose retained drafts explicitly.
2. Async navigation/title races: disable competing intents while an operation is pending.
3. Automatic sound selection could load packs: the initial foundation rejected it without
   alteration; the explicit installation follow-on below now supports and prepares these choices.
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
the manifest and unchanged original test root. The first manual-sound audition source was
`62ef0b3e`; GitHub PR #1173 records the current artifact and human-test status.

Live acceptance exposed an import-test timing race: disabled Save also meant "busy," so the test
could submit an invalid second file before the first import finished. A slow file-read fixture
reproduced the failure; waiting for Song actions to become enabled fixes the test without
changing the application or weakening invalid-input assertions.

## Install-all and focused stand follow-on (#1174)

The user requested one installation action that immediately improves the current band's sounds,
less space above the chart, and minimal playback controls. The reported missing desktop menu was
withdrawn after it loaded; this iteration does not claim to fix a reproduced desktop-picker bug.

An inline correctness pass and independent second-model review covered complete-catalog
installation, manual pins versus Follow feel, saved-document compatibility, offline failures,
playback intent and responsive layout. Three findings were fixed and received a clean closure:

1. Failed feel preparation restored the old setup but stranded an active band stopped. Verify
   the previous required files before resuming it, honor Stop during either preparation path,
   and report when even the old sounds cannot safely resume.
2. The temporary engine pause expanded the focused controls and displaced the chart. Retain
   playback intent in the UI until preparation settles, with an enabled Stop throughout.
3. Reopening the editor after playback reset unapplied chord text. Keep it in the current tab
   when switching views; Apply and Save remain explicit, with no new durable text-recovery claim.

Browser regression coverage now includes bulk quota failure and cached retry, all five automatic
choices, a manually pinned lane across feels, exported/imported Follow feel, offline cold reload
and genre changes, verified rollback/resume, Stop during preparation, and unavailable old sounds.
Responsive checks exercise laptop, portrait/landscape phone and tablet layouts, modal focus,
automatic playback focus and preservation of unapplied editor text. The preparation-focus test
failed against the pre-fix artifact before passing against the repaired build in both engines.

No sample, gain, generator or worker-contract changes were made. Existing genre mappings and
their soloist-phrasing reconciliation are reused. Other saved songs are not rewritten. Read the
README rollback caveat before trying an older manual-only build with new Follow feel documents.
Automated routing and layout evidence still do not replace a real laptop/iPhone audition.

All 26 final preview checks passed across Chromium and WebKit. During the original-app regression
run, the unchanged settings-scroll test once observed an 85px difference. A read-only, 20-run
isolation probe then observed exactly 407px before and after every toggle (0 failures). That does
not establish a cause or a fixed flake; no assertion, timeout, test or original-app code was
changed. PR #1173 retains this diagnostic and the final full-suite result.

Captured UI evidence from the tested preview (not generated mockups):

- [Focused laptop stand](evidence/focused-laptop.png)
- [Focused portrait-phone stand](evidence/focused-phone.png)
- [Install-all Sounds dialog](evidence/sounds-dialog.png)

## Editing usability follow-on (#1175)

An inline correctness pass and independent second-model source review covered per-section raw
buffers, full-token checking for changed text, atomic Save/copy/export, failed writes/conflicts,
navigation/transformations, tempo event ordering and the last-opened preference. The independent
source pass found no actionable defect. Main-thread browser inspection found a small section
selector tap target (F1); the patch gives it a 44px minimum and a responsive regression assertion.
Independent finding closure confirmed F1 fixed with no nearby regression. The full 48-case
preview suite passed; after the final selector-only patch, all 24 usability/responsive checks
passed again across Chromium and WebKit. The original-app gates are recorded in PR #1173.

The strict editor boundary reuses existing chord-quality recognition without imposing new rules
on untouched saved text. Unknown roots and partially understood spellings no longer silently
become substitute chords when saving new text. Invalid text stays tab-only, with explicit status
and an unload guard; validated work enters existing recovery before a potentially failing Save.
No saved schema, old browser data, generator, worker contract or sound behavior was changed.

The tempo regression failed against the previous built preview: sequentially typing 90 produced
240. An initial new upper-bound assertion also exposed an old UI/engine mismatch: the input
advertised 300, but both the engine and canonical codec already enforce 240. The preview now
matches that established 40–240 contract; no musical range was expanded.

Browser checks cover raw-only Save, multiple edited sections, copy/export isolation, unsupported
tokens and document bounds, failed Save recovery, competing-tab conflicts, transposition,
navigation, tempo Enter/blur/Escape/steppers, preference failure, and editor visibility across
laptop, phone portrait/landscape and tablet. Real-device keyboard/touch and musical audition
remain human checks; this PR stays a test-only draft, not a production cutover.

Captured from the final tested interface:

- [Laptop editor](evidence/editor-laptop.png)
- [Portrait-phone editor, WebKit](evidence/editor-phone.png)
