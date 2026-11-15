-- Grants admin in 'estaca' to one user, audited in role_grants_log. Run in the SQL Editor.
-- Edit the e-mail below, run, and read the "result" column. One statement, so it is atomic.
with target as (select 'pessoa@exemplo.org'::text as email),
u as (select au.id from auth.users au, target t where lower(au.email) = lower(t.email)),
p as (select pr.id, pr.home_unit_id from public.profiles pr join u on u.id = pr.id),
m as (select 1 from public.memberships ms join p on p.id = ms.user_id
      where ms.unit_id = 'estaca' and ms.role = 'admin'),
ins as (insert into public.memberships (user_id, unit_id, role)
        select id, 'estaca', 'admin' from p
        where p.home_unit_id is not null and not exists (select 1 from m)
        returning user_id),
log as (insert into public.role_grants_log (action, user_id, unit_id, role)
        select 'granted', user_id, 'estaca', 'admin' from ins returning 1)
select case
  when not exists (select 1 from u) then 'error: no user with this email'
  when not exists (select 1 from p) then 'error: user has no profile yet'
  when exists (select 1 from m) then 'already admin'
  when (select home_unit_id from p) is null then 'error: user has no home unit'
  else 'granted' end as result;
