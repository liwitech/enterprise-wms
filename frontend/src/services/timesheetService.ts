import api from './api'
import type { ApiResponse, TimesheetEntry, TimesheetEntryExtended, TimesheetSummary } from '@/types'

export interface TimesheetListParams {
  page?: number
  per_page?: number
  week_start?: string
  year?: number
  month?: number
  project_id?: string
  status?: string
}

export const timesheetService = {
  async list(params: TimesheetListParams = {}): Promise<ApiResponse<TimesheetEntry[]>> {
    const res = await api.get<ApiResponse<TimesheetEntry[]>>('/api/timesheets', { params })
    return res.data
  },

  async create(data: {
    task_id: string
    work_date: string
    hours_logged: number
    description?: string
  }): Promise<TimesheetEntry> {
    const res = await api.post<ApiResponse<TimesheetEntry>>('/api/timesheets', data)
    return res.data.data
  },

  async update(
    id: string,
    data: { work_date?: string; hours_logged?: number; description?: string },
  ): Promise<TimesheetEntry> {
    const res = await api.put<ApiResponse<TimesheetEntry>>(`/api/timesheets/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/api/timesheets/${id}`)
  },

  async submit(entryIds: string[]): Promise<TimesheetEntry[]> {
    const res = await api.post<ApiResponse<TimesheetEntry[]>>('/api/timesheets/submit', {
      entry_ids: entryIds,
    })
    return res.data.data
  },

  async getSummary(year: number, month: number): Promise<TimesheetSummary> {
    const res = await api.get<ApiResponse<TimesheetSummary>>('/api/timesheets/summary', {
      params: { year, month },
    })
    return res.data.data
  },

  async getPending(params: { page?: number; per_page?: number } = {}): Promise<
    ApiResponse<TimesheetEntryExtended[]>
  > {
    const res = await api.get<ApiResponse<TimesheetEntryExtended[]>>('/api/timesheets/pending', {
      params,
    })
    return res.data
  },

  async approve(id: string): Promise<TimesheetEntry> {
    const res = await api.post<ApiResponse<TimesheetEntry>>(`/api/timesheets/${id}/approve`)
    return res.data.data
  },

  async reject(id: string, rejectReason: string): Promise<TimesheetEntry> {
    const res = await api.post<ApiResponse<TimesheetEntry>>(`/api/timesheets/${id}/reject`, {
      reject_reason: rejectReason,
    })
    return res.data.data
  },

  async approveBatch(entryIds: string[]): Promise<TimesheetEntry[]> {
    const res = await api.post<ApiResponse<TimesheetEntry[]>>('/api/timesheets/approve-batch', {
      entry_ids: entryIds,
    })
    return res.data.data
  },
}
