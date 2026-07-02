import argparse
import asyncio
import os
from datetime import datetime

import certifi
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def parse_award_text(award_text: str):
    if not award_text or award_text == "N/A":
        return []

    awards = []
    parts = [part.strip() for part in award_text.replace("&", ".").split(".") if part.strip()]
    for part in parts:
        lower_part = part.lower()
        awards.append({
            "award_name": part,
            "category": "General",
            "winner": "win" in lower_part or "won" in lower_part,
            "year": "",
        })
    return awards


async def migrate_review_ratings(db):
    migrated = 0
    async for review in db.movie_reviews.find({"rating": {"$exists": True}}):
        user_id = review.get("user_id")
        imdb_id = review.get("imdb_id")
        rating = review.get("rating")
        if not user_id or not imdb_id or not rating:
            continue

        await db.ratings.update_one(
            {"UserId": user_id, "MovieId": imdb_id},
            {
                "$set": {
                    "Score": rating,
                    "source": "review-migration",
                    "updated_at": review.get("updated_at", datetime.now())
                },
                "$setOnInsert": {
                    "UserId": user_id,
                    "MovieId": imdb_id,
                    "created_at": review.get("created_at", datetime.now())
                }
            },
            upsert=True
        )
        migrated += 1
    return migrated


async def sync_actors_awards(db):
    movies_processed = 0
    actor_updates = 0
    award_docs = 0

    async for movie in db.movies.find({}):
        imdb_id = movie.get("imdbID")
        if not imdb_id:
            continue

        actor_names = [
            name.strip()
            for name in (movie.get("Actors") or "").split(",")
            if name.strip() and name.strip() != "N/A"
        ]
        for actor_name in actor_names:
            result = await db.actors.update_one(
                {"name": actor_name},
                {
                    "$set": {"name": actor_name, "updated_at": datetime.now()},
                    "$addToSet": {"movies": imdb_id},
                    "$setOnInsert": {"created_at": datetime.now()}
                },
                upsert=True
            )
            actor_updates += result.modified_count + (1 if result.upserted_id else 0)

        await db.awards.delete_many({"movie_id": imdb_id, "source": "omdb"})
        awards = [
            {
                **award,
                "movie_id": imdb_id,
                "source": "omdb",
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }
            for award in parse_award_text(movie.get("Awards", ""))
        ]
        if awards:
            await db.awards.insert_many(awards)
            award_docs += len(awards)

        movies_processed += 1

    return movies_processed, actor_updates, award_docs


async def recalculate_ratings(db):
    updated = 0
    async for item in db.ratings.aggregate([{"$group": {"_id": "$MovieId", "average": {"$avg": "$Score"}, "count": {"$sum": 1}}}]):
        await db.movies.update_one(
            {"imdbID": item["_id"]},
            {
                "$set": {
                    "userAverageRating": round(item["average"], 2),
                    "userReviewCount": item["count"],
                    "ratings_recalculated_at": datetime.now()
                }
            }
        )
        updated += 1
    return updated


async def create_indexes(db):
    await db.WatchHistory.create_index([("UserId", 1), ("MovieId", 1)], unique=True)
    await db.movie_reviews.create_index([("user_id", 1), ("imdb_id", 1)], unique=True)
    await db.ratings.create_index([("UserId", 1), ("MovieId", 1)], unique=True)
    await db.ratings.create_index("MovieId")
    await db.actors.create_index("name")
    await db.awards.create_index("movie_id")
    await db.movies.create_index("imdbID")
    await db.movies.create_index("Title")


async def dedupe_movies(db):
    duplicate_groups = 0
    deleted = 0
    pipeline = [
        {"$match": {"imdbID": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$imdbID", "ids": {"$push": "$_id"}, "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}}
    ]
    async for group in db.movies.aggregate(pipeline):
        duplicate_groups += 1
        result = await db.movies.delete_many({"_id": {"$in": group["ids"][1:]}})
        deleted += result.deleted_count
    return duplicate_groups, deleted


async def main():
    parser = argparse.ArgumentParser(description="Run MovieSuggestion maintenance tasks.")
    parser.add_argument(
        "task",
        choices=["all", "indexes", "migrate-ratings", "sync-actors-awards", "recalculate-ratings", "dedupe-movies"]
    )
    args = parser.parse_args()

    mongodb_url = os.getenv("MONGODB_URL")
    if not mongodb_url:
        raise ValueError("MONGODB_URL environment variable not set")

    client = AsyncIOMotorClient(mongodb_url, tlsCAFile=certifi.where())
    db = client["movie_suggestion"]
    await client.admin.command("ping")

    try:
        if args.task in {"all", "indexes"}:
            await create_indexes(db)
            print("indexes: ok")
        if args.task in {"all", "migrate-ratings"}:
            print(f"migrate-ratings: {await migrate_review_ratings(db)}")
        if args.task in {"all", "sync-actors-awards"}:
            movies, actors, awards = await sync_actors_awards(db)
            print(f"sync-actors-awards: movies={movies}, actor_updates={actors}, awards={awards}")
        if args.task in {"all", "recalculate-ratings"}:
            print(f"recalculate-ratings: {await recalculate_ratings(db)}")
        if args.task in {"all", "dedupe-movies"}:
            groups, deleted = await dedupe_movies(db)
            print(f"dedupe-movies: duplicate_groups={groups}, deleted={deleted}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
