# UI redesign — status tracker

This file is the single source of truth for where the redesign work stands. Read this first, then consult [`UI_REDESIGN.md`](UI_REDESIGN.md) for the full spec of whichever chunk you're picking up.

## How to use this file

- **Starting a new session:** find the first chunk with status `next-up` — that's your entry point. Read its full spec in `UI_REDESIGN.md` before writing any code.
- **Finishing a chunk:** update Status to `done`, fill in the Date, add any Notes that matter for the next chunk (blockers found, deviations from the plan, follow-up needed).
- **Blocking issue:** set status to `blocked` and describe it in Notes. Do not start the next chunk.

Statuses: `done` · `in-progress` · `next-up` · `blocked` · `not-started` · `skipped`

---

## Current position

**Next chunk:** none — phase 7 mobile redesign complete. Optional follow-ups: 6.5B (section navigator) deferred.

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
| 5.1 | Editor mobile UX | done | 2026-05-10 | Editor already full-bleed at < 900px; added .symbol-row sticky strip on coarse-pointer devices with 44px tap targets |
| 5.2 | Sharing prominence | done | 2026-05-10 | Toast now shows truncated URL; "Shared with you" pill in topbar on ?s= / ?prog= load, dismissible |
| 5.3 | Responsive + a11y sweep | done | 2026-05-10 | Stale mockIds removed from a11y test; new dialog/alert assertions added; Playwright @mobile/@ipad coverage added |
| **Phase 6** | Polish | | | |
| 6.1 | Fix rail clipping | done | 2026-05-10 | Rail 240px → 320px; vertical-rail kicker hidden; per-row summary text hidden in vertical rail so Controls/power buttons fit |
| 6.2 | Topbar three zones + move Seed | done | 2026-05-10 | Topbar restructured into Play/Shape/Output zones with dividers ≥1024px; SoloistSeedControl moved into Soloist rail panel (alongside Trading) |
| 6.3 | Promote Share, demote 🌈/⋯ | done | 2026-05-10 | Added `header-btn--primary` (filled accent) and `header-btn--icon` (square) modifiers; Share is now visually heaviest; 🌈 and ⋯ read as utility |
| 6.4 | Stronger off-state on rail rows | done | 2026-05-10 | Rows without is-active fade to neutral background, icon dims and loses saturation, h3 drops to text-muted; active rows pop |
| 6.5A | Vertical-center chart | done | 2026-05-10 | Chart `display-area` uses `align-content: safe center` inside chart-surface so short charts no longer dump all whitespace at the bottom |
| 6.5B | Section navigator | deferred | | Punted — discussed inline in 6.5; bring back when sections become a real first-class concept |
| 6.6 | iPad touch sweep | done | 2026-05-10 | `.header-btn` and `.header-btn--icon` get 44×44 min on `(pointer: coarse)`; chart-surface @ipad Playwright suite green |
| **Phase 7** | Mobile redesign — bottom action bar | | | |
| 7.1 | Bottom action bar shell + wiring | done | 2026-05-10 | New MobileActionBar at ≤640px with three buttons (Mix · Share · Viz). Mix opens a sheet rendering the existing InstrumentRail inside StudioSurface modal mode. Share dispatches share modal; Viz toggles overlay |
| 7.2 | Mix sheet content | done | 2026-05-10 | Mix sheet reuses InstrumentRail vertically inside StudioSurface — gives access to Mixer, Band feel, and per-instrument Controls (all of which portal as nested sheets). Sheet header replaces rail title to avoid duplication |
| 7.3 | Trim mobile topbar | done | 2026-05-10 | Library/Edit/Share/🌈 hidden from topbar at ≤640px. Library + Edit fold into ⋯ overflow on mobile; Share + Viz live in the bottom bar. Topbar collapses to Transport · key/time · ⋯ |
| 7.4 | Mobile layout cleanup | done | 2026-05-10 | InstrumentRail removed from grid at ≤640px (no orphan horizontal strip). Topbar becomes deterministic 2-row grid (Transport+⋯ row, then key/time row). Safe-area-inset on bar + chart padding |

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
