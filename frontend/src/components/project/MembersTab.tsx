import { useMemo } from 'react'
import { Users, CheckSquare, AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTasks } from '@/hooks/useTasks'
import type { ProjectDetail } from '@/types'

const ROLE_LABEL: Record<string, string> = {
  PM: 'Quản lý dự án',
  MEMBER: 'Thành viên',
  VIEWER: 'Người xem',
}

const ROLE_COLOR: Record<string, string> = {
  PM: 'bg-indigo-100 text-indigo-700',
  MEMBER: 'bg-slate-100 text-slate-600',
  VIEWER: 'bg-gray-100 text-gray-500',
}

interface Props {
  project: ProjectDetail
}

export default function MembersTab({ project }: Props) {
  const { data: tasksRes } = useTasks({ project_id: project.id, per_page: 500 })
  const tasks = tasksRes?.data ?? []
  const now = new Date()

  const stats = useMemo(() => {
    return project.members.map((m) => {
      const assigned = tasks.filter((t) => t.assignee_user_id === m.user_id)
      const done = assigned.filter((t) => t.status === 'DONE').length
      const overdue = assigned.filter(
        (t) => t.due_date && new Date(t.due_date) < now && t.status !== 'DONE',
      ).length
      return { ...m, assigned: assigned.length, done, overdue }
    })
  }, [project.members, tasks])

  if (project.members.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
        <Users className="h-5 w-5" />
        Chưa có thành viên nào
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{project.members.length} thành viên</p>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-2.5 text-left font-medium">Thành viên</th>
              <th className="px-3 py-2.5 text-left font-medium">Vai trò</th>
              <th className="px-3 py-2.5 text-center font-medium">Được giao</th>
              <th className="px-3 py-2.5 text-center font-medium">Hoàn thành</th>
              <th className="px-3 py-2.5 text-center font-medium">Quá hạn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 shrink-0">
                      {m.user?.full_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{m.user?.full_name ?? m.user_id}</p>
                      {m.user?.email && (
                        <p className="text-xs text-slate-400">{m.user.email}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ROLE_COLOR[m.role] ?? 'bg-gray-100 text-gray-600')}>
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="flex items-center justify-center gap-1 text-slate-700">
                    <CheckSquare className="h-3.5 w-3.5 text-slate-400" />
                    {m.assigned}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={cn(
                    'text-sm font-medium',
                    m.assigned > 0 && m.done === m.assigned ? 'text-emerald-600' : 'text-slate-600',
                  )}>
                    {m.done}
                    {m.assigned > 0 && (
                      <span className="text-xs text-slate-400 font-normal ml-1">
                        ({((m.done / m.assigned) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  {m.overdue > 0 ? (
                    <span className="flex items-center justify-center gap-1 text-red-500 font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {m.overdue}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
