create table if not exists public.crm_contact_opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  title text not null,
  estimated_amount numeric not null default 0,
  probability_percent integer check (probability_percent between 0 and 100),
  expected_signature_month text,
  status text not null default 'open' check (status in ('open','active','won','lost','archived')),
  notes text,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_contact_opportunities_contact_idx on public.crm_contact_opportunities(contact_id);
create index if not exists crm_contact_opportunities_status_idx on public.crm_contact_opportunities(status);
alter table public.crm_contact_opportunities enable row level security;
drop policy if exists "crm_contact_opportunities_all" on public.crm_contact_opportunities;
create policy "crm_contact_opportunities_all" on public.crm_contact_opportunities for all using (true) with check (true);
