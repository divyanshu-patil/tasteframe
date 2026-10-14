"""Qloo adapter: normalization, empty results, auth, rate limits, timeouts, malformed bodies."""

import asyncio

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import AppError
from app.services.qloo.client import QlooClient, normalize_entity
from tests.conftest import load_fixture


def client(handler, **kw) -> QlooClient:
    s = Settings(qloo_api_key="k", qloo_max_retries=2, _env_file=None, **kw)
    return QlooClient(s, httpx.MockTransport(handler))


def run(coro):
    return asyncio.run(coro)


def code_of(handler, call=lambda c: c.search_entities("x", "artist")) -> str:
    with pytest.raises(AppError) as e:
        run(call(client(handler)))
    return e.value.code


def test_search_normalizes_and_skips_invalid(env):
    out = run(
        client(
            lambda r: httpx.Response(200, json=load_fixture("search_artist.json"))
        ).search_entities("seed", "artist")
    )
    assert [e.name for e in out] == ["Seed Artist", "Seed Artist Tribute Band"]
    assert out[0].image_url == "https://images.qloo.com/i/a.jpg"


def test_insights_normalizes_tags(env):
    out = run(
        client(
            lambda r: httpx.Response(200, json=load_fixture("insights_artist.json"))
        ).get_insights(["a"], "artist")
    )
    assert out[0].tags == ["Indie", "Soul"] and out[1].tags == ["Funk"]


def test_empty_results(env):
    assert (
        run(
            client(lambda r: httpx.Response(404, json={"message": "No results"})).search_entities(
                "zzz", "artist"
            )
        )
        == []
    )
    empty = {"success": True, "results": {"entities": []}}
    assert run(client(lambda r: httpx.Response(200, json=empty)).get_insights(["a"], "movie")) == []


def test_auth_failure_not_retried(env):
    calls = []

    def h(r):
        calls.append(r)
        return httpx.Response(403)

    assert code_of(h) == "QLOO_AUTH_FAILED" and len(calls) == 1


def test_rate_limit_retried_then_reported(env):
    calls = []

    def h(r):
        calls.append(r)
        return httpx.Response(429)

    assert code_of(h) == "QLOO_RATE_LIMITED" and len(calls) == 3


def test_transient_error_recovers(env):
    responses = iter([httpx.Response(503), httpx.Response(200, json={"results": []})])
    assert run(client(lambda r: next(responses)).search_entities("x", "artist")) == []


def test_timeout(env):
    def h(r):
        raise httpx.ReadTimeout("slow", request=r)

    assert code_of(h) == "QLOO_TIMEOUT"


def test_malformed_response(env):
    assert code_of(lambda r: httpx.Response(200, text="<html>")) == "QLOO_UPSTREAM_ERROR"
    assert (
        code_of(
            lambda r: httpx.Response(200, json={"results": {"oops": 1}}),
            lambda c: c.get_insights(["a"], "artist"),
        )
        == "QLOO_UPSTREAM_ERROR"
    )


def test_bad_request_maps_to_invalid_query(env):
    assert code_of(lambda r: httpx.Response(400)) == "QLOO_INVALID_QUERY"


def test_not_configured():
    c = QlooClient(Settings(qloo_api_key=None, _env_file=None))
    with pytest.raises(AppError) as e:
        run(c.search_entities("x", "artist"))
    assert e.value.code == "QLOO_NOT_CONFIGURED"


def test_normalize_entity_rejects_garbage():
    assert normalize_entity(None, "artist") is None
    assert normalize_entity({"entity_id": 5, "name": "x"}, "artist") is None
    e = normalize_entity(
        {
            "entity_id": "i",
            "name": " N ",
            "properties": {"release_year": 1999},
            "tags": [{"name": "Drama"}, {"bad": 1}],
        },
        "movie",
    )
    assert e and e.name == "N" and e.descriptor == "1999" and e.tags == ["Drama"]


def test_tag_affinity_chunks_and_keeps_only_asked_tags(env):
    """Shape checked live 2026-10-14: results.tags[].{tag_id, query.affinity}."""
    asked: list[dict] = []

    def handler(r: httpx.Request) -> httpx.Response:
        asked.append(dict(r.url.params))
        tags = r.url.params["filter.results.tags"].split(",")
        rows = [{"tag_id": t, "query": {"affinity": 0.5}} for t in tags[:2]]
        rows += [
            {"tag_id": "urn:tag:style:qloo:not_asked", "query": {"affinity": 0.9}},
            {"tag_id": tags[-1], "query": {}},  # no affinity: skipped
            {"tag_id": tags[-2], "query": {"affinity": 7}},  # out of range: skipped
        ]
        return httpx.Response(200, json={"success": True, "results": {"tags": rows}})

    ids = [f"urn:tag:style:qloo:t{i}" for i in range(60)]
    out = run(client(handler).tag_affinity(["e1", "e2"], ids))
    assert len(asked) == 2 and asked[0]["take"] == "50" and asked[1]["take"] == "10"
    assert asked[0]["filter.type"] == "urn:tag"
    assert asked[0]["signal.interests.entities"] == "e1,e2"
    assert out == {ids[0]: 0.5, ids[1]: 0.5, ids[50]: 0.5, ids[51]: 0.5}
    bad = {"success": True, "results": {"entities": []}}
    assert code_of(
        lambda r: httpx.Response(200, json=bad), lambda c: c.tag_affinity(["e"], ids)
    ) == ("QLOO_UPSTREAM_ERROR")
