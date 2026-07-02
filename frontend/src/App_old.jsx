import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { API_BASE_URL } from './config'

function App() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [movies, setMovies] = useState([])
  const [newMovies, setNewMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [paginationPage, setPaginationPage] = useState({ page: 1, limit: 24 })
  const [carouselIndex, setCarouselIndex] = useState(0)

  useEffect(() => {
    fetchMovies()
  }, [paginationPage])

  useEffect(() => {
    fetchNewMovies();
  }, [])
  
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

  const handleBackToList = () => {
    navigate('/')
  }

  const preventSelection = (e) => {
    e.preventDefault()
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen bg-black text-white"><div>Loading...</div></div>
  if (error) return <div className="flex justify-center items-center min-h-screen bg-black text-white"><div>Error: {error}</div></div>

  return (
    <div className="min-h-screen bg-[#041c0c] text-white">
      <AnimatePresence mode="wait">
        {view === 'detail' && selectedMovie ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="select-none"
            onSelect={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {detailLoading ? (
              <div className="flex justify-center items-center min-h-screen">
                <div className="text-white text-xl">Loading movie details...</div>
              </div>
            ) : (
              <div>
                <header className="sticky top-0 z-50 border-b border-green-700/40 px-6 sm:px-10 py-5 bg-[#041c0c]/90 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleBackToList}
                    className="rounded-full border border-green-400/40 px-4 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 transition"
                  >
                    ← Quay lại
                  </button>
                  <div>
                    <p className="text-green-300 uppercase tracking-[0.3em] font-semibold text-sm">
                      Movie Suggestion
                    </p>
                    <h1 className="font-black tracking-tight text-2xl">
                      Cinema Pulse
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="rounded-full border border-green-400/40 px-5 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 transition">Đăng nhập</button>
                  <button className="rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-black hover:bg-green-400 transition">Đăng ký</button>
                </div>
              </div>
            </header>

            <main className="px-6 sm:px-10 py-8">
              <div className="max-w-6xl mx-auto">
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="lg:w-1/3">
                    <img
                      src={selectedMovie.Poster && selectedMovie.Poster !== 'N/A' ? selectedMovie.Poster : '/static/img/ImageNotAvailable.png'}
                      alt={selectedMovie.Title}
                      onError={(e) => {
                        if (e.target.src !== window.location.origin + '/static/img/ImageNotAvailable.png') {
                          e.target.src = '/static/img/ImageNotAvailable.png'
                        }
                      }}
                      className="w-full rounded-3xl object-cover shadow-2xl"
                    />
                  </div>
                  
                  <div className="lg:w-2/3 space-y-6">
                    <div>
                      <h1 className="text-4xl lg:text-5xl font-black text-white mb-4">{selectedMovie.Title}</h1>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-green-200 mb-6">
                        <span className="rounded-full bg-green-500/10 px-4 py-2">{selectedMovie.Year}</span>
                        <span className="rounded-full bg-white/10 px-4 py-2">{selectedMovie.Runtime || 'N/A'}</span>
                        <span className="rounded-full bg-green-500/10 px-4 py-2">{selectedMovie.Genre || 'N/A'}</span>
                        <span className="rounded-full bg-white/10 px-4 py-2">IMDb {selectedMovie.imdbRating || 'N/A'}</span>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-2xl font-bold text-green-200 mb-3">Tóm tắt</h3>
                      <p className="text-green-100/90 leading-relaxed text-lg">{selectedMovie.Plot || 'Không có tóm tắt.'}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-xl font-semibold text-green-200 mb-2">Đạo diễn</h3>
                        <p className="text-green-100 text-lg">{selectedMovie.Director || 'N/A'}</p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-green-200 mb-2">Diễn viên</h3>
                        <p className="text-green-100 text-lg">{selectedMovie.Actors || 'N/A'}</p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-green-200 mb-2">Quốc gia</h3>
                        <p className="text-green-100 text-lg">{selectedMovie.Country || 'N/A'}</p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-green-200 mb-2">Ngôn ngữ</h3>
                        <p className="text-green-100 text-lg">{selectedMovie.Language || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xl font-semibold text-green-200 mb-3">Thể loại</h3>
                      <div className="flex flex-wrap gap-3">
                        {selectedMovie.Genre ? selectedMovie.Genre.split(', ').map(genre => (
                          <span key={genre} className="rounded-full bg-green-500/10 px-4 py-2 text-green-200 text-sm font-semibold">
                            {genre}
                          </span>
                        )) : <span className="text-green-100">N/A</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </main>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.3 }}
            className="select-none"
            onSelect={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
      <header className={`sticky top-0 z-50 border-b border-green-700/40 px-6 sm:px-10
                         flex flex-col sm:flex-row items-center justify-between gap-4
                         bg-[#041c0c]/90 backdrop-blur-md
                         transition-all duration-300
                         ${scrolled ? 'py-2' : 'py-5'}`}>
        <div>
          <p className={`text-green-300 uppercase tracking-[0.3em] font-semibold transition-all duration-300
                        ${scrolled ? 'text-xs' : 'text-sm'}`}>
            Movie Suggestion
          </p>
          <h1 className={`font-black tracking-tight transition-all duration-300
                         ${scrolled ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}>
            Cinema Pulse
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded-full border border-green-400/40 px-5 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 transition">Đăng nhập</button>
          <button className="rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-black hover:bg-green-400 transition">Đăng ký</button>
        </div>
      </header>

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
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
