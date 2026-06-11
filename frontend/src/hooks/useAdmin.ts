import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  adminService,
  type AdminDeptCreate,
  type AdminDeptUpdate,
  type AdminUserCreate,
  type AdminUserUpdate,
  type OrgUpdate,
  type UserListParams,
  type ImportResult,
} from '@/services/adminService'

export function useAdminOrg() {
  return useQuery({
    queryKey: ['admin', 'organization'],
    queryFn: () => adminService.getOrganization().then((r) => r.data.data!),
  })
}

export function useUpdateOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: OrgUpdate) =>
      adminService.updateOrganization(body).then((r) => r.data.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'organization'] })
      toast.success('Đã cập nhật thông tin tổ chức')
    },
    onError: () => toast.error('Không thể cập nhật'),
  })
}

export function useAdminDepts() {
  return useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => adminService.getDepartments().then((r) => r.data.data ?? []),
  })
}

export function useAdminDeptsFlat() {
  return useQuery({
    queryKey: ['admin', 'departments-flat'],
    queryFn: () => adminService.getDepartmentsFlat().then((r) => r.data.data ?? []),
  })
}

export function useCreateDept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminDeptCreate) =>
      adminService.createDepartment(body).then((r) => r.data.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'departments'] })
      toast.success('Đã tạo đơn vị')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Không thể tạo đơn vị'),
  })
}

export function useUpdateDept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminDeptUpdate }) =>
      adminService.updateDepartment(id, body).then((r) => r.data.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'departments'] })
      toast.success('Đã cập nhật đơn vị')
    },
    onError: () => toast.error('Không thể cập nhật'),
  })
}

export function useDeleteDept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminService.deleteDepartment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'departments'] })
      toast.success('Đã xóa đơn vị')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể xóa'),
  })
}

export function useAdminUsers(params?: UserListParams) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminService.getUsers(params).then((r) => r.data),
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminUserCreate) =>
      adminService.createUser(body).then((r) => r.data.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Đã tạo nhân viên')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể tạo nhân viên'),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminUserUpdate }) =>
      adminService.updateUser(id, body).then((r) => r.data.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Đã cập nhật nhân viên')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể cập nhật'),
  })
}

export function useToggleUserActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminService.toggleActive(id).then((r) => r.data.data!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: () => toast.error('Không thể cập nhật trạng thái'),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Đã xóa nhân viên')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể xóa'),
  })
}

export function useImportUsers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) =>
      adminService.importUsers(file).then((r) => r.data.data as ImportResult),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      if (result.failed === 0) {
        toast.success(`Đã nhập ${result.success} người dùng thành công`)
      } else {
        toast.success(`Nhập ${result.success} thành công, ${result.failed} lỗi`)
      }
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể nhập danh sách'),
  })
}
