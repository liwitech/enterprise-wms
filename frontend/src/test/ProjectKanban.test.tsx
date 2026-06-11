import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import KanbanBoard from '@/components/project/KanbanBoard'
import type { Task } from '@/types'

// ── Mock dnd-kit (drag-drop requires pointer events not available in jsdom) ───

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      isDragging: false,
    }),
    useDroppable: () => ({
      setNodeRef: vi.fn(),
      isOver: false,
    }),
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
    PointerSensor: vi.fn(),
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(id: string, status: Task['status'], overrides: Partial<Task> = {}): Task {
  return {
    id,
    task_code: `TASK-${id.padStart(4, '0')}`,
    project_id: 'p1',
    title: `Task ${id}`,
    status,
    priority: 'MEDIUM',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderKanban(
  tasks: Task[],
  {
    onStatusChange = vi.fn(),
    onTaskClick = vi.fn(),
  }: {
    onStatusChange?: (id: string, status: Task['status']) => void
    onTaskClick?: (id: string) => void
  } = {},
) {
  return {
    onStatusChange,
    onTaskClick,
    ...render(
      <KanbanBoard
        tasks={tasks}
        onStatusChange={onStatusChange}
        onTaskClick={onTaskClick}
      />,
    ),
  }
}

// ── Column rendering ──────────────────────────────────────────────────────────

describe('KanbanBoard — column rendering', () => {
  it('renders all four columns', () => {
    renderKanban([])
    expect(screen.getByText('Cần làm')).toBeInTheDocument()
    expect(screen.getByText('Đang làm')).toBeInTheDocument()
    expect(screen.getByText('Xem xét')).toBeInTheDocument()
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument()
  })

  it('shows task count badges for each column', () => {
    const tasks = [
      makeTask('t1', 'TODO'),
      makeTask('t2', 'TODO'),
      makeTask('t3', 'IN_PROGRESS'),
      makeTask('t4', 'DONE'),
    ]
    renderKanban(tasks)
    // Column headers have count badges
    const allTwos = screen.getAllByText('2')
    expect(allTwos.length).toBeGreaterThanOrEqual(1) // TODO column = 2
  })

  it('shows zero count badge when column empty', () => {
    renderKanban([])
    const zeroBadges = screen.getAllByText('0')
    expect(zeroBadges).toHaveLength(4) // all four columns
  })

  it('places tasks in correct columns', () => {
    const tasks = [
      makeTask('t1', 'TODO', { title: 'Todo Task' }),
      makeTask('t2', 'IN_PROGRESS', { title: 'In-Progress Task' }),
      makeTask('t3', 'IN_REVIEW', { title: 'Review Task' }),
      makeTask('t4', 'DONE', { title: 'Done Task' }),
    ]
    renderKanban(tasks)
    expect(screen.getByText('Todo Task')).toBeInTheDocument()
    expect(screen.getByText('In-Progress Task')).toBeInTheDocument()
    expect(screen.getByText('Review Task')).toBeInTheDocument()
    expect(screen.getByText('Done Task')).toBeInTheDocument()
  })

  it('does not render CANCELLED tasks in any column', () => {
    const tasks = [
      makeTask('t1', 'TODO', { title: 'Active Task' }),
      makeTask('t2', 'CANCELLED', { title: 'Cancelled Task' }),
    ]
    renderKanban(tasks)
    expect(screen.getByText('Active Task')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled Task')).not.toBeInTheDocument()
  })

  it('renders multiple tasks in same column', () => {
    const tasks = [
      makeTask('t1', 'TODO', { title: 'First TODO' }),
      makeTask('t2', 'TODO', { title: 'Second TODO' }),
      makeTask('t3', 'TODO', { title: 'Third TODO' }),
    ]
    renderKanban(tasks)
    expect(screen.getByText('First TODO')).toBeInTheDocument()
    expect(screen.getByText('Second TODO')).toBeInTheDocument()
    expect(screen.getByText('Third TODO')).toBeInTheDocument()
  })
})

// ── Task card rendering ───────────────────────────────────────────────────────

describe('KanbanBoard — task card content', () => {
  it('renders task title on card', () => {
    renderKanban([makeTask('t1', 'TODO', { title: 'Important Feature' })])
    expect(screen.getByText('Important Feature')).toBeInTheDocument()
  })

  it('renders priority label', () => {
    renderKanban([makeTask('t1', 'TODO', { priority: 'CRITICAL' })])
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
  })

  it('renders due date when set and not overdue', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 10)
    const dueDateStr = futureDate.toISOString().split('T')[0]
    renderKanban([makeTask('t1', 'TODO', { due_date: dueDateStr })])
    // Should render the date in dd/MM format
    const [year, month, day] = dueDateStr.split('-')
    expect(screen.getByText(`${day}/${month}`)).toBeInTheDocument()
  })

  it('renders overdue indicator for past due date non-DONE tasks', () => {
    const pastDate = '2020-01-01'
    renderKanban([makeTask('t1', 'IN_PROGRESS', { due_date: pastDate })])
    expect(screen.getByText('Quá hạn')).toBeInTheDocument()
  })

  it('does NOT show overdue for DONE tasks regardless of due date', () => {
    const pastDate = '2020-01-01'
    renderKanban([makeTask('t1', 'DONE', { due_date: pastDate })])
    expect(screen.queryByText('Quá hạn')).not.toBeInTheDocument()
  })

  it('renders priority with correct color class for CRITICAL', () => {
    const { container } = renderKanban([makeTask('t1', 'TODO', { priority: 'CRITICAL' })])
    const priorityEl = screen.getByText('CRITICAL')
    expect(priorityEl.className).toContain('text-red')
  })

  it('renders priority for LOW tasks', () => {
    renderKanban([makeTask('t1', 'TODO', { priority: 'LOW' })])
    expect(screen.getByText('LOW')).toBeInTheDocument()
  })
})

// ── Interactions ──────────────────────────────────────────────────────────────

describe('KanbanBoard — interactions', () => {
  it('calls onTaskClick when task card is clicked', async () => {
    const user = userEvent.setup()
    const onTaskClick = vi.fn()
    renderKanban([makeTask('task-id-1', 'TODO', { title: 'Clickable Task' })], { onTaskClick })

    await user.click(screen.getByText('Clickable Task'))
    expect(onTaskClick).toHaveBeenCalledWith('task-id-1')
  })

  it('calls onTaskClick with correct task id', async () => {
    const user = userEvent.setup()
    const onTaskClick = vi.fn()
    renderKanban(
      [
        makeTask('task-a', 'TODO', { title: 'Task A' }),
        makeTask('task-b', 'TODO', { title: 'Task B' }),
      ],
      { onTaskClick },
    )

    await user.click(screen.getByText('Task B'))
    expect(onTaskClick).toHaveBeenCalledWith('task-b')
    expect(onTaskClick).toHaveBeenCalledTimes(1)
  })

  it('renders drag overlay container', () => {
    renderKanban([makeTask('t1', 'TODO')])
    expect(screen.getByTestId('drag-overlay')).toBeInTheDocument()
  })
})

// ── Empty and edge cases ──────────────────────────────────────────────────────

describe('KanbanBoard — edge cases', () => {
  it('renders with empty task list', () => {
    renderKanban([])
    // Four columns should still be visible
    expect(screen.getByText('Cần làm')).toBeInTheDocument()
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument()
  })

  it('renders with many tasks across columns', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => {
      const statuses: Task['status'][] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']
      return makeTask(`t${i}`, statuses[i % 4], { title: `Task ${i}` })
    })
    renderKanban(tasks)
    expect(screen.getAllByText(/Task \d+/).length).toBe(20)
  })

  it('renders task without optional fields', () => {
    const minimalTask = makeTask('t1', 'TODO', { title: 'Minimal' })
    renderKanban([minimalTask])
    expect(screen.getByText('Minimal')).toBeInTheDocument()
    expect(screen.queryByText('Quá hạn')).not.toBeInTheDocument()
  })
})
