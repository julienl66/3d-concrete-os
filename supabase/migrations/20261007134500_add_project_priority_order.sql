alter table if exists public.projects
  add column if not exists priority text not null default 'normal';

alter table if exists public.projects
  add column if not exists project_order integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_priority_check'
  ) then
    alter table public.projects
      add constraint projects_priority_check
      check (priority in ('urgent', 'high', 'normal', 'low'));
  end if;
end $$;

update public.projects
set priority = 'normal'
where priority is null or priority not in ('urgent', 'high', 'normal', 'low');

notify pgrst, 'reload schema';
