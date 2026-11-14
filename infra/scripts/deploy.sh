#!/usr/bin/env bash
# Publishes a commit to one environment: migrations and Edge Functions. Never runs the seed.
# Runs as estaca-<env> (or root).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"

export USAGE_EXTRA="<git-sha>"
require_env_arg "$@"
set_env_paths "$1"
sha="${2:-}"
[ -n "$sha" ] || die "usage: deploy.sh <hml|prod> <git-sha>" 2

# 1. The commit must exist before anything changes.
[[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || die "error: unknown commit"
git -C "$APP_DIR" fetch --quiet origin || die "error: unknown commit"
git -C "$APP_DIR" cat-file -e "$sha^{commit}" 2>/dev/null || die "error: unknown commit"
git -C "$APP_DIR" checkout --quiet --force "$sha"

# 2. Production gets a backup first; a failed backup stops the deploy.
if [ "$ENV_NAME" = "prod" ]; then
  "$APP_DIR/infra/scripts/backup.sh" prod || die "error: pre-deploy backup failed"
fi

# 3. Migrations (password only in the environment of this command, not in the URL).
PGPASSWORD="$(env_get POSTGRES_PASSWORD)" supabase db push \
  --db-url "postgresql://postgres@127.0.0.1:$HOST_DB_PORT/postgres" \
  --workdir "$APP_DIR" --yes

# 4. Edge Functions: a missing or empty folder is not an error.
functions_src="$APP_DIR/supabase/functions"
if [ -d "$functions_src" ] && [ -n "$(ls -A "$functions_src")" ]; then
  rsync -a --delete --exclude main/ "$functions_src/" "$DOCKER_DIR/volumes/functions/"
  compose restart functions
else
  echo "info: no edge functions to deploy"
fi

echo "deployed $ENV_NAME $sha"
