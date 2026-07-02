import argparse
import json
import os
from datetime import datetime
from typing import Any, Dict, List

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient


load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def get_database():
    mongodb_url = os.getenv("MONGODB_URL")
    if not mongodb_url:
        raise ValueError("MONGODB_URL environment variable not set")

    client = MongoClient(mongodb_url, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=30000)
    client.admin.command("ping")
    return client, client["movie_suggestion"]


def collect_summary(db) -> Dict[str, Any]:
    counts = {
        "movies": db.movies.count_documents({}),
        "users": db.users.count_documents({}),
        "reviews": db.movie_reviews.count_documents({}),
        "ratings": db.ratings.count_documents({}),
        "pending_reviews": db.movie_reviews.count_documents({"status": "pending"}),
        "watch_history": db.WatchHistory.count_documents({}),
        "actors": db.actors.count_documents({}),
        "awards": db.awards.count_documents({}),
    }

    top_genres = list(db.movies.aggregate([
        {"$project": {"genres": {"$split": [{"$ifNull": ["$Genre", ""]}, ","]}}},
        {"$unwind": "$genres"},
        {"$project": {"genre": {"$trim": {"input": "$genres"}}}},
        {"$match": {"genre": {"$ne": ""}}},
        {"$group": {"_id": "$genre", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
    ]))

    imdb_rating = list(db.movies.aggregate([
        {
            "$project": {
                "rating": {
                    "$convert": {
                        "input": "$imdbRating",
                        "to": "double",
                        "onError": None,
                        "onNull": None,
                    }
                }
            }
        },
        {"$match": {"rating": {"$ne": None}}},
        {
            "$group": {
                "_id": None,
                "average": {"$avg": "$rating"},
                "minimum": {"$min": "$rating"},
                "maximum": {"$max": "$rating"},
            }
        },
    ]))

    review_ratings = list(db.ratings.aggregate([
        {"$group": {"_id": "$Score", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]))

    most_watched = list(db.WatchHistory.aggregate([
        {
            "$group": {
                "_id": "$MovieId",
                "visits": {"$sum": "$WatchedCount"},
                "seconds": {"$sum": "$TotalAccessTime"},
                "users": {"$addToSet": "$UserId"},
            }
        },
        {"$sort": {"visits": -1, "seconds": -1}},
        {"$limit": 10},
        {
            "$lookup": {
                "from": "movies",
                "localField": "_id",
                "foreignField": "imdbID",
                "as": "movie",
            }
        },
        {
            "$project": {
                "_id": 0,
                "imdb_id": "$_id",
                "title": {"$arrayElemAt": ["$movie.Title", 0]},
                "visits": 1,
                "seconds": 1,
                "unique_users": {"$size": "$users"},
            }
        },
    ]))

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "counts": counts,
        "top_genres": [{"genre": item["_id"], "count": item["count"]} for item in top_genres],
        "imdb_rating": imdb_rating[0] if imdb_rating else {"average": 0, "minimum": 0, "maximum": 0},
        "review_ratings": [{"rating": item["_id"], "count": item["count"]} for item in review_ratings],
        "most_watched": most_watched,
    }


def print_table(summary: Dict[str, Any]) -> None:
    print(f"Generated at: {summary['generated_at']}")
    print("\nCounts")
    for key, value in summary["counts"].items():
        print(f"  {key}: {value}")

    rating = summary["imdb_rating"]
    print("\nIMDb rating")
    print(f"  average: {rating.get('average', 0):.2f}")
    print(f"  min/max: {rating.get('minimum', 0)} / {rating.get('maximum', 0)}")

    print("\nTop genres")
    for item in summary["top_genres"]:
        print(f"  {item['genre']}: {item['count']}")

    print("\nReview rating distribution")
    for item in summary["review_ratings"]:
        print(f"  {item['rating']} star: {item['count']}")

    print("\nMost watched")
    for item in summary["most_watched"]:
        title = item.get("title") or item["imdb_id"]
        print(f"  {title}: {item['visits']} visits, {item['unique_users']} users")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze MovieSuggestion MongoDB data.")
    parser.add_argument("--format", choices=["table", "json"], default="table")
    args = parser.parse_args()

    client, db = get_database()
    try:
        summary = collect_summary(db)
        if args.format == "json":
            print(json.dumps(summary, indent=2, default=str))
        else:
            print_table(summary)
    finally:
        client.close()


if __name__ == "__main__":
    main()
