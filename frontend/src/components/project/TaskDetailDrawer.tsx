import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  X, Check, Clock, Flag, User, Calendar,
  ChevronDown, Plus, MessageSquare, Timer, GitBranch,
  ArrowUpRight, Loader2, Maximize2, Minimize2, AlignLeft,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { taskService } from '@/services/taskService'
import { useTaskMutation } from '@/hooks/useTaskMutation'
import { useTaskComments } from '@/hooks/useTasks'
import { useProject } from '@/hooks/useProject'
import type { TaskStatus, Priority } from '@/types'

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

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Bình thường',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
}

const SUBTASK_STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-500',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-600',
  IN_REVIEW: 'bg-amber-100 text-amber-600',
  DONE: 'bg-emerald-100 text-emerald-600',
  CANCELLED: 'bg-red-100 text-red-500',
}

interface TaskDraft {
  title: string
  description: string
  start_date: string
  due_date: string
  assignee_user_id: string
  priority: string
  estimated_hours: string
  actual_hours: string
}

function buildDraft(task: {
  title: string; description?: string; start_date?: string; due_date?: string
  assignee_user_id?: string; priority: string; estimated_hours?: number; actual_hours?: number
}): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    start_date: task.start_date ?? '',
    due_date: task.due_date ?? '',
    assignee_user_id: task.assignee_user_id ?? '',
    priority: task.priority,
    estimated_hours: task.estimated_hours?.toString() ?? '',
    actual_hours: task.actual_hours?.toString() ?? '',
  }
}

function QuickAddSubtask({
  projectId,
  parentTaskId,
  onDone,
}: {
  projectId: string
  parentTaskId: string
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const { createSubtask } = useTaskMutation(projectId)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    await createSubtask.mutateAsync({
      project_id: projectId,
      parent_task_id: parentTaskId,
      title: t,
      status: 'TODO',
      priority: 'MEDIUM',
      start_date: startDate || undefined,
      due_date: dueDate || undefined,
    } as any)
    setTitle('')
    setStartDate('')
    setDueDate('')
    onDone()
  }

  const inputCls = 'w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300'

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-2.5"
    >
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tên công việc con..."
        className={inputCls}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone() }}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Bắt đầu</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Hạn chót</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={!title.trim() || createSubtask.isPending}
          className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50 transition"
        >
          {createSubtask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Tạo
        </button>
      </div>
    </form>
  )
}

function StatusSelect({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', STATUS_COLOR[value])}
      >
        {STATUS_LABEL[value]}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false) }}
              className={cn('w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50', s === value && 'font-semibold')}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LogTimeModal({
  taskId,
  onClose,
  onLog,
}: {
  taskId: string
  onClose: () => void
  onLog: (data: { task_id: string; work_date: string; hours_logged: number; description?: string }) => void
}) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [hours, setHours] = useState('')
  const [desc, setDesc] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Ghi nhận giờ làm</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ngày làm việc</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Số giờ</label>
            <input type="number" min="0.5" step="0.5" max="24" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 2.5" className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ghi chú</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm resize-none" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded">Hủy</button>
          <button
            onClick={() => {
              const h = parseFloat(hours)
              if (!h || h <= 0) return
              onLog({ task_id: taskId, work_date: date, hours_logged: h, description: desc || undefined })
              onClose()
            }}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  taskId: string
  projectId: string
  onClose: () => void
  onTaskClick?: (taskId: string) => void
}

export default function TaskDetailDrawer({ taskId, projectId, onClose, onTaskClick }: Props) {
  const [showLogTime, setShowLogTime] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [showAddSubtask, setShowAddSubtask] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const prevTaskIdRef = useRef('')

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => taskService.get(taskId),
    staleTime: 30_000,
  })

  const { data: commentsRes } = useTaskComments(taskId)
  const comments = commentsRes?.data ?? []

  const { updateStatus, updateTask, addComment, logTime } = useTaskMutation(projectId)
  const { data: project } = useProject(projectId)
  const members = project?.members ?? []

  const subtasks = task?.subtasks ?? []
  const derivedStartDate = !task?.start_date && subtasks.length > 0
    ? ([...subtasks.map((s) => s.start_date).filter(Boolean)] as string[]).sort()[0]
    : undefined
  const derivedDueDate = !task?.due_date && subtasks.length > 0
    ? ([...subtasks.map((s) => s.due_date).filter(Boolean)] as string[]).sort().reverse()[0]
    : undefined

  // Initialize draft when a (new) task loads
  useEffect(() => {
    if (task && prevTaskIdRef.current !== task.id) {
      prevTaskIdRef.current = task.id
      setDraft(buildDraft(task))
    }
  }, [task])

  const isDirty = !!(draft && task && (
    draft.title.trim() !== task.title ||
    draft.description !== (task.description ?? '') ||
    draft.start_date !== (task.start_date ?? '') ||
    draft.due_date !== (task.due_date ?? '') ||
    draft.assignee_user_id !== (task.assignee_user_id ?? '') ||
    draft.priority !== task.priority ||
    draft.estimated_hours !== (task.estimated_hours?.toString() ?? '') ||
    draft.actual_hours !== (task.actual_hours?.toString() ?? '')
  ))

  function setField<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  function handleSave() {
    if (!draft || !task) return
    const data: Record<string, unknown> = {}
    if (draft.title.trim() !== task.title) data.title = draft.title.trim()
    if (draft.description !== (task.description ?? '')) data.description = draft.description || undefined
    if (draft.start_date !== (task.start_date ?? '')) data.start_date = draft.start_date || undefined
    if (draft.due_date !== (task.due_date ?? '')) data.due_date = draft.due_date || undefined
    if (draft.assignee_user_id !== (task.assignee_user_id ?? '')) data.assignee_user_id = draft.assignee_user_id || null
    if (draft.priority !== task.priority) data.priority = draft.priority
    if (draft.estimated_hours !== (task.estimated_hours?.toString() ?? ''))
      data.estimated_hours = draft.estimated_hours ? parseFloat(draft.estimated_hours) : undefined
    if (draft.actual_hours !== (task.actual_hours?.toString() ?? ''))
      data.actual_hours = draft.actual_hours ? parseFloat(draft.actual_hours) : undefined
    if (Object.keys(data).length === 0) return
    updateTask.mutate({ taskId, data } as any, {
      onSuccess: () => { prevTaskIdRef.current = '' },
    })
  }

  function handleDiscard() {
    if (task) setDraft(buildDraft(task))
  }

  function handleStatusChange(status: TaskStatus) {
    updateStatus.mutate({ taskId, status })
  }

  function handleCommentSubmit() {
    const content = commentDraft.trim()
    if (!content) return
    addComment.mutate({ taskId, content })
    setCommentDraft('')
  }

  const fieldCls = 'flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-slate-700 hover:border-slate-200 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-200 transition'

  // ── Meta column ─────────────────────────────────────────────────────────────
  const metaContent = draft && task ? (
    <>
      {/* Title */}
      <input
        value={draft.title}
        onChange={(e) => setField('title', e.target.value)}
        className="mb-4 w-full border-b border-transparent bg-transparent pb-0.5 text-base font-semibold text-slate-900 hover:border-slate-200 focus:border-red-300 focus:outline-none transition"
        placeholder="Tên công việc..."
      />

      {/* Status + Priority */}
      <div className="mb-5 flex items-center gap-3">
        <StatusSelect value={task.status} onChange={handleStatusChange} />
        <div className="flex items-center gap-1.5">
          <Flag className={cn('h-3.5 w-3.5 shrink-0', PRIORITY_COLOR[draft.priority])} />
          <select
            value={draft.priority}
            onChange={(e) => setField('priority', e.target.value)}
            className={cn('cursor-pointer border-0 bg-transparent text-xs font-medium focus:outline-none', PRIORITY_COLOR[draft.priority])}
          >
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Priority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Meta grid */}
      <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
        {/* Start date */}
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="w-28 shrink-0 text-xs text-slate-500">Ngày bắt đầu</span>
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) => setField('start_date', e.target.value)}
              className={fieldCls}
            />
          </div>
          {derivedStartDate && (
            <p className="pl-[calc(3.5px+0.875rem+0.75rem+7rem)] text-[11px] italic text-slate-400">
              Tự động từ công việc con: {format(new Date(derivedStartDate), 'dd/MM/yyyy')}
            </p>
          )}
        </div>

        {/* Due date */}
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="w-28 shrink-0 text-xs text-slate-500">Hạn chót</span>
            <input
              type="date"
              value={draft.due_date}
              onChange={(e) => setField('due_date', e.target.value)}
              className={cn(
                fieldCls,
                draft.due_date && new Date(draft.due_date) < new Date() && task.status !== 'DONE'
                  ? 'text-red-500'
                  : '',
              )}
            />
          </div>
          {derivedDueDate && (
            <p className="pl-[calc(3.5px+0.875rem+0.75rem+7rem)] text-[11px] italic text-slate-400">
              Tự động từ công việc con: {format(new Date(derivedDueDate), 'dd/MM/yyyy')}
            </p>
          )}
        </div>

        {/* Assignee */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="w-28 shrink-0 text-xs text-slate-500">Người thực hiện</span>
          <select
            value={draft.assignee_user_id}
            onChange={(e) => setField('assignee_user_id', e.target.value)}
            className={fieldCls}
          >
            <option value="">— Chưa phân công —</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user?.full_name ?? m.user_id}
              </option>
            ))}
          </select>
        </div>

        {/* Estimated hours */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="w-28 shrink-0 text-xs text-slate-500">Giờ ước tính</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={draft.estimated_hours}
            onChange={(e) => setField('estimated_hours', e.target.value)}
            placeholder="—"
            className={fieldCls}
          />
        </div>

        {/* Actual hours */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Timer className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="w-28 shrink-0 text-xs text-slate-500">Giờ thực tế</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={draft.actual_hours}
            onChange={(e) => setField('actual_hours', e.target.value)}
            placeholder="—"
            className={fieldCls}
          />
        </div>
      </div>

      {/* Description */}
      <div className="mb-5">
        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500">
          <AlignLeft className="h-3.5 w-3.5" />
          Mô tả
        </p>
        <textarea
          value={draft.description}
          onChange={(e) => setField('description', e.target.value)}
          rows={3}
          placeholder="Thêm mô tả..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-slate-300 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-200"
        />
      </div>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Parent task */}
      {task.parent && (
        <div className="mb-5">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Công việc cha
          </p>
          <button
            onClick={() => onTaskClick?.(task.parent!.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:border-red-300 hover:bg-red-50"
          >
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-500">
              {task.parent.task_code}
            </span>
            <span className="truncate text-slate-700">{task.parent.title}</span>
            <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', SUBTASK_STATUS_COLOR[task.parent.status])}>
              {STATUS_LABEL[task.parent.status]}
            </span>
          </button>
        </div>
      )}

      {/* Log time */}
      <button
        onClick={() => setShowLogTime(true)}
        className="mb-5 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 transition-colors hover:border-red-300 hover:text-red-600"
      >
        <Timer className="h-3.5 w-3.5" />
        Ghi nhận giờ làm
      </button>
    </>
  ) : null

  // ── Activity column ──────────────────────────────────────────────────────────
  const activityContent = task ? (
    <>
      {/* Subtasks */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
            <GitBranch className="h-3.5 w-3.5" />
            Công việc con ({task.subtasks?.length ?? 0})
          </p>
          {!showAddSubtask && (
            <button
              onClick={() => setShowAddSubtask(true)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Plus className="h-3 w-3" />
              Thêm
            </button>
          )}
        </div>

        {task.subtasks && task.subtasks.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {task.subtasks.map((sub) => {
              const subOverdue =
                sub.due_date &&
                new Date(sub.due_date) < new Date() &&
                sub.status !== 'DONE' &&
                sub.status !== 'CANCELLED'
              return (
                <button
                  key={sub.id}
                  onClick={() => onTaskClick?.(sub.id)}
                  className="flex w-full flex-col gap-1 rounded-lg border border-slate-100 px-3 py-2 text-left transition-colors hover:border-red-200 hover:bg-red-50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-400">
                      {sub.task_code}
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-700">{sub.title}</span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', SUBTASK_STATUS_COLOR[sub.status])}>
                      {STATUS_LABEL[sub.status]}
                    </span>
                  </div>
                  {(sub.start_date || sub.due_date) && (
                    <div className="flex items-center gap-3 pl-0.5 text-[11px] text-slate-400">
                      {sub.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(sub.start_date), 'dd/MM/yyyy')}
                        </span>
                      )}
                      {sub.start_date && sub.due_date && <span className="text-slate-300">→</span>}
                      {sub.due_date && (
                        <span className={cn('flex items-center gap-1', subOverdue && 'text-red-500')}>
                          <Clock className="h-3 w-3" />
                          {format(new Date(sub.due_date), 'dd/MM/yyyy')}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {showAddSubtask && (
          <QuickAddSubtask
            projectId={projectId}
            parentTaskId={task.id}
            onDone={() => setShowAddSubtask(false)}
          />
        )}
      </div>

      {/* Comments */}
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <MessageSquare className="h-3.5 w-3.5" />
          Bình luận ({comments.length})
        </p>

        <div className="mb-3 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-700">
                {c.user?.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">{c.user?.full_name ?? 'Unknown'}</span>
                  <span className="text-xs text-slate-400">
                    {format(new Date(c.created_at), 'dd/MM HH:mm', { locale: vi })}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{c.content}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit() }
            }}
            placeholder="Thêm bình luận… (Enter để gửi)"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300"
          />
          <button
            onClick={handleCommentSubmit}
            disabled={!commentDraft.trim()}
            className="self-end rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  ) : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div
        className={cn(
          'fixed right-0 top-0 z-40 flex h-full w-full flex-col bg-white shadow-2xl transition-[max-width] duration-300',
          isExpanded ? 'max-w-4xl' : 'max-w-lg',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Chi tiết công việc</span>
            {task?.task_code && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                {task.task_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? 'Thu nhỏ' : 'Mở rộng'}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {isLoading || !task || !draft ? (
          <div className="flex-1 space-y-4 p-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : isExpanded ? (
          <div className="flex min-h-0 flex-1">
            <div className="flex-1 overflow-y-auto p-5">
              {metaContent}
            </div>
            <div className="w-[400px] shrink-0 overflow-y-auto border-l border-slate-100 p-5">
              {activityContent}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {metaContent}
            {activityContent}
          </div>
        )}

        {/* Save bar */}
        {isDirty && (
          <div className="flex shrink-0 items-center justify-between border-t border-amber-200 bg-amber-50 px-5 py-3">
            <span className="flex items-center gap-2 text-xs text-amber-700">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              Có thay đổi chưa được lưu
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleDiscard}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                Huỷ
              </button>
              <button
                onClick={handleSave}
                disabled={updateTask.isPending}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {updateTask.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />
                }
                Lưu thay đổi
              </button>
            </div>
          </div>
        )}
      </div>

      {showLogTime && task && (
        <LogTimeModal
          taskId={task.id}
          onClose={() => setShowLogTime(false)}
          onLog={(data) => logTime.mutate(data)}
        />
      )}
    </>
  )
}
