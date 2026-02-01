## 2024-05-22 - State Hydration Validation
**Vulnerability:** Application state was hydrated directly from URL parameters without validation against allowed values (enums, ranges).
**Learning:** In "Hybrid Controller Pattern" apps where state is hydrated from URL/Storage, simple type checking is insufficient. Domain-specific validation (e.g. checking against `TIME_SIGNATURES` keys) is required before dispatching actions.
**Prevention:** Always validate external inputs against allowlists or valid ranges before dispatching state updates.
