import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  FolderKanban,
  Info,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { dashboardService } from '@/services/dashboardService'
import { departmentService } from '@/services/departmentService'
import { useAuthStore } from '@/stores/authStore'
import type { DashboardAlert, DashboardProjectBrief, ProjectHealth, WorkloadItem } from '@/types'

// ── Health Badge ──────────────────────────────────────────────────────────────

const HEALTH_MAP: Record<ProjectHealth, { label: string; cls: string }> = {
  ON_TRACK: { label: 'Đúng tiến độ', cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
  AT_RISK: { label: 'Có rủi ro', cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
  OVERDUE: { label: 'Quá hạn', cls: 'bg-red-100 text-red-700 ring-1 ring-red-200' },
}

function HealthBadge({ health }: { health: ProjectHealth }) {
  const { label, cls } = HEALTH_MAP[health] ?? { label: health, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', cls)}>
      {label}
    </span>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ percent, colorByHealth = false }: { percent: number; colorByHealth?: boolean }) {
  let barCls = 'bg-red-500'
  if (colorByHealth) {
    if (percent < 50) barCls = 'bg-red-500'
    else if (percent < 80) barCls = 'bg-amber-500'
    else barCls = 'bg-emerald-500'
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full min-w-[80px] rounded-full bg-slate-100">
        <div
          className={cn('h-1.5 rounded-full transition-all duration-300', barCls)}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-medium text-slate-500">
        {percent.toFixed(0)}%
      </span>
    </div>
  )
}

// ── Workload Bar ──────────────────────────────────────────────────────────────

function WorkloadBar({ item }: { item: WorkloadItem }) {
  const overloaded = item.capacity_percent > 85
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="max-w-[160px] truncate font-medium text-slate-700">{item.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {item.tasks_overdue > 0 && (
            <span className="text-xs font-medium text-red-500">
              {item.tasks_overdue} quá hạn
            </span>
          )}
          <span className={cn('text-xs font-semibold', overloaded ? 'text-red-600' : 'text-slate-500')}>
            {item.tasks_assigned} tasks · {item.capacity_percent.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div
          className={cn('h-2 rounded-full transition-all duration-300', overloaded ? 'bg-red-500' : 'bg-red-400')}
          style={{ width: `${Math.min(item.capacity_percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ── Alert Panel ───────────────────────────────────────────────────────────────

const ALERT_ICON_MAP = {
  OVERDUE: { Icon: AlertTriangle, cls: 'text-red-500' },
  DELAYED: { Icon: AlertCircle, cls: 'text-amber-500' },
  UNASSIGNED_TASKS: { Icon: Info, cls: 'text-slate-400' },
}

function AlertPanel({ alerts }: { alerts: DashboardAlert[] }) {
  if (!alerts.length) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 text-emerald-600">
        <CheckCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Không có cảnh báo nào</span>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const { Icon, cls } = ALERT_ICON_MAP[a.alert_type] ?? { Icon: AlertCircle, cls: 'text-slate-400' }
        return (
          <li
            key={i}
            className={cn(
              'flex items-start gap-3 rounded-xl p-3',
              a.severity === 'HIGH' ? 'bg-red-50' : 'bg-amber-50/60',
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cls)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700">{a.message}</p>
              <Link
                to={`/projects/${a.project_id}`}
                className="mt-0.5 text-xs font-medium text-red-600 hover:underline"
              >
                Xem dự án →
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sub?: string
  color: string
  alert?: boolean
}

function KpiCard({ icon: Icon, label, value, sub, color, alert }: KpiCardProps) {
  return (
    <div className={cn(
      'rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
      alert ? 'border-red-200' : 'border-slate-200',
    )}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={cn('shrink-0 rounded-2xl p-3.5', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  )
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = 'health' | 'progress_percent' | 'days_remaining'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, active, dir }: { col: string; active: string; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown className="h-3 w-3 text-slate-300" />
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-red-500" />
    : <ChevronDown className="h-3 w-3 text-red-500" />
}

const _HEALTH_ORDER: Record<ProjectHealth, number> = { OVERDUE: 0, AT_RISK: 1, ON_TRACK: 2 }

function sortProjects(projects: DashboardProjectBrief[], key: SortKey, dir: SortDir) {
  return [...projects].sort((a, b) => {
    let diff = 0
    if (key === 'health') diff = _HEALTH_ORDER[a.health] - _HEALTH_ORDER[b.health]
    else if (key === 'progress_percent') diff = a.progress_percent - b.progress_percent
    else if (key === 'days_remaining')
      diff = (a.days_remaining ?? 9999) - (b.days_remaining ?? 9999)
    return dir === 'asc' ? diff : -diff
  })
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [deptId, setDeptId] = useState('')
  const [period, setPeriod] = useState<'current_month' | 'current_quarter'>('current_month')
  const [sortKey, setSortKey] = useState<SortKey>('health')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const isAdmin = user?.role && ['SUPER_ADMIN', 'ADMIN'].includes(user.role)

  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['executive-dashboard', deptId, period],
    queryFn: () => dashboardService.getExecutive({ dept_id: deptId || undefined, period }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  })

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list(),
    enabled: isAdmin === true,
    staleTime: 5 * 60_000,
  })

  const sortedProjects = useMemo(
    () => sortProjects(data?.projects ?? [], sortKey, sortDir),
    [data?.projects, sortKey, sortDir],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const s = data?.summary
  const onTrackPct = s && s.total_projects > 0
    ? ((s.projects_on_track / s.total_projects) * 100).toFixed(0)
    : '—'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-medium text-slate-600">Tổng quan điều hành</span>
      </nav>

      {/* Topbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Tổng quan điều hành
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Cập nhật lúc{' '}
            {dataUpdatedAt
              ? format(new Date(dataUpdatedAt), 'HH:mm:ss', { locale: vi })
              : '—'}
            {isFetching && (
              <span className="ml-2 text-red-500">• đang tải...</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && depts && depts.length > 0 && (
            <select
              value={deptId}
              onChange={e => setDeptId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
            >
              <option value="">Tất cả phòng ban</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as typeof period)}
            className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          >
            <option value="current_month">Tháng này</option>
            <option value="current_quarter">Quý này</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Làm mới
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
          ))
        ) : (
          <>
            <KpiCard
              icon={FolderKanban}
              label="Tổng dự án"
              value={s?.total_projects ?? 0}
              sub={`${s?.projects_on_track ?? 0} đúng tiến độ · ${s?.projects_delayed ?? 0} rủi ro`}
              color="bg-red-600"
            />
            <KpiCard
              icon={TrendingUp}
              label="Tỷ lệ đúng tiến độ"
              value={`${onTrackPct}%`}
              sub={`Mục tiêu: 100%`}
              color="bg-emerald-500"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Dự án quá hạn"
              value={s?.projects_overdue ?? 0}
              sub="Cần xử lý ngay"
              color={(s?.projects_overdue ?? 0) > 0 ? 'bg-red-500' : 'bg-slate-400'}
              alert={(s?.projects_overdue ?? 0) > 0}
            />
            <KpiCard
              icon={CheckSquare}
              label="Công việc đang mở"
              value={s?.total_tasks_open ?? 0}
              sub={`${s?.tasks_due_soon ?? 0} đến hạn trong 7 ngày`}
              color="bg-slate-600"
            />
          </>
        )}
      </div>

      {/* Projects table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800">Danh sách dự án</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {sortedProjects.length}
            </span>
          </div>
          <p className="text-xs text-slate-400">Top 10 theo mức độ ưu tiên</p>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-slate-50/60" />
            ))}
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="py-16 text-center text-slate-400">Không có dự án nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-slate-500">Dự án</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Chủ sở hữu</th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-slate-500"
                    onClick={() => toggleSort('health')}
                  >
                    <span className="flex items-center gap-1">
                      Tình trạng <SortIcon col="health" active={sortKey} dir={sortDir} />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-slate-500"
                    onClick={() => toggleSort('progress_percent')}
                  >
                    <span className="flex items-center gap-1">
                      Tiến độ <SortIcon col="progress_percent" active={sortKey} dir={sortDir} />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-slate-500"
                    onClick={() => toggleSort('days_remaining')}
                  >
                    <span className="flex items-center gap-1">
                      Hạn cuối <SortIcon col="days_remaining" active={sortKey} dir={sortDir} />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">CV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedProjects.map(p => (
                  <ProjectRow key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alerts + Workload */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alert panel */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <h3 className="font-semibold text-slate-800">Cảnh báo</h3>
            {(data?.alerts.length ?? 0) > 0 && (
              <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                {data!.alerts.length}
              </span>
            )}
          </div>
          <div className="min-h-[200px] p-4">
            <AlertPanel alerts={data?.alerts ?? []} />
          </div>
        </div>

        {/* Workload */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Users className="h-4 w-4 text-red-500" />
            <h3 className="font-semibold text-slate-800">Khối lượng công việc</h3>
            <span className="ml-1 text-xs text-slate-400">(Top 10)</span>
            {s?.total_employees_active ? (
              <span className="ml-auto text-xs text-slate-400">
                {s.total_employees_active} nhân viên
              </span>
            ) : null}
          </div>
          <div className="space-y-4 p-5">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                  <div className="h-2 w-full animate-pulse rounded-full bg-slate-100" />
                </div>
              ))
            ) : data?.workload.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Không có dữ liệu</p>
            ) : (
              data?.workload.map(w => <WorkloadBar key={w.user_id} item={w} />)
            )}
          </div>
        </div>
      </div>

      {/* Pending timesheets banner */}
      {(data?.timesheet_pending_count ?? 0) > 0 && (
        <Link
          to="/timesheets/pending"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
        >
          <Clock className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            Có{' '}
            <strong className="font-semibold">{data!.timesheet_pending_count}</strong>{' '}
            bảng chấm công đang chờ duyệt.
          </p>
          <span className="ml-auto shrink-0 text-sm font-semibold text-amber-700">
            Duyệt ngay →
          </span>
        </Link>
      )}
    </div>
  )
}

// ── Project Row (extracted to reduce JSX depth) ───────────────────────────────

function ProjectRow({ project: p, onClick }: { project: DashboardProjectBrief; onClick: () => void }) {
  const overdue = p.days_remaining !== null && p.days_remaining !== undefined && p.days_remaining < 0
  return (
    <tr
      className="group cursor-pointer hover:bg-slate-50/80"
      onClick={onClick}
    >
      <td className="px-5 py-3.5">
        <p className="font-semibold text-slate-800 transition-colors group-hover:text-red-600">
          {p.name}
        </p>
        {p.dept_name && <p className="text-xs text-slate-400">{p.dept_name}</p>}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">
            {p.owner.name.charAt(0).toUpperCase()}
          </div>
          <span className="max-w-[120px] truncate text-slate-600">{p.owner.name}</span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <HealthBadge health={p.health} />
      </td>
      <td className="px-4 py-3.5 min-w-[140px]">
        <ProgressBar percent={p.progress_percent} colorByHealth />
      </td>
      <td className="px-4 py-3.5">
        {p.end_date ? (
          <div>
            <p className="text-slate-700">{format(new Date(p.end_date), 'dd/MM/yyyy')}</p>
            <p className={cn('text-xs', overdue ? 'text-red-500 font-medium' : 'text-slate-400')}>
              {p.days_remaining !== null && p.days_remaining !== undefined
                ? overdue
                  ? `Quá ${Math.abs(p.days_remaining)} ngày`
                  : `Còn ${p.days_remaining} ngày`
                : '—'}
            </p>
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-sm">
        <span className="font-semibold text-slate-800">{p.tasks_done}</span>
        <span className="text-slate-400">/{p.tasks_total}</span>
      </td>
    </tr>
  )
}
