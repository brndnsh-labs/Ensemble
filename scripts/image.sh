#!/bin/sh
# Build the app's image: the site first, then the image around it.
#   pnpm image            tags ensemble-app:<short commit> and ensemble-app:latest
set -eu
cd "$(dirname "$0")/.."
revision=$(git rev-parse HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "The tree has changes that are not committed: the image would not be the commit it is named for." >&2
  exit 1
fi
pnpm -s app:build
# What is running, for anyone who asks the server. Not in the service worker's list: it is the server's fact.
printf '{ "revision": "%s" }\n' "$revision" > packages/app/dist/build.json
docker build hosting --build-context site=packages/app/dist \
  --build-arg REVISION="$revision" \
  --tag "ensemble-app:$(git rev-parse --short HEAD)" --tag ensemble-app:latest
echo "Built ensemble-app:$(git rev-parse --short HEAD)"
