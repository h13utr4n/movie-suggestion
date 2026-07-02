import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './Header'
import GenreSelectionPopup from './GenreSelectionPopup'
import { API_BASE_URL } from './config'

function App() {
  const navigate = useNavigate()
  const recommendedScrollRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [movies, setMovies] = useState([])
  const [newMovies, setNewMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [paginationPage, setPaginationPage] = useState({ page: 1, limit: 24 })
  const [carouselIndex, setCarouselIndex] = useState(0)

  const [authMode, setAuthMode] = useState(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '', full_name: '' })
  const [authError, setAuthError] = useState(null)
  const [authSuccess, setAuthSuccess] = useState(null)
  const [user, setUser] = useState(null)
  const [guestFavoriteGenres, setGuestFavoriteGenres] = useState([])
  const [serverRecommendedMovies, setServerRecommendedMovies] = useState([])
  const [recommendationTags, setRecommendationTags] = useState([])

  const [showGenrePopup, setShowGenrePopup] = useState(false)

  useEffect(() => {
    const savedToken = localStorage.getItem('access_token')
    const savedUser = localStorage.getItem('user')
    const savedGenres = localStorage.getItem('favorite_genres')

    if (savedToken && savedUser) {
      setUser(JSON.parse(savedUser))
    }
    if (savedGenres) {
      setGuestFavoriteGenres(JSON.parse(savedGenres))
    }
  }, [])

  useEffect(() => {
    // Check if user needs to select favorite genres
    const checkFavoriteGenres = () => {
      if (user) {
        // User is logged in, check if they have favorite genres in database
        if (!user.favorite_genres || user.favorite_genres.length === 0) {
          setShowGenrePopup(true)
        }
      } else {
        // User not logged in, check localStorage
        const localGenres = localStorage.getItem('favorite_genres')
        if (!localGenres) {
          setShowGenrePopup(true)
        }
      }
    }

    // Delay check to ensure user state is set
    const timer = setTimeout(checkFavoriteGenres, 1000)
    return () => clearTimeout(timer)
  }, [user])

  useEffect(() => {
    fetchMovies()
  }, [paginationPage])

  useEffect(() => {
    fetchNewMovies();
  }, [])

  useEffect(() => {
    const fetchRecommendations = async () => {
      const token = localStorage.getItem('access_token')
      if (!user || !token) {
        setServerRecommendedMovies([])
        setRecommendationTags([])
        return
      }

      try {
        const response = await fetch(`${API_BASE_URL}/recommendations?limit=18`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || 'Failed to fetch recommendations')
        }

        setServerRecommendedMovies(data.data || [])
        setRecommendationTags((data.learned_genres || []).slice(0, 4).map(([genre]) => genre))
      } catch (err) {
        console.error('Error fetching recommendations:', err)
        setServerRecommendedMovies([])
        setRecommendationTags([])
      }
    }

    fetchRecommendations()
  }, [user])
  
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const fetchMovies = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/movies?page=${paginationPage.page}&limit=${paginationPage.limit}`)
      if (!response.ok) {
        throw new Error('Failed to fetch movies')
      }
      const data = await response.json()
      setMovies(data.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchNewMovies = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/movies?page=1&limit=10`)
      if (!response.ok) {
        throw new Error('Failed to fetch movies')
      }
      const data = await response.json()
      setNewMovies(data.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const sortedMovies = useMemo(() => {
    return [...movies].sort((a, b) => {
      const yearA = parseInt(a.Year, 10) || 0
      const yearB = parseInt(b.Year, 10) || 0
      return yearB - yearA
    })
  }, [movies])

  const latestMovies = sortedMovies.slice(0, 10)
  const activeFavoriteGenres = user ? user.favorite_genres || [] : guestFavoriteGenres

  const localRecommendedMovies = useMemo(() => {
    if (!activeFavoriteGenres.length) return []

    const favoriteSet = new Set(activeFavoriteGenres.map((genre) => genre.toLowerCase()))

    return sortedMovies
      .map((movie) => {
        const movieGenres = (movie.Genre || '')
          .split(',')
          .map((genre) => genre.trim())
          .filter(Boolean)

        const matchedGenres = movieGenres.filter((genre) => favoriteSet.has(genre.toLowerCase()))

        return {
          ...movie,
          matchedGenres,
          recommendationScore: matchedGenres.length
        }
      })
      .filter((movie) => movie.recommendationScore > 0)
      .sort((a, b) => {
        if (b.recommendationScore !== a.recommendationScore) {
          return b.recommendationScore - a.recommendationScore
        }

        const ratingA = parseFloat(a.imdbRating) || 0
        const ratingB = parseFloat(b.imdbRating) || 0
        if (ratingB !== ratingA) return ratingB - ratingA

        return (parseInt(b.Year, 10) || 0) - (parseInt(a.Year, 10) || 0)
      })
      .slice(0, 12)
  }, [activeFavoriteGenres, sortedMovies])
  const recommendedMovies = serverRecommendedMovies.length > 0 ? serverRecommendedMovies : localRecommendedMovies
  const visibleRecommendationTags = recommendationTags.length > 0 ? recommendationTags : activeFavoriteGenres

  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIndex((prevIndex) => {
        const nextIndex = prevIndex + 1
        return nextIndex >= latestMovies.length ? 0 : nextIndex
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [latestMovies.length])

  const moveCarousel = (direction) => {
    setCarouselIndex((prevIndex) => {
      const nextIndex = prevIndex + direction
      if (nextIndex < 0) return 0
      if (nextIndex >= latestMovies.length) return latestMovies.length - 1
      return nextIndex
    })
  }

  const handleMovieClick = (movie) => {
    navigate(`/movie/${movie.imdbID}`)
  }

  const scrollRecommendations = (direction) => {
    if (!recommendedScrollRef.current) return

    recommendedScrollRef.current.scrollBy({
      left: direction * 520,
      behavior: 'smooth'
    })
  }

  const openAuth = (mode) => {
    setAuthMode(mode)
    setAuthError(null)
    setAuthSuccess(null)
    setAuthForm({ email: '', password: '', full_name: '' })
  }

  const closeAuth = () => {
    setAuthMode(null)
    setAuthError(null)
    setAuthSuccess(null)
  }

  const handleAuthChange = (event) => {
    const { name, value } = event.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthError(null)
    setAuthSuccess(null)

    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
    const payload = authMode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : { email: authForm.email, password: authForm.password, full_name: authForm.full_name }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Yêu cầu không thành công')
      }

      if (authMode === 'login') {
        setUser(data.user)
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('user', JSON.stringify(data.user))
        if (data.user.favorite_genres?.length) {
          setShowGenrePopup(false)
        }
        setAuthSuccess('Đăng nhập thành công!')
        closeAuth()
      } else {
        setAuthSuccess(data.message || 'Đăng ký thành công! Vui lòng kiểm tra email để kích hoạt.')
        setAuthMode('login')
      }
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
    setGuestFavoriteGenres(JSON.parse(localStorage.getItem('favorite_genres') || '[]'))
    setAuthError(null)
    setAuthSuccess(null)
  }

  const handleSaveGenres = async (genres) => {
    try {
      if (user) {
        // User is logged in, save to database
        const token = localStorage.getItem('access_token')
        const response = await fetch(`${API_BASE_URL}/auth/me/favorite-genres`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ favorite_genres: genres })
        })

        if (!response.ok) {
          throw new Error('Failed to save genres')
        }

        // Update user state
        const updatedUser = { ...user, favorite_genres: genres }
        setUser(updatedUser)
        localStorage.setItem('user', JSON.stringify(updatedUser))
      } else {
        // User not logged in, save to localStorage
        localStorage.setItem('favorite_genres', JSON.stringify(genres))
        setGuestFavoriteGenres(genres)
      }
    } catch (error) {
      console.error('Error saving genres:', error)
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen bg-black text-white"><div>Loading...</div></div>
  if (error) return <div className="flex justify-center items-center min-h-screen bg-black text-white"><div>Error: {error}</div></div>

  return (
    <div className="min-h-screen bg-[#041c0c] text-white">
      <Header user={user} onLogout={handleLogout} onOpenAuth={openAuth} scrolled={scrolled} />

      {authMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-green-700/50 bg-[#0b2d17] p-6 shadow-2xl shadow-black/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-green-300/80">{authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</p>
                <h2 className="text-3xl font-bold text-white">{authMode === 'login' ? 'Chào mừng quay lại' : 'Tạo tài khoản mới'}</h2>
              </div>
              <button onClick={closeAuth} className="text-green-200 hover:text-white">Đóng</button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-sm font-semibold text-green-100 mb-2">Họ và tên</label>
                  <input
                    name="full_name"
                    value={authForm.full_name}
                    onChange={handleAuthChange}
                    required
                    className="w-full rounded-2xl border border-green-600/50 bg-[#06180d] px-4 py-3 text-white outline-none focus:border-green-400"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-green-100 mb-2">Email</label>
                <input
                  name="email"
                  type="email"
                  value={authForm.email}
                  onChange={handleAuthChange}
                  required
                  className="w-full rounded-2xl border border-green-600/50 bg-[#06180d] px-4 py-3 text-white outline-none focus:border-green-400"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-green-100 mb-2">Mật khẩu</label>
                <input
                  name="password"
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthChange}
                  required
                  className="w-full rounded-2xl border border-green-600/50 bg-[#06180d] px-4 py-3 text-white outline-none focus:border-green-400"
                  placeholder="••••••••"
                />
              </div>

              {authError && <p className="text-sm text-red-400">{authError}</p>}
              {authSuccess && <p className="text-sm text-green-300">{authSuccess}</p>}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="submit" className="rounded-full bg-green-500 px-6 py-3 text-sm font-semibold text-black hover:bg-green-400 transition">
                  {authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="rounded-full border border-green-400/30 px-6 py-3 text-sm font-semibold text-green-200 hover:bg-green-500/10 transition"
                >
                  {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <GenreSelectionPopup
        isOpen={showGenrePopup}
        onClose={() => setShowGenrePopup(false)}
        onSave={handleSaveGenres}
        initialGenres={user ? user.favorite_genres || [] : JSON.parse(localStorage.getItem('favorite_genres') || '[]')}
      />

      <main className="px-6 sm:px-10 py-8 space-y-12">
        <section className="rounded-3xl bg-[#0b2d17] border border-green-700/40 p-6 shadow-2xl shadow-black/30 overflow-hidden">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            <div className="flex-1">
              <span className="inline-flex items-center rounded-full bg-green-600/10 px-3 py-1 text-sm text-green-200 font-semibold uppercase tracking-[0.2em] mb-4">Latest hits</span>
              <h2 className="text-4xl lg:text-5xl font-black leading-tight text-white">Đánh giá ngay 10 bộ phim mới nhất</h2>
              <p className="mt-5 max-w-2xl text-green-100/90">Khám phá xu hướng phim ảnh hot nhất, tất cả được camera hóa trong một trải nghiệm xem tối giản, hiện đại và đậm chất rạp.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button className="rounded-full bg-green-500 px-6 py-3 text-sm font-semibold text-black hover:bg-green-400 transition">Xem danh sách</button>
                <button className="rounded-full border border-green-400/30 px-6 py-3 text-sm font-semibold text-green-200 hover:bg-green-500/10 transition">Khám phá thêm</button>
              </div>
            </div>
            <div className="w-full lg:w-[420px] h-[320px] rounded-[2rem] bg-black/60 border border-green-700/50 p-4 shadow-xl shadow-black/50 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm uppercase tracking-[0.2em] text-green-200">Top 10 mới nhất</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => moveCarousel(-1)} className="w-10 h-10 rounded-full bg-green-600/20 text-green-100 hover:bg-green-500/30 transition">←</button>
                  <button onClick={() => moveCarousel(1)} className="w-10 h-10 rounded-full bg-green-600/20 text-green-100 hover:bg-green-500/30 transition">→</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <AnimatePresence mode="wait">
                  {newMovies.slice(carouselIndex, carouselIndex + 2).map((movie) => (
                    <motion.div
                      key={movie.imdbID}
                      className="rounded-3xl bg-[#0f371d] p-4 border border-green-700/40 flex gap-4 h-[235px]"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                    >
                      <img
                        src={movie.Poster && movie.Poster !== 'N/A' ? movie.Poster : 'static/img/ImageNotAvailable.png'}
                        alt={movie.Title}
                        onError={(e) => {
                          if (e.target.src !== window.location.origin + 'static/img/ImageNotAvailable.png') {
                            e.target.src = 'static/img/ImageNotAvailable.png'
                          }
                        }}
                        className="w-[30%] h-full object-cover rounded-xl flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-green-200 uppercase text-xs tracking-[0.2em] mb-2">{movie.Year}</div>
                        <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">{movie.Title}</h3>
                        <p className="text-green-100/80 text-sm line-clamp-3">{movie.Plot || 'Không có tóm tắt.'}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-green-100/80">
                          <span className="rounded-full bg-green-500/10 px-2 py-1">{movie.Type}</span>
                          <span className="rounded-full bg-white/5 px-2 py-1">IMDb {movie.imdbRating || 'N/A'}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>

        {recommendedMovies.length > 0 && (
          <section className="relative">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-green-300/80">Dành cho bạn</p>
                <h2 className="text-3xl font-bold text-white">Phim đề xuất</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleRecommendationTags.slice(0, 4).map((genre) => (
                  <span key={genre} className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-200 border border-green-500/30">
                    {genre}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => scrollRecommendations(-1)}
                className="slow-float absolute left-0 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-green-300/40 bg-[#0b2d17]/90 text-2xl text-green-100 shadow-2xl shadow-black/60 backdrop-blur-md transition hover:bg-green-500 hover:text-black"
                aria-label="Cuộn phim đề xuất sang trái"
              >
                ←
              </button>

              <div
                ref={recommendedScrollRef}
                className="no-scrollbar flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 py-2"
              >
                {recommendedMovies.map((movie) => (
                  <button
                    key={movie.imdbID}
                    onClick={() => handleMovieClick(movie)}
                    className="group relative w-[190px] sm:w-[220px] flex-none snap-start overflow-hidden rounded-2xl border border-green-700/40 bg-[#0d2914] text-left shadow-xl shadow-black/30 transition-transform hover:-translate-y-1"
                  >
                    <div className="aspect-[2/3] overflow-hidden">
                      <img
                        src={movie.Poster && movie.Poster !== 'N/A' ? movie.Poster : '/static/img/ImageNotAvailable.png'}
                        alt={movie.Title}
                        onError={(e) => {
                          if (e.target.src !== window.location.origin + '/static/img/ImageNotAvailable.png') {
                            e.target.src = '/static/img/ImageNotAvailable.png'
                          }
                        }}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-4">
                      <h3 className="line-clamp-2 text-sm font-bold text-white">{movie.Title}</h3>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-green-100/90">
                        <span>{movie.Year || 'N/A'}</span>
                        <span>IMDb {movie.imdbRating || 'N/A'}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(movie.matchedGenres || []).slice(0, 2).map((genre) => (
                          <span key={genre} className="rounded-full bg-green-500/20 px-2 py-1 text-[11px] font-semibold text-green-100">
                            {genre}
                          </span>
                        ))}
                      </div>
                      {movie.recommendationReason && (
                        <p className="mt-2 line-clamp-2 text-[11px] text-green-100/70">
                          {movie.recommendationReason}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => scrollRecommendations(1)}
                className="slow-float absolute right-0 top-1/2 z-20 flex h-12 w-12 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-green-300/40 bg-[#0b2d17]/90 text-2xl text-green-100 shadow-2xl shadow-black/60 backdrop-blur-md transition hover:bg-green-500 hover:text-black"
                aria-label="Cuộn phim đề xuất sang phải"
              >
                →
              </button>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-6 gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-green-300/80">Bộ sưu tập</p>
              <h2 className="text-3xl font-bold text-white">Phim mới nhất</h2>
            </div>
            <button className="rounded-full border border-green-500/50 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/10 transition">Xem tất cả</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-6">
            {sortedMovies.map((movie) => (
              <div key={movie.imdbID} onClick={() => handleMovieClick(movie)} className="group relative bg-[#0d2914] rounded-3xl border border-green-700/40 overflow-hidden shadow-xl shadow-black/30 hover:-translate-y-1 transition-transform aspect-[2/3] cursor-pointer select-none" onSelect={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>

                <img
                  src={movie.Poster && movie.Poster !== 'N/A' ? movie.Poster : '/static/img/ImageNotAvailable.png'}
                  alt={movie.Title}
                  onError={(e) => {
                    if (e.target.src !== window.location.origin + '/static/img/ImageNotAvailable.png') {
                      e.target.src = '/static/img/ImageNotAvailable.png'
                    }
                  }}
                  className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                />

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#041c0c]/90 to-transparent p-4
                transition-opacity duration-300 group-hover:opacity-0">
                  <h3 className="text-sm font-semibold text-green-100 truncate
                 bg-green-900/60 backdrop-blur-sm
                 px-3 py-1.5 rounded-xl inline-block max-w-full">
                    {movie.Title}
                  </h3>
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-black/20
                    opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    flex flex-col justify-end p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white truncate">{movie.Title}</h3>
                    <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-200 shrink-0">{movie.Year}</span>
                  </div>
                  <p className="text-sm text-green-100/80 line-clamp-3">{movie.Plot || 'Không có tóm tắt.'}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-green-200/90">
                    <span className="px-2 py-1 rounded-full bg-white/10">IMDb {movie.imdbRating || 'N/A'}</span>
                    <span className="px-2 py-1 rounded-full bg-white/10">{movie.Runtime || 'N/A'}</span>
                    <span className="px-2 py-1 rounded-full bg-green-500/10 uppercase tracking-wider">{movie.Type}</span>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </section>
      </main>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 opacity-90 hover:opacity-100 transition-opacity">
        <div className="bg-[#0b2d17] border border-green-700/40 rounded-2xl p-4 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaginationPage(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={paginationPage.page <= 1}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-green-500/10 text-green-200 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              ‹
            </button>
            <span className="px-3 py-2 text-sm font-semibold text-green-200 min-w-[0rem] text-center">
              {paginationPage.page}
            </span>
            <button
              onClick={() => setPaginationPage(prev => ({ ...prev, page: prev.page + 1 }))}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-green-500/10 text-green-200 hover:bg-green-500/20 transition"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
