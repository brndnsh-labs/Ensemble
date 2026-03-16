
## 2025-03-03 - PWA Update Banner Accessibility
**Learning:** Temporary or dynamic overlays like `PWAUpdateBanner.jsx` need `role="alert"` and `aria-live="polite"` to ensure screen readers actively announce their appearance, rather than requiring the user to manually discover them.
**Action:** Always add ARIA live regions to notification banners, toasts, and dynamic update components.

## 2025-03-04 - Modal Panel Buttons Accessible Names
**Learning:** Buttons in modal panels with decorative emojis (e.g. `📥 <span>Import Tab</span>`) may not have clear accessible names for screen readers, even with `title` attributes. Furthermore, WCAG 2.5.3 (Label in Name) requires the visible text to be part of the accessible name, meaning we shouldn't completely replace "Import XML" with "Import Lead Seed (MusicXML)" as voice control users might fail to click the button by its visible name.
**Action:** Ensure modal buttons with terse text or emojis include explicit `aria-label` attributes that fully describe their action while still containing the exact visible text, for example: `aria-label="Import XML (Lead Seed from MusicXML)"`.

## 2025-03-05 - Contextual Accessible Names for Generic Buttons
**Learning:** Generic icon-only buttons like "Settings" (⋮) in repeating or multi-panel layouts (like `InstrumentPanel` or `SectionCard`) are ambiguous to screen reader users if they all have the exact same `aria-label` (e.g. "Settings" or "Section Actions Menu"). Additionally, if they trigger menus, they need state indicators.
**Action:** Always interpolate contextual data into the `aria-label` for generic buttons (e.g. ``aria-label={`${title} Settings`}``) and include `aria-expanded` and `aria-haspopup="true"` to accurately communicate their state and function.

## 2025-02-17 - Dynamic Text and ARIA
**Learning:** Adding a static `aria-label` or `aria-pressed` to buttons with dynamically changing text (like a play/stop button with a timer) hides that critical dynamic information from screen readers.
**Action:** Only use `aria-pressed` on buttons whose accessible name/text doesn't change when toggled (e.g. icon-only instrument power buttons). Rely on the changing text for explicit state (e.g. 'START' vs 'STOP').

## 2025-03-05 - Confirm Destructive Actions
**Learning:** Destructive actions without a confirmation dialog, like "Clear All" in the Editor Modal, can lead to accidental data loss. This violates user expectations for safety, especially on mobile where fat-finger taps are common.
**Action:** Always wrap destructive single-click buttons with an inline or modal confirmation step, ensuring that the critical data clear is an explicit, deliberate user action.

## 2025-03-05 - Label Association for Form Inputs
**Learning:** Labels that are visually adjacent to inputs (like checkboxes or ranges) but lack an `htmlFor` attribute that explicitly matches the input's `id` degrade the experience for screen reader users and remove the ability to click the label to toggle/focus the input.
**Action:** Always ensure that `<label>` tags use the `htmlFor` attribute pointing directly to the `id` of their associated `<input>`, `<select>`, or `<textarea>`, even if the input is nested inside the label, to guarantee full click-target and accessibility support.

## 2024-03-12 - Alert Roles for Inline Confirmations
**Learning:** Inline confirmation dialogs replacing native window.confirm() must use role="alert" and aria-live="polite" so screen readers actively announce the destructive action warning without requiring manual focus shifts.
**Action:** Always wrap dynamic inline warning text in a container with role="alert" and aria-live="polite" when toggled.
\n## 2025-03-14 - Dynamic Overlay ARIA Roles\n**Learning:** Temporary or dynamic overlays like notification banners and inline confirmations must include `role="alert"` and `aria-live="polite"` to ensure screen readers actively announce their appearance.\n**Action:** Always add ARIA live regions to notification components like `PWAUpdateBanner.jsx` and `NotificationLayer.jsx`.

## 2026-03-15 - Double-Click Confirmations over Inline Alerts
**Learning:** When replacing native browser dialogs like `window.confirm()` with custom inline confirmation UIs, naive boolean state checks (e.g., `if (!confirmState)`) can introduce bypass bugs when multiple actionable items exist. Additionally, rendering a single alert component at the top of a scrollable container breaks usability if the triggered item is further down the page.
**Action:** Instead of creating detached alert boxes, implement a "double-click" inline confirmation pattern directly on the button itself (e.g., tracking the specific `itemId` and temporarily changing its text to 'Sure?'). This natively solves scroll position issues, maintains focus for keyboard/screen-reader users, prevents action bypasses, and requires zero custom CSS. Always apply `aria-live="polite"` to the button when its state changes.

## 2026-03-16 - Isolated Timer Cleanup in React
**Learning:** When managing timeouts in React components (e.g., for inline confirmation button resets), isolating the `clearTimeout` cleanup inside a dedicated `useEffect` with an empty dependency array `[]` ensures proper cleanup on unmount. Piggybacking on existing effects with specific dependencies (like `isListening`) can cause timers to leak or clear prematurely when those unrelated states change during the timeout window.
**Action:** Always isolate `useRef` timer cleanups in a dedicated `useEffect(() => () => clearTimeout(ref.current), [])` to avoid unintentional side effects from other component state updates.
