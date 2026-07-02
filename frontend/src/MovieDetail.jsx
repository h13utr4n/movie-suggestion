import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Header from './Header'
import { API_BASE_URL } from './config'

function MovieDetail() {
  const { imdbID } = useParams()
  const navigate = useNavigate()
  const watchStartedAtRef = useRef(null)
  const watchLastSyncedAtRef = useRef(null)
  const watchLastActiveAtRef = useRef(Date.now())
  const trackedMovieRef = useRef(null)
  const [movie, setMovie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Actor states
  const [selectedActor, setSelectedActor] = useState(null)
  const [actorDetails, setActorDetails] = useState(null)
  const [loadingActorDetails, setLoadingActorDetails] = useState(false)
  const [actorError, setActorError] = useState(null)
  const [actors, setActors] = useState([])

  // Auth states
  const [authMode, setAuthMode] = useState(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '', full_name: '' })
  const [authError, setAuthError] = useState(null)
  const [authSuccess, setAuthSuccess] = useState(null)
  const [user, setUser] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewSummary, setReviewSummary] = useState({ average_rating: 0, review_count: 0 })
  const [reviewRating, setReviewRating] = useState(5)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [reviewContent, setReviewContent] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState(null)
  const [reviewSuccess, setReviewSuccess] = useState(null)

  useEffect(() => {
    fetchMovieDetail()
    fetchMovieReviews()
  }, [imdbID])

  useEffect(() => {
    const savedToken = localStorage.getItem('access_token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setUser(JSON.parse(savedUser))
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!user || !token || trackedMovieRef.current === imdbID) return

    const now = Date.now()
    trackedMovieRef.current = imdbID
    watchStartedAtRef.current = now
    watchLastSyncedAtRef.current = now
    watchLastActiveAtRef.current = now

    fetch(`${API_BASE_URL}/watch-history/${imdbID}/visit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).catch((err) => {
      console.error('Error recording watch visit:', err)
    })
  }, [user, imdbID])

  useEffect(() => {
    const markActive = () => {
      watchLastActiveAtRef.current = Date.now()
    }

    const syncWatchTime = () => {
      const token = localStorage.getItem('access_token')
      if (!token || trackedMovieRef.current !== imdbID || !watchLastSyncedAtRef.current) return

      const now = Date.now()
      const elapsedSeconds = Math.floor((now - watchLastSyncedAtRef.current) / 1000)
      const recentlyActive = document.visibilityState === 'visible' && now - watchLastActiveAtRef.current <= 30000
      if (elapsedSeconds <= 0) return
      watchLastSyncedAtRef.current = now
      if (!recentlyActive) return

      const seconds = Math.min(elapsedSeconds, 300)

      fetch(`${API_BASE_URL}/watch-history/${imdbID}/time`, {
        method: 'PUT',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ seconds, active: recentlyActive })
      }).catch((err) => {
        console.error('Error syncing watch time:', err)
      })
    }

    const handleBeforeUnload = () => syncWatchTime()
    const syncInterval = window.setInterval(syncWatchTime, 60000)
    window.addEventListener('mousemove', markActive)
    window.addEventListener('keydown', markActive)
    window.addEventListener('scroll', markActive, { passive: true })
    window.addEventListener('focus', markActive)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.clearInterval(syncInterval)
      window.removeEventListener('mousemove', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('scroll', markActive)
      window.removeEventListener('focus', markActive)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      syncWatchTime()
    }
  }, [imdbID])

  const fetchMovieDetail = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/movies/${imdbID}`)
      if (!response.ok) {
        throw new Error('Failed to fetch movie details')
      }
      const movieData = await response.json()
      setMovie(movieData)
      
      // Parse actors from movie
      if (movieData.Actors) {
        const actorList = movieData.Actors.split(', ').map(name => name.trim())
        setActors(actorList)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchMovieReviews = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/movies/${imdbID}/reviews`)
      if (!response.ok) {
        throw new Error('Không thể tải đánh giá phim')
      }
      const data = await response.json()
      setReviews(data.data || [])
      setReviewSummary({
        average_rating: data.average_rating || 0,
        review_count: data.review_count || 0
      })
    } catch (err) {
      setReviewError(err.message)
    }
  }

  const handleReviewSubmit = async (event) => {
    event.preventDefault()
    setReviewError(null)
    setReviewSuccess(null)

    if (!user) {
      setReviewError('Vui lòng đăng nhập để đánh giá phim.')
      openAuth('login')
      return
    }

    if (!reviewContent.trim()) {
      setReviewError('Vui lòng nhập nội dung đánh giá.')
      return
    }

    setReviewSubmitting(true)

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/movies/${imdbID}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rating: reviewRating,
          content: reviewContent.trim()
        })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Không thể lưu đánh giá.')
      }

      setReviewSuccess('Đã lưu đánh giá của bạn.')
      setReviewContent('')
      setReviewRating(5)
      await fetchMovieReviews()
    } catch (err) {
      setReviewError(err.message)
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleBackToList = () => {
    navigate('/')
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
    const token = localStorage.getItem('access_token')
    if (token && trackedMovieRef.current === imdbID && watchLastSyncedAtRef.current) {
      const seconds = Math.floor((Date.now() - watchLastSyncedAtRef.current) / 1000)
      if (seconds > 0) {
        fetch(`${API_BASE_URL}/watch-history/${imdbID}/time`, {
          method: 'PUT',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ seconds })
        }).catch((err) => {
          console.error('Error syncing watch time on logout:', err)
        })
      }
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
    setAuthError(null)
    setAuthSuccess(null)
  }

  const formatReviewDate = (value) => {
    if (!value) return ''
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value))
  }

  const handleActorClick = async (actorName) => {
    setSelectedActor(actorName)
    setLoadingActorDetails(true)
    setActorDetails(null)  // Clear previous actor details
    setActorError(null)    // Clear previous error
    try {
      // Search for actor using TMDB
      const searchResponse = await fetch(`${API_BASE_URL}/actors/search?name=${encodeURIComponent(actorName)}`)
      const searchData = await searchResponse.json()
      
      if (!searchData.results || searchData.results.length === 0) {
        setActorError('Không tìm thấy thông tin diễn viên này')
        return
      }

      const actorId = searchData.results[0].id
      
      // Fetch actor details
      const detailResponse = await fetch(`${API_BASE_URL}/actors/${actorId}`)
      if (!detailResponse.ok) {
        setActorError('Không thể tải thông tin diễn viên')
        return
      }
      
      const details = await detailResponse.json()
      if (details.success === false || !details) {
        setActorError('Dữ liệu diễn viên không hợp lệ')
        return
      }
      
      setActorDetails(details)
    } catch (err) {
      console.error('Error fetching actor details:', err)
      setActorError('Có lỗi xảy ra khi tải thông tin diễn viên')
    } finally {
      setLoadingActorDetails(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#041c0c] via-[#0f371d] to-[#041c0c] text-white flex justify-center items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <div className="inline-block mb-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 border-4 border-green-500/30 border-t-green-500 rounded-full"
            />
          </div>
          <p className="text-xl font-semibold text-green-100">Đang tải thông tin phim...</p>
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#041c0c] via-[#0f371d] to-[#041c0c] text-white flex justify-center items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center p-8 bg-red-500/10 border border-red-500/50 rounded-2xl backdrop-blur-md max-w-md"
        >
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-xl font-semibold text-red-300 mb-2">Có lỗi xảy ra</p>
          <p className="text-red-200/80">{error}</p>
        </motion.div>
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#041c0c] via-[#0f371d] to-[#041c0c] text-white flex justify-center items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center p-8 bg-yellow-500/10 border border-yellow-500/50 rounded-2xl backdrop-blur-md max-w-md"
        >
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-xl font-semibold text-yellow-300">Không tìm thấy phim</p>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen bg-gradient-to-br from-[#041c0c] via-[#0f371d] to-[#041c0c] text-white select-none"
      onSelect={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Header */}
      <Header
        user={user}
        onLogout={handleLogout}
        onOpenAuth={openAuth}
        leftContent={
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleBackToList}
            className="rounded-full border border-green-400/60 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 hover:border-green-400 transition-all duration-200"
          >
            ← Quay lại
          </motion.button>
        }
      />

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

      {/* Main Content */}
      <main className="px-6 sm:px-10 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Poster Section */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="lg:w-1/3"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-green-500/0 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
                <img
                  src={movie.Poster && movie.Poster !== 'N/A' ? movie.Poster : '/static/img/ImageNotAvailable.png'}
                  alt={movie.Title}
                  onError={(e) => {
                    if (e.target.src !== window.location.origin + '/static/img/ImageNotAvailable.png') {
                      e.target.src = '/static/img/ImageNotAvailable.png'
                    }
                  }}
                  className="w-full rounded-3xl object-cover shadow-2xl border border-green-500/30 group-hover:border-green-400/60 transition-all duration-300 relative z-10"
                />
              </div>
            </motion.div>

            {/* Details Section */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:w-2/3 space-y-8"
            >
              {/* Title & Meta */}
              <div>
                <motion.h1
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="text-5xl lg:text-6xl font-black text-white mb-6 leading-tight"
                >
                  {movie.Title}
                </motion.h1>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="flex flex-wrap items-center gap-3 text-sm text-green-200"
                >
                  <span className="rounded-full bg-gradient-to-r from-green-500/20 to-green-500/10 px-4 py-2 border border-green-500/50 font-semibold">📅 {movie.Year}</span>
                  <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-purple-500/10 px-4 py-2 border border-purple-500/50 font-semibold">⏱️ {movie.Runtime || 'N/A'}</span>
                  <span className="rounded-full bg-gradient-to-r from-blue-500/20 to-blue-500/10 px-4 py-2 border border-blue-500/50 font-semibold">🎞️ {movie.Genre || 'N/A'}</span>
                  <span className="rounded-full bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 px-4 py-2 border border-yellow-500/50 font-semibold">⭐ {movie.imdbRating || 'N/A'}</span>
                </motion.div>
              </div>

              {/* Plot */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded-2xl p-6"
              >
                <h3 className="text-2xl font-bold text-green-300 mb-4 flex items-center gap-2">
                  <span className="text-3xl">📖</span> Tóm tắt
                </h3>
                <p className="text-green-100/90 leading-relaxed text-lg">{movie.Plot || 'Không có tóm tắt.'}</p>
              </motion.div>

              {/* Info Grid */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {[
                  { label: 'Đạo diễn', value: movie.Director, icon: '🎬' },
                  { label: 'Quốc gia', value: movie.Country, icon: '🌍' },
                  { label: 'Ngôn ngữ', value: movie.Language, icon: '🗣️' },
                  { label: 'Ngày phát hành', value: movie.Released, icon: '📆' },
                  { label: 'Nhà biên kịch', value: movie.Writer, icon: '✍️' }
                ].map((item, idx) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + idx * 0.05, duration: 0.5 }}
                    className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30 rounded-xl p-4 hover:border-green-400/60 hover:from-green-500/15 transition-all duration-300"
                  >
                    <h3 className="text-sm font-semibold text-green-300 mb-2 flex items-center gap-2">
                      <span className="text-lg">{item.icon}</span>
                      {item.label}
                    </h3>
                    <p className="text-green-100/90">{item.value || 'N/A'}</p>
                  </motion.div>
                ))}
              </motion.div>

              

              {/* Cast Section */}
              {actors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.3, duration: 0.6 }}
                  className="pt-8 border-t border-green-700/40"
                >
                  <h3 className="text-2xl font-bold text-green-300 mb-6 flex items-center gap-2">
                    <span className="text-3xl">🎭</span> Diễn viên chính
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {actors.map((actor, index) => (
                      <motion.button
                        key={index}
                        onClick={() => handleActorClick(actor)}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.35 + index * 0.05, duration: 0.4 }}
                        className="bg-gradient-to-br from-purple-500/20 to-purple-500/10 border border-purple-500/40 rounded-xl p-4 hover:border-purple-400/70 hover:from-purple-500/30 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 text-left group cursor-pointer"
                      >
                        <div className="text-2xl mb-3 group-hover:scale-105 transition-transform duration-300">👤</div>
                        <div className="text-sm font-semibold text-purple-200 line-clamp-2 group-hover:text-purple-100 transition-colors">
                          {actor}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Genres */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
              >
                <h3 className="text-xl font-bold text-green-300 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🏷️</span> Thể loại
                </h3>
                <div className="flex flex-wrap gap-3">
                  {movie.Genre ? movie.Genre.split(', ').map((genre, idx) => (
                    <motion.span
                      key={genre}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8 + idx * 0.05, duration: 0.3 }}
                      className="rounded-full bg-gradient-to-r from-green-500/20 to-green-500/10 px-4 py-2 text-green-300 text-sm font-semibold border border-green-500/40 hover:border-green-300 hover:from-green-500/30 transition-all duration-200 cursor-pointer"
                    >
                      {genre}
                    </motion.span>
                  )) : <span className="text-green-100">N/A</span>}
                </div>
              </motion.div>

              {/* User Reviews */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.85, duration: 0.6 }}
                className="pt-8 border-t border-green-700/40"
                onMouseDown={(e) => e.stopPropagation()}
                onSelect={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-green-300 flex items-center gap-2">
                      <span className="text-3xl">⭐</span> Đánh giá của người xem
                    </h3>
                    <p className="mt-2 text-sm text-green-100/70">
                      {reviewSummary.review_count > 0
                        ? `${reviewSummary.average_rating}/5 từ ${reviewSummary.review_count} đánh giá`
                        : 'Chưa có đánh giá nào cho phim này'}
                    </p>
                  </div>
                  {reviewSummary.review_count > 0 && (
                    <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-5 py-3 text-yellow-200">
                      <span className="text-2xl font-black">{reviewSummary.average_rating}</span>
                      <span className="ml-1 text-sm font-semibold">/5</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleReviewSubmit} className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-green-100 mb-2">Điểm của bạn</label>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = star <= (hoveredRating || reviewRating)
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              onMouseEnter={() => setHoveredRating(star)}
                              onMouseLeave={() => setHoveredRating(0)}
                              className={`text-3xl transition ${active ? 'text-yellow-300 scale-105' : 'text-green-900 hover:text-yellow-200'}`}
                              aria-label={`${star} sao`}
                            >
                              ★
                            </button>
                          )
                        })}
                        <span className="ml-3 text-sm font-semibold text-green-100">{reviewRating}/5</span>
                      </div>
                    </div>

                    {!user && (
                      <button
                        type="button"
                        onClick={() => openAuth('login')}
                        className="rounded-full border border-green-400/40 px-5 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 transition"
                      >
                        Đăng nhập để đánh giá
                      </button>
                    )}
                  </div>

                  <label className="block text-sm font-semibold text-green-100 mb-2">Nội dung đánh giá</label>
                  <textarea
                    value={reviewContent}
                    onChange={(event) => setReviewContent(event.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder="Chia sẻ cảm nhận của bạn về bộ phim..."
                    className="w-full resize-none rounded-2xl border border-green-600/50 bg-[#06180d] px-4 py-3 text-white outline-none focus:border-green-400"
                  />

                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-h-5 text-sm">
                      {reviewError && <span className="text-red-300">{reviewError}</span>}
                      {reviewSuccess && <span className="text-green-300">{reviewSuccess}</span>}
                    </div>
                    <button
                      type="submit"
                      disabled={reviewSubmitting}
                      className="rounded-full bg-green-500 px-6 py-3 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {reviewSubmitting ? 'Đang lưu...' : 'Gửi đánh giá'}
                    </button>
                  </div>
                </form>

                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-2xl border border-green-500/25 bg-black/20 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">{review.user_name}</div>
                          <div className="mt-1 text-xs text-green-100/60">{formatReviewDate(review.updated_at)}</div>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-300">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={star <= review.rating ? 'text-yellow-300' : 'text-green-900'}>★</span>
                          ))}
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-line text-green-100/90 leading-relaxed">{review.content}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Additional Info */}
              {(movie.Awards || movie.Metascore || movie.imdbVotes || movie.BoxOffice || movie.DVD) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.6 }}
                  className="pt-8 border-t border-green-700/40"
                >
                  <h3 className="text-2xl font-bold text-green-300 mb-6 flex items-center gap-2">
                    <span className="text-3xl">✨</span> Thông tin bổ sung
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {movie.Awards && movie.Awards !== 'N/A' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.95 }}
                        className="bg-gradient-to-br from-yellow-500/15 to-yellow-500/5 border border-yellow-500/40 rounded-xl p-4"
                      >
                        <div className="text-2xl mb-2">🏆</div>
                        <div className="text-xs text-yellow-300/70 mb-1">Giải thưởng</div>
                        <div className="text-sm font-semibold text-yellow-100">{movie.Awards}</div>
                      </motion.div>
                    )}

                    {movie.Metascore && movie.Metascore !== 'N/A' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.0 }}
                        className="bg-gradient-to-br from-purple-500/15 to-purple-500/5 border border-purple-500/40 rounded-xl p-4"
                      >
                        <div className="text-2xl mb-2">📊</div>
                        <div className="text-xs text-purple-300/70 mb-1">Metascore</div>
                        <div className="text-sm font-semibold text-purple-100">{movie.Metascore}/100</div>
                      </motion.div>
                    )}

                    {movie.imdbVotes && movie.imdbVotes !== 'N/A' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.05 }}
                        className="bg-gradient-to-br from-blue-500/15 to-blue-500/5 border border-blue-500/40 rounded-xl p-4"
                      >
                        <div className="text-2xl mb-2">🗳️</div>
                        <div className="text-xs text-blue-300/70 mb-1">IMDb Votes</div>
                        <div className="text-sm font-semibold text-blue-100">{movie.imdbVotes}</div>
                      </motion.div>
                    )}

                    {movie.BoxOffice && movie.BoxOffice !== 'N/A' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.1 }}
                        className="bg-gradient-to-br from-green-500/15 to-green-500/5 border border-green-500/40 rounded-xl p-4"
                      >
                        <div className="text-2xl mb-2">💰</div>
                        <div className="text-xs text-green-300/70 mb-1">Doanh thu</div>
                        <div className="text-sm font-semibold text-green-100">{movie.BoxOffice}</div>
                      </motion.div>
                    )}

                    {movie.DVD && movie.DVD !== 'N/A' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.15 }}
                        className="bg-gradient-to-br from-red-500/15 to-red-500/5 border border-red-500/40 rounded-xl p-4"
                      >
                        <div className="text-2xl mb-2">📀</div>
                        <div className="text-xs text-red-300/70 mb-1">DVD Release</div>
                        <div className="text-sm font-semibold text-red-100">{movie.DVD}</div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Ratings */}
              {movie.Ratings && movie.Ratings.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2, duration: 0.6 }}
                  className="pt-8 border-t border-green-700/40"
                >
                  <h3 className="text-2xl font-bold text-green-300 mb-6 flex items-center gap-2">
                    <span className="text-3xl">⭐</span> Đánh giá từ các nguồn
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {movie.Ratings.map((rating, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.25 + index * 0.05, duration: 0.4 }}
                        className="bg-gradient-to-br from-green-500/20 to-green-500/10 border border-green-500/50 rounded-xl p-5 hover:border-green-400/70 hover:from-green-500/30 transition-all duration-300 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-green-300/80 mb-2 uppercase tracking-wider">{rating.Source}</div>
                        <div className="text-2xl font-bold text-green-100">{rating.Value}</div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>
      </main>

      {/* Actor Details Modal */}
      <AnimatePresence>
        {selectedActor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => {
              setSelectedActor(null)
              setActorDetails(null)
              setActorError(null)
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gradient-to-br from-[#0f371d] to-[#041c0c] border border-green-500/50 rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedActor(null)
                  setActorDetails(null)
                  setActorError(null)
                }}
                className="absolute top-4 right-4 text-green-300 hover:text-green-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>

              {loadingActorDetails ? (
                <div className="flex justify-center items-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-12 h-12 border-4 border-green-500/30 border-t-green-500 rounded-full"
                  />
                </div>
              ) : actorError ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">⚠️</div>
                  <p className="text-lg font-semibold text-red-300 mb-2">Có lỗi xảy ra</p>
                  <p className="text-red-200/70">{actorError}</p>
                </div>
              ) : actorDetails ? (
                <div className="space-y-6">
                  {/* Header */}
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">{actorDetails.name}</h2>
                    {actorDetails.character && (
                      <p className="text-green-300 text-lg">
                        {typeof actorDetails.character === 'string' ? actorDetails.character : 'Diễn viên'}
                      </p>
                    )}
                  </div>

                  {/* Profile Picture */}
                  {actorDetails.profile_path && (
                    <div className="flex justify-center">
                      <img
                        src={`https://image.tmdb.org/t/p/w300${actorDetails.profile_path}`}
                        alt={actorDetails.name}
                        className="w-48 h-auto rounded-2xl shadow-lg border border-green-500/30"
                      />
                    </div>
                  )}

                  {/* Biography */}
                  {actorDetails.biography && (
                    <div>
                      <h3 className="text-xl font-bold text-green-300 mb-3">Tiểu sử</h3>
                      <p className="text-green-100/90 leading-relaxed">
                        {actorDetails.biography || 'Không có thông tin'}
                      </p>
                    </div>
                  )}

                  {/* Information Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {actorDetails.birthday && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                        <div className="text-sm text-green-300/70 mb-1">Ngày sinh</div>
                        <div className="text-green-100 font-semibold">{actorDetails.birthday}</div>
                      </div>
                    )}

                    {actorDetails.place_of_birth && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                        <div className="text-sm text-green-300/70 mb-1">Nơi sinh</div>
                        <div className="text-green-100 font-semibold">{actorDetails.place_of_birth}</div>
                      </div>
                    )}

                    {actorDetails.known_for_department && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                        <div className="text-sm text-green-300/70 mb-1">Lĩnh vực nổi tiếng</div>
                        <div className="text-green-100 font-semibold">{actorDetails.known_for_department}</div>
                      </div>
                    )}

                    {actorDetails.popularity && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                        <div className="text-sm text-green-300/70 mb-1">Mức độ nổi tiếng</div>
                        <div className="text-green-100 font-semibold">{Math.round(actorDetails.popularity)}</div>
                      </div>
                    )}
                  </div>

                  {/* External Links */}
                  {actorDetails.external_ids && (
                    <div>
                      <h3 className="text-xl font-bold text-green-300 mb-3">Liên kết</h3>
                      <div className="flex gap-3 flex-wrap">
                        {actorDetails.external_ids.imdb_id && (
                          <a
                            href={`https://www.imdb.com/name/${actorDetails.external_ids.imdb_id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-300 hover:bg-yellow-500/30 transition-all"
                          >
                            IMDb
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-green-300/70">Không thể tải thông tin diễn viên</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="border-t border-green-700/30 px-6 sm:px-10 py-8 bg-gradient-to-r from-[#041c0c]/50 to-[#0f371d]/50 backdrop-blur-md mt-12"
      >
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-green-300/70 text-sm">
            Made with <span className="text-red-500">❤️</span> by <span className="font-semibold text-green-300">Cinema Pulse</span>
          </p>
        </div>
      </motion.footer>
    </motion.div>
  )
}

export default MovieDetail
