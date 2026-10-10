-- Tasteframe saved Stories — signed-in users only (Supabase Auth). Re-runnable.
-- Apply: SQL editor, or `uv run --no-project --with "psycopg[binary]==3.2.10" python supabase/apply.py`.
--
-- Access model (standard Supabase RLS):
--   * Creating/exporting Stories needs no account. SAVING requires a Supabase Auth login.
--   * The API forwards the user's own access token (JWT) to PostgREST with the publishable key, so
--     queries run as role `authenticated` with auth.uid() = that user. RLS limits every row to
--     its owner; `anon` has no access at all.
--   * The photo key must live under saved/<user_id>/ (CHECK constraint), so a user can't point a
--     row at someone else's photo even when calling PostgREST directly with their token.
--   * Max 20 Stories per user (trigger). Stories persist until the user deletes them; deleting the
--     auth user cascades to their rows.
-- No image bytes are stored here — only the opaque key of an EXIF-stripped copy in private S3.

create table if not exists public.stories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    s3_object_key text not null,
    template_id text not null,
    layout_config jsonb not null default '{}'::jsonb,
    recommendation_provenance jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- ---- migrate from the earlier guest-session version (no-ops on a fresh project) ----------
drop function if exists public.tf_save_story(text, text, text, jsonb, jsonb);
drop function if exists public.tf_list_stories(text);
drop function if exists public.tf_get_story(text, uuid);
drop function if exists public.tf_delete_story(text, uuid);
drop function if exists public.tf_assert_owner(text);
drop function if exists public.purge_expired_stories();
alter table public.stories drop constraint if exists stories_owner_present;
alter table public.stories drop constraint if exists stories_owner_format;
alter table public.stories drop constraint if exists stories_key_prefix;
alter table public.stories drop constraint if exists stories_config_size;
alter table public.stories drop constraint if exists stories_provenance_size;
alter table public.stories drop constraint if exists stories_template;
delete from public.stories where user_id is null;  -- guest rows can't be owned by anyone now
alter table public.stories drop column if exists guest_session_hash;
alter table public.stories drop column if exists expires_at;
alter table public.stories alter column user_id set not null;
alter table public.stories alter column user_id set default auth.uid();
drop index if exists public.stories_guest_created_idx;
drop index if exists public.stories_expiry_idx;

-- ---- constraints -------------------------------------------------------------------------
alter table public.stories add constraint stories_key_prefix check (
    s3_object_key ~ ('^saved/' || user_id::text || '/[A-Za-z0-9_-]{22}\.(jpg|png|webp)$')
);
alter table public.stories add constraint stories_template check (
    -- Keep in sync with apps/api/app/services/recommendations/layouts.py (a test checks this).
    template_id in ('cinematic','vintage','magazine','stills','filmstrip','photodump','editorial','newspaper','journal','note','softfocus','scrapbook','moodboard','torn','minimal','y2k','nowplaying','vinyl','ticket','duo','polaroids','splitscreen','grid','mosaic','booth','torncollage','playlist','playercut','triptych','cctv','colorbox','tornstrip','cutout','focus','viewfinder','camcorder','sepiabooth','desktop','chat','kissmark','xerox','yearbook','coversepia','covercorner','weekday','daysplit','halfword','verticalday','scripttitle','refresh','bigletters','navheader','quotemarks','spotlight','bluehour','subtitlebar','redblock','badge','stats','notesapp','handnote','sticky','checklist','calendarcard','receipt','doodlesun','bigpolaroid','framein','postcard','stackedcards','bwstack','wavecut','diagonal','filmburn','hearts','coverface','coversingle','coverfloat','coverbubble','coverstack','coverpolaroid','notesdark')
);
alter table public.stories add constraint stories_config_size check (pg_column_size(layout_config) < 16384);
alter table public.stories add constraint stories_provenance_size check (pg_column_size(recommendation_provenance) < 2048);

-- Multi-photo Stories (1–4 photos): every key must sit under the owner's saved/ prefix.
alter table public.stories add column if not exists s3_object_keys text[] not null default '{}';
create or replace function public.stories_keys_owned(keys text[], uid uuid) returns boolean
language sql immutable set search_path = public, pg_temp as $$
    select coalesce(array_length(keys, 1), 0) <= 4
       and coalesce(bool_and(k ~ ('^saved/' || uid::text || '/[A-Za-z0-9_-]{22}\.(jpg|png|webp)$')), true)
    from unnest(keys) as k
$$;
alter table public.stories drop constraint if exists stories_keys_owned;
alter table public.stories add constraint stories_keys_owned check (public.stories_keys_owned(s3_object_keys, user_id));

create index if not exists stories_user_created_idx on public.stories (user_id, created_at desc);

-- ---- per-user limit ----------------------------------------------------------------------
create or replace function public.stories_enforce_limit() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
    -- Serialize inserts per user so concurrent saves can't exceed the limit.
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    if (select count(*) from public.stories where user_id = new.user_id) >= 20 then
        raise exception 'STORY_LIMIT' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
drop trigger if exists stories_limit on public.stories;
create trigger stories_limit before insert on public.stories
    for each row execute function public.stories_enforce_limit();

-- ---- RLS ---------------------------------------------------------------------------------
alter table public.stories enable row level security;

revoke all on table public.stories from anon, authenticated;
grant select, insert, delete on table public.stories to authenticated;  -- no updates

drop policy if exists "Users can read own stories" on public.stories;
drop policy if exists "Users can delete own stories" on public.stories;
drop policy if exists "stories_select_own" on public.stories;
drop policy if exists "stories_insert_own" on public.stories;
drop policy if exists "stories_delete_own" on public.stories;

create policy "stories_select_own" on public.stories
    for select to authenticated using (user_id = (select auth.uid()));
create policy "stories_insert_own" on public.stories
    for insert to authenticated with check (user_id = (select auth.uid()));
create policy "stories_delete_own" on public.stories
    for delete to authenticated using (user_id = (select auth.uid()));
