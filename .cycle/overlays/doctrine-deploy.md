1. A PR's `build` check (`ci` workflow: check, score, smoke, image) is required on `main`; auto-merge waits for it.
2. **The merge to `main` is the release to the test site** (https://ensembletest.brndn.zip): the same workflow pushes the image and releases it, and fails unless the site's `/build.json` names the commit. A direct push to `main` (a minor docs edit) releases too.
3. **Production** (https://ensemble.brndn.zip) is `/deploy-prod`, by hand, only when Brandon has asked in this turn.
