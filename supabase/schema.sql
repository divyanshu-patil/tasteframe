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
    template_id in ('cinematic','vintage','magazine','stills','filmstrip','photodump','editorial','newspaper','journal','note','softfocus','scrapbook','moodboard','torn','minimal','y2k','nowplaying','vinyl','ticket','duo','polaroids','splitscreen','grid','mosaic','booth','torncollage','playlist','playercut','triptych','cctv','colorbox','tornstrip','cutout','focus','viewfinder','camcorder','sepiabooth','desktop','chat','kissmark','xerox','yearbook','coversepia','covercorner','covermouth','camtilt','weekday','daysplit','halfword','verticalday','scripttitle','refresh','bigletters','navheader','quotemarks','spotlight','bluehour','subtitlebar','redblock','badge','stats','notesapp','handnote','sticky','checklist','calendarcard','receipt','doodlesun','bigpolaroid','framein','postcard','stackedcards','bwstack','wavecut','diagonal','filmburn','hearts','coverface','coversingle','coverfloat','coverbubble','coverpolaroid','notesdark','appswitch','phones','camlyric','filmslant','songbox','clockit','doodlefit')
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
do $$
begin
    if to_regtype('public.user_role') is null then
        create type public.user_role as enum ('user', 'admin');
    end if;
end
$$;
create table if not exists public.users (
    id uuid primary key references auth.users (id) on delete cascade,
    email text,
    role public.user_role not null default 'user',
    created_at timestamptz not null default now()
);
-- Earlier versions stored role as text with a check constraint; convert in place.
do $$
begin
    if (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'role') = 'text' then
        alter table public.users drop constraint if exists users_role_check;
        alter table public.users alter column role drop default;
        alter table public.users alter column role type public.user_role using role::public.user_role;
        alter table public.users alter column role set default 'user';
    end if;
end
$$;
create index if not exists users_role_idx on public.users (role);
-- Set by admin_set_user(); suspended accounts are also banned in Supabase Auth.
alter table public.users add column if not exists suspended_at timestamptz;

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
    select exists (select 1 from public.users where id = auth.uid() and role = 'admin' and suspended_at is null)
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;  -- no insert/update/delete from clients
drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users
    for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

-- Usage analytics. No IPs, no full URLs: a hashed visitor id (HMAC on the API), the referring
-- site's host (or app name) only, the page path and a coarse device class. Events from signed-in
-- users carry their account id (admin "Users" tab); guests stay anonymous.
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
alter table public.events add column if not exists user_id uuid default auth.uid()
    references auth.users (id) on delete set null;
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_user_idx on public.events (user_id, created_at desc)
    where user_id is not null;
alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant insert on table public.events to anon, authenticated;
grant select on table public.events to authenticated;
drop policy if exists "events_insert_any" on public.events;
drop policy if exists "events_select_admin" on public.events;
create policy "events_insert_any" on public.events
    for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));
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

-- Per-account usage for the admin "Users" tab: most active first, with each one's top layouts.
create or replace function public.admin_users(days int default 30) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
    since timestamptz := now() - make_interval(days => greatest(1, least(days, 365)));
begin
    if not public.is_admin() then
        raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    return (select coalesce(jsonb_agg(to_jsonb(x) order by x.events desc, x.last_seen desc nulls last), '[]'::jsonb) from (
        select u.id, u.email, u.role, u.created_at,
            max(e.created_at) as last_seen,
            count(e.id) as events,
            count(e.id) filter (where e.type = 'pageview') as pageviews,
            count(e.id) filter (where e.type = 'analysis') as analyses,
            count(e.id) filter (where e.type = 'layout_open') as layout_opens,
            count(e.id) filter (where e.type = 'export') as exports,
            count(e.id) filter (where e.type = 'save') as saves,
            (select coalesce(jsonb_agg(jsonb_build_object('name', l.layout, 'count', l.n)), '[]'::jsonb) from (
                select layout, count(*) as n from public.events
                where user_id = u.id and created_at >= since and layout is not null
                group by 1 order by 2 desc limit 3) l) as layouts,
            u.suspended_at is not null as suspended
        from public.users u
        left join public.events e on e.user_id = u.id and e.created_at >= since
        group by u.id
        order by 6 desc, 5 desc nulls last
        limit 500) x);
end;
$$;
revoke all on function public.admin_users(int) from public;
grant execute on function public.admin_users(int) to authenticated;

-- Admins change another account's role and/or suspend it (null = leave as is). Suspending bans the
-- account in Supabase Auth (no sign-in or token refresh) and ends its sessions, so its access
-- token stops working at /auth/v1/user right away. Definer: it writes auth.users / auth.sessions.
create or replace function public.admin_set_user(p_id uuid, p_role public.user_role default null,
    p_suspended boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    r public.users;
begin
    if not public.is_admin() then
        raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    if p_id = auth.uid() then
        raise exception 'NOT_SELF' using errcode = 'P0001';  -- no locking yourself out
    end if;
    update public.users set
        role = coalesce(p_role, role),
        suspended_at = case when p_suspended then coalesce(suspended_at, now())
                            when not p_suspended then null else suspended_at end
    where id = p_id returning * into r;
    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
    end if;
    if p_suspended is not null then
        -- A far-future date rather than 'infinity', which Auth can't parse.
        update auth.users set banned_until = case when p_suspended then now() + interval '100 years' end
        where id = p_id;
        if p_suspended then
            delete from auth.sessions where user_id = p_id;
        end if;
    end if;
    return jsonb_build_object('id', r.id, 'role', r.role, 'suspended', r.suspended_at is not null);
end;
$$;
revoke all on function public.admin_set_user(uuid, public.user_role, boolean) from public;
grant execute on function public.admin_set_user(uuid, public.user_role, boolean) to authenticated;

-- App-wide switches admins flip without a redeploy. One row. The API reads qloo_enabled with the
-- publishable key; only admin_set_qloo() changes it. qloo_quota holds the last credit headers
-- Qloo returned (x-month-ratelimit-*), so the dashboard shows credits even after an API restart.
create table if not exists public.app_flags (
    id boolean primary key default true check (id),
    qloo_enabled boolean not null default true,
    qloo_quota jsonb,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null
);
insert into public.app_flags (id) values (true) on conflict do nothing;
alter table public.app_flags enable row level security;
revoke all on table public.app_flags from anon, authenticated;
grant select (qloo_enabled) on table public.app_flags to anon, authenticated;
drop policy if exists "app_flags_read" on public.app_flags;
create policy "app_flags_read" on public.app_flags for select to anon, authenticated using (true);

-- Qloo calls per day and endpoint, logged by the API (every HTTP attempt, retries included).
create table if not exists public.qloo_usage (
    day date not null default current_date,
    endpoint text not null check (endpoint in ('search', 'insights')),
    calls int not null default 0,
    errors int not null default 0,
    primary key (day, endpoint)
);
alter table public.qloo_usage enable row level security;
revoke all on table public.qloo_usage from anon, authenticated;

-- Called by the API with the publishable key, so like `events` anyone holding that key could
-- inflate these counts; they're for monitoring, not billing (Qloo's own headers are the truth).
create or replace function public.log_qloo_call(p_endpoint text, p_ok boolean,
    p_limit int default null, p_remaining int default null, p_reset_s int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
    insert into public.qloo_usage as u (endpoint, calls, errors) values (p_endpoint, 1, (not p_ok)::int)
    on conflict (day, endpoint) do update set calls = u.calls + 1, errors = u.errors + excluded.errors;
    if p_limit > 0 and p_remaining between 0 and p_limit and p_reset_s between 0 and 3000000 then
        update public.app_flags set qloo_quota = jsonb_build_object('limit', p_limit,
            'remaining', p_remaining, 'resets_at', now() + make_interval(secs => p_reset_s), 'seen_at', now()) where id;
    end if;
end;
$$;
revoke all on function public.log_qloo_call(text, boolean, int, int, int) from public;
grant execute on function public.log_qloo_call(text, boolean, int, int, int) to anon, authenticated;

-- Admin "Qloo" page: the switch, last known credits and calls per day.
create or replace function public.admin_qloo(days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    since date := current_date - greatest(1, least(days, 365)) + 1;
begin
    if not public.is_admin() then
        raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    return (select jsonb_build_object(
        'enabled', f.qloo_enabled,
        'updated_at', f.updated_at,
        'updated_by', (select email from public.users where id = f.updated_by),
        'quota', f.qloo_quota,
        'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'),
                'search', s, 'insights', i, 'errors', e) order by day), '[]'::jsonb) from (
            select day, sum(calls) filter (where endpoint = 'search') as s,
                sum(calls) filter (where endpoint = 'insights') as i, sum(errors) as e
            from public.qloo_usage where day >= since group by day) x))
        from public.app_flags f);
end;
$$;
revoke all on function public.admin_qloo(int) from public;
grant execute on function public.admin_qloo(int) to authenticated;

create or replace function public.admin_set_qloo(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then
        raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    update public.app_flags set qloo_enabled = p_on, updated_at = now(), updated_by = auth.uid() where id;
    return jsonb_build_object('enabled', p_on);
end;
$$;
revoke all on function public.admin_set_qloo(boolean) from public;
grant execute on function public.admin_set_qloo(boolean) to authenticated;

-- Layout likes: one per signed-in account (u:<uid>) or anonymous visitor (v:<server-hashed id>)
-- per layout. No direct table access — only the three functions below.
-- Note: anonymous likes can't be proven unique (anyone can mint visitor ids); the API rate-limits
-- them and ranking only uses likes as a small boost on top of photo fit.
create table if not exists public.layout_likes (
    layout text not null check (layout ~ '^[a-z0-9]{2,32}$'),
    liker text not null check (liker ~ '^(u:[0-9a-f-]{36}|v:[0-9a-f]{16})$'),
    created_at timestamptz not null default now(),
    primary key (layout, liker)
);
alter table public.layout_likes enable row level security;
revoke all on table public.layout_likes from anon, authenticated;

create or replace function public.layout_liker(p_visitor text) returns text
language sql stable set search_path = public as $$
    select case when auth.uid() is not null then 'u:' || auth.uid()::text
                when p_visitor ~ '^[0-9a-f]{16}$' then 'v:' || p_visitor end
$$;
revoke all on function public.layout_liker(text) from public;

create or replace function public.set_layout_like(p_layout text, p_visitor text, p_on boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare who text := public.layout_liker(p_visitor);
begin
    if p_layout !~ '^[a-z0-9]{2,32}$' or who is null then
        raise exception 'BAD_LIKE';
    end if;
    if p_on then
        insert into public.layout_likes (layout, liker) values (p_layout, who) on conflict do nothing;
    else
        delete from public.layout_likes where layout = p_layout and liker = who;
    end if;
    return (select count(*) from public.layout_likes where layout = p_layout);
end;
$$;
revoke all on function public.set_layout_like(text, text, boolean) from public;
grant execute on function public.set_layout_like(text, text, boolean) to anon, authenticated;

create or replace function public.layout_like_counts() returns table (layout text, likes bigint)
language sql stable security definer set search_path = public as $$
    select l.layout, count(*) from public.layout_likes l group by l.layout
$$;
revoke all on function public.layout_like_counts() from public;
grant execute on function public.layout_like_counts() to anon, authenticated;

create or replace function public.my_layout_likes(p_visitor text) returns setof text
language sql stable security definer set search_path = public as $$
    select l.layout from public.layout_likes l where l.liker = public.layout_liker(p_visitor)
$$;
revoke all on function public.my_layout_likes(text) from public;
grant execute on function public.my_layout_likes(text) to anon, authenticated;
