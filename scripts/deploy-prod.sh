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

echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$

if [ "$DRY_RUN" = true ]; then
    echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensemble:/var/www/html/"
    echo "✅ Dry run complete."
else
    echo "🚚 Syncing to ensemble..."
    rsync -avz --delete -e ssh dist/ root@ensemble:/var/www/html/
    rm -rf dist
    # Track what's live on prod: move the deploy ref to HEAD (best-effort push to
    # origin). `git log refs/deploys/prod..HEAD` is the pending set going forward.
    # Asset hashes are baked from HEAD's short SHA (vite.config.ts) — and /deploy-prod
    # requires a clean tree, so the ref == exactly the committed bundle that's live.
    git update-ref refs/deploys/prod HEAD
    git push -q origin refs/deploys/prod 2>/dev/null || true
    echo "✅ Deployment complete!"
fi
