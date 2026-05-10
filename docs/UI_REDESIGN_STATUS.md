# UI redesign — status tracker

This file is the single source of truth for where the redesign work stands. Read this first, then consult [`UI_REDESIGN.md`](UI_REDESIGN.md) for the full spec of whichever chunk you're picking up.

## How to use this file

- **Starting a new session:** find the first chunk with status `next-up` — that's your entry point. Read its full spec in `UI_REDESIGN.md` before writing any code.
- **Finishing a chunk:** update Status to `done`, fill in the Date, add any Notes that matter for the next chunk (blockers found, deviations from the plan, follow-up needed).
- **Blocking issue:** set status to `blocked` and describe it in Notes. Do not start the next chunk.

Statuses: `done` · `in-progress` · `next-up` · `blocked` · `not-started` · `skipped`

---

## Current position

**Next chunk:** 2.1 — Chart slot

---

## Chunk status

| Chunk | Title | Status | Date | Notes |
|---|---|---|---|---|
| **Phase 0** | | | | |
| 0.1 | Remove Perform and its modals | done | 2026-05-09 | |
| **Phase 1** | | | | |
| 1.1 | `ChartSurface` skeleton + flag | done | 2026-05-09 | |
| 1.2 | Extract `InstrumentRail` from Studio | done | 2026-05-09 | |
| **Phase 2** | | | | |
| 2.1 | Chart slot | not-started | | |
| 2.2a | TopBar: Transport + Key/Time cluster | not-started | | |
| 2.2b | TopBar: Edit, Share, Library | not-started | | |
| 2.2c | TopBar: Overflow menu + Visualizer toggle | not-started | | |
| 2.3 | Instrument rail mount | not-started | | |
| **Phase 3** | | | | |
| 3.1 | On-demand visualizer overlay | not-started | | |
| **Phase 4** | | | | |
| 4.1 | Flip default surface to `chart` | not-started | | |
| 4.2 | Delete legacy shell | not-started | | |
| **Phase 5** | | | | |
| 5.1 | Editor mobile UX | not-started | | |
| 5.2 | Sharing prominence | not-started | | |
| 5.3 | Responsive + a11y sweep | not-started | | |

---

## Phase-boundary notes

Record anything discovered at a phase boundary that affects the next phase — unexpected coupling, deferred decisions, risk items that materialized or didn't.

| After phase | Date | Notes |
|---|---|---|
| 0 | | |
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |

---

## Deviations from plan

Record any meaningful departures from `UI_REDESIGN.md` so the spec and reality stay reconcilable.

| Chunk | Deviation | Reason |
|---|---|---|
| — | — | — |
