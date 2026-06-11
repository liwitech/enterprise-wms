import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { RotateCcw } from 'lucide-react'
import type { GridCell, GridRow } from '@/hooks/useTimesheetWeek'
import type { TimesheetStatus } from '@/types'

// ── Day abbreviations (T2 = Mon … CN = Sun) ───────────────────────────────────

const DAY_ABBR = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// ── TimeCell ──────────────────────────────────────────────────────────────────

interface TimeCellProps {
  cell: GridCell
  rowIdx: number
  colIdx: number
  isWeekend: boolean
  onChange: (hours: number) => void
}

function TimeCell({ cell, rowIdx, colIdx, isWeekend, onChange }: TimeCellProps) {
  const [draft, setDraft] = useState(cell.hours === 0 ? '' : String(cell.hours))
  const inputRef = useRef<HTMLInputElement>(null)
  const escapeRef = useRef(false)

  // Sync draft from props only when this input is not focused
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(cell.hours === 0 ? '' : String(cell.hours))
    }
  }, [cell.hours])

  if (cell.status === 'SUBMITTED') {
    return (
      <td className="px-1 py-1 text-center">
        <span className="inline-block w-full rounded bg-blue-50 px-2 py-1 text-sm text-blue-700">
          {cell.hours > 0 ? cell.hours : '—'}
        </span>
      </td>
    )
  }

  if (cell.status === 'APPROVED') {
    return (
      <td className="px-1 py-1 text-center">
        <span className="inline-block w-full rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-700">
          {cell.hours > 0 ? cell.hours : '—'}
        </span>
      </td>
    )
  }

  function commit(raw: string) {
    const parsed = parseFloat(raw)
    if (isNaN(parsed) || raw.trim() === '') {
      setDraft(cell.hours === 0 ? '' : String(cell.hours))
      return
    }
    // Round to nearest 0.5, clamp 0–16
    const rounded = Math.round(parsed * 2) / 2
    const clamped = Math.min(16, Math.max(0, rounded))
    const display = clamped === 0 ? '' : String(clamped)
    setDraft(display)
    if (clamped !== cell.hours) {
      onChange(clamped)
    }
  }

  const inputCls = [
    'w-full rounded border px-1.5 py-1 text-center text-sm outline-none',
    'focus:ring-2 focus:ring-red-400 focus:border-red-400',
    cell.status === 'REJECTED'
      ? 'border-red-300 bg-red-50 text-red-800'
      : isWeekend
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : 'border-slate-200 bg-white text-slate-800',
  ].join(' ')

  const cellContent = (
    <input
      ref={inputRef}
      type="number"
      min={0}
      max={16}
      step={0.5}
      value={draft}
      data-row={rowIdx}
      data-col={colIdx}
      className={inputCls}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (escapeRef.current) { escapeRef.current = false; return }
        commit(e.target.value)
      }}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          escapeRef.current = true
          setDraft(cell.hours === 0 ? '' : String(cell.hours))
          inputRef.current?.blur()
        }
      }}
    />
  )

  if (cell.status === 'REJECTED' && cell.rejectReason) {
    return (
      <td className="relative px-1 py-1 text-center">
        <div className="group relative">
          {cellContent}
          <div
            className={[
              'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2',
              'w-52 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg',
              'opacity-0 transition-opacity group-hover:opacity-100',
            ].join(' ')}
          >
            {cell.rejectReason}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </div>
        </div>
      </td>
    )
  }

  return <td className="px-1 py-1 text-center">{cellContent}</td>
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rows: GridRow[]
  weekDays: Date[]
  dailyTotals: Record<string, number>
  weekStatus: TimesheetStatus
  onCellChange: (taskId: string, date: string, hours: number) => void
  onResubmitRow: (entryIds: string[]) => void
}

// ── WeeklyGrid ────────────────────────────────────────────────────────────────

export function WeeklyGrid(props: Props) {
  const { rows, weekDays, dailyTotals, onCellChange, onResubmitRow } = props
  // ── Keyboard navigation ───────────────────────────────────────────────────

  function handleTableKeyDown(e: React.KeyboardEvent<HTMLTableElement>) {
    const target = e.target as HTMLElement
    const rowAttr = target.getAttribute('data-row')
    const colAttr = target.getAttribute('data-col')
    if (rowAttr === null || colAttr === null) return

    const rowIdx = parseInt(rowAttr, 10)
    const colIdx = parseInt(colAttr, 10)
    const totalRows = rows.length
    const totalCols = 7

    let nextRow = rowIdx
    let nextCol = colIdx

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      nextCol = colIdx + 1
      if (nextCol >= totalCols) {
        nextCol = 0
        nextRow = rowIdx + 1
        if (nextRow >= totalRows) nextRow = 0
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      nextCol = colIdx - 1
      if (nextCol < 0) {
        nextCol = totalCols - 1
        nextRow = rowIdx - 1
        if (nextRow < 0) nextRow = totalRows - 1
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      nextRow = rowIdx + 1
      if (nextRow >= totalRows) nextRow = 0
    } else {
      return
    }

    const el = document.querySelector<HTMLElement>(
      `[data-row="${nextRow}"][data-col="${nextCol}"]`,
    )
    el?.focus()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
      <table
        className="min-w-full border-collapse text-sm"
        onKeyDown={handleTableKeyDown}
      >
        {/* ── Header ── */}
        <thead>
          <tr className="sticky top-0 z-10 bg-slate-800 text-white">
            <th
              className="min-w-[200px] px-4 py-3 text-left font-semibold text-slate-100"
              scope="col"
            >
              Công việc / Dự án
            </th>
            {weekDays.map((day, idx) => {
              const isWeekend = idx >= 5
              return (
                <th
                  key={idx}
                  scope="col"
                  className={[
                    'w-20 px-2 py-3 text-center font-semibold',
                    isWeekend ? 'bg-slate-700 text-slate-300' : 'text-slate-100',
                  ].join(' ')}
                >
                  <div className="text-xs font-bold uppercase tracking-wider">
                    {DAY_ABBR[idx]}
                  </div>
                  <div className="mt-0.5 text-xs font-normal text-slate-400">
                    {format(day, 'dd/MM')}
                  </div>
                </th>
              )
            })}
            {/* Extra column for re-submit button; always reserve space */}
            <th className="w-24 px-2 py-3" scope="col" />
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, rowIdx) => {
            const rejectedEntryIds = weekDays
              .map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const cell = row.cells[dateStr]
                return cell?.status === 'REJECTED' && cell.entryId ? cell.entryId : null
              })
              .filter((id): id is string => id !== null)

            return (
              <tr
                key={row.taskId}
                className={[
                  'transition-colors hover:bg-slate-50',
                  row.hasRejected ? 'bg-red-50 hover:bg-red-50' : '',
                ].join(' ')}
              >
                {/* Task / project name cell */}
                <td className="min-w-[200px] px-4 py-2">
                  <div className="font-medium text-slate-800 leading-snug">{row.taskTitle}</div>
                  <div className="mt-0.5 text-xs text-slate-400 leading-snug">
                    {row.projectName}
                  </div>
                </td>

                {/* Day cells */}
                {weekDays.map((day, colIdx) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const cell = row.cells[dateStr] ?? {
                    hours: 0,
                    status: 'DRAFT' as const,
                  }
                  const isWeekend = colIdx >= 5
                  return (
                    <TimeCell
                      key={dateStr}
                      cell={cell}
                      rowIdx={rowIdx}
                      colIdx={colIdx}
                      isWeekend={isWeekend}
                      onChange={(hours) => onCellChange(row.taskId, dateStr, hours)}
                    />
                  )
                })}

                {/* Re-submit button column */}
                <td className="px-2 py-1 text-center">
                  {row.hasRejected && (
                    <button
                      type="button"
                      onClick={() => onResubmitRow(rejectedEntryIds)}
                      className={[
                        'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5',
                        'border border-red-300 bg-white text-xs font-medium text-red-600',
                        'transition-colors hover:bg-red-50 active:bg-red-100',
                        'focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1',
                      ].join(' ')}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Nộp lại
                    </button>
                  )}
                </td>
              </tr>
            )
          })}

          {rows.length === 0 && (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-10 text-center text-sm text-slate-400"
              >
                Chưa có công việc nào trong tuần này.
              </td>
            </tr>
          )}
        </tbody>

        {/* ── Footer totals ── */}
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td className="px-4 py-2 text-sm font-semibold text-slate-700">Tổng</td>
            {weekDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const hours = dailyTotals[dateStr] ?? 0

              const colorCls =
                hours === 0
                  ? 'text-slate-400'
                  : hours === 8
                    ? 'text-emerald-600 bg-emerald-50'
                    : hours > 8
                      ? 'text-red-600 bg-red-50'
                      : 'text-amber-600 bg-amber-50'

              return (
                <td key={idx} className="px-1 py-2 text-center">
                  <span
                    className={[
                      'inline-block w-full rounded px-1 py-0.5 text-sm font-semibold',
                      colorCls,
                    ].join(' ')}
                  >
                    {hours > 0 ? hours : '—'}
                  </span>
                </td>
              )
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
