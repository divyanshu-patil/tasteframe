-- Tasteframe saved Stories. Apply once: Supabase dashboard → SQL editor → run this file
-- (or `supabase db push` if you use the CLI with migrations).
--
-- Access model: the FastAPI service talks to PostgREST with the SERVICE-ROLE key (server-only,
-- bypasses RLS) and scopes every query by guest_session_hash itself. RLS stays enabled so the
-- anon/authenticated keys can never read guest rows. No image bytes are stored here — only the
-- opaque storage key of an EXIF-stripped copy under the private bucket's `saved/` prefix.

create extension if not exists pgcrypto;

create table if not exists public.stories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid null references auth.users(id) on delete cascade,
    -- sha256(SESSION_SECRET:session_id); rotating SESSION_SECRET orphans existing guest rows.
    guest_session_hash text null,
    s3_object_key text not null,
    template_id text not null,
    layout_config jsonb not null default '{}'::jsonb,
    recommendation_provenance jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    expires_at timestamptz null,
    constraint stories_owner_present check (user_id is not null or guest_session_hash is not null),
    constraint stories_key_prefix check (s3_object_key like 'saved/%'),
    constraint stories_config_size check (pg_column_size(layout_config) < 16384)
);

create index if not exists stories_user_created_idx
    on public.stories (user_id, created_at desc);
create index if not exists stories_guest_created_idx
    on public.stories (guest_session_hash, created_at desc);
create index if not exists stories_expiry_idx
    on public.stories (expires_at);

alter table public.stories enable row level security;

-- Future signed-in users (Supabase Auth) may read/delete their own rows from the client.
drop policy if exists "Users can read own stories" on public.stories;
create policy "Users can read own stories"
    on public.stories for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can delete own stories" on public.stories;
create policy "Users can delete own stories"
    on public.stories for delete
    to authenticated
    using (auth.uid() = user_id);

-- Deliberately NO anon policy: guest rows are reachable only through the API's service role.

-- Expired rows are hidden by the API immediately; this removes them from the table.
-- Schedule daily with pg_cron (Database → Extensions → pg_cron), e.g.:
--   select cron.schedule('purge-expired-stories', '17 3 * * *', 'select public.purge_expired_stories()');
-- The matching photos expire via the S3 lifecycle rule on `saved/` (docs/aws/lifecycle.json).
create or replace function public.purge_expired_stories() returns integer
language sql security definer set search_path = public as $$
    with gone as (delete from public.stories where expires_at < now() returning 1)
    select count(*)::integer from gone;
$$;
revoke all on function public.purge_expired_stories() from public, anon, authenticated;
