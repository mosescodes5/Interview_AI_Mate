from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .config import ALLOWED_ORIGINS, extra_origins, host, port
from .database import init_db
from .services import analytics_service, ollama_service, settings_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    analytics_service.purge_old_history(settings_service.get_settings()["history_retention_days"])
    yield


app = FastAPI(title="InterviewMate AI backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS + extra_origins(), allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.exception_handler(ollama_service.AIError)
async def ai_error_handler(request: Request, exc: ollama_service.AIError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message, "code": exc.code})


# One-process mode: if the frontend has been built, serve it at http://127.0.0.1:8765/
_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="ui")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=host(), port=port())
