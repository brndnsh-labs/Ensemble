#!/usr/bin/env bash
#
# Static deploy — build locally or consume a verified CI artifact. Test publishes
# checksum-verified releases atomically; production retains its legacy transport
# until the gated hosting cutover. This never manages the separate account API/DB.
#
#   ./scripts/deploy.sh <test|prod> [--artifact DIRECTORY] [--atomic] [--dry-run] [--quiet]
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
    echo "Usage: $0 <test|prod> [--artifact DIRECTORY] [--atomic] [--dry-run] [--quiet]"
    exit 1
}

ENV_NAME="${1:-}"
shift || true

DRY_RUN=false
QUIET=false
ATOMIC=false
ARTIFACT=""
PREBUILT=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$#" -gt 0 ]; do
    case "$1" in
        -whatif | --dry-run) DRY_RUN=true ;;
        --quiet) QUIET=true ;;
        --atomic) ATOMIC=true ;;
        --artifact)
            [ "$#" -ge 2 ] || usage
            ARTIFACT="$2"
            PREBUILT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
    shift
done

case "$ENV_NAME" in
    test)
        MODE="test"
        ATOMIC=true
        # TEST uses the shared atomic runtime on docker04 (2026-09-12).
        # Production keeps its existing LXC transport until the gated cutover.
        RSYNC_HOST="docker04-admin"
        RSYNC_PATH="/srv/ensemble-test/www/"
        # Root releases and the independent v2 preview never share upload paths.
        RSYNC_EXCLUDES=()
        ORIGIN_URL="https://ensembletest.brndn.zip"
        LABEL="TEST"
        ICON="🚀"
        ;;
    prod)
        MODE="production"
        RSYNC_HOST="ensemble-admin"
        RSYNC_PATH="/var/www/html/"
        # Deliberately empty: prod hosts no v2 preview (deploy-test.mjs has no
        # production target at all), so a stray /v2 there is drift that `--delete`
        # SHOULD clean up rather than something to protect.
        RSYNC_EXCLUDES=()
        ORIGIN_URL="https://ensemble.brndn.zip"
        LABEL="PROD"
        ICON="🌟"
        ;;
    *)
        usage
        ;;
esac

if [ "$ATOMIC" = true ]; then
    # Explicit until the operator cutover: merging tooling must not silently move
    # production away from its current LXC or grant CI Docker administration.
    RSYNC_HOST="docker04-admin"
    RSYNC_PATH="/srv/ensemble-${ENV_NAME}/www/"
    [ "$ENV_NAME" != prod ] || RSYNC_HOST="ensemble-admin"
fi

log() { if [ "$QUIET" = false ]; then echo "$@"; fi; }

# The live rev, read off the running site's asset filenames (the source of truth
# for what's actually deployed). Returns nonzero if the site or revision is unavailable.
live_rev() {
    local cache_nonce="$1"
    curl --connect-timeout 10 --max-time 30 -fsS "${ORIGIN_URL}/?cb=${cache_nonce}" 2>/dev/null |
        grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' | head -1 |
        sed -E 's/^index\.//; s/\.js$//'
}

# Hard safety guard: PROD must never serve an uncommitted tree. The /deploy-prod
# skill also enforces this up front; this backs it at the one irreversible step
# now that a single script drives both environments.
if [ "$ENV_NAME" = "prod" ] && [ "$DRY_RUN" = false ]; then
    if [ -n "$(git status --porcelain)" ]; then
        echo "❌ Refusing to deploy PROD from a dirty tree. Commit or stash first."
        exit 1
    fi
fi

[ "$DRY_RUN" = true ] && log "🚧 DRY RUN: build only, no deploy."
LOG_LEVEL_ARGS=()
[ "$QUIET" = true ] && LOG_LEVEL_ARGS=(--logLevel warn)
if [ -n "$ARTIFACT" ]; then
    ARTIFACT="$(cd "$ARTIFACT" && pwd)"
    log "${ICON} Verifying existing artifact for ${LABEL} (no rebuild)..."
    node "$SCRIPT_DIR/static-artifact.mjs" verify "$ARTIFACT" "$ENV_NAME" >/dev/null
else
    log "${ICON} Building for ${LABEL}..."
    npx vite build --mode "$MODE" "${LOG_LEVEL_ARGS[@]}"
    ARTIFACT="$(pwd)/dist"
    if [ "$ATOMIC" = true ]; then
        node "$SCRIPT_DIR/static-artifact.mjs" seal "$ARTIFACT" "$MODE" >/dev/null
        node "$SCRIPT_DIR/static-artifact.mjs" verify "$ARTIFACT" "$ENV_NAME" >/dev/null
    fi
fi

# The rev the build baked into the asset filenames — the exact identity of what
# shipped, including the `-<sig>` suffix a dirty (test-only) build appends.
BUILT_REV=$(grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' "$ARTIFACT/index.html" | head -1 | sed -E 's/^index\.//; s/\.js$//')
log "📌 Built REV: ${BUILT_REV:-unknown}"

if [ "$QUIET" = false ]; then
    echo "📊 Final Bundle Footprint (Excluding Sourcemaps):"
    find "$ARTIFACT" -type f -not -name "*.map" -exec du -ch {} + | grep total$

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
    log "🔍 Target: ${RSYNC_HOST}:${RSYNC_PATH} (atomic=$ATOMIC; artifact=$ARTIFACT)"
    log "✅ Dry run complete."
    exit 0
fi

log "🚚 Syncing to ${LABEL} (scoped 'claude' account)..."
if [ "$ATOMIC" = true ]; then
    RELEASE_ID="${BUILT_REV}-$(node -e 'console.log(require("node:crypto").randomUUID())')"
    RELEASE_ROOT="${RSYNC_PATH%/}"
    PREVIOUS=$(ssh "$RSYNC_HOST" bash -s -- prepare "$RELEASE_ROOT" "$RELEASE_ID" < "$SCRIPT_DIR/publish-static.sh")
    rsync -az --checksum -e ssh "$ARTIFACT/" "${RSYNC_HOST}:${RELEASE_ROOT}/.releases/${RELEASE_ID}/"
    ssh "$RSYNC_HOST" bash -s -- activate "$RELEASE_ROOT" "$RELEASE_ID" "$PREVIOUS" < "$SCRIPT_DIR/publish-static.sh"
else
    # A converted host MUST NOT receive the old destructive-in-place transport.
    # Check all layout sentinels, including a broken current symlink, before rsync.
    # shellcheck disable=SC2029 # Fixed allowlisted target expands locally by design.
    ssh "$RSYNC_HOST" "test ! -e '${RSYNC_PATH}.ensemble-static-root' && test ! -e '${RSYNC_PATH}.releases' && test ! -e '${RSYNC_PATH}current' && test ! -L '${RSYNC_PATH}current'" || {
        echo '❌ Refusing legacy rsync into an atomic release layout; use --atomic.' >&2
        exit 1
    }
    rsync -avz --delete "${RSYNC_EXCLUDES[@]}" -e ssh "$ARTIFACT/" "${RSYNC_HOST}:${RSYNC_PATH}"
fi

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
elif [ "$AFTER_REV" != "$BUILT_REV" ]; then
    echo "❌ Deployment verification failed: live rev (${AFTER_REV}) != built rev (${BUILT_REV})."
    exit 1
fi

# Check the ordinary URL that browsers register, without a cache-busting query:
# fresh HTML alone can hide a stale CDN worker whose precache references deleted
# bundles. Compare all bytes, not just the index revision inside its manifest.
# The Ensemble edge policy serves this mutable script with Cache-Control: no-store;
# hashed app assets and the separate sound-pack cache retain their normal policy.
SW_VERIFY_FILE=$(mktemp)
SW_HEADERS_FILE=$(mktemp)
trap 'rm -f "$SW_VERIFY_FILE" "$SW_HEADERS_FILE"' EXIT
if ! curl --connect-timeout 10 --max-time 30 -fsS \
    --dump-header "$SW_HEADERS_FILE" --output "$SW_VERIFY_FILE" "${ORIGIN_URL}/sw.js"; then
    echo "❌ Deployment verification failed: couldn't fetch the ordinary service worker URL."
    exit 1
fi
if ! cmp -s "$ARTIFACT/sw.js" "$SW_VERIFY_FILE"; then
    echo "❌ Deployment verification failed: live service worker differs from the built worker."
    exit 1
fi
if ! awk 'tolower($0) ~ /^cache-control:/ { print tolower($0) }' "$SW_HEADERS_FILE" |
    tr -d '\r' | grep -Eq '(^|[[:space:],])no-store([[:space:],]|$)'; then
    echo "❌ Deployment verification failed: service worker must have Cache-Control: no-store."
    exit 1
fi

# Keep atomic/prebuilt artifacts for inspection and promotion. Preserve the legacy
# local-build cleanup until all callers have moved to the release layout.
if [ "$ATOMIC" = false ] && [ "$PREBUILT" = false ] && [ "$ARTIFACT" = "$(pwd)/dist" ]; then
    rm -r -- "$ARTIFACT"
fi
log "✅ Verified live on ${LABEL}: ${AFTER_REV} (HTML and service worker)"
