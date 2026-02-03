import pytest
import os

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/test_conference")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
