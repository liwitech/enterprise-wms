import { useState } from 'react'
import { Search, LayoutList, LayoutGrid, AlertCircle, Clock, Flag } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'
import { useTasks } from '@/hooks/useTasks'
import { useTaskMutation } from '@/hooks/useTaskMutation'
import { useDebounce } from '@/hooks/useDebounce'
import KanbanBoard from './KanbanBoard'
import type { TaskStatus, Priority, Sprint } from '@/types'

const STATUS_OPTIONS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']
const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  IN_REVIEW: 'Xem xét',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}
const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-600',
}
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-slate-400',
}

interface Props {
  projectId: string
  sprints: Sprint[]
  onTaskClick: (taskId: string) => void
}

export default function TasksTab({ projectId, sprints, onTaskClick }: Props) {
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')
  const [sprintFilter, setSprintFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useTasks({
    project_id: projectId,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    sprint_id: sprintFilter || undefined,
    is_overdue: overdueOnly || undefined,
    per_page: 200,
  })

  const tasks = data?.data ?? []
  const filtered = debouncedSearch
    ? tasks.filter((t) => t.title.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : tasks

  const { updateStatus } = useTaskMutation(projectId)

  const activeSprints = sprints.filter((s) => s.status === 'ACTIVE' || s.status === 'PLANNING')

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm công việc…"
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tất cả ưu tiên</option>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {activeSprints.length > 0 && (
            <select
              value={sprintFilter}
              onChange={(e) => setSprintFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Tất cả sprint</option>
              {activeSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            Quá hạn
          </label>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setView('list')}
            className={cn('px-2.5 py-1.5', view === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50')}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={cn('px-2.5 py-1.5', view === 'kanban' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-400">
        {filtered.length} công việc{filtered.length !== tasks.length ? ` (lọc từ ${tasks.length})` : ''}
      </p>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          Không có công việc nào
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          tasks={filtered}
          onStatusChange={(taskId, status) => updateStatus.mutate({ taskId, status })}
          onTaskClick={onTaskClick}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Tên công việc</th>
                <th className="px-3 py-2.5 text-left font-medium">Trạng thái</th>
                <th className="px-3 py-2.5 text-left font-medium">Ưu tiên</th>
                <th className="px-3 py-2.5 text-left font-medium">Hạn chót</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => {
                const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE'
                return (
                  <tr
                    key={t.id}
                    onClick={() => onTaskClick(t.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isOverdue && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                        <span className="text-slate-800 line-clamp-1">{t.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLOR[t.status])}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {t.priority && (
                        <span className={cn('flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[t.priority])}>
                          <Flag className="h-3 w-3" />
                          {t.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {t.due_date ? (
                        <span className={cn('flex items-center gap-1 text-xs', isOverdue ? 'text-red-500' : 'text-slate-400')}>
                          <Clock className="h-3 w-3" />
                          {format(new Date(t.due_date), 'dd/MM/yyyy')}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
