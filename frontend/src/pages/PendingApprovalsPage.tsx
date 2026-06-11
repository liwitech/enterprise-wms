import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, CheckSquare } from 'lucide-react'
import { timesheetService } from '@/services/timesheetService'
import { TimesheetStatusBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import Pagination from '@/components/ui/Pagination'
import { format } from 'date-fns'

export default function PendingApprovalsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['timesheet-pending', page],
    queryFn: () => timesheetService.getPending({ page, per_page: 20 }),
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => timesheetService.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheet-pending'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      timesheetService.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet-pending'] })
      setRejectModal(null)
      setRejectReason('')
    },
  })

  const batchApproveMutation = useMutation({
    mutationFn: (ids: string[]) => timesheetService.approveBatch(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet-pending'] })
      setSelectedIds(new Set())
    },
  })

  const entries = data?.data ?? []
  const meta = data?.meta

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)))
    }
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {meta?.total ?? 0} mục đang chờ duyệt
        </p>
        {selectedIds.size > 0 && (
          <button
            onClick={() => batchApproveMutation.mutate([...selectedIds])}
            disabled={batchApproveMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            <CheckSquare className="h-4 w-4" />
            Duyệt {selectedIds.size} mục đã chọn
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {entries.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            Không có mục nào đang chờ duyệt
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === entries.length && entries.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded text-red-600"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nhân viên</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Dự án</th>
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
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelect(e.id)}
                      className="h-4 w-4 rounded text-red-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{e.user?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{e.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.project?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {format(new Date(e.work_date), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {Number(e.hours_logged).toFixed(1)}h
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {e.description || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <TimesheetStatusBadge status={e.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => approveMutation.mutate(e.id)}
                        disabled={approveMutation.isPending}
                        title="Duyệt"
                        className="rounded-md p-1.5 text-green-500 hover:bg-green-50 hover:text-green-700 disabled:opacity-60"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setRejectModal({ id: e.id })}
                        title="Từ chối"
                        className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold text-gray-800">Từ chối chấm công</h3>
            <p className="mb-3 text-sm text-gray-500">
              Vui lòng nhập lý do từ chối để nhân viên có thể điều chỉnh.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do từ chối..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={() => rejectMutation.mutate({ id: rejectModal.id, reason: rejectReason })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {rejectMutation.isPending ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
