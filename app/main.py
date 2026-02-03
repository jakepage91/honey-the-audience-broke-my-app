import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.database import engine, Base
from app.metrics import MetricsMiddleware, get_metrics_response, db_pool_checked_out, db_pool_size
from app.models import Vote
from app.redis_client import increment_vote, get_vote_counts, redis_client
from app.referral import validate_referral


VALID_CHOICES = [
    "print",
    "stare",
    "ai",
    "revert",
    "restart"
]

CHOICE_LABELS = {
    "print": "Add more print statements",
    "stare": "Stare at the code until it confesses",
    "ai": "Ask an AI to explain it",
    "revert": "Revert and pretend it never happened",
    "restart": "Turn it off and on again"
}


class VoteRequest(BaseModel):
    choice: str
    referral: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Conference Polling App",
    description="90s NYC themed live polling for SREDay",
    lifespan=lifespan
)

app.add_middleware(MetricsMiddleware)

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


def update_pool_metrics():
    pool = engine.pool
    db_pool_size.set(pool.size())
    db_pool_checked_out.set(pool.checkedout())


@app.get("/", response_class=HTMLResponse)
async def voting_page(request: Request):
    with open(os.path.join(static_dir, "vote.html"), "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/results", response_class=HTMLResponse)
async def results_page():
    with open(os.path.join(static_dir, "results.html"), "r") as f:
        return HTMLResponse(content=f.read())


@app.post("/vote")
async def submit_vote(vote: VoteRequest):
    if vote.choice not in VALID_CHOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid choice. Must be one of: {', '.join(VALID_CHOICES)}"
        )

    if vote.referral:
        partner = validate_referral(vote.referral)
        if not partner:
            raise HTTPException(status_code=400, detail="Invalid referral code")

    increment_vote(vote.choice)

    with engine.connect() as conn:
        conn.execute(
            Vote.__table__.insert().values(
                choice=vote.choice,
                referral_code=vote.referral
            )
        )
        conn.commit()

    update_pool_metrics()

    return {"status": "ok", "choice": vote.choice}


@app.get("/votes")
async def get_votes():
    counts = get_vote_counts()
    result = {}
    for choice in VALID_CHOICES:
        result[choice] = {
            "count": counts.get(choice, 0),
            "label": CHOICE_LABELS[choice]
        }
    return result


@app.get("/stream")
async def vote_stream(request: Request):
    async def event_generator():
        pubsub = redis_client.pubsub()
        pubsub.subscribe("vote_updates")

        counts = get_vote_counts()
        result = {}
        for choice in VALID_CHOICES:
            result[choice] = {
                "count": counts.get(choice, 0),
                "label": CHOICE_LABELS[choice]
            }
        yield {"event": "votes", "data": json.dumps(result)}

        while True:
            if await request.is_disconnected():
                break

            counts = get_vote_counts()
            result = {}
            for choice in VALID_CHOICES:
                result[choice] = {
                    "count": counts.get(choice, 0),
                    "label": CHOICE_LABELS[choice]
                }
            yield {"event": "votes", "data": json.dumps(result)}

            await asyncio.sleep(1)

        pubsub.unsubscribe("vote_updates")
        pubsub.close()

    return EventSourceResponse(event_generator())


@app.get("/metrics")
async def metrics():
    update_pool_metrics()
    return get_metrics_response()


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/ready")
async def ready():
    try:
        redis_client.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis not available")

    try:
        with engine.connect() as conn:
            conn.execute(Vote.__table__.select().limit(1))
    except Exception:
        raise HTTPException(status_code=503, detail="PostgreSQL not available")

    return {"status": "ready"}
