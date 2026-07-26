-- Compatibilité workflows projet sans dépendre de colonnes is_closure.
-- La clôture est identifiée par le nom "Clôture du projet" côté application.

alter table if exists public.project_types
  add column if not exists default_workflow_template_id uuid references public.project_workflow_templates(id) on delete set null;

alter table if exists public.projects
  add column if not exists workflow_template_id uuid references public.project_workflow_templates(id) on delete set null;

alter table if exists public.projects
  add column if not exists workflow_status text;

alter table if exists public.projects
  add column if not exists completed_at timestamptz;

-- Force PostgREST/Supabase à recharger le schéma après la migration.
notify pgrst, 'reload schema';
