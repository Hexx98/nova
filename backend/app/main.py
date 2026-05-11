from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.database import engine, Base
from app.core.rate_limit import limiter
from app.middleware.security import SecurityHeadersMiddleware
from app.api import auth, engagements, users, audit, export, attack_coverage
from app.api import ws
from app.api.phases import recon, weaponization, delivery, exploitation, installation, c2, objectives

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="Nova",
    description="Automated Web Application Penetration Testing Platform",
    version="0.1.0",
    docs_url="/api/docs" if settings.environment == "development" else None,
    redoc_url="/api/redoc" if settings.environment == "development" else None,
    openapi_url="/api/openapi.json" if settings.environment == "development" else None,
    lifespan=lifespan,
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["*"] if settings.environment == "development"
        else [f"https://{settings.environment}"]
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(recon.router)
app.include_router(weaponization.router)
app.include_router(delivery.router)
app.include_router(exploitation.router)
app.include_router(installation.router)
app.include_router(c2.router)
app.include_router(objectives.router)
app.include_router(engagements.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(export.router)
app.include_router(attack_coverage.router)
app.include_router(ws.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nova-backend", "version": "0.1.0"}


if settings.environment != "development":
    @app.exception_handler(Exception)
    async def _generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
