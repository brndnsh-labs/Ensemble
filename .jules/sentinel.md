## 2024-05-22 - State Hydration Validation
**Vulnerability:** Application state was hydrated directly from URL parameters without validation against allowed values (enums, ranges).
**Learning:** In "Hybrid Controller Pattern" apps where state is hydrated from URL/Storage, simple type checking is insufficient. Domain-specific validation (e.g. checking against `TIME_SIGNATURES` keys) is required before dispatching actions.
**Prevention:** Always validate external inputs against allowlists or valid ranges before dispatching state updates.

## 2025-02-17 - Local Storage Hydration Security
**Vulnerability:** Application trusted `localStorage` data implicitly, allowing potential DoS (via massive arrays) or XSS (via injected scripts) if storage was compromised.
**Learning:** Defense in depth means never trusting any external input, even from "local" sources like `localStorage`, as they can be vectors for persistent attacks or bugs.
**Prevention:** Validated all data loaded from storage in `hydrateState` using `validateSections` (caps length, sanitizes strings) and allowlist checks for enums.

## 2025-02-19 - Client-Side File Export Sanitization
**Vulnerability:** User-provided filenames for MIDI export were not validated or length-limited, allowing potential injection of control characters or excessively long filenames that could cause UI/filesystem issues.
**Learning:** Even for client-side downloads, inputs must be sanitized. Relying on the browser to sanitize filenames is insufficient for UX and defense-in-depth.
**Prevention:** Enforce strict allowlists (alphanumeric, safe symbols) and length limits on all user-defined filenames before processing exports.

## 2026-01-20 - Inline Script Extraction for CSP
**Vulnerability:** Inline scripts in auxiliary HTML files (like `manual.html`) prevent the application of strict Content Security Policies (CSP), leaving them vulnerable to XSS if other vectors (like `localStorage` poisoning) are exploited.
**Learning:** Even static documentation pages should have CSP if they interact with shared storage or context. Extracting inline logic to standalone JS files allows for `script-src 'self'` without `unsafe-inline`.
**Prevention:** Always place JavaScript in separate `.js` files and reference them via `src`. Apply the same strict CSP headers to all HTML entry points, not just the main app.

## 2026-05-22 - Referrer Policy Enforcement
**Vulnerability:** Default browser behavior or permissive referrer policies can leak sensitive URL parameters (like arrangement data encoded in query strings) to third-party domains via the `Referer` header.
**Learning:** Client-side applications often store state in the URL. Explicitly setting `Referrer-Policy: strict-origin-when-cross-origin` ensures that cross-origin requests (e.g., external links) only receive the origin, protecting user data privacy.
**Prevention:** Add `<meta name="referrer" content="strict-origin-when-cross-origin">` to all HTML entry points (`index.html`, `manual.html`) to enforce this policy at the client level.

## 2026-10-27 - DOM Injection via innerHTML
**Vulnerability:** Usage of `innerHTML` with dynamically formatted strings (like chord symbols) creates a potential XSS vector if input sanitization logic (e.g., regex checks) is bypassed or flawed in the future.
**Learning:** Relying on input validation alone is "defense in hope". Secure-by-design requires using APIs that automatically handle escaping, such as `textContent` or `document.createElement`.
**Prevention:** Replaced `innerHTML` usages in `ui-chord-visualizer.js` and `ui-controller.js` with safer DOM manipulation methods. Added `escapeHTML` utility for cases where HTML structure is required.

## 2026-05-25 - LocalStorage DoS Protection
**Vulnerability:** `JSON.parse` was called directly on `localStorage` values without error handling. Corrupted data (malformed JSON) caused the application to crash on startup, effectively creating a persistent Denial of Service state for the user.
**Learning:** `localStorage` is an external input source and should be treated as untrusted. Users, browser glitches, or other scripts can corrupt it.
**Prevention:** Always wrap `JSON.parse` calls involving `localStorage` (or any external input) in `try...catch` blocks and provide safe fallback values.


## 2025-02-19 - LocalStorage DoS Protection 2
**Vulnerability:** Similar to earlier finding, `JSON.parse` was still called directly on `localStorage` values without error handling in controllers and UI components (`arranger-controller.js`, `instrument-controller.js`, `PresetLibrary.jsx`). Malformed JSON could cause the application to crash or fail to load UI sections.
**Learning:** `JSON.parse` on external inputs (like `localStorage`) must be globally searched and consistently wrapped in `try...catch` blocks across the entire codebase, not just in central state hydration modules. Type validation (e.g. `Array.isArray`) is also necessary after parsing.
**Prevention:** Treat all `localStorage` reads as untrusted and wrap them in robust `try...catch` blocks with safe fallbacks and type checks.

## 2026-03-16 - Undo History JSON Parsing Protection
**Vulnerability:** The `undo` function in `history.js` parsed snapshots from the `arranger.history` stack using `JSON.parse` without error handling or type validation. Malformed or unexpected JSON data in the history could cause the application to crash or enter an invalid state when performing an undo.
**Learning:** Even internal state stacks that are ostensibly "safe" should be treated with caution if they are derived from or can be influenced by serializable data. Defense-in-depth requires robust parsing and validation at every boundary where data is deserialized.
**Prevention:** Wrapped `JSON.parse` in a `try...catch` block and added `Array.isArray` validation to ensure the restored state is valid. Gracefully handle failures by returning early to preserve the current application state.
