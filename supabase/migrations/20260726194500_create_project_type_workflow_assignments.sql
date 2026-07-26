-- Association persistante entre une catégorie de projet et son workflow par défaut.
-- Migration autonome avec identifiant unique pour éviter les conflits de schema_migrations.

create table if not exists public.project_type_workflow_assignments (
  project_type_id uuid primary key,
  workflow_template_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_type_workflow_assignments_workflow_idx
  on public.project_type_workflow_assignments(workflow_template_id);

-- Ajout des contraintes uniquement si elles n'existent pas déjà.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_type_workflow_assignments_project_type_fkey'
  ) then
    alter table public.project_type_workflow_assignments
      add constraint project_type_workflow_assignments_project_type_fkey
      foreign key (project_type_id) references public.project_types(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'project_type_workflow_assignments_workflow_fkey'
  ) then
    alter table public.project_type_workflow_assignments
      add constraint project_type_workflow_assignments_workflow_fkey
      foreign key (workflow_template_id) references public.project_workflow_templates(id) on delete cascade;
  end if;
end $$;

grant select, insert, update, delete on public.project_type_workflow_assignments to anon, authenticated;

-- Force PostgREST/Supabase à recharger immédiatement son cache de schéma.
notify pgrst, 'reload schema';
