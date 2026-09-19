# Ensemble v2: fresh-session handoff

Read [the root guide](../../CLAUDE.md) first. This guide applies to every v2 story,
including companion changes outside this directory. It is provider-neutral: the issue,
checked-in contracts and current branch are sufficient; do not require chat history,
another model's private memories, or access to a sibling application's secrets.

## Delivery: normal pipeline, and what "landed" does not mean

The 2026-09-10 branch-only exception is **retired**. `feat/ensemble-v2-foundation` merged to
`main` on 2026-09-12 via PR #1173; start v2 implementations from `main` like any other story,
and follow the repository's normal cycle and merge defaults. Inspect branch, worktree and
upstream before editing; preserve other work. A dirty shared tree is not permission to reset or
sweep it into your commit. Stop if the task's files overlap someone else's uncommitted changes.

**Merging to `main` releases this app (since #1207, 2026-09-15).** The CI `deploy` job
publishes the root app and then this static export at `https://ensemble.brndn.zip/v2/` on every
merge, gated by the required `v2-checks` context (build + `checks/` Playwright suite) next to
`checks` and `e2e-tests`. Treat a v2 story as live production work: it reaches users, and a red
v2 build or E2E blocks the merge. `../v2-api/` is deployed too: CI publishes its image and
releases it to the test and prod stacks behind `/api/*` on the same origin. Prod registration is
closed by policy until #1272 lands and Brandon says go; nothing in this app calls the API yet.

This is a release of the guest music stand beside v1, **not** a cutover. v1 stays at `/`. This
app keeps its own IndexedDB and `localStorage` keys, so anything a user saves here is invisible
to the v1 app until the v1 import (#1274) lands; the v1 About tab links here as a beta. Replacing
v1 is planned and authorized as the end of
[the rollout](../../docs/design/ensemble-v2-rollout.md) — a hard cut after phases 3 and 4.

Human gates are unchanged: a device or listening gate is still a hard stop, and a merged commit
does not clear one. Record the commit SHA, checks and remaining gate so another agent does not
implement the same story again.

Use the local harness's installed workflow skills; their shared doctrine still supplies review,
provenance, safety and verification rules. If those skills are unavailable, follow the same
steps explicitly and report that limitation. Do not weaken a gate because another provider is
executing. Generated skill copies are renderer-managed, not task-local files to patch.

## Minimum context, in order

1. Current issue body, dependency receipts and relevant decision comments. Check its state
   against the branch: open does not mean unimplemented. GitHub milestones own task status:
   [accounts in the product](https://github.com/brndnsh-labs/Ensemble/milestone/17) and
   [parity](https://github.com/brndnsh-labs/Ensemble/milestone/18).
2. [Preview README](README.md): working behavior, commands, storage and deployment caveats.
3. Only the contract relevant to the task:
   [product](../../docs/design/ensemble-v2.md),
   [chart/import](../../docs/design/ensemble-v2-charts.md), or
   [accounts/sync](../../docs/design/ensemble-v2-sync.md) — read with
   [rollout](../../docs/design/ensemble-v2-rollout.md) decision 9, which removes the change
   feed, the offline logout barrier and account switching. Do not build those.
4. Target code and its tests. Read applicable nested guides before changing `public/` or
   `tests/`. Fetch current library documentation when implementing library-specific APIs.

The contracts explain intent, not live deployment status. PR/issue receipts own revision and
gate evidence. Do not copy old test totals or preview SHAs into a new claim of verification.

## Non-negotiable product and trust boundaries

- Fast guest accompaniment, a generous local songbook, and a music stand during playback.
  Accounts enhance those paths; they must not gate guest startup or require a server to play.
- Explicit Save commits a version. Automatic recovery retains a writer's unsaved experiment;
  it never silently uploads it. A later cloud acknowledgement cannot overwrite newer editing.
- Portable v1/v2 charts contain musical intent, not account/session/retry metadata. Preserve
  originals on conversion/import; unknown or corrupt data is not an empty-library success.
- The account-local database/outbox exists but is not yet wired to authentication or the UI
  (#1261 onward). Account code goes in `app/account/` and `lib/account/`; plain `fetch`, and
  `@simplewebauthn/browser` is the only new client dependency.
  `AccountScope` is a local fence, **not authentication**. Production authorization must come
  from a verified server session. Fake transports are contract tests, not cloud support.
- Never migrate/delete guest or legacy stores incidentally. Do not cache private API/auth
  responses or personalized HTML in the anonymous app shell. No credentials or chart contents
  in telemetry. Keep local safety, cloud confirmation and verified offline sounds distinct.
- Existing generators, voicings and worker contract remain. Unsupported chart semantics block
  with an explanation; full iReal compatibility is a target, not today's capability.
- Passkeys plus downloadable recovery code are approved. Hosting, backup/restore operations,
  production migration and public rollout still need their explicit gates. Do not invent an
  email reset, social account service, subscription tier or Docker mandate.

## Navigation and ownership

| Surface | Start here | Boundary |
| --- | --- | --- |
| Session shell: open/save/recover, editing buffers, playback wiring | `app/ensemble.tsx`, `app/style.css` | Owns all state and hands each surface props; the one shared integration file, one owner at a time |
| Songbook home | `app/songbook.tsx` | Presentational; library list, featured card, starters |
| Music stand surfaces | `app/song-header.tsx`, `app/transport-bar.tsx`, `app/chart-sheet.tsx` (+ `app/use-chart-view.ts`), `app/edit-panel.tsx` | Presentational; the section-letter long-press lives in `chart-sheet.tsx` |
| Sounds and song actions | `app/sounds-panel.tsx`, `app/song-menu.tsx` | The shell owns both `<dialog>` refs and their `showModal()` effects |
| Per-device conveniences | `app/use-stage-theme.ts`, `app/use-offline-install.ts` | Never document fields |
| Bar editing / runtime bridge | `app/measure-editor.tsx`, `lib/form-editing.ts`, `lib/runtime.ts` | Preserve authored/runtime separation and stop/load/sync lifecycle |
| Guest saves and recovery | `lib/repository.ts`, `lib/session.ts` | Not the account store; no implicit guest uploads |
| Account-local storage | `lib/sync/database.ts`, `lib/sync/repository.ts`, `lib/sync/records.ts` | Native IDB transactions, owner/generation fence |
| Account chart drafts and Continue (#1299) | `lib/writer.ts`, `lib/sync/repository.ts` (`recover`/`drafts`/`liveDraft`/`discardDraft`/`discardDrafts`/`rememberOpened`), `lib/account/sync-loop.ts` (`recover`/`retainedDraft`/`preservedDrafts`), `app/ensemble.tsx` (`draft`/`open`) | A draft row counts for anything — holding a record against a remote body, a sign-out warning, a `retained` delete, an offer to the musician — only while it is LIVE: captured at or after the committed version it sits on (`liveDraft`, the rule guest `recoveryFor` already used). A Save retires every writer's superseded rows; a chart that is back at its committed version retains nothing at all, all writers, or the next open recovers the edit that was just reverted away. An account chart's unsaved experiment and its last-opened pointer live in the ACCOUNT database, never the guest `localStorage` namespace — so sign-out removes them and a library download's preservation rule can see them. One writer id per page load, shared by both stores. The guest path is unchanged; a slot left under an account id by an older build is offered once through the same menu, then cleared by the next Save. A draft is still written after the session expires: expiry pauses uploads, it does not change which account this device holds |
| Explicit Save wire contract | `lib/sync/protocol.ts`, `lib/sync/send.ts` | Immutable retry bytes, owner-bound receipts, separate drafts |
| Explicit cloud delete (#1270) | `lib/sync/protocol.ts` (`deleteBody`/`deleteReply`), `lib/sync/repository.ts` (`prepareDelete`), `app/account/delete-song.tsx` | Online-only, export preflight, operation id frozen in IDB before the request; one `commitDeleted` rule shared with a downloaded tombstone |
| Keep both after a refused Save (#1267) | `lib/sync/repository.ts` (`keepBoth`), `lib/account/sync-loop.ts` (`keepBoth`), `app/account/conflict.tsx` | The only way out of a conflicted outbox head, which is otherwise terminal. ONE transaction: the local line is created under a fresh document id and a fresh operation id, every queued Save for the failed id retires, drafts follow, and the original id either adopts the preserved remote version or leaves the library (`gone`). Never reuses the refused ids; no merge and no "overwrite theirs". A `deleted` candidate outranks the refusal's own remote version; an `unsupported` one survives it. The shell commits the bar editor FIRST (both editors are keyed on `current.id`), then re-points the chart on the stand — id, revision and the marked `— kept` title — without changing a bar of the music |
| Delete my account (#1271) | `lib/account/passkeys.ts` (`deleteAccount`), `app/account/delete-account.tsx`, `app/account/use-account-session.ts` (`forgetDeletedAccount`), `../v2-api/src/auth/account-deletion.ts` | Online-only, fresh-auth-gated with the same one step-up retry; typed confirmation and an export-everything offer in front of it. The server deletes the session itself, so the local half is #1269's sign-out with `revoke` resolved `true` — no logout round trip. Guest songbook untouched |
| Sign-out and session expiry (#1269) | `lib/account/sync-loop.ts` (`signOut`/`signOutPreflight`), `lib/sync/repository.ts` (`clearAccount`), `app/account/sign-out.tsx` | Fence bumped BEFORE the logout request; local data cleared only once the server confirms the revocation. Expiry is the other thing: the outbox pauses, nothing local is removed |
| Portable chart / iReal semantics | `../../public/songbook/` | Root/scoped engine guides and canonical codecs apply |
| Offline install / deployment | `scripts/offline.mjs`, `scripts/deploy.mjs` | Anonymous shell + verified sounds; `deploy.mjs test` from a workstation, `deploy.mjs prod` only from the CI deploy job |
| Browser evidence | `checks/`, `../../tests/browser/account-songbook.browser.test.ts` | Preview E2E plus real IndexedDB in Chromium/WebKit |
| Account E2E harness (#1258) | `checks/fixtures.ts` (`accountTest`), `checks/global-setup.ts`, `scripts/serve.mjs` | Opt-in: runs the real API bundle on a throwaway database behind the worker's preview server, one `http://localhost` origin. Name passkey specs `*.chromium.spec.ts` (CDP virtual authenticator); needs `npm ci --prefix prototypes/v2-api` |
| Server account API (stage 2, #1187+) | `../v2-api/` (sibling, not a subdirectory — see `../v2-api/README.md`) | Standalone Node service, own `package.json`/`node:sqlite` schema; ceremony (#1188), session + HTTP layer (#1189), passkey management + step-up reauth gated by one fresh-authentication predicate (#1190), and single-use recovery codes behind a restricted recovery-only session (#1191) modules land here; #1192 closed, client wiring starts at #1261 |

## Verification and receipt

Iterate with the smallest relevant test selection; before handing off implementation, run the
repo gates and the v2 gates affected by the story. From the repository root:

```sh
npm run validate
npm run test:e2e
npm run test:browser
npm run test:sync
npm run build --prefix prototypes/v2
npm run test:e2e --prefix prototypes/v2
```

`validate` also runs the formatter: inspect its diff and do not commit unrelated formatting.
The separate sync configuration includes its browser files explicitly; register any new file
there so both engines actually run it. Node/happy-dom is not proof of IDB transaction behavior.
Coordinate heavy browser suites instead of competing for their ports. Emulator success is not
physical iPhone/Edge acceptance, and audio assertions are not human by-ear approval.

Test deployment is optional per story and never inferred from a push. The preview's own deploy
script is distinct from the root-app deployment; both preserve the other's release paths.
Read the README and deploy-test skill before deploying. Identify exact artifact/commit and
report deployment separately from local/CI evidence. Never call an old deployed build current.

Each handoff needs: issue + commit SHA; changed surfaces; acceptance checklist with actual
evidence; checks run and results; unrun/failed gates and why; deployment status; next dependency.
Record genuine failures without editing expectations, skipping tests or asserting the intended
behavior already exists. Auth/ownership/concurrency changes need an independent correctness and
security review; synth or subjective music changes retain their human listening gate.

## Economical, cross-provider execution

Use the repository's provider-neutral `model/economy`, `model/balanced`, `model/frontier` labels.
The current routing pairs those with Haiku/Luna, Sonnet/Terra, and Opus/Sol respectively; these
are workflow roles, not a guarantee about availability, subscription limits or equal capability.
Precise tests/mechanical tasks fit economy; bounded implementation fits balanced. Authentication,
concurrency, destructive migration or unresolved musical meaning requires frontier-level review
and any applicable human decision. Escalate when the task exceeds the specified boundary.

Give each fresh session one issue. Pass this guide and that issue, not the whole conversation.
Use one integration owner: do not run separate Claude and Codex sessions writing this shared
branch concurrently. Parallel work requires verified disjoint files and owner-controlled
isolation/integration; shared fixtures, configs and the large app component are overlap too.

Suggested prompt once a child is filed and ready:

> Work on Ensemble v2 issue #NUMBER. Read CLAUDE.md and prototypes/v2/CLAUDE.md, then the
> issue and its dependencies. Branch from main and run the normal cycle. If the story touches
> `public/`, treat it as live production code; if it is confined to `prototypes/`, merging it
> still releases nothing to users. Stay within acceptance criteria, stop for unresolved
> decisions and human gates, and leave a test/commit receipt.

The broader design parents are not single implementation tasks. Pick a ready child; never run
an unattended cycle across the entire account or full-iReal umbrella.
