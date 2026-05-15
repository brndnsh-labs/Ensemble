# UI redesign — chart-first single surface

*Last updated: 2026-05-09.*

**Progress tracking:** [`UI_REDESIGN_STATUS.md`](UI_REDESIGN_STATUS.md) — check this first to find the next chunk to work on.

## Goal

Replace the four-workspace model (Arranger, Studio, Perform, Visuals) with one chart-centric surface. The chord chart and transport are always visible. On/off toggles for each instrument are always visible. Deeper controls are one tap away through popovers and slide-ins. Tablet is the sweet spot; desktop and phone degrade naturally from it.

This plan was authored against the live code on `main` (commit `d0a96a4d`, May 2026). Cruft removal (Lars mode, audio analyzer, import parsers) is complete.

## Target shell

Three persistent zones around the chart:

```
┌───────────────────────────────────────────────────────────┐
│ TopBar:  [Transport]  [Key/Time▾]  [Edit] [Share] [⋯]    │
├──────────────────────────────────────────────┬────────────┤
│                                              │ Band feel▾ │
│                                              │ Mixer ▾    │
│            CHART (ChordVisualizer)           ├────────────┤
│                                              │ Drums   ⏻  │
│                                              │ Bass    ⏻  │
│                                              │ Chords  ⏻  │
│                                              │ Harmony ⏻  │
│                                              │ Soloist ⏻  │
└──────────────────────────────────────────────┴────────────┘
```

Breakpoints:

- **Desktop (≥ ~1024px):** TopBar full-width, instrument rail on the right.
- **Tablet (~640–1024px, sweet spot):** TopBar full-width, instrument rail collapses to a bottom strip. Band feel and Mixer become trigger buttons at the strip's leading edge.
- **Phone (< 640px):** TopBar collapses to icons + ⋯ overflow. Instrument rail is a horizontally scrolling bottom strip. Chart fills remaining viewport. Editor opens as a full-bleed sheet.

### TopBar contents

- **Transport** — `public/components/Transport.jsx`. Always visible.
- **Key & Time menu** — wraps `KeySignatureMenuControl` + `TimeSignatureControl` behind a single trigger.
- **Edit** — opens existing `EditorModal`. Mobile gets a full-bleed sheet with `SymbolMenu` as a sticky quick-tap row.
- **Share** — opens `ShareModal`. Promoted as a marquee affordance (visible at every breakpoint, not buried in overflow).
- **Visualizer toggle** (🌈) — opens visualizer as an on-demand overlay; flips `vizState.enabled` while open.
- **Library** — opens `PresetLibrary` (currently lives inside the Arranger header's local `LibraryModal`).
- **⋯ Overflow menu** — Generate Song, Settings, Manual, SoloistSeed.

### Chart zone

- `ChordVisualizer` + section management (existing `SectionCard`).
- The chart is sized for legibility at every breakpoint **without needing a maximize mode**. iReal Pro is the reference: the chart is the page, not a tile inside the page.
- Popovers and sheets layer over the chart; they never replace it.

### Instrument rail

- Five rows: **Drums · Bass · Chords · Harmony · Soloist**.
- Each row shows: icon, label, on/off pill ("On / Off / Queued" — already implemented), power button, "Controls" trigger.
- Active rows light up (existing `is-active` class) so a player can see at a glance who is playing.
- Rail header (or strip leading-edge on tablet/phone) hosts **Band feel** and **Mixer** triggers, reusing `StudioBandFeelChooser` and `StudioMixerSurface` verbatim.
- "Controls" opens the existing `StudioSettingsSurface` per-instrument popover.

### What goes away

- `WorkspaceNav`.
- `PerformWorkspace`, `PerformanceModal`, `PerformanceCanvas`, `DrumPadModal` (cruft).
- `VisualsWorkspace` as a destination → replaced by an on-demand overlay.
- `MaximizeChordButton`, `vizState.isMaximized`, the `chord-maximized` body class. (See Phase 4 — premise: a legible chart needs no maximize.)
- `ui.activeWorkspace`, `WORKSPACES` enum, `normalizeWorkspace`, `DEFAULT_WORKSPACE`, related persistence/hydration.
- Workspace-tab CSS scoping (`.workspace-view--*`, `.workspace-grid--*`). Studio popover CSS (`.workspace-studio-surface*`) is kept; rename to `.instrument-rail-*` is optional Phase 4 polish.

## Reuse map (no engine touched)

| Existing piece | New home |
|---|---|
| `ChordVisualizer` | Chart zone, unchanged |
| `Transport` | TopBar |
| `KeySignatureMenuControl`, `TimeSignatureControl` | TopBar Key & Time menu |
| `SoloistSeedMenuControl` | TopBar overflow |
| `StudioLiveMix` body (rows + Controls popover) | Extracted to `InstrumentRail.jsx`, mounted in rail zone |
| `StudioBandFeelChooser`, `StudioMixerSurface`, `StudioSettingsSurface` | Reused inside `InstrumentRail` |
| `Visualizer`, `VisualizerLegend` | On-demand overlay opened from TopBar |
| `EditorModal`, `ShareModal`, `Settings`, `ManualModal`, `GenerateSongModal`, `PresetLibrary` | Unchanged; triggered from TopBar |

## Migration strategy

### Feature flag (URL param + localStorage)

The new shell is built **alongside** the old one behind a runtime flag. Implementation in `App.jsx`:

1. On mount, read `URLSearchParams.get('surface')`. If `'chart'` or `'legacy'`, write to `localStorage.uiSurface` so the choice sticks across reloads. Ignore unknown values.
2. Compute active surface: URL param (this load) → localStorage → built-in default.
3. The built-in default is `'legacy'` during phases 1–3, then flips to `'chart'` in Chunk 4.1.
4. Branch in `App.jsx`: render `<ChartSurface />` when surface is `'chart'`, otherwise the existing workspace tree.

Costs ~10 lines in `App.jsx` plus a small helper. Disappears entirely in Chunk 4.2 along with the old shell. Lets us A/B compare in two tabs and share `?surface=chart` previews.

### Persistence and share-URL compatibility

- `ui.activeWorkspace` is stripped in Chunk 4.2 from `state/ui.js`, `persistence.js:103`, and `state-hydration.js`. Old saved sessions and share URLs that contain it are normalized away — no shim needed because the field is purely UI navigation, not musical content.
- The musical engine and chord state are untouched. Existing share URLs continue to load the same chart.

### Each chunk lands shippable

Every chunk leaves the app in a working state with `npm run validate` green. The flag means we never have a half-built surface as the default until Chunk 4.1 explicitly flips it.

## Chunked work plan

Each chunk is sized for one Sonnet session: target ≤ ~600 lines of diff, end with `npm run validate` green and a working build. The DoD list per chunk is the contract — when those bullets are true, the chunk is done.

### Phase 0 — Cruft removal

#### Chunk 0.1 — Remove Perform and its modals

**Delete:**
- `public/components/PerformWorkspace.jsx`
- `public/components/PerformanceModal.jsx`
- `public/components/PerformanceCanvas.jsx`
- `public/components/DrumPadModal.jsx`

**Edit:**
- `public/state/ui.js` — drop `'perform'` from `WORKSPACES`.
- `public/components/WorkspaceNav.jsx` — drop the `perform` entry from `WORKSPACE_META` and `WORKSPACE_ORDER`.
- `public/App.jsx` — drop the `'perform'` lazy import and render branch.
- `public/components/Modals.jsx` — drop the `performance` and `drumPad` lazy imports and AnimatedModalWrapper rows.
- `public/state/playback.js` (or wherever `playback.modals` is defined) — drop `performance` and `drumPad` keys.
- `public/types.js` — drop the corresponding modal keys from `ModalsState`. Drop unused action constants (e.g. anything only the deleted modals dispatched).
- Tests:
  - `tests/e2e/workspace-surfaces.spec.js` — strip Perform assertions.
  - Anywhere else that references Perform / DrumPad selectors.
- CSS: any `.workspace-view--perform`, `.workspace-launch-card--soloist`, drum-pad-specific classes that are now orphaned.

**Search confirm:** `grep -rn "Perform\|DrumPad\|PerformanceCanvas\|'perform'" public/ tests/ docs/` returns only intentional residue (e.g. unrelated "performance" mentions in the AudioContext sense).

**DoD:**
- Three workspaces (Arranger, Studio, Visuals) load and switch.
- `npm run validate` green.
- No dead imports, dead actions, dead state keys.

### Phase 1 — Shell scaffolding

**Preview:** append `?surface=chart` to the dev URL to activate the new shell. The choice sticks in `localStorage`; use `?surface=legacy` to revert.

#### Chunk 1.1 — `ChartSurface` skeleton + flag

**Add:**
- `public/components/ChartSurface.jsx` — three slot regions (TopBar, Chart, Rail) with placeholder content (`<div>Chart slot</div>` etc.) and the responsive grid.
- `public/css/chart-surface.css` — grid layout for desktop / tablet / phone breakpoints. Imported via `public/styles.css`.
- `public/ui-surface.js` — small helper exporting `getActiveSurface()` that reads URL param + localStorage and returns `'chart' | 'legacy'`. Default `'legacy'`.

**Edit:**
- `public/App.jsx` — call `getActiveSurface()` once on mount, branch render. Old workspace tree is still the default.
- `docs/UI_REDESIGN.md` (this file) — add a "How to preview" pointer noting `?surface=chart`.

**DoD:**
- `/?surface=chart` renders the skeleton.
- Default URL renders the existing workspace shell unchanged.
- `npm run validate` green; full Playwright green.

#### Chunk 1.2 — Extract `InstrumentRail` from Studio

**Add:**
- `public/components/InstrumentRail.jsx` — moved body of `StudioLiveMix` from `StudioWorkspace.jsx`. Accepts `orientation: 'vertical' | 'horizontal'`. Vertical produces the current Studio layout. Horizontal stacks rows in a scroll strip; that variant can ship with placeholder styling and be tightened in 2.3.

**Edit:**
- `public/components/StudioWorkspace.jsx` — becomes a thin wrapper rendering `<InstrumentRail orientation="vertical" />`.
- `public/css/components.css` (or new `instrument-rail.css`) — extract reusable selectors; add horizontal variant scaffolding.

**DoD:**
- Studio workspace looks and behaves identically (manual verification + `tests/e2e/workspace-surfaces.spec.js` and `tests/e2e/instrument-settings.spec.js`).
- `InstrumentRail` is independently importable.

### Phase 2 — Wire chart into shell

#### Chunk 2.1 — Chart slot

**Edit:**
- `public/components/ChartSurface.jsx` — replace chart placeholder with `<ChordVisualizer />`.
- `public/css/chart-surface.css` — size the chart for legibility at every breakpoint without needing maximize. Use container queries where helpful (already used elsewhere per ROADMAP item 2).

**Verify:**
- The chart fills available space cleanly on desktop, tablet, and phone.
- Section cards render and are interactive (add / delete / reorder).
- Playback works.

**DoD:**
- `/?surface=chart` shows a legible, interactive chart at all three breakpoints.
- No regressions in the legacy shell.

#### Chunk 2.2a — TopBar: Transport + Key/Time cluster

**Edit:**
- `public/components/ChartSurface.jsx` — replace TopBar placeholder with `Transport` and a `KeyTimeMenu` wrapper that anchors `KeySignatureMenuControl` + `TimeSignatureControl` behind one trigger. Both are already exported from `public/components/KeySignatureControls.jsx`.

**DoD:**
- Transport and Key/Time menu are functional in the TopBar at all breakpoints.
- `npm run validate` green.

#### Chunk 2.2b — TopBar: Edit, Share, Library

**Edit:**
- `public/components/ChartSurface.jsx` — add Edit (opens `EditorModal`) and Share (opens `ShareModal`) buttons.
- Lift `LibraryModal` out of `ArrangerWorkspace.jsx` (currently an inline wrapper ~90 lines at line 25 wrapping `PresetLibrary`) into `public/components/LibraryModal.jsx`. Wire the TopBar Library trigger to it.
- Both shells import `LibraryModal` from the new shared location during the transition.

**DoD:**
- Edit, Share, and Library all open from the new TopBar.
- `ArrangerWorkspace` still works (uses the lifted component).
- `npm run validate` green.

#### Chunk 2.2c — TopBar: Overflow menu + Visualizer toggle

**Edit:**
- `public/components/ChartSurface.jsx` — add Overflow ⋯ menu (Generate Song, Settings, Manual, SoloistSeed) and the Visualizer toggle (🌈, wired to `vizState.enabled`; full overlay deferred to Chunk 3.1 — a placeholder toggle is fine here).

**DoD:**
- Every modal/menu is reachable from the new TopBar at all breakpoints.
- Closing returns focus to the trigger (existing pattern in Studio popovers).
- `npm run validate` green.

#### Chunk 2.3 — Instrument rail mount

**Edit:**
- `public/components/ChartSurface.jsx` — mount `<InstrumentRail orientation="vertical" />` in the rail slot at desktop; `"horizontal"` at tablet and phone.
- Tighten the horizontal variant CSS so rows + Band feel + Mixer triggers fit in a bottom strip with horizontal scroll.
- Verify Controls / Mixer / Band feel popovers anchor correctly at every breakpoint, including when the rail is horizontal at the bottom edge of the viewport (anchor logic in `StudioSurface` already adapts to viewport but should be re-checked).

**DoD:**
- Full feature parity with the current Studio workspace, achievable from the chart surface without leaving the chart.
- All popovers anchor and dismiss correctly on desktop, tablet, and phone.

### Phase 3 — Visualizer demotion

#### Chunk 3.1 — On-demand visualizer overlay

**Add:**
- `public/components/VisualizerOverlay.jsx` — renders `<Visualizer />` and `<VisualizerLegend />` inside a portal overlay. On mount sets `vizState.enabled = true`, on unmount sets `false`. Esc and tap-outside dismiss.

**Edit:**
- `public/components/ChartSurface.jsx` — wire the TopBar 🌈 button to mount `VisualizerOverlay`.
- The legacy `VisualsWorkspace` stays in place until 4.2 so the legacy shell still works.

**DoD:**
- Visualizer is reachable from the chart, not loaded until requested, and dismisses cleanly.
- `vizState.enabled` reaches `true` only while the overlay is open.

### Phase 4 — Migration & cleanup

#### Chunk 4.1 — Flip default

**Edit:**
- `public/ui-surface.js` — built-in default flips from `'legacy'` to `'chart'`.
- `public/App.jsx` — no other change required; the branch already exists.
- `docs/UI_REDESIGN.md` — note the flip in the status line.

**Verify:**
- Loading `/` renders the new shell.
- `/?surface=legacy` still renders the old shell.
- All e2e specs that depended on the old shell are still green or have been updated to work against either shell. (Most should still work: state and modals are unchanged.)

**DoD:**
- New shell is the default. `npm run validate` and full Playwright green.

#### Chunk 4.2 — Delete legacy

**Delete:**
- `public/components/ArrangerWorkspace.jsx`
- `public/components/StudioWorkspace.jsx`
- `public/components/VisualsWorkspace.jsx`
- `public/components/WorkspaceNav.jsx`
- `public/components/KeySignatureControls.jsx::MaximizeChordButton` (and the `chord-maximized` body class effect in `App.jsx`).
- `public/ui-surface.js` (no longer needed once flag is removed).
- Any orphaned CSS in `public/css/layout.css`, `public/css/components.css`, `public/css/responsive.css`.

**Edit:**
- `public/state/ui.js` — remove `WORKSPACES`, `DEFAULT_WORKSPACE`, `normalizeWorkspace`, `activeWorkspace`. The slice may dissolve; update reducer/exports accordingly.
- `public/state-hydration.js` — drop activeWorkspace hydration.
- `public/persistence.js` — drop the `activeWorkspace: ui?.activeWorkspace || 'arranger'` line (`persistence.js:103`).
- `public/state/visualizer.js` (or wherever `vizState.isMaximized` lives) — remove `isMaximized`.
- `public/App.jsx` — remove the surface flag branch; render `<ChartSurface />` directly. Remove the maximize body-class effect.
- `public/types.js` — drop unused types.
- Tests:
  - Rename `tests/e2e/workspace-surfaces.spec.js` → `tests/e2e/chart-surface.spec.js` and rewrite for the new shell.
  - Update `tests/e2e/arranger.spec.js` and `tests/e2e/instrument-settings.spec.js` selectors.
  - Refresh `tests/ui/system-smoke.test.js` and `tests/ui/a11y.test.js`.
- Docs: update `CLAUDE.md` (the "four workspaces" mention), `AI.md`, `AI_MAP.md`.

**Optional polish (can land here or split):**
- Rename `.workspace-studio-surface*` → `.instrument-rail-*`. Cosmetic.

**Search confirm:** `grep -rn "activeWorkspace\|WorkspaceNav\|ArrangerWorkspace\|StudioWorkspace\|VisualsWorkspace\|MaximizeChordButton\|isMaximized\|chord-maximized\|'legacy'\|surface=" public/ tests/ docs/` returns no live references.

**DoD:**
- No legacy shell code remains.
- `npm run validate` green; full Playwright green.
- `CLAUDE.md`, `AI.md`, `AI_MAP.md` accurately describe the new shell.

### Phase 5 — Polish

#### Chunk 5.1 — Editor mobile UX

- `EditorModal` becomes a full-bleed sheet on phone (already partial; tighten).
- `SymbolMenu` becomes a sticky quick-tap row above the textarea on touch devices, with larger tap targets.
- DoD: editing a chart on a real phone is comfortable; Playwright `@mobile` smoke covers symbol insertion.

#### Chunk 5.2 — Sharing prominence

- TopBar Share button is visible at every breakpoint (not in overflow).
- After "Copy link", clear toast confirmation with the link text.
- On first load when the URL carries a chart payload, show a "Shared with you" pill in the TopBar (dismissible) so the recipient understands what they're seeing.
- DoD: share-and-receive flow is obvious end-to-end without instructions.

#### Chunk 5.3 — Responsive + a11y sweep

- Walk all three breakpoints with intent. Fix any cramped layouts.
- Run `tests/ui/a11y.test.js`. Fix violations.
- Refresh Playwright across Desktop Chrome / Mobile Chrome / Mobile Safari projects.
- DoD: no a11y regressions; all three Playwright projects green; manual smoke on real tablet looks right.

## Risks & open items

1. **Section management UX on tablet** — `SectionCard` add/delete/reorder is currently inline. Confirm during 2.1 that this still feels natural with a bottom rail; resize chart accordingly if not.
2. **Popover anchoring at the bottom edge** — `StudioSurface`'s positioning logic assumes plenty of space above and below the trigger. With a bottom-edge horizontal rail, the popover must open *upward*. Verify in 2.3.
3. **Library lift** — the `LibraryModal` defined inline in `ArrangerWorkspace.jsx` should be lifted into a shared component (`public/components/LibraryModal.jsx`) during 2.2 so both shells use it during the transition. Cheap to do.
4. **CSS rename scope** — keeping `.workspace-studio-*` is fine; renaming costs an hour and produces a cleaner map. Defer until after 4.2 unless someone wants it sooner.
5. **Test selectors using `data-workspace`/`data-id`** — the rebuild is a good moment to migrate to `data-testid` per `CLAUDE.md` guidance. Land alongside the chunk that touches each test, not as a separate refactor.

## How to preview during the rebuild

Once Chunk 1.1 lands:

- `?surface=chart` → new shell, sticky.
- `?surface=legacy` → old shell, sticky.
- No param + no `localStorage.uiSurface` → built-in default (`'legacy'` until Chunk 4.1, `'chart'` after).

Two browser tabs, one with each query string, give a side-by-side comparison.
