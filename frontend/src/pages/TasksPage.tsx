import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Calendar, ChevronRight, GitBranch, AlertTriangle, Clock, RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { taskService } from '@/services/taskService'
import { projectService } from '@/services/projectService'
import { useAuthStore } from '@/stores/authStore'
import { TaskStatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import TaskDetailDrawer from '@/components/project/TaskDetailDrawer'
import { cn } from '@/utils/cn'
import type { Task, TaskStatus, Priority, RecurrenceType, RecurrenceEndType } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Tree helpers (same logic as TasksTab / GanttChart)
// ─────────────────────────────────────────────────────────────────────────────

interface TaskNode {
  task: Task
  children: TaskNode[]
}

function buildTree(tasks: Task[]): TaskNode[] {
  const map = new Map<string, TaskNode>()
  tasks.forEach((t) => map.set(t.id, { task: t, children: [] }))
  const roots: TaskNode[] = []
  tasks.forEach((t) => {
    const node = map.get(t.id)!
    if (t.parent_task_id && map.has(t.parent_task_id)) {
      map.get(t.parent_task_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function nodeMatchesFilter(node: TaskNode, status: string, priority: string): boolean {
  const { task, children } = node
  const selfMatch =
    (!status || task.status === status) &&
    (!priority || task.priority === priority)
  if (selfMatch) return true
  return children.some((c) => nodeMatchesFilter(c, status, priority))
}

function filterTree(nodes: TaskNode[], status: string, priority: string): TaskNode[] {
  if (!status && !priority) return nodes
  return nodes
    .filter((n) => nodeMatchesFilter(n, status, priority))
    .map((n) => ({
      task: n.task,
      children: filterTree(n.children, status, priority),
    }))
}

interface FlatRow {
  task: Task
  depth: number
  hasChildren: boolean
  isLastSibling: boolean
  treeLines: boolean[]
}

function flattenTree(
  nodes: TaskNode[],
  expandedIds: Set<string>,
  depth = 0,
  treeLines: boolean[] = [],
): FlatRow[] {
  const rows: FlatRow[] = []
  nodes.forEach((node, idx) => {
    const { task, children } = node
    const hasChildren = children.length > 0
    const isLastSibling = idx === nodes.length - 1
    rows.push({ task, depth, hasChildren, isLastSibling, treeLines })
    if (hasChildren && expandedIds.has(task.id)) {
      rows.push(
        ...flattenTree(children, expandedIds, depth + 1, [...treeLines, !isLastSibling]),
      )
    }
  })
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus | null> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'IN_REVIEW',
  IN_REVIEW: 'DONE',
  DONE: null,
  CANCELLED: null,
}

const STATUS_NEXT_LABEL: Partial<Record<TaskStatus, string>> = {
  TODO: 'Bắt đầu',
  IN_PROGRESS: 'Chuyển xét',
  IN_REVIEW: 'Hoàn thành',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'TODO', label: 'Cần làm' },
  { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
  { value: 'IN_REVIEW', label: 'Đang xem xét' },
  { value: 'DONE', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'Tất cả ưu tiên' },
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'CRITICAL', label: 'Khẩn cấp' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Tree connector
// ─────────────────────────────────────────────────────────────────────────────

function TreeGuide({
  depth,
  treeLines,
  isLastSibling,
}: {
  depth: number
  treeLines: boolean[]
  isLastSibling: boolean
}) {
  if (depth === 0) return null
  return (
    <div className="flex shrink-0 self-stretch" style={{ width: depth * 18 }}>
      {treeLines.slice(0, -1).map((showLine, i) => (
        <div key={i} className="relative self-stretch shrink-0" style={{ width: 18 }}>
          {showLine && <div className="absolute left-[8px] inset-y-0 w-px bg-slate-200" />}
        </div>
      ))}
      <div className="relative self-stretch shrink-0" style={{ width: 18 }}>
        <div className="absolute left-[8px] top-0 h-1/2 w-px bg-slate-200" />
        {!isLastSibling && (
          <div className="absolute left-[8px] top-1/2 h-1/2 w-px bg-slate-200" />
        )}
        <div className="absolute left-[8px] top-1/2 w-[10px] h-px bg-slate-200" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Task row
// ─────────────────────────────────────────────────────────────────────────────

function TaskRow({
  row,
  projectName,
  expanded,
  onToggle,
  onOpenDetail,
  onStatusChange,
  statusPending,
}: {
  row: FlatRow
  projectName: string
  expanded: boolean
  onToggle: () => void
  onOpenDetail: () => void
  onStatusChange: (status: TaskStatus) => void
  statusPending: boolean
}) {
  const { task, depth, hasChildren, isLastSibling, treeLines } = row
  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date() &&
    task.status !== 'DONE' &&
    task.status !== 'CANCELLED'

  const nextStatus = STATUS_TRANSITIONS[task.status]

  return (
    <tr
      className={cn(
        'group border-b border-slate-100 hover:bg-red-50/30 transition-colors cursor-pointer',
        depth > 0 && 'bg-slate-50/40',
      )}
      onClick={onOpenDetail}
    >
      {/* Title cell */}
      <td className="px-3 py-2.5">
        <div className="flex items-center self-stretch min-h-[36px]">
          <TreeGuide depth={depth} treeLines={treeLines} isLastSibling={isLastSibling} />

          {/* Expand toggle */}
          <button
            className={cn(
              'shrink-0 rounded p-0.5 transition-colors mr-1',
              hasChildren
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                : 'invisible pointer-events-none',
            )}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
            />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            {/* Task code */}
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 group-hover:bg-white">
              {task.task_code}
            </span>

            {/* Title */}
            <span
              className={cn(
                'truncate text-sm',
                depth === 0 ? 'font-medium text-slate-800' : 'text-slate-600',
                task.status === 'DONE' && 'line-through text-slate-400',
                task.status === 'CANCELLED' && 'line-through text-slate-300',
              )}
            >
              {task.title}
            </span>

            {/* Subtask count */}
            {hasChildren && (
              <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 group-hover:bg-white">
                <GitBranch className="h-2.5 w-2.5" />
              </span>
            )}

            {/* Overdue indicator */}
            {isOverdue && (
              <AlertTriangle className="shrink-0 h-3.5 w-3.5 text-red-500" aria-label="Quá hạn" />
            )}

            {task.is_recurring && (
              <RefreshCw className="shrink-0 h-3 w-3 text-violet-500" aria-label="Lặp lại" />
            )}
          </div>
        </div>
      </td>

      {/* Project */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs text-slate-500 truncate max-w-[140px] block">{projectName}</span>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <TaskStatusBadge status={task.status} />
      </td>

      {/* Priority */}
      <td className="px-3 py-2.5">
        <PriorityBadge priority={task.priority} />
      </td>

      {/* Due date */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {task.due_date ? (
          <span className={cn('flex items-center gap-1 text-xs', isOverdue ? 'text-red-600 font-medium' : 'text-slate-500')}>
            <Calendar className="h-3 w-3" />
            {format(new Date(task.due_date), 'dd/MM/yyyy')}
          </span>
        ) : task.start_date ? (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {format(new Date(task.start_date), 'dd/MM/yyyy')}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>

      {/* Quick action */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {nextStatus && STATUS_NEXT_LABEL[task.status] && (
          <button
            onClick={() => onStatusChange(nextStatus)}
            disabled={statusPending}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {STATUS_NEXT_LABEL[task.status]}
          </button>
        )}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create task modal
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { label: 'T2', day: 0 }, { label: 'T3', day: 1 }, { label: 'T4', day: 2 },
  { label: 'T5', day: 3 }, { label: 'T6', day: 4 }, { label: 'T7', day: 5 },
  { label: 'CN', day: 6 },
]

const RECURRENCE_UNIT: Record<RecurrenceType, string> = {
  DAILY: 'ngày', WEEKLY: 'tuần', MONTHLY: 'tháng', YEARLY: 'năm',
}

function estimateRecurrenceCount(
  type: RecurrenceType,
  interval: number,
  days: number[],
  endType: RecurrenceEndType,
  count: number | undefined,
  until: string,
  startDate: string,
): number | null {
  if (endType === 'COUNT') return count ?? null
  if (endType === 'UNTIL' && until && startDate) {
    const start = new Date(startDate)
    const end = new Date(until)
    if (end <= start) return 0
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000)
    if (type === 'DAILY') return Math.floor(diffDays / interval) + 1
    if (type === 'WEEKLY') {
      const weeks = Math.floor(diffDays / (7 * interval))
      const selectedDays = days.length > 0 ? days.length : 1
      return weeks * selectedDays + selectedDays
    }
    if (type === 'MONTHLY') return Math.floor(diffDays / (30 * interval)) + 1
    if (type === 'YEARLY') return Math.floor(diffDays / (365 * interval)) + 1
  }
  return null
}

function CreateTaskModal({
  projects,
  userId,
  onClose,
  onCreated,
}: {
  projects: { id: string; name: string }[]
  userId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    project_id: projects[0]?.id ?? '',
    priority: 'MEDIUM',
    start_date: '',
    due_date: '',
    estimated_hours: '',
  })
  const [error, setError] = useState('')

  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('WEEKLY')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([1])
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>('NEVER')
  const [recurrenceCount, setRecurrenceCount] = useState<number | undefined>(undefined)
  const [recurrenceUntil, setRecurrenceUntil] = useState('')

  function toggleDay(day: number) {
    setRecurrenceDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev
        return prev.filter((d) => d !== day)
      }
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  const estCount = isRecurring
    ? estimateRecurrenceCount(
        recurrenceType, recurrenceInterval, recurrenceDays,
        recurrenceEndType, recurrenceCount, recurrenceUntil, form.start_date,
      )
    : null

  const mutation = useMutation({
    mutationFn: () =>
      taskService.create({
        ...form,
        priority: form.priority as Priority,
        assignee_user_id: userId,
        start_date: form.start_date || undefined,
        due_date: form.due_date || undefined,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : undefined,
        ...(isRecurring && {
          is_recurring: true,
          recurrence_type: recurrenceType,
          recurrence_interval: recurrenceInterval,
          recurrence_days: recurrenceType === 'WEEKLY' ? recurrenceDays : undefined,
          recurrence_end_type: recurrenceEndType,
          recurrence_count: recurrenceEndType === 'COUNT' ? recurrenceCount : undefined,
          recurrence_until: recurrenceEndType === 'UNTIL' && recurrenceUntil ? recurrenceUntil : undefined,
        }),
      } as any),
    onSuccess: onCreated,
    onError: (err: any) =>
      setError(err?.response?.data?.detail ?? 'Tạo công việc thất bại.'),
  })

  const submitDisabled = mutation.isPending || !form.title || !form.project_id || (isRecurring && !form.start_date)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-none">
          <h3 className="text-lg font-semibold text-gray-800">Tạo công việc mới</h3>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tiêu đề *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                placeholder="Nhập tiêu đề công việc"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Dự án *</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Mô tả</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                placeholder="Mô tả chi tiết"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Độ ưu tiên</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                >
                  <option value="LOW">Thấp</option>
                  <option value="MEDIUM">Trung bình</option>
                  <option value="HIGH">Cao</option>
                  <option value="CRITICAL">Khẩn cấp</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Số giờ ước tính</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.estimated_hours}
                  onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                  placeholder="VD: 8"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Ngày bắt đầu {isRecurring && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ngày hết hạn</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* Recurrence toggle */}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded text-violet-600"
              />
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-violet-500" />
                Công việc lặp lại
              </span>
            </label>

            {/* Recurrence panel */}
            {isRecurring && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3">
                {/* Frequency row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-600">Lặp lại mỗi</span>
                  <input
                    type="number"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value)))}
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-violet-500"
                  />
                  <select
                    value={recurrenceType}
                    onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-violet-500"
                  >
                    <option value="DAILY">Ngày</option>
                    <option value="WEEKLY">Tuần</option>
                    <option value="MONTHLY">Tháng</option>
                    <option value="YEARLY">Năm</option>
                  </select>
                </div>

                {/* Weekday picker */}
                {recurrenceType === 'WEEKLY' && (
                  <div>
                    <p className="mb-1.5 text-xs text-gray-500">Các ngày trong tuần</p>
                    <div className="flex gap-1">
                      {WEEKDAYS.map(({ label, day }) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={cn(
                            'h-7 w-7 rounded-full text-xs font-medium transition-colors',
                            recurrenceDays.includes(day)
                              ? 'bg-violet-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-600 hover:border-violet-400',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End condition */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Kết thúc</p>
                  <div className="space-y-1.5">
                    {(['NEVER', 'COUNT', 'UNTIL'] as RecurrenceEndType[]).map((et) => (
                      <label key={et} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="recurrenceEndType"
                          checked={recurrenceEndType === et}
                          onChange={() => setRecurrenceEndType(et)}
                          className="text-violet-600"
                        />
                        {et === 'NEVER' && <span className="text-sm text-gray-700">Không giới hạn</span>}
                        {et === 'COUNT' && (
                          <span className="flex items-center gap-2 text-sm text-gray-700">
                            Sau
                            <input
                              type="number"
                              min={1}
                              value={recurrenceCount ?? ''}
                              onChange={(e) => setRecurrenceCount(Number(e.target.value) || undefined)}
                              onClick={() => setRecurrenceEndType('COUNT')}
                              className="w-16 rounded border border-gray-300 px-2 py-0.5 text-sm outline-none focus:border-violet-500"
                              placeholder="N"
                            />
                            lần
                          </span>
                        )}
                        {et === 'UNTIL' && (
                          <span className="flex items-center gap-2 text-sm text-gray-700">
                            Đến ngày
                            <input
                              type="date"
                              value={recurrenceUntil}
                              onChange={(e) => setRecurrenceUntil(e.target.value)}
                              onClick={() => setRecurrenceEndType('UNTIL')}
                              className="rounded border border-gray-300 px-2 py-0.5 text-sm outline-none focus:border-violet-500"
                            />
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Preview count */}
                <p className="text-xs text-violet-700 font-medium">
                  {estCount !== null
                    ? `Sẽ tạo khoảng ${estCount} công việc`
                    : `Lặp lại mỗi ${recurrenceInterval} ${RECURRENCE_UNIT[recurrenceType]}, không giới hạn`}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex-none flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={submitDisabled}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {mutation.isPending
              ? 'Đang tạo...'
              : isRecurring && estCount !== null
              ? `Tạo ${estCount} công việc`
              : 'Tạo công việc'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [myTasksOnly, setMyTasksOnly] = useState(true)
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: tasksResp, isLoading } = useQuery({
    queryKey: ['tasks-all', myTasksOnly, projectId, user?.id],
    queryFn: () =>
      taskService.list({
        per_page: 500,
        include_subtasks: true,
        project_id: projectId || undefined,
        assignee_user_id: myTasksOnly ? user?.id : undefined,
      }),
  })

  const { data: projectsResp } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectService.list({ per_page: 200 }),
  })

  const allTasks = tasksResp?.data ?? []
  const projects = projectsResp?.data ?? []

  // project_id → name lookup map
  const projectNameMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )
  // task_id → project_id lookup map (for opening drawer with correct projectId)
  const taskProjectMap = useMemo(
    () => new Map(allTasks.map((t) => [t.id, t.project_id])),
    [allTasks],
  )

  // ── Tree ──────────────────────────────────────────────────────────────────

  const tree = useMemo(() => buildTree(allTasks), [allTasks])

  // Auto-expand all parent nodes on first load
  const allParentIds = useMemo(() => {
    const ids = new Set<string>()
    function walk(nodes: TaskNode[]) {
      nodes.forEach((n) => {
        if (n.children.length > 0) { ids.add(n.task.id); walk(n.children) }
      })
    }
    walk(tree)
    return ids
  }, [tree])

  // Sync expandedIds when new parent tasks appear
  const effectiveExpanded = useMemo(() => {
    const merged = new Set(expandedIds)
    allParentIds.forEach((id) => {
      if (!expandedIds.has(`__visited_${id}`)) merged.add(id)
    })
    return merged
  }, [allParentIds, expandedIds])

  const filteredTree = useMemo(
    () => filterTree(tree, status, priority),
    [tree, status, priority],
  )

  const rows = useMemo(
    () => flattenTree(filteredTree, effectiveExpanded),
    [filteredTree, effectiveExpanded],
  )

  // ── Mutations ─────────────────────────────────────────────────────────────

  const statusMutation = useMutation({
    mutationFn: ({ taskId, nextStatus }: { taskId: string; nextStatus: TaskStatus }) =>
      taskService.updateStatus(taskId, nextStatus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-all'] })
      qc.invalidateQueries({ queryKey: ['project-tasks'] })
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // Mark as manually controlled so auto-expand doesn't override
      next.add(`__visited_${id}`)
      return next
    })
  }

  function openTask(taskId: string) {
    setOpenTaskId(taskId)
  }

  function closeTask() {
    setOpenTaskId(null)
  }

  const openTaskProjectId = openTaskId ? (taskProjectMap.get(openTaskId) ?? '') : ''

  // ── Summary counts ────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c = { todo: 0, in_progress: 0, overdue: 0, done: 0 }
    allTasks.forEach((t) => {
      if (t.status === 'TODO') c.todo++
      else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') c.in_progress++
      else if (t.status === 'DONE') c.done++
      if (
        t.due_date &&
        new Date(t.due_date) < new Date() &&
        t.status !== 'DONE' &&
        t.status !== 'CANCELLED'
      ) c.overdue++
    })
    return c
  }, [allTasks])

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {allTasks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Tổng', value: allTasks.filter((t) => t.status !== 'CANCELLED').length, cls: 'bg-slate-100 text-slate-700' },
            { label: 'Cần làm', value: counts.todo, cls: 'bg-slate-100 text-slate-600' },
            { label: 'Đang thực hiện', value: counts.in_progress, cls: 'bg-blue-50 text-blue-700' },
            { label: 'Quá hạn', value: counts.overdue, cls: counts.overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400' },
            { label: 'Hoàn thành', value: counts.done, cls: 'bg-emerald-50 text-emerald-700' },
          ].map(({ label, value, cls }) => (
            <span key={label} className={cn('rounded-full px-3 py-1 text-xs font-medium', cls)}>
              {label}: {value}
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => { setMyTasksOnly(e.target.checked) }}
            className="h-4 w-4 rounded text-red-600"
          />
          Của tôi
        </label>

        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500"
        >
          <option value="">Tất cả dự án</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span className="ml-auto text-xs text-slate-400">
          {rows.length} công việc
        </span>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Tạo công việc
        </button>
      </div>

      {/* Tree table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            {isLoading ? 'Đang tải...' : 'Không có công việc nào phù hợp'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-slate-600 min-w-[280px]">Công việc</th>
                  <th className="px-3 py-3 text-left font-medium text-slate-600 whitespace-nowrap">Dự án</th>
                  <th className="px-3 py-3 text-left font-medium text-slate-600 whitespace-nowrap">Trạng thái</th>
                  <th className="px-3 py-3 text-left font-medium text-slate-600 whitespace-nowrap">Ưu tiên</th>
                  <th className="px-3 py-3 text-left font-medium text-slate-600 whitespace-nowrap">Ngày hết hạn</th>
                  <th className="px-3 py-3 text-left font-medium text-slate-600 whitespace-nowrap">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TaskRow
                    key={row.task.id}
                    row={row}
                    projectName={projectNameMap.get(row.task.project_id) ?? '—'}
                    expanded={effectiveExpanded.has(row.task.id)}
                    onToggle={() => toggleExpand(row.task.id)}
                    onOpenDetail={() => openTask(row.task.id)}
                    onStatusChange={(nextStatus) =>
                      statusMutation.mutate({ taskId: row.task.id, nextStatus })
                    }
                    statusPending={statusMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateTaskModal
          projects={projects}
          userId={user!.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['tasks-all'] })
            qc.invalidateQueries({ queryKey: ['project-tasks'] })
            setShowCreateModal(false)
          }}
        />
      )}

      {/* Task detail drawer */}
      {openTaskId && openTaskProjectId && (
        <TaskDetailDrawer
          taskId={openTaskId}
          projectId={openTaskProjectId}
          onClose={closeTask}
          onTaskClick={openTask}
        />
      )}
    </div>
  )
}
