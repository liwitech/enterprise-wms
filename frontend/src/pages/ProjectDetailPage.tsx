import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Users, Zap, CheckSquare, TrendingUp, Flag, AlertTriangle } from 'lucide-react'
import { projectService } from '@/services/projectService'
import { taskService } from '@/services/taskService'
import { ProjectStatusBadge, PriorityBadge, TaskStatusBadge, SprintStatusBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'

type Tab = 'tong-quan' | 'cong-viec' | 'sprint' | 'thanh-vien'

const TAB_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'tong-quan', label: 'Tổng quan', icon: TrendingUp },
  { id: 'cong-viec', label: 'Công việc', icon: CheckSquare },
  { id: 'sprint', label: 'Sprint', icon: Zap },
  { id: 'thanh-vien', label: 'Thành viên', icon: Users },
]

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('tong-quan')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectService.get(id!),
    enabled: !!id,
  })

  const { data: dashboard } = useQuery({
    queryKey: ['project-dashboard', id],
    queryFn: () => projectService.getDashboard(id!),
    enabled: !!id && tab === 'tong-quan',
    staleTime: 60_000,
  })

  const { data: tasksResp } = useQuery({
    queryKey: ['tasks', 'project', id],
    queryFn: () => taskService.list({ project_id: id, per_page: 50 }),
    enabled: !!id && tab === 'cong-viec',
  })

  const { data: sprints } = useQuery({
    queryKey: ['sprints', id],
    queryFn: () => projectService.listSprints(id!),
    enabled: !!id && tab === 'sprint',
  })

  if (isLoading || !project) return <PageSpinner />

  const statusOrder: Record<string, number> = { TODO: 0, IN_PROGRESS: 1, IN_REVIEW: 2, DONE: 3, CANCELLED: 4 }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/projects" className="flex items-center gap-1 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Dự án
        </Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">{project.name}</h2>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">
                {project.code}
              </span>
            </div>
            {project.description && (
              <p className="mt-1 text-sm text-gray-500">{project.description}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <ProjectStatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span>Tiến độ: <strong>{project.progress_percent.toFixed(0)}%</strong></span>
            </div>
            <div className="mt-1 h-2 w-40 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${project.progress_percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TAB_ITEMS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === tabId
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'tong-quan' && dashboard && (
        <div className="space-y-4">
          {/* Task summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { key: 'TODO', label: 'Cần làm', color: 'bg-gray-100 text-gray-700' },
              { key: 'IN_PROGRESS', label: 'Đang làm', color: 'bg-blue-100 text-blue-700' },
              { key: 'IN_REVIEW', label: 'Xem xét', color: 'bg-yellow-100 text-yellow-700' },
              { key: 'DONE', label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
              { key: 'CANCELLED', label: 'Đã hủy', color: 'bg-red-100 text-red-700' },
            ].map(({ key, label, color }) => (
              <div key={key} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{dashboard.tasks_by_status[key] ?? 0}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Overdue */}
            {dashboard.overdue_count > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">
                  Có <strong>{dashboard.overdue_count}</strong> công việc quá hạn trong dự án này.
                </p>
              </div>
            )}

            {/* Upcoming milestones */}
            {dashboard.upcoming_milestones.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Flag className="h-4 w-4 text-orange-500" />
                  Cột mốc sắp tới
                </h4>
                <div className="space-y-2">
                  {dashboard.upcoming_milestones.slice(0, 3).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{m.title}</span>
                      {m.due_date && (
                        <span className="text-xs text-gray-400">
                          {format(new Date(m.due_date), 'dd/MM/yyyy')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Member workload */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-800">Khối lượng công việc</h4>
              <div className="space-y-2">
                {dashboard.member_workload.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{m.full_name}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {m.task_count} công việc
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'cong-viec' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {!tasksResp?.data?.length ? (
            <div className="py-12 text-center text-gray-400">Chưa có công việc nào trong dự án này</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tiêu đề</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Độ ưu tiên</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày hết hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...(tasksResp?.data ?? [])]
                  .sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99))
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{t.title}</td>
                      <td className="px-4 py-3">
                        <TaskStatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {t.due_date ? format(new Date(t.due_date), 'dd/MM/yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'sprint' && (
        <div className="space-y-3">
          {!sprints?.length ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
              Chưa có sprint nào
            </div>
          ) : (
            sprints.map((s) => (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    {s.goal && <p className="text-sm text-gray-500">{s.goal}</p>}
                  </div>
                  <SprintStatusBadge status={s.status} />
                </div>
                {(s.start_date || s.end_date) && (
                  <p className="mt-2 text-xs text-gray-400">
                    {s.start_date && format(new Date(s.start_date), 'dd/MM/yyyy')}
                    {s.start_date && s.end_date && ' – '}
                    {s.end_date && format(new Date(s.end_date), 'dd/MM/yyyy')}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'thanh-vien' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {!project.members?.length ? (
            <div className="py-12 text-center text-gray-400">Chưa có thành viên nào</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tên</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Vai trò</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {project.members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {m.user?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.user?.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {m.role === 'PM' ? 'Quản lý dự án' : m.role === 'MEMBER' ? 'Thành viên' : 'Người xem'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
