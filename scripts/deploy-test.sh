#!/usr/bin/env bash
# deploy-test — put a pushed commit on the test host, ensembletest.brndn.zip (#1358).
#
#   scripts/deploy-test.sh [branch]      # default: the current branch
#
# Since the cutover (#1357) both hosts serve the `ensemble-web` image, and a release is a
# TAG: `release <stack> web sha-<40 hex>` through the forced-command release script on
# docker04. This is the audition path for a branch before it merges:
#
#   1. The branch must be pushed and the tree clean — the image is built by CI from the
#      pushed commit, not from this checkout.
#   2. If `ensemble-web:sha-<sha>` does not exist yet, dispatch CI on the branch. Its
#      `web-image` job builds and pushes the tag (after the same `v2-checks` gate a merge
#      needs); `deploy` never releases a branch build, so nothing else moves.
#   3. Release the tag to ensembletest and check that the public `/build.json` names it.
#
# The next merge to main puts the test host back on main: the CI `deploy` job releases
# every merged commit to prod, then test.
set -euo pipefail

REPO=brndnsh-labs/Ensemble
IMAGE=brndnsh-labs/ensemble-web
ORIGIN=https://ensembletest.brndn.zip
POLL_SECONDS=60   # GitHub API hygiene: never poll faster than 30s
WAIT_MINUTES=45

branch="${1:-$(git branch --show-current)}"
[ -n "$branch" ] || { echo "deploy-test: detached HEAD — name a branch" >&2; exit 2; }

git fetch --quiet origin "$branch"
sha=$(git rev-parse "origin/$branch")
if [ "$branch" = "$(git branch --show-current)" ]; then
    [ -z "$(git status --porcelain)" ] || { echo "deploy-test: uncommitted changes — commit and push first" >&2; exit 2; }
    [ "$(git rev-parse HEAD)" = "$sha" ] || { echo "deploy-test: HEAD is not origin/$branch — push first" >&2; exit 2; }
fi
echo "==> $branch @ ${sha:0:8}"

image_exists() {
    local token
    token=$(curl -fsS "https://ghcr.io/token?scope=repository:$IMAGE:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')
    # The image is pushed with provenance off: a single OCI manifest, which an anonymous
    # probe must ask for by type or it gets a 404 that reads like "private".
    curl -fsS -o /dev/null -I \
        -H "Authorization: Bearer $token" \
        -H 'Accept: application/vnd.oci.image.manifest.v1+json' \
        "https://ghcr.io/v2/$IMAGE/manifests/sha-$sha" 2>/dev/null
}

if image_exists; then
    echo "==> ensemble-web:sha-${sha:0:8} already built"
else
    echo "==> dispatching CI on $branch to build ensemble-web:sha-${sha:0:8}"
    # Only a run created by THIS dispatch counts: an earlier dispatch of the same commit (a retry
    # after a red shard) has a finished, skipped `web-image` that would read as a failure.
    since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    gh api -X POST "repos/$REPO/actions/workflows/ci.yml/dispatches" -f ref="$branch" >/dev/null
    deadline=$(( $(date +%s) + WAIT_MINUTES * 60 ))
    run=""
    while [ -z "$run" ]; do
        sleep 30
        run=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?event=workflow_dispatch&head_sha=$sha&created=%3E%3D$since&per_page=1" \
            --jq '.workflow_runs[0].id // empty')
        [ "$(date +%s)" -lt "$deadline" ] || { echo "deploy-test: the dispatched run never appeared" >&2; exit 1; }
    done
    echo "    run https://github.com/$REPO/actions/runs/$run"
    while :; do
        state=$(gh api "repos/$REPO/actions/runs/$run/jobs?per_page=50" \
            --jq '.jobs[] | select(.name == "web-image") | "\(.status) \(.conclusion)"')
        case "$state" in
            "completed success") break ;;
            completed*) echo "deploy-test: web-image finished '$state' — see the run" >&2; exit 1 ;;
        esac
        [ "$(date +%s)" -lt "$deadline" ] || { echo "deploy-test: gave up after ${WAIT_MINUTES}m" >&2; exit 1; }
        sleep "$POLL_SECONDS"
    done
    echo "==> image built"
fi

echo "==> releasing to ensembletest"
ssh -o BatchMode=yes docker04-admin "sudo -n /usr/local/bin/ensemble-release ensembletest web sha-$sha"

for attempt in 1 2 3 4 5 6; do
    live=$(curl -fsS -H 'Cache-Control: no-cache' "$ORIGIN/build.json?deploy-test=$RANDOM" \
        | sed -nE 's/.*"sourceRevision": *"([0-9a-f]+)".*/\1/p' || true)
    if [ "$live" = "$sha" ]; then
        echo "==> live: $ORIGIN serves ${sha:0:8} ($branch)"
        exit 0
    fi
    sleep 5
done
echo "deploy-test: $ORIGIN/build.json names '${live:-nothing}', not $sha" >&2
exit 1
