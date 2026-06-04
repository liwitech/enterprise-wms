import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ArrowLeft, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { timesheetService } from '@/services/timesheetService'
import { projectService } from '@/services/projectService'
import { TimesheetStatusBadge } from '@/components/ui/Badge'
import Pagination from '@/components/ui/Pagination'
import { cn } from '@/utils/cn'
import type { TimesheetStatus } from '@/types'

const STATUS_OPTIONS: { value: TimesheetStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'SUBMITTED', label: 'Đã nộp' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Đã từ chối' },
]

const PER_PAGE = 20

export default function TimesheetHistoryPage() {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<TimesheetStatus | ''>('')
  const [page, setPage] = useState<number>(1)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth() + 1

  const { data: timesheetData, isLoading: isLoadingTimesheets } = useQuery({
    queryKey: ['timesheets-history', year, month, projectFilter, statusFilter, page],
    queryFn: () =>
      timesheetService.list({
        year,
        month,
        project_id: projectFilter || undefined,
        status: statusFilter || undefined,
        page,
        per_page: PER_PAGE,
      }),
    staleTime: 2 * 60_000,
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => projectService.list({ per_page: 100 }),
    staleTime: 10 * 60_000,
  })

  const entries = timesheetData?.data ?? []
  const meta = timesheetData?.meta
  const projects = projectsData?.data ?? []

  const projectMap = new Map(projects.map((p) => [p.id, p.name]))

  function handlePrevMonth() {
    setCurrentMonth((m) => subMonths(m, 1))
    setPage(1)
  }

  function handleNextMonth() {
    setCurrentMonth((m) => addMonths(m, 1))
    setPage(1)
  }

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setProjectFilter(e.target.value)
    setPage(1)
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value as TimesheetStatus | '')
    setPage(1)
  }

  function handleReset() {
    setProjectFilter('')
    setStatusFilter('')
    setPage(1)
  }

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: vi })
  const firstDay = startOfMonth(currentMonth)
  const lastDay = endOfMonth(currentMonth)
  const rangeLabel =
    format(firstDay, 'dd/MM/yyyy', { locale: vi }) +
    ' – ' +
    format(lastDay, 'dd/MM/yyyy', { locale: vi })

  const selectBase =
    'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

  return (
    <div className="min-h-screen bg-slate-50 font-['IBM_Plex_Sans',sans-serif]">
      <div className="mx-auto max-w-5xl px-4 py-8">

        {/* Back link */}
        <Link
          to="/timesheets"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Về chế độ xem tuần
        </Link>

        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Clock className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Lịch sử chấm công</h1>
            <p className="text-xs text-slate-500">{rangeLabel}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* Month navigator */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Tháng trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[110px] text-center text-sm font-semibold capitalize text-slate-700">
              {monthLabel}
            </span>
            <button
              onClick={handleNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Tháng sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          {/* Project filter */}
          <select value={projectFilter} onChange={handleProjectChange} className={selectBase}>
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select value={statusFilter} onChange={handleStatusChange} className={selectBase}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Reset */}
          {(projectFilter || statusFilter) && (
            <button
              onClick={handleReset}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              Reset
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {isLoadingTimesheets ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Clock className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400">Không có dữ liệu trong tháng này</p>
            </div>
          ) : (
            <>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ngày
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Giờ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dự án
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Mô tả
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const isRejected = entry.status === 'REJECTED'
                    const isApproved = entry.status === 'APPROVED'
                    const projectName = projectMap.get(entry.project_id) ?? entry.project_id

                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          'transition-colors',
                          isRejected && 'bg-red-50 hover:bg-red-50/80',
                          isApproved && !isRejected && 'bg-emerald-50 hover:bg-emerald-50/80',
                          !isRejected && !isApproved && 'hover:bg-slate-50',
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                          {format(new Date(entry.work_date), 'dd/MM/yyyy', { locale: vi })}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-slate-900">
                          {entry.hours_logged}h
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <span className="max-w-[160px] truncate block" title={projectName}>
                            {projectName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          <div>
                            <span>{entry.description ?? '—'}</span>
                            {isRejected && entry.reject_reason && (
                              <p className="mt-0.5 text-xs text-red-500">{entry.reject_reason}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <TimesheetStatusBadge status={entry.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {meta && meta.total_pages > 1 && (
                <Pagination
                  page={page}
                  totalPages={meta.total_pages}
                  total={meta.total}
                  perPage={PER_PAGE}
                  onChange={setPage}
                />
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}
