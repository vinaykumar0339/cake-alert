#!/usr/bin/env bash

set -euo pipefail

KEYCHAIN_SERVICE_NAME="vymo_wishes"

usage() {
  cat <<'EOF'
Usage:
  SLACK_BOT_TOKEN=... \
  GOOGLE_OAUTH_CLIENT_ID=... \
  GOOGLE_OAUTH_CLIENT_SECRET=... \
  GOOGLE_OAUTH_REFRESH_TOKEN=... \
  bash scripts/setup-google-oauth-keychain.sh

This stores the Vymo Wishes Slack and Google OAuth secrets in macOS Keychain as base64-encoded values.
EOF
}

require_value() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    usage
    exit 1
  fi
}

store_secret() {
  local account="$1"
  local value="$2"

  security add-generic-password \
    -U \
    -a "$account" \
    -s "$KEYCHAIN_SERVICE_NAME" \
    -w "$(printf '%s' "$value" | base64)"
}

require_value "SLACK_BOT_TOKEN"
require_value "GOOGLE_OAUTH_CLIENT_ID"
require_value "GOOGLE_OAUTH_CLIENT_SECRET"
require_value "GOOGLE_OAUTH_REFRESH_TOKEN"

store_secret "vymo_wishes_slack_bot_token" "$SLACK_BOT_TOKEN"
store_secret "vymo_wishes_google_oauth_client_id" "$GOOGLE_OAUTH_CLIENT_ID"
store_secret "vymo_wishes_google_oauth_client_secret" "$GOOGLE_OAUTH_CLIENT_SECRET"
store_secret "vymo_wishes_google_oauth_refresh_token" "$GOOGLE_OAUTH_REFRESH_TOKEN"

echo "Stored Vymo Wishes Slack and Google OAuth secrets in macOS Keychain service \"$KEYCHAIN_SERVICE_NAME\"."
