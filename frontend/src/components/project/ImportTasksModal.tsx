import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  X, Upload, Download, CheckCircle, XCircle,
  AlertTriangle, Loader2, FileText, Info,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { taskService } from '@/services/taskService'
import type { TaskStatus, Priority } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<string>(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])
const VALID_PRIORITIES = new Set<string>(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

const IMPORT_HEADERS = ['title', 'description', 'status', 'priority', 'start_date', 'due_date', 'estimated_hours', 'parent_row']

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowNum: number
  title: string
  description: string
  status: string
  priority: string
  start_date: string
  due_date: string
  estimated_hours: string
  parent_row: string
  errors: string[]
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

interface Props {
  projectId: string
  onClose: () => void
}

// ── Template download ─────────────────────────────────────────────────────────

function downloadTemplate() {
  const wsData = [
    IMPORT_HEADERS,
    // Column notes row (human-readable hints)
    ['* Bắt buộc', 'Mô tả', 'TODO | IN_PROGRESS | IN_REVIEW | DONE | CANCELLED', 'LOW | MEDIUM | HIGH | CRITICAL', 'YYYY-MM-DD', 'YYYY-MM-DD', 'Số giờ', 'Số thứ tự dòng cha'],
    // Example rows
    ['Thiết kế giao diện', 'Mô tả ví dụ', 'TODO', 'HIGH', '2024-01-01', '2024-01-15', '8', ''],
    ['Tạo wireframe', 'Công việc con – cha là dòng 1', 'TODO', 'MEDIUM', '2024-01-01', '2024-01-07', '4', '1'],
    ['Phát triển backend', '', 'TODO', 'HIGH', '', '2024-02-01', '16', ''],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = IMPORT_HEADERS.map((_, i) => ({ wch: i === 0 ? 30 : i <= 1 ? 25 : 20 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks')
  XLSX.writeFile(wb, 'import_tasks_template.xlsx')
}

// ── CSV / date validation helpers ─────────────────────────────────────────────

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
}

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImportTasksModal({ projectId, onClose }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  // ── Parse uploaded file ──────────────────────────────────────────────────────

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', raw: false, cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          raw: false,
          defval: '',
        })

        // Map header names → column indices
        const headerRow = (rawRows[0] as unknown[]).map((h) => normalizeCell(h).toLowerCase())
        const col = (name: string) => headerRow.indexOf(name)

        const titleIdx = col('title')
        if (titleIdx === -1) {
          alert('File không đúng định dạng. Không tìm thấy cột "title". Vui lòng dùng file mẫu.')
          return
        }

        const idx = {
          title: titleIdx,
          description: col('description'),
          status: col('status'),
          priority: col('priority'),
          start_date: col('start_date'),
          due_date: col('due_date'),
          estimated_hours: col('estimated_hours'),
          parent_row: col('parent_row'),
        }

        const rows: ParsedRow[] = []

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i] as unknown[]
          if (!row || row.every((c) => !normalizeCell(c))) continue

          const title = normalizeCell(row[idx.title])
          // Skip header-like / notes rows that start with "*" or are empty
          if (!title || title.startsWith('*')) continue

          const status = (normalizeCell(row[idx.status]).toUpperCase() || 'TODO')
          const priority = (normalizeCell(row[idx.priority]).toUpperCase() || 'MEDIUM')
          const start_date = normalizeCell(row[idx.start_date])
          const due_date = normalizeCell(row[idx.due_date])
          const estimated_hours = normalizeCell(row[idx.estimated_hours])
          const parent_row = normalizeCell(row[idx.parent_row])

          const errors: string[] = []
          if (!title) errors.push('Tên công việc không được để trống')
          if (status && !VALID_STATUSES.has(status)) errors.push(`Trạng thái không hợp lệ: "${status}"`)
          if (priority && !VALID_PRIORITIES.has(priority)) errors.push(`Độ ưu tiên không hợp lệ: "${priority}"`)
          if (start_date && !isValidDate(start_date)) errors.push(`Ngày bắt đầu sai định dạng: "${start_date}" (dùng YYYY-MM-DD)`)
          if (due_date && !isValidDate(due_date)) errors.push(`Hạn chót sai định dạng: "${due_date}" (dùng YYYY-MM-DD)`)
          if (estimated_hours && isNaN(parseFloat(estimated_hours))) errors.push(`Giờ ước tính không hợp lệ: "${estimated_hours}"`)
          if (parent_row) {
            const pNum = parseInt(parent_row)
            if (isNaN(pNum) || pNum <= 0) {
              errors.push(`parent_row không hợp lệ: "${parent_row}" (phải là số dương)`)
            } else if (pNum >= rows.length + 1) {
              errors.push(`parent_row (${pNum}) phải nhỏ hơn dòng hiện tại (${rows.length + 1}) — dòng cha phải đứng trước dòng con`)
            }
          }

          rows.push({
            rowNum: rows.length + 1,
            title,
            description: normalizeCell(row[idx.description]),
            status,
            priority,
            start_date,
            due_date,
            estimated_hours,
            parent_row,
            errors,
          })
        }

        if (rows.length === 0) {
          alert('Không tìm thấy dữ liệu trong file. Vui lòng kiểm tra lại.')
          return
        }

        setParsedRows(rows)
        setStep('preview')
      } catch {
        alert('Lỗi đọc file. Vui lòng kiểm tra định dạng file.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async function handleImport() {
    const validRows = parsedRows.filter((r) => r.errors.length === 0)
    if (validRows.length === 0) return

    setStep('importing')
    setProgress(0)

    const createdIds = new Map<number, string>() // rowNum → created task ID
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      setProgressText(`Đang tạo (${i + 1}/${validRows.length}): ${row.title}`)
      setProgress(Math.round((i / validRows.length) * 100))

      try {
        let parent_task_id: string | undefined
        if (row.parent_row) {
          const pNum = parseInt(row.parent_row)
          parent_task_id = createdIds.get(pNum)
          if (!parent_task_id) {
            throw new Error(`Công việc cha (dòng ${pNum}) chưa được tạo hoặc đã xảy ra lỗi`)
          }
        }

        const created = await taskService.create({
          project_id: projectId,
          title: row.title,
          description: row.description || undefined,
          status: row.status as TaskStatus,
          priority: row.priority as Priority,
          start_date: row.start_date || undefined,
          due_date: row.due_date || undefined,
          estimated_hours: row.estimated_hours ? parseFloat(row.estimated_hours) : undefined,
          parent_task_id,
        } as Partial<Parameters<typeof taskService.create>[0]>)

        createdIds.set(row.rowNum, created.id)
        success++
      } catch (e) {
        failed++
        errors.push(
          `Dòng ${row.rowNum} "${row.title}": ${e instanceof Error ? e.message : 'Lỗi không xác định'}`,
        )
      }
    }

    setProgress(100)
    setResult({ success, failed, errors })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    setStep('done')
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) parseFile(file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── Computed ─────────────────────────────────────────────────────────────────

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length
  const errorCount = parsedRows.filter((r) => r.errors.length > 0).length
  const rowsWithErrors = parsedRows.filter((r) => r.errors.length > 0)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">
            {step === 'upload' && 'Import công việc từ file'}
            {step === 'preview' && `Xem trước — ${parsedRows.length} dòng dữ liệu`}
            {step === 'importing' && 'Đang import...'}
            {step === 'done' && 'Import hoàn tất'}
          </h3>
          {step !== 'importing' && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6">

          {/* ── Step: Upload ─────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="flex items-start gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Hướng dẫn</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-sky-600 space-y-0.5">
                    <li>Tải về file mẫu, điền thông tin và upload lại</li>
                    <li>Dòng cha <strong>phải đứng trước</strong> dòng con trong file</li>
                    <li>Cột <code className="bg-sky-100 px-1 rounded">parent_row</code> là số thứ tự dòng dữ liệu của công việc cha (bắt đầu từ 1)</li>
                    <li>Định dạng ngày: <code className="bg-sky-100 px-1 rounded">YYYY-MM-DD</code></li>
                  </ul>
                </div>
              </div>

              {/* Template download */}
              <button
                onClick={downloadTemplate}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              >
                <Download className="h-4 w-4" />
                Tải về file mẫu (.xlsx)
              </button>

              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors',
                  isDragging
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <Upload className={cn('h-8 w-8', isDragging ? 'text-red-500' : 'text-slate-300')} />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600">Kéo thả file vào đây</p>
                  <p className="mt-1 text-xs text-slate-400">hoặc click để chọn file (.xlsx, .xls, .csv)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) parseFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Step: Preview ────────────────────────────── */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary chips */}
              <div className="flex gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  {validCount} dòng hợp lệ
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-600">
                    <XCircle className="h-4 w-4" />
                    {errorCount} dòng có lỗi (sẽ bỏ qua)
                  </span>
                )}
              </div>

              {/* Preview table */}
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-8 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Tên công việc</th>
                      <th className="w-24 px-3 py-2 text-left font-medium">Trạng thái</th>
                      <th className="w-20 px-3 py-2 text-left font-medium">Ưu tiên</th>
                      <th className="w-24 px-3 py-2 text-left font-medium">Hạn chót</th>
                      <th className="w-12 px-3 py-2 text-center font-medium">Cha</th>
                      <th className="w-10 px-3 py-2 text-center font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row) => (
                      <tr key={row.rowNum} className={row.errors.length > 0 ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 text-slate-400">{row.rowNum}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'block max-w-[200px] truncate',
                              row.errors.length > 0 ? 'text-red-700' : 'text-slate-700',
                            )}
                            title={row.title}
                          >
                            {row.title || <em className="text-slate-300">—</em>}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{row.status}</td>
                        <td className="px-3 py-2 text-slate-500">{row.priority}</td>
                        <td className="px-3 py-2 text-slate-400">{row.due_date || '—'}</td>
                        <td className="px-3 py-2 text-center text-slate-400">{row.parent_row || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {row.errors.length > 0 ? (
                            <AlertTriangle
                              className="inline h-3.5 w-3.5 text-red-500"
                              aria-label={row.errors.join('; ')}
                            />
                          ) : (
                            <CheckCircle className="inline h-3.5 w-3.5 text-emerald-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error detail list */}
              {rowsWithErrors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg bg-red-50 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-red-700">Chi tiết lỗi:</p>
                  <ul className="space-y-1">
                    {rowsWithErrors.map((r) => (
                      <li key={r.rowNum} className="text-xs text-red-600">
                        <span className="font-semibold">Dòng {r.rowNum}:</span>{' '}
                        {r.errors.join(' · ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Importing ──────────────────────────── */}
          {step === 'importing' && (
            <div className="space-y-5 py-6">
              <div className="flex items-center justify-center gap-3 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                <span className="text-sm">{progressText}</span>
              </div>
              <div className="mx-auto w-full max-w-sm">
                <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                  <span>Tiến độ</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Done ───────────────────────────────── */}
          {step === 'done' && result && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-3">
                {result.success > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                    <CheckCircle className="h-5 w-5" />
                    <div>
                      <p className="font-semibold">{result.success} công việc</p>
                      <p className="text-xs text-emerald-600">Tạo thành công</p>
                    </div>
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
                    <XCircle className="h-5 w-5" />
                    <div>
                      <p className="font-semibold">{result.failed} dòng</p>
                      <p className="text-xs text-red-500">Không tạo được</p>
                    </div>
                  </div>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-red-700">Chi tiết lỗi:</p>
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div>
            {step === 'preview' && (
              <button
                onClick={() => { setStep('upload'); setParsedRows([]) }}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
              >
                ← Quay lại
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {(step === 'upload' || step === 'preview') && (
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
              >
                Hủy
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                disabled={validCount === 0}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
              >
                <FileText className="h-3.5 w-3.5" />
                Import {validCount} công việc
              </button>
            )}
            {step === 'done' && (
              <button
                onClick={onClose}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
              >
                Đóng
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
