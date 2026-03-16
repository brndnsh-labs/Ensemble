#!/bin/bash

# Deployment script for PROD environment with Bundling and Cache Busting
# Target: ensemble:/var/www/html/

set -e

DRY_RUN=false
if [[ "$1" == "-whatif" || "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🚧 DRY RUN MODE: Files will be built but NOT deployed."
fi

echo "🌟 Starting deployment to PROD (Bundled)..."

# 1. Get version/hash
REV=$(git rev-parse --short HEAD)
echo "🚀 Deployment version: $REV"

# 2. Clean and create dist folder
rm -rf dist
mkdir -p dist

# 3. Bundle and Minify JavaScript
echo "📦 Bundling JavaScript..."
./node_modules/.bin/esbuild public/main.js public/logic-worker.js public/visualizer-worker.js --bundle --minify --sourcemap --outdir=dist --splitting --format=esm --entry-names=[name].$REV --chunk-names=chunk-[hash] --define:WORKER_PATH="'logic-worker.$REV.js'" --define:VIZ_WORKER_PATH="'visualizer-worker.$REV.js'" --jsx=automatic --jsx-import-source=preact

# 4. Bundle and Minify CSS
echo "🎨 Bundling CSS..."
./node_modules/.bin/esbuild public/styles.css --bundle --minify --sourcemap --outfile=dist/styles.$REV.css

# 5. Copy static assets
echo "📄 Copying static assets..."
cp public/{index.html,MANUAL.md,manifest.json,icon.svg,icon-192.png,icon-512.png,sw.js} dist/

# 6. Update HTML and Service Worker
echo "🔧 Injecting hashes and manifest..."
sed -i "s/styles.css/styles.$REV.css/g" dist/*.html
sed -i "s/main.js/main.$REV.js/g" dist/*.html
sed -i "s#/\* CACHE_NAME_PLACEHOLDER \*/#ensemble-$REV#" dist/sw.js

# Generate dynamic asset list (excluding sw and maps)
JS_FILES=$(find dist -name "*.js" -not -name "sw.js" -printf "'./%f', ")
# Remove trailing comma and space from JS_FILES
JS_FILES=${JS_FILES%, }

STATIC_ASSETS="'./', './index.html', './MANUAL.md', './styles.$REV.css', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'"
sed -i "s#/\* ASSETS_PLACEHOLDER \*/#$STATIC_ASSETS, $JS_FILES#" dist/sw.js

# 8. Report Final Footprint
echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$

# 9. Deploy to PROD server
if [ "$DRY_RUN" = true ]; then
    echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensemble:/var/www/html/"
    echo "✅ Dry run complete."
else
    echo "🚚 Syncing to ensemble..."
    rsync -avz --delete -e ssh dist/ root@ensemble:/var/www/html/
    rm -rf dist
    echo "✅ Deployment complete!"
fi
