# Modernization Roadmap

## High Priority

## Medium Priority
- [x] **Strict State Access (Phase 2):**
    - Refactor `public/ui.js` and remaining utility files.
    - Deprecate and remove direct exports (`playback`, etc.) from `state.js` once all consumers are updated.
    - Update test suite to strictly use `getState()` without named export fallbacks.
- [x] **Unified Test Config:**
    - Consider moving `eslint.config.js` globals definition to a dedicated `tests/.eslintrc` if the flat config allows, to keep the root config cleaner.
