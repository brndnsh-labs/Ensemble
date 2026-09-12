#!/usr/bin/env bash
# Runs on the static host via SSH stdin. Uploads are private until checksum-verified
# activation; compare-and-swap prevents concurrent publishers from clobbering a winner.
set -euo pipefail
action=${1:?action required}
release_root=${2:?release root required}
release_id=${3:?release ID required}
expected=${4:--}
[[ "$release_root" = /* && "$release_root" != / && "$release_root" != *..* ]] || exit 64
[[ "$release_id" =~ ^[a-f0-9]{7,40}(-[a-f0-9]+)?-[a-f0-9-]{36}$ ]] || exit 64
[[ "$expected" = - || "$expected" =~ ^\.releases/[a-f0-9]{7,40}(-[a-f0-9]+)?-[a-f0-9-]{36}$ ]] || exit 64
# Provisioning installs this marker only in the intended static root. This script
# never creates a new root or converts a legacy layout on its own.
[[ -d "$release_root" && ! -L "$release_root" ]] || exit 65
[[ $(< "$release_root/.ensemble-static-root") = ensemble-static-v1 ]] || exit 65
cd "$release_root"
[[ ! -e current || -L current ]] || { echo 'current must be a symlink' >&2; exit 65; }
[[ ! -L .releases ]] || exit 65
mkdir -p .releases
case "$action" in
    prepare)
        mkdir ".releases/$release_id"
        if [[ -L current ]]; then readlink current; else echo -; fi
        ;;
    activate)
        # Lock is shared by all callers, not merely one CI workflow.
        exec 9>.publish.lock
        flock -x 9
        current_target=-
        if [[ -L current ]]; then current_target=$(readlink current); fi
        [[ "$current_target" = "$expected" ]] || { echo 'Concurrent deployment: current changed; nothing activated' >&2; exit 75; }
        [[ -d ".releases/$release_id" && ! -L ".releases/$release_id" ]] || exit 65
        (
            cd ".releases/$release_id"
            # Receipts come from the trusted deploy artifact, never HTTP input.
            test -f index.html && test -f sw.js
            sha256sum --check --strict --quiet .ensemble-checksums
        )
        next=".next-$release_id"
        ln -s ".releases/$release_id" "$next"
        mv -Tf "$next" current
        echo "Activated $release_id (previous: $current_target)"
        ;;
    *) exit 64 ;;
esac
