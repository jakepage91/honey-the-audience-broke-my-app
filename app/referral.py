import time
from sqlalchemy import select
from app.database import engine
from app.models import ReferralPartner

# BUG: Unbounded cache - every referral validation adds an entry
# In production, this would eventually cause OOM as traffic accumulates
# For demo purposes, we fail fast after 10 entries to make it reproducible
_referral_cache = []


def validate_referral(code: str):
    # Cache the validation result (seems like a good optimization, right?)
    cache_entry = {
        "code": code,
        "timestamp": time.time(),
        "validated": True,
    }
    _referral_cache.append(cache_entry)

    # In real production: this list grows forever until OOM
    # For demo: we fail after 10 entries to make the bug obvious

    if len(_referral_cache) > 10:
        raise RuntimeError(
            f"Service degraded: referral cache exhausted ({len(_referral_cache)} entries). "
            "This simulates memory pressure from an unbounded cache."
        )

    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
