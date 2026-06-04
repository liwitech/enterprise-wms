import { useEffect, useMemo, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Plus, Send, CheckCircle2,
  Loader2, AlertCircle, Clock, History, X,
} from 'lucide-react'
import { format, startOfWeek, addWeeks, subWeeks, addDays } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/utils/cn'
import { useTimesheetWeek } from '@/hooks/useTimesheetWeek'
import { WeeklyGrid } from '@/components/timesheet/WeeklyGrid'
import TimesheetSummaryPanel from '@/components/timesheet/TimesheetSummaryPanel'
import { taskService } from '@/services/taskService'
import { projectService } from '@/services/projectService'
import type { TimesheetStatus } from '@/types'

// ── Status chip ───────────────────────────────────────────────────────────────

const WEEK_STATUS_STYLE: Record<TimesheetStatus, { cls: string; label: string }> = {
  DRAFT:     { cls: 'bg-slate-100 text-slate-600',   label: 'Nháp' },
  SUBMITTED: { cls: 'bg-indigo-100 text-indigo-700', label: 'Đang chờ duyệt' },
  APPROVED:  { cls: 'bg-emerald-100 text-emerald-700', label: 'Đã duyệt' },
  REJECTED:  { cls: 'bg-red-100 text-red-700',        label: 'Có mục bị từ chối' },
}

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  if (state === 'saving') return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <Loader2 className="h-3 w-3 animate-spin" /> Đang lưu...
    </span>
  )
  if (state === 'saved') return (
    <span className="flex items-center gap-1 text-xs text-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> Đã lưu
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-red-500">
      <AlertCircle className="h-3 w-3" /> Lỗi lưu
    </span>
  )
}

// ── Submit confirm dialog ─────────────────────────────────────────────────────

interface SubmitDialogProps {
  draftCount: number
  rejectedCount: number
  hasOverhour: boolean
  isSubmitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

function SubmitDialog({ draftCount, rejectedCount, hasOverhour, isSubmitting, onConfirm, onCancel }: SubmitDialogProps) {
  const total = draftCount + rejectedCount
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Nộp timesheet tuần này?</h3>
        <p className="text-sm text-slate-600 mb-4">
          Bạn sắp nộp <strong>{total}</strong> mục chấm công.
          Sau khi nộp, bạn không thể chỉnh sửa cho đến khi quản lý duyệt.
        </p>
        {hasOverhour && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Có ngày vượt quá 16 giờ. Vui lòng kiểm tra lại trước khi nộp.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Nộp
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Navigation blocker dialog ─────────────────────────────────────────────────

function BlockerDialog({ onProceed, onStay }: { onProceed: () => void; onStay: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Có thay đổi chưa lưu</h3>
        <p className="text-sm text-slate-600 mb-4">
          Một số ô giờ đang được lưu. Nếu bạn rời đi ngay, dữ liệu có thể bị mất.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onStay} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Ở lại
          </button>
          <button onClick={onProceed} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Rời đi
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Row modal ─────────────────────────────────────────────────────────────

interface AddRowModalProps {
  onAdd: (taskId: string) => void
  onClose: () => void
}

function AddRowModal({ onAdd, onClose }: AddRowModalProps) {
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')

  const { data: projectsRes } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => projectService.list({ per_page: 100 }),
    staleTime: 5 * 60_000,
  })

  const { data: tasksRes } = useQuery({
    queryKey: ['tasks-select', projectId],
    queryFn: () => taskService.list({ project_id: projectId, per_page: 200 }),
    enabled: !!projectId,
  })

  const projects = projectsRes?.data ?? []
  const tasks = tasksRes?.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Thêm dòng công việc</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Dự án</label>
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setTaskId('') }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none"
            >
              <option value="">— Chọn dự án —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Công việc</label>
            <select
              value={taskId}
              onChange={e => setTaskId(e.target.value)}
              disabled={!projectId}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">— Chọn công việc —</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Hủy
          </button>
          <button
            disabled={!taskId}
            onClick={() => { onAdd(taskId); onClose() }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Thêm dòng
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mobile list view ──────────────────────────────────────────────────────────

function MobileView({ weekDays, rows, dailyTotals }: {
  weekDays: Date[]
  rows: ReturnType<typeof useTimesheetWeek>['rows']
  dailyTotals: Record<string, number>
}) {
  return (
    <div className="space-y-3 md:hidden">
      {weekDays.map((day, idx) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const total = dailyTotals[dateStr] ?? 0
        const dayRows = rows.filter(r => (r.cells[dateStr]?.hours ?? 0) > 0)
        const isWeekend = idx >= 5

        return (
          <div key={dateStr} className={cn('rounded-xl border border-slate-200 bg-white p-3', isWeekend && 'opacity-60')}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {format(day, 'EEEE dd/MM', { locale: vi })}
              </span>
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                total === 0 ? 'text-slate-400' : total === 8 ? 'bg-emerald-100 text-emerald-700' : total > 8 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
              )}>
                {total > 0 ? `${total}h` : '—'}
              </span>
            </div>
            {dayRows.length === 0 ? (
              <p className="text-xs text-slate-400">Không có công việc</p>
            ) : (
              <div className="space-y-1">
                {dayRows.map(r => (
                  <div key={r.taskId} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate flex-1">{r.taskTitle}</span>
                    <span className="ml-2 font-medium text-slate-600 shrink-0">
                      {r.cells[dateStr]?.hours}h
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [showAddRow, setShowAddRow] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  const {
    isLoading,
    rows,
    weekDays,
    weekStatus,
    dailyTotals,
    weeklyTotal,
    indicator,
    hasPendingSaves,
    entries,
    updateCell,
    addRow,
    submitWeek,
    isSubmitting,
  } = useTimesheetWeek(weekStart)

  // Navigation blocker
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasPendingSaves && currentLocation.pathname !== nextLocation.pathname,
  )

  // Browser unload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingSaves) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasPendingSaves])

  // Project breakdown for summary panel
  const projectBreakdown = useMemo(() => {
    const map = new Map<string, { projectName: string; hours: number }>()
    rows.forEach(row => {
      const rowTotal = Object.values(row.cells).reduce((s, c) => s + (c.hours ?? 0), 0)
      if (rowTotal > 0) {
        const prev = map.get(row.projectId) ?? { projectName: row.projectName, hours: 0 }
        map.set(row.projectId, { projectName: row.projectName, hours: prev.hours + rowTotal })
      }
    })
    return Array.from(map.entries()).map(([projectId, v]) => ({ projectId, ...v }))
  }, [rows])

  // Submit validation
  const hasOverhour = Object.values(dailyTotals).some(h => h > 16)
  const draftEntries = entries.filter(e => e.status === 'DRAFT')
  const rejectedEntries = entries.filter(e => e.status === 'REJECTED')
  const canSubmit = weekStatus === 'DRAFT' || weekStatus === 'REJECTED'

  const weekEnd = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, 'dd/MM')} – ${format(weekEnd, 'dd/MM/yyyy')}`

  const statusStyle = WEEK_STATUS_STYLE[weekStatus]

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Week navigator */}
            <button
              onClick={() => setWeekStart(w => subWeeks(w, 1))}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">{weekLabel}</span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusStyle.cls)}>
                  {statusStyle.label}
                </span>
              </div>
              <div className="mt-0.5">
                <SaveIndicator state={indicator} />
              </div>
            </div>
            <button
              onClick={() => setWeekStart(w => addWeeks(w, 1))}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/timesheets/history"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <History className="h-4 w-4" />
              Lịch sử
            </Link>

            <button
              onClick={() => setShowAddRow(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Thêm dòng
            </button>

            {canSubmit && (
              <button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={isSubmitting || entries.filter(e => e.status === 'DRAFT' || e.status === 'REJECTED').length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Nộp tuần này
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Grid (desktop) */}
            <div className="flex-1 min-w-0">
              <div className="hidden md:block">
                <WeeklyGrid
                  rows={rows}
                  weekDays={weekDays}
                  dailyTotals={dailyTotals}
                  weekStatus={weekStatus}
                  onCellChange={updateCell}
                  onResubmitRow={(entryIds) => submitWeek(entryIds)}
                />
              </div>
              {/* Mobile list */}
              <MobileView weekDays={weekDays} rows={rows} dailyTotals={dailyTotals} />
            </div>

            {/* Summary panel */}
            <div className="lg:w-72 shrink-0">
              <TimesheetSummaryPanel
                weeklyTotal={weeklyTotal}
                projectBreakdown={projectBreakdown}
                currentWeekStart={weekStart}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showSubmitConfirm && (
        <SubmitDialog
          draftCount={draftEntries.length}
          rejectedCount={rejectedEntries.length}
          hasOverhour={hasOverhour}
          isSubmitting={isSubmitting}
          onConfirm={async () => {
            await submitWeek()
            setShowSubmitConfirm(false)
          }}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}

      {showAddRow && (
        <AddRowModal
          onAdd={(taskId) => addRow(taskId)}
          onClose={() => setShowAddRow(false)}
        />
      )}

      {blocker.state === 'blocked' && (
        <BlockerDialog
          onProceed={() => blocker.proceed()}
          onStay={() => blocker.reset()}
        />
      )}
    </div>
  )
}
