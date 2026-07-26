-- Association catégorie de projet -> workflow sans modifier la table project_types.
-- Cette table évite toute dépendance à la colonne default_workflow_template_id.

create table if not exists public.project_type_workflow_assignments (
  project_type_id uuid primary key references public.project_types(id) on delete cascade,
  workflow_template_id uuid not null references public.project_workflow_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_type_workflow_assignments_workflow_idx
  on public.project_type_workflow_assignments(workflow_template_id);

-- Autorise l'accès via l'API Supabase selon les mêmes droits applicatifs que le reste de l'ERP.
grant select, insert, update, delete on public.project_type_workflow_assignments to anon, authenticated;

notify pgrst, 'reload schema';
