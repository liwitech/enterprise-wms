import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { projectService } from '@/services/projectService'

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectService.get(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

export function useProjectDashboard(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['project-dashboard', projectId],
    queryFn: () => projectService.getDashboard(projectId!),
    enabled: !!projectId && enabled,
    staleTime: 60_000,
  })
}

export function useProjectSprints(projectId: string | undefined) {
  return useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => projectService.listSprints(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  })
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      projectService.addMember(projectId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Đã thêm thành viên')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể thêm thành viên'),
  })
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => projectService.removeMember(projectId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Đã xóa thành viên')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể xóa thành viên'),
  })
}
