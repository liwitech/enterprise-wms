import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { timesheetService } from '@/services/timesheetService'
import { taskService } from '@/services/taskService'
import { useAuthStore } from '@/stores/authStore'
import type { TimesheetEntryExtended, Task } from '@/types'

export interface NotificationItem {
  id: string
  type: 'timesheet_submitted' | 'task_overdue'
  message: string
  timestamp: string
  read: boolean
}

const STORAGE_KEY = 'ewms-dismissed-notifs'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return new Set<string>(JSON.parse(raw) as string[])
    }
  } catch {
    // ignore parse errors
  }
  return new Set<string>()
}

function saveDismissed(ids: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)))
}

export function useNotifications() {
  const { user } = useAuthStore()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissed)

  const isManager = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')

  const { data: pendingTs } = useQuery({
    queryKey: ['notif-pending-ts'],
    queryFn: () => timesheetService.getPending({ per_page: 10 }),
    enabled: isManager,
    refetchInterval: 30_000,
  })

  const { data: overdueTasks } = useQuery({
    queryKey: ['notif-overdue-tasks', user?.id],
    queryFn: () => taskService.list({ assignee_user_id: user!.id, is_overdue: true, per_page: 10 }),
    enabled: !!user?.id,
    refetchInterval: 30_000,
  })

  const tsItems: NotificationItem[] = (pendingTs?.data ?? []).map(
    (e: TimesheetEntryExtended): NotificationItem => ({
      id: `ts-${e.id}`,
      type: 'timesheet_submitted',
      message: `${e.user?.full_name ?? 'Nhân viên'} đã nộp timesheet`,
      timestamp: e.submitted_at ?? e.created_at,
      read: dismissedIds.has(`ts-${e.id}`),
    }),
  )

  const taskItems: NotificationItem[] = (overdueTasks?.data ?? []).map(
    (t: Task): NotificationItem => ({
      id: `task-${t.id}`,
      type: 'task_overdue',
      message: `Task "${t.title}" đã quá hạn`,
      timestamp: t.due_date ?? t.updated_at,
      read: dismissedIds.has(`task-${t.id}`),
    }),
  )

  const notifications: NotificationItem[] = [...tsItems, ...taskItems]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 10)

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = useCallback(() => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      notifications.forEach((n) => next.add(n.id))
      saveDismissed(next)
      return next
    })
  }, [notifications])

  return { notifications, unreadCount, markAllRead }
}
