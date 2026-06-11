import { useQuery } from '@tanstack/react-query'
import { FolderKanban, CheckSquare, AlertTriangle, Clock, TrendingUp } from 'lucide-react'
import { projectService } from '@/services/projectService'
import { taskService } from '@/services/taskService'
import { timesheetService } from '@/services/timesheetService'
import { useAuthStore } from '@/stores/authStore'
import { ProjectStatusBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const today = new Date()

  const { data: projectsResp, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects', 'dashboard'],
    queryFn: () => projectService.list({ per_page: 5, sort: 'created_at' }),
  })

  const { data: myTasksResp, isLoading: loadingTasks } = useQuery({
    queryKey: ['tasks', 'my', user?.id],
    queryFn: () =>
      taskService.list({ assignee_user_id: user?.id, per_page: 100 }),
    enabled: !!user?.id,
  })

  const { data: overdueResp } = useQuery({
    queryKey: ['tasks', 'overdue', user?.id],
    queryFn: () =>
      taskService.list({ assignee_user_id: user?.id, is_overdue: true, per_page: 100 }),
    enabled: !!user?.id,
  })

  const { data: summary } = useQuery({
    queryKey: ['timesheet', 'summary', today.getFullYear(), today.getMonth() + 1],
    queryFn: () => timesheetService.getSummary(today.getFullYear(), today.getMonth() + 1),
    enabled: !!user?.id,
  })

  const projects = projectsResp?.data ?? []
  const tasks = myTasksResp?.data ?? []
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const overdueTasks = overdueResp?.meta?.total ?? 0
  const totalHours = summary?.by_project.reduce((s, p) => s + Number(p.total_hours), 0) ?? 0

  if (loadingProjects && loadingTasks) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">
          Xin chào, {user?.full_name} 👋
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {format(today, "EEEE, dd MMMM yyyy", { locale: vi })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={FolderKanban}
          label="Tổng dự án"
          value={projectsResp?.meta?.total ?? 0}
          color="bg-red-600"
        />
        <StatCard
          icon={CheckSquare}
          label="Đang thực hiện"
          value={inProgressTasks}
          color="bg-red-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Công việc quá hạn"
          value={overdueTasks}
          color="bg-red-500"
        />
        <StatCard
          icon={Clock}
          label="Giờ công tháng này"
          value={`${totalHours.toFixed(1)}h`}
          color="bg-green-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent projects */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-800">Dự án gần đây</h3>
            <Link to="/projects" className="text-sm text-red-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {projects.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Chưa có dự án nào</p>
            ) : (
              projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.code}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex sm:items-center sm:gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {p.progress_percent.toFixed(0)}%
                      </span>
                    </div>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* My tasks */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-800">Công việc của tôi</h3>
            <Link to="/tasks" className="text-sm text-red-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Không có công việc nào</p>
            ) : (
              tasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <p className="flex-1 truncate pr-3 text-sm text-gray-800">{t.title}</p>
                  <div className="flex items-center gap-2">
                    {t.due_date && (
                      <span className="text-xs text-gray-400">
                        {format(new Date(t.due_date), 'dd/MM')}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.status === 'DONE'
                          ? 'bg-green-100 text-green-700'
                          : t.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t.status === 'TODO'
                        ? 'Cần làm'
                        : t.status === 'IN_PROGRESS'
                        ? 'Đang làm'
                        : t.status === 'IN_REVIEW'
                        ? 'Xem xét'
                        : t.status === 'DONE'
                        ? 'Hoàn thành'
                        : 'Đã hủy'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
