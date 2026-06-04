import { useQuery } from '@tanstack/react-query'
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
