import api from './api'
import type { ApiResponse, Task, TaskComment } from '@/types'

export interface TaskListParams {
  page?: number
  per_page?: number
  project_id?: string
  assignee_user_id?: string
  status?: string
  priority?: string
  sprint_id?: string
  is_overdue?: boolean
  include_subtasks?: boolean
}

export const taskService = {
  async list(params: TaskListParams = {}): Promise<ApiResponse<Task[]>> {
    const res = await api.get<ApiResponse<Task[]>>('/api/tasks', { params })
    return res.data
  },

  async get(id: string): Promise<Task> {
    const res = await api.get<ApiResponse<Task>>(`/api/tasks/${id}`)
    return res.data.data
  },

  async create(data: Partial<Task>): Promise<Task> {
    const res = await api.post<ApiResponse<Task>>('/api/tasks', data)
    return res.data.data
  },

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const res = await api.put<ApiResponse<Task>>(`/api/tasks/${id}`, data)
    return res.data.data
  },

  async updateStatus(id: string, status: string): Promise<Task> {
    const res = await api.patch<ApiResponse<Task>>(`/api/tasks/${id}/status`, { status })
    return res.data.data
  },

  async listComments(taskId: string): Promise<ApiResponse<TaskComment[]>> {
    const res = await api.get<ApiResponse<TaskComment[]>>(`/api/tasks/${taskId}/comments`)
    return res.data
  },

  async addComment(taskId: string, content: string): Promise<TaskComment> {
    const res = await api.post<ApiResponse<TaskComment>>(`/api/tasks/${taskId}/comments`, {
      content,
    })
    return res.data.data
  },
}
