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
./node_modules/.bin/esbuild public/main.js public/logic-worker.js --bundle --minify --sourcemap --outdir=dist --splitting --format=esm --entry-names=[name].$REV --chunk-names=chunk-[hash] --define:WORKER_PATH="'logic-worker.$REV.js'" --jsx=automatic --jsx-import-source=preact

# 4. Bundle and Minify CSS
echo "🎨 Bundling CSS..."
./node_modules/.bin/esbuild public/styles.css --bundle --minify --sourcemap --outfile=dist/styles.$REV.css

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
sed -i "s#/\* CACHE_NAME_PLACEHOLDER \*/#ensemble-$REV#" dist/sw.js

# Generate dynamic asset list based on actual generated files
echo "📝 Generating dynamic asset manifest..."
ASSETS_LIST="'./', './index.html', './manual.html', './manual-theme.js', './styles.$REV.css', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'"

# Find all built JS files and append them to the ASSETS_LIST
while IFS= read -r file; do
    filename=$(basename "$file")
    ASSETS_LIST="$ASSETS_LIST, './$filename'"
done < <(find dist -name "*.js" -not -name "sw.js" -not -name "manual-theme.js")

sed -i "s#/\* ASSETS_PLACEHOLDER \*/#$ASSETS_LIST#" dist/sw.js

# 8. Deploy to PROD server
if [ "$DRY_RUN" = true ]; then
    echo "🔍 (Simulated) rsync -avz --delete -e ssh dist/ root@ensemble:/var/www/html/"
    echo "✅ Dry run complete. Artifacts available in 'dist/' for inspection."
else
    echo "🚚 Syncing to ensemble (cleaning old files)..."
    rsync -avz --delete -e ssh dist/ root@ensemble:/var/www/html/
    
    # 9. Cleanup
    echo "🧹 Cleaning up..."
    rm -rf dist
    echo "✅ Deployment to PROD complete!"
fi
