#!/usr/bin/env bash
# Brings one environment (hml or prod) up: repository, upstream Supabase docker/, .env,
# containers, restic repository, backup timer. Run as root; idempotent.
# First run stops after creating .env, asking for the manual variables; run it again after filling them.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"

require_env_arg "$@"
[ "$(id -u)" -eq 0 ] || die "error: must run as root"
set_env_paths "$1"

MANUAL_VARS=(SMTP_PASS OCI_S3_ENDPOINT OCI_REGION OCI_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY HEALTHCHECKS_URL)

# as_user <command...>: runs as the environment user from its base directory.
as_user() {
  (cd "$BASE" && sudo -u "$ENV_USER" "$@")
}

# set_kv <file> <key> <value>: replaces KEY=... in place; the value never reaches argv of a child.
set_kv() {
  local tmp
  tmp="$(mktemp)"
  K="$2" V="$3" awk 'index($0, ENVIRON["K"] "=") == 1 { print ENVIRON["K"] "=" ENVIRON["V"]; next } { print }' "$1" >"$tmp"
  cat "$tmp" >"$1"
  rm -f "$tmp"
}

# 1. Base directory.
install -d -m 750 -o "$ENV_USER" -g "$ENV_USER" "$BASE"

# 2. Application repository.
if [ ! -d "$APP_DIR/.git" ]; then
  as_user git clone --quiet "$REPO_URL" "$APP_DIR"
fi

# 3. Upstream Supabase docker/ at the pinned commit.
SHA="$(tr -d '[:space:]' <"$APP_DIR/infra/supabase/VERSION")"
if [ ! -d "$SUPABASE_DIR/.git" ]; then
  as_user git clone --quiet --filter=blob:none --no-checkout "$SUPABASE_REPO_URL" "$SUPABASE_DIR"
  as_user git -C "$SUPABASE_DIR" sparse-checkout set docker
  as_user git -C "$SUPABASE_DIR" checkout --quiet "$SHA"
elif [ "$(as_user git -C "$SUPABASE_DIR" rev-parse HEAD)" != "$SHA" ]; then
  as_user git -C "$SUPABASE_DIR" fetch --quiet origin
  as_user git -C "$SUPABASE_DIR" checkout --quiet --force "$SHA"
fi

# 4. Container names: the upstream hardcodes "supabase-" in three files (idempotent).
NAME_FILES=(
  "$DOCKER_DIR/volumes/api/envoy/cds.yaml"
  "$DOCKER_DIR/volumes/api/envoy/lds.template.yaml"
  "$DOCKER_DIR/volumes/logs/vector.yml"
)
as_user sed -i "s/supabase-/estaca-${ENV_NAME}-/g" "${NAME_FILES[@]}"
if grep -q 'supabase-' "${NAME_FILES[@]}"; then
  die "error: container name rewrite incomplete"
fi

# 5. .env: generate on first run; afterwards only append variables new in the template.
TEMPLATE="$APP_DIR/infra/supabase/env.template"
if [ ! -f "$ENV_FILE" ]; then
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  cp "$TEMPLATE" "$tmpdir/.env"
  (cd "$tmpdir" && sh "$DOCKER_DIR/utils/generate-keys.sh" --update-env >/dev/null)
  set_kv "$tmpdir/.env" COMPOSE_FILE "docker-compose.yml:docker-compose.logs.yml:$APP_DIR/infra/supabase/docker-compose.override.yml"
  set_kv "$tmpdir/.env" COMPOSE_PROJECT_NAME "estaca-$ENV_NAME"
  set_kv "$tmpdir/.env" ENV_NAME "$ENV_NAME"
  set_kv "$tmpdir/.env" HOST_GW_PORT "$HOST_GW_PORT"
  set_kv "$tmpdir/.env" HOST_STUDIO_PORT "$HOST_STUDIO_PORT"
  set_kv "$tmpdir/.env" HOST_DB_PORT "$HOST_DB_PORT"
  set_kv "$tmpdir/.env" SUPABASE_PUBLIC_URL "$PUBLIC_URL"
  set_kv "$tmpdir/.env" API_EXTERNAL_URL "$PUBLIC_URL/auth/v1"
  set_kv "$tmpdir/.env" RESTIC_PASSWORD "$(openssl rand -hex 32)"
  install -m 600 -o "$ENV_USER" -g "$ENV_USER" "$tmpdir/.env" "$ENV_FILE"
else
  while IFS= read -r line; do
    name="${line%%=*}"
    if ! grep -q "^${name}=" "$ENV_FILE"; then
      printf '%s\n' "$line" >>"$ENV_FILE"
      echo "warn: added $name from env.template; review it"
    fi
  done < <(grep -E '^[A-Z][A-Z0-9_]*=' "$TEMPLATE")
fi
ln -sfn "$ENV_FILE" "$DOCKER_DIR/.env"

# 6. Manual variables.
missing=()
for var in "${MANUAL_VARS[@]}"; do
  value="$(env_get "$var")"
  if [ -z "$value" ] || [ "$value" = "fill-in-manually" ]; then
    missing+=("$var")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  list="$(printf '%s, ' "${missing[@]}")"
  die "error: fill ${list%, } in $ENV_FILE and run again"
fi

# 7. Caddy needs the anon key to inject it into the health checks.
caddy_var="${ENV_NAME^^}_ANON_KEY"
anon_key="$(env_get ANON_KEY)"
current="$(grep "^${caddy_var}=" /etc/caddy/estaca.env | cut -d= -f2- || true)"
if [ "$current" != "$anon_key" ]; then
  set_kv /etc/caddy/estaca.env "$caddy_var" "$anon_key"
  systemctl restart caddy
fi

# 8. Containers.
compose pull -q
compose up -d --wait

# 9. restic repository.
restic_env
if ! restic -o s3.bucket-lookup=path cat config >/dev/null 2>&1; then
  restic -o s3.bucket-lookup=path init
fi

# 10. hml only: migrations and the fictitious seed, once.
if [ "$ENV_NAME" = "hml" ] && [ ! -f "$BASE/.seeded" ]; then
  as_user "$APP_DIR/infra/scripts/deploy.sh" hml "$(as_user git -C "$APP_DIR" rev-parse HEAD)"
  db_psql postgres <"$APP_DIR/supabase/seed.sql"
  install -m 644 -o "$ENV_USER" -g "$ENV_USER" /dev/null "$BASE/.seeded"
fi

# 11. Backup timer.
systemctl enable --now "estaca-backup@${ENV_NAME}.timer"

# 12. Where to go next (no secrets).
echo "ready: $PUBLIC_URL"
echo "studio tunnel: ssh -L ${HOST_STUDIO_PORT}:127.0.0.1:${HOST_STUDIO_PORT} ${ENV_USER}@<host>  then open http://localhost:${HOST_STUDIO_PORT}"
