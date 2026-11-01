# Ensemble — the music stand

Next.js/React app using Ensemble's browser engine (`../core/`, via the `@core` alias) and
canonical chart codec. **Since the cutover (#1357, 2026-09-22) this is the app:**
`https://ensemble.brndn.zip/` serves this export at the site root, with accounts on by default.
See [the product brief](../docs/design/ensemble-v2.md) and the archived rollout plan
(`../docs/archive/ensemble-v2-rollout.md`).
Fresh Claude/Codex/other-agent sessions start with [the v2 handoff](CLAUDE.md).

## Accounts and the account-local store (#1177 onward)

Accounts are on for every device since the cutover (#1357). Sign-in is a passkey, with a
downloadable recovery code, against the account API in `../api/`.
`lib/sync/` is the account-local IndexedDB repository and explicit Save outbox; `lib/account/`
wires it to the session, the sync loop and the account UI in `app/account/`. The guest songbook
is a separate store and is never uploaded implicitly, and a device that has never held an
account asks the server nothing (`deviceMayHoldAccount`). [CLAUDE.md](CLAUDE.md)'s navigation
table lists each flow — Save, Keep both, adopting a remote update, delete, sign-out, account
deletion — and [the sync contract](../docs/design/ensemble-v2-sync.md) is the design.

Saves compare local revisions and commit the frozen snapshot plus queue entry in one IndexedDB
transaction. Each writer's unsaved recovery is separate. `sendNext` sends only the queue head;
retries reuse exact request bytes, acknowledgements update only sync metadata, and conflicts
preserve both versions and pause that song's queue. Multiple senders may retry the same frozen
head, and the server enforces owner-bound idempotency and revisions. An account scope is routing
context, not proof of authentication or protection from same-origin script access to browser
storage: `switchAccount(null)` only fences access, and sign-out proper — server revocation, then
clearing the device's account data — is `signOut` in `lib/account/sync-loop.ts` (#1269).

Queues bound pending explicit Saves to 64 per song. At the limit, Save fails without changing
the prior document or queue; the host retains the editor/recovery and offers export. Completed
local receipts retain only a request digest and revision, not another full chart copy.

From the repository root, `npm run test:sync` verifies native IndexedDB behavior in Chromium
and WebKit, including aborted transactions, competing connections, lost responses, owner
switches, corrupted bytes and offline Save ordering. These are storage contract tests, not
an end-to-end cloud-service or physical iPhone acceptance claim.

## Analytics (#1389)

`lib/telemetry.ts` loads the homelab's own Umami (`umami.brndn.zip`) only in a production build
(`NEXT_PUBLIC_TELEMETRY=1`, set for the one `ensemble-web` image released to both prod and
ensembletest) on the canonical host (`ensemble.brndn.zip`) — the hostname check is what keeps
ensembletest silent, since it runs that same image. Never on dev, the Playwright export, or a
render-bridge build. `data-do-not-track="true"`, `autoTrack`/`autoPageview` off, `referrerPolicy:
strict-origin`; every payload's `url` is the bare `location.pathname` and `referrer` is always
`''` — v2 carries a shared chart in the `#chart=` fragment, so neither the query string nor the
hash ever crosses the telemetry boundary. The tracker is optional and its queue is bounded: a
blocked or failed script never affects the app, and it is not precached by the service worker, so
an offline visit sends nothing.

The event vocabulary is allow-listed and typed (`TelemetryEventData` in `lib/telemetry.ts`) —
never a chart title, chord content, account id or email:

| Event | Data | Where |
| :- | :- | :- |
| `session_class` | `{ device }` | Once per boot, alongside the pageview |
| `play_started` | — | The band actually starts (`lib/runtime.ts`'s `startBand`) |
| `genre_changed` | `{ genre }` | The transport bar's `onGenre` handler (`app/ensemble.tsx`) — deliberately not inside `runtime.setGenre` itself, whose only other caller was `lib/starters.ts`'s one-time sample seeding (retired by #1439's standards catalog, which never calls `setGenre` at all) |
| `part_toggled` | `{ part }` | `runtime.setEnabled` |
| `chart_opened` | `{ source: songbook \| import \| standard }` | `openSong`, `openStandard` (#1439), and after an import lands |
| `chart_created` | — | `newSong` |
| `chart_imported` | `{ format: ireal \| file }` | The iReal import dialog, a dropped `.ensemble`/`.json` file |
| `share_created` | — | Copying a `#chart=` link |
| `share_opened` | none | Opening a `#chart=` link |
| `account_signed_in` / `account_registered` | — | The sign-in dialog, on success — no identifiers |
| `sync_conflict_shown` | — | The refused-Save/candidate banner above the stand |
| `midi_exported` | — | `runtime.exportMidi` |
| `wav_exported` | `{ stems }` | `runtime.exportAudio` |

## Run and verify

From the repository root, install the existing engine dependencies with `npm ci`, then:

```sh
npm ci --prefix web
npm run build --prefix web
npm run test:e2e --prefix web
```

Those three commands build and check the app, which is served from the site root and nowhere
else (#1734). They are what CI's `v2-suite` runs.

For UI development, `npm run dev --prefix web`, then visit `http://localhost:3100/`.
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
network-disconnection harness is local-only.

## Deliberate boundaries

- The band engine (`../band/`, driven by `lib/band-host.ts`) plays through the real voices
  and sample packs in `../core/engine/`; no iframe or simulated transport. No worker runs
  (#1404).
- Browser-page singleton runtime (`lib/runtime.ts`), explicit authored-content projection,
  stop/load/rebuild lifecycle.
- The app bundles `core/`'s TypeScript source through `@core`. The engine's own typecheck also
  runs before every build.
- Nothing reads or writes v1's `ensemble_*` keys: v1's load/save layer is gone (#1424) and
  the v1 import was retired (#1736). The keys are left on the device, inert and never deleted;
  `checks/foundation.spec.ts` pins a sentinel in `ensemble_currentState`.
- IndexedDB `ensemble-v2-preview` (a frozen name from the beta: renaming it orphans every
  device's songbook) holds explicit saves with atomic revision comparison. Local
  recovery keys are writer-scoped; older competing drafts remain accessible in the Song menu's More › Older drafts….
  Quota errors retain the current draft in memory and warn before leaving the page where the
  browser supports that prompt. Browser eviction/clearing can still remove local data: export
  valuable charts, or sign in so the account keeps a copy.
- The Sounds dialog offers one explicit install-all action (about 9.1 MB) that applies the
  existing genre sound map to the current draft. Per-lane Follow feel updates on genre changes;
  a manual choice pins that lane. Other saved songs are not rewritten. Save keeps the chosen
  setup, including Follow feel, and Revert restores it. Follow feel plays only what this device
  has installed (#1405): startup reads the installed packs from the sound cache, and opening a
  song resolves each Follow-feel lane against them. Since #1997 (2026-11-01, reversing #1405's
  "never downloads by itself") Play fetches the playing style's packs in the background and the
  Follow-feel lanes move onto them at a barline without stopping; Save-Data makes that a one-tap
  offer, the Players tab can turn it off, and pinned lanes are never touched. Starters
  and new songs start on Follow feel. Existing decoding,
  sample playback, calibrated gain and voice effects are reused without musical changes. A host
  asset-fetch adapter maps original pack URLs into `/packs/`. The
  production host retains its ordinary fetch path.
- The app shell caches a build-specific SHA256 sound-file index; sounds download on selection
  or playback, not during app-shell installation. `ensemble-v2-sounds-v1` (a frozen name: renaming it orphans every downloaded pack) stores content-addressed,
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
  swaps in at the next bar using the engine's own staged-feel path; the
  stand's toast reports preparation and the pending bar honestly. A failed change stops,
  restores the previous setup and resumes only if that setup's sounds are still verified; Stop
  cancels a pending restart. Do not use this as the only copy of important writing yet.
- Four bars per laptop/tablet row, two per portrait phone row, scrolling rather than pagination.
  The open song replaces the branding header; Sounds opens over the score without displacing it.
  Playback hides nothing on a laptop or tablet: the header's controls stay put. On a phone the
  header's second row and Band… fold into the ••• while the band plays (#1993), one press away.
  Playback highlights follow the band host's own clock (`lib/band-host.ts`); manual
  wheel/touch/keyboard browsing suspends following until explicitly resumed.
- Stage mode (#1208) is the dark music-stand theme: a tap on the song header's Stage button.
  The palette is one set of `light-dark()` tokens picked
  by `color-scheme`; unset follows the system, a tap stores `ensemble-v2-preview:theme` as a
  per-device convenience (never a document field) and is applied before hydration. Band chips
  (#1210) read on/off at a distance — filled green versus dashed/hollow/struck — and toggling
  never reflows the row; the chip's name stays put and `aria-pressed` carries the state.

## Measure-based charts (#1171)

Every chart is document v2, the only schema (#1740): sections, stable measure identities and
exact chord durations. A text chart (schema 1) arriving as a file or a link is refused in plain
words and nothing changes; one still in a store is left out of the songbook. There is no
converter: "Upgrade old songs" did that job and was deleted once every device was upgraded.

In Edit chart a measure chart has no side panel (#1726): there is the chart. Press a bar and
type its chords into it (on a phone, into the field docked on the keyboard); Tab or Enter moves on,
and leaving a bar applies it. For example, `C Dm G7` in 4/4 needs an explicit timing choice: type
`C:2 Dm:1 G7:1`, or drag the splits on the bar menu's beat ruler. The bar menu (⋯ on the bar, or
Ctrl/⌘+.) holds **Key or meter from here**, which applies from that bar through the section and
does not transpose chord names; where the bar's meter has more than one idiomatic split (5, 7, 8,
9, 10, 11 or 12 counts — `lib/grouping.ts`), its beat grouping picks one, such as 2+3 in 5/4, and
the section's settings offer the same at section scope (#1376). Any meter change resets it. The
menu also holds **Repeat or ending…** (the one repeat path), **Hold last chord**, **Insert bar
after** and, last after a divider, **Delete bar**. Only the beat ruler is open as the menu opens;
Key or meter from here is folded (#1758). On a phone the bar and section menus slide up from the
foot of the screen over a light backdrop that a press goes through, so pressing another bar
still opens it.
The song's title is typed in the header while editing. The transport's **Key** button opens one
small popover (#1757) holding the song's Key, Mode, Meter and Chord notation, each changed as it is
picked. Key transposes the entire score. **Mode** sets the song's own major/minor
(#1375) without rewriting chord names or moving the key: A minor is A, then Minor, not a
relative-key swap to C. **Meter** sets the song's own meter: equal-length bars re-divide, a
section or bar with its own meter keeps it, and a bar whose written lengths cannot follow blocks
the change and is selected for you — nothing is rounded. How many times the form plays (or Repeats
continuously) is the chart footer's form-length menu.
Delete bar and Delete section take effect at once; a toast then offers **Undo** for a few
seconds (#1758), which puts back the chart exactly as it was before the delete — the deleted bar's
unapplied typing included, its bar open again. It is one snapshot, not a history: any later edit,
or Save, retires it, and it touches nothing saved.
Delete bar removes the bar (a key/meter change it wrote passes to the next bar, so the rest of the
section sounds the same; a section's only bar takes the section with it) and the section letter's
**Delete section** removes the whole section (#1373). Both refuse, changing nothing, when it would
remove the chart's last bar or section, music another bar repeats, half of a two-bar repeat, or a
bar carrying repeat/navigation marks — remove the marks or the whole section instead. Pressing the
section letter in Edit opens that section's menu (#1374, #1726): it names the section (1–24
characters), sets how many times it plays (1–64), gives it its own key, mode or meter or returns
each to the song's, and adds a section after it (one bar in the song's key and meter) or deletes
it. Its name and plays, and its key, mode or meter, are two folded groups. A section meter change re-fits that section's bars by the song meter's rule and resets its beat
grouping; a bar with its own override keeps it. Save includes pending bars even with the editor
hidden.

Under **Repeats and endings**, select an existing bar range with two clicks/taps or Tab and
Enter (or use From/Through), then **Repeat these bars** and choose the total plays, default 2.
**Add first and second endings** guides the repeated body and two adjacent ending ranges.
Review the written brackets and whole-chart playback route before Apply. Reopen a group to
edit its range/count or remove only its form markers. Cancel keeps unrelated pending chord
text. Apply adopts the complete validated draft; explicit Save updates the songbook.
The [guided interaction note](../docs/design/ensemble-v2-guided-form.md) describes the boundaries.

**Per-bar markers for …** (inside the Repeats and endings dialog since #1758, in the bar menu
before) keeps the bar's low-level fields for nested and nonstandard forms; where the pending
bars' markers make no form yet, the dialog opens straight on them. Set each affected bar in turn: a bar whose markers make no form yet
stays pending (lightly tinted, no error), and the form applies as soon as the bars together make
one; Save says what is still missing. Complex sections are preserved by the guide and remain
editable here.
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
to 16,384; the band then refuses a performance of more than 65,536 chord events
(`MAX_PERFORMED_SPANS`, `band/form/timeline.ts`).

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

The chart codec is strict, so a build older than a document's newest field refuses that
document. Before rolling a host back to an older tag, export important writing; prefer rolling
forward.

## Editing and returning to practice (#1175)

- Save, Duplicate and Export… include every bar still typed but not applied (#1723); a bar whose
  chords do not read is selected and its field opened, with the reason, and nothing is saved.
  Revert to saved explicitly discards both the setup experiment and the pending bars.
- Pending bars are tab-only and request an unload warning. Applied changes enter the existing
  recovery path before attempting Save, so a conflict or failed write retains the work. Browser
  unload warnings are not reliable on all mobile lifecycle paths; explicitly Save or export
  before leaving important writing.
- Edit chart opens the editor over the chart; Chart is a view switch,
  not the playback button. Tempo keeps intermediate keystrokes local until Enter/blur; Escape
  cancels, and steppers commit once. Its 40–240 bounds match the existing engine and codec.
- Continue uses a best-effort device-local last-opened preference, including recovered setup
  metadata. Opening a song does not alter saved revisions/timestamps. First visits offer a
  standard from the catalog (#1439) honestly ("A good place to start") rather than implying
  previous practice; preference failure never gates play.

## Deployment

Both hosts serve the **`ensemble-web`** image: this export, on unprivileged nginx (`../hosting/web/`), beside the `ensemble-api` container. A release is
a tag, verified through the host's public `/build.json` (`sourceRevision` = the commit):

- **Production** — every merge to `main`: the CI `deploy` job releases the merged commit's
  tags to `ensemble.brndn.zip`, then `ensembletest.brndn.zip`. The required `v2-checks`
  context (build + this suite) gates the merge; `web-image` builds and smoke-tests the image.
- **Test audition** — `../scripts/deploy-test.sh [branch]` releases a pushed branch's image
  to `ensembletest.brndn.zip`, dispatching CI to build it first if needed. The next merge puts
  the test host back on `main`.
- **Rollback** — release the previous tag (`../hosting/README.md`), or `git revert` → PR.

The old beta path `/v2/...` is a plain 404 (#1742). CI's `v2-suite` builds and tests the
shipped `/` build; `.github/workflows/v2-root-image.yml` smoke-tests its image on a PR and
`web-image` after the merge.
