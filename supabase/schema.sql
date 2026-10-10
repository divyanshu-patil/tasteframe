-- Tasteframe saved Stories. Apply once: Supabase dashboard → SQL editor → run this file
-- (re-runnable), or `supabase db push` if you use the CLI with migrations.
--
-- Access model (publishable key):
--   The FastAPI service calls PostgREST with the PUBLISHABLE key (`apikey` header) → role `anon`.
--   A publishable key is public by design, so the database enforces everything itself:
--   * RLS is on and `anon` has NO table privileges — the table can't be read or written directly.
--   * `anon` may only EXECUTE the four tf_* functions below (SECURITY DEFINER).
--   * Every function requires the owner's hash: sha256(SESSION_SECRET:session_id), computed by the
--     API and never sent to browsers. It's a 256-bit capability: rows can't be enumerated or
--     guessed even by someone calling PostgREST directly with the publishable key.
--   * Per-owner limit and retention are enforced here, not by callers.
-- No image bytes are stored — only the opaque key of an EXIF-stripped copy under `saved/` in the
-- private S3 bucket.


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
    constraint stories_owner_format check (guest_session_hash is null or guest_session_hash ~ '^[0-9a-f]{64}$'),
    constraint stories_key_prefix check (s3_object_key ~ '^saved/[A-Za-z0-9_-]{22}/[A-Za-z0-9_-]{22}\.(jpg|png|webp)$'),
    constraint stories_config_size check (pg_column_size(layout_config) < 16384),
    constraint stories_provenance_size check (pg_column_size(recommendation_provenance) < 2048)
);

create index if not exists stories_user_created_idx
    on public.stories (user_id, created_at desc);
create index if not exists stories_guest_created_idx
    on public.stories (guest_session_hash, created_at desc);
create index if not exists stories_expiry_idx
    on public.stories (expires_at);

alter table public.stories enable row level security;

-- No direct table access for public roles; guest rows are reachable only via tf_* functions.
revoke all on table public.stories from anon, authenticated;

-- ---- functions (the only API surface for the publishable key) ---------------------------
-- Limits live here so a caller holding the publishable key can't override them.
--   max active Stories per owner: 20 · retention: 7 days (keep S3 `saved/` lifecycle at 8 days)

create or replace function public.tf_assert_owner(p_owner text) returns void
language plpgsql immutable as $$
begin
    if p_owner is null or p_owner !~ '^[0-9a-f]{64}$' then
        raise exception 'INVALID_OWNER' using errcode = 'P0001';
    end if;
end;
$$;

create or replace function public.tf_save_story(
    p_owner text, p_key text, p_template text, p_config jsonb, p_provenance jsonb
) returns table (
    id uuid, template_id text, layout_config jsonb, recommendation_provenance jsonb,
    created_at timestamptz, expires_at timestamptz, s3_object_key text
)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
    perform public.tf_assert_owner(p_owner);
    if p_template not in ('cinematic','stills','editorial','journal','scrapbook','filmstrip','vintage','minimal') then
        raise exception 'INVALID_TEMPLATE' using errcode = 'P0001';
    end if;
    -- Serialize saves per owner so concurrent requests can't exceed the limit.
    perform pg_advisory_xact_lock(hashtext(p_owner));
    if (select count(*) from public.stories s
        where s.guest_session_hash = p_owner and s.expires_at > now()) >= 20 then
        raise exception 'STORY_LIMIT' using errcode = 'P0001';
    end if;
    return query
    insert into public.stories as s
        (guest_session_hash, s3_object_key, template_id, layout_config, recommendation_provenance, expires_at)
    values (p_owner, p_key, p_template, coalesce(p_config, '{}'), coalesce(p_provenance, '{}'),
            now() + interval '7 days')
    returning s.id, s.template_id, s.layout_config, s.recommendation_provenance,
              s.created_at, s.expires_at, s.s3_object_key;
end;
$$;

create or replace function public.tf_list_stories(p_owner text) returns table (
    id uuid, template_id text, layout_config jsonb, recommendation_provenance jsonb,
    created_at timestamptz, expires_at timestamptz, s3_object_key text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
    perform public.tf_assert_owner(p_owner);
    return query
    select s.id, s.template_id, s.layout_config, s.recommendation_provenance,
           s.created_at, s.expires_at, s.s3_object_key
    from public.stories s
    where s.guest_session_hash = p_owner and s.expires_at > now()
    order by s.created_at desc
    limit 20;
end;
$$;

create or replace function public.tf_get_story(p_owner text, p_id uuid) returns table (
    id uuid, template_id text, layout_config jsonb, recommendation_provenance jsonb,
    created_at timestamptz, expires_at timestamptz, s3_object_key text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
    perform public.tf_assert_owner(p_owner);
    return query
    select s.id, s.template_id, s.layout_config, s.recommendation_provenance,
           s.created_at, s.expires_at, s.s3_object_key
    from public.stories s
    where s.id = p_id and s.guest_session_hash = p_owner and s.expires_at > now();
end;
$$;

-- Returns the deleted row's storage key (so the API can remove the photo), or nothing.
create or replace function public.tf_delete_story(p_owner text, p_id uuid) returns table (
    s3_object_key text
)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
    perform public.tf_assert_owner(p_owner);
    return query
    delete from public.stories s
    where s.id = p_id and s.guest_session_hash = p_owner
    returning s.s3_object_key;
end;
$$;

-- Expired rows are hidden immediately by the functions above; this physically removes them.
-- Schedule daily with pg_cron (Database → Extensions → pg_cron), e.g.:
--   select cron.schedule('purge-expired-stories', '17 3 * * *', 'select public.purge_expired_stories()');
create or replace function public.purge_expired_stories() returns integer
language sql security definer set search_path = public, pg_temp as $$
    with gone as (delete from public.stories where expires_at < now() returning 1)
    select count(*)::integer from gone;
$$;

-- Function privileges: nothing for PUBLIC by default; only the four tf_* entry points for anon.
revoke all on function public.tf_assert_owner(text) from public, anon, authenticated;
revoke all on function public.tf_save_story(text, text, text, jsonb, jsonb) from public, authenticated;
revoke all on function public.tf_list_stories(text) from public, authenticated;
revoke all on function public.tf_get_story(text, uuid) from public, authenticated;
revoke all on function public.tf_delete_story(text, uuid) from public, authenticated;
revoke all on function public.purge_expired_stories() from public, anon, authenticated;
grant execute on function public.tf_save_story(text, text, text, jsonb, jsonb) to anon;
grant execute on function public.tf_list_stories(text) to anon;
grant execute on function public.tf_get_story(text, uuid) to anon;
grant execute on function public.tf_delete_story(text, uuid) to anon;

-- Signed-in users (Supabase Auth) aren't supported yet. If added later, grant `authenticated`
-- select/delete and add own-row policies (auth.uid() = user_id).
drop policy if exists "Users can read own stories" on public.stories;
drop policy if exists "Users can delete own stories" on public.stories;
