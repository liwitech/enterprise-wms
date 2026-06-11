import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authService } from '@/services/authService'
import { useAuthStore } from '@/stores/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ssoLoading, setSsoLoading] = useState(false)
  const [error, setError] = useState('')

  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSsoLogin = async () => {
    setSsoLoading(true)
    setError('')
    try {
      const url = await authService.ssoGetAuthorizeUrl()
      window.location.href = url
    } catch {
      setError('Không thể kết nối đến máy chủ SSO. Vui lòng thử lại.')
      setSsoLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Vui lòng nhập đầy đủ thông tin đăng nhập.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const tokens = await authService.login(email, password)
      // Temporarily store token so api.ts can use it for /me call
      const tempStore = JSON.stringify({ state: { accessToken: tokens.access_token }, version: 0 })
      localStorage.setItem('auth-storage', tempStore)

      const user = await authService.me()
      setAuth(user, tokens.access_token)
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.detail
      if (msg === 'Invalid credentials') {
        setError('Email hoặc mật khẩu không đúng.')
      } else if (err?.response?.status === 429) {
        setError('Quá nhiều lần thử. Vui lòng chờ vài phút rồi thử lại.')
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/logo-tcg.jpg" alt="TC Group" className="h-24 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Quản lý Công việc</h1>
            <p className="mt-1 text-sm text-gray-500">TC Group — Hệ thống quản lý công việc doanh nghiệp</p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="mb-6 text-xl font-semibold text-gray-800">Đăng nhập</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập địa chỉ email"
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Mật khẩu</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">hoặc</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* SSO Button */}
          <button
            onClick={handleSsoLogin}
            disabled={ssoLoading || loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ssoLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <img
                src="https://login-test.hyundai.thanhcong.vn/favicon.ico"
                alt=""
                className="h-4 w-4"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            Đăng nhập với Hyundai Thành Công SSO
          </button>
        </div>
      </div>
    </div>
  )
}
