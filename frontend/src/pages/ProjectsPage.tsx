import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, TrendingUp, Calendar, ChevronRight } from 'lucide-react'
import { projectService } from '@/services/projectService'
import { useAuthStore } from '@/stores/authStore'
import { ProjectStatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import Pagination from '@/components/ui/Pagination'
import type { Priority } from '@/types'
import { format } from 'date-fns'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PLANNING', label: 'Lên kế hoạch' },
  { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
  { value: 'ON_HOLD', label: 'Tạm dừng' },
  { value: 'COMPLETED', label: 'Đã hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả độ ưu tiên' },
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'CRITICAL', label: 'Khẩn cấp' },
]

export default function ProjectsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['projects', page, search, status, priority],
    queryFn: () =>
      projectService.list({
        page,
        per_page: 12,
        search: search || undefined,
        status: status || undefined,
        priority: priority || undefined,
      }),
  })

  const canCreate = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)
  const projects = data?.data ?? []
  const meta = data?.meta

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Tìm kiếm dự án..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-red-500"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Tạo dự án
          </button>
        )}
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <p className="text-gray-400">Không có dự án nào phù hợp</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-red-300 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-800 group-hover:text-red-600">
                    {p.name}
                  </p>
                  <p className="text-xs text-gray-400">{p.code}</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 group-hover:text-red-400" />
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <ProjectStatusBadge status={p.status} />
                <PriorityBadge priority={p.priority} />
              </div>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Tiến độ
                  </span>
                  <span className="font-medium">{p.progress_percent.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-red-500"
                    style={{ width: `${p.progress_percent}%` }}
                  />
                </div>
              </div>

              {p.end_date && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Calendar className="h-3 w-3" />
                  Hạn: {format(new Date(p.end_date), 'dd/MM/yyyy')}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {meta && (
        <Pagination
          page={page}
          totalPages={meta.total_pages}
          total={meta.total}
          perPage={meta.per_page}
          onChange={setPage}
        />
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['projects'] })
            setShowCreateModal(false)
          }}
          userId={user!.id}
          orgId={user!.org_id}
        />
      )}
    </div>
  )
}

function CreateProjectModal({
  onClose,
  onCreated,
  userId,
  orgId,
}: {
  onClose: () => void
  onCreated: () => void
  userId: string
  orgId: string
}) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    priority: 'MEDIUM',
    project_type: 'AGILE',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      projectService.create({
        ...form,
        org_id: orgId,
        owner_user_id: userId,
        priority: form.priority as Priority,
        project_type: form.project_type as 'WATERFALL' | 'AGILE' | 'MIXED',
      }),
    onSuccess: onCreated,
    onError: (err: any) => {
      setError(err?.response?.data?.detail ?? 'Tạo dự án thất bại. Vui lòng thử lại.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">Tạo dự án mới</h3>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tên dự án *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              placeholder="Nhập tên dự án"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mã dự án *</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:border-red-500"
              placeholder="VD: PROJ-001"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              placeholder="Mô tả về dự án"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Độ ưu tiên</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              >
                <option value="LOW">Thấp</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HIGH">Cao</option>
                <option value="CRITICAL">Khẩn cấp</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Loại dự án</label>
              <select
                value={form.project_type}
                onChange={(e) => setForm({ ...form, project_type: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              >
                <option value="AGILE">Agile</option>
                <option value="WATERFALL">Waterfall</option>
                <option value="MIXED">Hỗn hợp</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.code}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Đang tạo...' : 'Tạo dự án'}
          </button>
        </div>
      </div>
    </div>
  )
}
