# public/components/ — Preact UI (chart-first surface)

Presentational + interactive layer over the chart-first `ChartSurface` model (see root `CLAUDE.md` § UI). The section-label tap and the sticky chart-edge slot are reserved for the banked #1019 conductor lens — don't spend them on new gestures. Read this before adding a popover, modal, or CSS-toggled control.

## `useModalA11y` (`use-modal-a11y.ts`) — the shared overlay primitive

1. **Pass `{ modal: false }` for a light-dismiss popover, omit it for a true modal.** Default (`modal: true`) forces `role="dialog"` + `aria-modal="true"` + a Tab focus-trap onto `ref.current`. `ToolbarPopover`, `InstrumentRail`, `SectionCard`'s settings panel, and `InlineEditor`'s menu all pass `modal: false` and self-declare their own role — the default modal mode would wrongly mark the rest of the page inert and fight the popover's own blur/pointer dismissal.
2. **It does NOT do outside-click dismissal, in either mode.** Escape (routed through a shared document-level overlay stack so only the topmost surface closes — see the `overlayStack` comment), focus-on-open, and focus-restore are covered; click-away is still each caller's own `mousedown`/`.menu-click-away` handler.
3. **The `ref` passed in must be the panel itself, never a wrapper that also contains the trigger button** — otherwise the trigger inherits `role=dialog`/gets trapped. `SectionCard` keeps a dedicated `settingsPanelRef` on the panel, separate from the `menuRef` on the `.section-kebab-wrap` wrapper that backs its click-outside check.
4. **If you add a new callback param to the hook, thread it through a `useRef` like `onCloseRef`, not the effect's dependency array.** The effect is meant to run once per open; every caller passes an inline closure, so a callback in `useEffect` deps re-fires on every re-render — which previously re-focused the first focusable element and snapped a modal's scroll position back to the top on any content update (e.g. a stepper tick).

## `createPortal` popovers over live chart content

5. **A `position: fixed` element is still trapped by a `transform` or `isolation: isolate` ancestor** — both create a containing block independent of the viewport, so `position: fixed` no longer escapes it despite a correct `z-index`. `.lead-sheet-section-group` carries `isolation: isolate`. Portal to `document.body` via `createPortal` (`preact/compat`) — the pattern already used by `ToolbarPopover`, `InstrumentRail`, `VisualizerOverlay`, `SectionHeaderStrip`. Once portaled, outside-click detection must check the portaled element's own ref too — it's no longer a DOM descendant of the trigger.
6. **`--input-bg` is translucent by design in every theme** (a "sunken well" tint meant to layer on an already-opaque parent) — fine nested inside a modal, but a floating menu portaled directly onto the chart with nothing opaque behind it will let live chord-card text bleed through. Use `--panel-color` or `--card-bg` (both opaque, per-theme) for anything portaled to `document.body`.
7. **A `var(--custom-prop, fallback)` with an undefined `--custom-prop` fails silently to the fallback** — no console warning. Before trusting a CSS var by name, grep `public/css/variables.css` to confirm it's actually defined in every theme block, not just plausible-sounding.

## CSS specificity traps

8. **A CSS class that sets `display:` outranks the UA `[hidden]` rule.** Toggling the HTML `hidden` attribute on an element that also carries a class setting `display:` (e.g. `flex`) silently fails — the element stays visible. Pair the class with an explicit `.your-class[hidden] { display: none; }` rule (see `.grouping-toggle[hidden]` in `panels.css` for the pattern). Verify by toggling `hidden` in devtools, not just by reading the JSX.
9. **A component `input[type="number"]` rule at the same specificity as the global one in `layout.css` (0,1,1) wins or loses by CSS import order, not intent** — `styles.css`'s import list decides it, invisibly. Scope any number-input override under a container class (0,2,1+) so it wins unconditionally, and size it in real width (≥~3.4rem for 2 digits), not bare `ch` — native spinner arrows eat ~16px and a tight `ch` width clips the value while it still passes `toBeVisible()`. Guard with `boundingBox().width` + `toHaveValue()` in tests, not just visibility.

## Design tokens

10. **`--accent-color` is the brass/amber app accent, not the chords color.** The chords/primary-blue identity lives in its own token, `--chords-color`. A component that wants "the chords lane's color" and reaches for `--accent-color` will silently render brass. Instrument lane colors are mirrored two ways that must stay in sync when adding/renaming one: the CSS `--*-color` custom properties (read live via `Visualizer.tsx`'s `updateTheme()` `getComputedStyle` bridge) AND the hardcoded hex fallbacks in `visualizer-events.ts` (`VISUALIZER_TRACKS`) and the `categoryColors`/`CHORD_COLOR_FALLBACK` arrays in `visualizer-engine.ts`.
