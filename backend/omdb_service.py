import os
import httpx
from typing import Optional
from dotenv import load_dotenv

try:
    from .models import Movie
except ImportError:
    from models import Movie

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

OMDB_BASE_URL = "http://www.omdbapi.com/"


def get_api_key() -> str:
    api_key = os.getenv("OMDB_API_KEY")
    if not api_key:
        raise ValueError("Missing OMDB_API_KEY")
    return api_key


# =========================
# FETCH BY IMDB ID
# =========================
async def fetch_movie_by_imdb_id(imdb_id: str) -> Optional[Movie]:
    params = {
        "i": imdb_id,
        "apikey": get_api_key()
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(OMDB_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

    except httpx.RequestError as e:
        print(f"HTTP request error: {e}")
        return None
    except httpx.HTTPStatusError as e:
        print(f"HTTP status error: {e}")
        return None

    if data.get("Response") == "False":
        print(f"OMDb error: {data.get('Error')}")
        return None

    try:
        return Movie(**data)
    except Exception as e:
        print(f"Model parse error: {e}")
        return None


# =========================
# SEARCH BY TITLE
# =========================
async def search_movies_by_title(title: str, page: int = 1) -> Optional[dict]:
    params = {
        "s": title,
        "page": page,
        "apikey": get_api_key()
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(OMDB_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

    except httpx.RequestError as e:
        print(f"HTTP request error: {e}")
        return None
    except httpx.HTTPStatusError as e:
        print(f"HTTP status error: {e}")
        return None

    if data.get("Response") == "False":
        print(f"OMDb error: {data.get('Error')}")
        return None

    return data
