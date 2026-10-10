-- Optional minimal persistence schema. Guest MVP may omit this.
-- Enable RLS before exposing tables via Supabase client.

create extension if not exists pgcrypto;

create table if not exists public.stories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid null references auth.users(id) on delete cascade,
    guest_session_hash text null,
    s3_object_key text not null,
    template_id text not null,
    layout_config jsonb not null default '{}'::jsonb,
    recommendation_provenance jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    expires_at timestamptz null,
    constraint stories_owner_present check (user_id is not null or guest_session_hash is not null)
);

create index if not exists stories_user_created_idx
    on public.stories (user_id, created_at desc);
create index if not exists stories_expiry_idx
    on public.stories (expires_at);

alter table public.stories enable row level security;

create policy "Users can read own stories"
    on public.stories for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can delete own stories"
    on public.stories for delete
    to authenticated
    using (auth.uid() = user_id);

-- Do not add an anon policy for guest_session_hash until secure guest-session
-- ownership is implemented with a server-validated token. A random string alone
-- is not sufficient authorization.
