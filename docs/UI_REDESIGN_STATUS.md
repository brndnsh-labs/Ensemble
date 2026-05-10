# UI redesign — status tracker

This file is the single source of truth for where the redesign work stands. Read this first, then consult [`UI_REDESIGN.md`](UI_REDESIGN.md) for the full spec of whichever chunk you're picking up.

## How to use this file

- **Starting a new session:** find the first chunk with status `next-up` — that's your entry point. Read its full spec in `UI_REDESIGN.md` before writing any code.
- **Finishing a chunk:** update Status to `done`, fill in the Date, add any Notes that matter for the next chunk (blockers found, deviations from the plan, follow-up needed).
- **Blocking issue:** set status to `blocked` and describe it in Notes. Do not start the next chunk.

Statuses: `done` · `in-progress` · `next-up` · `blocked` · `not-started` · `skipped`

---

## Current position

**Next chunk:** 5.1 — Editor mobile UX

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
| 2.1 | Chart slot | done | 2026-05-09 | |
| 2.2a | TopBar: Transport + Key/Time cluster | done | 2026-05-09 | Mounted Transport + TimeSignatureControl + KeySignatureMenuControl directly; no new wrapper needed |
| 2.2b | TopBar: Edit, Share, Library | done | 2026-05-09 | LibraryModal lifted to shared component; ArrangerWorkspace imports from it |
| 2.2c | TopBar: Overflow menu + Visualizer toggle | done | 2026-05-09 | SoloistSeed top-level to avoid nested popovers; overflow has Generate Song, Settings, Manual |
| 2.3 | Instrument rail mount | done | 2026-05-09 | matchMedia hook drives orientation; horizontal strip CSS replaces placeholder |
| **Phase 3** | | | | |
| 3.1 | On-demand visualizer overlay | done | 2026-05-09 | VisualizerLegend embedded in VisualizerOverlay.jsx; createPortal into body |
| **Phase 4** | | | | |
| 4.1 | Flip default surface to `chart` | done | 2026-05-09 | ui-surface.js deleted; ChartSurface is now the only shell |
| 4.2 | Delete legacy shell | done | 2026-05-09 | Removed WorkspaceNav, ArrangerWorkspace, StudioWorkspace, VisualsWorkspace, state/ui.js, ui-surface.js, isMaximized/chord-maximize, ~2200 lines of legacy CSS |
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
| 2 | 2026-05-09 | Full feature parity achieved in chart surface. LibraryModal lifted to shared component. Horizontal rail strip functional; popover anchoring relies on existing ToolbarPopover fixed-position logic (recheck in 3.1). |
| 3 | | |
| 4 | | |

---

## Deviations from plan

Record any meaningful departures from `UI_REDESIGN.md` so the spec and reality stay reconcilable.

| Chunk | Deviation | Reason |
|---|---|---|
| — | — | — |
