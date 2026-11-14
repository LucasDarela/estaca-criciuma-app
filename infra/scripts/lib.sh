# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are consumed by the sourcing scripts
# Sourced by every script in infra/scripts; never executed directly.
# The caller sets `set -euo pipefail`.

REPO_URL="https://github.com/LucasDarela/estaca-criciuma-app.git"
SUPABASE_REPO_URL="https://github.com/supabase/supabase.git"

# die "error: ..." [code]
die() {
  echo "$1" >&2
  exit "${2:-1}"
}

# require_env_arg "$@": $1 must be hml or prod; extra usage args via USAGE_EXTRA.
require_env_arg() {
  case "${1:-}" in
    hml | prod) ;;
    *) die "usage: $(basename "$0") <hml|prod>${USAGE_EXTRA:+ $USAGE_EXTRA}" 2 ;;
  esac
}

# set_env_paths <hml|prod>: sets the per-environment variables below.
set_env_paths() {
  ENV_NAME="$1"
  ENV_USER="estaca-$ENV_NAME"
  BASE="/opt/estaca/$ENV_NAME"
  APP_DIR="$BASE/app"
  SUPABASE_DIR="$BASE/supabase"
  DOCKER_DIR="$SUPABASE_DIR/docker"
  ENV_FILE="$BASE/.env"
  DB_CONTAINER="estaca-$ENV_NAME-db"
  case "$ENV_NAME" in
    hml)
      HOST_GW_PORT=8100
      HOST_STUDIO_PORT=3100
      HOST_DB_PORT=5532
      PUBLIC_URL="https://api-hml.estacacriciuma.com.br"
      ;;
    prod)
      HOST_GW_PORT=8000
      HOST_STUDIO_PORT=3000
      HOST_DB_PORT=5432
      PUBLIC_URL="https://api.estacacriciuma.com.br"
      ;;
  esac
}

# env_get KEY: value from $ENV_FILE (never `source` it: JSON values break shell parsing).
env_get() {
  local value
  value="$(grep "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

compose() {
  docker compose -p "estaca-$ENV_NAME" --project-directory "$DOCKER_DIR" "$@"
}

# db_psql [database] [psql args...]: SQL on stdin; password never in argv.
db_psql() {
  PGPASSWORD="$(env_get POSTGRES_PASSWORD)" docker exec -i -e PGPASSWORD \
    "$DB_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d "${1:-postgres}" \
    -v ON_ERROR_STOP=1 -At "${@:2}"
}

# ping_healthchecks [suffix]: the URL is fed to curl on stdin, never in argv.
ping_healthchecks() {
  local url
  url="$(env_get HEALTHCHECKS_URL)"
  printf 'url = "%s%s"\n' "$url" "${1:-}" |
    curl -fsS -m 10 --retry 3 -o /dev/null -K -
}

# restic_env: exports the restic repository variables for this environment.
restic_env() {
  RESTIC_REPOSITORY="s3:$(env_get OCI_S3_ENDPOINT)/$(env_get OCI_BUCKET)/$ENV_NAME"
  RESTIC_PASSWORD="$(env_get RESTIC_PASSWORD)"
  AWS_ACCESS_KEY_ID="$(env_get AWS_ACCESS_KEY_ID)"
  AWS_SECRET_ACCESS_KEY="$(env_get AWS_SECRET_ACCESS_KEY)"
  AWS_DEFAULT_REGION="$(env_get OCI_REGION)"
  export RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
}
