# Movie Suggestion App

Full-stack movie suggestion application built with FastAPI, MongoDB, React, and TailwindCSS. The app stores movie metadata from OMDb/TMDB, tracks user behavior, supports reviews and ratings, and generates personalized movie recommendations.

## Features

- Movie catalog from OMDb/TMDB data.
- Movie list, movie detail, search, actors, and awards APIs.
- JWT authentication with email activation support.
- User favorite genres.
- Movie reviews with admin moderation.
- 1-5 star ratings with per-movie aggregate recalculation.
- Watch history tracking with visit count, active access time, and engaged watch count.
- Hybrid recommendation algorithm:
  - content-based genres from favorites, viewing, access time, and high ratings;
  - collaborative filtering from similar users;
  - discovery items from lower-frequency or non-primary genres.
- Admin panel for movies, reviews, ratings, triggers, summaries, and quality checks.
- Data analysis and maintenance scripts.
- Baseline backend and frontend smoke tests.

## Tech Stack

Backend:

- Python
- FastAPI
- MongoDB Atlas via Motor/PyMongo
- Pydantic
- JWT with `python-jose`
- bcrypt
- OMDb API
- TMDB API

Frontend:

- React
- Vite
- TailwindCSS
- Framer Motion
- React Router
- ESLint
- Vitest

## Project Structure

```text
MovieSuggestion/
  backend/
    main.py              # FastAPI routes and core application logic
    models.py            # Pydantic models
    auth_service.py      # Password hashing, JWT, activation/login email
    omdb_service.py      # OMDb API integration
    tmdb_service.py      # TMDB API integration
    seed.py              # Seed movies from TMDB, enrich with OMDb
    maintenance.py       # Maintenance tasks
    data_analysis.py     # DB summary and reporting script
    tests/               # Backend pytest smoke tests
  frontend/
    src/
      App.jsx
      MovieDetail.jsx
      AdminPanel.jsx
      Header.jsx
      GenreSelectionPopup.jsx
      config.js
      config.test.js
    package.json
    tailwind.config.js
    vite.config.js
```

## Environment Variables

Create `backend/.env`:

```env
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
OMDB_API_KEY=your_omdb_api_key
TMDB_API_KEY=your_tmdb_api_key
JWT_SECRET_KEY=replace_with_a_strong_secret
ADMIN_EMAILS=admin@example.com

# Optional email activation/login notification settings
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SENDER_EMAIL=your_email@example.com
SENDER_PASSWORD=your_app_password
FRONTEND_URL=http://localhost:5176
```

Create `frontend/.env` if the backend is not running at the default frontend value:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Notes:

- Do not commit real `.env` secrets.
- `JWT_SECRET_KEY` should never use the default value in production.
- Admin access is granted when a user has `is_admin=true`, `role=admin`, or their email is listed in `ADMIN_EMAILS`.

## Backend Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Backend URLs:

- API: `http://127.0.0.1:8000`
- Swagger docs: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5176
```

Frontend URL:

- `http://127.0.0.1:5176`

## Data Seeding

Seed movie data from TMDB and OMDb:

```powershell
cd backend
.\.venv\Scripts\python.exe seed.py
```

The seed script discovers movies from TMDB, fetches IMDb IDs, retrieves OMDb details, then inserts them into MongoDB.

## Useful Scripts

Backend:

```powershell
# Run backend tests
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q

# Compile-check backend files
.\backend\.venv\Scripts\python.exe -m compileall backend -q

# Analyze DB data
cd backend
.\.venv\Scripts\python.exe data_analysis.py --format table
.\.venv\Scripts\python.exe data_analysis.py --format json

# Run maintenance tasks
.\.venv\Scripts\python.exe maintenance.py --task all
.\.venv\Scripts\python.exe maintenance.py --task create-indexes
.\.venv\Scripts\python.exe maintenance.py --task recalculate-ratings
```

Frontend:

```powershell
cd frontend
npm run lint
npm test
npm run build
npm run preview
```

## Main API Endpoints

Health:

- `GET /`

Movies:

- `GET /movies?page=1&limit=30`
- `GET /movies/{imdb_id}`
- `POST /movies/fetch/{imdb_id}`
- `GET /search?title=...&page=1`

Reviews:

- `GET /movies/{imdb_id}/reviews`
- `POST /movies/{imdb_id}/reviews`

Ratings:

- `GET /movies/{imdb_id}/ratings`
- `POST /movies/{imdb_id}/ratings`
- `GET /ratings/me`

Watch history:

- `POST /watch-history/{movie_id}/visit`
- `PUT /watch-history/{movie_id}/time`
- `GET /watch-history`

Recommendations:

- `GET /recommendations?limit=24`

Actors and awards:

- `GET /actors`
- `GET /actors/search?name=...&page=1`
- `GET /actors/{actor_id}`
- `POST /actors/fetch/{actor_id}`
- `GET /movies/{imdb_id}/actors`
- `GET /awards`
- `GET /movies/{imdb_id}/awards`

Authentication:

- `POST /auth/register`
- `GET /auth/activate?token=...`
- `POST /auth/login`
- `GET /auth/me`
- `PUT /auth/me/favorite-genres`

Admin:

- `GET /admin/summary`
- `GET /admin/quality`
- `GET /admin/movies`
- `PUT /admin/movies/{imdb_id}`
- `DELETE /admin/movies/{imdb_id}`
- `GET /admin/reviews`
- `PUT /admin/reviews/{review_id}`
- `DELETE /admin/reviews/{review_id}`
- `GET /admin/ratings`
- `PUT /admin/ratings/{rating_id}`
- `DELETE /admin/ratings/{rating_id}`
- `POST /admin/triggers/{trigger_name}`

## Review and Rating Flow

Reviews are stored in `movie_reviews`.

- A logged-in user can submit one review per movie.
- Submitting again updates the existing review.
- Review content is required.
- New reviews are saved with moderation status.
- Public movie review listing returns approved reviews.
- Admins can approve, reject, or delete reviews.

Ratings are stored in `ratings`.

- A logged-in user can save a 1-5 score for a movie.
- A score can come from direct rating or from a review.
- Saving a review also syncs the review rating into `ratings`.
- Updating a direct rating also updates the rating field on an existing review.
- After rating changes, the movie aggregate rating is recalculated.

## Watch Tracking

Watch tracking uses `WatchHistory`.

Tracked fields include:

- `UserId`
- `MovieId`
- `LastWatchedAt`
- `WatchedCount`
- `TotalAccessTime`
- `EngagedWatchCount`
- `EngagedAt`

Flow:

- Opening a movie detail page calls `POST /watch-history/{movie_id}/visit`.
- This increments `WatchedCount`.
- While the user stays active on the page, the frontend periodically calls `PUT /watch-history/{movie_id}/time`.
- The frontend avoids counting idle/background tab time.
- The backend caps each time sync to avoid inflated access time.
- Once enough active time is recorded, the history item is marked as an engaged watch.

## Recommendation Algorithm

Endpoint: `GET /recommendations`.

The system uses a hybrid heuristic recommender.

Content-based scoring:

- Starts from user `favorite_genres`.
- Adds genre signals from watch history.
- Uses active access time and engaged watch count.
- Adds positive weight for high reviews/ratings.
- Applies negative weight for low reviews/ratings.
- Applies recency decay so older behavior has less impact.

Collaborative scoring:

- Builds genre vectors for other users from their watch history, reviews, and ratings.
- Compares the current user vector with other users using cosine similarity.
- Borrows movies watched or rated highly by similar users.

Discovery scoring:

- Adds lower-weight movies from less frequent or non-primary genres.
- Requires reasonable IMDb rating.
- Blends discovery items into the result list so recommendations do not become too narrow.

Optimizations:

- Candidate movies are cached briefly.
- Watch count impact is capped.
- Raw scores are normalized before returning to the frontend.
- The response includes `recommendationSources`, `matchedGenres`, and `recommendationReason`.

## Admin Panel

The admin panel supports:

- Catalog overview.
- Movie management.
- Review moderation.
- Rating management.
- Trigger execution.
- Quality checks.

Quality checks include:

- Duplicate IMDb IDs.
- Missing genres.
- Missing posters.
- Movies missing actor sync.
- Movies missing award sync.
- Rating distribution.

Available triggers include:

- `create-indexes`
- `normalize-reviews`
- `migrate-review-ratings`
- `sync-actors-awards`
- `recalculate-ratings`
- `dedupe-movies`

## Testing and Verification

Current baseline checks:

```powershell
.\backend\.venv\Scripts\python.exe -m compileall backend -q
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q

cd frontend
npm run lint
npm test
npm run build
```

The backend tests are smoke/unit tests and do not replace full API integration tests. For deeper coverage, add test database fixtures for auth, movie APIs, reviews, ratings, watch history, and recommendations.

## Current Known Gaps

- Recommendation quality depends on having enough real users and behavior data.
- Collaborative filtering is limited when the database has too few users.
- Some data quality checks may report movies with missing genre/poster until cleanup or reseeding is done.
- The backend is still mostly in a single `main.py`; splitting routes/services would improve maintainability.
- Production deployment should add stricter CORS, rate limiting, structured logging, and stronger secret validation.

