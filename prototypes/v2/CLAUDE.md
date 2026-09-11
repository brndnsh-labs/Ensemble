# Ensemble v2: fresh-session handoff

Read [the root guide](../../CLAUDE.md) first. This guide applies to every v2 story,
including companion changes outside this directory. It is provider-neutral: the issue,
checked-in contracts and current branch are sufficient; do not require chat history,
another model's private memories, or access to a sibling application's secrets.

## Branch-only delivery

Brandon confirmed on 2026-09-10: "we'll keep building off of this branch for now since main=prod".

Use `feat/ensemble-v2-foundation` and existing [draft PR #1173](https://github.com/brndnsh-labs/Ensemble/pull/1173).
Do not start a v2 implementation from `main`. Inspect branch, worktree and upstream before
editing; preserve other work. A dirty shared tree is not permission to reset or sweep it into
your commit. Stop if the task's files overlap someone else's uncommitted changes.

The normal cycle becomes: read issue → implement → review → repair → verify → commit/push
to the v2 branch → record handoff. **No merge, auto-merge, ready-for-review transition of
PR #1173, issue closure, branch deletion, main sync, or production deployment.** This overrides
generic cycle/done merge defaults. A request to cycle a child is not a v2 production release.
Keep implemented children open in review, or at the actual device/listening gate. Record the
commit SHA, checks and remaining gate so another agent does not implement them again.

Use the local harness's installed workflow skills; their shared doctrine still supplies review,
provenance, safety and verification rules. If those skills are unavailable, follow the same
steps explicitly and report that limitation. Do not weaken a gate because another provider is
executing. Generated skill copies are renderer-managed, not task-local files to patch.

## Minimum context, in order

1. Current issue body, dependency receipts and relevant decision comments. Check its state
   against the branch: open does not mean unimplemented. GitHub
   [milestone 15](https://github.com/brndnsh-labs/Ensemble/milestone/15) owns task status.
2. [Preview README](README.md): working behavior, commands, storage and deployment caveats.
3. Only the contract relevant to the task:
   [product](../../docs/design/ensemble-v2.md),
   [chart/import](../../docs/design/ensemble-v2-charts.md), or
   [accounts/sync](../../docs/design/ensemble-v2-sync.md).
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
- The account-local database/outbox exists but is not wired to authentication or the UI.
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
| Home, songbook, music stand | `app/ensemble.tsx`, `app/style.css` | Shared integration files; one owner at a time |
| Bar editing / runtime bridge | `app/measure-editor.tsx`, `lib/form-editing.ts`, `lib/runtime.ts` | Preserve authored/runtime separation and stop/load/sync lifecycle |
| Guest saves and recovery | `lib/repository.ts`, `lib/session.ts` | Not the account store; no implicit guest uploads |
| Account-local storage | `lib/sync/database.ts`, `lib/sync/repository.ts`, `lib/sync/records.ts` | Native IDB transactions, owner/generation fence |
| Explicit Save wire contract | `lib/sync/protocol.ts`, `lib/sync/send.ts` | Immutable retry bytes, owner-bound receipts, separate drafts |
| Portable chart / iReal semantics | `../../public/songbook/` | Root/scoped engine guides and canonical codecs apply |
| Offline install / test deployment | `scripts/offline.mjs`, `scripts/deploy-test.mjs` | Anonymous shell + verified sounds; test-only release |
| Browser evidence | `checks/`, `../../tests/browser/account-songbook.browser.test.ts` | Preview E2E plus real IndexedDB in Chromium/WebKit |
| Server account API (stage 2, #1187+) | `../v2-api/` (sibling, not a subdirectory — see `../v2-api/README.md`) | Standalone Node service, own `package.json`/`node:sqlite` schema; ceremony (#1188), session + HTTP layer (#1189), passkey management + step-up reauth gated by one fresh-authentication predicate (#1190), and single-use recovery codes behind a restricted recovery-only session (#1191) modules land here; no client wiring until #1192 lands |

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
script is distinct from the original root-app deployment, which can remove the `/v2` preview.
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
> issue and its dependencies. Run the cycle through reviewed commit/push on
> feat/ensemble-v2-foundation only. Keep PR #1173 draft; do not merge or deploy production.
> Stay within acceptance criteria, stop for unresolved decisions, and leave a test/commit receipt.

The broader design parents are not single implementation tasks. Pick a ready child; never run
an unattended cycle across the entire account or full-iReal umbrella.
