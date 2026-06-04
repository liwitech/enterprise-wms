import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { CheckSquare, Clock, AlertTriangle, CalendarClock, Flag } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ProjectDashboard, ProjectDetail, Milestone } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#6366f1',
  IN_REVIEW: '#f59e0b',
  DONE: '#10b981',
  CANCELLED: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  IN_REVIEW: 'Xem xét',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const MILESTONE_STYLE: Record<string, { cls: string; label: string }> = {
  ACHIEVED: { cls: 'bg-emerald-100 text-emerald-700', label: 'Đạt được' },
  PENDING: { cls: 'bg-amber-100 text-amber-700', label: 'Đang chờ' },
  MISSED: { cls: 'bg-red-100 text-red-700', label: 'Bỏ lỡ' },
}

function MetricCard({
  icon: Icon, label, value, sub, color,
}: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={cn('rounded-xl p-3', color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
}

interface Props {
  project: ProjectDetail
  dashboard: ProjectDashboard | undefined
  isLoading: boolean
}

export default function OverviewTab({ project, dashboard, isLoading }: Props) {
  const today = new Date()
  const daysRemaining = project.end_date
    ? Math.ceil((new Date(project.end_date).getTime() - today.getTime()) / 86_400_000)
    : null

  const tasksByStatus = dashboard?.tasks_by_status ?? {}
  const totalTasks = Object.values(tasksByStatus).reduce((s, v) => s + (v ?? 0), 0)
  const doneTasks = tasksByStatus.DONE ?? 0

  const chartData = Object.entries(tasksByStatus)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: STATUS_LABELS[k] ?? k, value: v, color: STATUS_COLORS[k] ?? '#94a3b8' }))

  return (
    <div className="space-y-6">
      {/* Metric mini-cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              icon={CheckSquare}
              label="Công việc xong"
              value={`${doneTasks}/${totalTasks}`}
              sub={totalTasks > 0 ? `${((doneTasks / totalTasks) * 100).toFixed(0)}% hoàn thành` : undefined}
              color="bg-emerald-500"
            />
            <MetricCard
              icon={AlertTriangle}
              label="Công việc quá hạn"
              value={dashboard?.overdue_count ?? 0}
              color={(dashboard?.overdue_count ?? 0) > 0 ? 'bg-red-500' : 'bg-slate-400'}
            />
            <MetricCard
              icon={Clock}
              label="Giờ đã ghi nhận"
              value={`${(project as any).actual_hours?.toFixed(1) ?? 0}h`}
              color="bg-indigo-500"
            />
            <MetricCard
              icon={CalendarClock}
              label="Ngày còn lại"
              value={daysRemaining !== null ? Math.max(daysRemaining, 0) : '—'}
              sub={daysRemaining !== null && daysRemaining < 0 ? `Quá hạn ${Math.abs(daysRemaining)} ngày` : undefined}
              color={daysRemaining !== null && daysRemaining < 0 ? 'bg-red-500' : 'bg-blue-500'}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Donut chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-semibold text-slate-700">Phân bổ công việc theo trạng thái</h4>
          {isLoading ? (
            <div className="mx-auto h-48 w-48 animate-pulse rounded-full bg-slate-100" />
          ) : chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">
              Chưa có công việc nào
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Milestones */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Flag className="h-4 w-4 text-orange-500" />
            Cột mốc dự án
          </h4>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : !project.milestones?.length ? (
            <p className="text-sm text-slate-400">Chưa có cột mốc nào</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {[...project.milestones]
                .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
                .map(m => <MilestoneRow key={m.id} milestone={m} />)}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="mb-4 text-sm font-semibold text-slate-700">Hoạt động gần đây</h4>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : !dashboard?.recent_activities?.length ? (
          <p className="text-sm text-slate-400">Chưa có hoạt động nào được ghi nhận</p>
        ) : (
          <ul className="space-y-3">
            {dashboard.recent_activities.slice(0, 10).map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <div className="flex-1">
                  <span className="text-slate-700">{a.message}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {format(new Date(a.timestamp), 'dd/MM HH:mm', { locale: vi })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function MilestoneRow({ milestone: m }: { milestone: Milestone }) {
  const style = MILESTONE_STYLE[m.status] ?? { cls: 'bg-gray-100 text-gray-600', label: m.status }
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-700 font-medium">{m.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        {m.due_date && (
          <span className="text-xs text-slate-400">
            {format(new Date(m.due_date), 'dd/MM/yyyy')}
          </span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', style.cls)}>
          {style.label}
        </span>
      </div>
    </div>
  )
}
