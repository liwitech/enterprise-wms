import { useMemo, useState } from 'react'
import { Users, CheckSquare, AlertCircle, Plus, Trash2, Loader2, Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/utils/cn'
import { useTasks } from '@/hooks/useTasks'
import { useAddMember, useRemoveMember } from '@/hooks/useProject'
import { userService } from '@/services/userService'
import { useAuthStore } from '@/stores/authStore'
import type { ProjectDetail } from '@/types'

const ROLE_LABEL: Record<string, string> = {
  PM: 'Quản lý dự án',
  MEMBER: 'Thành viên',
  VIEWER: 'Người xem',
}

const ROLE_COLOR: Record<string, string> = {
  PM: 'bg-red-100 text-red-700',
  MEMBER: 'bg-slate-100 text-slate-600',
  VIEWER: 'bg-gray-100 text-gray-500',
}

const MEMBER_ROLES = ['PM', 'MEMBER', 'VIEWER'] as const
type MemberRole = typeof MEMBER_ROLES[number]

// ── Add Member Modal ──────────────────────────────────────────────────────────

function AddMemberModal({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<MemberRole>('MEMBER')
  const addMut = useAddMember(project.id)

  const { data: orgUsers = [], isLoading } = useQuery({
    queryKey: ['org-users', search],
    queryFn: () => userService.listOrgUsers(search || undefined),
    staleTime: 30_000,
  })

  const existingIds = new Set(project.members.map((m) => m.user_id))
  const available = orgUsers.filter((u) => !existingIds.has(u.id))

  async function handleAdd() {
    if (!selectedUserId) return
    await addMut.mutateAsync({ userId: selectedUserId, role })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">Thêm thành viên</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
              placeholder="Tìm theo tên hoặc email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedUserId('') }}
            />
          </div>

          {/* User list */}
          <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
              </div>
            ) : available.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {search ? 'Không tìm thấy người dùng phù hợp' : 'Tất cả mọi người đã trong dự án'}
              </div>
            ) : (
              available.map((u) => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 transition',
                    selectedUserId === u.id ? 'bg-red-50' : 'hover:bg-slate-50',
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white',
                    selectedUserId === u.id ? 'bg-red-600' : 'bg-slate-400',
                  )}>
                    {u.full_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  {selectedUserId === u.id && (
                    <div className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Role select */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Vai trò trong dự án</label>
            <div className="grid grid-cols-3 gap-2">
              {MEMBER_ROLES.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer flex-col items-center rounded-lg border-2 px-2 py-2 text-center transition',
                    role === r ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                  />
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ROLE_COLOR[r])}>
                    {ROLE_LABEL[r]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition">
              Hủy
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedUserId || addMut.isPending}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
            >
              {addMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Thêm vào dự án
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  project: ProjectDetail
}

export default function MembersTab({ project }: Props) {
  const { data: tasksRes } = useTasks({ project_id: project.id, per_page: 500 })
  const tasks = tasksRes?.data ?? []
  const now = new Date()
  const { user: currentUser } = useAuthStore()
  const removeMut = useRemoveMember(project.id)
  const [showAdd, setShowAdd] = useState(false)

  // Current user can manage if ADMIN/SUPER_ADMIN or PM in this project
  const canManage =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    project.members.some((m) => m.user_id === currentUser?.id && m.role === 'PM')

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

  function handleRemove(userId: string, name: string) {
    if (confirm(`Xóa "${name}" khỏi dự án?`)) {
      removeMut.mutate(userId)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{project.members.length} thành viên</p>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm thành viên
          </button>
        )}
      </div>

      {project.members.length === 0 ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
          <Users className="h-5 w-5" />
          Chưa có thành viên nào
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Thành viên</th>
                <th className="px-3 py-2.5 text-left font-medium">Vai trò</th>
                <th className="px-3 py-2.5 text-center font-medium">Được giao</th>
                <th className="px-3 py-2.5 text-center font-medium">Hoàn thành</th>
                <th className="px-3 py-2.5 text-center font-medium">Quá hạn</th>
                {canManage && <th className="px-3 py-2.5 text-right font-medium w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-semibold text-red-700 shrink-0">
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
                  {canManage && (
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => handleRemove(m.user_id, m.user?.full_name ?? 'thành viên')}
                        disabled={removeMut.isPending}
                        title="Xóa khỏi dự án"
                        className="rounded p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600 transition disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddMemberModal project={project} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}
