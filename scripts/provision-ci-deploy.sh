#!/usr/bin/env bash
#
# One-time (idempotent) provisioning for CI-driven prod deploys — run from the dev
# box by a human. Creates the standing credentials the CI `deploy` job needs, which
# is deliberately NOT something the agent pipeline does on its own:
#
#   1. a scoped ed25519 deploy keypair (NOT your personal key),
#   2. its pubkey appended to claude@ensemble's authorized_keys,
#   3. the private key stored as GitHub Actions secret DEPLOY_SSH_KEY,
#   4. the deploy account name as secret DEPLOY_SSH_USER,
#   5. the box's LAN address as GitHub Actions variable PROD_DEPLOY_HOST.
#
# Usage: scripts/provision-ci-deploy.sh
#
# Prod only, on purpose: CI deploys prod and nothing else. Test deploys run from a
# laptop through the /deploy-test skill, which uses your own key — there is no CI
# path to ensembletest and therefore no credential to mint for it.
#
# Requires ssh access to the box (`ensemble-admin` alias) and an authenticated `gh`.
# Secrets are repo-level, not org-level: a Free org's org secrets don't reach all
# repos uniformly, and repo-level is the narrower grant anyway.
#
# This is also the ROTATION path — re-run any time. Each run mints a fresh keypair,
# replaces the box's authorized_keys line carrying this comment, and overwrites the
# secret, so old key material is left behind on neither side.
#
# NOTE: the CI runner reaches this box over Tailscale (it is LAN-only and a
# GitHub-hosted runner has no other route). This script provisions the SSH half
# only. The tailnet half — the tag:ci grant and the TS_OAUTH_* secrets — is
# described in homelab-maintenance `tailscale/README.md`.
set -euo pipefail

SSH_ALIAS="ensemble-admin"
REPO="${ENSEMBLE_GH_REPO:-brndnsh-labs/Ensemble}"
KEY_COMMENT="ensemble-ci-deploy-prod"

command -v gh >/dev/null || { echo "gh not found — install the GitHub CLI" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated — run 'gh auth login'" >&2; exit 1; }

KEY_DIR="$(mktemp -d)"
KEY_FILE="$KEY_DIR/id_ed25519"
trap 'rm -rf "$KEY_DIR"' EXIT

echo "==> Generating scoped deploy keypair ($KEY_COMMENT)..."
ssh-keygen -t ed25519 -N '' -C "$KEY_COMMENT" -f "$KEY_FILE" -q
PUBKEY="$(cat "$KEY_FILE.pub")"

DEPLOY_USER="$(ssh -G "$SSH_ALIAS" | awk '/^user /{print $2}')"
HOST_IP="$(ssh -G "$SSH_ALIAS" | awk '/^hostname /{print $2}')"

echo "==> Installing pubkey for $DEPLOY_USER@$HOST_IP (idempotent by comment)..."
# shellcheck disable=SC2029  # $KEY_COMMENT/$PUBKEY MUST expand client-side — the
# remote shell has no idea what key we just minted.
ssh "$SSH_ALIAS" "
  set -e
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
  sed -i '\\# $KEY_COMMENT\$#d' ~/.ssh/authorized_keys
  echo '$PUBKEY' >> ~/.ssh/authorized_keys
"

echo "==> Storing GitHub secrets on $REPO..."
gh secret set DEPLOY_SSH_KEY --repo "$REPO" < "$KEY_FILE"
gh secret set DEPLOY_SSH_USER --repo "$REPO" --body "$DEPLOY_USER"

echo "==> Storing GitHub variable PROD_DEPLOY_HOST=$HOST_IP..."
gh variable set PROD_DEPLOY_HOST --repo "$REPO" --body "$HOST_IP"

echo "==> Done. The private key was uploaded to GitHub and shredded locally."
echo "    Re-run any time to rotate. Remaining keys on the box:"
ssh "$SSH_ALIAS" 'awk "{print \"      \" \$NF}" ~/.ssh/authorized_keys'
