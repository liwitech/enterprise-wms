import { useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, LayoutDashboard, ListTodo, Flag,
  CalendarDays, Loader2, GanttChart as GanttIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'
import { useProject, useProjectDashboard, useProjectSprints } from '@/hooks/useProject'
import { useAuthStore } from '@/stores/authStore'
import { useTasks } from '@/hooks/useTasks'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import OverviewTab from '@/components/project/OverviewTab'
import TasksTab from '@/components/project/TasksTab'
import MembersTab from '@/components/project/MembersTab'
import GanttChart from '@/components/project/GanttChart'
import TaskDetailDrawer from '@/components/project/TaskDetailDrawer'
import type { ProjectStatus } from '@/types'

const STATUS_COLOR: Record<ProjectStatus, string> = {
  PLANNING: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-600',
}
const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: 'Lên kế hoạch',
  IN_PROGRESS: 'Đang thực hiện',
  ON_HOLD: 'Tạm dừng',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const MILESTONE_STYLE: Record<string, { cls: string; label: string }> = {
  ACHIEVED: { cls: 'bg-emerald-100 text-emerald-700', label: 'Đạt được' },
  PENDING: { cls: 'bg-amber-100 text-amber-700', label: 'Đang chờ' },
  MISSED: { cls: 'bg-red-100 text-red-700', label: 'Bỏ lỡ' },
}

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'tasks', label: 'Công việc', icon: ListTodo },
  { id: 'gantt', label: 'Gantt Chart', icon: GanttIcon },
  { id: 'members', label: 'Thành viên', icon: Users },
  { id: 'milestones', label: 'Cột mốc', icon: Flag },
] as const

type TabId = (typeof TABS)[number]['id']

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-200">
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-red-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 shrink-0">{pct.toFixed(0)}%</span>
    </div>
  )
}

function MilestoneList({ milestones }: { milestones: { id: string; name: string; due_date?: string; status: string }[] }) {
  if (!milestones.length) {
    return <p className="text-sm text-slate-400 py-4">Chưa có cột mốc nào</p>
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            <th className="px-4 py-2.5 text-left font-medium">Tên cột mốc</th>
            <th className="px-3 py-2.5 text-left font-medium">Hạn chót</th>
            <th className="px-3 py-2.5 text-left font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {[...milestones]
            .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
            .map((m) => {
              const style = MILESTONE_STYLE[m.status] ?? { cls: 'bg-gray-100 text-gray-600', label: m.status }
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                  <td className="px-3 py-3 text-slate-500">
                    {m.due_date ? format(new Date(m.due_date), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', style.cls)}>
                      {style.label}
                    </span>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const taskId = searchParams.get('task')

  const { user: currentUser } = useAuthStore()
  const { data: project, isLoading: projectLoading } = useProject(projectId)
  const { data: dashboard, isLoading: dashboardLoading } = useProjectDashboard(projectId)
  const { data: sprints = [] } = useProjectSprints(projectId)
  const { data: allTasksRes } = useTasks({
    project_id: projectId,
    per_page: 500,
    include_subtasks: true,
    enabled: activeTab === 'gantt',
  })
  const allTasks = allTasksRes?.data ?? []

  const canManage =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    (project?.members ?? []).some((m) => m.user_id === currentUser?.id && m.role === 'PM')

  function openTask(id: string) {
    setSearchParams((p) => { p.set('task', id); return p })
  }

  function closeTask() {
    setSearchParams((p) => { p.delete('task'); return p })
  }

  if (projectLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-red-500" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <p className="text-sm">Không tìm thấy dự án.</p>
        <button onClick={() => navigate('/projects')} className="text-sm text-red-600 hover:underline">
          Quay lại danh sách
        </button>
      </div>
    )
  }

  const progress = project.progress_percent ?? 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header panel */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <button
          onClick={() => navigate('/projects')}
          className="mb-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tất cả dự án
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-lg font-bold text-slate-900 truncate">{project.name}</h1>
              {project.code && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-500 shrink-0">
                  {project.code}
                </span>
              )}
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0',
                  STATUS_COLOR[project.status],
                )}
              >
                {STATUS_LABEL[project.status]}
              </span>
            </div>

            {project.description && (
              <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>
            )}

            <div className="flex items-center gap-4 flex-wrap text-xs text-slate-400">
              {project.start_date && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {format(new Date(project.start_date), 'dd/MM/yyyy')}
                  {project.end_date && ` → ${format(new Date(project.end_date), 'dd/MM/yyyy')}`}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {project.members.length} thành viên
              </span>
            </div>
          </div>

          <div className="w-36 shrink-0">
            <p className="text-xs text-slate-500 mb-1.5">Tiến độ</p>
            <ProgressBar value={progress} />
          </div>
        </div>

        {/* Tab nav */}
        <nav className="mt-4 flex gap-0 -mb-px overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === id
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <ErrorBoundary>
          {activeTab === 'overview' && (
            <OverviewTab
              project={project}
              dashboard={dashboard}
              isLoading={dashboardLoading}
            />
          )}
          {activeTab === 'tasks' && (
            <TasksTab
              projectId={project.id}
              sprints={sprints}
              members={project.members}
              canManage={canManage}
              onTaskClick={openTask}
            />
          )}
          {activeTab === 'gantt' && (
            <GanttChart
              tasks={allTasks}
              projectStart={project.start_date}
              projectEnd={project.end_date}
              onTaskClick={openTask}
            />
          )}
          {activeTab === 'members' && <MembersTab project={project} />}
          {activeTab === 'milestones' && <MilestoneList milestones={project.milestones} />}
        </ErrorBoundary>
      </div>

      {/* Task detail drawer */}
      {taskId && projectId && (
        <TaskDetailDrawer
          taskId={taskId}
          projectId={projectId}
          onClose={closeTask}
          onTaskClick={openTask}
        />
      )}
    </div>
  )
}
