# Jules Submission Guide (Ensemble)

To ensure your PRs are accepted on the first try, you MUST adhere to the following Ensemble-specific validation workflow.

## 1. Zero-Regression Command
Before submitting, you MUST run:
```bash
npm run validate
```
This command automatically:
- Formats your code using Biome.
- Checks for direct state mutations (Strict Requirement).
- Runs the full 1,000+ logic and integration test suite.

## 2. UI & Visual Integrity
If you modified any file in `public/components/` or `public/css/`, you MUST:
1.  Run `npm run test:e2e` to check for visual regressions.
2.  If style changes were INTENTIONAL, update snapshots: `npm run test:e2e:update`.

## 3. Mandatory Checklist
Your PR description MUST include the completed checklist from `.github/pull_request_template.md`.

## 4. Pillar of the Engine
- **No Direct Mutations:** If `npm test` fails with a mutation warning, fix it using a proper `dispatch(ACTIONS.TYPE, payload)`.
- **Register Slotting:** Ensure your changes respect the interactive register slots (Bass 28-51, Chords 52-84, Soloist 60-90).
- **Musical Intent:** Comment your "why" for any generative logic offsets or probabilities.
