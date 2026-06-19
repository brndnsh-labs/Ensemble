#!/bin/bash

# Deployment script for TEST environment.
# Target: ensembletest:/var/www/html/

set -e

DRY_RUN=false
QUIET=false
for arg in "$@"; do
    if [[ "$arg" == "-whatif" || "$arg" == "--dry-run" ]]; then
        DRY_RUN=true
    elif [[ "$arg" == "--quiet" ]]; then
        QUIET=true
    fi
done

if [ "$QUIET" = false ]; then
    if [ "$DRY_RUN" = true ]; then
        echo "🚧 DRY RUN MODE: Files will be built but NOT deployed."
    fi
    echo "🚀 Building for TEST..."
fi

LOG_LEVEL_FLAG=""
if [ "$QUIET" = true ]; then
    LOG_LEVEL_FLAG="--logLevel warn"
fi

npx vite build --mode test $LOG_LEVEL_FLAG

# Read the revision the build actually baked into the asset filenames
# (index.<REV>.js) straight out of the rendered HTML — this is the source of
# truth for what shipped, including the `-<sig>` suffix a dirty (uncommitted)
# build appends (vite.config.ts computeBuildRev). The verify step (and the
# deploy skill) compares the live asset hash against this exact string.
BUILT_REV=$(grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' dist/index.html | head -1 | sed -E 's/^index\.//; s/\.js$//')
echo "📌 Built REV: ${BUILT_REV:-unknown}"

if [ "$QUIET" = false ]; then
    echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
    find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$
fi

if [ "$DRY_RUN" = true ]; then
    if [ "$QUIET" = false ]; then
        echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ ensembletest-admin:/var/www/html/"
        echo "✅ Dry run complete."
    fi
else
    echo "🚚 Syncing to ensembletest (scoped 'claude' account)..."
    rsync -avz --delete -e ssh dist/ ensembletest-admin:/var/www/html/
    rm -rf dist
    # Track what's live on test: move the deploy ref to the nearest commit (HEAD),
    # best-effort pushed to origin so it survives a fresh clone. `git log
    # refs/deploys/test..HEAD` is then the pending set. NOTE: the ref tracks the
    # commit only — for a dirty (uncommitted) deploy the precise identity is the
    # printed "Built REV" (`<head>-<sig>`), not this ref. Branch + commit before
    # deploying if you want the ref to be exact.
    git update-ref refs/deploys/test HEAD
    git push -q origin refs/deploys/test 2>/dev/null || true
    echo "✅ Deployment complete!"
fi
