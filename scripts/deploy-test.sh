#!/bin/bash

# Deployment script for TEST environment with Bundling and Cache Busting
# Target: ensembletest:/var/www/html/

set -e

DRY_RUN=false
MINIFY=true
for arg in "$@"; do
    if [[ "$arg" == "-whatif" || "$arg" == "--dry-run" ]]; then
        DRY_RUN=true
    elif [[ "$arg" == "--no-minify" ]]; then
        MINIFY=false
    fi
done

if [ "$DRY_RUN" = true ]; then
    echo "🚧 DRY RUN MODE: Files will be built but NOT deployed."
fi

if [ "$MINIFY" = true ]; then
    echo "📦 Minification ENABLED (default)."
    MINIFY_FLAG="--minify"
else
    echo "📦 Minification DISABLED."
    MINIFY_FLAG=""
fi

echo "🚀 Starting deployment to TEST (Bundled)..."

# 1. Get version/hash
REV=$(git rev-parse --short HEAD)
echo "🚀 Deployment version: $REV"

# 2. Clean and create dist folder
rm -rf dist
mkdir -p dist

# 3. Bundle and Minify JavaScript
echo "📦 Bundling JavaScript..."
./node_modules/.bin/esbuild public/main.js public/logic-worker.js --bundle $MINIFY_FLAG --sourcemap --outdir=dist --splitting --format=esm --entry-names=[name].$REV --chunk-names=chunk-[hash] --define:WORKER_PATH="'logic-worker.$REV.js'" --jsx=automatic --jsx-import-source=preact

# 4. Bundle and Minify CSS
echo "🎨 Bundling CSS..."
./node_modules/.bin/esbuild public/styles.css --bundle $MINIFY_FLAG --sourcemap --outfile=dist/styles.$REV.css

# 5. Copy static assets
echo "📄 Copying static assets..."
cp public/{index.html,manual.html,manual-theme.js,manifest.json,icon.svg,icon-192.png,icon-512.png,sw.js} dist/

# 6. Update HTML and Service Worker
echo "🔧 Injecting hashes and manifest..."
sed -i "s/styles.css/styles.$REV.css/g" dist/*.html
sed -i "s/main.js/main.$REV.js/g" dist/*.html
sed -i "s#/\* CACHE_NAME_PLACEHOLDER \*/#ensemble-test-$REV#" dist/sw.js

# Generate dynamic asset list (excluding sw and maps)
JS_FILES=$(find dist -name "*.js" -not -name "sw.js" -not -name "manual-theme.js" -printf "'./%f', ")
# Remove trailing comma and space from JS_FILES
JS_FILES=${JS_FILES%, }

STATIC_ASSETS="'./', './index.html', './manual.html', './manual-theme.js', './styles.$REV.css', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'"
sed -i "s#/\* ASSETS_PLACEHOLDER \*/#$STATIC_ASSETS, $JS_FILES#" dist/sw.js

# 8. Report Final Footprint
echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$

# 9. Deploy to TEST server
if [ "$DRY_RUN" = true ]; then
    echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/"
    echo "✅ Dry run complete."
else
    echo "🚚 Syncing to ensembletest..."
    rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/
    rm -rf dist
    echo "✅ Deployment complete!"
fi