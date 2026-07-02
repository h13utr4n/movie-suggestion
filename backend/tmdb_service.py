import os
import httpx
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
BASE_URL = "https://api.themoviedb.org/3"

if not TMDB_API_KEY:
    raise ValueError("Missing TMDB_API_KEY")


# =========================
# SEARCH MOVIES
# =========================
async def search_movies_by_title(title: str, page: int = 1):
    url = f"{BASE_URL}/search/movie"

    params = {
        "api_key": TMDB_API_KEY,
        "query": title,
        "page": page,
        "language": "en-US"
    }

    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        return res.json()


# =========================
# SEARCH PERSON (ACTOR/ACTRESS)
# =========================
async def search_person(name: str, page: int = 1) -> Dict[str, Any]:
    """Search for a person by name using TMDB API."""
    url = f"{BASE_URL}/search/person"
    
    params = {
        "api_key": TMDB_API_KEY,
        "query": name,
        "page": page,
        "language": "en-US"
    }
    
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        return res.json()


# =========================
# GET PERSON DETAIL
# =========================
async def fetch_person_details(person_id: int) -> Dict[str, Any]:
    """Get detailed information about a person by their TMDB ID."""
    url = f"{BASE_URL}/person/{person_id}"
    
    params = {
        "api_key": TMDB_API_KEY,
        "language": "en-US",
        "append_to_response": "external_ids"
    }
    
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        return res.json()


# =========================
# GET MOVIE DETAIL
# =========================
async def fetch_movie_by_id(movie_id: int):
    url = f"{BASE_URL}/movie/{movie_id}"

    params = {
        "api_key": TMDB_API_KEY,
        "language": "en-US"
    }

    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        return res.json()


# =========================
# DISCOVER (THAY sample_imdb_ids)
# =========================
async def discover_movies(year: int = None, page: int = 1):
    url = f"{BASE_URL}/discover/movie"

    params = {
        "api_key": TMDB_API_KEY,
        "page": page,
        "sort_by": "popularity.desc"
    }

    if year:
        params["primary_release_year"] = year

    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        return res.json()
