"""Grant (or revoke) the admin role for an existing Tasteframe account.

    uv run --no-project --with "psycopg[binary]==3.2.10" python supabase/make_admin.py you@example.com
    ... make_admin.py you@example.com --revoke

Reads DATABASE_URL from apps/api/.env. Admins can view analytics and the layout-request queue
at /admin. There is deliberately no API for this.
"""

import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).parent))
from apply import connect  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    email, revoke = sys.argv[1].strip().lower(), "--revoke" in sys.argv
    with connect() as conn, conn.transaction():
        row = conn.execute("select id from auth.users where lower(email) = %s", (email,)).fetchone()
        if not row:
            sys.exit(f"No account with email {email}. Sign up in the app first.")
        if revoke:
            conn.execute("delete from public.admins where user_id = %s", (row[0],))
            print(f"Revoked admin: {email}")
        else:
            conn.execute("insert into public.admins (user_id) values (%s) on conflict do nothing", (row[0],))
            print(f"Granted admin: {email}")


if __name__ == "__main__":
    try:
        main()
    except psycopg.Error as e:
        sys.exit(f"Database error: {e.__class__.__name__}")
