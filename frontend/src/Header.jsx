import { motion } from 'framer-motion'

function Header({ user, onLogout, onOpenAuth, scrolled = false, leftContent = null }) {
  return (
    <header className={`sticky top-0 z-50 border-b border-green-700/40 px-6 sm:px-10
                       flex flex-col sm:flex-row items-center justify-between gap-4
                       bg-[#041c0c]/90 backdrop-blur-md
                       transition-all duration-300
                       ${scrolled ? 'py-2' : 'py-5'}`}>
      <div className="flex items-center gap-4">
        {leftContent}
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
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <span className="text-sm text-green-100">Xin chào, <strong>{user.full_name}</strong></span>
            <button onClick={onLogout} className="rounded-full border border-green-400/40 px-5 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 transition">Đăng xuất</button>
          </>
        ) : (
          <>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onOpenAuth('login')}
              className="rounded-full border border-green-400/40 px-5 py-2 text-sm font-semibold text-green-200 hover:bg-green-500/20 transition"
            >
              Đăng nhập
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onOpenAuth('register')}
              className="rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-black hover:bg-green-400 transition"
            >
              Đăng ký
            </motion.button>
          </>
        )}
      </div>
    </header>
  )
}

export default Header