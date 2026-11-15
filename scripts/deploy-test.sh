#!/bin/sh
# Put this commit on the test site, https://ensembletest.brndn.zip (docker04).
#
# The repo has no remote, so there is no registry to pull from: the image is
# built here, loaded onto the box over SSH, and given the name the test stack's
# recipe expects. The box's own `ensemble-release` then rolls it in: it waits
# for the container to be healthy and puts the previous image back if it is
# not. Going back by hand is the same command with the previous tag, which it
# prints.
#
# Needs: docker here, and the `docker04-admin` SSH host.
set -eu
cd "$(dirname "$0")/.."
sh scripts/image.sh
revision=$(git rev-parse HEAD)
short=$(git rev-parse --short HEAD)
name="ghcr.io/brndnsh-labs/ensemble-web:sha-$revision"

docker save "ensemble-app:$short" | gzip -1 | ssh -o BatchMode=yes docker04-admin 'gunzip | sudo -n docker load'
ssh -o BatchMode=yes docker04-admin "sudo -n docker tag ensemble-app:$short $name && sudo -n /usr/local/bin/ensemble-release ensembletest web sha-$revision"

served=$(curl -s -A curl https://ensembletest.brndn.zip/build.json)
case "$served" in
  *"$revision"*) echo "The test site is serving $short." ;;
  *) echo "The test site answered: $served" >&2; exit 1 ;;
esac
SMOKE_URL=https://ensembletest.brndn.zip/ pnpm -s smoke
