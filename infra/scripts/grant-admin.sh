#!/usr/bin/env bash
# Grants the admin role in "estaca" to the user with the given e-mail, audited in role_grants_log.
# One SQL statement, so it is atomic. The e-mail is never printed. Runs as estaca-<env> (or root).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"

export USAGE_EXTRA="<email>"
require_env_arg "$@"
set_env_paths "$1"
email="${2:-}"
[ -n "$email" ] || die "usage: grant-admin.sh <hml|prod> <email>" 2

result="$(db_psql postgres -v email="$email" <<'SQL'
with u as (select id from auth.users where lower(email) = lower(:'email')),
p as (select pr.id from public.profiles pr join u on u.id = pr.id),
m as (select 1 from public.memberships ms join p on p.id = ms.user_id
      where ms.unit_id = 'estaca' and ms.role = 'admin'),
ins as (insert into public.memberships (user_id, unit_id, role)
        select id, 'estaca', 'admin' from p where not exists (select 1 from m)
        returning user_id),
log as (insert into public.role_grants_log (action, user_id, unit_id, role)
        select 'granted', user_id, 'estaca', 'admin' from ins returning 1)
select case
  when not exists (select 1 from u) then 'not_found'
  when not exists (select 1 from p) then 'no_profile'
  when exists (select 1 from m) then 'already'
  else 'granted' end;
SQL
)"

case "$result" in
  not_found) die "error: no user with this email" ;;
  no_profile) die "error: user has no profile yet" ;;
  already) echo "already admin" ;;
  granted) echo "granted" ;;
  *) die "error: unexpected result" ;;
esac
