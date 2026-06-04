import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskService } from '@/services/taskService'
import { timesheetService } from '@/services/timesheetService'
import type { ApiResponse, Task, TaskStatus } from '@/types'

export function useTaskMutation(projectId: string) {
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-tasks'] })
    qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] })
  }

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      taskService.updateStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await qc.cancelQueries({ queryKey: ['project-tasks'] })
      const snapshots = qc.getQueriesData<ApiResponse<Task[]>>({ queryKey: ['project-tasks'] })
      snapshots.forEach(([key]) => {
        qc.setQueryData<ApiResponse<Task[]>>(key, old => {
          if (!old?.data) return old
          return { ...old, data: old.data.map(t => t.id === taskId ? { ...t, status } : t) }
        })
      })
      return { snapshots }
    },
    onError: (_, __, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: invalidate,
  })

  const updateTask = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<Task> }) =>
      taskService.update(taskId, data),
    onSettled: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['task'] })
    },
  })

  const createSubtask = useMutation({
    mutationFn: (data: Partial<Task>) => taskService.create(data),
    onSettled: invalidate,
  })

  const addComment = useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      taskService.addComment(taskId, content),
    onSuccess: (_, { taskId }) => {
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] })
    },
  })

  const logTime = useMutation({
    mutationFn: (data: { task_id: string; work_date: string; hours_logged: number; description?: string }) =>
      timesheetService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] })
      invalidate()
    },
  })

  return { updateStatus, updateTask, createSubtask, addComment, logTime }
}
