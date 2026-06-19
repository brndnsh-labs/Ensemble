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

if [ "$QUIET" = false ]; then
    echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
    find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$
fi

if [ "$DRY_RUN" = true ]; then
    if [ "$QUIET" = false ]; then
        echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/"
        echo "✅ Dry run complete."
    fi
else
    echo "🚚 Syncing to ensembletest..."
    rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/
    rm -rf dist
    # Track what's live on test: move the deploy ref to HEAD (best-effort push to
    # origin so it survives a fresh clone). `git log refs/deploys/test..HEAD` is then
    # the pending set. Asset hashes are baked from HEAD's short SHA (vite.config.ts),
    # so the ref matches the deployed bundle's hash even from a dirty tree.
    git update-ref refs/deploys/test HEAD
    git push -q origin refs/deploys/test 2>/dev/null || true
    echo "✅ Deployment complete!"
fi
