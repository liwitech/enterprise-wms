import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  format,
  parseISO,
  startOfWeek,
  addDays,
  subWeeks,
  formatDistanceToNow,
} from 'date-fns'
import { vi } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Download,
  CheckSquare,
  Search,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { timesheetService } from '@/services/timesheetService'
import { cn } from '@/utils/cn'
import type { TimesheetEntryExtended } from '@/types'

// ── Local types ────────────────────────────────────────────────────────────────

interface ApprovalGroup {
  key: string
  userId: string
  userName: string
  userEmail: string
  weekStart: string
  weekEnd: string
  entries: TimesheetEntryExtended[]
  totalHours: number
  taskCount: number
  submittedAt: string
  allEntryIds: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildGroups(entries: TimesheetEntryExtended[]): ApprovalGroup[] {
  const map = new Map<string, ApprovalGroup>()

  for (const entry of entries) {
    const userId = entry.user_id
    const monday = startOfWeek(parseISO(entry.work_date), { weekStartsOn: 1 })
    const weekStart = format(monday, 'yyyy-MM-dd')
    const weekEnd = format(addDays(monday, 6), 'yyyy-MM-dd')
    const key = `${userId}|${weekStart}`

    if (!map.has(key)) {
      map.set(key, {
        key,
        userId,
        userName: entry.user?.full_name ?? '—',
        userEmail: entry.user?.email ?? '',
        weekStart,
        weekEnd,
        entries: [],
        totalHours: 0,
        taskCount: 0,
        submittedAt: entry.submitted_at ?? entry.created_at,
        allEntryIds: [],
      })
    }

    const group = map.get(key)!
    group.entries.push(entry)
    group.totalHours += Number(entry.hours_logged)
    group.allEntryIds.push(entry.id)

    // Latest submitted_at in group
    const entryTs = entry.submitted_at ?? entry.created_at
    if (entryTs > group.submittedAt) {
      group.submittedAt = entryTs
    }
  }

  // Resolve unique task counts
  for (const group of map.values()) {
    const uniqueTasks = new Set(group.entries.map((e) => e.task_id))
    group.taskCount = uniqueTasks.size
  }

  return Array.from(map.values()).sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  )
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TimesheetApprovalTab() {
  const qc = useQueryClient()

  // UI state
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [searchEmployee, setSearchEmployee] = useState('')
  const [weekFilter, setWeekFilter] = useState('')
  const [rejectModal, setRejectModal] = useState<{
    groupKey: string
    entryIds: string[]
    userName: string
    weekRange: string
  } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [locallyApproved, setLocallyApproved] = useState<Set<string>>(new Set())
  const [locallyRejected, setLocallyRejected] = useState<Set<string>>(new Set())
  const [reasonTouched, setReasonTouched] = useState(false)

  // Derived date constants
  const now = new Date()
  const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['approval-pending'],
    queryFn: () => timesheetService.getPending({ per_page: 500 }),
  })

  const { data: approvedWeekData } = useQuery({
    queryKey: ['approval-approved-week', weekStartStr],
    queryFn: () =>
      timesheetService.list({ status: 'APPROVED', week_start: weekStartStr, per_page: 1 }),
  })

  const { data: rejectedMonthData } = useQuery({
    queryKey: ['approval-rejected-month', year, month],
    queryFn: () =>
      timesheetService.list({ status: 'REJECTED', year, month, per_page: 1 }),
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: (entryIds: string[]) => timesheetService.approveBatch(entryIds),
    onMutate: (entryIds) => {
      setLocallyApproved((prev) => {
        const next = new Set(prev)
        entryIds.forEach((id) => next.add(id))
        return next
      })
    },
    onError: (_err, entryIds) => {
      setLocallyApproved((prev) => {
        const next = new Set(prev)
        entryIds.forEach((id) => next.delete(id))
        return next
      })
      toast.error('Lỗi khi duyệt. Vui lòng thử lại.')
    },
    onSuccess: () => {
      toast.success('Đã duyệt thành công!')
      qc.invalidateQueries({ queryKey: ['approval-pending'] })
      qc.invalidateQueries({ queryKey: ['approval-approved-week'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ entryIds, reason }: { entryIds: string[]; reason: string }) =>
      Promise.all(entryIds.map((id) => timesheetService.reject(id, reason))),
    onMutate: ({ entryIds }) => {
      setLocallyRejected((prev) => {
        const next = new Set(prev)
        entryIds.forEach((id) => next.add(id))
        return next
      })
      setRejectModal(null)
      setRejectReason('')
      setReasonTouched(false)
    },
    onError: (_err, { entryIds }) => {
      setLocallyRejected((prev) => {
        const next = new Set(prev)
        entryIds.forEach((id) => next.delete(id))
        return next
      })
      toast.error('Lỗi khi từ chối.')
    },
    onSuccess: () => {
      toast.success('Đã từ chối.')
      qc.invalidateQueries({ queryKey: ['approval-pending'] })
      qc.invalidateQueries({ queryKey: ['approval-approved-week'] })
    },
  })

  // ── Data processing ────────────────────────────────────────────────────────

  const allEntries = pendingData?.data ?? []
  const dismissed = new Set([...locallyApproved, ...locallyRejected])

  const rawGroups = buildGroups(allEntries).filter(
    (g) => !g.allEntryIds.every((id) => dismissed.has(id)),
  )

  const filteredGroups = rawGroups.filter((g) => {
    const matchSearch =
      !searchEmployee ||
      g.userName.toLowerCase().includes(searchEmployee.toLowerCase())
    const matchWeek = !weekFilter || g.weekStart === weekFilter
    return matchSearch && matchWeek
  })

  const displayGroups = filteredGroups

  // ── Week filter options ────────────────────────────────────────────────────

  const weekOptions = Array.from({ length: 8 }, (_, i) => {
    const monday = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), i)
    const sunday = addDays(monday, 6)
    return {
      value: format(monday, 'yyyy-MM-dd'),
      label: `${format(monday, 'dd/MM')} - ${format(sunday, 'dd/MM/yyyy')}`,
    }
  })

  // ── Selection helpers ──────────────────────────────────────────────────────

  function toggleGroupSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleExpandGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allFilteredSelected =
    displayGroups.length > 0 && displayGroups.every((g) => selectedKeys.has(g.key))

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        displayGroups.forEach((g) => next.delete(g.key))
        return next
      })
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        displayGroups.forEach((g) => next.add(g.key))
        return next
      })
    }
  }

  // ── Batch approve ──────────────────────────────────────────────────────────

  function handleBatchApprove() {
    const ids = displayGroups
      .filter((g) => selectedKeys.has(g.key))
      .flatMap((g) => g.allEntryIds)
    approveMutation.mutate(ids)
    setSelectedKeys(new Set())
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  function handleExport() {
    const rows = displayGroups.flatMap((g) => {
      const weekRange = `${format(parseISO(g.weekStart), 'dd/MM')} - ${format(parseISO(g.weekEnd), 'dd/MM/yyyy')}`
      return g.entries.map((e) => ({
        'Nhân viên': g.userName,
        'Email': g.userEmail,
        'Tuần': weekRange,
        'Ngày': format(parseISO(e.work_date), 'dd/MM/yyyy'),
        'Số giờ': e.hours_logged,
        'Dự án': e.project?.name ?? '—',
        'Mô tả': e.description ?? '',
        'Ngày nộp': e.submitted_at
          ? format(parseISO(e.submitted_at), 'dd/MM/yyyy HH:mm')
          : '—',
      }))
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheets')
    XLSX.writeFile(wb, `timesheets-${format(now, 'yyyy-MM-dd')}.xlsx`)
  }

  // ── Open reject modal ──────────────────────────────────────────────────────

  function openRejectModal(group: ApprovalGroup) {
    const weekRange = `${format(parseISO(group.weekStart), 'dd/MM')} - ${format(parseISO(group.weekEnd), 'dd/MM/yyyy')}`
    setRejectReason('')
    setReasonTouched(false)
    setRejectModal({
      groupKey: group.key,
      entryIds: group.allEntryIds,
      userName: group.userName,
      weekRange,
    })
  }

  const isMutating = approveMutation.isPending || rejectMutation.isPending
  const reasonInvalid = reasonTouched && rejectReason.trim().length < 10

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Pending */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Chờ duyệt</p>
          <div className="mt-1 flex items-end gap-2">
            {pendingLoading ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
            ) : (
              <p className="text-3xl font-bold text-amber-800">
                {pendingData?.meta?.total ?? 0}
              </p>
            )}
            <AlertCircle className="mb-0.5 h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-1 text-xs text-amber-600">mục đang chờ xử lý</p>
        </div>

        {/* Approved this week */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Đã duyệt tuần này</p>
          <p className="mt-1 text-3xl font-bold text-emerald-800">
            {approvedWeekData?.meta?.total ?? 0}
          </p>
          <p className="mt-1 text-xs text-emerald-600">mục đã được duyệt</p>
        </div>

        {/* Rejected this month */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-700 uppercase tracking-wide">Đã từ chối tháng này</p>
          <p className="mt-1 text-3xl font-bold text-red-800">
            {rejectedMonthData?.meta?.total ?? 0}
          </p>
          <p className="mt-1 text-xs text-red-600">mục đã bị từ chối</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm nhân viên..."
            value={searchEmployee}
            onChange={(e) => setSearchEmployee(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Week filter */}
        <select
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">Tất cả các tuần</option>
          {weekOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Export */}
        <button
          onClick={handleExport}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Xuất Excel
        </button>
      </div>

      {/* Batch action bar */}
      {selectedKeys.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5">
          <span className="text-sm font-medium text-indigo-700">
            Đã chọn {selectedKeys.size} nhóm
          </span>
          <button
            onClick={handleBatchApprove}
            disabled={isMutating}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            <CheckSquare className="h-4 w-4" />
            Duyệt tất cả đã chọn
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {displayGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
            <CheckCircle2 className="h-10 w-10 text-slate-300" />
            <p className="text-sm">Không có mục nào chờ duyệt</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nhân viên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tuần
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Giờ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tasks
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ngày nộp
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hành động
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {displayGroups.map((group) => {
                const isExpanded = expandedKeys.has(group.key)
                const isSelected = selectedKeys.has(group.key)
                const weekRange = `${format(parseISO(group.weekStart), 'dd/MM')} - ${format(parseISO(group.weekEnd), 'dd/MM')}`

                return (
                  <Fragment key={group.key}>
                    {/* Group row */}
                    <tr
                      className={cn(
                        'hover:bg-slate-50 transition-colors',
                        isSelected && 'bg-indigo-50/50',
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGroupSelect(group.key)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
                        />
                      </td>

                      {/* Employee */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Expand toggle */}
                          <button
                            onClick={() => toggleExpandGroup(group.key)}
                            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>

                          {/* Avatar */}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                            {getInitials(group.userName)}
                          </div>

                          {/* Name + email */}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{group.userName}</p>
                            <p className="text-xs text-slate-400 truncate">{group.userEmail}</p>
                          </div>
                        </div>
                      </td>

                      {/* Week */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{weekRange}</td>

                      {/* Hours */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold">{group.totalHours.toFixed(1)}h</span>
                        </div>
                      </td>

                      {/* Task count */}
                      <td className="px-4 py-3 text-slate-600">{group.taskCount}</td>

                      {/* Submitted at */}
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {formatDistanceToNow(parseISO(group.submittedAt), {
                          locale: vi,
                          addSuffix: true,
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveMutation.mutate(group.allEntryIds)}
                            disabled={isMutating}
                            className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors border border-emerald-200"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Duyệt
                          </button>
                          <button
                            onClick={() => openRejectModal(group)}
                            disabled={isMutating}
                            className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded sub-row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-0 py-0">
                          <div className="border-t border-slate-100 bg-slate-50">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-indigo-100 bg-indigo-50/60">
                                  <th className="px-6 py-2 text-left font-medium text-indigo-700">
                                    Ngày
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-indigo-700">
                                    Dự án
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-indigo-700">
                                    Số giờ
                                  </th>
                                  <th className="px-4 py-2 text-left font-medium text-indigo-700">
                                    Mô tả
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.entries.map((entry) => (
                                  <tr
                                    key={entry.id}
                                    className="hover:bg-white/60 transition-colors"
                                  >
                                    <td className="px-6 py-2.5 text-slate-600 whitespace-nowrap">
                                      {format(parseISO(entry.work_date), 'EEEE, dd/MM/yyyy', {
                                        locale: vi,
                                      })}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600">
                                      {entry.project?.name ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5 font-semibold text-slate-700">
                                      {Number(entry.hours_logged).toFixed(1)}h
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">
                                      {entry.description || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-slate-800">Từ chối chấm công</h3>
            <p className="mb-4 text-sm text-slate-500">
              Nhóm của{' '}
              <span className="font-medium text-slate-700">{rejectModal.userName}</span>
              {', '}tuần{' '}
              <span className="font-medium text-slate-700">{rejectModal.weekRange}</span>
            </p>

            <label className="mb-1 block text-sm font-medium text-slate-700">
              Lý do từ chối
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onBlur={() => setReasonTouched(true)}
              rows={4}
              placeholder="Nhập lý do từ chối (tối thiểu 10 ký tự)..."
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm text-slate-800 outline-none transition-colors',
                reasonInvalid
                  ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                  : 'border-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100',
              )}
            />
            {reasonInvalid && (
              <p className="mt-1 text-xs text-red-500">
                Lý do phải có ít nhất 10 ký tự.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectModal(null)
                  setRejectReason('')
                  setReasonTouched(false)
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() =>
                  rejectMutation.mutate({
                    entryIds: rejectModal.entryIds,
                    reason: rejectReason,
                  })
                }
                disabled={rejectReason.trim().length < 10 || rejectMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {rejectMutation.isPending ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
