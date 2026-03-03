
## 2025-03-03 - PWA Update Banner Accessibility
**Learning:** Temporary or dynamic overlays like `PWAUpdateBanner.jsx` need `role="alert"` and `aria-live="polite"` to ensure screen readers actively announce their appearance, rather than requiring the user to manually discover them.
**Action:** Always add ARIA live regions to notification banners, toasts, and dynamic update components.
