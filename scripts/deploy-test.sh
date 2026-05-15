#!/bin/bash

# Deployment script for TEST environment with Bundling and Cache Busting
# Target: ensembletest:/var/www/html/

set -e

DRY_RUN=false
MINIFY=true
QUIET=false
for arg in "$@"; do
    if [[ "$arg" == "-whatif" || "$arg" == "--dry-run" ]]; then
        DRY_RUN=true
    elif [[ "$arg" == "--no-minify" ]]; then
        MINIFY=false
    elif [[ "$arg" == "--quiet" ]]; then
        QUIET=true
    fi
done

if [ "$QUIET" = false ]; then
    if [ "$DRY_RUN" = true ]; then
        echo "🚧 DRY RUN MODE: Files will be built but NOT deployed."
    fi

    if [ "$MINIFY" = true ]; then
        echo "📦 Minification ENABLED (default)."
    else
        echo "📦 Minification DISABLED."
    fi

    echo "🚀 Starting deployment to TEST (Bundled)..."
fi

MINIFY_FLAG=""
if [ "$MINIFY" = true ]; then
    MINIFY_FLAG="--minify"
fi

# 1. Get version/hash
REV=$(git rev-parse --short HEAD)
if [ "$QUIET" = false ]; then
    echo "🚀 Deployment version: $REV"
fi

# 2. Clean and create dist folder
rm -rf dist
mkdir -p dist

# 3. Bundle and Minify JavaScript
if [ "$QUIET" = false ]; then echo "📦 Bundling JavaScript..."; fi
./node_modules/.bin/esbuild public/main.ts public/logic-worker.ts public/visualizer-worker.ts --bundle $MINIFY_FLAG --sourcemap --outdir=dist --splitting --format=esm --entry-names=[name].$REV --chunk-names=chunk-[hash] --define:WORKER_PATH="'logic-worker.$REV.js'" --define:VIZ_WORKER_PATH="'visualizer-worker.$REV.js'" --jsx=automatic --jsx-import-source=preact

# 3b. Compile service worker (no bundling — sw.ts has no imports, must stay top-level)
./node_modules/.bin/esbuild public/sw.ts $MINIFY_FLAG --outfile=dist/sw.js

# 4. Bundle and Minify CSS
if [ "$QUIET" = false ]; then echo "🎨 Bundling CSS..."; fi
./node_modules/.bin/esbuild public/styles.css --bundle $MINIFY_FLAG --sourcemap --outfile=dist/styles.$REV.css

# 5. Copy static assets
if [ "$QUIET" = false ]; then echo "📄 Copying static assets..."; fi
cp public/{index.html,MANUAL.md,manifest.json,icon.svg,icon-192.png,icon-512.png} dist/

# 6. Update HTML and Service Worker
if [ "$QUIET" = false ]; then echo "🔧 Injecting hashes and manifest..."; fi
sed -i "s/styles.css/styles.$REV.css/g" dist/*.html
sed -i "s/main.js/main.$REV.js/g" dist/*.html
sed -i "s#/\* CACHE_NAME_PLACEHOLDER \*/#ensemble-test-$REV#" dist/sw.js

# Generate dynamic asset list (excluding sw and maps)
JS_FILES=$(find dist -name "*.js" -not -name "sw.js" -printf "'./%f', ")
# Remove trailing comma and space from JS_FILES
JS_FILES=${JS_FILES%, }

STATIC_ASSETS="'./', './index.html', './MANUAL.md', './styles.$REV.css', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'"
sed -i "s#/\* ASSETS_PLACEHOLDER \*/#$STATIC_ASSETS, $JS_FILES#" dist/sw.js

# 8. Report Final Footprint
if [ "$QUIET" = false ]; then
    echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
    find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$
fi

# 9. Deploy to TEST server
if [ "$DRY_RUN" = true ]; then
    if [ "$QUIET" = false ]; then
        echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/"
        echo "✅ Dry run complete."
    fi
else
    echo "🚚 Syncing to ensembletest..."
    rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/
    rm -rf dist
    echo "✅ Deployment complete!"
fi