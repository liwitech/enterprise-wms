import api from './api'
import type { ApiResponse, DepartmentBrief } from '@/types'

export const departmentService = {
  async list(): Promise<DepartmentBrief[]> {
    const res = await api.get<ApiResponse<DepartmentBrief[]>>('/api/departments')
    return res.data.data
  },
}
