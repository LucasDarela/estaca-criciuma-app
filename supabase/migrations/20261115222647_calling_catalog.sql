-- roles-of-leadership: the calling catalog (RF-01 to RF-07) and its audit log.
-- Seeded with appendix A of the spec (128 callings, 3 languages). Writes go only through
-- save_calling, which is admin-only and logs every change in the same transaction.

create table public.calling_catalog (
  id text primary key,
  name_pt text not null check (char_length(btrim(name_pt)) between 2 and 80),
  name_en text null check (name_en is null or char_length(btrim(name_en)) between 1 and 80),
  name_es text null check (name_es is null or char_length(btrim(name_es)) between 1 and 80),
  level text not null check (level in ('stake', 'ward', 'branch', 'ward_branch')),
  access text not null default 'none'
    check (access in ('none', 'unit_publisher', 'unit_leader', 'stake_publisher', 'stake_leader')),
  notify_group text null check (notify_group in ('stake_presidency', 'high_council', 'bishoprics',
    'elders_quorum_presidency', 'relief_society_presidency', 'young_women_presidency',
    'primary_presidency', 'sunday_school_presidency', 'clerks', 'missionaries',
    'temple_family_history_workers', 'music', 'young_single_adult_leaders')),
  org_chart_section text null check (org_chart_section in ('stake_presidency', 'high_council',
    'stake_clerks', 'stake_organizations', 'bishopric', 'unit_clerks', 'unit_organizations')),
  sort_order int not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  -- RF-02: the access and the section must fit the level.
  constraint calling_access_matches_level check (
    access = 'none'
    or (access in ('stake_publisher', 'stake_leader') and level = 'stake')
    or (access in ('unit_publisher', 'unit_leader') and level <> 'stake')),
  constraint calling_section_matches_level check (
    org_chart_section is null
    or (org_chart_section in ('stake_presidency', 'high_council', 'stake_clerks', 'stake_organizations'))
       = (level = 'stake'))
);
create unique index calling_catalog_level_name_key on public.calling_catalog (level, lower(name_pt));
create trigger calling_catalog_set_updated_at before update on public.calling_catalog
  for each row execute function public.set_updated_at();

-- No foreign keys on purpose: the trail outlives any change to the catalog.
create table public.calling_catalog_log (
  id uuid primary key default gen_random_uuid(),
  calling_id text not null,
  actor_id uuid null,
  before jsonb null,
  after jsonb not null,
  created_at timestamptz not null default now()
);
create index calling_catalog_log_calling_idx on public.calling_catalog_log (calling_id, created_at desc);

alter table public.calling_catalog enable row level security;
alter table public.calling_catalog_log enable row level security;

-- RF-06: public read of the active callings; the admin reads the inactive ones too.
create policy calling_catalog_select on public.calling_catalog for select to anon, authenticated
  using (active or is_admin());
create policy calling_catalog_log_select on public.calling_catalog_log for select to authenticated
  using (is_admin());

-- Defense in depth: no direct write privilege at all (a missing policy would only hide the rows).
revoke insert, update, delete, truncate on public.calling_catalog from anon, authenticated;
revoke insert, update, delete, truncate on public.calling_catalog_log from anon, authenticated;

-- RF-06, RF-07. p_id null creates a calling. Returns the calling id. Error codes go in `message`
-- (errcode P0001), like the auth-account RPCs. Migration member_calls replaces this function
-- with the version that also refuses to change a calling somebody holds.
create function public.save_calling(
  p_id text, p_name_pt text, p_name_en text, p_name_es text, p_level text, p_access text,
  p_notify_group text, p_org_chart_section text, p_active boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text := p_id;
  v_name_pt text := nullif(btrim(coalesce(p_name_pt, '')), '');
  v_name_en text := nullif(btrim(coalesce(p_name_en, '')), '');
  v_name_es text := nullif(btrim(coalesce(p_name_es, '')), '');
  v_active boolean := coalesce(p_active, true);
  v_old public.calling_catalog%rowtype;
  v_new public.calling_catalog%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not is_admin() then raise exception 'not_authorized' using errcode = 'P0001'; end if;

  if v_name_pt is null or char_length(v_name_pt) not between 2 and 80
     or char_length(coalesce(v_name_en, '')) > 80 or char_length(coalesce(v_name_es, '')) > 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_level is null or p_level not in ('stake', 'ward', 'branch', 'ward_branch') then
    raise exception 'invalid_level' using errcode = 'P0001';
  end if;
  if p_access is null or p_access not in
       ('none', 'unit_publisher', 'unit_leader', 'stake_publisher', 'stake_leader')
     or (p_access in ('stake_publisher', 'stake_leader') and p_level <> 'stake')
     or (p_access in ('unit_publisher', 'unit_leader') and p_level = 'stake') then
    raise exception 'invalid_access' using errcode = 'P0001';
  end if;
  if p_org_chart_section is not null and (
       p_org_chart_section not in ('stake_presidency', 'high_council', 'stake_clerks',
         'stake_organizations', 'bishopric', 'unit_clerks', 'unit_organizations')
       or (p_org_chart_section in ('stake_presidency', 'high_council', 'stake_clerks',
         'stake_organizations')) <> (p_level = 'stake')) then
    raise exception 'invalid_section' using errcode = 'P0001';
  end if;
  if p_notify_group is not null and p_notify_group not in ('stake_presidency', 'high_council',
       'bishoprics', 'elders_quorum_presidency', 'relief_society_presidency',
       'young_women_presidency', 'primary_presidency', 'sunday_school_presidency', 'clerks',
       'missionaries', 'temple_family_history_workers', 'music', 'young_single_adult_leaders') then
    raise exception 'invalid_notify_group' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from calling_catalog c
    where c.level = p_level and lower(c.name_pt) = lower(v_name_pt) and c.id <> coalesce(v_id, '')) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;

  if v_id is not null then
    select * into v_old from calling_catalog c where c.id = v_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

    update calling_catalog c set
      name_pt = v_name_pt, name_en = v_name_en, name_es = v_name_es, level = p_level,
      access = p_access, notify_group = p_notify_group, org_chart_section = p_org_chart_section,
      active = v_active, updated_by = auth.uid()
    where c.id = v_id
    returning * into v_new;
  else
    v_id := gen_random_uuid()::text;
    insert into calling_catalog (id, name_pt, name_en, name_es, level, access, notify_group,
      org_chart_section, sort_order, active, updated_by)
    values (v_id, v_name_pt, v_name_en, v_name_es, p_level, p_access, p_notify_group,
      p_org_chart_section, (select coalesce(max(c.sort_order), 0) + 10 from calling_catalog c),
      v_active, auth.uid())
    returning * into v_new;
  end if;

  insert into calling_catalog_log (calling_id, actor_id, before, after)
  values (v_id, auth.uid(),
          case when v_old.id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
  return v_id;
end;
$$;

revoke all on function public.save_calling(text, text, text, text, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.save_calling(text, text, text, text, text, text, text, text, boolean)
  to authenticated;

insert into public.calling_catalog
  (id, name_pt, name_en, name_es, level, access, notify_group, org_chart_section, sort_order)
values
  ('stake_president', 'Presidente da Estaca', 'Stake President', 'Presidente de estaca', 'stake', 'stake_leader', 'stake_presidency', 'stake_presidency', 10),
  ('stake_first_counselor', 'Primeiro Conselheiro na Presidência da Estaca', 'Stake Presidency First Counselor', 'Primer consejero de la presidencia de estaca', 'stake', 'stake_leader', 'stake_presidency', 'stake_presidency', 20),
  ('stake_second_counselor', 'Segundo Conselheiro na Presidência da Estaca', 'Stake Presidency Second Counselor', 'Segundo consejero de la presidencia de estaca', 'stake', 'stake_leader', 'stake_presidency', 'stake_presidency', 30),
  ('stake_patriarch', 'Patriarca da Estaca', 'Stake Patriarch', 'Patriarca de estaca', 'stake', 'none', null, 'stake_presidency', 40),
  ('high_councilor', 'Sumo Conselheiro', 'High Councilor', 'Sumo consejero', 'stake', 'stake_leader', 'high_council', 'high_council', 50),
  ('stake_executive_secretary', 'Secretário Executivo da Estaca', 'Stake Executive Secretary', 'Secretario ejecutivo de estaca', 'stake', 'stake_leader', 'clerks', 'stake_clerks', 60),
  ('stake_assistant_executive_secretary', 'Secretário Executivo Adjunto da Estaca', 'Stake Assistant Executive Secretary', 'Secretario ejecutivo asistente de estaca', 'stake', 'stake_leader', 'clerks', 'stake_clerks', 70),
  ('stake_clerk', 'Secretário da Estaca', 'Stake Clerk', 'Secretario de estaca', 'stake', 'stake_leader', 'clerks', 'stake_clerks', 80),
  ('stake_assistant_clerk', 'Secretário Adjunto da Estaca', 'Stake Assistant Clerk', 'Secretario asistente de estaca', 'stake', 'stake_leader', 'clerks', 'stake_clerks', 90),
  ('stake_auditor', 'Auditor da Estaca', 'Stake Auditor', 'Auditor de estaca', 'stake', 'none', null, null, 100),
  ('stake_relief_society_president', 'Presidente da Sociedade de Socorro da Estaca', 'Stake Relief Society President', 'Presidenta de la Sociedad de Socorro de estaca', 'stake', 'stake_publisher', 'relief_society_presidency', 'stake_organizations', 110),
  ('stake_relief_society_counselor_1', 'Primeira Conselheira na Presidência da Sociedade de Socorro da Estaca', 'Stake Relief Society First Counselor', 'Primera consejera de la presidencia de la Sociedad de Socorro de estaca', 'stake', 'stake_publisher', 'relief_society_presidency', 'stake_organizations', 120),
  ('stake_relief_society_counselor_2', 'Segunda Conselheira na Presidência da Sociedade de Socorro da Estaca', 'Stake Relief Society Second Counselor', 'Segunda consejera de la presidencia de la Sociedad de Socorro de estaca', 'stake', 'stake_publisher', 'relief_society_presidency', 'stake_organizations', 130),
  ('stake_relief_society_secretary', 'Secretária da Sociedade de Socorro da Estaca', 'Stake Relief Society Secretary', 'Secretaria de la Sociedad de Socorro de estaca', 'stake', 'none', 'relief_society_presidency', 'stake_organizations', 140),
  ('stake_young_women_president', 'Presidente das Moças da Estaca', 'Stake Young Women President', 'Presidenta de las Mujeres Jóvenes de estaca', 'stake', 'stake_publisher', 'young_women_presidency', 'stake_organizations', 150),
  ('stake_young_women_counselor_1', 'Primeira Conselheira na Presidência das Moças da Estaca', 'Stake Young Women First Counselor', 'Primera consejera de la presidencia de las Mujeres Jóvenes de estaca', 'stake', 'stake_publisher', 'young_women_presidency', 'stake_organizations', 160),
  ('stake_young_women_counselor_2', 'Segunda Conselheira na Presidência das Moças da Estaca', 'Stake Young Women Second Counselor', 'Segunda consejera de la presidencia de las Mujeres Jóvenes de estaca', 'stake', 'stake_publisher', 'young_women_presidency', 'stake_organizations', 170),
  ('stake_young_women_secretary', 'Secretária das Moças da Estaca', 'Stake Young Women Secretary', 'Secretaria de las Mujeres Jóvenes de estaca', 'stake', 'none', 'young_women_presidency', 'stake_organizations', 180),
  ('stake_primary_president', 'Presidente da Primária da Estaca', 'Stake Primary President', 'Presidenta de la Primaria de estaca', 'stake', 'stake_publisher', 'primary_presidency', 'stake_organizations', 190),
  ('stake_primary_counselor_1', 'Primeira Conselheira na Presidência da Primária da Estaca', 'Stake Primary First Counselor', 'Primera consejera de la presidencia de la Primaria de estaca', 'stake', 'stake_publisher', 'primary_presidency', 'stake_organizations', 200),
  ('stake_primary_counselor_2', 'Segunda Conselheira na Presidência da Primária da Estaca', 'Stake Primary Second Counselor', 'Segunda consejera de la presidencia de la Primaria de estaca', 'stake', 'stake_publisher', 'primary_presidency', 'stake_organizations', 210),
  ('stake_primary_secretary', 'Secretária da Primária da Estaca', 'Stake Primary Secretary', 'Secretaria de la Primaria de estaca', 'stake', 'none', 'primary_presidency', 'stake_organizations', 220),
  ('stake_young_men_president', 'Presidente dos Rapazes da Estaca', 'Stake Young Men President', 'Presidente de los Hombres Jóvenes de estaca', 'stake', 'none', null, 'stake_organizations', 230),
  ('stake_young_men_counselor', 'Conselheiro na Presidência dos Rapazes da Estaca', 'Stake Young Men Counselor', 'Consejero de la presidencia de los Hombres Jóvenes de estaca', 'stake', 'none', null, 'stake_organizations', 240),
  ('stake_young_men_secretary', 'Secretário dos Rapazes da Estaca', 'Stake Young Men Secretary', 'Secretario de los Hombres Jóvenes de estaca', 'stake', 'none', null, 'stake_organizations', 250),
  ('stake_sunday_school_president', 'Presidente da Escola Dominical da Estaca', 'Stake Sunday School President', 'Presidente de la Escuela Dominical de estaca', 'stake', 'none', 'sunday_school_presidency', 'stake_organizations', 260),
  ('stake_sunday_school_counselor', 'Conselheiro na Presidência da Escola Dominical da Estaca', 'Stake Sunday School Counselor', 'Consejero de la presidencia de la Escuela Dominical de estaca', 'stake', 'none', 'sunday_school_presidency', 'stake_organizations', 270),
  ('stake_sunday_school_secretary', 'Secretário da Escola Dominical da Estaca', 'Stake Sunday School Secretary', 'Secretario de la Escuela Dominical de estaca', 'stake', 'none', 'sunday_school_presidency', 'stake_organizations', 280),
  ('stake_seminary_institute_supervisor', 'Supervisor do Seminário e Instituto da Estaca', 'Stake Seminary and Institute Supervisor', 'Supervisor de Seminarios e Institutos de estaca', 'stake', 'none', null, null, 290),
  ('seminary_teacher', 'Professor do Seminário', 'Seminary Teacher', 'Maestro de seminario', 'stake', 'none', null, null, 300),
  ('institute_teacher', 'Professor do Instituto', 'Institute Teacher', 'Maestro de instituto', 'stake', 'none', null, null, 310),
  ('stake_temple_fh_lead_consultant', 'Consultor Líder de Templo e História da Família da Estaca', 'Stake Temple and Family History Lead Consultant', 'Consultor líder de la obra del templo e historia familiar de estaca', 'stake', 'none', 'temple_family_history_workers', null, 320),
  ('stake_temple_fh_consultant', 'Consultor de Templo e História da Família da Estaca', 'Stake Temple and Family History Consultant', 'Consultor de la obra del templo e historia familiar de estaca', 'stake', 'none', 'temple_family_history_workers', null, 330),
  ('familysearch_center_director', 'Diretor do Centro do FamilySearch', 'FamilySearch Center Director', 'Director del centro FamilySearch', 'stake', 'none', 'temple_family_history_workers', null, 340),
  ('familysearch_center_consultant', 'Consultor do Centro do FamilySearch', 'FamilySearch Center Consultant', 'Consultor del centro FamilySearch', 'stake', 'none', 'temple_family_history_workers', null, 350),
  ('stake_music_coordinator', 'Coordenador de Música da Estaca', 'Stake Music Coordinator', 'Coordinador de música de estaca', 'stake', 'none', 'music', null, 360),
  ('stake_organist', 'Organista ou Pianista da Estaca', 'Stake Organist or Pianist', 'Organista o pianista de estaca', 'stake', 'none', 'music', null, 370),
  ('stake_choir_director', 'Regente de Coro da Estaca', 'Stake Choir Director', 'Director del coro de estaca', 'stake', 'none', 'music', null, 380),
  ('stake_communication_director', 'Diretor de Comunicação da Estaca', 'Stake Communication Director', 'Director de comunicaciones de estaca', 'stake', 'stake_publisher', null, null, 390),
  ('stake_assistant_communication_director', 'Diretor Adjunto de Comunicação da Estaca', 'Stake Assistant Communication Director', 'Director asistente de comunicaciones de estaca', 'stake', 'none', null, null, 400),
  ('stake_self_reliance_specialist', 'Especialista de Autossuficiência da Estaca', 'Stake Self-Reliance Specialist', 'Especialista de autosuficiencia de estaca', 'stake', 'none', null, null, 410),
  ('stake_welfare_specialist', 'Especialista de Bem-Estar da Estaca', 'Stake Welfare Specialist', 'Especialista de bienestar de estaca', 'stake', 'none', null, null, 420),
  ('stake_justserve_coordinator', 'Coordenador do JustServe da Estaca', 'Stake JustServe Coordinator', 'Coordinador de JustServe de estaca', 'stake', 'none', null, null, 430),
  ('stake_ysa_committee_leader', 'Líder do Comitê de Jovens Adultos Solteiros da Estaca', 'Stake Young Single Adult Committee Leader', 'Líder del comité de jóvenes adultos solteros de estaca', 'stake', 'none', 'young_single_adult_leaders', null, 440),
  ('stake_sa_committee_leader', 'Líder do Comitê de Adultos Solteiros da Estaca', 'Stake Single Adult Committee Leader', 'Líder del comité de adultos solteros de estaca', 'stake', 'none', null, null, 450),
  ('stake_technology_specialist', 'Especialista de Tecnologia da Estaca', 'Stake Technology Specialist', 'Especialista de tecnología de estaca', 'stake', 'none', null, null, 460),
  ('stake_building_representative', 'Representante de Capelas da Estaca', 'Stake Building Representative', 'Representante de edificios de estaca', 'stake', 'none', null, null, 470),
  ('stake_activities_coordinator', 'Coordenador de Esportes e Atividades da Estaca', 'Stake Sports and Activities Coordinator', 'Coordinador de deportes y actividades de estaca', 'stake', 'none', null, null, 480),
  ('stake_service_missionary', 'Missionário de Serviço da Estaca', 'Stake Service Missionary', 'Misionero de servicio de estaca', 'stake', 'none', 'missionaries', null, 490),
  ('bishop', 'Bispo', 'Bishop', 'Obispo', 'ward', 'unit_leader', 'bishoprics', 'bishopric', 500),
  ('bishopric_first_counselor', 'Primeiro Conselheiro no Bispado', 'Bishopric First Counselor', 'Primer consejero del obispado', 'ward', 'unit_leader', 'bishoprics', 'bishopric', 510),
  ('bishopric_second_counselor', 'Segundo Conselheiro no Bispado', 'Bishopric Second Counselor', 'Segundo consejero del obispado', 'ward', 'unit_leader', 'bishoprics', 'bishopric', 520),
  ('branch_president', 'Presidente do Ramo', 'Branch President', 'Presidente de rama', 'branch', 'unit_leader', 'bishoprics', 'bishopric', 530),
  ('branch_first_counselor', 'Primeiro Conselheiro na Presidência do Ramo', 'Branch Presidency First Counselor', 'Primer consejero de la presidencia de rama', 'branch', 'unit_leader', 'bishoprics', 'bishopric', 540),
  ('branch_second_counselor', 'Segundo Conselheiro na Presidência do Ramo', 'Branch Presidency Second Counselor', 'Segundo consejero de la presidencia de rama', 'branch', 'unit_leader', 'bishoprics', 'bishopric', 550),
  ('unit_executive_secretary', 'Secretário Executivo', 'Executive Secretary', 'Secretario ejecutivo', 'ward_branch', 'unit_leader', 'clerks', 'unit_clerks', 560),
  ('unit_assistant_executive_secretary', 'Secretário Executivo Adjunto', 'Assistant Executive Secretary', 'Secretario ejecutivo asistente', 'ward_branch', 'unit_leader', 'clerks', 'unit_clerks', 570),
  ('unit_clerk', 'Secretário', 'Clerk', 'Secretario', 'ward_branch', 'unit_leader', 'clerks', 'unit_clerks', 580),
  ('unit_assistant_clerk', 'Secretário Adjunto', 'Assistant Clerk', 'Secretario asistente', 'ward_branch', 'unit_leader', 'clerks', 'unit_clerks', 590),
  ('elders_quorum_president', 'Presidente do Quórum de Élderes', 'Elders Quorum President', 'Presidente del cuórum de élderes', 'ward_branch', 'unit_publisher', 'elders_quorum_presidency', 'unit_organizations', 600),
  ('elders_quorum_counselor_1', 'Primeiro Conselheiro na Presidência do Quórum de Élderes', 'Elders Quorum First Counselor', 'Primer consejero de la presidencia del cuórum de élderes', 'ward_branch', 'none', 'elders_quorum_presidency', 'unit_organizations', 610),
  ('elders_quorum_counselor_2', 'Segundo Conselheiro na Presidência do Quórum de Élderes', 'Elders Quorum Second Counselor', 'Segundo consejero de la presidencia del cuórum de élderes', 'ward_branch', 'none', 'elders_quorum_presidency', 'unit_organizations', 620),
  ('elders_quorum_secretary', 'Secretário do Quórum de Élderes', 'Elders Quorum Secretary', 'Secretario del cuórum de élderes', 'ward_branch', 'none', 'elders_quorum_presidency', 'unit_organizations', 630),
  ('elders_quorum_assistant_secretary', 'Secretário Adjunto do Quórum de Élderes', 'Elders Quorum Assistant Secretary', 'Secretario asistente del cuórum de élderes', 'ward_branch', 'none', null, null, 640),
  ('elders_quorum_instructor', 'Instrutor do Quórum de Élderes', 'Elders Quorum Instructor', 'Instructor del cuórum de élderes', 'ward_branch', 'none', null, null, 650),
  ('elders_quorum_service_coordinator', 'Coordenador de Serviço do Quórum de Élderes', 'Elders Quorum Service Coordinator', 'Coordinador de servicio del cuórum de élderes', 'ward_branch', 'none', null, null, 660),
  ('relief_society_president', 'Presidente da Sociedade de Socorro', 'Relief Society President', 'Presidenta de la Sociedad de Socorro', 'ward_branch', 'unit_publisher', 'relief_society_presidency', 'unit_organizations', 670),
  ('relief_society_counselor_1', 'Primeira Conselheira na Presidência da Sociedade de Socorro', 'Relief Society First Counselor', 'Primera consejera de la presidencia de la Sociedad de Socorro', 'ward_branch', 'none', 'relief_society_presidency', 'unit_organizations', 680),
  ('relief_society_counselor_2', 'Segunda Conselheira na Presidência da Sociedade de Socorro', 'Relief Society Second Counselor', 'Segunda consejera de la presidencia de la Sociedad de Socorro', 'ward_branch', 'none', 'relief_society_presidency', 'unit_organizations', 690),
  ('relief_society_secretary', 'Secretária da Sociedade de Socorro', 'Relief Society Secretary', 'Secretaria de la Sociedad de Socorro', 'ward_branch', 'none', 'relief_society_presidency', 'unit_organizations', 700),
  ('relief_society_assistant_secretary', 'Secretária Adjunta da Sociedade de Socorro', 'Relief Society Assistant Secretary', 'Secretaria asistente de la Sociedad de Socorro', 'ward_branch', 'none', null, null, 710),
  ('relief_society_teacher', 'Professora da Sociedade de Socorro', 'Relief Society Teacher', 'Maestra de la Sociedad de Socorro', 'ward_branch', 'none', null, null, 720),
  ('relief_society_service_coordinator', 'Coordenadora de Serviço da Sociedade de Socorro', 'Relief Society Service Coordinator', 'Coordinadora de servicio de la Sociedad de Socorro', 'ward_branch', 'none', null, null, 730),
  ('priests_quorum_first_assistant', 'Primeiro Assistente do Presidente do Quórum de Sacerdotes', 'Priests Quorum First Assistant', 'Primer asistente del presidente del cuórum de presbíteros', 'ward_branch', 'none', null, null, 740),
  ('priests_quorum_second_assistant', 'Segundo Assistente do Presidente do Quórum de Sacerdotes', 'Priests Quorum Second Assistant', 'Segundo asistente del presidente del cuórum de presbíteros', 'ward_branch', 'none', null, null, 750),
  ('priests_quorum_secretary', 'Secretário do Quórum de Sacerdotes', 'Priests Quorum Secretary', 'Secretario del cuórum de presbíteros', 'ward_branch', 'none', null, null, 760),
  ('teachers_quorum_president', 'Presidente do Quórum de Mestres', 'Teachers Quorum President', 'Presidente del cuórum de maestros', 'ward_branch', 'none', null, null, 770),
  ('teachers_quorum_counselor_1', 'Primeiro Conselheiro na Presidência do Quórum de Mestres', 'Teachers Quorum First Counselor', 'Primer consejero de la presidencia del cuórum de maestros', 'ward_branch', 'none', null, null, 780),
  ('teachers_quorum_counselor_2', 'Segundo Conselheiro na Presidência do Quórum de Mestres', 'Teachers Quorum Second Counselor', 'Segundo consejero de la presidencia del cuórum de maestros', 'ward_branch', 'none', null, null, 790),
  ('teachers_quorum_secretary', 'Secretário do Quórum de Mestres', 'Teachers Quorum Secretary', 'Secretario del cuórum de maestros', 'ward_branch', 'none', null, null, 800),
  ('deacons_quorum_president', 'Presidente do Quórum de Diáconos', 'Deacons Quorum President', 'Presidente del cuórum de diáconos', 'ward_branch', 'none', null, null, 810),
  ('deacons_quorum_counselor_1', 'Primeiro Conselheiro na Presidência do Quórum de Diáconos', 'Deacons Quorum First Counselor', 'Primer consejero de la presidencia del cuórum de diáconos', 'ward_branch', 'none', null, null, 820),
  ('deacons_quorum_counselor_2', 'Segundo Conselheiro na Presidência do Quórum de Diáconos', 'Deacons Quorum Second Counselor', 'Segundo consejero de la presidencia del cuórum de diáconos', 'ward_branch', 'none', null, null, 830),
  ('deacons_quorum_secretary', 'Secretário do Quórum de Diáconos', 'Deacons Quorum Secretary', 'Secretario del cuórum de diáconos', 'ward_branch', 'none', null, null, 840),
  ('aaronic_priesthood_adviser', 'Consultor dos Quóruns do Sacerdócio Aarônico', 'Aaronic Priesthood Quorum Adviser', 'Asesor de los cuórums del Sacerdocio Aarónico', 'ward_branch', 'none', null, null, 850),
  ('young_men_specialist', 'Especialista dos Rapazes', 'Young Men Specialist', 'Especialista de los Hombres Jóvenes', 'ward_branch', 'none', null, null, 860),
  ('young_women_president', 'Presidente das Moças', 'Young Women President', 'Presidenta de las Mujeres Jóvenes', 'ward_branch', 'unit_publisher', 'young_women_presidency', 'unit_organizations', 870),
  ('young_women_counselor_1', 'Primeira Conselheira na Presidência das Moças', 'Young Women First Counselor', 'Primera consejera de la presidencia de las Mujeres Jóvenes', 'ward_branch', 'none', 'young_women_presidency', 'unit_organizations', 880),
  ('young_women_counselor_2', 'Segunda Conselheira na Presidência das Moças', 'Young Women Second Counselor', 'Segunda consejera de la presidencia de las Mujeres Jóvenes', 'ward_branch', 'none', 'young_women_presidency', 'unit_organizations', 890),
  ('young_women_secretary', 'Secretária das Moças', 'Young Women Secretary', 'Secretaria de las Mujeres Jóvenes', 'ward_branch', 'none', 'young_women_presidency', 'unit_organizations', 900),
  ('young_women_adviser', 'Consultora das Moças', 'Young Women Adviser', 'Asesora de las Mujeres Jóvenes', 'ward_branch', 'none', null, null, 910),
  ('young_women_specialist', 'Especialista das Moças', 'Young Women Specialist', 'Especialista de las Mujeres Jóvenes', 'ward_branch', 'none', null, null, 920),
  ('young_women_class_president', 'Presidente de Classe das Moças', 'Young Women Class President', 'Presidenta de clase de las Mujeres Jóvenes', 'ward_branch', 'none', null, null, 930),
  ('young_women_class_counselor_1', 'Primeira Conselheira na Presidência da Classe das Moças', 'Young Women Class First Counselor', 'Primera consejera de la presidencia de clase de las Mujeres Jóvenes', 'ward_branch', 'none', null, null, 940),
  ('young_women_class_counselor_2', 'Segunda Conselheira na Presidência da Classe das Moças', 'Young Women Class Second Counselor', 'Segunda consejera de la presidencia de clase de las Mujeres Jóvenes', 'ward_branch', 'none', null, null, 950),
  ('young_women_class_secretary', 'Secretária da Classe das Moças', 'Young Women Class Secretary', 'Secretaria de clase de las Mujeres Jóvenes', 'ward_branch', 'none', null, null, 960),
  ('primary_president', 'Presidente da Primária', 'Primary President', 'Presidenta de la Primaria', 'ward_branch', 'unit_publisher', 'primary_presidency', 'unit_organizations', 970),
  ('primary_counselor_1', 'Primeira Conselheira na Presidência da Primária', 'Primary First Counselor', 'Primera consejera de la presidencia de la Primaria', 'ward_branch', 'none', 'primary_presidency', 'unit_organizations', 980),
  ('primary_counselor_2', 'Segunda Conselheira na Presidência da Primária', 'Primary Second Counselor', 'Segunda consejera de la presidencia de la Primaria', 'ward_branch', 'none', 'primary_presidency', 'unit_organizations', 990),
  ('primary_secretary', 'Secretária da Primária', 'Primary Secretary', 'Secretaria de la Primaria', 'ward_branch', 'none', 'primary_presidency', 'unit_organizations', 1000),
  ('primary_music_leader', 'Líder de Música da Primária', 'Primary Music Leader', 'Directora de música de la Primaria', 'ward_branch', 'none', 'music', null, 1010),
  ('primary_pianist', 'Pianista da Primária', 'Primary Pianist', 'Pianista de la Primaria', 'ward_branch', 'none', 'music', null, 1020),
  ('primary_teacher', 'Professor da Primária', 'Primary Teacher', 'Maestro de la Primaria', 'ward_branch', 'none', null, null, 1030),
  ('nursery_leader', 'Líder do Berçário', 'Nursery Leader', 'Líder de la guardería', 'ward_branch', 'none', null, null, 1040),
  ('primary_activities_leader', 'Líder de Atividades da Primária', 'Primary Activities Leader', 'Líder de actividades de la Primaria', 'ward_branch', 'none', null, null, 1050),
  ('sunday_school_president', 'Presidente da Escola Dominical', 'Sunday School President', 'Presidente de la Escuela Dominical', 'ward_branch', 'unit_publisher', 'sunday_school_presidency', 'unit_organizations', 1060),
  ('sunday_school_counselor_1', 'Primeiro Conselheiro na Presidência da Escola Dominical', 'Sunday School First Counselor', 'Primer consejero de la presidencia de la Escuela Dominical', 'ward_branch', 'none', 'sunday_school_presidency', 'unit_organizations', 1070),
  ('sunday_school_counselor_2', 'Segundo Conselheiro na Presidência da Escola Dominical', 'Sunday School Second Counselor', 'Segundo consejero de la presidencia de la Escuela Dominical', 'ward_branch', 'none', 'sunday_school_presidency', 'unit_organizations', 1080),
  ('sunday_school_secretary', 'Secretário da Escola Dominical', 'Sunday School Secretary', 'Secretario de la Escuela Dominical', 'ward_branch', 'none', 'sunday_school_presidency', 'unit_organizations', 1090),
  ('sunday_school_teacher', 'Professor da Escola Dominical', 'Sunday School Teacher', 'Maestro de la Escuela Dominical', 'ward_branch', 'none', null, null, 1100),
  ('unit_librarian', 'Bibliotecário', 'Librarian', 'Bibliotecario', 'ward_branch', 'none', null, null, 1110),
  ('unit_assistant_librarian', 'Bibliotecário Adjunto', 'Assistant Librarian', 'Bibliotecario asistente', 'ward_branch', 'none', null, null, 1120),
  ('unit_mission_leader', 'Líder da Missão', 'Mission Leader', 'Líder misional', 'ward_branch', 'none', 'missionaries', 'unit_organizations', 1130),
  ('unit_missionary', 'Missionário da Unidade', 'Unit Missionary', 'Misionero de la unidad', 'ward_branch', 'none', 'missionaries', null, 1140),
  ('unit_temple_fh_leader', 'Líder de Templo e História da Família', 'Temple and Family History Leader', 'Líder de la obra del templo e historia familiar', 'ward_branch', 'none', 'temple_family_history_workers', 'unit_organizations', 1150),
  ('unit_temple_fh_consultant', 'Consultor de Templo e História da Família', 'Temple and Family History Consultant', 'Consultor de la obra del templo e historia familiar', 'ward_branch', 'none', 'temple_family_history_workers', null, 1160),
  ('unit_music_coordinator', 'Coordenador de Música', 'Music Coordinator', 'Coordinador de música', 'ward_branch', 'none', 'music', null, 1170),
  ('sacrament_meeting_chorister', 'Regente da Reunião Sacramental', 'Sacrament Meeting Chorister', 'Director de música de la reunión sacramental', 'ward_branch', 'none', 'music', null, 1180),
  ('unit_organist', 'Organista ou Pianista', 'Organist or Pianist', 'Organista o pianista', 'ward_branch', 'none', 'music', null, 1190),
  ('unit_choir_director', 'Regente de Coro', 'Choir Director', 'Director del coro', 'ward_branch', 'none', 'music', null, 1200),
  ('unit_choir_pianist', 'Pianista de Coro', 'Choir Pianist', 'Pianista del coro', 'ward_branch', 'none', 'music', null, 1210),
  ('unit_self_reliance_specialist', 'Especialista de Autossuficiência', 'Self-Reliance Specialist', 'Especialista de autosuficiencia', 'ward_branch', 'none', null, null, 1220),
  ('unit_welfare_specialist', 'Especialista de Bem-Estar', 'Welfare Specialist', 'Especialista de bienestar', 'ward_branch', 'none', null, null, 1230),
  ('unit_activities_committee_chair', 'Presidente do Comitê de Atividades', 'Activities Committee Chair', 'Presidente del comité de actividades', 'ward_branch', 'unit_publisher', null, null, 1240),
  ('unit_activities_specialist', 'Especialista de Atividades', 'Activities Specialist', 'Especialista de actividades', 'ward_branch', 'none', null, null, 1250),
  ('unit_technology_specialist', 'Especialista de Tecnologia', 'Technology Specialist', 'Especialista de tecnología', 'ward_branch', 'none', null, null, 1260),
  ('unit_building_representative', 'Representante de Capela', 'Building Representative', 'Representante de edificios', 'ward_branch', 'none', null, null, 1270),
  ('unit_ysa_leader', 'Líder de Jovens Adultos Solteiros', 'Young Single Adult Leader', 'Líder de jóvenes adultos solteros', 'ward_branch', 'none', 'young_single_adult_leaders', null, 1280)
;
