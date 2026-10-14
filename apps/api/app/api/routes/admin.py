"""Admin dashboard API: analytics summary, per-user stats, the Qloo switch and the layout-request
queue.

Every call runs as the signed-in user against PostgREST; RLS and is_admin() decide access, so
a non-admin token gets 403 even if this layer were bypassed.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Path, Query

from app.core.auth import AuthUser, require_user
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.schemas.api import (
    AdminQlooPatch,
    AdminUserPatch,
    LayoutRequestList,
    LayoutRequestOut,
    LayoutRequestPatch,
)
from app.services.insights.rest import rest
from app.services.qloo import usage

router = APIRouter(prefix="/v1/admin", tags=["admin"])
UUID = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
COLUMNS = (
    "id,created_at,status,pin_id,pin_url,pin_title,pin_author,pin_author_url,pin_thumb,pin_width,"
    "pin_height,note,email,referrer,device,user_id,admin_note,reviewed_at"
)


async def is_admin(user: AuthUser, settings: Settings) -> bool:
    return bool(await rest(settings, "POST", "/rpc/is_admin", token=user.token, body={}))


async def require_admin(
    user: AuthUser = Depends(require_user), settings: Settings = Depends(get_settings)
) -> AuthUser:
    if not await is_admin(user, settings):
        raise AppError("NOT_ADMIN", "This page is for admins.", 403)
    return user


def _out(r: dict) -> LayoutRequestOut:
    return LayoutRequestOut(
        **{k: v for k, v in r.items() if k != "user_id"}, signed_in=bool(r.get("user_id"))
    )


@router.get("/me")
async def me(
    user: AuthUser = Depends(require_user), settings: Settings = Depends(get_settings)
) -> dict:
    return {"admin": await is_admin(user, settings)}


@router.get("/stats")
async def stats(
    days: int = Query(30, ge=1, le=365),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    data = await rest(settings, "POST", "/rpc/admin_stats", token=user.token, body={"days": days})
    if not isinstance(data, dict):
        raise AppError("INSIGHTS_UNAVAILABLE", "Analytics are temporarily unavailable.", 503, True)
    return data


@router.get("/users")
async def users(
    days: int = Query(30, ge=1, le=365),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Accounts ranked by activity in the range, with each one's most-used layouts."""
    data = await rest(settings, "POST", "/rpc/admin_users", token=user.token, body={"days": days})
    if not isinstance(data, list):
        raise AppError("INSIGHTS_UNAVAILABLE", "User stats are temporarily unavailable.", 503, True)
    return {"users": data}


@router.patch("/users/{user_id}")
async def update_user(
    body: AdminUserPatch,
    user_id: str = Path(pattern=UUID),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Make an account admin (or back to user) and/or suspend it. Not your own account."""
    if user_id == user.id:
        raise AppError("NOT_SELF", "You can't change your own account.", 400)
    data = await rest(
        settings,
        "POST",
        "/rpc/admin_set_user",
        token=user.token,
        body={"p_id": user_id, "p_role": body.role, "p_suspended": body.suspended},
    )
    if not isinstance(data, dict):
        raise AppError("INSIGHTS_UNAVAILABLE", "Couldn't update that account.", 503, True)
    return data


@router.get("/qloo")
async def qloo(
    days: int = Query(30, ge=1, le=365),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    """The Qloo switch, last credits Qloo reported and calls per day."""
    data = await rest(settings, "POST", "/rpc/admin_qloo", token=user.token, body={"days": days})
    if not isinstance(data, dict):
        raise AppError("INSIGHTS_UNAVAILABLE", "Qloo usage is temporarily unavailable.", 503, True)
    return {**data, "configured": settings.qloo_enabled}


@router.get("/music")
async def music(
    days: int = Query(30, ge=1, le=365),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Songs people listened to and exported, by source (Qloo / vibe pool / picked) and region."""
    data = await rest(settings, "POST", "/rpc/admin_music", token=user.token, body={"days": days})
    if not isinstance(data, dict):
        raise AppError(
            "INSIGHTS_UNAVAILABLE", "Music activity is temporarily unavailable.", 503, True
        )
    return data


@router.patch("/qloo")
async def set_qloo(
    body: AdminQlooPatch,
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Turn Qloo, or Qloo layout suggestions, on or off for everyone (no redeploy)."""
    if body.enabled is None and body.layouts is None:
        raise AppError("INVALID_REQUEST", "Nothing to change.", 422)
    data = await rest(
        settings,
        "POST",
        "/rpc/admin_set_qloo",
        token=user.token,
        body={"p_on": body.enabled, "p_layouts": body.layouts},
    )
    if not isinstance(data, dict):
        raise AppError("INSIGHTS_UNAVAILABLE", "Couldn't change the Qloo switch.", 503, True)
    # This instance applies it now; others within the cache TTL.
    usage.remember(bool(data.get("enabled")), bool(data.get("layouts")))
    return {"enabled": bool(data.get("enabled")), "layouts": bool(data.get("layouts"))}


@router.get("/requests", response_model=LayoutRequestList)
async def list_requests(
    status: str | None = Query(None, pattern="^(pending|accepted|rejected|done)$"),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> LayoutRequestList:
    params = {"select": COLUMNS, "order": "created_at.desc", "limit": "200"}
    if status:
        params["status"] = f"eq.{status}"
    rows = await rest(settings, "GET", "/layout_requests", token=user.token, params=params)
    return LayoutRequestList(requests=[_out(r) for r in rows or []])


@router.get("/requests/{request_id}", response_model=LayoutRequestOut)
async def get_request(
    request_id: str = Path(pattern=UUID),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> LayoutRequestOut:
    rows = await rest(
        settings,
        "GET",
        "/layout_requests",
        token=user.token,
        params={"select": COLUMNS, "id": f"eq.{request_id}"},
    )
    if not rows:
        raise AppError("NOT_FOUND", "That request doesn't exist.", 404)
    return _out(rows[0])


@router.patch("/requests/{request_id}", response_model=LayoutRequestOut)
async def update_request(
    body: LayoutRequestPatch,
    request_id: str = Path(pattern=UUID),
    user: AuthUser = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> LayoutRequestOut:
    patch = {
        "status": body.status,
        "admin_note": (body.admin_note or "").strip() or None,
        "reviewed_at": None if body.status == "pending" else datetime.now(UTC).isoformat(),
        "reviewed_by": None if body.status == "pending" else user.id,
    }
    rows = await rest(
        settings,
        "PATCH",
        "/layout_requests",
        token=user.token,
        params={"id": f"eq.{request_id}", "select": COLUMNS},
        body=patch,
    )
    if not rows:
        raise AppError("NOT_FOUND", "That request doesn't exist.", 404)
    return _out(rows[0])
