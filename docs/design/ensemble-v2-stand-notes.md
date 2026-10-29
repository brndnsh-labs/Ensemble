# Ensemble v2: notes on the music stand's surfaces

The why, the history and the worked examples behind the stand's navigation rows in
[`web/CLAUDE.md`](../../web/CLAUDE.md). That guide keeps each surface's files, boundary and
binding rules; read it first. The account rows' notes are in
[the sync contract](ensemble-v2-sync.md#client-notes-moved-from-webclaudemd-1937), and the neck's
finger line and the voicer's in [the neck voicings log](neck-voicings.md).

Moved here verbatim from `web/CLAUDE.md`'s navigation rows (#1937, 2026-10-29), so the rows keep the map and the binding rules while the why, the history and the worked examples live here. Each heading names the row; its sentences keep their original order, and a sentence the row still holds part of appears here whole. **The code is the authority**: grep the symbol a sentence names before trusting it.

## Delivery and boundaries (from the guide's prose sections)

The 2026-09-10 branch-only exception is **retired**. `feat/ensemble-v2-foundation` merged to `main` on 2026-09-12 via PR #1173; start v2 implementations from `main` like any other story, and follow the repository's normal cycle and merge defaults.

**Merging to `main` releases this app (since #1207, 2026-09-15).** Since the cutover (#1357) this app IS `https://ensemble.brndn.zip/`: CI builds it at `/` into the `ensemble-web` image and the `deploy` job releases that tag to prod and then test on every merge, asserting each host's public `/build.json` names the commit. It is gated by the required `v2-checks` context (build + `checks/` Playwright suite) next to `checks` and `e2e-tests`. Nothing of v1 is served or read: `/v1/` and the old beta path `/v2/...` are plain 404s (its redirect and tombstone worker went in #1742). v1's browser data is not read at all (the v1 import was retired in #1736; the `ensemble_*` keys stay on a device, inert), and an old `?s=` link is ignored (#1735). Accounts are on for every device (#1357); the beta's `?accounts=off` opt-out was retired in #1743, and a device's stored `ensemble-v2-preview:accounts` key is left in place, inert. The v1 source, its build and its CI jobs were deleted in #1358; `core/` remains as the engine library this app imports. A chart is one schema, 2; a schema-1 text chart is refused in plain words and never converted (#1740, `web/CLAUDE.md`'s Retired text charts row). The plan that got here is [the rollout](../archive/ensemble-v2-rollout.md), archived.

The trust-boundary bullets as they read before the trim (the guide keeps them without the issue history):

- The account-local database/outbox (`lib/sync/`) is wired to passkey sign-in and the UI
  (#1261 onward). Account code goes in `app/account/` and `lib/account/`; plain `fetch`, and
  `@simplewebauthn/browser` is the only new client dependency.
  `AccountScope` is a local fence, **not authentication**. Production authorization must come
  from a verified server session. Fake transports are contract tests, not cloud support.
- Never migrate/delete guest stores, or the inert keys v1 and the beta left on a device, incidentally. Do not cache private API/auth
  responses or personalized HTML in the anonymous app shell. No credentials or chart contents
  in telemetry. Keep local safety, cloud confirmation and verified offline sounds distinct.
- The band engine (`../band/`, `lib/band-host.ts`) plays; the old generators and the
  worker are gone (#1404). Unsupported chart
  semantics block with an explanation; full iReal compatibility is a target, not today's
  capability.

## Navigation rows

### Session shell: open/save/recover, editing buffers, playback wiring

Files, as the row listed them: `app/ensemble.tsx`, the stylesheet partials (`web/CLAUDE.md`'s next row); its domain hooks `app/use-follow-scroll.ts`, `app/use-modal-dialog.ts`, `app/use-history-navigation.ts`, `app/use-delete-undo.ts`, `app/use-stand-toast.ts` (milestone 22, #1893–#1897), and its handler hooks by domain `app/use-bar-editing.ts` (#1906), `app/use-stand-conflict.ts` (the version conflict's Keep both and Use the account's version, #1907), `app/use-account-exit.ts` (Sign out, Sign out on this device and Delete my account's local half, #1908) and `app/use-song-deletes.ts` (the five song-delete confirms and their handlers, #1909) (milestone 23), and its state-plus-effect clusters by domain `app/use-adopt-offer.ts` (the signed-in adoption offer, #1918) and `app/use-collection-actions.ts` (the All songs page's collection handlers and their two dialogs, #1919) and `app/use-playback-state.ts` (the playback poll's state and a shared link's armed autoplay, #1920) and `app/use-songbook-library.ts` (the songbook library reads: home slices, full libraries, the opened-at map, `refreshSongs` and the rest, #1921) and `app/stand-stack.tsx` (the stand's toast, delete Undo, sync-failure line and Resume-follow pill strip, which owns the `ResizeObserver` that publishes its height, #1922) (milestone 24), and round 4's `app/use-row-menu.ts` (the row ⋯ menu's shell-owned items, #1930) and `app/use-held-account.ts` (the held-account fact: the held and deleted owners, the expired banner's condition and copy, and the storage read, #1931) and `app/use-stand-keys.ts` (the stand's Space and PageDown/PageUp keys, #1932) (milestone 25)

### Songbook home

Files, as the row listed them: `app/songbook.tsx`, `app/standards-browser.tsx`, `app/all-songs.tsx`, `lib/home.ts`, `lib/first-bars.ts`, `lib/standards.ts`, `app/use-songbook-library.ts` (#1921)

Presentational; #1441's "library first" page: Continue (the song's own first bars, `firstBars`, with Open chart and ▶ Play), at most eight recently opened songs, the standards shelf, a first-visit layout (no songs, nothing to continue) and ONE search box in the shell's top bar across the musician's songs and the standards. The guest read is one read-only transaction; the account read (`homeLibrary`) is three owner-fenced reads — the opened-at map and last-opened pointer, then `AccountSongbook.home`'s one transaction — so its count and rows are one snapshot but the ids it looks up may be a moment older. The signed-in adopt check (`computeAdoptCandidates`, two full reads; in `useAdoptOffer`, `app/use-adopt-offer.ts`) is not repeated while the owner, the account library's downloaded counts and the guest `count()` are all unchanged since a check that found nothing to offer.

### Music stand surfaces

Files, as the row listed them: `app/song-header.tsx`, `app/transport-bar.tsx` (+ its Key popover `app/key-popover.tsx`, #1757), `app/chart-sheet.tsx` (+ `app/use-chart-view.ts`, `app/use-chart-fit.ts`, `app/form-strip.tsx`); Neck mode (#1587): `app/neck-stand.tsx`, `app/neck-view.tsx`, `app/neck-view.css`, `app/use-neck-view.ts`

**A measure chart has no edit panel (#1726)**: in Edit chart there is only the chart — bars typed in place, the bar menu, the section letter's menu — and the song's title is typed in the header (`song-header.tsx`'s `#title` input, "Song title", in place of the `h1`'s text; each keystroke an unsaved `draft`, Save commits). There is one chart schema, 2 (#1740): a text chart (schemaVersion 1) has no reader left, and arriving as a file or a link it is refused with `OLD_FORMAT_REFUSAL` (`lib/documents.ts`'s `validateDocument`, `RETIRED_CHART_LINK`) — see `web/CLAUDE.md`'s Retired text charts row. The chart reads as a page (#1712): `useChartFit` tries fixed size steps on the real DOM (`data-fit` on `.chart-scroll`, largest first) and keeps the largest where the whole written chart fits with every bar's chords on one line; a chart that fits at no step scrolls at a reading size, as editing always does. Four bars to a row at every width; reading, the section letter sits in a left margin (`data-page`). A chart that scrolls (#1713) also shows the form's first line again, faded and inert, after its last (`.next-chorus`, never a `.bar`), and `FormStrip`: one segment per section, the view outlined, the band's row marked; a segment scrolls there and turns Following off. The stand has three buttons — Chart, Neck, Edit chart.

### Band sheet and song actions

More swaps in a second `<Menu>` at the same ••• (no submenu): Revert to saved, and Older drafts (N)… while there are any ("Preserved drafts" until #1760). The dialogs it opens live in `song-menu.tsx`: Older drafts, and Copy link's fallback when the clipboard is refused (`share-link-fallback`). The Band sheet's Practice tab no longer has Chord notation. Choruses is the chart footer's form-length menu alone.

### Stylesheet partials (#1936)

Files, as the row listed them: `app/layout.tsx` (the ordered side-effect imports), then `app/style.css` (tokens, palettes, base elements, header, songbook basics), `song-header.css`, `chart-sheet.css`, `stand-stack.css`, `stand-shell.css`, `transport.css`, `chart-editing.css`, `band-sheet.css`, `workspace.css`, `account.css`, `songbook.css`, `chart-page.css`, then `motion.css`

Moving partials' rules into component imports is a separate follow-up.

### Anchored menus (#1755)

Files, as the row listed them: `app/menu.tsx` (+ `app/menu.css`), `app/use-anchored-placement.ts`, `app/use-anchored-dismiss.ts` (the trigger's `aria-expanded`, the outside press and the document Esc, shared with the transport's Key popover, #1757); used by `app/song-row-menu.tsx` (the row ⋯ on the songbook home and All songs; its Rename…, Duplicate and Export handlers are `useRowMenu`'s, `app/use-row-menu.ts`, #1930), `app/song-menu.tsx` (the stand's •••, #1756), `app/all-songs.tsx`'s collection bar ⋯ (Rename…, Delete…, #1760), and `chart-sheet.tsx`'s form-length and reading section-letter menus

### Dialogs (#1760)

Files, as the row listed them: `app/dialog-close.ts` (`dialogRule`, `closeDialog`), spread onto every `<dialog>`: `app/account/*`, `delete-guest-song.tsx`, `collection-dialogs.tsx`, `song-row-menu.tsx`, `song-menu.tsx`, `export-dialog.tsx`, `import-dialog.tsx`, `guided-form.tsx`, `band-sheet.tsx`; `app/use-modal-dialog.ts` (`useModalDialog`)

**Sign out** is on the account page's Sessions section with its offline reason (`account-page.tsx`); the header's account entry is only the chip ("Signed in", or Finish protecting + Account). Labels are plain words: "Older drafts", "Melody comes back" (the Trade tab's "after N choruses"), and the import dialog is "Import a chart" until a chart is under review, then "Review import". `checks/dialog-rules.spec.ts` walks the dialogs on both projects (the signed-in half on Chromium)

### Bar editing / runtime bridge

Files, as the row listed them: `app/use-bar-drafts.ts` (#1723), `app/use-bar-editing.ts` (the bar and section editing handlers, #1906), the in-bar field in `app/chart-sheet.tsx` (#1723), the phone's docked bar field `app/bar-dock.tsx` (#1724), the bar menu `app/bar-menu.tsx` (+ `app/bar-ruler.ts`, `app/bar-context-fields.tsx`, #1725), the Repeats and endings dialog `app/guided-form.tsx` (+ `app/form-controls.tsx`, its per-bar markers since #1758), the section letter's menu `app/section-menu.tsx` (+ `app/section-settings.tsx`'s fields, #1374, #1726), `lib/form-editing.ts`, `lib/documents.ts` (add/remove bars and sections, section settings), `lib/song-meter.ts` (the song's own meter, #1371, and a section's, #1374 — re-fits only bars whose effective meter changes; blocks, never rounds), `lib/runtime.ts`

Typing on the chart (#1723): in Edit chart a press on a measure chart's bar opens a field in it (`BarEditing`, `useBarEditing`'s `barEditing()`); Tab/Shift-Tab/Enter move bar to bar (passing over bars `editableText` can't print), Esc puts back the bar's applied text. A typed lowercase root capitalises itself.

**The bar menu (#1725)** is the open bar's structure: ⋯ on the bar (top-right) or Ctrl/⌘+. from its field on a laptop, a popover placed beside the bar; ⋯ in the dock on a phone, a sheet over the dock. It holds the beat ruler (`readRuler`/`rulerText`: the bar's chords as spans in HALF counts, holds `/` folded into the chord before; each split a `role=slider`, dragged with captured pointer events or moved by arrow keys a count at a time, Shift for half a count where that is on the step grid; it writes `C Dm` for equal lengths, else `Gm7:3 C7:1`), Key/Mode/Meter/Beat grouping from here (`BarContextFields`), Repeat or ending… (the shell's own `GuidedForm` over every pending bar, unapplied — the menu's ONE repeat path since #1758: the per-bar markers, `FormControls`, for nested and nonstandard forms the guide leaves alone, are the dialog's "Per-bar markers for A · bar N…" view, a live draft change through `barMarkers`; where the pending bars' markers make no form yet, `openBarForm` opens the dialog on them with the guide `blocked`, and "Back to the guide" re-reads the pending bars), Hold last chord, and Insert bar after (`withBarAfter`) / Delete bar (`withoutMeasure`), which commit pending bars first (`updateChart`) and open the resulting bar for typing.

**Calm by default (#1758):** the ruler is the one open group (it is what the menu is for; folded, the most-used control would cost a second tap), every other group is a folded `<details>` with a chevron, and Delete is last after a divider, as in `<Menu>`; the phone's Back to typing (the section menu's Close) sits in the heading row (`.bar-menu-top`) so nothing follows Delete. On a phone both sheets slide up with `menu.css`'s `menu-slide-up` over its `.menu-backdrop` — which here is `pointer-events: none` (`.bar-menu-backdrop`), drawn only, so a press goes through to the bar, dock or letter beneath and the menus' own document outside-press reads it (a press on another bar still opens it). Applied on the way down, the change re-laid the page out under the pointer (a CI WebKit's status line took a second line and moved Play 22px), so the click missed: Play pressed with a bar open left the bar and never played. Outside Edit the letter's menu is still Start here alone.

### Operator page (#1717)

Its own route at `/admin`, `noindex`, linked from nowhere; read-only over `GET /api/admin/overview` (accounts, storage, and the chart counts by `schemaVersion`, #1731 — `lib/admin.ts` rejects a malformed `charts`), whose allowlist (`ENSEMBLE_ADMIN_ACCOUNT_IDS`, deploy config on the box) is the only gate.

### Offline install / deployment

Both hosts serve the `ensemble-web` image (this export at `/`), released by tag: the CI `deploy` job on every merge, `scripts/deploy-test.sh` for a branch audition on the test host
