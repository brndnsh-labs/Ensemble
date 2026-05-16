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
    echo "✅ Deployment complete!"
fi
