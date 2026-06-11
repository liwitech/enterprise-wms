import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download, BarChart3, Users, CheckCircle2, XCircle,
  AlertTriangle, Clock, TrendingUp, LayoutList, Target,
  Award, Briefcase,
} from 'lucide-react'
import { projectService } from '@/services/projectService'
import { userService } from '@/services/userService'
import { PageSpinner } from '@/components/ui/Spinner'
import { format, startOfWeek, subWeeks } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '@/services/api'
import { cn } from '@/utils/cn'
import type { ProjectKPIReport, MemberKPIItem, MemberKPIData } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = { PM: 'PM', MEMBER: 'Thành viên', VIEWER: 'Xem' }

function ontimeColor(rate: number | null) {
  if (rate === null) return 'text-slate-400'
  return rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'
}

function OntimeBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-xs text-slate-400 italic">N/A</span>
  const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" style={{ minWidth: 60 }}>
        <div className="h-full rounded-full" style={{ width: `${rate}%`, backgroundColor: color }} />
      </div>
      <span className={cn('text-xs font-semibold tabular-nums shrink-0', ontimeColor(rate))}>
        {rate.toFixed(0)}%
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI gauge (SVG circle)
// ─────────────────────────────────────────────────────────────────────────────

function KPIGauge({ score }: { score: number | null }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const pct = score ?? 0
  const filled = (pct / 100) * circ
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'
  const grade =
    pct >= 90 ? { label: 'Xuất sắc', cls: 'text-emerald-600' }
    : pct >= 80 ? { label: 'Tốt', cls: 'text-emerald-500' }
    : pct >= 70 ? { label: 'Khá', cls: 'text-amber-500' }
    : pct >= 60 ? { label: 'Trung bình', cls: 'text-amber-600' }
    : { label: 'Cần cải thiện', cls: 'text-red-500' }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width={128} height={128} viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="64" cy="64" r={r} fill="none"
            stroke={score === null ? '#e2e8f0' : color}
            strokeWidth="10"
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 64 64)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-slate-800 leading-tight">
            {score !== null ? score.toFixed(0) : '—'}
          </span>
          <span className="text-[11px] text-slate-400">/ 100</span>
        </div>
      </div>
      <span className={cn('text-sm font-semibold', score !== null ? grade.cls : 'text-slate-400')}>
        {score !== null ? grade.label : 'Chưa có dữ liệu'}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI metric card
// ─────────────────────────────────────────────────────────────────────────────

type MetricStatus = 'achieved' | 'near' | 'missed' | 'info'

function metricStatus(actual: number | null, target: number | null, higherBetter: boolean): MetricStatus {
  if (target === null || actual === null) return 'info'
  if (higherBetter) {
    if (actual >= target) return 'achieved'
    if (actual >= target * 0.75) return 'near'
    return 'missed'
  } else {
    if (actual <= target) return 'achieved'
    if (actual <= target + 2) return 'near'
    return 'missed'
  }
}

const STATUS_CONFIG: Record<MetricStatus, { label: string; cls: string; barColor: string }> = {
  achieved: { label: 'Đạt chỉ tiêu', cls: 'bg-emerald-100 text-emerald-700', barColor: '#10b981' },
  near:     { label: 'Gần đạt',      cls: 'bg-amber-100 text-amber-700',    barColor: '#f59e0b' },
  missed:   { label: 'Chưa đạt',     cls: 'bg-red-100 text-red-700',        barColor: '#ef4444' },
  info:     { label: 'Thông tin',    cls: 'bg-slate-100 text-slate-500',    barColor: '#94a3b8' },
}

function MetricCard({
  icon: Icon, label, desc, actual, target, unit, higherBetter, barMax,
}: {
  icon: React.ElementType
  label: string
  desc?: string
  actual: number | null
  target: number | null
  unit: string
  higherBetter: boolean
  barMax?: number
}) {
  const status = metricStatus(actual, target, higherBetter)
  const cfg = STATUS_CONFIG[status]

  const barPct = actual === null ? 0
    : target === null ? 0
    : higherBetter
      ? Math.min(100, (actual / Math.max(target, 1)) * 100)
      : Math.max(0, 100 - (actual / Math.max(barMax ?? 5, 1)) * 100)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'rounded-lg p-2 shrink-0',
            status === 'achieved' ? 'bg-emerald-50 text-emerald-600'
            : status === 'near' ? 'bg-amber-50 text-amber-600'
            : status === 'missed' ? 'bg-red-50 text-red-500'
            : 'bg-slate-100 text-slate-500',
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 leading-tight">{label}</p>
            {desc && <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>}
          </div>
        </div>
        {status !== 'info' && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0', cfg.cls)}>
            {cfg.label}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-2xl font-extrabold text-slate-800 leading-none">
            {actual !== null ? (Number.isInteger(actual) ? actual : actual.toFixed(1)) : '—'}
          </span>
          <span className="text-sm text-slate-400 ml-1">{unit}</span>
        </div>
        {target !== null && (
          <div className="text-right">
            <p className="text-[11px] text-slate-400">Chỉ tiêu</p>
            <p className="text-sm font-semibold text-slate-600">
              {higherBetter ? '≥' : '≤'} {target}{unit}
            </p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {target !== null && (
        <div className="space-y-1">
          <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barPct}%`, backgroundColor: cfg.barColor }}
            />
            {/* Target marker */}
            {higherBetter && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60"
                style={{ left: `${Math.min(100, (target / Math.max(target * 1.25, 1)) * 100)}%` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Member KPI Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function MemberKPIDashboard({ data }: { data: MemberKPIData }) {
  const s = data.summary
  const initials = data.full_name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div className="space-y-5">
      {/* Header: employee info + overall score */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-base leading-tight">{data.full_name}</h2>
            <p className="text-slate-300 text-xs">{data.email}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-slate-400 text-[11px] mb-0.5">Cập nhật</p>
            <p className="text-slate-200 text-xs font-medium">
              {format(new Date(data.as_of), 'dd/MM/yyyy')}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col sm:flex-row items-center gap-6">
          {/* Gauge */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Điểm KPI tổng hợp</p>
            <KPIGauge score={data.kpi_score} />
            <p className="text-[11px] text-slate-400 text-center mt-1">
              Tính từ tỷ lệ đúng hạn (60%) +<br />tỷ lệ hoàn thành (40%) − phạt quá hạn
            </p>
          </div>

          {/* Quick stats */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
            {[
              { label: 'Được giao', value: s.tasks_assigned, icon: Briefcase, cls: 'text-slate-700' },
              { label: 'Hoàn thành', value: s.tasks_done, icon: CheckCircle2, cls: 'text-emerald-600' },
              { label: 'Đang làm', value: s.tasks_in_progress, icon: TrendingUp, cls: 'text-blue-600' },
              { label: 'Chờ xử lý', value: s.tasks_todo, icon: LayoutList, cls: 'text-slate-500' },
              { label: 'Đang quá hạn', value: s.tasks_overdue, icon: AlertTriangle, cls: s.tasks_overdue > 0 ? 'text-red-600' : 'text-slate-400' },
              { label: 'Giờ thực tế', value: `${s.total_actual_hours.toFixed(1)}h`, icon: Clock, cls: 'text-indigo-600' },
            ].map(({ label, value, icon: Ico, cls }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <Ico className={cn('h-4 w-4 shrink-0', cls)} />
                <div>
                  <p className="text-[11px] text-slate-400 leading-tight">{label}</p>
                  <p className={cn('text-sm font-bold leading-tight', cls)}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI metric cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
          <Target className="h-4 w-4 text-red-600" />
          Chi tiết chỉ tiêu KPI
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            icon={CheckCircle2}
            label="Tỷ lệ hoàn thành đúng hạn"
            desc={`Trong ${s.tasks_done_ontime + s.tasks_done_overdue} CV có deadline`}
            actual={s.ontime_rate}
            target={80}
            unit="%"
            higherBetter
          />
          <MetricCard
            icon={TrendingUp}
            label="Tỷ lệ hoàn thành công việc"
            desc={`${s.tasks_done} / ${s.tasks_assigned} CV hoàn thành`}
            actual={s.completion_rate}
            target={70}
            unit="%"
            higherBetter
          />
          <MetricCard
            icon={AlertTriangle}
            label="Công việc đang quá hạn"
            desc="CV chưa hoàn thành, đã quá deadline"
            actual={s.tasks_overdue}
            target={0}
            unit=" CV"
            higherBetter={false}
            barMax={10}
          />
          <MetricCard
            icon={Clock}
            label="Giờ công thực hiện"
            desc={s.total_estimated_hours > 0 ? `/ ${s.total_estimated_hours.toFixed(1)}h ước tính` : 'Tổng giờ đã ghi nhận'}
            actual={s.total_actual_hours}
            target={null}
            unit="h"
            higherBetter
          />
        </div>
      </div>

      {/* Project breakdown */}
      {data.projects.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-red-600" />
            Chi tiết theo dự án
          </h3>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Dự án</th>
                    <th className="px-3 py-3 text-center font-medium text-slate-600 whitespace-nowrap">Được giao</th>
                    <th className="px-3 py-3 text-center font-medium text-slate-600 whitespace-nowrap">
                      <span className="flex items-center gap-1 justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Đúng hạn
                      </span>
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-slate-600 whitespace-nowrap">
                      <span className="flex items-center gap-1 justify-center">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />Trễ hạn
                      </span>
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-slate-600 whitespace-nowrap">
                      <span className="flex items-center gap-1 justify-center">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Quá hạn
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap" style={{ minWidth: 130 }}>Tỷ lệ đúng hạn</th>
                    <th className="px-3 py-3 text-right font-medium text-slate-600 whitespace-nowrap">Giờ thực tế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.projects.map((p) => (
                    <tr key={p.project_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{p.project_name}</td>
                      <td className="px-3 py-3 text-center text-slate-600">{p.tasks_assigned}</td>
                      <td className="px-3 py-3 text-center font-semibold text-emerald-600">{p.tasks_done_ontime}</td>
                      <td className="px-3 py-3 text-center font-semibold text-red-600">{p.tasks_done_overdue}</td>
                      <td className="px-3 py-3 text-center">
                        {p.tasks_overdue > 0
                          ? <span className="font-semibold text-amber-600">{p.tasks_overdue}</span>
                          : <span className="text-slate-300">0</span>}
                      </td>
                      <td className="px-4 py-3"><OntimeBar rate={p.ontime_rate} /></td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">{p.total_actual_hours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 px-1">
        * Điểm KPI = (Tỷ lệ đúng hạn × 60% + Tỷ lệ hoàn thành × 40%) − phạt (5đ/CV quá hạn, tối đa 20đ).
        Không tính CV không có deadline vào tỷ lệ đúng hạn.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Tab  (By project + By employee sub-modes)
// ─────────────────────────────────────────────────────────────────────────────

function MemberKPIRow({ member: m }: { member: MemberKPIItem }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-800">{m.full_name}</p>
        <p className="text-xs text-gray-400">{m.email}</p>
      </td>
      <td className="px-3 py-3 text-center">
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-medium',
          m.role === 'PM' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600',
        )}>
          {ROLE_LABEL[m.role] ?? m.role}
        </span>
      </td>
      <td className="px-3 py-3 text-center font-semibold text-gray-700">{m.tasks_assigned}</td>
      <td className="px-3 py-3 text-center">
        <span className="font-semibold text-emerald-600">{m.tasks_done_ontime}</span>
        {m.tasks_done_no_deadline > 0 && (
          <span className="ml-1 text-[11px] text-slate-400">+{m.tasks_done_no_deadline}*</span>
        )}
      </td>
      <td className="px-3 py-3 text-center font-semibold text-red-600">{m.tasks_done_overdue}</td>
      <td className="px-3 py-3 text-center">
        {m.tasks_overdue > 0
          ? <span className="font-semibold text-amber-600">{m.tasks_overdue}</span>
          : <span className="text-slate-300">0</span>}
      </td>
      <td className="px-3 py-3 text-center font-semibold text-blue-600">{m.tasks_in_progress}</td>
      <td className="px-4 py-3"><OntimeBar rate={m.ontime_rate} /></td>
      <td className="px-3 py-3 text-right font-semibold text-gray-700">{m.total_actual_hours.toFixed(1)}h</td>
      <td className="px-3 py-3 text-right text-slate-500">
        {m.total_estimated_hours > 0 ? `${m.total_estimated_hours.toFixed(1)}h` : '—'}
      </td>
    </tr>
  )
}

function ProjectKPIView({ projects }: { projects: { id: string; name: string }[] }) {
  const [kpiProjectId, setKpiProjectId] = useState(projects[0]?.id ?? '')

  const { data: kpiResp, isLoading } = useQuery({
    queryKey: ['project-kpi', kpiProjectId],
    queryFn: async () => {
      const res = await api.get('/api/reports/project-kpi', { params: { project_id: kpiProjectId } })
      return res.data.data as ProjectKPIReport
    },
    enabled: !!kpiProjectId,
  })

  const report = kpiResp
  const totals = report?.members.reduce(
    (acc, m) => ({
      assigned: acc.assigned + m.tasks_assigned,
      ontime: acc.ontime + m.tasks_done_ontime,
      overdue_done: acc.overdue_done + m.tasks_done_overdue,
      overdue_open: acc.overdue_open + m.tasks_overdue,
      actual_hours: acc.actual_hours + m.total_actual_hours,
      estimated_hours: acc.estimated_hours + m.total_estimated_hours,
    }),
    { assigned: 0, ontime: 0, overdue_done: 0, overdue_open: 0, actual_hours: 0, estimated_hours: 0 },
  )
  const projectOntime =
    totals && totals.ontime + totals.overdue_done > 0
      ? Math.round((totals.ontime / (totals.ontime + totals.overdue_done)) * 100)
      : null

  const hoursChartData = report?.members.map((m) => ({
    name: m.full_name.split(' ').slice(-1)[0],
    'Thực tế': m.total_actual_hours,
    'Ước tính': m.total_estimated_hours,
  })) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Dự án</label>
          <select
            value={kpiProjectId}
            onChange={(e) => setKpiProjectId(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500"
          >
            <option value="">— Chọn dự án —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {report && <p className="text-xs text-slate-400 pb-2">Cập nhật đến: {format(new Date(report.as_of), 'dd/MM/yyyy')}</p>}
      </div>

      {isLoading && <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500 border-t-transparent" /></div>}

      {report && !isLoading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: LayoutList, label: 'Tổng công việc', value: totals?.assigned ?? 0, color: 'bg-slate-100 text-slate-600' },
              {
                icon: TrendingUp,
                label: 'Tỷ lệ đúng hạn (toàn DA)',
                value: projectOntime !== null ? `${projectOntime}%` : 'N/A',
                sub: `${totals?.ontime ?? 0} / ${(totals?.ontime ?? 0) + (totals?.overdue_done ?? 0)} CV`,
                color: projectOntime === null ? 'bg-slate-100 text-slate-500'
                  : projectOntime >= 80 ? 'bg-emerald-100 text-emerald-700'
                  : projectOntime >= 50 ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-600',
              },
              {
                icon: AlertTriangle, label: 'CV đang quá hạn',
                value: totals?.overdue_open ?? 0,
                color: (totals?.overdue_open ?? 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500',
              },
              {
                icon: Clock, label: 'Giờ thực hiện / Ước tính',
                value: `${totals?.actual_hours.toFixed(1) ?? 0}h`,
                sub: `/ ${totals?.estimated_hours.toFixed(1) ?? 0}h ước tính`,
                color: 'bg-blue-50 text-blue-600',
              },
            ].map(({ icon: Icon, label, value, sub, color }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
                <div className={cn('rounded-lg p-2.5', color)}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 truncate">{label}</p>
                  <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
                  {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
                </div>
              </div>
            ))}
          </div>

          {hoursChartData.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800 text-sm">
                <BarChart3 className="h-4 w-4 text-red-600" />
                Giờ công theo nhân sự — {report.project_name}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hoursChartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="h" />
                  <Tooltip formatter={(v: number, name: string) => [`${v.toFixed(1)}h`, name]} labelStyle={{ fontWeight: 600 }} />
                  <Bar dataKey="Thực tế" fill="#dc2626" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Ước tính" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="border-b border-gray-100 bg-slate-50 px-5 py-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h3 className="font-semibold text-gray-800 text-sm">KPI nhân sự — {report.project_name}</h3>
            </div>
            {report.members.length === 0
              ? <div className="py-12 text-center text-gray-400 text-sm">Dự án chưa có thành viên</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Nhân sự</th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600">Vai trò</th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600">Được giao</th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap"><span className="flex items-center gap-1 justify-center"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Đúng hạn</span></th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap"><span className="flex items-center gap-1 justify-center"><XCircle className="h-3.5 w-3.5 text-red-500" />Trễ hạn</span></th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap"><span className="flex items-center gap-1 justify-center"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Quá hạn</span></th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap"><span className="flex items-center gap-1 justify-center"><Clock className="h-3.5 w-3.5 text-blue-500" />Đang làm</span></th>
                        <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap" style={{ minWidth: 140 }}>Tỷ lệ đúng hạn</th>
                        <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Giờ thực tế</th>
                        <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Giờ ước tính</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.members.map((m) => <MemberKPIRow key={m.user_id} member={m} />)}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
          <p className="text-xs text-slate-400 px-1">
            * Tỷ lệ đúng hạn = Hoàn thành đúng hạn / (Hoàn thành đúng hạn + Hoàn thành trễ).
            Số kèm * là CV hoàn thành không có deadline.
          </p>
        </>
      )}
    </div>
  )
}

function MemberKPIView({ projects }: { projects: { id: string; name: string }[] }) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [filterProjectId, setFilterProjectId] = useState('')

  const { data: users = [] } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => userService.listOrgUsers(),
  })

  const { data: kpiResp, isLoading } = useQuery({
    queryKey: ['member-kpi', selectedUserId, filterProjectId],
    queryFn: async () => {
      const res = await api.get('/api/reports/member-kpi', {
        params: { user_id: selectedUserId, project_id: filterProjectId || undefined },
      })
      return res.data.data as MemberKPIData
    },
    enabled: !!selectedUserId,
  })

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Nhân sự</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500 min-w-[200px]"
          >
            <option value="">— Chọn nhân sự —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Lọc theo dự án (tùy chọn)</label>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500 min-w-[180px]"
          >
            <option value="">Tất cả dự án</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <Award className="h-12 w-12 opacity-30" />
          <p className="text-sm">Chọn nhân sự để xem bảng KPI cá nhân</p>
        </div>
      )}

      {selectedUserId && isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        </div>
      )}

      {kpiResp && !isLoading && <MemberKPIDashboard data={kpiResp} />}
    </div>
  )
}

function KPITab({ projects }: { projects: { id: string; name: string }[] }) {
  const [kpiMode, setKpiMode] = useState<'project' | 'member'>('project')

  return (
    <div className="space-y-4">
      {/* Sub-mode toggle */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 gap-1">
        {([
          { id: 'project', label: 'Theo dự án', icon: Briefcase },
          { id: 'member', label: 'Theo nhân sự', icon: Award },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setKpiMode(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all',
              kpiMode === id
                ? 'bg-white text-red-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {kpiMode === 'project' && <ProjectKPIView projects={projects} />}
      {kpiMode === 'member' && <MemberKPIView projects={projects} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Timesheet tab
// ─────────────────────────────────────────────────────────────────────────────

function TimesheetTab({ projects }: { projects: { id: string; name: string }[] }) {
  const today = new Date()
  const [weekStart, setWeekStart] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [projectId, setProjectId] = useState('')

  const { data: summaryResp, isLoading } = useQuery({
    queryKey: ['weekly-summary', weekStart],
    queryFn: async () => {
      const res = await api.get('/api/reports/timesheet/weekly-summary', { params: { week_start: weekStart, per_page: 100 } })
      return res.data
    },
  })

  const { data: reportResp } = useQuery({
    queryKey: ['report', weekStart, projectId],
    queryFn: async () => {
      const res = await api.get('/api/reports/timesheet', {
        params: { week_start: weekStart, project_id: projectId || undefined, format: 'json' },
      })
      return res.data
    },
  })

  const handleDownloadCsv = async () => {
    const res = await api.get('/api/reports/timesheet', {
      params: { week_start: weekStart, project_id: projectId || undefined, format: 'csv' },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = `timesheet_${weekStart}.csv`; a.click()
    window.URL.revokeObjectURL(url)
  }

  const summaries = summaryResp?.data ?? []
  const reportEntries = reportResp?.data ?? []
  const chartData = summaries.reduce((acc: Record<string, number>, s: any) => {
    const name = s.user?.full_name ?? '?'
    acc[name] = (acc[name] ?? 0) + Number(s.total_hours)
    return acc
  }, {} as Record<string, number>)
  const barData = Object.entries(chartData).map(([name, hours]) => ({ name, hours }))
  const weekOptions = Array.from({ length: 8 }, (_, i) => {
    const d = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 })
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM/yyyy') }
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Tuần</label>
          <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500">
            {weekOptions.map((w) => <option key={w.value} value={w.value}>Tuần từ {w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Dự án</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500">
            <option value="">Tất cả dự án</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button onClick={handleDownloadCsv}
          className="ml-auto flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Download className="h-4 w-4" />Tải về CSV
        </button>
      </div>

      {barData.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
            <BarChart3 className="h-4 w-4 text-red-600" />
            Giờ công theo nhân viên (tuần từ {weekStart})
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="h" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}h`, 'Giờ công']} labelStyle={{ fontWeight: 600 }} />
              <Bar dataKey="hours" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="font-semibold text-gray-800">Chi tiết chấm công ({reportEntries.length} mục)</h3>
        </div>
        {reportEntries.length === 0
          ? <div className="py-12 text-center text-gray-400">Không có dữ liệu trong khoảng thời gian này</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Nhân viên</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Dự án</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Giờ</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Mô tả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportEntries.map((e: any) => (
                    <tr key={e.entry_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><p className="font-medium text-gray-800">{e.user_name}</p><p className="text-xs text-gray-400">{e.user_email}</p></td>
                      <td className="px-4 py-3 text-gray-600">{e.project_name}</td>
                      <td className="px-4 py-3 text-gray-600">{e.work_date}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{e.hours_logged}h</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                          : e.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700'
                          : e.status === 'REJECTED' ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {e.status === 'APPROVED' ? 'Đã duyệt' : e.status === 'SUBMITTED' ? 'Đã nộp' : e.status === 'REJECTED' ? 'Đã từ chối' : 'Nháp'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{e.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page root
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'timesheet' | 'kpi'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'timesheet', label: 'Báo cáo chấm công', icon: BarChart3 },
  { id: 'kpi', label: 'KPI nhân sự', icon: TrendingUp },
]

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('timesheet')

  const { data: projectsResp } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectService.list({ per_page: 100 }),
  })
  const projects = (projectsResp?.data ?? []).map((p) => ({ id: p.id, name: p.name }))

  return (
    <div className="space-y-5">
      <div className="flex gap-0 border-b border-gray-200 -mb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === id
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'timesheet' && <TimesheetTab projects={projects} />}
      {activeTab === 'kpi' && <KPITab projects={projects} />}
    </div>
  )
}
