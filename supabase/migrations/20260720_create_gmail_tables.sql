-- ============================================================
-- TABLES GMAIL
-- Un compte Google est rattaché à un utilisateur ERP
-- via employees.id et integration_accounts.user_id.
-- ============================================================


-- ============================================================
-- 1. CONVERSATIONS / THREADS GMAIL
-- ============================================================

create table if not exists public.gmail_threads (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.employees(id)
        on delete cascade,

    integration_account_id uuid not null
        references public.integration_accounts(id)
        on delete cascade,

    google_thread_id text not null,

    subject text,

    snippet text,

    last_message_at timestamptz,

    message_count integer not null default 0,

    is_read boolean not null default false,

    labels text[] not null default array[]::text[],

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint gmail_threads_account_google_thread_unique
        unique (
            integration_account_id,
            google_thread_id
        )
);


-- ============================================================
-- 2. MESSAGES GMAIL
-- ============================================================

create table if not exists public.gmail_messages (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.employees(id)
        on delete cascade,

    integration_account_id uuid not null
        references public.integration_accounts(id)
        on delete cascade,

    thread_id uuid not null
        references public.gmail_threads(id)
        on delete cascade,

    google_message_id text not null,

    google_thread_id text not null,

    direction text not null default 'incoming'
        check (
            direction in (
                'incoming',
                'outgoing'
            )
        ),

    sender_name text,

    sender_email text,

    to_emails text[] not null default array[]::text[],

    cc_emails text[] not null default array[]::text[],

    bcc_emails text[] not null default array[]::text[],

    reply_to_emails text[] not null default array[]::text[],

    subject text,

    snippet text,

    body_text text,

    body_html text,

    sent_at timestamptz,

    received_at timestamptz,

    is_read boolean not null default false,

    is_starred boolean not null default false,

    labels text[] not null default array[]::text[],

    has_attachments boolean not null default false,

    attachments jsonb not null default '[]'::jsonb,

    headers jsonb not null default '{}'::jsonb,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint gmail_messages_account_google_message_unique
        unique (
            integration_account_id,
            google_message_id
        )
);


-- ============================================================
-- 3. ÉTAT DE SYNCHRONISATION GMAIL
-- ============================================================

create table if not exists public.gmail_sync_state (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.employees(id)
        on delete cascade,

    integration_account_id uuid not null
        references public.integration_accounts(id)
        on delete cascade,

    last_history_id text,

    last_synced_at timestamptz,

    last_success_at timestamptz,

    last_error_at timestamptz,

    last_error text,

    sync_status text not null default 'idle'
        check (
            sync_status in (
                'idle',
                'running',
                'success',
                'error'
            )
        ),

    messages_synced integer not null default 0,

    threads_synced integer not null default 0,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint gmail_sync_state_account_unique
        unique (integration_account_id)
);


-- ============================================================
-- 4. INDEX
-- ============================================================

create index if not exists gmail_threads_user_id_idx
    on public.gmail_threads(user_id);

create index if not exists gmail_threads_account_id_idx
    on public.gmail_threads(integration_account_id);

create index if not exists gmail_threads_last_message_at_idx
    on public.gmail_threads(last_message_at desc);

create index if not exists gmail_threads_google_thread_id_idx
    on public.gmail_threads(google_thread_id);


create index if not exists gmail_messages_user_id_idx
    on public.gmail_messages(user_id);

create index if not exists gmail_messages_account_id_idx
    on public.gmail_messages(integration_account_id);

create index if not exists gmail_messages_thread_id_idx
    on public.gmail_messages(thread_id);

create index if not exists gmail_messages_google_thread_id_idx
    on public.gmail_messages(google_thread_id);

create index if not exists gmail_messages_sent_at_idx
    on public.gmail_messages(sent_at desc);

create index if not exists gmail_messages_received_at_idx
    on public.gmail_messages(received_at desc);

create index if not exists gmail_messages_sender_email_idx
    on public.gmail_messages(sender_email);


create index if not exists gmail_sync_state_user_id_idx
    on public.gmail_sync_state(user_id);

create index if not exists gmail_sync_state_account_id_idx
    on public.gmail_sync_state(integration_account_id);


-- ============================================================
-- 5. MISE À JOUR AUTOMATIQUE DE updated_at
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


drop trigger if exists set_gmail_threads_updated_at
    on public.gmail_threads;

create trigger set_gmail_threads_updated_at
before update on public.gmail_threads
for each row
execute function public.set_updated_at();


drop trigger if exists set_gmail_messages_updated_at
    on public.gmail_messages;

create trigger set_gmail_messages_updated_at
before update on public.gmail_messages
for each row
execute function public.set_updated_at();


drop trigger if exists set_gmail_sync_state_updated_at
    on public.gmail_sync_state;

create trigger set_gmail_sync_state_updated_at
before update on public.gmail_sync_state
for each row
execute function public.set_updated_at();


-- ============================================================
-- 6. SÉCURITÉ
-- ============================================================
--
-- L'ERP n'utilise actuellement pas Supabase Auth.
-- On n'active donc pas encore les politiques RLS basées sur auth.uid().
--
-- La synchronisation Gmail sera réalisée par une Edge Function
-- avec la clé service_role.
--
-- Les messages ne devront pas être exposés directement
-- à tout le frontend avec une politique publique.
-- ============================================================

alter table public.gmail_threads disable row level security;

alter table public.gmail_messages disable row level security;

alter table public.gmail_sync_state disable row level security;