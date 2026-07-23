-- Sépare définitivement le vivier de prospects des opportunités commerciales.
create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  title text not null,
  stage_id uuid references public.crm_pipeline_stages(id) on delete set null,
  assigned_to uuid references public.employees(id) on delete set null,
  status text not null default 'open' check (status in ('open','won','lost','archived')),
  estimated_amount numeric not null default 0,
  margin_percent numeric,
  probability_percent numeric check (probability_percent is null or (probability_percent >= 0 and probability_percent <= 100)),
  expected_signature_month text,
  product_family text,
  sector text,
  lead_source text,
  competitor text,
  priority text not null default 'normal',
  quote_id uuid,
  project_id uuid references public.projects(id) on delete set null,
  dossier_code text,
  notes text,
  lost_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_opportunities_contact_id_idx on public.crm_opportunities(contact_id);
create index if not exists crm_opportunities_stage_id_idx on public.crm_opportunities(stage_id);
create index if not exists crm_opportunities_status_idx on public.crm_opportunities(status);
create index if not exists crm_opportunities_project_id_idx on public.crm_opportunities(project_id);

alter table public.crm_interactions add column if not exists opportunity_id uuid references public.crm_opportunities(id) on delete set null;
alter table public.projects add column if not exists crm_opportunity_id uuid references public.crm_opportunities(id) on delete set null;

-- Reprise non destructive : une seule opportunité est créée pour chaque ancienne fiche
-- qui était réellement engagée dans le pipeline. Les simples contacts du vivier restent des contacts.
insert into public.crm_opportunities (
  contact_id, title, stage_id, assigned_to, status, estimated_amount, margin_percent,
  probability_percent, expected_signature_month, product_family, sector, lead_source,
  competitor, priority, quote_id, project_id, dossier_code, notes, created_at
)
select
  c.id,
  coalesce(nullif(c.product_family, ''), 'Opportunité - ' || coalesce(c.company_name, 'Prospect')),
  c.stage_id,
  c.assigned_to,
  case
    when lower(coalesce(s.name,'')) like '%perdu%' then 'lost'
    when c.project_id is not null or lower(coalesce(s.name,'')) like '%valid%' or lower(coalesce(s.name,'')) like '%gagn%' then 'won'
    else 'open'
  end,
  coalesce(c.estimated_amount,0), c.margin_percent, c.probability_percent,
  c.expected_signature_month, c.product_family, c.sector, c.lead_source,
  c.competitor, coalesce(c.priority,'normal'), c.quote_id, c.project_id,
  c.dossier_code, c.notes, coalesce(c.created_at, now())
from public.crm_contacts c
left join public.crm_pipeline_stages s on s.id = c.stage_id
where not exists (select 1 from public.crm_opportunities o where o.contact_id = c.id)
  and (
    c.project_id is not null
    or lower(coalesce(s.name,'')) like '%perdu%'
    or lower(coalesce(s.name,'')) like '%valid%'
    or lower(coalesce(s.name,'')) like '%gagn%'
    or exists (
      select 1 from public.crm_interactions i
      where i.contact_id = c.id
        and (
          lower(coalesce(i.subject,'')) like '%opportunité créée%'
          or lower(coalesce(i.subject,'')) like '%ajouté manuellement depuis le vivier%'
          or lower(coalesce(i.subject,'')) like '%prospect ciblé%'
        )
    )
  );

update public.projects p
set crm_opportunity_id = o.id
from public.crm_opportunities o
where p.crm_opportunity_id is null
  and o.project_id = p.id;

update public.crm_interactions i
set opportunity_id = o.id
from public.crm_opportunities o
where i.opportunity_id is null
  and i.contact_id = o.contact_id
  and not exists (
    select 1 from public.crm_opportunities o2
    where o2.contact_id = o.contact_id and o2.created_at < o.created_at
  );

alter table public.crm_opportunities enable row level security;

do $$ begin
  create policy "crm_opportunities_select" on public.crm_opportunities for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "crm_opportunities_insert" on public.crm_opportunities for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "crm_opportunities_update" on public.crm_opportunities for update using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "crm_opportunities_delete" on public.crm_opportunities for delete using (true);
exception when duplicate_object then null; end $$;
