#!/bin/bash

# Deployment script for PROD environment.
# Target: ensemble:/var/www/html/

set -e

DRY_RUN=false
if [[ "$1" == "-whatif" || "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🚧 DRY RUN MODE: Files will be built but NOT deployed."
fi

echo "🌟 Building for PROD..."
npx vite build --mode production

# Read the revision the build baked into the asset filenames (index.<REV>.js)
# out of the rendered HTML — the source of truth for what shipped. /deploy-prod
# gates on a clean tree, so this is the bare commit short SHA; verify against it.
BUILT_REV=$(grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' dist/index.html | head -1 | sed -E 's/^index\.//; s/\.js$//')
echo "📌 Built REV: ${BUILT_REV:-unknown}"

echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$

if [ "$DRY_RUN" = true ]; then
    echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ ensemble-admin:/var/www/html/"
    echo "✅ Dry run complete."
else
    echo "🚚 Syncing to ensemble (scoped 'claude' account)..."
    rsync -avz --delete -e ssh dist/ ensemble-admin:/var/www/html/
    rm -rf dist
    # Track what's live on prod: move the deploy ref to HEAD (best-effort push to
    # origin). `git log refs/deploys/prod..HEAD` is the pending set going forward.
    # Asset hashes come from computeBuildRev (vite.config.ts) — and /deploy-prod
    # requires a clean tree, so REV is the bare commit short SHA and the ref ==
    # exactly the committed bundle that's live.
    git update-ref refs/deploys/prod HEAD
    git push -q origin refs/deploys/prod 2>/dev/null || true
    echo "✅ Deployment complete!"
fi
