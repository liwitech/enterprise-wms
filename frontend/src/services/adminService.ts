import api from './api'
import type { ApiResponse, Organization, Department, User, UserRole, DeptType } from '@/types'

export interface AdminDeptCreate {
  name: string
  code: string
  dept_type: DeptType
  parent_dept_id?: string
  manager_user_id?: string
}

export interface AdminDeptUpdate {
  name?: string
  code?: string
  dept_type?: DeptType
  parent_dept_id?: string | null
  manager_user_id?: string | null
}

export interface OrgUpdate {
  name?: string
  logo_url?: string
}

export interface AdminUserCreate {
  email: string
  full_name: string
  password: string
  dept_id?: string
  employee_code?: string
  role: UserRole
}

export interface AdminUserUpdate {
  full_name?: string
  dept_id?: string | null
  employee_code?: string
  role?: UserRole
  is_active?: boolean
  password?: string
}

export interface UserListParams {
  page?: number
  per_page?: number
  search?: string
  dept_id?: string
  role?: UserRole
  is_active?: boolean
}

export const adminService = {
  getOrganization: () =>
    api.get<ApiResponse<Organization>>('/api/admin/organization'),
  updateOrganization: (body: OrgUpdate) =>
    api.put<ApiResponse<Organization>>('/api/admin/organization', body),

  getDepartments: () =>
    api.get<ApiResponse<Department[]>>('/api/admin/departments'),
  getDepartmentsFlat: () =>
    api.get<ApiResponse<Department[]>>('/api/admin/departments/flat'),
  createDepartment: (body: AdminDeptCreate) =>
    api.post<ApiResponse<Department>>('/api/admin/departments', body),
  updateDepartment: (id: string, body: AdminDeptUpdate) =>
    api.put<ApiResponse<Department>>(`/api/admin/departments/${id}`, body),
  deleteDepartment: (id: string) =>
    api.delete<ApiResponse<null>>(`/api/admin/departments/${id}`),

  getUsers: (params?: UserListParams) =>
    api.get<ApiResponse<User[]>>('/api/admin/users', { params }),
  createUser: (body: AdminUserCreate) =>
    api.post<ApiResponse<User>>('/api/admin/users', body),
  updateUser: (id: string, body: AdminUserUpdate) =>
    api.put<ApiResponse<User>>(`/api/admin/users/${id}`, body),
  toggleActive: (id: string) =>
    api.patch<ApiResponse<User>>(`/api/admin/users/${id}/toggle-active`),
  deleteUser: (id: string) =>
    api.delete<ApiResponse<null>>(`/api/admin/users/${id}`),

  getSsoConfig: () =>
    api.get<ApiResponse<SsoConfig>>('/api/admin/sso-config'),
  updateSsoConfig: (body: SsoConfigUpdate) =>
    api.put<ApiResponse<SsoConfig>>('/api/admin/sso-config', body),

  downloadImportTemplate: () =>
    api.get('/api/admin/users/import/template', { responseType: 'blob' }),
  importUsers: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<ApiResponse<ImportResult>>('/api/admin/users/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export interface SsoConfig {
  sso_enabled: boolean
  sso_provider_url: string | null
  sso_client_id: string | null
  sso_redirect_uri: string | null
  sso_verify_ssl: boolean
}

export interface SsoConfigUpdate {
  sso_enabled?: boolean
  sso_provider_url?: string | null
  sso_client_id?: string | null
  sso_client_secret?: string | null
  sso_redirect_uri?: string | null
  sso_verify_ssl?: boolean
}

export interface ImportErrorRow {
  row: number
  full_name: string
  email: string
  message: string
}

export interface ImportResult {
  total: number
  success: number
  failed: number
  errors: ImportErrorRow[]
}
