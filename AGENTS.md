# Repository Guidelines

## Project Structure & Module Organization

Ensemble is an ultra-lightweight virtual band and generative songwriting toolkit. Core browser code lives in `public/`, with app entry points such as `public/App.tsx`, state modules in `public/state/`, and audio/visualizer logic in files like `public/midi-controller.ts` and `public/visualizer-engine.ts`. Tests are under `tests/`, grouped by purpose: `tests/ui/`, `tests/integration/`, `tests/scripts/`, `tests/standards/`, and `tests/bench/`. Utility and evaluation scripts live in `scripts/`. Documentation is in `docs/`, with README assets in `docs/assets/`.

## Build, Test, and Development Commands

- `npm run dev`: builds quietly, then serves `dist` on port `5173`.
- `npm run build`: runs the dry-run deploy build via `scripts/deploy-test.sh`.
- `npm test`: runs mutation checks, Biome linting, docs validation, and Vitest.
- `npm run test:verbose`: runs mutation checks, linting, and Vitest with normal output.
- `npm run test:e2e`: builds and runs Playwright tests.
- `npm run test:coverage`: generates Vitest coverage reports.
- `npm run validate`: runs typecheck, dependency checks, duplication checks, formatting, and tests.

## Coding Style & Naming Conventions

Use ES modules, Preact JSX, and 4-space indentation. Biome enforces formatting with single quotes and a 100-character line width. Prefer `const`, block statements, optional chaining where appropriate, and self-closing JSX elements. File names generally use kebab-case for modules (`visualizer-engine.ts`, `manual-metadata.ts`) and `.test.js` or `.test.jsx` for tests. Keep public runtime code in `public/`; avoid mixing generated reports or build output into source folders.

## Testing Guidelines

Vitest is the primary test runner, with `happy-dom` or Node-oriented tests depending on the suite. Playwright covers end-to-end behavior in `tests/e2e/`. Add or update tests near the affected area: UI tests in `tests/ui/`, musical behavior and worker coverage in `tests/integration/`, and evaluation utilities in `tests/scripts/`. Use descriptive test names that explain the behavior, not just the function under test.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit-style messages, often scoped: `feat(ui-redesign): ...`, `refactor(mobile): ...`, `chore(deps): ...`. Keep commits focused and use scopes when they clarify the subsystem. Pull requests should include a short summary, test commands run, linked issues when applicable, and screenshots or recordings for UI changes.

## Security & Configuration Tips

Do not commit secrets, local environment files, generated coverage, Playwright reports, or build artifacts. Run `npm run lint:docs` when editing documentation and `npm run knip` when adding or removing exports, dependencies, or scripts.
