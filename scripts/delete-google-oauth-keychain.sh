#!/usr/bin/env bash

set -euo pipefail

KEYCHAIN_SERVICE_NAME="vymo_wishes"

delete_secret() {
  local account="$1"

  if security delete-generic-password -a "$account" -s "$KEYCHAIN_SERVICE_NAME" >/dev/null 2>&1; then
    echo "Deleted Keychain secret: $account"
  else
    echo "Keychain secret not found, skipped: $account"
  fi
}

delete_secret "vymo_wishes_slack_bot_token"
delete_secret "vymo_wishes_google_oauth_client_id"
delete_secret "vymo_wishes_google_oauth_client_secret"
delete_secret "vymo_wishes_google_oauth_refresh_token"

echo "Finished deleting Vymo Wishes Slack and Google OAuth secrets from macOS Keychain service \"$KEYCHAIN_SERVICE_NAME\"."
