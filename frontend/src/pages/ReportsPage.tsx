import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, BarChart3 } from 'lucide-react'
import { projectService } from '@/services/projectService'
import { PageSpinner } from '@/components/ui/Spinner'
import { format, startOfWeek, subWeeks } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '@/services/api'

export default function ReportsPage() {
  const today = new Date()
  const [weekStart, setWeekStart] = useState(
    format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  )
  const [projectId, setProjectId] = useState('')

  const { data: projectsResp } = useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => projectService.list({ per_page: 100 }),
  })

  const { data: summaryResp, isLoading } = useQuery({
    queryKey: ['weekly-summary', weekStart],
    queryFn: async () => {
      const res = await api.get('/api/reports/timesheet/weekly-summary', {
        params: { week_start: weekStart, per_page: 100 },
      })
      return res.data
    },
  })

  const { data: reportResp } = useQuery({
    queryKey: ['report', weekStart, projectId],
    queryFn: async () => {
      const res = await api.get('/api/reports/timesheet', {
        params: {
          week_start: weekStart,
          project_id: projectId || undefined,
          format: 'json',
        },
      })
      return res.data
    },
  })

  const handleDownloadCsv = async () => {
    const res = await api.get('/api/reports/timesheet', {
      params: {
        week_start: weekStart,
        project_id: projectId || undefined,
        format: 'csv',
      },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheet_${weekStart}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const summaries = summaryResp?.data ?? []
  const reportEntries = reportResp?.data ?? []
  const projects = projectsResp?.data ?? []

  // Chart data: group summary by user
  const chartData = summaries.reduce((acc: Record<string, number>, s: any) => {
    const name = s.user?.full_name ?? 'Không xác định'
    acc[name] = (acc[name] ?? 0) + Number(s.total_hours)
    return acc
  }, {} as Record<string, number>)

  const barData = Object.entries(chartData).map(([name, hours]) => ({ name, hours }))

  // Week options: last 8 weeks
  const weekOptions = Array.from({ length: 8 }, (_, i) => {
    const d = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 })
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM/yyyy') }
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Tuần</label>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
          >
            {weekOptions.map((w) => (
              <option key={w.value} value={w.value}>
                Tuần từ {w.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Dự án</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
          >
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleDownloadCsv}
          className="ml-auto flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Tải về CSV
        </button>
      </div>

      {/* Chart */}
      {barData.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            Giờ công theo nhân viên (tuần từ {weekStart})
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="h" />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}h`, 'Giờ công']}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="font-semibold text-gray-800">
            Chi tiết chấm công ({reportEntries.length} mục)
          </h3>
        </div>
        {reportEntries.length === 0 ? (
          <div className="py-12 text-center text-gray-400">Không có dữ liệu trong khoảng thời gian này</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nhân viên</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Dự án</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Giờ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportEntries.map((e: any) => (
                  <tr key={e.entry_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{e.user_name}</p>
                      <p className="text-xs text-gray-400">{e.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.project_name}</td>
                    <td className="px-4 py-3 text-gray-600">{e.work_date}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{e.hours_logged}h</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        e.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                        : e.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700'
                        : e.status === 'REJECTED' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>
                        {e.status === 'APPROVED' ? 'Đã duyệt'
                         : e.status === 'SUBMITTED' ? 'Đã nộp'
                         : e.status === 'REJECTED' ? 'Đã từ chối'
                         : 'Nháp'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{e.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
