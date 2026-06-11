import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { taskService } from '@/services/taskService'
import { timesheetService } from '@/services/timesheetService'
import type { ApiResponse, Task, TaskStatus } from '@/types'

export function useTaskMutation(projectId: string) {
  const qc = useQueryClient()

  const invalidate = () => {
    // refetchType:'all' ensures inactive (tab-hidden) queries are also marked stale
    // so they refetch immediately when their tab becomes visible again
    qc.invalidateQueries({ queryKey: ['project-tasks'], refetchType: 'all' })
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
    onSuccess: (task) => {
      invalidate()
      if (task.parent_task_id) {
        qc.invalidateQueries({ queryKey: ['task', task.parent_task_id] })
      }
      toast.success('Đã tạo công việc con')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Không thể tạo công việc con'),
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

  const createTask = useMutation({
    mutationFn: (data: Partial<Task>) => taskService.create(data),
    onSuccess: () => {
      invalidate()
      toast.success('Đã tạo công việc')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Không thể tạo công việc'),
  })

  return { updateStatus, updateTask, createSubtask, addComment, logTime, createTask }
}
