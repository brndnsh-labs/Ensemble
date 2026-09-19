# Ensemble v2 foundation preview

Isolated Next.js/React shell using Ensemble's existing browser engine and canonical chart codec.
This is a working checkpoint, not a production replacement. See [the product brief](../../docs/design/ensemble-v2.md).
Tracker: milestone 15; #1170 (preview), #1171 (chart/import), #1172 (account/sync/hosting), #1174 (sounds/focused stand), #1175 (editing usability), #1177 (account-local outbox).
Fresh Claude/Codex/other-agent sessions start with [the v2 handoff](CLAUDE.md).
Merged to `main` on 2026-09-12 via PR #1173. Since #1207 (2026-09-15) every merge to `main`
also publishes this export to production at `https://ensemble.brndn.zip/v2/`, beside the v1 app
at `/` — see [Deployment](#deployment). Accounts, sync and the account API are still not deployed.

## Account storage foundation (#1177)

`lib/sync/` is the isolated account-local repository and explicit Save outbox. It is not
connected to the preview UI or an authenticated server yet. The existing guest repository,
starter creation, recovery keys and app bootstrap are unchanged; opening the preview does
not create this account database. Passkeys/recovery, real transport, library downloads and
account UI are subsequent slices of [the sync contract](../../docs/design/ensemble-v2-sync.md).

The host supplies an account scope after a future authenticated transition. Saves compare local
revisions and commit the frozen snapshot plus queue entry in one IndexedDB transaction. Each
writer's unsaved recovery is separate. `sendNext` sends only the queue head through an injected
transport; retries reuse exact request bytes, acknowledgements update only sync metadata, and
conflicts preserve both versions and pause that song's queue. Multiple senders may retry the
same frozen head, so the future server MUST enforce owner-bound idempotency and revisions.
An account scope is routing context, not proof of authentication or protection from same-origin
script access to browser storage. `switchAccount(null)` fences access but does not implement
secure sign-out, remote session revocation, or private-cache deletion.

Queues currently bound pending explicit Saves to 64 per song. At the limit, Save fails without
changing the prior document or queue; the host must retain the editor/recovery and offer export.
Completed local receipts retain only a request digest and revision, not another full chart copy.
The foundation deliberately has no conflict-resolution, remote-import or deletion entrypoint.

From the repository root, `npm run test:sync` verifies native IndexedDB behavior in Chromium
and WebKit, including aborted transactions, competing connections, lost responses, owner
switches, corrupted bytes and offline Save ordering. These are storage contract tests, not
an end-to-end cloud-service or physical iPhone acceptance claim.

## Run and verify

From the repository root, install the existing engine dependencies with `npm ci`, then:

```sh
npm ci --prefix prototypes/v2
npm run build --prefix prototypes/v2
npm run test:e2e --prefix prototypes/v2
```

For UI development, `npm run dev --prefix prototypes/v2`, then visit `http://localhost:3100/v2/`.
Sound-pack assets and their integrity index are assembled by the build script: use the built
export (`node scripts/serve.mjs` in this directory) to exercise downloads and offline playback.
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

- Real existing worker/generators/synths/samples; no iframe, rewritten music engine or simulated transport.
- Browser-page singleton runtime, explicit authored-content projection, stop/load/rebuild/full
  worker sync/flush lifecycle. Buffer ingestion temporarily mirrors the original bootstrap;
  extract one shared runtime before production adoption rather than maintaining two indefinitely.
- The preview bundles original TypeScript through `@engine`. A narrow type-only compatibility
  declaration preserves the non-proxied `lastActiveDrumElements` DOM field when React ambient
  types are loaded. Other deepsignal declarations and readonly state fields are unchanged.
  The original app's engine typecheck also runs before every preview build.
- Persistence calls are compile-time redirected to a no-op. Neither `ensemble_currentState`
  nor `ensemble_userPresets` is migrated or overwritten. Playwright pins a legacy sentinel.
  The v1 import (#1274, `lib/import-v1.ts`) is a **copy**, not a migration: it is handed a
  read-only `getItem` view of those keys, reuses v1's own hydration normalizers plus the
  canonical songbook codec, and reports v1 data it cannot read instead of showing an empty
  library. What this device has already imported — or been shown and can do nothing more
  about (unreadable, unconvertible, or a copy edited here) — is remembered per v1 item
  (digest, not a boolean) under v2's own `ensemble-v2-preview:v1-import` key, so the
  automatic offer never re-opens for the same bytes while newly-saved v1 data still is
  offered. A failure the STORE produced (quota, a collision with another tab) is deliberately
  not remembered: it is retried on the next run. The old session lands as ONE document with
  the fixed id `v1-session`: a rerun updates it in place, and refuses to when this device has
  edited that copy, reporting it instead. "Edited" is decided by CONTENT —
  `ensemble-v2-preview:v1-session-import` records the digests of the document the import
  wrote and the one it replaced, written before the save, so a tab that dies mid-write heals
  on either side of the commit while a real edit is still refused — plus any retained draft.
  A saved progression keeps a content-derived `v1-preset-…` id, which is both its provenance
  and a second guard against a duplicate copy. "Not now" is one per-device answer
  (`ensemble-v2-preview:v1-import-declined`) that stops the automatic offer for good; "Bring
  over old Ensemble songs" in Song actions is the way back, shown whenever this origin has v1
  data at all, signed in or not. The import is guest-only: signed in, it still writes this
  device's songbook and says so, and #1268's "Add this device's songs" is how those songs
  reach an account.
- IndexedDB `ensemble-v2-preview` holds explicit saves with atomic revision comparison. Local
  recovery keys are writer-scoped; older competing drafts remain accessible in Song actions.
  Quota errors retain the current draft in memory and warn before leaving the page where the
  browser supports that prompt. Browser eviction/clearing can still remove local data: export
  valuable charts. This preview does not promise durable cloud backup.
- The Sounds dialog offers one explicit install-all action (about 9.1 MB) that applies the
  existing genre sound map to the current draft. Per-lane Follow feel updates on genre changes;
  a manual choice pins that lane. Other saved songs are not rewritten. Save keeps the chosen
  setup, including Follow feel, and Revert restores it. Guest startup remains built-in-only
  until a sound-selection/install gesture. Existing decoding,
  sample playback, calibrated gain and voice effects are reused without musical changes. A host
  asset-fetch adapter maps original pack URLs into `/v2/packs/`, never root-app storage. The
  production host retains its ordinary fetch path.
- The app shell caches a build-specific SHA256 sound-file index; sounds download on selection
  or playback, not during app-shell installation. `ensemble-v2-sounds-v1` stores content-addressed,
  verified bytes independently of app upgrades. Readiness checks every required file (not just
  a manifest marker); selection waits for caching and decoding before changing a voice. Failed
  playback preparation leaves the chart readable and unchanged, with an error instead of silent
  synth substitution. Missing sounds can be downloaded by reconnecting and pressing Play.
  App readiness and the current song's sound readiness are separate indicators. This is not
  whole-library/cloud sync. Bulk installation verifies and decodes the complete catalog before
  applying voices; a failed install keeps the previous setup and reuses completed files on retry.
  `.ensemble`/JSON export/import preserves manual and Follow feel choices. Conservative iReal
  import is available through Import chart; see its explicit boundaries below.
- Account-local storage/outbox and bounded native form execution are implemented foundations;
  authenticated cloud sync, sharing, admin, remaining iReal semantics, chord discovery,
  full settings inventory, section-practice controls and visualizer are later work. A feel
  change during playback verifies (and downloads) its sounds while the band keeps playing, then
  swaps in at the next bar using the engine's own staged-feel path, without expanding the focused
  chart; the footer reports preparation and the pending bar honestly. A failed change stops,
  restores the previous setup and resumes only if that setup's sounds are still verified; Stop
  cancels a pending restart. Do not use this as the only copy of important writing yet.
- Four bars per laptop/tablet row, two per portrait phone row, scrolling rather than pagination.
  The open song replaces the branding header; Sounds opens over the score without displacing it.
  Playback automatically focuses the chart, hiding editing/save chrome while leaving transport,
  tempo, key, feel and mutes visible. Show controls restores the setup actions without stopping.
  Playback highlights use the existing scheduler's lookahead (not a new musical clock); manual
  wheel/touch/keyboard browsing suspends following until explicitly resumed.
- Stage mode (#1208) is the dark music-stand theme: the Stage button in the song header stays
  reachable while the chart is focused. The palette is one set of `light-dark()` tokens picked
  by `color-scheme`; unset follows the system, a tap stores `ensemble-v2-preview:theme` as a
  per-device convenience (never a document field) and is applied before hydration. Band chips
  (#1210) read on/off at a distance — filled green versus dashed/hollow/struck — and toggling
  never reflows the row; the chip's name stays put and `aria-pressed` carries the state.

## Measure-based charts (#1171)

New song uses document v2: sections, stable measure identities and exact chord durations.
Existing songs/starters keep their legacy editor. In Edit chart, **Try the bar editor · keep
original** creates a separate editable copy; it never replaces the old record. Charts whose
legacy meaning/timing cannot be converted exactly stay in the original editor with an explanation.

Select a bar, type chords and optionally choose each chord's length. For example, `C Dm G7`
in 4/4 needs an explicit timing choice: choose lengths 2, 1, 1 or type `C:2 Dm:1 G7:1`.
Key or meter change applies from that bar through the section; it does not transpose chord names.
Global Key transposes the entire score. Add bar appends to the selected section; Add section
starts in the global key/meter. Save includes pending measures even with the editor hidden.

Under **Repeats and endings**, select an existing bar range with two clicks/taps or Tab and
Enter (or use From/Through), then **Repeat these bars** and choose the total plays, default 2.
**Add first and second endings** guides the repeated body and two adjacent ending ranges.
Review the written brackets and whole-chart playback route before Apply. Reopen a group to
edit its range/count or remove only its form markers. Cancel keeps unrelated pending chord
text. Apply adopts the complete validated draft; explicit Save updates the songbook.
The [guided interaction note](../../docs/design/ensemble-v2-guided-form.md) describes the boundaries.

**Advanced · per-bar repeat and ending markers** keeps the low-level fields for nested and
nonstandard forms. Set every affected bar before Update chart or Save; unfinished form stays
in the current tab. Complex sections are preserved by the guide and remain editable here.
The stand shows each written bar once, with repeat signs and ending labels; highlighting
returns to that same bar on later passes. Saved/exported charts never contain unfolded copies.

Repeat regions must stay inside one section for now. Nested repeats, multiple ending passes,
and existing whole-section repeats are supported. An end repeat without a start repeats from
the section's beginning. D.C./D.S. to end, Fine and coda use a global performed route, including
returns across sections. Explicit native `play` replays repeats; `skip` uses their final passes
and endings. Al-Nth-ending destinations and jump commands inside repeated passages remain
blocked. One-/two-bar references resolve earlier written IDs only when effective context matches;
two-bar pairs must have consecutive earlier sources and stay within their sections.
The compiler rejects ambiguous/unpaired forms and bounds nesting to 16 and performed measures
to 16,384; exact event/step limits also apply before live adoption.

Validated score input compiles to exact maps used by the chart, worker and detached rendering.
Unsupported navigation, N.C., holds, alternates, fermatas, off-grid lengths and unimplemented chord
voicings stop with an explanation, not partial playback. Full iReal compatibility remains staged.
Both versions use the existing explicit-save/recovery/export boundaries and work offline.

## iReal import checkpoint (#1171)

Choose **Import chart**, open an HTML export or paste an `irealb://`/`irealbook://` chart link,
review its written bars and explanations, then **Add to songbook**. Nothing is saved or installed
in playback until that explicit action; Cancel leaves the current chart and pending edits alone.
Multiple supported entries can be selected individually. Existing Ensemble file import remains.

Stored key is used without applying unverified export transposition. The starting tempo and
current band setup are shown explicitly; style, player chorus count and raw tempo are not guessed.
The exact input is kept as inert `importSource` text in the new document, survives save/copy/
transpose/export, and can be downloaded as a plain-text file even when an import is blocked.
No HTML is executed, remote assets fetched, or charts uploaded by the importer.

The sanitized user-provided Blues export, documented chord spellings, whole-bar timing,
conservative exact 4/4 cell patterns, repeated bars, paired endings and unambiguous Fine/coda
imports are covered in stages. Unsupported compression variants, uncertain timing, jumps combined
with iReal repeats and other unmapped playback commands block import rather than losing music.
Minor Swing still contains unsupported annotations and is not a full-compatibility claim.
Source <=1 MiB, <=64 songs and <=4,096 aggregate written measures; document and playback limits
also apply. Large source plus decoded music may exceed the document limit and fail safely.

The stand keeps written repeat signs and navigation labels. Bars bypassed by navigation remain
visible using detached display-only maps; they never enter the performed maps or audition indices.
The quick editor preserves measure references and navigation it cannot edit. Guided common-case
repeat/ending authoring is available; physical-device usability acceptance remains outstanding.

Older preview clients may reject documents with the new optional source field. Do not downgrade
after importing; export important writing and prefer corrective preview updates. No production
migration or old/new-client coexistence guarantee is introduced by this checkpoint.

Do not downgrade this browser's mixed-version songbook to an older preview: those clients reject
v2 documents and may fail to list the library. Original v1 data is retained, but old-client
coexistence/production migration has not shipped. Prefer a corrective release and export first.

## Legacy editing and returning to practice (#1175)

- Save, Save a copy and export include all currently typed section text. Update chart is an
  optional playable preview, not a prerequisite for saving. Raw buffers survive section/view
  changes and enable Save. Playback, key/feel changes, adding a section and returning to the
  songbook validate/apply the buffers first; unsupported text keeps the editor open for correction.
  Revert to saved explicitly discards both the setup experiment and pending text.
- Only changed text receives strict full-token checking; existing untouched chart text keeps its
  compatibility. The supported spelling follows the existing parser's absolute, Roman and
  Nashville roots, recognized qualities, slash bass and 6/9 handling. Use ASCII #/b accidentals.
  Empty bars, partial spellings and unimplemented directives such as N.C. or repeats are rejected
  with a section-specific explanation. This is not richer chart semantics or iReal support.
- Unchecked text is explicitly tab-only and requests an unload warning. Validated changes enter
  the existing recovery path before attempting Save, so a conflict or failed write retains the
  work. Browser unload warnings are not reliable on all mobile lifecycle paths; explicitly Save
  or export before leaving important writing.
- Edit chart/Edit section reveal the intended input on compact screens; Chart is a view switch,
  not the playback button. Tempo keeps intermediate keystrokes local until Enter/blur; Escape
  cancels, and steppers commit once. Its 40–240 bounds match the existing engine and codec.
- Continue uses a best-effort device-local last-opened preference, including recovered setup
  metadata. Opening a song does not alter saved revisions/timestamps. First visits offer a
  starter honestly rather than implying previous practice; preference failure never gates play.

## Deployment

`node scripts/deploy.mjs <test|prod>` (from this directory, after a successful build) publishes
`out/` as an immutable release beside the root app and atomically switches the `v2` symlink:
`/srv/ensemble-test/www/.v2-previews/<artifact SHA256>-<unique deploy ID>/` on test,
`/srv/ensemble-prod/www/.v2-releases/<…>/` on production. The shared nginx config serves
`/v2/` from that symlink in both environments. The script verifies every exported asset, the
service worker and manifest through HTTPS and checks that the existing root app's HTML did not
change. `build.json` fingerprints output bytes and the offline recipe, not just HEAD: a dirty
audition build cannot masquerade as a clean commit, and the prod target additionally refuses
any build whose `sourceRevision` is not a clean checked-out HEAD.

- **Test** is a workstation audition: `node scripts/deploy.mjs test` over `docker04-admin`.
- **Production** is CI only: the `deploy` job in `.github/workflows/ci.yml` runs
  `deploy.mjs prod` after the root release on every merge to `main`, over the scoped
  `ensemble-deploy` account. The required `v2-checks` context (build + this suite) gates the
  merge. There is no manual prod path from a laptop.

Rollback means repointing the `v2` symlink to the previous verified release using the same
temporary-symlink/rename operation. No database migration occurs. Old releases are retained;
this script never deletes them. The root publisher never touches these paths, and this script
never touches `current` or `.releases/`. Deploying this app moves no user data: v1 and v2
storage stay separate.

Compatibility caveat: manual-only preview builds before Follow feel support reject documents
with `autoSound: true`. Do not roll a browser's songbook back to those builds after saving Follow
feel setups; export first and prefer a corrective preview release. Existing manual saves and the
canonical document schema are unchanged.

The Caddy rule sets `Cache-Control: no-store` for `/v2/*` on both hostnames (homelab-maintenance
commit `5ca32d7` for test; the prod block mirrors it since #1207). The old Cloudflare worker entry was purged on 2026-09-08;
the canonical worker now returns `BYPASS`. Explicit app/sound Cache Storage remains functional.
The deploy verifier still refuses success if the canonical URL serves an older worker even when
a cache-busted probe matches. If caching regresses, investigate the scoped edge policy and purge
only the affected preview URLs; never change production or purge the entire zone to work around it.
