"""Coarse region (country) of a request: for tracking what people pick and as a Qloo signal.

Only a country code is kept; no IP or finer location. The host's geo header wins (Vercel and
Cloudflare set one); otherwise the browser's own locale region ("en-IN" → IN) is used.
"""

import re

from starlette.requests import Request

# ISO code → the name Qloo's signal.location.query understands (codes don't work there).
# ponytail: the markets this app's song languages target; add a country when people use it.
COUNTRIES = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada", "AU": "Australia",
    "NZ": "New Zealand", "IE": "Ireland", "IN": "India", "PK": "Pakistan", "BD": "Bangladesh",
    "LK": "Sri Lanka", "NP": "Nepal", "AE": "United Arab Emirates", "SA": "Saudi Arabia",
    "SG": "Singapore", "MY": "Malaysia", "PH": "Philippines", "ID": "Indonesia",
    "KR": "South Korea", "JP": "Japan", "ES": "Spain", "MX": "Mexico", "AR": "Argentina",
    "CO": "Colombia", "CL": "Chile", "PE": "Peru", "BR": "Brazil", "FR": "France",
    "DE": "Germany", "IT": "Italy", "NL": "Netherlands", "SE": "Sweden", "NG": "Nigeria",
    "ZA": "South Africa", "KE": "Kenya", "EG": "Egypt", "TR": "Turkey",
}  # fmt: skip
GEO_HEADERS = ("x-vercel-ip-country", "cf-ipcountry")
CODE = re.compile(r"^[A-Z]{2}$")


def region_of(request: Request, hint: str | None = None) -> str | None:
    """Country code from the geo header, else the browser's hint; None if unknown."""
    for h in GEO_HEADERS:
        v = (request.headers.get(h) or "").strip().upper()
        if CODE.match(v) and v != "XX":
            return v
    v = (hint or "").strip().upper()
    return v if CODE.match(v) else None


def country_name(code: str | None) -> str | None:
    return COUNTRIES.get(code or "")
