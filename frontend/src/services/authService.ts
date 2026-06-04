import api from './api'
import type { AuthTokens, User } from '@/types'

export const authService = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const res = await api.post<AuthTokens>('/api/auth/login', { email, password })
    return res.data
  },

  async me(): Promise<User> {
    const res = await api.get<User>('/api/auth/me')
    return res.data
  },

  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // ignore logout errors
    }
  },
}
