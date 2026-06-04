import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'
import { useCallback, useEffect, useRef, useState } from 'react'
import { timesheetService } from '@/services/timesheetService'
import { taskService } from '@/services/taskService'
import { projectService } from '@/services/projectService'
import { useAuthStore } from '@/stores/authStore'
import type { Task, Project, TimesheetEntry, TimesheetStatus } from '@/types'

// ── Exported types ────────────────────────────────────────────────────────────

export interface GridCell {
  entryId?: string
  hours: number
  status: TimesheetStatus
  rejectReason?: string
}

export interface GridRow {
  taskId: string
  taskTitle: string
  projectId: string
  projectName: string
  cells: Record<string, GridCell> // key = 'yyyy-MM-dd'
  hasRejected: boolean
}

export type SaveIndicator = 'idle' | 'saving' | 'saved' | 'error'

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimesheetWeek(weekStart: Date) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // ── Remote queries ──────────────────────────────────────────────────────────

  const timesheetsQuery = useQuery({
    queryKey: ['timesheets-week', weekStartStr],
    queryFn: () => timesheetService.list({ week_start: weekStartStr, per_page: 500 }),
    enabled: !!user,
    staleTime: 30_000,
  })

  const tasksQuery = useQuery({
    queryKey: ['my-tasks', user?.id],
    queryFn: () => taskService.list({ assignee_user_id: user!.id, per_page: 500 }),
    enabled: !!user,
    staleTime: 60_000,
  })

  const projectsQuery = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => projectService.list({ per_page: 100 }),
    staleTime: 5 * 60_000,
  })

  const entries: TimesheetEntry[] = timesheetsQuery.data?.data ?? []
  const tasks: Task[] = tasksQuery.data?.data ?? []
  const projects: Project[] = projectsQuery.data?.data ?? []

  // ── Local state ─────────────────────────────────────────────────────────────

  const [localEdits, setLocalEdits] = useState<Map<string, number>>(() => new Map())
  const [extraTaskIds, setExtraTaskIds] = useState<string[]>([])
  const [indicator, setIndicator] = useState<SaveIndicator>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Refs ────────────────────────────────────────────────────────────────────

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingRef = useRef(0)
  const entriesRef = useRef<TimesheetEntry[]>(entries)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep entriesRef in sync with the latest query data
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  // ── Reset on week change ────────────────────────────────────────────────────

  useEffect(() => {
    // Clear all pending save timers from the previous week
    saveTimers.current.forEach((t) => clearTimeout(t))
    saveTimers.current.clear()
    if (savedTimer.current) {
      clearTimeout(savedTimer.current)
      savedTimer.current = null
    }
    setLocalEdits(new Map())
    setExtraTaskIds([])
    setIndicator('idle')
    setPendingCount(0)
    pendingRef.current = 0
    setIsSubmitting(false)
  }, [weekStartStr]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      saveTimers.current.forEach((t) => clearTimeout(t))
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  // ── Derived maps ────────────────────────────────────────────────────────────

  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]))
  const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]))

  // ── Build rows ───────────────────────────────────────────────────────────────

  const entryTaskIds = entries.map((e) => e.task_id)
  const uniqueTaskIds = Array.from(new Set([...entryTaskIds, ...extraTaskIds]))

  const rows: GridRow[] = uniqueTaskIds
    .map((taskId): GridRow | null => {
      const task = taskMap.get(taskId)
      if (!task) return null

      const project = projectMap.get(task.project_id)

      const cells: Record<string, GridCell> = {}
      let hasRejected = false

      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd')
        const cellKey = `${taskId}|${dateStr}`
        const entry = entriesRef.current.find(
          (e) => e.task_id === taskId && e.work_date === dateStr,
        )

        const localHours = localEdits.get(cellKey)
        const hours = localHours !== undefined ? localHours : (entry?.hours_logged ?? 0)
        const status: TimesheetStatus = entry?.status ?? 'DRAFT'
        const rejectReason = entry?.reject_reason ?? undefined

        if (status === 'REJECTED') hasRejected = true

        cells[dateStr] = { entryId: entry?.id, hours, status, rejectReason }
      }

      return {
        taskId,
        taskTitle: task.title,
        projectId: task.project_id,
        projectName: project?.name ?? task.project_id,
        cells,
        hasRejected,
      }
    })
    .filter((r): r is GridRow => r !== null)

  // ── Computed totals ─────────────────────────────────────────────────────────

  const dailyTotals: Record<string, number> = {}
  for (const day of weekDays) {
    const dateStr = format(day, 'yyyy-MM-dd')
    dailyTotals[dateStr] = rows.reduce((sum, row) => sum + (row.cells[dateStr]?.hours ?? 0), 0)
  }

  const weeklyTotal = Object.values(dailyTotals).reduce((sum, h) => sum + h, 0)

  const weekStatus: TimesheetStatus = (() => {
    if (entries.length === 0) return 'DRAFT'
    if (entries.some((e) => e.status === 'REJECTED')) return 'REJECTED'
    if (entries.every((e) => e.status === 'APPROVED')) return 'APPROVED'
    if (entries.some((e) => e.status === 'SUBMITTED')) return 'SUBMITTED'
    return 'DRAFT'
  })()

  // ── updateCell ──────────────────────────────────────────────────────────────

  const updateCell = useCallback(
    (taskId: string, date: string, hours: number) => {
      const cellKey = `${taskId}|${date}`
      const existingEntry = entriesRef.current.find(
        (e) => e.task_id === taskId && e.work_date === date,
      )

      if (hours === 0 && !existingEntry) {
        setLocalEdits((prev) => {
          const next = new Map(prev)
          next.delete(cellKey)
          return next
        })
        return
      }

      setLocalEdits((prev) => {
        const next = new Map(prev)
        next.set(cellKey, hours)
        return next
      })

      const alreadyTracked = saveTimers.current.has(cellKey)
      if (!alreadyTracked) {
        pendingRef.current += 1
        setPendingCount(pendingRef.current)
        setIndicator('saving')
      }

      // Cancel existing debounce timer for this cell
      const existing = saveTimers.current.get(cellKey)
      if (existing) clearTimeout(existing)

      const timer = setTimeout(async () => {
        saveTimers.current.delete(cellKey)

        // Read the freshest entry at fire time
        const latestEntry = entriesRef.current.find(
          (e) => e.task_id === taskId && e.work_date === date,
        )

        try {
          if (hours === 0 && latestEntry) {
            await timesheetService.delete(latestEntry.id)
          } else if (latestEntry) {
            await timesheetService.update(latestEntry.id, { hours_logged: hours })
          } else if (hours > 0) {
            await timesheetService.create({ task_id: taskId, work_date: date, hours_logged: hours })
          }

          setLocalEdits((prev) => {
            const next = new Map(prev)
            next.delete(cellKey)
            return next
          })

          await queryClient.invalidateQueries({ queryKey: ['timesheets-week', weekStartStr] })

          pendingRef.current -= 1
          setPendingCount(pendingRef.current)

          if (pendingRef.current === 0) {
            setIndicator('saved')
            if (savedTimer.current) clearTimeout(savedTimer.current)
            savedTimer.current = setTimeout(() => setIndicator('idle'), 2000)
          }
        } catch {
          pendingRef.current -= 1
          setPendingCount(pendingRef.current)
          if (pendingRef.current === 0) {
            setIndicator('error')
          }
        }
      }, 500)

      saveTimers.current.set(cellKey, timer)
    },
    [queryClient, weekStartStr],
  )

  // ── addRow ──────────────────────────────────────────────────────────────────

  const addRow = useCallback((taskId: string) => {
    setExtraTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))
  }, [])

  // ── submitWeek ──────────────────────────────────────────────────────────────

  const submitWeek = useCallback(
    async (entryIds?: string[]) => {
      const ids =
        entryIds ??
        entriesRef.current
          .filter((e) => e.status === 'DRAFT' || e.status === 'REJECTED')
          .map((e) => e.id)

      if (ids.length === 0) return

      setIsSubmitting(true)
      try {
        await timesheetService.submit(ids)
        await queryClient.invalidateQueries({ queryKey: ['timesheets-week', weekStartStr] })
      } finally {
        setIsSubmitting(false)
      }
    },
    [queryClient, weekStartStr],
  )

  // ── Return ──────────────────────────────────────────────────────────────────

  return {
    isLoading:
      timesheetsQuery.isLoading || tasksQuery.isLoading || projectsQuery.isLoading,
    rows,
    weekDays,
    weekStatus,
    dailyTotals,
    weeklyTotal,
    indicator,
    hasPendingSaves: pendingCount > 0,
    tasks,
    projects,
    entries,
    updateCell,
    addRow,
    submitWeek,
    isSubmitting,
  }
}
