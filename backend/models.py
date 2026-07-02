from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

class Rating(BaseModel):
    Source: str
    Value: str

class Movie(BaseModel):
    id: Optional[str] = None
    Title: str
    Year: str
    Rated: Optional[str] = None
    Released: Optional[str] = None
    Runtime: Optional[str] = None
    Genre: Optional[str] = None
    Director: Optional[str] = None
    Writer: Optional[str] = None
    Actors: Optional[str] = None
    Plot: Optional[str] = None
    Language: Optional[str] = None
    Country: Optional[str] = None
    Awards: Optional[str] = None
    Poster: Optional[str] = None
    Ratings: List[Rating] = []
    Metascore: Optional[str] = None
    imdbRating: Optional[str] = None
    imdbVotes: Optional[str] = None
    imdbID: str
    Type: str
    DVD: Optional[str] = None
    BoxOffice: Optional[str] = None

class Actor(BaseModel):
    id: Optional[str] = None
    name: str
    movies: List[str] = []  # List of movie imdbIDs

class Award(BaseModel):
    id: Optional[str] = None
    movie_id: str  # imdbID of the movie
    award_name: str
    category: str
    winner: bool
    year: str


class MovieReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    content: str = Field(..., min_length=1, max_length=1000)


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)


class AdminRatingUpdate(BaseModel):
    score: int = Field(..., ge=1, le=5)


class AdminMovieUpdate(BaseModel):
    Title: Optional[str] = None
    Year: Optional[str] = None
    Rated: Optional[str] = None
    Released: Optional[str] = None
    Runtime: Optional[str] = None
    Genre: Optional[str] = None
    Director: Optional[str] = None
    Writer: Optional[str] = None
    Actors: Optional[str] = None
    Plot: Optional[str] = None
    Language: Optional[str] = None
    Country: Optional[str] = None
    Awards: Optional[str] = None
    Poster: Optional[str] = None
    imdbRating: Optional[str] = None
    imdbVotes: Optional[str] = None
    Type: Optional[str] = None


class AdminReviewModeration(BaseModel):
    status: str = Field(..., pattern="^(approved|pending|rejected)$")


class MovieReviewResponse(BaseModel):
    id: Optional[str] = None
    imdb_id: str
    user_id: str
    user_name: str
    rating: int
    content: str
    created_at: datetime
    updated_at: datetime


class WatchTimeUpdate(BaseModel):
    seconds: int = Field(..., ge=1, le=86400)
    active: bool = True


class WatchHistoryResponse(BaseModel):
    id: Optional[str] = None
    UserId: str
    MovieId: str
    LastWatchedAt: datetime
    WatchedCount: int = 0
    TotalAccessTime: int = 0
    created_at: datetime
    updated_at: datetime


# ============================================================================
# User Models
# ============================================================================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: Optional[str] = None
    email: str
    full_name: str
    is_activated: bool
    favorite_genres: List[str] = []
    created_at: Optional[datetime] = None


class UpdateFavoriteGenres(BaseModel):
    favorite_genres: List[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class User(BaseModel):
    """User database model"""
    id: Optional[str] = None
    email: str
    password: str  # hashed
    full_name: str
    is_activated: bool = False
    activation_token: Optional[str] = None
    last_login: Optional[datetime] = None
    favorite_genres: List[str] = []  # List of favorite movie genres
    created_at: datetime
    updated_at: datetime
