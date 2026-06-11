import api from './api'
import type { ApiResponse, User } from '@/types'

export const userService = {
  listOrgUsers: (search?: string) =>
    api.get<ApiResponse<User[]>>('/api/users', { params: { search, per_page: 100 } })
      .then((r) => r.data.data ?? []),
}
