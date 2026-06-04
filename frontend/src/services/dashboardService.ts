import api from './api'
import type { ApiResponse, ExecutiveDashboardResponse } from '@/types'

export interface ExecutiveDashboardParams {
  dept_id?: string
  period?: 'current_month' | 'current_quarter' | 'custom'
  date_from?: string
  date_to?: string
}

export const dashboardService = {
  async getExecutive(params: ExecutiveDashboardParams = {}): Promise<ExecutiveDashboardResponse> {
    const res = await api.get<ApiResponse<ExecutiveDashboardResponse>>('/api/dashboard/executive', {
      params,
    })
    return res.data.data
  },
}
