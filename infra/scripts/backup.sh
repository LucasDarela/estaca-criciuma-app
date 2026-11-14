#!/usr/bin/env bash
# Encrypted backup of one environment: pg_dumpall (globals) + pg_dump (postgres) + Storage files,
# sent to the Oracle Object Storage as a restic snapshot. Runs as root (timer) or estaca-prod (pre-deploy).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"

require_env_arg "$@"
set_env_paths "$1"

TMP_DIR="$BASE/backup-tmp"

# On any failure ping /fail; always remove the temporary dump files.
cleanup() {
  local rc=$?
  rm -rf "$TMP_DIR"
  if [ "$rc" -ne 0 ]; then
    ping_healthchecks /fail || true
  fi
  exit "$rc"
}
trap cleanup EXIT

# 1. Refuse to start with a nearly full disk.
usage_pct="$(df --output=pcent /opt/estaca | tail -n 1 | tr -dc '0-9')"
if [ "$usage_pct" -gt 85 ]; then
  die "error: disk usage above 85%"
fi

# 2. Dumps.
rm -rf "$TMP_DIR"
mkdir -m 700 "$TMP_DIR"
PGPASSWORD="$(env_get POSTGRES_PASSWORD)" docker exec -e PGPASSWORD "$DB_CONTAINER" \
  pg_dumpall -h 127.0.0.1 -U supabase_admin --globals-only >"$TMP_DIR/globals.sql"
PGPASSWORD="$(env_get POSTGRES_PASSWORD)" docker exec -e PGPASSWORD "$DB_CONTAINER" \
  pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc >"$TMP_DIR/postgres.dump"

# 3. Encrypted snapshot (dumps + Storage files) and retention.
restic_env
summary="$(restic -o s3.bucket-lookup=path backup --json --host estaca --tag "$ENV_NAME" \
  "$TMP_DIR" "$DOCKER_DIR/volumes/storage")"
snapshot_id="$(printf '%s\n' "$summary" | jq -r 'select(.message_type == "summary") | .snapshot_id[0:8]')"
restic -o s3.bucket-lookup=path forget --host estaca --tag "$ENV_NAME" --keep-daily 30 --prune >/dev/null

# 4. Heartbeat and result.
ping_healthchecks
echo "backup ok $ENV_NAME $snapshot_id"
