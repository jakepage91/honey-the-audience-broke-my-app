from sqlalchemy import select
from app.database import engine
from app.models import ReferralPartner


def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
