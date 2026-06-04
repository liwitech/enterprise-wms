import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Calendar } from 'lucide-react'
import { taskService } from '@/services/taskService'
import { projectService } from '@/services/projectService'
import { useAuthStore } from '@/stores/authStore'
import { TaskStatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import Pagination from '@/components/ui/Pagination'
import type { TaskStatus, Priority } from '@/types'
import { format } from 'date-fns'

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'TODO', label: 'Cần làm' },
  { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
  { value: 'IN_REVIEW', label: 'Đang xem xét' },
  { value: 'DONE', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'Tất cả độ ưu tiên' },
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'CRITICAL', label: 'Khẩn cấp' },
]

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IN_REVIEW', 'DONE', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: ['TODO'],
}

const STATUS_NEXT_LABEL: Partial<Record<TaskStatus, string>> = {
  TODO: 'Bắt đầu thực hiện',
  IN_PROGRESS: 'Chuyển sang xem xét',
  IN_REVIEW: 'Đánh dấu hoàn thành',
}

export default function TasksPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [projectId, setProjectId] = useState('')
  const [myTasksOnly, setMyTasksOnly] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', page, status, priority, projectId, myTasksOnly, user?.id],
    queryFn: () =>
      taskService.list({
        page,
        per_page: 15,
        status: status || undefined,
        priority: priority || undefined,
        project_id: projectId || undefined,
        assignee_user_id: myTasksOnly ? user?.id : undefined,
      }),
  })

  const { data: projectsResp } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectService.list({ per_page: 100 }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      taskService.updateStatus(taskId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const tasks = data?.data ?? []
  const meta = data?.meta
  const projects = projectsResp?.data ?? []

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => { setMyTasksOnly(e.target.checked); setPage(1) }}
            className="h-4 w-4 rounded text-blue-600"
          />
          Công việc của tôi
        </label>

        <select
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
        >
          <option value="">Tất cả dự án</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tạo công việc
        </button>
      </div>

      {/* Tasks table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {tasks.length === 0 ? (
          <div className="py-16 text-center text-gray-400">Không có công việc nào phù hợp</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tiêu đề</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Độ ưu tiên</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày hết hạn</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((t) => {
                const nextStatuses = STATUS_TRANSITIONS[t.status] ?? []
                const primaryNext = nextStatuses[0]
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{t.title}</p>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><TaskStatusBadge status={t.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-4 py-3">
                      {t.due_date ? (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(t.due_date), 'dd/MM/yyyy')}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {primaryNext && STATUS_NEXT_LABEL[t.status] && (
                        <button
                          onClick={() => statusMutation.mutate({ taskId: t.id, status: primaryNext })}
                          disabled={statusMutation.isPending}
                          className="rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          {STATUS_NEXT_LABEL[t.status]}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {meta && (
          <Pagination page={page} totalPages={meta.total_pages} total={meta.total} perPage={meta.per_page} onChange={setPage} />
        )}
      </div>

      {showCreateModal && (
        <CreateTaskModal
          projects={projects}
          userId={user!.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            setShowCreateModal(false)
          }}
        />
      )}
    </div>
  )
}

function CreateTaskModal({
  projects,
  userId,
  onClose,
  onCreated,
}: {
  projects: { id: string; name: string }[]
  userId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    project_id: projects[0]?.id ?? '',
    priority: 'MEDIUM',
    due_date: '',
    estimated_hours: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      taskService.create({
        ...form,
        priority: form.priority as Priority,
        assignee_user_id: userId,
        due_date: form.due_date || undefined,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : undefined,
      }),
    onSuccess: onCreated,
    onError: (err: any) => setError(err?.response?.data?.detail ?? 'Tạo công việc thất bại.'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">Tạo công việc mới</h3>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tiêu đề *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="Nhập tiêu đề công việc" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Dự án *</label>
            <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mô tả</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="Mô tả chi tiết công việc" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Độ ưu tiên</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option value="LOW">Thấp</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HIGH">Cao</option>
                <option value="CRITICAL">Khẩn cấp</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ngày hết hạn</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Số giờ ước tính</label>
            <input type="number" min="0" step="0.5" value={form.estimated_hours}
              onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="VD: 8" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.project_id}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {mutation.isPending ? 'Đang tạo...' : 'Tạo công việc'}
          </button>
        </div>
      </div>
    </div>
  )
}
