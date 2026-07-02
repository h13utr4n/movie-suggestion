import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from './config'

function ActivateAccount() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Dang kich hoat tai khoan...')

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setStatus('error')
      setMessage('Lien ket kich hoat khong hop le.')
      return
    }

    const activate = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/activate?token=${encodeURIComponent(token)}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || data.message || 'Khong the kich hoat tai khoan.')
        }

        setStatus('success')
        setMessage(data.message || 'Tai khoan da duoc kich hoat. Ban co the dang nhap.')
      } catch (error) {
        setStatus('error')
        setMessage(error.message)
      }
    }

    activate()
  }, [searchParams])

  return (
    <div className="min-h-screen bg-[#041c0c] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-green-700/50 bg-[#0b2d17] p-8 shadow-2xl shadow-black/60">
        <p className="text-sm uppercase tracking-[0.3em] text-green-300/80">Cinema Pulse</p>
        <h1 className="mt-3 text-3xl font-bold">
          {status === 'loading' ? 'Dang kich hoat' : status === 'success' ? 'Kich hoat thanh cong' : 'Kich hoat that bai'}
        </h1>
        <p className={`mt-4 text-sm ${status === 'error' ? 'text-red-300' : 'text-green-100/90'}`}>
          {message}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-black hover:bg-green-400 transition"
        >
          Ve trang chu de dang nhap
        </Link>
      </div>
    </div>
  )
}

export default ActivateAccount
