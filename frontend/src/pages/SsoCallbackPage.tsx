import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { authService } from '@/services/authService'
import { useAuthStore } from '@/stores/authStore'
import { useState } from 'react'

export default function SsoCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [error, setError] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')
    const errorDesc = searchParams.get('error_description')

    if (errorParam) {
      setError(errorDesc || 'WSO2 từ chối đăng nhập.')
      return
    }

    if (!code || !state) {
      setError('Thiếu thông tin callback từ WSO2.')
      return
    }

    async function exchange() {
      try {
        const tokens = await authService.ssoCallback(code!, state!)
        const tempStore = JSON.stringify({ state: { accessToken: tokens.access_token }, version: 0 })
        localStorage.setItem('auth-storage', tempStore)

        const user = await authService.me()
        setAuth(user, tokens.access_token)
        navigate('/dashboard', { replace: true })
      } catch (err: any) {
        const detail = err?.response?.data?.detail
        setError(detail || 'Đăng nhập SSO thất bại. Vui lòng thử lại.')
      }
    }

    exchange()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl text-center">
        <img src="/logo-tcg.jpg" alt="TC Group" className="mx-auto mb-6 h-16 w-auto object-contain" />

        {!error ? (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-red-500" />
            <p className="font-medium text-slate-700">Đang xác thực...</p>
            <p className="mt-1 text-sm text-slate-400">Vui lòng chờ trong giây lát</p>
          </>
        ) : (
          <>
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-500" />
            <p className="font-semibold text-slate-800">Đăng nhập thất bại</p>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="mt-6 w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
            >
              Quay lại trang đăng nhập
            </button>
          </>
        )}
      </div>
    </div>
  )
}
