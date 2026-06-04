import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Send, Clock, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { timesheetService } from '@/services/timesheetService'
import { taskService } from '@/services/taskService'
import { projectService } from '@/services/projectService'
import { TimesheetStatusBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import Pagination from '@/components/ui/Pagination'
import { format, addMonths, subMonths } from 'date-fns'
import { vi } from 'date-fns/locale'

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'SUBMITTED', label: 'Đã nộp' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Đã từ chối' },
]

export default function TimesheetPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth() + 1

  const { data, isLoading } = useQuery({
    queryKey: ['timesheets', page, year, month, statusFilter],
    queryFn: () =>
      timesheetService.list({
        page,
        per_page: 15,
        year,
        month,
        status: statusFilter || undefined,
      }),
  })

  const { data: summary } = useQuery({
    queryKey: ['timesheet-summary', year, month],
    queryFn: () => timesheetService.getSummary(year, month),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timesheetService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] })
      qc.invalidateQueries({ queryKey: ['timesheet-summary'] })
    },
  })

  const submitMutation = useMutation({
    mutationFn: (ids: string[]) => timesheetService.submit(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] })
      setSelectedIds(new Set())
    },
  })

  const entries = data?.data ?? []
  const meta = data?.meta
  const totalHours = summary?.by_project.reduce((s, p) => s + Number(p.total_hours), 0) ?? 0

  const draftEntries = entries.filter((e) => e.status === 'DRAFT')
  const allDraftSelected = draftEntries.length > 0 && draftEntries.every((e) => selectedIds.has(e.id))

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const toggleAllDraft = () => {
    if (allDraftSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(draftEntries.map((e) => e.id)))
    }
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Month navigator + summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-medium text-gray-700 capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: vi })}
          </span>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">
              Tổng: {totalHours.toFixed(1)} giờ
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={() => submitMutation.mutate([...selectedIds])}
              disabled={submitMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Nộp {selectedIds.size} mục
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Thêm giờ công
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Summary by project */}
      {summary?.by_project && summary.by_project.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Giờ theo dự án</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {summary.by_project.map((p) => (
              <div key={p.project_id} className="rounded-lg bg-gray-50 p-3">
                <p className="truncate text-xs text-gray-500">{p.project_name}</p>
                <p className="mt-0.5 text-lg font-bold text-gray-800">{Number(p.total_hours).toFixed(1)}h</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {entries.length === 0 ? (
          <div className="py-16 text-center text-gray-400">Không có dữ liệu chấm công trong tháng này</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" checked={allDraftSelected} onChange={toggleAllDraft}
                    className="h-4 w-4 rounded text-blue-600" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Giờ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Mô tả</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {e.status === 'DRAFT' && (
                      <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)}
                        className="h-4 w-4 rounded text-blue-600" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {format(new Date(e.work_date), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-800">{Number(e.hours_logged).toFixed(1)}</span>
                    <span className="ml-0.5 text-gray-400">h</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {e.description || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <TimesheetStatusBadge status={e.status} />
                    {e.reject_reason && (
                      <p className="mt-0.5 text-xs text-red-500">{e.reject_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.status === 'DRAFT' && (
                      <button
                        onClick={() => {
                          if (confirm('Xóa mục chấm công này?')) deleteMutation.mutate(e.id)
                        }}
                        className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {meta && (
          <Pagination page={page} totalPages={meta.total_pages} total={meta.total} perPage={meta.per_page} onChange={setPage} />
        )}
      </div>

      {showCreateModal && (
        <CreateTimesheetModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['timesheets'] })
            qc.invalidateQueries({ queryKey: ['timesheet-summary'] })
            setShowCreateModal(false)
          }}
        />
      )}
    </div>
  )
}

function CreateTimesheetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    task_id: '',
    work_date: format(new Date(), 'yyyy-MM-dd'),
    hours_logged: '',
    description: '',
  })
  const [error, setError] = useState('')
  const [projectId, setProjectId] = useState('')

  const { data: projectsResp } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectService.list({ per_page: 100 }),
  })

  const { data: tasksResp } = useQuery({
    queryKey: ['tasks', 'select', projectId],
    queryFn: () => taskService.list({ project_id: projectId, per_page: 100 }),
    enabled: !!projectId,
  })

  const mutation = useMutation({
    mutationFn: () =>
      timesheetService.create({
        task_id: form.task_id,
        work_date: form.work_date,
        hours_logged: Number(form.hours_logged),
        description: form.description || undefined,
      }),
    onSuccess: onCreated,
    onError: (err: any) => setError(err?.response?.data?.detail ?? 'Tạo mục chấm công thất bại.'),
  })

  const projects = projectsResp?.data ?? []
  const tasks = tasksResp?.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">Thêm giờ công</h3>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Dự án</label>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setForm({ ...form, task_id: '' }) }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
              <option value="">-- Chọn dự án --</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Công việc *</label>
            <select value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value })}
              disabled={!projectId}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-gray-50">
              <option value="">-- Chọn công việc --</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ngày làm việc *</label>
              <input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })}
                max={format(new Date(), 'yyyy-MM-dd')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Số giờ *</label>
              <input type="number" min="0.5" max="16" step="0.5" value={form.hours_logged}
                onChange={(e) => setForm({ ...form, hours_logged: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="0.0" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ghi chú</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="Mô tả công việc đã làm" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.task_id || !form.hours_logged || !form.work_date}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {mutation.isPending ? 'Đang lưu...' : 'Lưu giờ công'}
          </button>
        </div>
      </div>
    </div>
  )
}
