"""
Movie Suggestion API - Backend Service
Provides endpoints for searching and retrieving movie information from OMDB and MongoDB
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import certifi
from bson import ObjectId

# Load environment variables before importing services that read them at import time.
load_dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(load_dotenv_path)

try:
    from .models import Movie, UserRegister, UserLogin, UserResponse, TokenResponse, UpdateFavoriteGenres, MovieReviewCreate, WatchTimeUpdate, RatingCreate, AdminRatingUpdate, AdminMovieUpdate, AdminReviewModeration
    from .omdb_service import fetch_movie_by_imdb_id, search_movies_by_title
    from .tmdb_service import search_person, fetch_person_details
    from .auth_service import (
        hash_password, verify_password, create_access_token,
        create_activation_token, verify_token, send_activation_email, send_login_email
    )
except ImportError:
    from models import Movie, UserRegister, UserLogin, UserResponse, TokenResponse, UpdateFavoriteGenres, MovieReviewCreate, WatchTimeUpdate, RatingCreate, AdminRatingUpdate, AdminMovieUpdate, AdminReviewModeration
    from omdb_service import fetch_movie_by_imdb_id, search_movies_by_title
    from tmdb_service import search_person, fetch_person_details
    from auth_service import (
        hash_password, verify_password, create_access_token,
        create_activation_token, verify_token, send_activation_email, send_login_email
    )

# Database configuration
MONGODB_URL = os.getenv("MONGODB_URL")
if not MONGODB_URL:
    raise ValueError("MONGODB_URL environment variable not set")

client = AsyncIOMotorClient(MONGODB_URL, tlsCAFile=certifi.where())
db = client["movie_suggestion"]
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
}

MOVIE_PAGE_MAX_LIMIT = 100
RECOMMENDATION_CACHE_TTL_SECONDS = 300
WATCHED_COUNT_SCORE_CAP = 8
WATCH_TIME_SESSION_CAP_SECONDS = 900
WATCH_TIME_SYNC_CAP_SECONDS = 300
WATCH_TIME_MIN_ENGAGED_SECONDS = 30
_recommendation_cache: Dict[str, Any] = {
    "expires_at": datetime.min,
    "movies": [],
    "genre_frequency": {},
}


# ============================================================================
# Lifespan Event Handler
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle events (startup and shutdown).
    """
    # Startup
    print("\n" + "="*70)
    print("   MOVIE SUGGESTION API - Backend Server")
    print("="*70)
    print("\nServer Configuration:")
    print("   - Host: 0.0.0.0")
    print("   - Port: 8000")
    print("   - Documentation: http://localhost:8000/docs")
    print("   - Alternative Docs: http://localhost:8000/redoc")
    print("\n" + "="*70)
    print("\nMovie Suggestion API is starting...")
    print(f"Connected to MongoDB")
    await db.WatchHistory.create_index([("UserId", 1), ("MovieId", 1)], unique=True)
    await db.movie_reviews.create_index([("user_id", 1), ("imdb_id", 1)], unique=True)
    await db.ratings.create_index([("UserId", 1), ("MovieId", 1)], unique=True)
    await db.ratings.create_index("MovieId")
    await db.actors.create_index("name")
    await db.awards.create_index("movie_id")
    await db.movies.create_index("imdbID")
    await db.movies.create_index("Title")
    print("API is ready to receive requests\n")
    
    yield
    
    # Shutdown
    print("\nShutting down Movie Suggestion API...")
    client.close()
    print("Database connection closed\n")


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Movie Suggestion API",
    description="API for searching and retrieving movie information",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Helper Functions
# ============================================================================

def is_valid_release_date(release_date_str: str) -> bool:
    """
    Check if a movie's release date is on or before yesterday.
    
    Args:
        release_date_str: Release date string in format "DD MMM YYYY" (e.g., "06 Jan 1994")
    
    Returns:
        bool: True if release date <= yesterday, False otherwise
    """
    try:
        if not release_date_str or release_date_str == 'N/A':
            return False
        
        release_date = datetime.strptime(release_date_str, "%d %b %Y")
        yesterday = (datetime.now() - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        return release_date <= yesterday
    except (ValueError, AttributeError):
        return False


def serialize_watch_history(history: Dict[str, Any]) -> Dict[str, Any]:
    history["id"] = str(history["_id"])
    del history["_id"]
    return history


def serialize_movie(movie: Dict[str, Any]) -> Dict[str, Any]:
    movie["id"] = str(movie["_id"])
    del movie["_id"]
    return movie


def serialize_document(document: Dict[str, Any]) -> Dict[str, Any]:
    serialized = {}
    for key, value in document.items():
        if key == "_id":
            serialized["id"] = str(value)
        elif isinstance(value, ObjectId):
            serialized[key] = str(value)
        elif isinstance(value, datetime):
            serialized[key] = value.isoformat()
        elif isinstance(value, list):
            serialized[key] = [
                serialize_document(item) if isinstance(item, dict) else item
                for item in value
            ]
        elif isinstance(value, dict):
            serialized[key] = serialize_document(value)
        else:
            serialized[key] = value
    return serialized


def parse_award_text(award_text: str) -> List[Dict[str, Any]]:
    if not award_text or award_text == "N/A":
        return []

    awards: List[Dict[str, Any]] = []
    parts = [part.strip() for part in award_text.replace("&", ".").split(".") if part.strip()]
    for part in parts:
        lower_part = part.lower()
        winner = "win" in lower_part or "won" in lower_part
        awards.append({
            "award_name": part,
            "category": "General",
            "winner": winner,
            "year": "",
        })
    return awards


async def sync_movie_actor_award_documents(movie: Dict[str, Any]) -> Dict[str, int]:
    imdb_id = movie.get("imdbID")
    if not imdb_id:
        return {"actors": 0, "awards": 0}

    actor_names = [
        name.strip()
        for name in (movie.get("Actors") or "").split(",")
        if name.strip() and name.strip() != "N/A"
    ]
    actor_updates = 0
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
    award_docs = []
    for award in parse_award_text(movie.get("Awards", "")):
        award_docs.append({
            **award,
            "movie_id": imdb_id,
            "source": "omdb",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        })
    if award_docs:
        await db.awards.insert_many(award_docs)

    return {"actors": actor_updates, "awards": len(award_docs)}


async def recalculate_movie_rating(imdb_id: str) -> Dict[str, Any]:
    pipeline = [
        {"$match": {"MovieId": imdb_id}},
        {"$group": {"_id": "$MovieId", "average": {"$avg": "$Score"}, "count": {"$sum": 1}}}
    ]
    result = [item async for item in db.ratings.aggregate(pipeline)]
    if not result:
        await db.movies.update_one(
            {"imdbID": imdb_id},
            {"$unset": {"userAverageRating": "", "userReviewCount": "", "ratings_recalculated_at": ""}}
        )
        return {"average": 0, "count": 0}

    summary = result[0]
    average = round(summary["average"], 2)
    count = summary["count"]
    await db.movies.update_one(
        {"imdbID": imdb_id},
        {
            "$set": {
                "userAverageRating": average,
                "userReviewCount": count,
                "ratings_recalculated_at": datetime.now()
            }
        }
    )
    return {"average": average, "count": count}


def parse_movie_genres(movie: Dict[str, Any]) -> List[str]:
    return [
        genre.strip()
        for genre in (movie.get("Genre") or "").split(",")
        if genre.strip()
    ]


def parse_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def add_genre_score(scores: Dict[str, float], movie: Dict[str, Any], amount: float) -> None:
    for genre in parse_movie_genres(movie):
        scores[genre] = scores.get(genre, 0) + amount


def days_since(value: Any, now: Optional[datetime] = None) -> int:
    if not isinstance(value, datetime):
        return 0
    current = now or datetime.now()
    return max((current - value).days, 0)


def recency_decay(value: Any, half_life_days: int = 90) -> float:
    days = days_since(value)
    return 0.5 ** (days / half_life_days)


def bounded_watch_count(value: Any) -> float:
    return min(parse_float(value), WATCHED_COUNT_SCORE_CAP)


def normalize_score(score: float) -> float:
    if score <= 0:
        return 0
    return min(100, round((score / (score + 18)) * 100, 2))


async def get_candidate_movie_cache() -> Dict[str, Any]:
    now = datetime.now()
    if _recommendation_cache["expires_at"] > now and _recommendation_cache["movies"]:
        return _recommendation_cache

    movies = await db.movies.find({
        "imdbID": {"$exists": True, "$ne": None},
        "Genre": {"$exists": True, "$nin": ["", "N/A", None]},
    }).sort("Year", -1).limit(1000).to_list(length=1000)
    genre_frequency: Dict[str, int] = {}
    for movie in movies:
        for genre in parse_movie_genres(movie):
            genre_frequency[genre] = genre_frequency.get(genre, 0) + 1

    _recommendation_cache.update({
        "expires_at": now + timedelta(seconds=RECOMMENDATION_CACHE_TTL_SECONDS),
        "movies": movies,
        "genre_frequency": genre_frequency,
    })
    return _recommendation_cache


def build_interaction_score(
    watched_count: Any,
    total_access_time: Any,
    last_interaction: Any,
    count_weight: float,
    minute_weight: float,
) -> float:
    active_minutes = min(parse_float(total_access_time) / 60, 120)
    base = bounded_watch_count(watched_count) * count_weight + active_minutes * minute_weight
    return base * recency_decay(last_interaction)


async def collect_quality_checks() -> Dict[str, Any]:
    duplicate_pipeline = [
        {"$match": {"imdbID": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$imdbID", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    unsynced_actor_pipeline = [
        {"$match": {"Actors": {"$exists": True, "$nin": ["", "N/A", None]}}},
        {
            "$lookup": {
                "from": "actors",
                "localField": "imdbID",
                "foreignField": "movies",
                "as": "actor_docs",
            }
        },
        {"$match": {"actor_docs": {"$size": 0}}},
        {"$count": "count"},
    ]
    unsynced_award_pipeline = [
        {"$match": {"Awards": {"$exists": True, "$nin": ["", "N/A", None]}}},
        {
            "$lookup": {
                "from": "awards",
                "localField": "imdbID",
                "foreignField": "movie_id",
                "as": "award_docs",
            }
        },
        {"$match": {"award_docs": {"$size": 0}}},
        {"$count": "count"},
    ]
    rating_distribution_pipeline = [
        {"$group": {"_id": "$Score", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]

    duplicate_groups = [
        {"imdbID": item["_id"], "count": item["count"]}
        async for item in db.movies.aggregate(duplicate_pipeline)
    ]
    unsynced_actor_result = await db.movies.aggregate(unsynced_actor_pipeline).to_list(length=1)
    unsynced_award_result = await db.movies.aggregate(unsynced_award_pipeline).to_list(length=1)
    rating_distribution = [
        {"rating": item["_id"], "count": item["count"]}
        async for item in db.ratings.aggregate(rating_distribution_pipeline)
    ]

    return {
        "duplicates": {
            "groups": len(duplicate_groups),
            "samples": duplicate_groups,
        },
        "missing": {
            "genre": await db.movies.count_documents({"Genre": {"$in": [None, "", "N/A"]}}),
            "poster": await db.movies.count_documents({
                "$or": [
                    {"Poster": {"$exists": False}},
                    {"Poster": {"$in": [None, "", "N/A"]}},
                ]
            }),
        },
        "sync": {
            "movies_missing_actor_docs": unsynced_actor_result[0]["count"] if unsynced_actor_result else 0,
            "movies_missing_award_docs": unsynced_award_result[0]["count"] if unsynced_award_result else 0,
        },
        "rating_distribution": rating_distribution,
    }


def cosine_similarity(left: Dict[str, float], right: Dict[str, float]) -> float:
    common_keys = set(left.keys()) & set(right.keys())
    numerator = sum(left[key] * right[key] for key in common_keys)
    left_norm = sum(value * value for value in left.values()) ** 0.5
    right_norm = sum(value * value for value in right.values()) ** 0.5

    if left_norm == 0 or right_norm == 0:
        return 0
    return numerator / (left_norm * right_norm)


def merge_recommendation(
    recommendations: Dict[str, Dict[str, Any]],
    movie: Dict[str, Any],
    score: float,
    source: str,
    matched_genres: List[str]
) -> None:
    imdb_id = movie.get("imdbID")
    if not imdb_id:
        return

    if imdb_id not in recommendations:
        recommendations[imdb_id] = {
            "movie": movie,
            "score": 0,
            "sources": set(),
            "matched_genres": set(),
        }

    recommendations[imdb_id]["score"] += score
    recommendations[imdb_id]["sources"].add(source)
    recommendations[imdb_id]["matched_genres"].update(matched_genres)


def build_recommendation_reason(sources: List[str], matched_genres: List[str]) -> str:
    source_labels = {
        "content": "phù hợp với hành vi xem và đánh giá của bạn",
        "collaborative": "được người dùng có gu tương đồng xem hoặc đánh giá cao",
        "discovery": "mở rộng sang thể loại ít xuất hiện trong lịch sử của bạn"
    }
    reason = ", ".join(source_labels[source] for source in sources if source in source_labels)
    if matched_genres:
        return f"{reason}. Thể loại liên quan: {', '.join(matched_genres[:3])}"
    return reason


async def get_user_from_access_token(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Resolve the current user from an Authorization: Bearer token header.
    """
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


async def get_admin_user(user: Dict[str, Any] = Depends(get_user_from_access_token)) -> Dict[str, Any]:
    email = (user.get("email") or "").lower()
    if user.get("is_admin") is True or user.get("role") == "admin" or email in ADMIN_EMAILS:
        return user
    raise HTTPException(status_code=403, detail="Admin permission required")


async def get_optional_user(token: Optional[str] = Depends(optional_oauth2_scheme)) -> Optional[Dict[str, Any]]:
    if not token:
        return None

    payload = verify_token(token)
    if not payload:
        return None

    email = payload.get("sub")
    if not email:
        return None

    return await db.users.find_one({"email": email})


# ============================================================================
# API Routes
# ============================================================================

@app.get("/", tags=["Health"])
async def root() -> Dict[str, str]:
    """
    Health check endpoint to verify the API is running.
    
    Returns:
        dict: Status message
    """
    return {"message": "OK", "status": "API is running"}


@app.get("/movies", tags=["Movies"], response_model=Dict[str, Any])
async def get_movies(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=MOVIE_PAGE_MAX_LIMIT)
) -> Dict[str, Any]:
    """
    Retrieve a paginated list of movies sorted by release date.
    
    Args:
        page: Page number (default: 1)
        limit: Number of movies per page (default: 30)
    
    Returns:
        dict: Contains page info and list of movies
        
    Example:
        GET /movies?page=1&limit=10
    """
    try:
        skip = (page - 1) * limit
        
        # Calculate yesterday's date
        yesterday = (datetime.now() - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

        base_pipeline = [
            {
                "$addFields": {
                    "releasedDate": {
                        "$dateFromString": {
                            "dateString": "$Released",
                            "format": "%d %b %Y",
                            "onError": None, 
                            "onNull": None    
                        }
                    }
                }
            },
            {
                "$match": {
                    "releasedDate": {"$lte": yesterday}
                }
            },
        ]
        pipeline = [
            *base_pipeline,
            {"$sort": {"releasedDate": -1}},  
            {"$skip": skip},
            {"$limit": limit}
        ]
        count_pipeline = [
            *base_pipeline,
            {"$count": "total"}
        ]

        movies: List[Dict[str, Any]] = []
        cursor = db.movies.aggregate(pipeline)

        async for movie in cursor:
            movie["id"] = str(movie["_id"])
            del movie["_id"]
            movies.append(movie)

        count_result = await db.movies.aggregate(count_pipeline).to_list(length=1)
        total = count_result[0]["total"] if count_result else 0

        return {
            "page": page,
            "limit": limit,
            "total": total,
            "data": movies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving movies: {str(e)}")


@app.get("/movies/{imdb_id}", tags=["Movies"], response_model=Dict[str, Any])
async def get_movie(imdb_id: str) -> Dict[str, Any]:
    """
    Retrieve detailed information about a specific movie by IMDb ID.
    Only returns movies with release date on or before yesterday.
    
    Args:
        imdb_id: IMDb ID of the movie (e.g., "tt1234567")
    
    Returns:
        dict: Complete movie information
        
    Raises:
        HTTPException: 404 if movie not found or release date is not valid
        
    Example:
        GET /movies/tt0111161
    """
    try:
        movie = await db.movies.find_one({"imdbID": imdb_id})
        if movie:
            # Check if movie has valid release date (on or before yesterday)
            if not is_valid_release_date(movie.get("Released", "N/A")):
                raise HTTPException(
                    status_code=404, 
                    detail=f"Movie with IMDb ID '{imdb_id}' has not been released yet or release date is invalid"
                )
            
            movie["id"] = str(movie["_id"])
            del movie["_id"]
            return movie
        raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{imdb_id}' not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving movie: {str(e)}")


@app.get("/movies/{imdb_id}/reviews", tags=["Reviews"], response_model=Dict[str, Any])
async def get_movie_reviews(imdb_id: str) -> Dict[str, Any]:
    """
    Retrieve user reviews for a movie.
    """
    try:
        reviews: List[Dict[str, Any]] = []
        cursor = db.movie_reviews.find({
            "imdb_id": imdb_id,
            "$or": [{"status": "approved"}, {"status": {"$exists": False}}]
        }).sort("updated_at", -1)

        async for review in cursor:
            review["id"] = str(review["_id"])
            del review["_id"]
            reviews.append(review)

        review_count = len(reviews)
        average_rating = round(
            sum(review["rating"] for review in reviews) / review_count,
            1
        ) if review_count else 0

        return {
            "imdb_id": imdb_id,
            "average_rating": average_rating,
            "review_count": review_count,
            "data": reviews
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving reviews: {str(e)}")


@app.post("/movies/{imdb_id}/reviews", tags=["Reviews"], response_model=Dict[str, Any])
async def upsert_movie_review(
    imdb_id: str,
    review_data: MovieReviewCreate,
    user: Dict[str, Any] = Depends(get_user_from_access_token)
) -> Dict[str, Any]:
    """
    Create or update the current user's review for a movie.
    """
    try:
        movie = await db.movies.find_one({"imdbID": imdb_id})
        if not movie:
            raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{imdb_id}' not found")
        if not review_data.content.strip():
            raise HTTPException(status_code=400, detail="Review content cannot be empty")

        now = datetime.now()
        user_id = str(user["_id"])
        existing_review = await db.movie_reviews.find_one({
            "imdb_id": imdb_id,
            "user_id": user_id
        })

        review_doc = {
            "imdb_id": imdb_id,
            "user_id": user_id,
            "user_name": user["full_name"],
            "rating": review_data.rating,
            "content": review_data.content.strip(),
            "status": "pending",
            "updated_at": now
        }

        if existing_review:
            await db.movie_reviews.update_one(
                {"_id": existing_review["_id"]},
                {"$set": review_doc}
            )
            review_id = existing_review["_id"]
            created_at = existing_review.get("created_at", now)
        else:
            review_doc["created_at"] = now
            result = await db.movie_reviews.insert_one(review_doc)
            review_id = result.inserted_id
            created_at = now

        await db.ratings.update_one(
            {"UserId": user_id, "MovieId": imdb_id},
            {
                "$set": {
                    "Score": review_data.rating,
                    "source": "review",
                    "updated_at": now
                },
                "$setOnInsert": {
                    "UserId": user_id,
                    "MovieId": imdb_id,
                    "created_at": now
                }
            },
            upsert=True
        )
        rating_summary = await recalculate_movie_rating(imdb_id)

        saved_review = {
            **review_doc,
            "id": str(review_id),
            "created_at": created_at
        }

        return {
            "message": "Review saved successfully",
            "review": saved_review,
            "rating_summary": rating_summary
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving review: {str(e)}")


# ============================================================================
# Rating Routes
# ============================================================================

@app.get("/movies/{imdb_id}/ratings", tags=["Ratings"], response_model=Dict[str, Any])
async def get_movie_ratings(
    imdb_id: str,
    user: Optional[Dict[str, Any]] = Depends(get_optional_user)
) -> Dict[str, Any]:
    """
    Retrieve rating aggregate for a movie and the current user's rating.
    """
    try:
        movie = await db.movies.find_one({"imdbID": imdb_id})
        if not movie:
            raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{imdb_id}' not found")

        rating_summary = await recalculate_movie_rating(imdb_id)
        user_rating = None
        if user:
            rating_doc = await db.ratings.find_one({"UserId": str(user["_id"]), "MovieId": imdb_id})
            if rating_doc:
                user_rating = serialize_document(rating_doc)

        return {
            "movie_id": imdb_id,
            "average_score": rating_summary["average"],
            "rating_count": rating_summary["count"],
            "user_rating": user_rating
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving ratings: {str(e)}")


@app.post("/movies/{imdb_id}/ratings", tags=["Ratings"], response_model=Dict[str, Any])
async def upsert_movie_rating(
    imdb_id: str,
    rating_data: RatingCreate,
    user: Dict[str, Any] = Depends(get_user_from_access_token)
) -> Dict[str, Any]:
    """
    Create or update the current user's score for a movie.
    """
    try:
        movie = await db.movies.find_one({"imdbID": imdb_id})
        if not movie:
            raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{imdb_id}' not found")

        now = datetime.now()
        user_id = str(user["_id"])
        await db.ratings.update_one(
            {"UserId": user_id, "MovieId": imdb_id},
            {
                "$set": {
                    "Score": rating_data.score,
                    "source": "rating",
                    "updated_at": now
                },
                "$setOnInsert": {
                    "UserId": user_id,
                    "MovieId": imdb_id,
                    "created_at": now
                }
            },
            upsert=True
        )
        await db.movie_reviews.update_one(
            {"user_id": user_id, "imdb_id": imdb_id},
            {"$set": {"rating": rating_data.score, "updated_at": now}}
        )

        rating = await db.ratings.find_one({"UserId": user_id, "MovieId": imdb_id})
        rating_summary = await recalculate_movie_rating(imdb_id)
        return {
            "message": "Rating saved successfully",
            "rating": serialize_document(rating),
            "rating_summary": rating_summary
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving rating: {str(e)}")


@app.get("/ratings/me", tags=["Ratings"], response_model=Dict[str, Any])
async def get_my_ratings(
    user: Dict[str, Any] = Depends(get_user_from_access_token),
    limit: int = 100
) -> Dict[str, Any]:
    try:
        limit = max(1, min(limit, 200))
        user_id = str(user["_id"])
        ratings = await db.ratings.find({"UserId": user_id}).sort("updated_at", -1).limit(limit).to_list(length=limit)
        movie_ids = [rating["MovieId"] for rating in ratings if rating.get("MovieId")]
        movies = await db.movies.find(
            {"imdbID": {"$in": movie_ids}},
            {"imdbID": 1, "Title": 1, "Poster": 1, "Year": 1}
        ).to_list(length=limit)
        movie_map = {movie["imdbID"]: serialize_document(movie) for movie in movies}
        data = []
        for rating in ratings:
            serialized = serialize_document(rating)
            serialized["movie"] = movie_map.get(rating.get("MovieId"))
            data.append(serialized)
        return {"total": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving user ratings: {str(e)}")


# ============================================================================
# Watch History Routes
# ============================================================================

@app.post("/watch-history/{movie_id}/visit", tags=["Watch History"], response_model=Dict[str, Any])
async def record_movie_visit(
    movie_id: str,
    user: Dict[str, Any] = Depends(get_user_from_access_token)
) -> Dict[str, Any]:
    """
    Track that a logged-in user opened a movie detail page.
    This increments watched_count and updates last_watched_at.
    """
    try:
        movie = await db.movies.find_one({"imdbID": movie_id})
        if not movie:
            raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{movie_id}' not found")

        now = datetime.now()
        user_id = str(user["_id"])

        await db.WatchHistory.update_one(
            {"UserId": user_id, "MovieId": movie_id},
            {
                "$set": {
                    "LastWatchedAt": now,
                    "updated_at": now
                },
                "$setOnInsert": {
                    "UserId": user_id,
                    "MovieId": movie_id,
                    "TotalAccessTime": 0,
                    "created_at": now
                },
                "$inc": {"WatchedCount": 1}
            },
            upsert=True
        )

        history = await db.WatchHistory.find_one({"UserId": user_id, "MovieId": movie_id})

        return {
            "message": "Watch history visit recorded",
            "history": serialize_watch_history(history)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recording watch history: {str(e)}")


@app.put("/watch-history/{movie_id}/time", tags=["Watch History"], response_model=Dict[str, Any])
async def update_movie_access_time(
    movie_id: str,
    time_data: WatchTimeUpdate,
    user: Dict[str, Any] = Depends(get_user_from_access_token)
) -> Dict[str, Any]:
    """
    Add active access time in seconds to a logged-in user's movie history.
    """
    try:
        if not time_data.active:
            return {
                "message": "Inactive watch time ignored",
                "matched_count": 0,
                "history": None
            }

        active_seconds = min(time_data.seconds, WATCH_TIME_SYNC_CAP_SECONDS)
        now = datetime.now()
        user_id = str(user["_id"])

        result = await db.WatchHistory.update_one(
            {"UserId": user_id, "MovieId": movie_id},
            {
                "$set": {
                    "LastWatchedAt": now,
                    "updated_at": now
                },
                "$setOnInsert": {
                    "UserId": user_id,
                    "MovieId": movie_id,
                    "WatchedCount": 1,
                    "EngagedWatchCount": 0,
                    "TotalAccessTime": 0,
                    "created_at": now
                },
                "$inc": {"TotalAccessTime": active_seconds}
            },
            upsert=True
        )

        history = await db.WatchHistory.find_one({"UserId": user_id, "MovieId": movie_id})
        if (
            history
            and not history.get("EngagedAt")
            and history.get("TotalAccessTime", 0) >= WATCH_TIME_MIN_ENGAGED_SECONDS
        ):
            await db.WatchHistory.update_one(
                {"UserId": user_id, "MovieId": movie_id},
                {
                    "$set": {"EngagedAt": now, "updated_at": now},
                    "$inc": {"EngagedWatchCount": 1}
                }
            )
            history = await db.WatchHistory.find_one({"UserId": user_id, "MovieId": movie_id})

        return {
            "message": "Watch history time updated",
            "matched_count": result.matched_count,
            "seconds_recorded": active_seconds,
            "history": serialize_watch_history(history)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating watch time: {str(e)}")


@app.get("/watch-history", tags=["Watch History"], response_model=Dict[str, Any])
async def get_watch_history(
    user: Dict[str, Any] = Depends(get_user_from_access_token),
    limit: int = 50
) -> Dict[str, Any]:
    """
    Retrieve the current user's watch history.
    """
    try:
        user_id = str(user["_id"])
        histories: List[Dict[str, Any]] = []
        cursor = db.WatchHistory.find({"UserId": user_id}).sort("LastWatchedAt", -1).limit(limit)

        async for history in cursor:
            histories.append(serialize_watch_history(history))

        return {
            "total": len(histories),
            "data": histories
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving watch history: {str(e)}")


# ============================================================================
# Recommendation Routes
# ============================================================================

@app.get("/recommendations", tags=["Recommendations"], response_model=Dict[str, Any])
async def get_recommendations(
    user: Dict[str, Any] = Depends(get_user_from_access_token),
    limit: int = 24
) -> Dict[str, Any]:
    """
    Recommend movies using personal behavior, similar users, and light discovery.
    """
    try:
        user_id = str(user["_id"])
        limit = max(1, min(limit, 50))

        histories = await db.WatchHistory.find({"UserId": user_id}).to_list(length=500)
        user_reviews = await db.movie_reviews.find({"user_id": user_id}).to_list(length=500)
        user_ratings = await db.ratings.find({"UserId": user_id}).to_list(length=500)
        interacted_movie_ids = {
            history["MovieId"] for history in histories if history.get("MovieId")
        } | {
            review["imdb_id"] for review in user_reviews if review.get("imdb_id")
        } | {
            rating["MovieId"] for rating in user_ratings if rating.get("MovieId")
        }

        interacted_movies = await db.movies.find({"imdbID": {"$in": list(interacted_movie_ids)}}).to_list(length=500)
        interacted_movie_map = {movie["imdbID"]: movie for movie in interacted_movies}

        genre_scores: Dict[str, float] = {}
        for genre in user.get("favorite_genres", []):
            genre_scores[genre] = genre_scores.get(genre, 0) + 8

        for history in histories:
            movie = interacted_movie_map.get(history.get("MovieId"))
            if not movie:
                continue
            interaction_score = build_interaction_score(
                history.get("EngagedWatchCount", history.get("WatchedCount", 0)),
                history.get("TotalAccessTime", 0),
                history.get("LastWatchedAt"),
                count_weight=2.2,
                minute_weight=0.18,
            )
            add_genre_score(genre_scores, movie, interaction_score)

        for review in user_reviews:
            movie = interacted_movie_map.get(review.get("imdb_id"))
            if not movie:
                continue
            rating = review.get("rating", 0)
            if rating >= 4:
                add_genre_score(genre_scores, movie, rating * 2.5 * recency_decay(review.get("updated_at")))
            elif rating <= 2:
                add_genre_score(genre_scores, movie, -3 * recency_decay(review.get("updated_at")))

        for rating_doc in user_ratings:
            movie = interacted_movie_map.get(rating_doc.get("MovieId"))
            if not movie:
                continue
            score = rating_doc.get("Score", 0)
            if score >= 4:
                add_genre_score(genre_scores, movie, score * 2.8 * recency_decay(rating_doc.get("updated_at")))
            elif score <= 2:
                add_genre_score(genre_scores, movie, -3.5 * recency_decay(rating_doc.get("updated_at")))

        candidate_cache = await get_candidate_movie_cache()
        all_movies = candidate_cache["movies"]
        genre_frequency = candidate_cache["genre_frequency"]

        recommendations: Dict[str, Dict[str, Any]] = {}
        top_genres = {
            genre for genre, _ in sorted(genre_scores.items(), key=lambda item: item[1], reverse=True)[:6]
        }

        # Simple content-based score: favorite genres, watched genres, high user ratings, access time.
        for movie in all_movies:
            imdb_id = movie.get("imdbID")
            if not imdb_id or imdb_id in interacted_movie_ids:
                continue

            movie_genres = parse_movie_genres(movie)
            matched_genres = [genre for genre in movie_genres if genre in genre_scores and genre_scores[genre] > 0]
            content_score = sum(max(genre_scores.get(genre, 0), 0) for genre in matched_genres)

            if content_score > 0:
                imdb_rating = parse_float(movie.get("imdbRating"))
                merge_recommendation(
                    recommendations,
                    movie,
                    min(content_score, 45) + imdb_rating * 0.35,
                    "content",
                    matched_genres
                )

        # Collaborative score: compare genre vectors, then borrow movies from similar users.
        all_histories = await db.WatchHistory.find({"UserId": {"$ne": user_id}}).to_list(length=2000)
        all_reviews = await db.movie_reviews.find({"user_id": {"$ne": user_id}}).to_list(length=2000)
        all_ratings = await db.ratings.find({"UserId": {"$ne": user_id}}).to_list(length=2000)
        other_movie_ids = {
            history["MovieId"] for history in all_histories if history.get("MovieId")
        } | {
            review["imdb_id"] for review in all_reviews if review.get("imdb_id")
        } | {
            rating["MovieId"] for rating in all_ratings if rating.get("MovieId")
        }
        other_movies = await db.movies.find({"imdbID": {"$in": list(other_movie_ids)}}).to_list(length=1000)
        other_movie_map = {movie["imdbID"]: movie for movie in other_movies}
        all_movie_map = {movie["imdbID"]: movie for movie in all_movies if movie.get("imdbID")}
        all_movie_map.update(other_movie_map)

        user_vectors: Dict[str, Dict[str, float]] = {}
        user_movie_scores: Dict[str, Dict[str, float]] = {}

        for history in all_histories:
            other_user_id = history.get("UserId")
            movie_id = history.get("MovieId")
            movie = all_movie_map.get(movie_id)
            if not other_user_id or not movie:
                continue

            interaction_score = build_interaction_score(
                history.get("EngagedWatchCount", history.get("WatchedCount", 0)),
                history.get("TotalAccessTime", 0),
                history.get("LastWatchedAt"),
                count_weight=1.6,
                minute_weight=0.12,
            )
            user_vectors.setdefault(other_user_id, {})
            user_movie_scores.setdefault(other_user_id, {})
            add_genre_score(user_vectors[other_user_id], movie, interaction_score)
            user_movie_scores[other_user_id][movie_id] = user_movie_scores[other_user_id].get(movie_id, 0) + interaction_score

        for review in all_reviews:
            other_user_id = review.get("user_id")
            movie_id = review.get("imdb_id")
            movie = all_movie_map.get(movie_id)
            rating = review.get("rating", 0)
            if not other_user_id or not movie or rating < 4:
                continue

            interaction_score = rating * 2 * recency_decay(review.get("updated_at"))
            user_vectors.setdefault(other_user_id, {})
            user_movie_scores.setdefault(other_user_id, {})
            add_genre_score(user_vectors[other_user_id], movie, interaction_score)
            user_movie_scores[other_user_id][movie_id] = user_movie_scores[other_user_id].get(movie_id, 0) + interaction_score

        for rating_doc in all_ratings:
            other_user_id = rating_doc.get("UserId")
            movie_id = rating_doc.get("MovieId")
            movie = all_movie_map.get(movie_id)
            score = rating_doc.get("Score", 0)
            if not other_user_id or not movie or score < 4:
                continue

            interaction_score = score * 2.2 * recency_decay(rating_doc.get("updated_at"))
            user_vectors.setdefault(other_user_id, {})
            user_movie_scores.setdefault(other_user_id, {})
            add_genre_score(user_vectors[other_user_id], movie, interaction_score)
            user_movie_scores[other_user_id][movie_id] = user_movie_scores[other_user_id].get(movie_id, 0) + interaction_score

        similar_users = [
            (other_user_id, cosine_similarity(genre_scores, vector))
            for other_user_id, vector in user_vectors.items()
        ]
        similar_users = [
            item for item in sorted(similar_users, key=lambda item: item[1], reverse=True)
            if item[1] >= 0.12
        ][:10]

        for other_user_id, similarity in similar_users:
            for movie_id, interaction_score in user_movie_scores.get(other_user_id, {}).items():
                if movie_id in interacted_movie_ids:
                    continue

                movie = all_movie_map.get(movie_id)
                if not movie:
                    continue

                matched_genres = [genre for genre in parse_movie_genres(movie) if genre in top_genres]
                merge_recommendation(
                    recommendations,
                    movie,
                    min(similarity * interaction_score * 1.8, 35),
                    "collaborative",
                    matched_genres
                )

        # Discovery score: lightly inject low-frequency or non-favorite genres for diversity.
        low_frequency_genres = {
            genre for genre, _ in sorted(genre_frequency.items(), key=lambda item: item[1])[:8]
        }
        for movie in all_movies:
            imdb_id = movie.get("imdbID")
            if not imdb_id or imdb_id in interacted_movie_ids:
                continue

            movie_genres = parse_movie_genres(movie)
            discovery_genres = [
                genre for genre in movie_genres
                if genre in low_frequency_genres or (top_genres and genre not in top_genres)
            ]
            if not discovery_genres:
                continue

            imdb_rating = parse_float(movie.get("imdbRating"))
            if imdb_rating < 6.5:
                continue

            merge_recommendation(
                recommendations,
                movie,
                1.5 + imdb_rating * 0.15,
                "discovery",
                discovery_genres[:2]
            )

        sorted_recommendations = sorted(
            recommendations.values(),
            key=lambda item: item["score"],
            reverse=True
        )

        # Let discovery items appear occasionally instead of only at the end.
        discovery_items = [item for item in sorted_recommendations if item["sources"] == {"discovery"}]
        primary_items = [item for item in sorted_recommendations if item["sources"] != {"discovery"}]
        blended_items: List[Dict[str, Any]] = []
        discovery_index = 0

        for index, item in enumerate(primary_items):
            blended_items.append(item)
            if (index + 1) % 5 == 0 and discovery_index < len(discovery_items):
                blended_items.append(discovery_items[discovery_index])
                discovery_index += 1

        blended_items.extend(discovery_items[discovery_index:])
        if not blended_items:
            blended_items = sorted_recommendations

        response_movies: List[Dict[str, Any]] = []
        for item in blended_items[:limit]:
            movie = serialize_movie(item["movie"].copy())
            sources = sorted(item["sources"])
            movie["recommendationScore"] = normalize_score(item["score"])
            movie["rawRecommendationScore"] = round(item["score"], 2)
            movie["recommendationSources"] = sources
            movie["matchedGenres"] = sorted(item["matched_genres"])
            movie["recommendationReason"] = build_recommendation_reason(sources, movie["matchedGenres"])
            response_movies.append(movie)

        return {
            "algorithm": {
                "content": "favorite genres + watch count + access time + high personal ratings",
                "collaborative": "genre-vector similarity with other users, then movies they watched or rated highly",
                "discovery": "low-frequency and non-primary genres blended with lower weight"
            },
            "favorite_genres": user.get("favorite_genres", []),
            "learned_genres": sorted(genre_scores.items(), key=lambda item: item[1], reverse=True)[:10],
            "similar_user_count": len(similar_users),
            "total": len(response_movies),
            "data": response_movies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")


@app.post("/movies/fetch/{imdb_id}", tags=["Movies"], response_model=Dict[str, Any])
async def fetch_and_save_movie(imdb_id: str) -> Dict[str, Any]:
    """
    Fetch movie data from OMDB API and save it to MongoDB.
    
    Args:
        imdb_id: IMDb ID of the movie
    
    Returns:
        dict: Status message and inserted movie ID
        
    Raises: 
        HTTPException: 404 if movie not found in OMDB
        
    Example:
        POST /movies/fetch/tt0111161
    """
    try:
        movie_data = await fetch_movie_by_imdb_id(imdb_id)
        if not movie_data:
            raise HTTPException(status_code=404, detail="Movie not found in OMDB API")
        
        # Check if movie already exists in database
        existing = await db.movies.find_one({"imdbID": imdb_id})
        if existing:
            return {
                "message": "Movie already exists in database",
                "id": str(existing["_id"])
            }
        
        # Insert movie to database
        movie_doc = movie_data.dict()
        result = await db.movies.insert_one(movie_doc)
        await sync_movie_actor_award_documents(movie_doc)
        return {
            "message": "Movie successfully saved",
            "id": str(result.inserted_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving movie: {str(e)}")


@app.get("/search", tags=["Search"], response_model=Dict[str, Any])
async def search_movies(
    title: str,
    page: int = 1
) -> Dict[str, Any]:
    """
    Search for movies by title using OMDB API.
    
    Args:
        title: Movie title or partial title to search for
        page: Page number of search results (default: 1)
    
    Returns:
        dict: Search results from OMDB API
        
    Example:
        GET /search?title=Inception&page=1
    """
    if not title or len(title.strip()) == 0:
        raise HTTPException(status_code=400, detail="Title parameter cannot be empty")
    
    try:
        result = await search_movies_by_title(title, page)
        if result and result.get('Response') == 'True':
            return result
        return {
            "Response": "False",
            "Error": "No movies found matching your search"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching movies: {str(e)}")


# ============================================================================
# Actor Routes
# ============================================================================

@app.get("/actors", tags=["Actors"], response_model=Dict[str, Any])
async def get_actors(
    page: int = 1,
    limit: int = 30,
    search: str = ""
) -> Dict[str, Any]:
    try:
        page = max(page, 1)
        limit = max(1, min(limit, 100))
        query: Dict[str, Any] = {}
        if search.strip():
            query = {"name": {"$regex": search.strip(), "$options": "i"}}

        total = await db.actors.count_documents(query)
        cursor = db.actors.find(query).sort("name", 1).skip((page - 1) * limit).limit(limit)
        actors = [serialize_document(actor) async for actor in cursor]
        return {"page": page, "limit": limit, "total": total, "data": actors}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving actors: {str(e)}")


@app.get("/movies/{imdb_id}/actors", tags=["Actors"], response_model=Dict[str, Any])
async def get_movie_actors(imdb_id: str) -> Dict[str, Any]:
    try:
        movie = await db.movies.find_one({"imdbID": imdb_id})
        if not movie:
            raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{imdb_id}' not found")

        actor_names = [
            name.strip()
            for name in (movie.get("Actors") or "").split(",")
            if name.strip() and name.strip() != "N/A"
        ]
        actors = await db.actors.find({"name": {"$in": actor_names}}).sort("name", 1).to_list(length=100)
        return {
            "movie_id": imdb_id,
            "total": len(actors),
            "data": [serialize_document(actor) for actor in actors]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving movie actors: {str(e)}")


@app.get("/actors/search", tags=["Actors"], response_model=Dict[str, Any])
async def search_actors(name: str, page: int = 1) -> Dict[str, Any]:
    """
    Search for actors by name using TMDB API.
    
    Args:
        name: Actor name to search for
        page: Page number of search results (default: 1)
    
    Returns:
        dict: Search results with actor information
        
    Example:
        GET /actors/search?name=Tom%20Hanks&page=1
    """
    if not name or len(name.strip()) == 0:
        raise HTTPException(status_code=400, detail="Actor name cannot be empty")
    
    try:
        result = await search_person(name, page)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching actors: {str(e)}")


@app.get("/actors/{actor_id}", tags=["Actors"], response_model=Dict[str, Any])
async def get_actor(actor_id: int) -> Dict[str, Any]:
    """
    Retrieve detailed information about an actor by TMDB ID.
    First checks the database, if not found fetches from TMDB and saves it.
    
    Args:
        actor_id: TMDB actor ID
    
    Returns:
        dict: Complete actor information
        
    Example:
        GET /actors/31
    """
    try:
        # Check if actor exists in database
        actor = await db.actors.find_one({"id": actor_id})
        if actor:
            actor["_id"] = str(actor["_id"])
            return actor
        
        # If not found, fetch from TMDB
        actor_data = await fetch_person_details(actor_id)
        
        if not actor_data or actor_data.get("success") == False:
            raise HTTPException(status_code=404, detail=f"Actor with ID {actor_id} not found")
        
        # Save to database
        actor_data["id"] = actor_id
        result = await db.actors.insert_one(actor_data)
        actor_data["_id"] = str(result.inserted_id)
        
        return actor_data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving actor: {str(e)}")


@app.post("/actors/fetch/{actor_id}", tags=["Actors"], response_model=Dict[str, Any])
async def fetch_and_save_actor(actor_id: int) -> Dict[str, Any]:
    """
    Fetch actor data from TMDB API and save it to MongoDB if not already exists.
    
    Args:
        actor_id: TMDB actor ID
    
    Returns:
        dict: Status message and actor information
        
    Example:
        POST /actors/fetch/31
    """
    try:
        # Check if already exists
        existing = await db.actors.find_one({"id": actor_id})
        if existing:
            existing["_id"] = str(existing["_id"])
            return {
                "message": "Actor already exists in database",
                "actor": existing
            }
        
        # Fetch from TMDB
        actor_data = await fetch_person_details(actor_id)
        
        if not actor_data or actor_data.get("success") == False:
            raise HTTPException(status_code=404, detail="Actor not found in TMDB")
        
        # Save to database
        actor_data["id"] = actor_id
        result = await db.actors.insert_one(actor_data)
        actor_data["_id"] = str(result.inserted_id)
        
        return {
            "message": "Actor successfully saved",
            "actor": actor_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving actor: {str(e)}")


# ============================================================================
# Award Routes
# ============================================================================

@app.get("/awards", tags=["Awards"], response_model=Dict[str, Any])
async def get_awards(
    page: int = 1,
    limit: int = 30,
    movie_id: str = ""
) -> Dict[str, Any]:
    try:
        page = max(page, 1)
        limit = max(1, min(limit, 100))
        query: Dict[str, Any] = {}
        if movie_id.strip():
            query["movie_id"] = movie_id.strip()

        total = await db.awards.count_documents(query)
        cursor = db.awards.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
        awards = [serialize_document(award) async for award in cursor]
        return {"page": page, "limit": limit, "total": total, "data": awards}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving awards: {str(e)}")


@app.get("/movies/{imdb_id}/awards", tags=["Awards"], response_model=Dict[str, Any])
async def get_movie_awards(imdb_id: str) -> Dict[str, Any]:
    try:
        movie = await db.movies.find_one({"imdbID": imdb_id})
        if not movie:
            raise HTTPException(status_code=404, detail=f"Movie with IMDb ID '{imdb_id}' not found")

        awards = await db.awards.find({"movie_id": imdb_id}).sort("created_at", -1).to_list(length=100)
        return {
            "movie_id": imdb_id,
            "total": len(awards),
            "data": [serialize_document(award) for award in awards]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving movie awards: {str(e)}")


# ============================================================================
# Authentication Routes
# ============================================================================

@app.post("/auth/register", tags=["Authentication"], response_model=Dict[str, Any])
async def register(user_data: UserRegister) -> Dict[str, Any]:
    """
    Register a new user with email verification.
    
    Args:
        user_data: User registration data (email, password, full_name)
    
    Returns:
        dict: Registration status and message
        
    Raises:
        HTTPException: 400 if email already exists
        
    Example:
        POST /auth/register
        {
            "email": "user@example.com",
            "password": "securepassword",
            "full_name": "John Doe"
        }
    """
    try:
        # Check if user already exists
        existing_user = await db.users.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password
        hashed_password = hash_password(user_data.password)
        
        # Create activation token
        activation_token = create_activation_token(user_data.email)
        
        # Create user document
        user_doc = {
            "email": user_data.email,
            "password": hashed_password,
            "full_name": user_data.full_name,
            "is_activated": False,
            "activation_token": activation_token,
            "favorite_genres": [],
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Insert user to database
        result = await db.users.insert_one(user_doc)
        
        # Send activation email
        send_activation_email(user_data.email, user_data.full_name, activation_token)
        
        return {
            "message": "Registration successful! Please check your email to activate your account.",
            "email": user_data.email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during registration: {str(e)}")


@app.get("/auth/activate", tags=["Authentication"], response_model=Dict[str, Any])
async def activate_account(token: str) -> Dict[str, Any]:
    """
    Activate a user account with activation token.
    
    Args:
        token: Activation token from email
    
    Returns:
        dict: Activation status
        
    Example:
        GET /auth/activate?token=<activation_token>
    """
    try:
        # Verify token
        payload = verify_token(token)
        if not payload or payload.get("type") != "activation":
            raise HTTPException(status_code=400, detail="Invalid or expired activation token")
        
        email = payload.get("email")
        
        # Update user as activated
        result = await db.users.update_one(
            {"email": email},
            {
                "$set": {"is_activated": True, "updated_at": datetime.now()},
                "$unset": {"activation_token": ""}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "message": "Account activated successfully! You can now login.",
            "email": email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during activation: {str(e)}")


@app.post("/auth/login", tags=["Authentication"], response_model=TokenResponse)
async def login(user_data: UserLogin) -> TokenResponse:
    """
    Login user and return access token.
    
    Args:
        user_data: User login credentials (email, password)
    
    Returns:
        TokenResponse: Access token and user info
        
    Raises:
        HTTPException: 401 if credentials invalid or account not activated
        
    Example:
        POST /auth/login
        {
            "email": "user@example.com",
            "password": "securepassword"
        }
    """
    try:
        # Find user
        user = await db.users.find_one({"email": user_data.email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Verify password
        if not verify_password(user_data.password, user["password"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Check if account is activated
        if not user.get("is_activated", False):
            raise HTTPException(
                status_code=403, 
                detail="Account not activated. Please check your email for activation link."
            )
        
        # Create access token
        access_token = create_access_token({"sub": user["email"]})
        
        # Send login notification email (async)
        login_time = datetime.now().strftime("%d %b %Y %H:%M:%S")
        send_login_email(user["email"], user["full_name"], login_time)
        
        # Update last login
        await db.users.update_one(
            {"email": user_data.email},
            {"$set": {"last_login": datetime.now()}}
        )
        
        return TokenResponse(
            access_token=access_token,
            user=UserResponse(
                id=str(user["_id"]),
                email=user["email"],
                full_name=user["full_name"],
                is_activated=user.get("is_activated", False),
                favorite_genres=user.get("favorite_genres", []),
                created_at=user.get("created_at")
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during login: {str(e)}")


@app.get("/auth/me", tags=["Authentication"], response_model=UserResponse)
async def get_current_user(user: Dict[str, Any] = Depends(get_user_from_access_token)) -> UserResponse:
    """
    Get current user information from token.
    
    Args:
        Authorization header: Bearer access token
    
    Returns:
        UserResponse: Current user information
        
    Example:
        GET /auth/me
        Authorization: Bearer <access_token>
    """
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user["full_name"],
        is_activated=user.get("is_activated", False),
        favorite_genres=user.get("favorite_genres", []),
        created_at=user.get("created_at")
    )


@app.put("/auth/me/favorite-genres", tags=["Authentication"], response_model=Dict[str, Any])
async def update_favorite_genres(
    genres_data: UpdateFavoriteGenres,
    user: Dict[str, Any] = Depends(get_user_from_access_token)
) -> Dict[str, Any]:
    """
    Update user's favorite genres.
    
    Args:
        genres_data: List of favorite genres
        Authorization header: Bearer access token
    
    Returns:
        dict: Update status
        
    Example:
        PUT /auth/me/favorite-genres
        Authorization: Bearer <access_token>
        {
            "favorite_genres": ["Action", "Comedy", "Drama"]
        }
    """
    try:
        # Update user favorite genres
        result = await db.users.update_one(
            {"email": user["email"]},
            {"$set": {"favorite_genres": genres_data.favorite_genres, "updated_at": datetime.now()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "message": "Favorite genres updated successfully",
            "favorite_genres": genres_data.favorite_genres
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating favorite genres: {str(e)}")


# ============================================================================
# Admin Routes
# ============================================================================

@app.get("/admin/summary", tags=["Admin"], response_model=Dict[str, Any])
async def get_admin_summary(
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        movie_count = await db.movies.count_documents({})
        user_count = await db.users.count_documents({})
        review_count = await db.movie_reviews.count_documents({})
        rating_count = await db.ratings.count_documents({})
        pending_review_count = await db.movie_reviews.count_documents({"status": "pending"})
        watch_count = await db.WatchHistory.count_documents({})
        actor_count = await db.actors.count_documents({})
        award_count = await db.awards.count_documents({})

        genre_pipeline = [
            {"$project": {"genres": {"$split": [{"$ifNull": ["$Genre", ""]}, ","]}}},
            {"$unwind": "$genres"},
            {"$project": {"genre": {"$trim": {"input": "$genres"}}}},
            {"$match": {"genre": {"$ne": ""}}},
            {"$group": {"_id": "$genre", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        rating_pipeline = [
            {
                "$project": {
                    "rating": {
                        "$convert": {
                            "input": "$imdbRating",
                            "to": "double",
                            "onError": None,
                            "onNull": None
                        }
                    }
                }
            },
            {"$match": {"rating": {"$ne": None}}},
            {"$group": {"_id": None, "average": {"$avg": "$rating"}, "max": {"$max": "$rating"}}}
        ]
        review_rating_pipeline = [
            {"$group": {"_id": "$Score", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]

        top_genres = [{"genre": item["_id"], "count": item["count"]} async for item in db.movies.aggregate(genre_pipeline)]
        movie_rating_summary = [item async for item in db.movies.aggregate(rating_pipeline)]
        review_rating_distribution = [
            {"rating": item["_id"], "count": item["count"]}
            async for item in db.ratings.aggregate(review_rating_pipeline)
        ]

        quality_checks = await collect_quality_checks()

        return {
            "counts": {
                "movies": movie_count,
                "users": user_count,
                "reviews": review_count,
                "ratings": rating_count,
                "pending_reviews": pending_review_count,
                "watch_history": watch_count,
                "actors": actor_count,
                "awards": award_count
            },
            "top_genres": top_genres,
            "movie_rating": movie_rating_summary[0] if movie_rating_summary else {"average": 0, "max": 0},
            "review_rating_distribution": review_rating_distribution,
            "quality_checks": quality_checks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading admin summary: {str(e)}")


@app.get("/admin/quality", tags=["Admin"], response_model=Dict[str, Any])
async def get_admin_quality_checks(
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        return await collect_quality_checks()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading quality checks: {str(e)}")


@app.get("/admin/movies", tags=["Admin"], response_model=Dict[str, Any])
async def admin_get_movies(
    page: int = 1,
    limit: int = 20,
    search: str = "",
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        page = max(page, 1)
        limit = max(1, min(limit, 100))
        query: Dict[str, Any] = {}
        if search.strip():
            query = {
                "$or": [
                    {"Title": {"$regex": search.strip(), "$options": "i"}},
                    {"imdbID": {"$regex": search.strip(), "$options": "i"}}
                ]
            }

        total = await db.movies.count_documents(query)
        cursor = db.movies.find(query).sort("Title", 1).skip((page - 1) * limit).limit(limit)
        movies = [serialize_document(movie) async for movie in cursor]

        return {"page": page, "limit": limit, "total": total, "data": movies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading admin movies: {str(e)}")


@app.put("/admin/movies/{imdb_id}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_update_movie(
    imdb_id: str,
    movie_data: AdminMovieUpdate,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        updates = {
            key: value
            for key, value in movie_data.dict(exclude_unset=True).items()
            if value is not None
        }
        if not updates:
            raise HTTPException(status_code=400, detail="No movie fields provided")

        updates["updated_at"] = datetime.now()
        result = await db.movies.update_one({"imdbID": imdb_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Movie not found")

        movie = await db.movies.find_one({"imdbID": imdb_id})
        return {"message": "Movie updated", "movie": serialize_document(movie)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating movie: {str(e)}")


@app.delete("/admin/movies/{imdb_id}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_delete_movie(
    imdb_id: str,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        result = await db.movies.delete_one({"imdbID": imdb_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Movie not found")

        reviews = await db.movie_reviews.delete_many({"imdb_id": imdb_id})
        ratings = await db.ratings.delete_many({"MovieId": imdb_id})
        histories = await db.WatchHistory.delete_many({"MovieId": imdb_id})
        awards = await db.awards.delete_many({"movie_id": imdb_id})
        await db.actors.update_many({"movies": imdb_id}, {"$pull": {"movies": imdb_id}})
        return {
            "message": "Movie deleted",
            "deleted": {
                "movies": result.deleted_count,
                "reviews": reviews.deleted_count,
                "ratings": ratings.deleted_count,
                "watch_history": histories.deleted_count,
                "awards": awards.deleted_count
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting movie: {str(e)}")


@app.get("/admin/reviews", tags=["Admin"], response_model=Dict[str, Any])
async def admin_get_reviews(
    status: str = "all",
    page: int = 1,
    limit: int = 30,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        page = max(page, 1)
        limit = max(1, min(limit, 100))
        if status not in {"all", "pending", "approved", "rejected"}:
            raise HTTPException(status_code=400, detail="Invalid review status")

        query: Dict[str, Any] = {} if status == "all" else {"status": status}
        total = await db.movie_reviews.count_documents(query)
        cursor = db.movie_reviews.find(query).sort("updated_at", -1).skip((page - 1) * limit).limit(limit)
        reviews = [serialize_document(review) async for review in cursor]

        movie_ids = list({review.get("imdb_id") for review in reviews if review.get("imdb_id")})
        movies = await db.movies.find(
            {"imdbID": {"$in": movie_ids}},
            {"imdbID": 1, "Title": 1, "Poster": 1}
        ).to_list(length=limit)
        movie_map = {movie["imdbID"]: serialize_document(movie) for movie in movies}
        for review in reviews:
            review["status"] = review.get("status", "approved")
            review["movie"] = movie_map.get(review.get("imdb_id"))

        return {"page": page, "limit": limit, "total": total, "data": reviews}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading reviews: {str(e)}")


@app.put("/admin/reviews/{review_id}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_moderate_review(
    review_id: str,
    moderation: AdminReviewModeration,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        if not ObjectId.is_valid(review_id):
            raise HTTPException(status_code=400, detail="Invalid review ID")

        result = await db.movie_reviews.update_one(
            {"_id": ObjectId(review_id)},
            {"$set": {"status": moderation.status, "moderated_at": datetime.now()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Review not found")

        review = await db.movie_reviews.find_one({"_id": ObjectId(review_id)})
        return {"message": "Review updated", "review": serialize_document(review)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error moderating review: {str(e)}")


@app.delete("/admin/reviews/{review_id}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_delete_review(
    review_id: str,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        if not ObjectId.is_valid(review_id):
            raise HTTPException(status_code=400, detail="Invalid review ID")

        result = await db.movie_reviews.delete_one({"_id": ObjectId(review_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Review not found")
        return {"message": "Review deleted", "deleted": result.deleted_count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting review: {str(e)}")


@app.get("/admin/ratings", tags=["Admin"], response_model=Dict[str, Any])
async def admin_get_ratings(
    page: int = 1,
    limit: int = 30,
    movie_id: str = "",
    user_id: str = "",
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        page = max(page, 1)
        limit = max(1, min(limit, 100))
        query: Dict[str, Any] = {}
        if movie_id.strip():
            query["MovieId"] = movie_id.strip()
        if user_id.strip():
            query["UserId"] = user_id.strip()

        total = await db.ratings.count_documents(query)
        ratings = await db.ratings.find(query).sort("updated_at", -1).skip((page - 1) * limit).limit(limit).to_list(length=limit)
        movie_ids = list({rating.get("MovieId") for rating in ratings if rating.get("MovieId")})
        user_ids = [
            ObjectId(rating["UserId"])
            for rating in ratings
            if rating.get("UserId") and ObjectId.is_valid(rating["UserId"])
        ]
        movies = await db.movies.find(
            {"imdbID": {"$in": movie_ids}},
            {"imdbID": 1, "Title": 1, "Poster": 1}
        ).to_list(length=limit)
        users = await db.users.find(
            {"_id": {"$in": user_ids}},
            {"email": 1, "full_name": 1}
        ).to_list(length=limit)
        movie_map = {movie["imdbID"]: serialize_document(movie) for movie in movies}
        user_map = {str(user["_id"]): serialize_document(user) for user in users}

        data = []
        for rating in ratings:
            serialized = serialize_document(rating)
            serialized["movie"] = movie_map.get(rating.get("MovieId"))
            serialized["user"] = user_map.get(rating.get("UserId"))
            data.append(serialized)

        return {"page": page, "limit": limit, "total": total, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading ratings: {str(e)}")


@app.put("/admin/ratings/{rating_id}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_update_rating(
    rating_id: str,
    rating_data: AdminRatingUpdate,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        if not ObjectId.is_valid(rating_id):
            raise HTTPException(status_code=400, detail="Invalid rating ID")

        now = datetime.now()
        result = await db.ratings.update_one(
            {"_id": ObjectId(rating_id)},
            {"$set": {"Score": rating_data.score, "updated_at": now, "moderated_at": now}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Rating not found")

        rating = await db.ratings.find_one({"_id": ObjectId(rating_id)})
        await db.movie_reviews.update_one(
            {"user_id": rating.get("UserId"), "imdb_id": rating.get("MovieId")},
            {"$set": {"rating": rating_data.score, "updated_at": now}}
        )
        rating_summary = await recalculate_movie_rating(rating["MovieId"])
        return {
            "message": "Rating updated",
            "rating": serialize_document(rating),
            "rating_summary": rating_summary
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating rating: {str(e)}")


@app.delete("/admin/ratings/{rating_id}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_delete_rating(
    rating_id: str,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        if not ObjectId.is_valid(rating_id):
            raise HTTPException(status_code=400, detail="Invalid rating ID")

        rating = await db.ratings.find_one({"_id": ObjectId(rating_id)})
        if not rating:
            raise HTTPException(status_code=404, detail="Rating not found")

        result = await db.ratings.delete_one({"_id": ObjectId(rating_id)})
        await recalculate_movie_rating(rating["MovieId"])
        return {"message": "Rating deleted", "deleted": result.deleted_count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting rating: {str(e)}")


@app.post("/admin/triggers/{trigger_name}", tags=["Admin"], response_model=Dict[str, Any])
async def admin_run_trigger(
    trigger_name: str,
    admin: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    try:
        if trigger_name == "create-indexes":
            await db.WatchHistory.create_index([("UserId", 1), ("MovieId", 1)], unique=True)
            await db.movie_reviews.create_index([("user_id", 1), ("imdb_id", 1)], unique=True)
            await db.ratings.create_index([("UserId", 1), ("MovieId", 1)], unique=True)
            await db.ratings.create_index("MovieId")
            await db.actors.create_index("name")
            await db.awards.create_index("movie_id")
            await db.movies.create_index("imdbID")
            await db.movies.create_index("Title")
            return {"message": "Indexes created"}

        if trigger_name == "normalize-reviews":
            result = await db.movie_reviews.update_many(
                {"status": {"$exists": False}},
                {"$set": {"status": "approved", "moderated_at": datetime.now()}}
            )
            return {"message": "Reviews normalized", "modified": result.modified_count}

        if trigger_name == "migrate-review-ratings":
            migrated = 0
            cursor = db.movie_reviews.find({"rating": {"$exists": True}})
            async for review in cursor:
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
            return {"message": "Review ratings migrated", "migrated": migrated}

        if trigger_name == "sync-actors-awards":
            movies_processed = 0
            actor_updates = 0
            award_docs = 0
            cursor = db.movies.find({})
            async for movie in cursor:
                result = await sync_movie_actor_award_documents(movie)
                movies_processed += 1
                actor_updates += result["actors"]
                award_docs += result["awards"]
            return {
                "message": "Actors and awards synchronized",
                "movies_processed": movies_processed,
                "actor_updates": actor_updates,
                "award_docs": award_docs
            }

        if trigger_name == "recalculate-ratings":
            pipeline = [{"$group": {"_id": "$MovieId"}}]
            updated = 0
            async for item in db.ratings.aggregate(pipeline):
                await recalculate_movie_rating(item["_id"])
                updated += 1
            return {"message": "Movie rating aggregates recalculated", "updated_movies": updated}

        if trigger_name == "dedupe-movies":
            pipeline = [
                {"$match": {"imdbID": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$imdbID", "ids": {"$push": "$_id"}, "count": {"$sum": 1}}},
                {"$match": {"count": {"$gt": 1}}}
            ]
            duplicate_groups = 0
            deleted = 0
            async for group in db.movies.aggregate(pipeline):
                duplicate_groups += 1
                ids_to_delete = group["ids"][1:]
                result = await db.movies.delete_many({"_id": {"$in": ids_to_delete}})
                deleted += result.deleted_count
            return {"message": "Duplicate movies removed", "duplicate_groups": duplicate_groups, "deleted": deleted}

        raise HTTPException(status_code=404, detail="Unknown trigger")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running trigger: {str(e)}")

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
