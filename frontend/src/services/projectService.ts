import api from './api'
import type {
  ApiResponse,
  Project,
  ProjectDetail,
  ProjectDashboard,
  ProjectMember,
  Sprint,
} from '@/types'

export interface ProjectListParams {
  page?: number
  per_page?: number
  search?: string
  status?: string
  priority?: string
  sort?: string
}

export const projectService = {
  async list(params: ProjectListParams = {}): Promise<ApiResponse<Project[]>> {
    const res = await api.get<ApiResponse<Project[]>>('/api/projects', { params })
    return res.data
  },

  async get(id: string): Promise<ProjectDetail> {
    const res = await api.get<ApiResponse<ProjectDetail>>(`/api/projects/${id}`)
    return res.data.data
  },

  async create(data: Partial<Project>): Promise<Project> {
    const res = await api.post<ApiResponse<Project>>('/api/projects', data)
    return res.data.data
  },

  async update(id: string, data: Partial<Project>): Promise<Project> {
    const res = await api.put<ApiResponse<Project>>(`/api/projects/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/api/projects/${id}`)
  },

  async getDashboard(id: string): Promise<ProjectDashboard> {
    const res = await api.get<ApiResponse<ProjectDashboard>>(`/api/projects/${id}/dashboard`)
    return res.data.data
  },

  async addMember(projectId: string, userId: string, role: string): Promise<ProjectMember> {
    const res = await api.post<ApiResponse<ProjectMember>>(`/api/projects/${projectId}/members`, {
      user_id: userId,
      role,
    })
    return res.data.data
  },

  async removeMember(projectId: string, userId: string): Promise<void> {
    await api.delete(`/api/projects/${projectId}/members/${userId}`)
  },

  async listSprints(projectId: string): Promise<Sprint[]> {
    const res = await api.get<ApiResponse<Sprint[]>>(`/api/projects/${projectId}/sprints`)
    return res.data.data
  },

  async createSprint(projectId: string, data: Partial<Sprint>): Promise<Sprint> {
    const res = await api.post<ApiResponse<Sprint>>(`/api/projects/${projectId}/sprints`, {
      project_id: projectId,
      ...data,
    })
    return res.data.data
  },

  async activateSprint(projectId: string, sprintId: string): Promise<Sprint> {
    const res = await api.put<ApiResponse<Sprint>>(
      `/api/projects/${projectId}/sprints/${sprintId}/activate`,
    )
    return res.data.data
  },
}
