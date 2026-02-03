## 2024-05-22 - State Hydration Validation
**Vulnerability:** Application state was hydrated directly from URL parameters without validation against allowed values (enums, ranges).
**Learning:** In "Hybrid Controller Pattern" apps where state is hydrated from URL/Storage, simple type checking is insufficient. Domain-specific validation (e.g. checking against `TIME_SIGNATURES` keys) is required before dispatching actions.
**Prevention:** Always validate external inputs against allowlists or valid ranges before dispatching state updates.

## 2025-02-17 - Local Storage Hydration Security
**Vulnerability:** Application trusted `localStorage` data implicitly, allowing potential DoS (via massive arrays) or XSS (via injected scripts) if storage was compromised.
**Learning:** Defense in depth means never trusting any external input, even from "local" sources like `localStorage`, as they can be vectors for persistent attacks or bugs.
**Prevention:** Validated all data loaded from storage in `hydrateState` using `validateSections` (caps length, sanitizes strings) and allowlist checks for enums.
