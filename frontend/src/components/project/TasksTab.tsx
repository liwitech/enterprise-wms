import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  Search, LayoutList, LayoutGrid, AlertCircle, Clock, Calendar, Flag, Plus, X, Loader2,
  ChevronRight, GitBranch, Download, Upload, RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'
import { useTasks } from '@/hooks/useTasks'
import { useTaskMutation } from '@/hooks/useTaskMutation'
import { useDebounce } from '@/hooks/useDebounce'
import KanbanBoard from './KanbanBoard'
import ImportTasksModal from './ImportTasksModal'
import type { Task, TaskStatus, Priority, Sprint, RecurrenceType, RecurrenceEndType } from '@/types'

// ── Create Task Modal ─────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp',
}

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
  count: string,
  until: string,
  startDate: string,
): number {
  const MAX: Record<RecurrenceType, number> = { DAILY: 90, WEEKLY: 104, MONTHLY: 36, YEARLY: 10 }
  const cap = MAX[type]
  if (endType === 'COUNT') return Math.min(parseInt(count) || 0, cap)
  if (endType === 'UNTIL' && until && startDate) {
    const diff = (new Date(until).getTime() - new Date(startDate).getTime()) / 86400000
    if (diff <= 0) return 1
    if (type === 'DAILY') return Math.min(Math.floor(diff / interval) + 1, cap)
    if (type === 'WEEKLY') return Math.min(Math.ceil(diff / (7 * interval)) * Math.max(days.length, 1), cap)
    if (type === 'MONTHLY') return Math.min(Math.floor(diff / (30 * interval)) + 1, cap)
    if (type === 'YEARLY') return Math.min(Math.floor(diff / (365 * interval)) + 1, cap)
  }
  // NEVER — use sensible defaults for preview
  if (type === 'DAILY') return 30
  if (type === 'WEEKLY') return Math.min(12 * Math.max(days.length, 1), 52)
  if (type === 'MONTHLY') return 12
  if (type === 'YEARLY') return 3
  return 1
}

function CreateTaskModal({
  projectId,
  sprints,
  members,
  parentTaskId,
  existingTasks,
  onClose,
}: {
  projectId: string
  sprints: Sprint[]
  members: { user_id: string; user?: { full_name: string } }[]
  parentTaskId?: string
  existingTasks?: { id: string; task_code: string; title: string }[]
  onClose: () => void
}) {
  const { createTask } = useTaskMutation(projectId)
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'TODO' as TaskStatus,
    priority: 'MEDIUM' as Priority,
    start_date: '',
    due_date: '',
    assignee_user_id: '',
    sprint_id: '',
    estimated_hours: '',
    parent_task_id: parentTaskId ?? '',
  })

  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('WEEKLY')
  const [recurrenceInterval, setRecurrenceInterval] = useState('1')
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([1]) // default: Tuesday
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>('NEVER')
  const [recurrenceCount, setRecurrenceCount] = useState('4')
  const [recurrenceUntil, setRecurrenceUntil] = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function toggleDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day)
        ? prev.length > 1 ? prev.filter((d) => d !== day) : prev // keep at least 1
        : [...prev, day],
    )
  }

  const estimatedCount = isRecurring
    ? estimateRecurrenceCount(
        recurrenceType,
        parseInt(recurrenceInterval) || 1,
        recurrenceDays,
        recurrenceEndType,
        recurrenceCount,
        recurrenceUntil,
        form.start_date,
      )
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await createTask.mutateAsync({
      project_id: projectId,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      priority: form.priority,
      start_date: form.start_date || undefined,
      due_date: form.due_date || undefined,
      assignee_user_id: form.assignee_user_id || undefined,
      sprint_id: form.sprint_id || undefined,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : undefined,
      parent_task_id: form.parent_task_id || undefined,
      // Recurrence
      is_recurring: isRecurring,
      recurrence_type: isRecurring ? recurrenceType : undefined,
      recurrence_interval: isRecurring ? (parseInt(recurrenceInterval) || 1) : undefined,
      recurrence_days: isRecurring && recurrenceType === 'WEEKLY' ? recurrenceDays : undefined,
      recurrence_end_type: isRecurring ? recurrenceEndType : undefined,
      recurrence_count: isRecurring && recurrenceEndType === 'COUNT' ? (parseInt(recurrenceCount) || undefined) : undefined,
      recurrence_until: isRecurring && recurrenceEndType === 'UNTIL' ? (recurrenceUntil || undefined) : undefined,
    } as any)
    onClose()
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">
            {parentTaskId ? 'Thêm công việc con' : 'Thêm công việc mới'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="max-h-[80vh] overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Tên công việc <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Nhập tên công việc..."
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mô tả</label>
              <textarea
                className={cn(inputCls, 'resize-none')}
                rows={2}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Mô tả chi tiết công việc..."
              />
            </div>

            {/* Status + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Trạng thái</label>
                <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>{s === 'TODO' ? 'Cần làm' : s === 'IN_PROGRESS' ? 'Đang làm' : s === 'IN_REVIEW' ? 'Xem xét' : 'Hoàn thành'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Độ ưu tiên</label>
                <select className={inputCls} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Parent task */}
            {!parentTaskId && existingTasks && existingTasks.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Công việc cha (tuỳ chọn)</label>
                <select className={inputCls} value={form.parent_task_id} onChange={(e) => set('parent_task_id', e.target.value)}>
                  <option value="">— Không có —</option>
                  {existingTasks.map((t) => (
                    <option key={t.id} value={t.id}>[{t.task_code}] {t.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Ngày bắt đầu {isRecurring && <span className="text-red-500">*</span>}
                </label>
                <input type="date" className={inputCls} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required={isRecurring} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Hạn chót</label>
                <input type="date" className={inputCls} value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
              </div>
            </div>

            {/* Assignee + Sprint */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Người thực hiện</label>
                <select className={inputCls} value={form.assignee_user_id} onChange={(e) => set('assignee_user_id', e.target.value)}>
                  <option value="">— Chưa phân công —</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.user?.full_name ?? m.user_id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Sprint</label>
                <select className={inputCls} value={form.sprint_id} onChange={(e) => set('sprint_id', e.target.value)}>
                  <option value="">— Không có —</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Estimated hours */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Giờ dự kiến</label>
              <input
                type="number" min="0" step="0.5"
                className={inputCls}
                value={form.estimated_hours}
                onChange={(e) => set('estimated_hours', e.target.value)}
                placeholder="VD: 8"
              />
            </div>

            {/* ── Recurrence toggle ─────────────────────────────────────────── */}
            {!parentTaskId && (
              <div className="pt-1">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-400"
                  />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                    Công việc lặp lại
                  </span>
                </label>

                {/* ── Recurrence config panel ─────────────────────────────── */}
                {isRecurring && (
                  <div className="mt-3 space-y-4 rounded-xl border border-red-100 bg-red-50/40 p-4">
                    {/* Frequency row */}
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-600">Tần suất lặp lại</label>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-sm text-slate-500">Mỗi</span>
                        <input
                          type="number" min="1" max="99"
                          value={recurrenceInterval}
                          onChange={(e) => setRecurrenceInterval(e.target.value)}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-red-400 focus:outline-none"
                        />
                        <select
                          value={recurrenceType}
                          onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none"
                        >
                          <option value="DAILY">ngày</option>
                          <option value="WEEKLY">tuần</option>
                          <option value="MONTHLY">tháng</option>
                          <option value="YEARLY">năm</option>
                        </select>
                        <span className="text-sm text-slate-400">/ lần</span>
                      </div>
                    </div>

                    {/* Days of week (weekly only) */}
                    {recurrenceType === 'WEEKLY' && (
                      <div>
                        <label className="mb-2 block text-xs font-medium text-slate-600">Ngày trong tuần</label>
                        <div className="flex gap-1.5">
                          {WEEKDAYS.map(({ label, day }) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleDay(day)}
                              className={cn(
                                'h-8 w-9 rounded-lg text-xs font-medium transition',
                                recurrenceDays.includes(day)
                                  ? 'bg-red-600 text-white shadow-sm'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* End condition */}
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-600">Kết thúc lặp lại</label>
                      <div className="space-y-2">
                        {[
                          { value: 'NEVER' as RecurrenceEndType, label: 'Không giới hạn' },
                          { value: 'COUNT' as RecurrenceEndType, label: 'Sau số lần' },
                          { value: 'UNTIL' as RecurrenceEndType, label: 'Đến ngày' },
                        ].map(({ value, label }) => (
                          <label key={value} className="flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="recurrenceEndType"
                              value={value}
                              checked={recurrenceEndType === value}
                              onChange={() => setRecurrenceEndType(value)}
                              className="text-red-600 focus:ring-red-400"
                            />
                            <span className="text-sm text-slate-600">{label}</span>
                            {value === 'COUNT' && recurrenceEndType === 'COUNT' && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number" min="1" max="100"
                                  value={recurrenceCount}
                                  onChange={(e) => setRecurrenceCount(e.target.value)}
                                  className="w-16 rounded border border-slate-200 px-2 py-0.5 text-sm focus:border-red-400 focus:outline-none"
                                />
                                <span className="text-xs text-slate-400">lần</span>
                              </div>
                            )}
                            {value === 'UNTIL' && recurrenceEndType === 'UNTIL' && (
                              <input
                                type="date"
                                value={recurrenceUntil}
                                onChange={(e) => setRecurrenceUntil(e.target.value)}
                                min={form.start_date || undefined}
                                className="rounded border border-slate-200 px-2 py-0.5 text-sm focus:border-red-400 focus:outline-none"
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs text-slate-500 border border-slate-100">
                      <RefreshCw className="h-3 w-3 text-red-400 shrink-0" />
                      Sẽ tạo khoảng <span className="font-semibold text-red-600 mx-0.5">{estimatedCount}</span>
                      công việc, lặp mỗi {recurrenceInterval} {RECURRENCE_UNIT[recurrenceType]}
                      {recurrenceType === 'WEEKLY' && recurrenceDays.length > 0
                        ? `, vào ${recurrenceDays.map((d) => WEEKDAYS[d].label).join(', ')}`
                        : ''}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition">
              Hủy
            </button>
            <button
              type="submit"
              disabled={createTask.isPending || (isRecurring && !form.start_date)}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
            >
              {createTask.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isRecurring ? `Tạo ${estimatedCount} công việc` : 'Tạo công việc'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

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

function taskMatchesFilter(
  t: Task,
  search: string,
  statusFilter: string,
  priorityFilter: string,
  sprintFilter: string,
  overdueOnly: boolean,
): boolean {
  if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.task_code.toLowerCase().includes(search.toLowerCase())) return false
  if (statusFilter && t.status !== statusFilter) return false
  if (priorityFilter && t.priority !== priorityFilter) return false
  if (sprintFilter && t.sprint_id !== sprintFilter) return false
  if (overdueOnly && !(t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE' && t.status !== 'CANCELLED')) return false
  return true
}

function filterTree(
  nodes: TaskNode[],
  matchFn: (t: Task) => boolean,
): TaskNode[] {
  return nodes.reduce<TaskNode[]>((acc, node) => {
    const filteredChildren = filterTree(node.children, matchFn)
    if (matchFn(node.task) || filteredChildren.length > 0) {
      acc.push({ task: node.task, children: filteredChildren })
    }
    return acc
  }, [])
}

function countAll(nodes: TaskNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countAll(n.children), 0)
}

// Recursively collect all start/due dates from descendants
function collectChildDates(children: TaskNode[]): { starts: string[]; dues: string[] } {
  const starts: string[] = []
  const dues: string[] = []
  children.forEach((n) => {
    if (n.task.start_date) starts.push(n.task.start_date)
    if (n.task.due_date) dues.push(n.task.due_date)
    const nested = collectChildDates(n.children)
    starts.push(...nested.starts)
    dues.push(...nested.dues)
  })
  return { starts, dues }
}

interface EffectiveDates {
  startDate: string | undefined
  dueDate: string | undefined
  startDerived: boolean
  dueDerived: boolean
}

function getEffectiveDates(task: Task, children: TaskNode[]): EffectiveDates {
  if (children.length === 0) {
    return { startDate: task.start_date, dueDate: task.due_date, startDerived: false, dueDerived: false }
  }
  const { starts, dues } = collectChildDates(children)
  const derivedStart = !task.start_date && starts.length > 0 ? [...starts].sort()[0] : undefined
  const derivedDue = !task.due_date && dues.length > 0 ? [...dues].sort().reverse()[0] : undefined
  return {
    startDate: task.start_date ?? derivedStart,
    dueDate: task.due_date ?? derivedDue,
    startDerived: !task.start_date && !!derivedStart,
    dueDerived: !task.due_date && !!derivedDue,
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportTasksToExcel(tasks: Task[]) {
  // Flatten tree: parents before children
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const roots = tasks.filter((t) => !t.parent_task_id)

  const ordered: Task[] = []
  function addWithChildren(t: Task) {
    ordered.push(t)
    tasks.filter((c) => c.parent_task_id === t.id).forEach(addWithChildren)
  }
  roots.forEach(addWithChildren)

  const headers = [
    'Mã công việc', 'Tên công việc', 'Mô tả', 'Trạng thái', 'Độ ưu tiên',
    'Ngày bắt đầu', 'Hạn chót', 'Giờ ước tính', 'Giờ thực tế', 'Mã công việc cha',
  ]

  const rows = ordered.map((t) => [
    t.task_code,
    t.title,
    t.description ?? '',
    t.status,
    t.priority,
    t.start_date ?? '',
    t.due_date ?? '',
    t.estimated_hours ?? '',
    t.actual_hours ?? '',
    t.parent_task_id ? (taskMap.get(t.parent_task_id)?.task_code ?? '') : '',
  ])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [
    { wch: 14 }, { wch: 35 }, { wch: 30 }, { wch: 15 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks')
  XLSX.writeFile(wb, `tasks_export_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
}

// ── Status / Priority display ─────────────────────────────────────────────────

const STATUS_OPTIONS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']
const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  IN_REVIEW: 'Xem xét',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}
const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-600',
}
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-slate-400',
}

// ── Tree Row ──────────────────────────────────────────────────────────────────

function TaskTreeRow({
  node,
  depth,
  expanded,
  onToggleExpand,
  onTaskClick,
  expandedIds,
  onToggleId,
}: {
  node: TaskNode
  depth: number
  expanded: boolean
  onToggleExpand: () => void
  onTaskClick: (id: string) => void
  expandedIds: Set<string>
  onToggleId: (id: string) => void
}) {
  const { task, children } = node
  const hasChildren = children.length > 0
  const { startDate, dueDate, startDerived, dueDerived } = getEffectiveDates(task, children)
  const isOverdue =
    dueDate &&
    new Date(dueDate) < new Date() &&
    task.status !== 'DONE' &&
    task.status !== 'CANCELLED'

  const doneCount = children.filter((c) => c.task.status === 'DONE').length

  return (
    <>
      <tr
        className={cn(
          'group cursor-pointer transition-colors',
          depth === 0 ? 'hover:bg-slate-50' : 'hover:bg-indigo-50/40',
          depth > 0 && 'bg-slate-50/30',
        )}
        onClick={() => onTaskClick(task.id)}
      >
        {/* Title cell with indentation */}
        <td className="py-2.5 pr-3" style={{ paddingLeft: depth * 24 + 12 }}>
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Expand toggle */}
            <button
              className={cn(
                'shrink-0 rounded p-0.5 transition-colors',
                hasChildren
                  ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  : 'invisible',
              )}
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
            >
              <ChevronRight
                className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
              />
            </button>

            {/* Connector line for children */}
            {depth > 0 && (
              <span className="shrink-0 text-slate-300 text-xs leading-none">└</span>
            )}

            {/* Task code */}
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-400">
              {task.task_code}
            </span>

            {/* Title */}
            <span className={cn('truncate text-sm', depth === 0 ? 'font-medium text-slate-800' : 'text-slate-700')}>
              {task.title}
            </span>

            {/* Overdue indicator */}
            {isOverdue && (
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
            )}

            {/* Recurring indicator */}
            {task.is_recurring && (
              <RefreshCw className="h-3 w-3 shrink-0 text-slate-300" aria-label="Công việc lặp lại" />
            )}

            {/* Subtask progress badge */}
            {hasChildren && (
              <span className={cn(
                'ml-1 shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                doneCount === children.length
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500',
              )}>
                <GitBranch className="h-2.5 w-2.5" />
                {doneCount}/{children.length}
              </span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLOR[task.status])}>
            {STATUS_LABEL[task.status]}
          </span>
        </td>

        {/* Priority */}
        <td className="px-3 py-2.5">
          {task.priority && (
            <span className={cn('flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[task.priority])}>
              <Flag className="h-3 w-3" />
              {task.priority}
            </span>
          )}
        </td>

        {/* Thời gian: start → due */}
        <td className="px-3 py-2.5">
          {startDate || dueDate ? (
            <div className="flex flex-col gap-0.5">
              {startDate && (
                <span className={cn(
                  'flex items-center gap-1 text-xs',
                  startDerived ? 'italic text-slate-300' : 'text-slate-400',
                )}>
                  <Calendar className="h-3 w-3 shrink-0" />
                  {format(new Date(startDate), 'dd/MM/yyyy')}
                  {startDerived && <span className="text-[10px]" title="Tự động từ công việc con">*</span>}
                </span>
              )}
              {dueDate && (
                <span className={cn(
                  'flex items-center gap-1 text-xs',
                  dueDerived
                    ? 'italic text-slate-300'
                    : isOverdue ? 'text-red-500' : 'text-slate-400',
                )}>
                  <Clock className="h-3 w-3 shrink-0" />
                  {format(new Date(dueDate), 'dd/MM/yyyy')}
                  {dueDerived && <span className="text-[10px]" title="Tự động từ công việc con">*</span>}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
        </td>
      </tr>

      {/* Children — recursive */}
      {expanded &&
        children.map((child) => (
          <TaskTreeRow
            key={child.task.id}
            node={child}
            depth={depth + 1}
            expanded={expandedIds.has(child.task.id)}
            onToggleExpand={() => onToggleId(child.task.id)}
            onTaskClick={onTaskClick}
            expandedIds={expandedIds}
            onToggleId={onToggleId}
          />
        ))}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  sprints: Sprint[]
  members?: { user_id: string; user?: { full_name: string } }[]
  canManage?: boolean
  onTaskClick: (taskId: string) => void
}

export default function TasksTab({ projectId, sprints, members = [], canManage = false, onTaskClick }: Props) {
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')
  const [sprintFilter, setSprintFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const debouncedSearch = useDebounce(search, 300)

  // List view: fetch all tasks including subtasks to build tree
  const { data: allData, isLoading: allLoading } = useTasks({
    project_id: projectId,
    per_page: 500,
    include_subtasks: true,
    enabled: view === 'list',
  })

  // Kanban view: top-level only (existing behavior)
  const { data: kanbanData, isLoading: kanbanLoading } = useTasks({
    project_id: projectId,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    sprint_id: sprintFilter || undefined,
    is_overdue: overdueOnly || undefined,
    per_page: 200,
    enabled: view === 'kanban',
  })

  const isLoading = view === 'list' ? allLoading : kanbanLoading

  const allTasks = allData?.data ?? []
  const kanbanTasks = kanbanData?.data ?? []

  // Build tree and apply filters
  const hasFilter = !!(debouncedSearch || statusFilter || priorityFilter || sprintFilter || overdueOnly)

  const filteredTree = useMemo(() => {
    const tree = buildTree(allTasks)
    if (!hasFilter) return tree
    return filterTree(tree, (t) =>
      taskMatchesFilter(t, debouncedSearch, statusFilter, priorityFilter, sprintFilter, overdueOnly),
    )
  }, [allTasks, debouncedSearch, statusFilter, priorityFilter, sprintFilter, overdueOnly, hasFilter])

  // Auto-expand parents when filtering
  const effectiveExpandedIds = useMemo(() => {
    if (!hasFilter) return expandedIds
    // When filtering, expand all nodes that have children in the filtered tree
    const autoExpanded = new Set<string>()
    function collectExpanded(nodes: TaskNode[]) {
      nodes.forEach((n) => {
        if (n.children.length > 0) {
          autoExpanded.add(n.task.id)
          collectExpanded(n.children)
        }
      })
    }
    collectExpanded(filteredTree)
    return autoExpanded
  }, [hasFilter, filteredTree, expandedIds])

  const totalVisible = countAll(filteredTree)
  const totalAll = allTasks.filter((t) => !t.parent_task_id).length

  const { updateStatus } = useTaskMutation(projectId)

  const activeSprints = sprints.filter((s) => s.status === 'ACTIVE' || s.status === 'PLANNING')

  function toggleId(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Top-level tasks for parent selector in create modal
  const rootTasks = useMemo(
    () => allTasks.filter((t) => !t.parent_task_id).map((t) => ({ id: t.id, task_code: t.task_code, title: t.title })),
    [allTasks],
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm công việc…"
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tất cả ưu tiên</option>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {activeSprints.length > 0 && (
            <select
              value={sprintFilter}
              onChange={(e) => setSprintFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Tất cả sprint</option>
              {activeSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300 text-red-600 focus:ring-red-400"
            />
            Quá hạn
          </label>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setView('list')}
            className={cn('px-2.5 py-1.5', view === 'list' ? 'bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-50')}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={cn('px-2.5 py-1.5', view === 'kanban' ? 'bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-50')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        {/* Export button */}
        <button
          onClick={() => exportTasksToExcel(allTasks)}
          disabled={allTasks.length === 0}
          title="Xuất danh sách công việc (.xlsx)"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        {canManage && (
          <>
            <button
              onClick={() => setShowImport(true)}
              title="Import công việc từ file"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm công việc
            </button>
          </>
        )}
      </div>

      {/* Count */}
      {view === 'list' && (
        <p className="text-xs text-slate-400">
          {hasFilter
            ? `${totalVisible} công việc khớp (${totalAll} gốc)`
            : `${totalAll} công việc gốc · ${allTasks.length - totalAll} công việc con`}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : view === 'kanban' ? (
        kanbanTasks.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Không có công việc nào
          </div>
        ) : (
          <KanbanBoard
            tasks={kanbanTasks}
            onStatusChange={(taskId, status) => updateStatus.mutate({ taskId, status })}
            onTaskClick={onTaskClick}
          />
        )
      ) : filteredTree.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          Không có công việc nào
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-3 py-2.5 text-left font-medium">Tên công việc</th>
                <th className="px-3 py-2.5 text-left font-medium w-28">Trạng thái</th>
                <th className="px-3 py-2.5 text-left font-medium w-28">Ưu tiên</th>
                <th className="px-3 py-2.5 text-left font-medium w-36">Thời gian <span className="font-normal text-slate-300">(* tự động)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTree.map((node) => (
                <TaskTreeRow
                  key={node.task.id}
                  node={node}
                  depth={0}
                  expanded={effectiveExpandedIds.has(node.task.id)}
                  onToggleExpand={() => toggleId(node.task.id)}
                  onTaskClick={onTaskClick}
                  expandedIds={effectiveExpandedIds}
                  onToggleId={toggleId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          projectId={projectId}
          sprints={sprints}
          members={members}
          existingTasks={rootTasks}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showImport && (
        <ImportTasksModal
          projectId={projectId}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
