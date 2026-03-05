
## 2025-03-03 - PWA Update Banner Accessibility
**Learning:** Temporary or dynamic overlays like `PWAUpdateBanner.jsx` need `role="alert"` and `aria-live="polite"` to ensure screen readers actively announce their appearance, rather than requiring the user to manually discover them.
**Action:** Always add ARIA live regions to notification banners, toasts, and dynamic update components.

## 2025-03-04 - Modal Panel Buttons Accessible Names
**Learning:** Buttons in modal panels with decorative emojis (e.g. `📥 <span>Import Tab</span>`) may not have clear accessible names for screen readers, even with `title` attributes. Furthermore, WCAG 2.5.3 (Label in Name) requires the visible text to be part of the accessible name, meaning we shouldn't completely replace "Import XML" with "Import Lead Seed (MusicXML)" as voice control users might fail to click the button by its visible name.
**Action:** Ensure modal buttons with terse text or emojis include explicit `aria-label` attributes that fully describe their action while still containing the exact visible text, for example: `aria-label="Import XML (Lead Seed from MusicXML)"`.

## 2025-03-05 - Contextual Accessible Names for Generic Buttons
**Learning:** Generic icon-only buttons like "Settings" (⋮) in repeating or multi-panel layouts (like `InstrumentPanel` or `SectionCard`) are ambiguous to screen reader users if they all have the exact same `aria-label` (e.g. "Settings" or "Section Actions Menu"). Additionally, if they trigger menus, they need state indicators.
**Action:** Always interpolate contextual data into the `aria-label` for generic buttons (e.g. ``aria-label={`${title} Settings`}``) and include `aria-expanded` and `aria-haspopup="true"` to accurately communicate their state and function.
