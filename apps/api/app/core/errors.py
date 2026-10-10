"""Safe, structured errors. Messages are user-facing; never include secrets or upstream bodies."""

import logging
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("tasteframe")
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, retryable: bool = False):
        super().__init__(code)
        self.code, self.message, self.status, self.retryable = code, message, status, retryable

    def body(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "request_id": request_id_var.get(),
                "retryable": self.retryable,
            }
        }


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_id(request: Request, call_next):
        rid = uuid.uuid4().hex[:16]
        request_id_var.set(rid)
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        # Log path template only: object keys / queries can be sensitive.
        route = request.scope.get("route")
        log.info("%s %s %s rid=%s", request.method, getattr(route, "path", "?"),
                 response.status_code, rid)
        return response

    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError):
        return JSONResponse(exc.body(), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields = sorted({".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()})
        err = AppError("INVALID_REQUEST", f"Invalid request fields: {', '.join(fields)}", 422)
        return JSONResponse(err.body(), status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        log.exception("unhandled error rid=%s type=%s", request_id_var.get(), type(exc).__name__)
        err = AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500, True)
        return JSONResponse(err.body(), status_code=500)
