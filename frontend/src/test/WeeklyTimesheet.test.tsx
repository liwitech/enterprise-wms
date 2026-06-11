import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyGrid } from '@/components/timesheet/WeeklyGrid'
import { format, startOfWeek, addDays } from 'date-fns'
import type { GridRow, GridCell } from '@/hooks/useTimesheetWeek'
import type { TimesheetStatus } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWeekDays(startDate = new Date('2026-06-01')): Date[] {
  const monday = startOfWeek(startDate, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

function makeCell(
  hours = 0,
  status: TimesheetStatus = 'DRAFT',
  entryId?: string,
  rejectReason?: string,
): GridCell {
  return { hours, status, entryId, rejectReason }
}

function makeRow(taskId: string, overrides: Partial<GridRow> = {}): GridRow {
  return {
    taskId,
    taskTitle: `Task ${taskId}`,
    projectName: 'Test Project',
    cells: {},
    hasRejected: false,
    ...overrides,
  }
}

const weekDays = makeWeekDays()
const dailyTotals: Record<string, number> = {}
weekDays.forEach(d => { dailyTotals[format(d, 'yyyy-MM-dd')] = 0 })

function renderGrid(
  rows: GridRow[],
  {
    onCellChange = vi.fn(),
    onResubmitRow = vi.fn(),
    totals = dailyTotals,
    weekStatus = 'DRAFT' as TimesheetStatus,
  } = {},
) {
  return {
    onCellChange,
    onResubmitRow,
    ...render(
      <WeeklyGrid
        rows={rows}
        weekDays={weekDays}
        dailyTotals={totals}
        weekStatus={weekStatus}
        onCellChange={onCellChange}
        onResubmitRow={onResubmitRow}
      />,
    ),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WeeklyGrid', () => {
  it('renders header with day abbreviations', () => {
    renderGrid([])
    expect(screen.getByText('T2')).toBeInTheDocument()
    expect(screen.getByText('T3')).toBeInTheDocument()
    expect(screen.getByText('T7')).toBeInTheDocument()
    expect(screen.getByText('CN')).toBeInTheDocument()
  })

  it('renders date labels in header', () => {
    renderGrid([])
    const formatted = format(weekDays[0], 'dd/MM')
    expect(screen.getByText(formatted)).toBeInTheDocument()
  })

  it('renders empty state when no rows', () => {
    renderGrid([])
    expect(screen.getByText('Chưa có công việc nào trong tuần này.')).toBeInTheDocument()
  })

  it('renders task rows with task title and project name', () => {
    const rows = [makeRow('t1', { taskTitle: 'Fix login bug', projectName: 'Auth Service' })]
    renderGrid(rows)
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('Auth Service')).toBeInTheDocument()
  })

  it('renders DRAFT cells as editable inputs', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(4, 'DRAFT', 'e1') } })
    renderGrid([row])
    const input = screen.getByDisplayValue('4')
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('renders SUBMITTED cells as read-only spans', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(6, 'SUBMITTED', 'e1') } })
    renderGrid([row])
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('6')).not.toBeInTheDocument()
  })

  it('renders APPROVED cells as read-only spans', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(8, 'APPROVED', 'e1') } })
    renderGrid([row])
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('8')).not.toBeInTheDocument()
  })

  it('renders REJECTED cells with red styling input', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', {
      cells: { [dateStr]: makeCell(3, 'REJECTED', 'e1', 'Missing description') },
      hasRejected: true,
    })
    renderGrid([row])
    const input = screen.getByDisplayValue('3')
    expect(input).toBeInTheDocument()
    expect(input.className).toContain('border-red')
  })

  it('shows re-submit button for rows with rejected entries', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', {
      cells: { [dateStr]: makeCell(3, 'REJECTED', 'e1') },
      hasRejected: true,
    })
    renderGrid([row])
    expect(screen.getByRole('button', { name: /Nộp lại/ })).toBeInTheDocument()
  })

  it('does not show re-submit button when no rejected entries', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(4, 'DRAFT', 'e1') } })
    renderGrid([row])
    expect(screen.queryByRole('button', { name: /Nộp lại/ })).not.toBeInTheDocument()
  })

  it('calls onResubmitRow with rejected entry IDs when clicking Nộp lại', async () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', {
      cells: { [dateStr]: makeCell(3, 'REJECTED', 'entry-uuid-1') },
      hasRejected: true,
    })
    const onResubmitRow = vi.fn()
    renderGrid([row], { onResubmitRow })

    fireEvent.click(screen.getByRole('button', { name: /Nộp lại/ }))
    expect(onResubmitRow).toHaveBeenCalledWith(['entry-uuid-1'])
  })

  it('calls onCellChange when input value changes and blurs', async () => {
    const user = userEvent.setup()
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(0, 'DRAFT', 'e1') } })
    const onCellChange = vi.fn()
    renderGrid([row], { onCellChange })

    // All 7 day-columns render an empty input with placeholder="0"; target Monday (col 0)
    const input = document.querySelector<HTMLInputElement>('[data-row="0"][data-col="0"]')!
    await user.click(input)
    await user.clear(input)
    await user.type(input, '6')
    await user.tab() // blur to commit

    expect(onCellChange).toHaveBeenCalledWith('t1', dateStr, 6)
  })

  it('rounds hours to nearest 0.5 on commit', async () => {
    const user = userEvent.setup()
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(0, 'DRAFT', 'e1') } })
    const onCellChange = vi.fn()
    renderGrid([row], { onCellChange })

    const input = document.querySelector<HTMLInputElement>('[data-row="0"][data-col="0"]')!
    await user.click(input)
    await user.clear(input)
    await user.type(input, '6.3')
    await user.tab()

    // 6.3 rounds to 6.5
    expect(onCellChange).toHaveBeenCalledWith('t1', dateStr, 6.5)
  })

  it('clamps hours to 16 max on commit', async () => {
    const user = userEvent.setup()
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(0, 'DRAFT', 'e1') } })
    const onCellChange = vi.fn()
    renderGrid([row], { onCellChange })

    const input = document.querySelector<HTMLInputElement>('[data-row="0"][data-col="0"]')!
    await user.click(input)
    await user.clear(input)
    await user.type(input, '20')
    await user.tab()

    expect(onCellChange).toHaveBeenCalledWith('t1', dateStr, 16)
  })

  it('does not call onCellChange when hours unchanged after blur', async () => {
    const user = userEvent.setup()
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(4, 'DRAFT', 'e1') } })
    const onCellChange = vi.fn()
    renderGrid([row], { onCellChange })

    const input = screen.getByDisplayValue('4')
    await user.click(input)
    await user.tab() // blur without changing

    expect(onCellChange).not.toHaveBeenCalled()
  })

  it('resets draft to original on Escape key', async () => {
    const user = userEvent.setup()
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const row = makeRow('t1', { cells: { [dateStr]: makeCell(4, 'DRAFT', 'e1') } })
    renderGrid([row])

    const input = screen.getByDisplayValue('4')
    await user.click(input)
    await user.clear(input)
    await user.type(input, '9')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue(4)
  })

  it('renders daily totals in footer', () => {
    const dateStr = format(weekDays[0], 'yyyy-MM-dd')
    const totals = { ...dailyTotals, [dateStr]: 8 }
    const rows = [makeRow('t1')]
    renderGrid(rows, { totals })
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders em dash for zero daily totals', () => {
    renderGrid([makeRow('t1')])
    // zero-hour days show em dash
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders multiple task rows', () => {
    const rows = [
      makeRow('t1', { taskTitle: 'Task Alpha' }),
      makeRow('t2', { taskTitle: 'Task Beta' }),
      makeRow('t3', { taskTitle: 'Task Gamma' }),
    ]
    renderGrid(rows)
    expect(screen.getByText('Task Alpha')).toBeInTheDocument()
    expect(screen.getByText('Task Beta')).toBeInTheDocument()
    expect(screen.getByText('Task Gamma')).toBeInTheDocument()
  })
})

describe('WeeklyGrid keyboard navigation', () => {
  it('moves focus right with Tab key', async () => {
    const user = userEvent.setup()
    const rows = [makeRow('t1')]
    // Add cells for each day
    const cells: Record<string, GridCell> = {}
    weekDays.forEach((d, i) => {
      cells[format(d, 'yyyy-MM-dd')] = makeCell(i, 'DRAFT', `e${i}`)
    })
    rows[0].cells = cells
    renderGrid(rows)

    const firstInput = document.querySelector<HTMLInputElement>('[data-row="0"][data-col="0"]')
    expect(firstInput).not.toBeNull()
    firstInput?.focus()

    await user.tab()

    const secondInput = document.querySelector<HTMLInputElement>('[data-row="0"][data-col="1"]')
    expect(document.activeElement).toBe(secondInput)
  })

  it('moves focus down with Enter key', async () => {
    const user = userEvent.setup()
    const rows = [makeRow('t1'), makeRow('t2')]
    rows.forEach(row => {
      weekDays.forEach((d, i) => {
        row.cells[format(d, 'yyyy-MM-dd')] = makeCell(0, 'DRAFT', `e_${row.taskId}_${i}`)
      })
    })
    renderGrid(rows)

    const firstInput = document.querySelector<HTMLInputElement>('[data-row="0"][data-col="0"]')
    firstInput?.focus()

    await user.keyboard('{Enter}')

    const nextRowInput = document.querySelector<HTMLInputElement>('[data-row="1"][data-col="0"]')
    expect(document.activeElement).toBe(nextRowInput)
  })
})
