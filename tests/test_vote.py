from unittest.mock import MagicMock, patch

import fakeredis
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_redis():
    fake_redis = fakeredis.FakeStrictRedis(decode_responses=True)
    with patch('app.redis_client.redis_client', fake_redis):
        with patch('app.main.redis_client', fake_redis):
            yield fake_redis


@pytest.fixture
def mock_db():
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
    mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.size.return_value = 5
    mock_pool.checkedout.return_value = 0
    mock_engine.pool = mock_pool

    with patch('app.main.engine', mock_engine):
        with patch('app.database.engine', mock_engine):
            yield mock_engine


@pytest.fixture
def client(mock_redis, mock_db):
    from app.main import app
    return TestClient(app)


class TestVoteEndpoint:
    def test_vote_valid_choice(self, client, mock_redis):
        response = client.post("/vote", json={"choice": "print"})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["choice"] == "print"

    def test_vote_invalid_choice(self, client):
        response = client.post("/vote", json={"choice": "invalid"})
        assert response.status_code == 400
        assert "Invalid choice" in response.json()["detail"]

    def test_vote_increments_redis(self, client, mock_redis):
        client.post("/vote", json={"choice": "stare"})
        count = mock_redis.get("vote:stare")
        assert count == "1"

        client.post("/vote", json={"choice": "stare"})
        count = mock_redis.get("vote:stare")
        assert count == "2"

    def test_vote_all_choices(self, client, mock_redis):
        choices = ["print", "stare", "ai", "revert", "restart"]
        for choice in choices:
            response = client.post("/vote", json={"choice": choice})
            assert response.status_code == 200


class TestVotesEndpoint:
    def test_get_votes_empty(self, client, mock_redis):
        response = client.get("/votes")
        assert response.status_code == 200
        data = response.json()
        for choice in ["print", "stare", "ai", "revert", "restart"]:
            assert choice in data
            assert data[choice]["count"] == 0

    def test_get_votes_with_data(self, client, mock_redis):
        mock_redis.set("vote:print", "5")
        mock_redis.set("vote:ai", "3")

        response = client.get("/votes")
        assert response.status_code == 200
        data = response.json()
        assert data["print"]["count"] == 5
        assert data["ai"]["count"] == 3


class TestHealthEndpoints:
    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestStaticPages:
    def test_voting_page(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    def test_results_page(self, client):
        response = client.get("/results")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
