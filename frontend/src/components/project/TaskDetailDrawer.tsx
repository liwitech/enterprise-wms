import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  X, Edit2, Check, Clock, Flag, User, Calendar,
  ChevronDown, Plus, MessageSquare, Timer,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { taskService } from '@/services/taskService'
import { useTaskMutation } from '@/hooks/useTaskMutation'
import { useTaskComments } from '@/hooks/useTasks'
import type { Task, TaskStatus } from '@/types'

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

interface Props {
  taskId: string
  projectId: string
  onClose: () => void
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
              className={cn(
                'w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50',
                s === value && 'font-semibold',
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function InlineEdit({
  value,
  onSave,
  className,
}: {
  value: string
  onSave: (v: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function save() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
            if (e.key === 'Escape') setEditing(false)
          }}
          rows={2}
          className="flex-1 rounded border border-indigo-300 p-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
        />
        <button onClick={save} className="mt-1 rounded p-1 text-emerald-600 hover:bg-emerald-50">
          <Check className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn('group flex items-start gap-1 cursor-pointer', className)}
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      <span className="flex-1">{value}</span>
      <Edit2 className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60 mt-0.5 text-slate-400" />
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Số giờ</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ghi chú</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm resize-none"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded">
            Hủy
          </button>
          <button
            onClick={() => {
              const h = parseFloat(hours)
              if (!h || h <= 0) return
              onLog({ task_id: taskId, work_date: date, hours_logged: h, description: desc || undefined })
              onClose()
            }}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TaskDetailDrawer({ taskId, projectId, onClose }: Props) {
  const [showLogTime, setShowLogTime] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => taskService.get(taskId),
    staleTime: 30_000,
  })

  const { data: commentsRes } = useTaskComments(taskId)
  const comments = commentsRes?.data ?? []

  const { updateStatus, updateTask, addComment, logTime } = useTaskMutation(projectId)

  function handleStatusChange(status: TaskStatus) {
    updateStatus.mutate({ taskId, status })
  }

  function handleTitleSave(title: string) {
    updateTask.mutate({ taskId, data: { title } })
  }

  function handleCommentSubmit() {
    const content = commentDraft.trim()
    if (!content) return
    addComment.mutate({ taskId, content })
    setCommentDraft('')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Chi tiết công việc</span>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !task ? (
          <div className="flex-1 p-5 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {/* Title */}
            <InlineEdit
              value={task.title}
              onSave={handleTitleSave}
              className="text-base font-semibold text-slate-900 mb-3"
            />

            {/* Status + Priority row */}
            <div className="flex items-center gap-3 mb-5">
              <StatusSelect value={task.status} onChange={handleStatusChange} />
              {task.priority && (
                <span className={cn('flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[task.priority])}>
                  <Flag className="h-3 w-3" />
                  {task.priority}
                </span>
              )}
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
              {task.due_date && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>{format(new Date(task.due_date), 'dd/MM/yyyy')}</span>
                </div>
              )}
              {task.assignee_user_id && (
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{task.assignee_user_id}</span>
                </div>
              )}
              {task.estimated_hours != null && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>Ước tính: {task.estimated_hours}h</span>
                </div>
              )}
              {task.actual_hours != null && task.actual_hours > 0 && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Timer className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>Thực tế: {task.actual_hours?.toFixed(1)}h</span>
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div className="mb-5">
                <p className="text-xs font-medium text-slate-500 mb-1.5">Mô tả</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

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

            {/* Log time button */}
            <button
              onClick={() => setShowLogTime(true)}
              className="mb-5 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              <Timer className="h-3.5 w-3.5" />
              Ghi nhận giờ làm
            </button>

            {/* Comments */}
            <div>
              <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <MessageSquare className="h-3.5 w-3.5" />
                Bình luận ({comments.length})
              </p>

              <div className="space-y-3 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-xs font-medium text-indigo-700">
                      {c.user?.full_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
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

              {/* Comment input */}
              <div className="flex gap-2">
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit() }
                  }}
                  placeholder="Thêm bình luận… (Enter để gửi)"
                  rows={2}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
                />
                <button
                  onClick={handleCommentSubmit}
                  disabled={!commentDraft.trim()}
                  className="self-end rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
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
