#!/usr/bin/env bash
# Restores a restic snapshot into a NEW database of the same environment and unpacks the Storage
# files under /opt/estaca/<env>/restore/<timestamp>/. Never touches the "postgres" database. Run as root.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"

export USAGE_EXTRA="<snapshot|latest> <target-db>"
require_env_arg "$@"
set_env_paths "$1"
snapshot="${2:-}"
target_db="${3:-}"
[ -n "$snapshot" ] && [ -n "$target_db" ] || die "usage: restore.sh <hml|prod> <snapshot|latest> <target-db>" 2

[[ "$target_db" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "error: invalid database name" 2
if [ "$target_db" = "postgres" ]; then
  die "error: target database must be new and not 'postgres'"
fi
exists="$(printf "select 1 from pg_database where datname = :'db'" | db_psql postgres -v db="$target_db")"
if [ "$exists" = "1" ]; then
  die "error: target database must be new and not 'postgres'"
fi

# 1. Fetch the snapshot.
restore_dir="$BASE/restore/$(date +%Y%m%dT%H%M%S)"
install -d -m 700 "$restore_dir"
restic_env
restic -o s3.bucket-lookup=path restore "$snapshot" --host estaca --tag "$ENV_NAME" --target "$restore_dir" >/dev/null
dump="$(find "$restore_dir" -name postgres.dump | head -n 1)"
[ -n "$dump" ] || die "error: snapshot has no postgres.dump"

# 2. New database, then restore into it.
printf 'create database "%s"' "$target_db" | db_psql postgres
if ! PGPASSWORD="$(env_get POSTGRES_PASSWORD)" docker exec -i -e PGPASSWORD "$DB_CONTAINER" \
  pg_restore -h 127.0.0.1 -U supabase_admin -d "$target_db" --no-owner <"$dump"; then
  echo "warn: pg_restore reported errors"
fi

# 3. Sanity counts.
echo "select format('units=%s profiles=%s memberships=%s', (select count(*) from public.units), (select count(*) from public.profiles), (select count(*) from public.memberships))" |
  db_psql "$target_db"
