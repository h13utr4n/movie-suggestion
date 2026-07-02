import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from './config'

const emptyMovieForm = {
  Title: '',
  Year: '',
  Genre: '',
  Released: '',
  Runtime: '',
  Director: '',
  Actors: '',
  Plot: '',
  Poster: '',
  imdbRating: '',
  Type: ''
}

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'movies', label: 'Movies' },
  { id: 'ratings', label: 'Ratings' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'system', label: 'System' }
]

const triggers = [
  'create-indexes',
  'normalize-reviews',
  'migrate-review-ratings',
  'sync-actors-awards',
  'recalculate-ratings',
  'dedupe-movies'
]

const fieldLabels = {
  Title: 'Title',
  Year: 'Year',
  Genre: 'Genre',
  Released: 'Released',
  Runtime: 'Runtime',
  Director: 'Director',
  Actors: 'Actors',
  Plot: 'Plot',
  Poster: 'Poster',
  imdbRating: 'IMDb rating',
  Type: 'Type'
}

function AdminPanel() {
  const [activeSection, setActiveSection] = useState('overview')
  const [summary, setSummary] = useState(null)
  const [movies, setMovies] = useState([])
  const [reviews, setReviews] = useState([])
  const [ratings, setRatings] = useState([])
  const [movieSearch, setMovieSearch] = useState('')
  const [reviewStatus, setReviewStatus] = useState('pending')
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [movieForm, setMovieForm] = useState(emptyMovieForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')

  const token = localStorage.getItem('access_token')
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  }, [])

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }

  const request = async (path, options = {}) => {
    setError('')
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {})
      }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Request failed')
    }
    return data
  }

  const loadSummary = async () => {
    const data = await request('/admin/summary')
    setSummary(data)
  }

  const loadMovies = async () => {
    const params = new URLSearchParams({ page: '1', limit: '20', search: movieSearch })
    const data = await request(`/admin/movies?${params.toString()}`)
    setMovies(data.data || [])
  }

  const loadReviews = async () => {
    const params = new URLSearchParams({ page: '1', limit: '30', status: reviewStatus })
    const data = await request(`/admin/reviews?${params.toString()}`)
    setReviews(data.data || [])
  }

  const loadRatings = async () => {
    const data = await request('/admin/ratings?page=1&limit=30')
    setRatings(data.data || [])
  }

  const refreshAll = async () => {
    if (!token) {
      setError('Admin login required')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      await Promise.all([loadSummary(), loadMovies(), loadReviews(), loadRatings()])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    if (token) {
      loadReviews().catch((err) => setError(err.message))
    }
  }, [reviewStatus])

  const selectMovie = (movie) => {
    setSelectedMovie(movie)
    setMovieForm({
      ...emptyMovieForm,
      ...Object.fromEntries(Object.keys(emptyMovieForm).map((key) => [key, movie[key] || '']))
    })
    setActiveSection('movies')
  }

  const runAction = async (label, action) => {
    try {
      setBusyAction(label)
      setMessage('')
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction('')
    }
  }

  const updateMovie = async (event) => {
    event.preventDefault()
    if (!selectedMovie) return

    await runAction('save-movie', async () => {
      const data = await request(`/admin/movies/${selectedMovie.imdbID}`, {
        method: 'PUT',
        body: JSON.stringify(movieForm)
      })
      setMessage(data.message)
      setSelectedMovie(data.movie)
      await Promise.all([loadMovies(), loadSummary()])
    })
  }

  const deleteMovie = async (movie) => {
    if (!window.confirm(`Delete ${movie.Title}?`)) return

    await runAction(`delete-${movie.imdbID}`, async () => {
      const data = await request(`/admin/movies/${movie.imdbID}`, { method: 'DELETE' })
      setMessage(data.message)
      if (selectedMovie?.imdbID === movie.imdbID) {
        setSelectedMovie(null)
        setMovieForm(emptyMovieForm)
      }
      await Promise.all([loadMovies(), loadReviews(), loadRatings(), loadSummary()])
    })
  }

  const moderateReview = async (review, status) => {
    await runAction(`${review.id}-${status}`, async () => {
      const data = await request(`/admin/reviews/${review.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      })
      setMessage(data.message)
      await Promise.all([loadReviews(), loadSummary()])
    })
  }

  const deleteReview = async (review) => {
    if (!window.confirm('Delete this review?')) return

    await runAction(`delete-review-${review.id}`, async () => {
      const data = await request(`/admin/reviews/${review.id}`, { method: 'DELETE' })
      setMessage(data.message)
      await Promise.all([loadReviews(), loadSummary()])
    })
  }

  const updateRating = async (rating, score) => {
    await runAction(`${rating.id}-${score}`, async () => {
      const data = await request(`/admin/ratings/${rating.id}`, {
        method: 'PUT',
        body: JSON.stringify({ score })
      })
      setMessage(data.message)
      await Promise.all([loadRatings(), loadSummary()])
    })
  }

  const deleteRating = async (rating) => {
    if (!window.confirm('Delete this rating?')) return

    await runAction(`delete-rating-${rating.id}`, async () => {
      const data = await request(`/admin/ratings/${rating.id}`, { method: 'DELETE' })
      setMessage(data.message)
      await Promise.all([loadRatings(), loadSummary()])
    })
  }

  const runTrigger = async (triggerName) => {
    await runAction(triggerName, async () => {
      const data = await request(`/admin/triggers/${triggerName}`, { method: 'POST' })
      setMessage(data.message)
      await refreshAll()
    })
  }

  const counts = summary?.counts || {}
  const headlineStats = [
    ['Movies', counts.movies],
    ['Users', counts.users],
    ['Ratings', counts.ratings],
    ['Reviews', counts.reviews],
    ['Pending', counts.pending_reviews],
    ['Actors', counts.actors],
    ['Awards', counts.awards],
    ['History', counts.watch_history]
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07130c] p-8 text-green-100">
        <div className="h-2 w-40 rounded-full bg-green-500" />
        <p className="mt-4 text-sm font-semibold">Loading admin workspace...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07130c] text-white">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-green-900/80 bg-[#0a1b11] px-5 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-4 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-green-300">Admin</p>
              <h1 className="mt-1 text-2xl font-black">Cinema Pulse</h1>
              <p className="mt-2 max-w-[220px] truncate text-xs text-green-100/60">{user?.email || 'Not signed in'}</p>
            </div>
            <Link to="/" className="rounded-md border border-green-600/70 px-3 py-2 text-xs font-semibold text-green-100 hover:bg-green-500/10 lg:hidden">
              Back
            </Link>
          </div>

          <nav className="mt-6 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                  activeSection === section.id
                    ? 'bg-green-500 text-black'
                    : 'text-green-100/75 hover:bg-green-500/10 hover:text-white'
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="mt-6 hidden lg:block">
            <button onClick={refreshAll} className="w-full rounded-md bg-green-500 px-4 py-2 text-sm font-bold text-black hover:bg-green-400">
              Refresh data
            </button>
            <Link to="/" className="mt-3 block rounded-md border border-green-600/70 px-4 py-2 text-center text-sm font-semibold text-green-100 hover:bg-green-500/10">
              Back to app
            </Link>
          </div>
        </aside>

        <main className="px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 border-b border-green-900/70 pb-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-green-300">Operations dashboard</p>
              <h2 className="mt-1 text-3xl font-black tracking-normal">Admin Control Center</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-green-100/70">
                Manage catalog data, ratings, moderation queue, and maintenance triggers from one workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={refreshAll} className="rounded-md bg-green-500 px-4 py-2 text-sm font-bold text-black hover:bg-green-400">
                Refresh
              </button>
              <Link to="/" className="rounded-md border border-green-600/70 px-4 py-2 text-sm font-semibold text-green-100 hover:bg-green-500/10">
                Back to app
              </Link>
            </div>
          </header>

          {(message || error) && (
            <div className={`mb-6 rounded-md border px-4 py-3 text-sm font-semibold ${error ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-green-500/50 bg-green-500/10 text-green-100'}`}>
              {error || message}
            </div>
          )}

          {activeSection === 'overview' && (
            <section className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {headlineStats.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-green-900/80 bg-[#0d2115] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-300/80">{label}</p>
                    <p className="mt-3 text-3xl font-black">{value ?? 0}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <section className="rounded-lg border border-green-900/80 bg-[#0d2115] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">Top genres</h3>
                    <span className="text-xs font-semibold text-green-100/50">Movies by genre</span>
                  </div>
                  <div className="space-y-3">
                    {(summary?.top_genres || []).map((item) => {
                      const max = summary?.top_genres?.[0]?.count || 1
                      const width = `${Math.max(6, Math.round((item.count / max) * 100))}%`
                      return (
                        <div key={item.genre}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="font-semibold text-green-100">{item.genre}</span>
                            <span className="text-green-100/60">{item.count}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-black/30">
                            <div className="h-full rounded-full bg-green-400" style={{ width }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="rounded-lg border border-green-900/80 bg-[#0d2115] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">Rating distribution</h3>
                    <span className="text-xs font-semibold text-green-100/50">User scores</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((score) => {
                      const item = (summary?.review_rating_distribution || []).find((entry) => entry.rating === score)
                      return (
                        <div key={score} className="rounded-md border border-green-900/70 bg-[#07130c] p-3 text-center">
                          <p className="text-xs font-semibold text-green-100/60">{score}/5</p>
                          <p className="mt-2 text-2xl font-black">{item?.count || 0}</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-5 rounded-md border border-green-900/70 bg-[#07130c] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-300/80">IMDb average</p>
                    <p className="mt-2 text-3xl font-black">{Number(summary?.movie_rating?.average || 0).toFixed(2)}</p>
                  </div>
                </section>
              </div>

              <section className="rounded-lg border border-green-900/80 bg-[#0d2115] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold">Quality checks</h3>
                  <span className="text-xs font-semibold text-green-100/50">Catalog health</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Duplicate IMDb IDs', summary?.quality_checks?.duplicates?.groups],
                    ['Missing genres', summary?.quality_checks?.missing?.genre],
                    ['Missing posters', summary?.quality_checks?.missing?.poster],
                    ['Unsynced actors', summary?.quality_checks?.sync?.movies_missing_actor_docs],
                    ['Unsynced awards', summary?.quality_checks?.sync?.movies_missing_award_docs],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-green-900/70 bg-[#07130c] p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-300/80">{label}</p>
                      <p className="mt-2 text-2xl font-black">{value ?? 0}</p>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeSection === 'movies' && (
            <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Movie catalog</h3>
                    <p className="text-sm text-green-100/60">Search, select, edit, and delete movie records.</p>
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      runAction('search-movies', loadMovies)
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={movieSearch}
                      onChange={(event) => setMovieSearch(event.target.value)}
                      placeholder="Title or IMDb ID"
                      className="w-full min-w-0 rounded-md border border-green-900/80 bg-[#0a1b11] px-3 py-2 text-sm text-white outline-none focus:border-green-400 sm:w-64"
                    />
                    <button className="rounded-md bg-green-500 px-4 py-2 text-sm font-bold text-black hover:bg-green-400">Search</button>
                  </form>
                </div>

                <div className="overflow-hidden rounded-lg border border-green-900/80">
                  <div className="grid grid-cols-[1fr_100px] border-b border-green-900/80 bg-[#102719] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-green-300/80">
                    <span>Movie</span>
                    <span className="text-right">Action</span>
                  </div>
                  {movies.map((movie) => (
                    <div key={movie.id || movie.imdbID} className="grid grid-cols-[1fr_100px] gap-3 border-b border-green-950 bg-[#0d2115] px-4 py-3 last:border-b-0">
                      <button onClick={() => selectMovie(movie)} className="min-w-0 text-left">
                        <p className="truncate font-semibold text-white">{movie.Title}</p>
                        <p className="mt-1 truncate text-sm text-green-100/60">{movie.imdbID} | {movie.Year || 'N/A'} | IMDb {movie.imdbRating || 'N/A'}</p>
                      </button>
                      <button onClick={() => deleteMovie(movie)} className="self-center rounded-md border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={updateMovie} className="rounded-lg border border-green-900/80 bg-[#0d2115] p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{selectedMovie ? 'Edit movie' : 'Movie editor'}</h3>
                    <p className="mt-1 text-sm text-green-100/60">{selectedMovie?.imdbID || 'Select a movie from the table.'}</p>
                  </div>
                  <button disabled={!selectedMovie || busyAction === 'save-movie'} className="rounded-md bg-green-500 px-4 py-2 text-sm font-bold text-black hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50">
                    Save
                  </button>
                </div>
                <div className="grid gap-3">
                  {Object.keys(emptyMovieForm).map((key) => (
                    <label key={key} className="text-sm font-semibold text-green-100">
                      {fieldLabels[key]}
                      {key === 'Plot' ? (
                        <textarea
                          value={movieForm[key]}
                          onChange={(event) => setMovieForm((prev) => ({ ...prev, [key]: event.target.value }))}
                          disabled={!selectedMovie}
                          className="mt-1 min-h-28 w-full resize-y rounded-md border border-green-900/80 bg-[#07130c] px-3 py-2 text-sm font-normal text-white outline-none focus:border-green-400 disabled:opacity-50"
                        />
                      ) : (
                        <input
                          value={movieForm[key]}
                          onChange={(event) => setMovieForm((prev) => ({ ...prev, [key]: event.target.value }))}
                          disabled={!selectedMovie}
                          className="mt-1 w-full rounded-md border border-green-900/80 bg-[#07130c] px-3 py-2 text-sm font-normal text-white outline-none focus:border-green-400 disabled:opacity-50"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </form>
            </section>
          )}

          {activeSection === 'ratings' && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold">Rating management</h3>
                  <p className="text-sm text-green-100/60">Adjust user scores and remove invalid records.</p>
                </div>
                <button onClick={() => runAction('reload-ratings', loadRatings)} className="rounded-md border border-green-600/70 px-4 py-2 text-sm font-semibold text-green-100 hover:bg-green-500/10">
                  Reload
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-green-900/80">
                <div className="hidden grid-cols-[1fr_190px_92px] border-b border-green-900/80 bg-[#102719] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-green-300/80 lg:grid">
                  <span>Rating</span>
                  <span>Score</span>
                  <span className="text-right">Action</span>
                </div>
                {ratings.map((rating) => (
                  <div key={rating.id} className="grid gap-3 border-b border-green-950 bg-[#0d2115] px-4 py-4 last:border-b-0 lg:grid-cols-[1fr_190px_92px] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{rating.movie?.Title || rating.MovieId}</p>
                      <p className="mt-1 truncate text-sm text-green-100/60">{rating.user?.email || rating.UserId} | {rating.source || 'rating'}</p>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          onClick={() => updateRating(rating, score)}
                          className={`h-8 w-8 rounded-md border text-sm font-bold ${score === rating.Score ? 'border-yellow-300 bg-yellow-400 text-black' : 'border-green-700 text-green-100 hover:bg-green-500/15'}`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => deleteRating(rating)} className="rounded-md border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                      Delete
                    </button>
                  </div>
                ))}
                {ratings.length === 0 && <div className="bg-[#0d2115] p-4 text-sm text-green-100/60">No ratings found.</div>}
              </div>
            </section>
          )}

          {activeSection === 'reviews' && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold">Review moderation</h3>
                  <p className="text-sm text-green-100/60">Approve, reject, or delete user comments.</p>
                </div>
                <select
                  value={reviewStatus}
                  onChange={(event) => setReviewStatus(event.target.value)}
                  className="rounded-md border border-green-900/80 bg-[#0a1b11] px-3 py-2 text-sm text-white outline-none focus:border-green-400"
                >
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                  <option value="all">all</option>
                </select>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {reviews.map((review) => (
                  <article key={review.id} className="rounded-lg border border-green-900/80 bg-[#0d2115] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{review.movie?.Title || review.imdb_id}</p>
                        <p className="mt-1 text-sm text-green-100/60">{review.user_name} | {review.rating}/5 | {review.status}</p>
                      </div>
                      <button onClick={() => deleteReview(review)} className="rounded-md border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                        Delete
                      </button>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-green-100/85">{review.content}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {['approved', 'pending', 'rejected'].map((status) => (
                        <button
                          key={status}
                          onClick={() => moderateReview(review, status)}
                          className={`rounded-md px-3 py-2 text-sm font-semibold ${
                            review.status === status
                              ? 'bg-green-500 text-black'
                              : 'border border-green-700 text-green-100 hover:bg-green-500/10'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {reviews.length === 0 && <div className="rounded-lg border border-green-900/80 bg-[#0d2115] p-4 text-sm text-green-100/60">No reviews in this queue.</div>}
              </div>
            </section>
          )}

          {activeSection === 'system' && (
            <section className="space-y-4">
              <div>
                <h3 className="text-xl font-bold">System triggers</h3>
                <p className="text-sm text-green-100/60">Run maintenance tasks against the MongoDB dataset.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {triggers.map((triggerName) => (
                  <button
                    key={triggerName}
                    onClick={() => runTrigger(triggerName)}
                    disabled={busyAction === triggerName}
                    className="rounded-lg border border-green-900/80 bg-[#0d2115] p-4 text-left transition hover:border-green-500/80 hover:bg-green-500/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="block text-sm font-bold text-white">{triggerName}</span>
                    <span className="mt-2 block text-xs leading-5 text-green-100/60">Execute maintenance and refresh dashboard data.</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default AdminPanel
