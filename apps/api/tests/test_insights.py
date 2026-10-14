"""Pin previews, anonymous events, layout requests and the admin API (all upstreams mocked)."""

import asyncio
import json

import httpx
import pytest

from app.core.config import Settings
from app.services.insights.pins import pin_id_from, resolve_pin_id

PIN = "613193305553010170"
OEMBED = {
    "author_name": "Ruth Sailo",
    "author_url": "https://www.pinterest.com/ruth/",
    "title": " ",
    "thumbnail_url": "https://i.pinimg.com/236x/aa/bb/cc/x.jpg",
    "thumbnail_width": 236,
    "thumbnail_height": 419,
}
ADMIN, USER = (
    ("token-admin", "aaaaaaaa-0000-0000-0000-000000000001"),
    ("token-user", "bbbbbbbb-0000-0000-0000-000000000002"),
)


def test_pin_links_are_parsed_strictly():
    assert pin_id_from(f"https://in.pinterest.com/pin/{PIN}/") == PIN
    assert pin_id_from(f"https://www.pinterest.co.uk/pin/some-title--{PIN}/") == PIN
    assert pin_id_from(f"https://pinterest.com/pin/{PIN}") == PIN
    for bad in (
        f"https://evil.com/pin/{PIN}/",
        f"https://pinterest.com.evil.io/pin/{PIN}/",
        "https://www.pinterest.com/ruth/",
        "javascript:alert(1)",
    ):
        assert pin_id_from(bad) is None


def test_short_links_only_follow_pinterest():
    def ok(req: httpx.Request) -> httpx.Response:
        if req.url.host == "pin.it":
            return httpx.Response(
                302, headers={"location": "https://api.pinterest.com/url_shortener/xyz/redirect/"}
            )
        return httpx.Response(
            301, headers={"location": f"https://www.pinterest.com/pin/{PIN}/sent/"}
        )

    s = Settings(_env_file=None)
    assert asyncio.run(resolve_pin_id("pin.it/3AbCdE", s, transport=httpx.MockTransport(ok))) == PIN

    def evil(req: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://169.254.169.254/latest/meta-data"})

    with pytest.raises(Exception) as e:
        asyncio.run(resolve_pin_id("https://pin.it/x", s, transport=httpx.MockTransport(evil)))
    assert getattr(e.value, "code", "") == "PIN_INVALID"


class FakeRest:
    """PostgREST + Auth stand-in: anon can insert; only the admin token reads/updates."""

    def __init__(self):
        self.events: list[dict] = []
        self.requests: list[dict] = []
        self.likes: set[tuple[str, str]] = set()
        self.set_user: list[dict] = []
        self.qloo_on = True
        self.qloo_layouts = False
        self.qloo_calls: list[dict] = []

    def handler(self, req: httpx.Request) -> httpx.Response:
        if req.url.host == "www.pinterest.com":
            return httpx.Response(200, json=OEMBED)
        auth = req.headers.get("authorization", "")
        token = auth.removeprefix("Bearer ")
        if req.url.path == "/auth/v1/user":
            if token == "token-banned":
                return httpx.Response(
                    200, json={"id": USER[1], "banned_until": "2126-01-01T00:00:00Z"}
                )
            users = {ADMIN[0]: ADMIN[1], USER[0]: USER[1]}
            return (
                httpx.Response(200, json={"id": users[token]})
                if token in users
                else httpx.Response(401, json={})
            )
        path = req.url.path.removeprefix("/rest/v1")
        if path == "/rpc/is_admin":
            return httpx.Response(200, json=token == ADMIN[0])
        if path == "/rpc/admin_stats":
            if token != ADMIN[0]:
                return httpx.Response(403, json={"message": "NOT_ADMIN"})
            return httpx.Response(
                200,
                json={
                    "totals": {"pageviews": len(self.events)},
                    "requests": {"pending": len(self.requests)},
                },
            )
        if path.startswith("/rpc/") and "layout_like" in path:
            body = json.loads(req.content or b"{}")
            signed_in = {ADMIN[0]: ADMIN[1], USER[0]: USER[1]}.get(token)
            who = f"u:{signed_in}" if signed_in else f"v:{body.get('p_visitor')}"
            if path == "/rpc/set_layout_like":
                pair = (body["p_layout"], who)
                (self.likes.add if body["p_on"] else self.likes.discard)(pair)
                return httpx.Response(200, json=sum(1 for x in self.likes if x[0] == pair[0]))
            if path == "/rpc/layout_like_counts":
                counts: dict[str, int] = {}
                for layout, _ in self.likes:
                    counts[layout] = counts.get(layout, 0) + 1
                return httpx.Response(
                    200, json=[{"layout": k, "likes": v} for k, v in counts.items()]
                )
        if path == "/rpc/my_layout_likes":
            body = json.loads(req.content)
            signed_in = {ADMIN[0]: ADMIN[1], USER[0]: USER[1]}.get(token)
            who = f"u:{signed_in}" if signed_in else f"v:{body['p_visitor']}"
            return httpx.Response(200, json=[layout for layout, w in self.likes if w == who])
        if path == "/rpc/admin_set_user":
            if token != ADMIN[0]:
                return httpx.Response(403, json={"message": "NOT_ADMIN"})
            body = json.loads(req.content)
            self.set_user.append(body)
            return httpx.Response(
                200,
                json={"id": body["p_id"], "role": body["p_role"] or "user", "suspended": True},
            )
        if path == "/app_flags":
            row = {"qloo_enabled": self.qloo_on, "qloo_layouts": self.qloo_layouts}
            return httpx.Response(200, json=[row])
        if path == "/rpc/log_qloo_call":
            self.qloo_calls.append(json.loads(req.content))
            return httpx.Response(204)
        if path in ("/rpc/admin_qloo", "/rpc/admin_set_qloo"):
            if token != ADMIN[0]:
                return httpx.Response(403, json={"message": "NOT_ADMIN"})
            if path == "/rpc/admin_set_qloo":
                body = json.loads(req.content)
                if body["p_on"] is not None:
                    self.qloo_on = body["p_on"]
                if body["p_layouts"] is not None:
                    self.qloo_layouts = body["p_layouts"]
            flags = {"enabled": self.qloo_on, "layouts": self.qloo_layouts}
            return httpx.Response(200, json={**flags, "daily": []})
        if path == "/rpc/admin_users":
            if token != ADMIN[0]:
                return httpx.Response(403, json={"message": "NOT_ADMIN"})
            return httpx.Response(200, json=[{"id": USER[1], "email": "u@x.io", "events": 3}])
        if path == "/events" and req.method == "POST":
            self.events.append({**json.loads(req.content), "_token": token})
            return httpx.Response(201)
        if path == "/layout_requests":
            if req.method == "POST":
                row = json.loads(req.content)
                assert "status" not in row  # the API never sets review fields
                self.requests.append(
                    {
                        **row,
                        "id": "11111111-2222-3333-4444-555555555555",
                        "created_at": "2026-10-10T00:00:00Z",
                        "status": "pending",
                        "user_id": None,
                        "admin_note": None,
                        "reviewed_at": None,
                    }
                )
                return httpx.Response(201)
            if token != ADMIN[0]:
                return httpx.Response(200, json=[])  # RLS: non-admins see nothing
            if req.method == "PATCH":
                patch = json.loads(req.content)
                for r in self.requests:
                    r.update(patch)
                return httpx.Response(200, json=self.requests)
            return httpx.Response(200, json=self.requests)
        return httpx.Response(404, json={})


@pytest.fixture
def api(client_with, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    from app.api.routes import insights
    from app.core import auth
    from app.core.config import get_settings
    from app.services.insights import rest
    from app.services.qloo import usage

    monkeypatch.setattr(usage, "_flag", {"on": True, "layouts": False, "at": float("-inf")})
    get_settings.cache_clear()
    fake = FakeRest()
    t = httpx.MockTransport(fake.handler)
    for mod, attr in (
        (auth, "auth_transport"),
        (rest, "rest_transport"),
        (insights, "pin_transport"),
    ):
        monkeypatch.setattr(mod, attr, t)
    client, _ = client_with()
    return client, fake


def test_events_store_only_anonymous_fields(api):
    client, fake = api
    r = client.post(
        "/v1/events",
        json={
            "type": "pageview",
            "visitor": "abcDEF123456",
            "path": "/create",
            "referrer": "https://www.instagram.com/some/private/path?x=1",
            "device": "mobile",
        },
    )
    assert r.status_code == 204
    ev = fake.events[0]
    assert ev["referrer"] == "instagram.com"  # host only
    assert len(ev["visitor"]) == 16 and ev["visitor"] != "abcDEF123456"  # hashed
    assert ev["_token"] == "sb_publishable_test"  # guest: inserted anonymously
    assert (
        client.post("/v1/events", json={"type": "hack", "visitor": "abcDEF123456"}).status_code
        == 422
    )
    assert (
        client.post(
            "/v1/events", json={"type": "pageview", "visitor": "abcDEF123456", "path": "/x?token=1"}
        ).status_code
        == 422
    )


def test_pin_preview_and_request(api):
    client, fake = api
    r = client.get("/v1/pins/preview", params={"url": f"https://in.pinterest.com/pin/{PIN}/"})
    assert r.status_code == 200 and r.json()["thumbnail_url"].startswith(
        "https://i.pinimg.com/736x/"
    )
    assert (
        client.get(
            "/v1/pins/preview", params={"url": "https://example.com/pin/1234567/"}
        ).status_code
        == 422
    )
    r = client.post(
        "/v1/layout-requests",
        json={
            "pin_url": f"https://in.pinterest.com/pin/{PIN}/",
            "note": "please!",
            "email": "Me@Example.com",
            "visitor": "abcDEF123456",
        },
    )
    assert r.status_code == 201
    req = fake.requests[0]
    assert (
        req["pin_url"] == f"https://www.pinterest.com/pin/{PIN}/"
        and req["email"] == "me@example.com"
    )
    assert (
        client.post("/v1/layout-requests", json={"pin_url": "https://example.com/x"}).status_code
        == 422
    )


def test_admin_api_requires_admin(api):
    client, fake = api
    client.post("/v1/layout-requests", json={"pin_url": f"https://in.pinterest.com/pin/{PIN}/"})
    assert client.get("/v1/admin/stats").status_code == 401  # not signed in
    user = {"Authorization": f"Bearer {USER[0]}"}
    assert client.get("/v1/admin/me", headers=user).json() == {"admin": False}
    assert client.get("/v1/admin/stats", headers=user).status_code == 403
    assert client.get("/v1/admin/requests", headers=user).status_code == 403
    admin = {"Authorization": f"Bearer {ADMIN[0]}"}
    assert client.get("/v1/admin/me", headers=admin).json() == {"admin": True}
    assert client.get("/v1/admin/stats", headers=admin).json()["requests"]["pending"] == 1
    rows = client.get("/v1/admin/requests", headers=admin).json()["requests"]
    assert rows[0]["status"] == "pending" and "user_id" not in rows[0]
    rid = rows[0]["id"]
    r = client.patch(
        f"/v1/admin/requests/{rid}",
        headers=admin,
        json={"status": "accepted", "admin_note": "on it"},
    )
    assert r.status_code == 200 and r.json()["status"] == "accepted" and r.json()["reviewed_at"]
    assert (
        client.patch(
            f"/v1/admin/requests/{rid}", headers=admin, json={"status": "hacked"}
        ).status_code
        == 422
    )
    assert client.get("/v1/admin/requests/not-a-uuid", headers=admin).status_code == 422


def test_likes_anonymous_and_signed_in(api):
    from app.services.insights import likes

    likes.reset_cache()
    client, fake = api
    anon = {"visitor": "abcDEF123456", "liked": True}
    r = client.post("/v1/layouts/songbox/like", json=anon)
    assert r.status_code == 200 and r.json() == {"layout": "songbox", "likes": 1, "liked": True}
    # The raw browser id is never stored: the server hashes it first.
    assert all(w.startswith("v:") and "abcDEF123456" not in w for _, w in fake.likes)
    # Liking twice doesn't double count; a signed-in account is a separate liker.
    assert client.post("/v1/layouts/songbox/like", json=anon).json()["likes"] == 1
    h = {"Authorization": f"Bearer {USER[0]}"}
    assert client.post("/v1/layouts/songbox/like", json=anon, headers=h).json()["likes"] == 2
    got = client.get("/v1/layouts/likes", params={"visitor": "abcDEF123456"}, headers=h).json()
    assert got["counts"]["songbox"] == 2 and got["liked"] == ["songbox"]
    # Unlike, unknown layouts and bad visitor ids.
    off = client.post("/v1/layouts/songbox/like", json={**anon, "liked": False})
    assert off.json()["likes"] == 1
    assert client.post("/v1/layouts/nope/like", json=anon).status_code == 422
    assert client.post("/v1/layouts/songbox/like", json={**anon, "visitor": "x"}).status_code == 422
    # An expired token just likes anonymously.
    bad = {"Authorization": "Bearer expired"}
    assert client.post("/v1/layouts/vinyl/like", json=anon, headers=bad).status_code == 200


def test_signed_in_events_are_sent_as_the_user(api):
    client, fake = api
    ev = {"type": "export", "visitor": "abcDEF123456", "layout": "editorial"}
    r = client.post("/v1/events", json=ev, headers={"Authorization": f"Bearer {USER[0]}"})
    assert r.status_code == 204
    assert fake.events[-1]["_token"] == USER[0]  # RLS sets user_id = auth.uid() from this


def test_referrer_sources():
    from app.api.routes.insights import referrer_host

    assert referrer_host("android-app://com.whatsapp/") == "whatsapp"  # Android app links
    assert referrer_host("android-app://com.whatsapp.w4b") == "whatsapp"
    assert referrer_host("android-app://org.example.app/") == "org.example.app"
    assert referrer_host("WhatsApp") == "whatsapp"  # ?utm_source= tags, in-app browsers
    assert referrer_host("https://web.whatsapp.com/") == "web.whatsapp.com"
    assert referrer_host("null") == "null" and referrer_host("<script>") is None
    assert referrer_host("https://a b/") is None


def test_admin_users_requires_admin(api):
    client, _ = api
    assert client.get("/v1/admin/users").status_code == 401
    user = {"Authorization": f"Bearer {USER[0]}"}
    assert client.get("/v1/admin/users", headers=user).status_code == 403
    admin = {"Authorization": f"Bearer {ADMIN[0]}"}
    assert client.get("/v1/admin/users?days=7", headers=admin).json()["users"][0]["events"] == 3


def test_admin_can_promote_and_suspend_others_not_themselves(api):
    client, fake = api
    url = f"/v1/admin/users/{USER[1]}"
    user = {"Authorization": f"Bearer {USER[0]}"}
    assert client.patch(url, headers=user, json={"role": "admin"}).status_code == 403
    admin = {"Authorization": f"Bearer {ADMIN[0]}"}
    r = client.patch(url, headers=admin, json={"suspended": True})
    assert r.status_code == 200 and r.json()["suspended"] is True
    assert fake.set_user[-1] == {"p_id": USER[1], "p_role": None, "p_suspended": True}
    assert client.patch(url, headers=admin, json={}).status_code == 422  # nothing to change
    assert client.patch(url, headers=admin, json={"role": "owner"}).status_code == 422
    r = client.patch(f"/v1/admin/users/{ADMIN[1]}", headers=admin, json={"role": "user"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "NOT_SELF"
    assert len(fake.set_user) == 1


def test_suspended_accounts_are_refused_and_fall_back_to_guest(api):
    client, fake = api
    banned = {"Authorization": "Bearer token-banned"}
    r = client.get("/v1/admin/me", headers=banned)
    assert r.status_code == 403 and r.json()["error"]["code"] == "ACCOUNT_SUSPENDED"
    ev = {"type": "pageview", "visitor": "abcDEF123456"}
    assert client.post("/v1/events", json=ev, headers=banned).status_code == 204
    assert fake.events[-1]["_token"] == "sb_publishable_test"  # counted as a guest


def test_admin_switches_qloo_off_for_everyone_and_calls_are_logged(api):
    import time

    from tests.conftest import new_session

    client, fake = api
    qloo_headers = {
        "x-month-ratelimit-limit": "10000",
        "x-month-ratelimit-remaining": "9886",
        "x-month-ratelimit-reset": "2516230.31",
    }
    from app.api.routes.taste import get_qloo
    from app.core.config import get_settings
    from app.services.qloo.client import QlooClient

    hits: list[httpx.Request] = []

    def qloo(req: httpx.Request) -> httpx.Response:
        hits.append(req)
        return httpx.Response(200, headers=qloo_headers, json={"results": []})

    client.app.dependency_overrides[get_qloo] = lambda: QlooClient(
        get_settings(), httpx.MockTransport(qloo)
    )
    signed_in = {**new_session(client), "Authorization": f"Bearer {USER[0]}"}
    assert client.get("/v1/taste/search?q=drake", headers=signed_in).status_code == 200
    for _ in range(50):  # usage is logged in the background
        if fake.qloo_calls:
            break
        time.sleep(0.01)
    assert fake.qloo_calls == [
        {
            "p_endpoint": "search",
            "p_ok": True,
            "p_limit": 10000,
            "p_remaining": 9886,
            "p_reset_s": 2516230,
        }
    ]

    user = {"Authorization": f"Bearer {USER[0]}"}
    admin = {"Authorization": f"Bearer {ADMIN[0]}"}
    assert client.get("/v1/admin/qloo", headers=user).status_code == 403
    assert client.patch("/v1/admin/qloo", headers=user, json={"enabled": False}).status_code == 403
    assert fake.qloo_on is True
    r = client.patch("/v1/admin/qloo", headers=admin, json={"layouts": True})
    assert r.json() == {"enabled": True, "layouts": True} and fake.qloo_layouts is True
    from app.services.qloo import usage

    assert asyncio.run(usage.layouts_on(get_settings())) is True
    r = client.patch("/v1/admin/qloo", headers=admin, json={"enabled": False})
    assert r.status_code == 200 and fake.qloo_on is False and fake.qloo_layouts is True
    assert client.patch("/v1/admin/qloo", headers=admin, json={}).status_code == 422
    body = client.get("/v1/admin/qloo", headers=admin).json()
    assert body["enabled"] is False and body["configured"] is True

    assert client.get("/v1/features").json()["qloo"] is False
    r = client.get("/v1/taste/search?q=drake", headers=signed_in)
    assert r.status_code == 503 and r.json()["error"]["code"] == "QLOO_NOT_CONFIGURED"
    assert len(hits) == 1  # no Qloo call while switched off
    assert (
        client.patch("/v1/admin/qloo", headers=admin, json={"enabled": "nope"}).status_code == 422
    )
