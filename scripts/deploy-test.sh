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

# 5. Copy other assets
echo "📄 Copying static assets..."
cp public/index.html dist/index.html
cp public/manual.html dist/manual.html
cp public/manual-theme.js dist/manual-theme.js
cp public/manifest.json dist/manifest.json
cp public/icon.svg dist/icon.svg
cp public/icon-192.png dist/icon-192.png
cp public/icon-512.png dist/icon-512.png
cp public/sw.js dist/sw.js

# 6. Update index.html and manual.html with hashed filenames
echo "🔧 Updating index.html and manual.html..."
sed -i "s/styles.css/styles.$REV.css/" dist/index.html
sed -i "s/main.js/main.$REV.js/" dist/index.html
sed -i "s/styles.css/styles.$REV.css/" dist/manual.html

# 7. Update sw.js with hashed assets and cache name using placeholders
echo "🔧 Updating Service Worker..."
sed -i "s#/\* CACHE_NAME_PLACEHOLDER \*/#ensemble-test-$REV#" dist/sw.js

# Generate dynamic asset list based on actual generated files
echo "📝 Generating dynamic asset manifest..."
ASSETS_LIST="'./', './index.html', './manual.html', './manual-theme.js', './styles.$REV.css', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'"

while IFS= read -r file; do
    filename=$(basename "$file")
    ASSETS_LIST="$ASSETS_LIST, './$filename'"
done < <(find dist -name "*.js" -not -name "sw.js" -not -name "manual-theme.js")

sed -i "s#/\* ASSETS_PLACEHOLDER \*/#$ASSETS_LIST#" dist/sw.js

# 8. Deploy to TEST server
if [ "$DRY_RUN" = true ]; then
    echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/"
    echo "✅ Dry run complete. Artifacts available in 'dist/' for inspection."
else
    echo "🚚 Syncing to ensembletest (cleaning old files)..."
    rsync -avz --delete -e ssh dist/ root@ensembletest:/var/www/html/
    
    # 9. Cleanup
    echo "🧹 Cleaning up..."
    rm -rf dist
    echo "✅ Deployment to TEST complete!"
fi