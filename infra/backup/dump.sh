#!/usr/bin/env bash
# Encrypted dump of a Supabase database: roles + schema + data (+ public data only), packed as
# tar.gz and encrypted with age. Only the .tar.gz.age file is left; plain-text files are removed.
#
# usage: infra/backup/dump.sh <output-file.tar.gz.age>
# env:   DB_URL               optional, percent-encoded connection string; absent -> --linked
#        AGE_RECIPIENTS_FILE  optional, defaults to infra/backup/age-recipients.txt
set -euo pipefail

# die "message" [code]: print to stderr and exit. Never print DB_URL.
die() {
  echo "$1" >&2
  exit "${2:-1}"
}

output="${1:-}"
case "$output" in
  *.tar.gz.age) ;;
  *) die "usage: dump.sh <output-file.tar.gz.age>" 2 ;;
esac

for cmd in supabase age tar; do
  command -v "$cmd" >/dev/null 2>&1 || die "error: missing command: $cmd"
done

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
recipients="${AGE_RECIPIENTS_FILE:-$repo_root/infra/backup/age-recipients.txt}"
if [ ! -f "$recipients" ] || ! grep -q '^age1' "$recipients"; then
  die "error: no age recipient configured"
fi

# Connection source: explicit URL (local tests) or the linked project (CI).
if [ -n "${DB_URL:-}" ]; then
  src=(--db-url "$DB_URL")
else
  src=(--linked)
fi

work="$(mktemp -d)"
cleanup() {
  rm -rf "$work"
}
trap cleanup EXIT

dump() {
  supabase db dump "${src[@]}" "$@" >/dev/null 2>&1 || die "error: dump failed"
}

dump --role-only -f "$work/roles.sql"
dump -f "$work/schema.sql"
dump --data-only --use-copy -f "$work/data.sql"
dump --data-only --use-copy -s public -f "$work/data-public.sql"

if ! tar -czf - -C "$work" roles.sql schema.sql data.sql data-public.sql | age -R "$recipients" -o "$output"; then
  rm -f "$output"
  die "error: encryption failed"
fi
