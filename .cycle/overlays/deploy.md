**Environments.** Test is https://ensembletest.brndn.zip, production https://ensemble.brndn.zip. Each says what it serves at `/build.json` (the commit, written into the image by `pnpm image`).

**Test** is not deployed by hand: every merge or push to `main` runs the `ci` workflow, which builds the image, pushes it under `sha-<commit>` and releases it to the test site.

**Production** is the same workflow run by hand from the tip of `main`: `gh workflow run ci -f production=true`. It checks and builds again, releases to test, then to production. The box pulls the tag, waits for the container to be healthy and puts the previous one back if it is not. There is no data migration: the app is a static site, and what a player keeps lives in their browser.

**Preflight here.** What is live: `curl -s https://ensemble.brndn.zip/build.json`, then `git log <that commit>..origin/main --oneline`. Say whether the range touches what the app keeps in the browser or the service worker (§5): that is where a release can cost Brandon his saved charts. Check the test site already serves the tip of `main` and that anything `status:needs-ear` in the range is called out as unheard.

**Verify.** Watch the run (`gh run watch <id> -i 30`), then read `/build.json` on the public production origin yourself and confirm it names the commit. Load the site once (`node scripts/look.ts <out.png> 390x844 https://ensemble.brndn.zip`) and, for the journeys, `SMOKE_URL=https://ensemble.brndn.zip pnpm smoke`.

**Never** work on the host directly from here; the release account can run exactly one command and that is the whole path.
