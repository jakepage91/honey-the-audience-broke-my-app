from sqlalchemy import select
from app.database import engine
from app.models import ReferralPartner


def validate_referral(code: str) -> ReferralPartner | None:
    conn = engine.connect()
    result = conn.execute(
        select(ReferralPartner).where(ReferralPartner.code == code)
    )
    partner = result.scalar_one_or_none()
    conn.close()
    return partner
