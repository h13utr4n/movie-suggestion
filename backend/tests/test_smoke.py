from fastapi.testclient import TestClient

from backend.main import app, normalize_score


def test_health_endpoint():
    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.json()["status"] == "API is running"


def test_movies_pagination_validation():
    response = TestClient(app).get("/movies?page=0&limit=101")

    assert response.status_code == 422


def test_normalize_score_bounds():
    assert normalize_score(-1) == 0
    assert normalize_score(0) == 0
    assert 0 < normalize_score(10) < 100
    assert 99 < normalize_score(10_000) <= 100
