"""Apply supabase/schema.sql to your Supabase Postgres (one transaction) and verify it.

    uv run --no-project --with "psycopg[binary]==3.2.10" python supabase/apply.py

Reads DATABASE_URL from apps/api/.env (Supabase → Connect → Session/Transaction pooler).
Only needed for setup; the app itself never uses DATABASE_URL. Prints no credentials.
"""

from pathlib import Path
from urllib.parse import unquote

import psycopg

ROOT = Path(__file__).resolve().parent.parent


def parse(url: str) -> dict:
    rest = url.split("://", 1)[1]
    creds, hostpart = rest.rsplit("@", 1)  # passwords may contain an unencoded '@'
    user, password = creds.split(":", 1)
    hostport, dbname = hostpart.split("/", 1)
    host, port = hostport.rsplit(":", 1)
    return dict(user=unquote(user), password=unquote(password), host=host, port=int(port),
                dbname=dbname.split("?")[0], sslmode="require", prepare_threshold=None)


def connect() -> psycopg.Connection:
    env = {}
    for line in (ROOT / "apps/api/.env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    if not env.get("DATABASE_URL"):
        raise SystemExit("DATABASE_URL is not set in apps/api/.env")
    return psycopg.connect(**parse(env["DATABASE_URL"]), connect_timeout=15)


if __name__ == "__main__":
    with connect() as conn:
        with conn.transaction():
            conn.execute((ROOT / "supabase/schema.sql").read_text())
            conn.execute("notify pgrst, 'reload schema'")
        for table in ("stories", "events", "layout_requests", "admins"):
            policies = [r[0] for r in conn.execute(
                "select policyname from pg_policies where tablename = %s order by 1", (table,)).fetchall()]
            rls, anon_sel, auth_upd = conn.execute(
                "select relrowsecurity, has_table_privilege('anon', c.oid, 'select'),"
                " has_table_privilege('authenticated', c.oid, 'update')"
                " from pg_class c where c.oid = %s::regclass", (f"public.{table}",)).fetchone()
            print(f"{table}: rls={rls} anon_select={anon_sel} auth_update={auth_upd} policies={policies}")
        admins = conn.execute("select count(*) from public.admins").fetchone()[0]
        print("admins:", admins)
