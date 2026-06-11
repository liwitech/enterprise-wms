import { useQueries } from '@tanstack/react-query'
import { format, subWeeks, startOfWeek } from 'date-fns'
import { vi } from 'date-fns/locale'
import { TrendingUp, Calendar } from 'lucide-react'
import { timesheetService } from '@/services/timesheetService'
import { TimesheetStatusBadge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'
import type { TimesheetEntry, TimesheetStatus } from '@/types'

interface ProjectHours {
  projectId: string
  projectName: string
  hours: number
}

interface Props {
  weeklyTotal: number
  projectBreakdown: ProjectHours[]
  currentWeekStart: Date
}

function deriveWeekStatus(entries: TimesheetEntry[]): TimesheetStatus {
  if (entries.length === 0) return 'DRAFT'
  if (entries.some((e) => e.status === 'REJECTED')) return 'REJECTED'
  if (entries.every((e) => e.status === 'APPROVED')) return 'APPROVED'
  if (entries.some((e) => e.status === 'SUBMITTED')) return 'SUBMITTED'
  return 'DRAFT'
}

export default function TimesheetSummaryPanel({ weeklyTotal, projectBreakdown, currentWeekStart }: Props) {
  const progressPct = Math.min((weeklyTotal / 40) * 100, 100)
  const barColor =
    weeklyTotal >= 40
      ? 'bg-emerald-500'
      : weeklyTotal >= 30
        ? 'bg-orange-400'
        : 'bg-slate-300'

  const sortedProjects = [...projectBreakdown]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8)
  const maxHours = sortedProjects[0]?.hours ?? 1

  const recentWeeks = Array.from({ length: 4 }, (_, i) =>
    startOfWeek(subWeeks(currentWeekStart, i), { weekStartsOn: 1 }),
  )

  const weekQueries = useQueries({
    queries: recentWeeks.map((ws) => ({
      queryKey: ['timesheets-week', format(ws, 'yyyy-MM-dd')],
      queryFn: () =>
        timesheetService.list({ week_start: format(ws, 'yyyy-MM-dd'), per_page: 500 }),
      staleTime: 5 * 60_000,
    })),
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-6">

        {/* Section 1 — Total hours */}
        <div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold text-slate-900">{weeklyTotal.toFixed(1)}</p>
              <p className="mt-0.5 text-sm text-slate-500">Tổng giờ tuần này</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Mục tiêu: 40h</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn('h-2 rounded-full transition-all duration-500', barColor)}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section 2 — Project breakdown */}
        <div>
          <div className="mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Theo dự án</span>
          </div>
          {sortedProjects.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {sortedProjects.map((proj) => {
                const barWidth = Math.max((proj.hours / maxHours) * 100, 0)
                return (
                  <div key={proj.projectId} className="flex items-center gap-2">
                    <p className="w-24 shrink-0 truncate text-xs text-slate-600" title={proj.projectName}>
                      {proj.projectName}
                    </p>
                    <div className="relative flex-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-red-500 transition-all duration-500"
                          style={{ width: `${barWidth}%`, minWidth: '4px' }}
                        />
                      </div>
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs text-slate-500">
                      {proj.hours}h
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Section 3 — Recent 4 weeks */}
        <div>
          <div className="mb-3 flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">4 tuần gần nhất</span>
          </div>
          <div className="space-y-1.5">
            {recentWeeks.map((ws, idx) => {
              const query = weekQueries[idx]
              const entries: TimesheetEntry[] = query.data?.data ?? []
              const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_logged), 0)
              const weekStatus = deriveWeekStatus(entries)
              const isCurrentWeek = idx === 0
              const weekEnd = new Date(ws)
              weekEnd.setDate(weekEnd.getDate() + 6)
              const label =
                format(ws, 'dd/MM', { locale: vi }) +
                ' - ' +
                format(weekEnd, 'dd/MM', { locale: vi })

              return (
                <div
                  key={format(ws, 'yyyy-MM-dd')}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2',
                    isCurrentWeek
                      ? 'border-red-200 bg-red-50'
                      : 'border-transparent bg-slate-50',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'text-xs',
                        isCurrentWeek ? 'font-semibold text-red-700' : 'text-slate-600',
                      )}
                    >
                      {label}
                    </span>
                    {query.isLoading ? (
                      <span className="h-4 w-10 animate-pulse rounded bg-slate-200" />
                    ) : (
                      <TimesheetStatusBadge status={weekStatus} />
                    )}
                  </div>
                  <span
                    className={cn(
                      'ml-2 shrink-0 text-xs font-medium',
                      isCurrentWeek ? 'text-red-700' : 'text-slate-500',
                    )}
                  >
                    {query.isLoading ? '…' : `${totalHours.toFixed(1)}h`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
