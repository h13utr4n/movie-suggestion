import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MOVIE_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History',
  'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi',
  'Sport', 'Thriller', 'War', 'Western'
]

function GenreSelectionPopup({ isOpen, onClose, onSave, initialGenres = [] }) {
  const [selectedGenres, setSelectedGenres] = useState(initialGenres)

  useEffect(() => {
    setSelectedGenres(initialGenres)
  }, [initialGenres])

  const toggleGenre = (genre) => {
    setSelectedGenres(prev =>
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    )
  }

  const handleSave = () => {
    onSave(selectedGenres)
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-2xl rounded-3xl border border-green-700/50 bg-[#0b2d17] p-8 shadow-2xl shadow-black/80"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white mb-2">Chọn thể loại phim yêu thích</h2>
            <p className="text-green-100/80">Hãy chọn các thể loại phim bạn thích để chúng tôi gợi ý phim phù hợp hơn</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
            {MOVIE_GENRES.map((genre) => (
              <motion.button
                key={genre}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleGenre(genre)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  selectedGenres.includes(genre)
                    ? 'bg-green-500 text-black shadow-lg shadow-green-500/50'
                    : 'border border-green-400/60 text-green-200 hover:bg-green-500/20 hover:border-green-400'
                }`}
              >
                {genre}
              </motion.button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <button
              onClick={onClose}
              className="rounded-full border border-green-400/30 px-6 py-3 text-sm font-semibold text-green-200 hover:bg-green-500/10 transition"
            >
              Bỏ qua
            </button>
            <button
              onClick={handleSave}
              disabled={selectedGenres.length === 0}
              className="rounded-full bg-green-500 px-6 py-3 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Lưu ({selectedGenres.length})
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default GenreSelectionPopup