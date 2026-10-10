"""Optional live check. Run: QLOO_API_KEY=... .venv/bin/pytest -m integration"""

import asyncio
import os

import pytest

from app.core.config import Settings
from app.services.qloo.client import QlooClient

pytestmark = pytest.mark.integration


@pytest.mark.skipif(not os.getenv("QLOO_API_KEY"), reason="QLOO_API_KEY not set")
def test_live_search_and_insights():
    c = QlooClient(Settings())
    found = asyncio.run(c.search_entities("Radiohead", "artist"))
    assert found, "search returned no entities"
    related = asyncio.run(c.get_insights([found[0].entity_id], "artist", take=5))
    movies = asyncio.run(c.get_insights([found[0].entity_id], "movie", take=3))
    print(
        "seed:",
        found[0].name,
        "| artists:",
        [e.name for e in related],
        "| movies:",
        [e.name for e in movies],
    )
    assert related
