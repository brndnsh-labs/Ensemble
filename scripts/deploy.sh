#!/usr/bin/env bash
#
# Unified deploy — build the working tree and rsync it to one environment's web
# root. Ensemble ships as static files on nginx (behind Caddy); there's no app
# server, no DB, no restart — nginx serves the new files the instant rsync ends.
#
#   ./scripts/deploy.sh <test|prod> [--dry-run] [--quiet]
#
# Prod is continuously deployed: the CI `deploy` job (.github/workflows/ci.yml)
# runs `deploy.sh prod` on every merge to main. This script is also the manual
# path for both environments; the *ceremony* lives in the SKILLS, not here:
#   /deploy-test  — low ceremony, pre-merge audition box (the private staging box).
#   /deploy-prod  — manual break-glass (CI down / forced redeploy off-pipeline).
# This script owns mechanics only — plus one hard safety guard: it refuses a PROD
# deploy from a dirty tree, so the public origin can never serve an unreviewed
# build even if the skill gate is bypassed. (CI checks out a clean tree, so the
# guard is a no-op there and a real backstop for manual laptop runs.)
#
# "What's live" is read straight off the running site: vite.config.ts bakes the
# commit rev into every asset filename (index.<REV>.js), so the deployed build is
# self-identifying and cannot drift. We curl it BEFORE (to show the true delta
# this deploy introduces, regardless of who deployed last or from where) and
# AFTER (to verify the right bundle landed). No stored deploy ref to fall stale.

set -euo pipefail

usage() {
    echo "Usage: $0 <test|prod> [--dry-run] [--quiet]"
    exit 1
}

ENV_NAME="${1:-}"
shift || true

DRY_RUN=false
QUIET=false
for arg in "$@"; do
    case "$arg" in
        -whatif | --dry-run) DRY_RUN=true ;;
        --quiet) QUIET=true ;;
        *)
            echo "Unknown option: $arg"
            usage
            ;;
    esac
done

case "$ENV_NAME" in
    test)
        MODE="test"
        RSYNC_HOST="ensembletest-admin"
        ORIGIN_URL="https://ensembletest.brndn.zip"
        LABEL="TEST"
        ICON="🚀"
        ;;
    prod)
        MODE="production"
        RSYNC_HOST="ensemble-admin"
        ORIGIN_URL="https://ensemble.brndn.zip"
        LABEL="PROD"
        ICON="🌟"
        ;;
    *)
        usage
        ;;
esac

log() { [ "$QUIET" = false ] && echo "$@"; }

# The live rev, read off the running site's asset filenames (the source of truth
# for what's actually deployed). Returns nonzero if the site or revision is unavailable.
live_rev() {
    local cache_nonce="$1"
    curl -fsS "${ORIGIN_URL}/?cb=${cache_nonce}" 2>/dev/null |
        grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' | head -1 |
        sed -E 's/^index\.//; s/\.js$//'
}

# Hard safety guard: PROD must never serve an uncommitted tree. The /deploy-prod
# skill also enforces this up front; this backs it at the one irreversible step
# now that a single script drives both environments.
if [ "$ENV_NAME" = "prod" ] && [ "$DRY_RUN" = false ]; then
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "❌ Refusing to deploy PROD from a dirty tree. Commit or stash first."
        exit 1
    fi
fi

[ "$DRY_RUN" = true ] && log "🚧 DRY RUN: build only, no deploy."
log "${ICON} Building for ${LABEL}..."

LOG_LEVEL_ARGS=()
[ "$QUIET" = true ] && LOG_LEVEL_ARGS=(--logLevel warn)
npx vite build --mode "$MODE" "${LOG_LEVEL_ARGS[@]}"

# The rev the build baked into the asset filenames — the exact identity of what
# shipped, including the `-<sig>` suffix a dirty (test-only) build appends.
BUILT_REV=$(grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' dist/index.html | head -1 | sed -E 's/^index\.//; s/\.js$//')
log "📌 Built REV: ${BUILT_REV:-unknown}"

if [ "$QUIET" = false ]; then
    echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
    find dist -type f -not -name "*.map" -exec du -ch {} + | grep total$

    # Show what this deploy actually changes vs. what's live right now.
    BEFORE_CACHE_NONCE="before-$(date +%s)"
    BEFORE_REV=$(live_rev "$BEFORE_CACHE_NONCE" || true)
    if [ -n "${BEFORE_REV:-}" ]; then
        echo "📦 Currently live on ${LABEL}: ${BEFORE_REV}"
        BEFORE_SHA="${BEFORE_REV%%-*}" # strip any dirty -<sig> suffix to a bare SHA
        if git rev-parse --verify -q "${BEFORE_SHA}^{commit}" >/dev/null; then
            PENDING=$(git log --oneline "${BEFORE_SHA}..HEAD" 2>/dev/null || true)
            if [ -n "$PENDING" ]; then
                echo "🆕 This deploy adds:"
                INDENTED_PENDING=${PENDING//$'\n'/$'\n    '}
                echo "    $INDENTED_PENDING"
            else
                echo "    (no new commits since the live build)"
            fi
        else
            echo "    (live rev isn't a local commit — can't compute the delta)"
        fi
    fi
fi

if [ "$DRY_RUN" = true ]; then
    log "🔍 (Simulated) rsync -avz --delete -e ssh dist/ ${RSYNC_HOST}:/var/www/html/"
    log "✅ Dry run complete."
    exit 0
fi

log "🚚 Syncing to ${LABEL} (scoped 'claude' account)..."
rsync -avz --delete -e ssh dist/ "${RSYNC_HOST}:/var/www/html/"

# Verify the running site now serves exactly what we built.
AFTER_CACHE_NONCE="after-$(date +%s)"
AFTER_REV=""
if ! AFTER_REV=$(live_rev "$AFTER_CACHE_NONCE"); then
    echo "❌ Deployment verification failed: couldn't read a live revision from ${ORIGIN_URL}."
    exit 1
fi
if [ -z "${AFTER_REV:-}" ]; then
    echo "❌ Deployment verification failed: ${ORIGIN_URL} returned no live revision."
    exit 1
elif [ "$AFTER_REV" = "$BUILT_REV" ]; then
    rm -rf dist
    log "✅ Verified live on ${LABEL}: ${AFTER_REV}"
else
    echo "❌ Deployment verification failed: live rev (${AFTER_REV}) != built rev (${BUILT_REV})."
    exit 1
fi
