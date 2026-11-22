#!/usr/bin/env bash
# Release one commit's image to one of the two sites and wait until the site says it
# serves that commit. Called by this folder's action, and by nothing else.
#
#   SHA=<commit> [ONLY_THE_TIP=true GH_TOKEN=<token>] bash release.sh <ensembletest|ensemble>
#
# ONLY_THE_TIP is how a merge releases: if main has moved on from the commit, nothing is
# released and that is not a failure, since the newer commit's run releases, or has. It is
# asked here, at the last moment, as well as when the run's turn came, because a job run
# again later keeps the answer its run was given then.
#
# "Released" means the public site names the commit in /build.json (written into the
# image by `pnpm image`), not that a command returned. The Docker host pulls the tag,
# waits for the container to be healthy and puts the previous one back if it is not.
set -euo pipefail

case "${1:-}" in
  ensembletest) origin=https://ensembletest.brndn.zip ;;
  ensemble) origin=https://ensemble.brndn.zip ;;
  *)
    echo "::error::release.sh: which site? ensembletest or ensemble" >&2
    exit 2
    ;;
esac
stack="$1"

[[ "${SHA:-}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::release.sh: SHA must be a full commit, 40 hex characters" >&2
  exit 2
}

if [[ "${ONLY_THE_TIP:-}" == true ]]; then
  tip=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha)
  if [[ "$tip" != "$SHA" ]]; then
    echo "::notice::main has moved on to $tip, so $SHA is not released to $origin: that commit's run releases."
    exit 0
  fi
fi

ssh -o BatchMode=yes ensemble-release "release $stack web sha-$SHA"

body=''
for _ in $(seq 1 10); do
  body=$(curl -sS --max-time 10 -H 'Cache-Control: no-cache' \
    "$origin/build.json?release=$SHA" 2>/dev/null || true)
  if grep -q "$SHA" <<<"$body"; then
    echo "$origin serves $SHA"
    exit 0
  fi
  sleep 6
done
echo "::error::$origin/build.json did not name $SHA: ${body:0:300}" >&2
exit 1
