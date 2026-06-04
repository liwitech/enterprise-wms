import { useQuery } from '@tanstack/react-query'
import { taskService, type TaskListParams } from '@/services/taskService'

export function useTasks(params: TaskListParams & { enabled?: boolean }) {
  const { enabled = true, ...rest } = params
  return useQuery({
    queryKey: ['project-tasks', rest],
    queryFn: () => taskService.list(rest),
    enabled: !!rest.project_id && enabled,
    staleTime: 30_000,
  })
}

export function useTaskComments(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => taskService.listComments(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  })
}
