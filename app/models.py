from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base


class Vote(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    choice = Column(String(100), nullable=False)
    referral_code = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReferralPartner(Base):
    __tablename__ = "referral_partners"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
