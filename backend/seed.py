import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import httpx
import certifi

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
OMDB_API_KEY = os.getenv("OMDB_API_KEY")

client = AsyncIOMotorClient(os.getenv("MONGODB_URL"),
    tlsCAFile=certifi.where())
db = client["movie_suggestion"]

BASE_TMDB = "https://api.themoviedb.org/3"
BASE_OMDB = "http://www.omdbapi.com/"

YEARS = [2026, 2025, 2024]   
MAX_PAGES = 20              
CONCURRENCY = 5              

async def get_tmdb_movies(year: int, page: int, client: httpx.AsyncClient):
    url = f"{BASE_TMDB}/discover/movie"

    params = {
        "api_key": TMDB_API_KEY,
        "sort_by": "popularity.desc",
        "page": page,
        "primary_release_year": year
    }

    res = await client.get(url, params=params)
    data = res.json()

    return data.get("results", [])

async def get_imdb_id(tmdb_id: int, client: httpx.AsyncClient):
    url = f"{BASE_TMDB}/movie/{tmdb_id}/external_ids"

    params = {"api_key": TMDB_API_KEY}

    res = await client.get(url, params=params)
    data = res.json()

    return data.get("imdb_id")

async def get_omdb(imdb_id: str, client: httpx.AsyncClient):
    params = {
        "i": imdb_id,
        "apikey": OMDB_API_KEY
    }

    res = await client.get(BASE_OMDB, params=params)
    data = res.json()

    if data.get("Response") == "False":
        return None

    return data

async def process_movie(movie, client: httpx.AsyncClient):
    tmdb_id = movie["id"]

    existing = await db.movies.find_one({"tmdb_id": tmdb_id})
    if existing:
        return

    imdb_id = await get_imdb_id(tmdb_id, client)
    if not imdb_id:
        return

    existing = await db.movies.find_one({"imdb_id": imdb_id})
    if existing:
        print(f"Skip duplicate: {imdb_id}")
        return

    omdb_data = await get_omdb(imdb_id, client)
    if not omdb_data:
        return

    final_data = {
        "tmdb_id": tmdb_id,
        "imdb_id": imdb_id,
        **omdb_data   # 🔥 quan trọng nhất
    }

    await db.movies.insert_one(final_data)

    print("Inserted:", omdb_data.get("Title"))

async def seed():

    semaphore = asyncio.Semaphore(CONCURRENCY)

    async with httpx.AsyncClient(timeout=10) as client:

        async def bounded_process(movie):
            async with semaphore:
                await process_movie(movie, client)

        for year in YEARS:
            print(f"\nSEEDING YEAR: {year}")

            all_movies = []

            for page in range(1, MAX_PAGES + 1):
                movies = await get_tmdb_movies(year, page, client)

                if not movies:
                    break

                all_movies.extend(movies)

            print(f"Collected {len(all_movies)} movies for {year}")

            tasks = [bounded_process(m) for m in all_movies]
            await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(seed())