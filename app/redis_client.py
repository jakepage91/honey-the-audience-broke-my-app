import os
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)

VOTE_PREFIX = "vote:"


def increment_vote(choice: str) -> int:
    key = f"{VOTE_PREFIX}{choice}"
    return redis_client.incr(key)


def get_vote_counts() -> dict[str, int]:
    keys = redis_client.keys(f"{VOTE_PREFIX}*")
    counts = {}
    for key in keys:
        choice = key.replace(VOTE_PREFIX, "")
        counts[choice] = int(redis_client.get(key) or 0)
    return counts


def reset_votes():
    keys = redis_client.keys(f"{VOTE_PREFIX}*")
    if keys:
        redis_client.delete(*keys)
