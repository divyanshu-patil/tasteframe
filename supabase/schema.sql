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
    template_id in ('cinematic','vintage','magazine','stills','filmstrip','photodump','editorial','newspaper','journal','note','softfocus','scrapbook','moodboard','torn','minimal','y2k','nowplaying','vinyl','ticket','duo','polaroids','splitscreen','grid','mosaic','booth','torncollage','playlist','playercut','triptych','cctv','colorbox','tornstrip','cutout','focus','viewfinder','camcorder','sepiabooth','desktop','chat','kissmark','xerox','yearbook','coversepia','covercorner','covermouth','camtilt','weekday','daysplit','halfword','verticalday','scripttitle','refresh','bigletters','navheader','quotemarks','spotlight','bluehour','subtitlebar','redblock','badge','stats','notesapp','handnote','sticky','checklist','calendarcard','receipt','doodlesun','bigpolaroid','framein','postcard','stackedcards','bwstack','wavecut','diagonal','filmburn','hearts','coverface','coversingle','coverfloat','coverbubble','coverpolaroid','notesdark')
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

-- =========================================================================================
-- Users (roles), analytics events and layout requests
-- =========================================================================================
-- One row per account with its role. Rows are created by a trigger when someone signs up;
-- roles change only from the database (supabase/make_admin.py) — clients can't update them.
create table if not exists public.users (
    id uuid primary key references auth.users (id) on delete cascade,
    email text,
    role text not null default 'user' check (role in ('user', 'admin')),
    created_at timestamptz not null default now()
);
create index if not exists users_role_idx on public.users (role);

-- New sign-ups get a 'user' row (definer: runs with the table owner's rights, not the caller's).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.users (id, email) values (new.id, new.email)
    on conflict (id) do update set email = excluded.email;
    return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
    for each row execute function public.handle_new_user();

-- Backfill accounts that existed before this table, and carry over the old admins table.
insert into public.users (id, email)
    select id, email from auth.users on conflict (id) do nothing;
do $$
begin
    if to_regclass('public.admins') is not null then
        update public.users u set role = 'admin' from public.admins a where a.user_id = u.id;
        drop table public.admins;
    end if;
end
$$;

-- Definer so RLS policies can ask "is the caller an admin?" without exposing the table.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.users where id = auth.uid() and role = 'admin')
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;  -- no insert/update/delete from clients
drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users
    for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

-- Anonymous usage analytics. No IPs, no user ids, no full URLs: a hashed visitor id (HMAC on
-- the API), the referring site's host only, the page path and a coarse device class.
create table if not exists public.events (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    type text not null check (type in ('pageview', 'analysis', 'layout_open', 'export', 'save', 'request', 'gallery_pick')),
    path text check (char_length(path) <= 120),
    referrer text check (char_length(referrer) <= 120),
    visitor text not null check (visitor ~ '^[0-9a-f]{16}$'),
    layout text check (char_length(layout) <= 32),
    device text check (device in ('mobile', 'tablet', 'desktop'))
);
create index if not exists events_created_idx on public.events (created_at desc);
alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant insert on table public.events to anon, authenticated;
grant select on table public.events to authenticated;
drop policy if exists "events_insert_any" on public.events;
drop policy if exists "events_select_admin" on public.events;
create policy "events_insert_any" on public.events
    for insert to anon, authenticated with check (true);
create policy "events_select_admin" on public.events
    for select to authenticated using ((select public.is_admin()));

-- Layout requests from the landing page: a Pinterest pin someone wants turned into a layout.
create table if not exists public.layout_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    pin_id text not null check (pin_id ~ '^[0-9]{5,25}$'),
    pin_url text not null check (pin_url ~ '^https://www\.pinterest\.com/pin/[0-9]{5,25}/$'),
    pin_title text check (char_length(pin_title) <= 200),
    pin_author text check (char_length(pin_author) <= 120),
    pin_author_url text check (pin_author_url ~ '^https://www\.pinterest\.com/'),
    pin_thumb text check (pin_thumb ~ '^https://i\.pinimg\.com/'),
    pin_width int, pin_height int,
    note text check (char_length(note) <= 500),
    email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
    referrer text check (char_length(referrer) <= 120),
    visitor text check (visitor ~ '^[0-9a-f]{16}$'),
    device text check (device in ('mobile', 'tablet', 'desktop')),
    user_id uuid default auth.uid(),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'done')),
    admin_note text check (char_length(admin_note) <= 500),
    reviewed_at timestamptz,
    reviewed_by uuid
);
create index if not exists layout_requests_created_idx on public.layout_requests (created_at desc);
alter table public.layout_requests enable row level security;
revoke all on table public.layout_requests from anon, authenticated;
grant insert on table public.layout_requests to anon, authenticated;
grant select, update on table public.layout_requests to authenticated;
drop policy if exists "requests_insert_any" on public.layout_requests;
drop policy if exists "requests_select_admin" on public.layout_requests;
drop policy if exists "requests_update_admin" on public.layout_requests;
-- Anyone may submit, but only as a fresh, unreviewed request owned by themselves (or nobody).
create policy "requests_insert_any" on public.layout_requests
    for insert to anon, authenticated with check (
        status = 'pending' and admin_note is null and reviewed_at is null and reviewed_by is null
        and (user_id is null or user_id = (select auth.uid()))
    );
create policy "requests_select_admin" on public.layout_requests
    for select to authenticated using ((select public.is_admin()));
create policy "requests_update_admin" on public.layout_requests
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- At most 10 requests per visitor per day (serialized per visitor).
create or replace function public.layout_requests_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.visitor is not null then
        perform pg_advisory_xact_lock(hashtext('req:' || new.visitor));
        if (select count(*) from public.layout_requests
            where visitor = new.visitor and created_at > now() - interval '1 day') >= 10 then
            raise exception 'REQUEST_LIMIT' using errcode = 'P0001';
        end if;
    end if;
    return new;
end;
$$;
drop trigger if exists layout_requests_limit on public.layout_requests;
create trigger layout_requests_limit before insert on public.layout_requests
    for each row execute function public.layout_requests_limit();

-- Dashboard numbers in one round trip. Invoker + explicit check: non-admins get an error.
create or replace function public.admin_stats(days int default 30) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
    since timestamptz := now() - make_interval(days => greatest(1, least(days, 365)));
begin
    if not public.is_admin() then
        raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'since', since,
        'totals', (select jsonb_build_object(
            'pageviews', count(*) filter (where type = 'pageview'),
            'visitors', count(distinct visitor),
            'analyses', count(*) filter (where type = 'analysis'),
            'layout_opens', count(*) filter (where type = 'layout_open'),
            'exports', count(*) filter (where type = 'export'),
            'saves', count(*) filter (where type = 'save'),
            'requests', count(*) filter (where type = 'request'))
            from public.events where created_at >= since),
        'daily', (select coalesce(jsonb_agg(x.j order by x.d), '[]'::jsonb) from (
            select date_trunc('day', created_at) as d, jsonb_build_object(
                'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
                'pageviews', count(*) filter (where type = 'pageview'),
                'visitors', count(distinct visitor),
                'exports', count(*) filter (where type = 'export')) as j
            from public.events where created_at >= since group by 1) x),
        'referrers', (select coalesce(jsonb_agg(jsonb_build_object('name', r, 'count', n) order by n desc), '[]'::jsonb) from (
            select coalesce(referrer, 'direct') as r, count(*) as n from public.events
            where created_at >= since and type = 'pageview' group by 1 order by 2 desc limit 12) x),
        'pages', (select coalesce(jsonb_agg(jsonb_build_object('name', path, 'count', n) order by n desc), '[]'::jsonb) from (
            select path, count(*) as n from public.events
            where created_at >= since and type = 'pageview' and path is not null group by 1 order by 2 desc limit 12) x),
        'layouts', (select coalesce(jsonb_agg(jsonb_build_object('name', layout, 'opens', o, 'exports', e) order by e desc, o desc), '[]'::jsonb) from (
            select layout, count(*) filter (where type = 'layout_open') as o, count(*) filter (where type = 'export') as e
            from public.events where created_at >= since and layout is not null group by 1 order by 3 desc, 2 desc limit 15) x),
        'devices', (select coalesce(jsonb_object_agg(coalesce(device, 'unknown'), n), '{}'::jsonb) from (
            select device, count(distinct visitor) as n from public.events where created_at >= since group by 1) x),
        'accounts', (select jsonb_build_object(
            'users', count(*),
            'admins', count(*) filter (where role = 'admin'),
            'new', count(*) filter (where created_at >= since))
            from public.users),
        'requests', (select jsonb_build_object(
            'pending', count(*) filter (where status = 'pending'),
            'accepted', count(*) filter (where status = 'accepted'),
            'rejected', count(*) filter (where status = 'rejected'),
            'done', count(*) filter (where status = 'done'))
            from public.layout_requests)
    );
end;
$$;
revoke all on function public.admin_stats(int) from public;
grant execute on function public.admin_stats(int) to authenticated;
