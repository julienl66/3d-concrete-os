-- Workflows par catégorie + clôture de projet synchronisée ERP/CRM.

alter table if exists public.project_types
  add column if not exists default_workflow_template_id uuid references public.project_workflow_templates(id) on delete set null;

alter table if exists public.project_workflow_steps
  add column if not exists is_closure boolean not null default false;

alter table if exists public.project_steps
  add column if not exists is_closure boolean not null default false;

alter table if exists public.projects
  add column if not exists workflow_template_id uuid references public.project_workflow_templates(id) on delete set null;

alter table if exists public.projects
  add column if not exists workflow_status text;

alter table if exists public.projects
  add column if not exists completed_at timestamptz;

-- Reconnaît les anciennes étapes de clôture déjà présentes.
update public.project_workflow_steps
set is_closure = true,
    name = 'Clôture du projet'
where active = true
  and lower(coalesce(name, '')) in ('clôture projet', 'cloture projet', 'clôture du projet', 'cloture du projet');

-- Si plusieurs anciennes clôtures existent dans un même workflow, une seule reste système.
with ranked as (
  select id,
         row_number() over (partition by template_id order by step_order desc, id) as rn
  from public.project_workflow_steps
  where active = true and is_closure = true
)
update public.project_workflow_steps s
set is_closure = false
from ranked r
where s.id = r.id and r.rn > 1;

-- Ajoute automatiquement la clôture aux workflows qui n'en ont pas.
insert into public.project_workflow_steps
  (template_id, name, step_order, default_duration_days, active, is_closure)
select t.id,
       'Clôture du projet',
       coalesce((select max(s.step_order) from public.project_workflow_steps s where s.template_id = t.id and s.active = true), 0) + 1,
       0,
       true,
       true
from public.project_workflow_templates t
where t.active = true
  and not exists (
    select 1
    from public.project_workflow_steps s
    where s.template_id = t.id and s.active = true and s.is_closure = true
  );

-- Force la clôture en dernière position.
with max_regular as (
  select template_id, coalesce(max(step_order), 0) as max_order
  from public.project_workflow_steps
  where active = true and is_closure = false
  group by template_id
)
update public.project_workflow_steps closure
set step_order = coalesce(m.max_order, 0) + 1,
    name = 'Clôture du projet'
from public.project_workflow_templates t
left join max_regular m on m.template_id = t.id
where closure.template_id = t.id
  and closure.active = true
  and closure.is_closure = true;
