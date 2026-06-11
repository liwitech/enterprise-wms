import { useMemo, useState } from 'react'
import {
  addDays, differenceInDays, format, startOfMonth,
  endOfMonth, eachMonthOfInterval, parseISO,
} from 'date-fns'
import { vi } from 'date-fns/locale'
import { ChevronRight, GitBranch } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Task, TaskStatus } from '@/types'

const DAY_W = 32
const ROW_H = 40
const HEADER_H = 52
const LABEL_W = 260

const STATUS_BAR: Record<TaskStatus, string> = {
  TODO:        'bg-slate-400 hover:bg-slate-500',
  IN_PROGRESS: 'bg-blue-500 hover:bg-blue-600',
  IN_REVIEW:   'bg-amber-500 hover:bg-amber-600',
  DONE:        'bg-emerald-500 hover:bg-emerald-600',
  CANCELLED:   'bg-red-300 hover:bg-red-400',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO:        'Cần làm',
  IN_PROGRESS: 'Đang làm',
  IN_REVIEW:   'Xem xét',
  DONE:        'Hoàn thành',
  CANCELLED:   'Đã hủy',
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

interface TaskNode {
  task: Task
  children: TaskNode[]
}

function buildTree(tasks: Task[]): TaskNode[] {
  const map = new Map<string, TaskNode>()
  tasks.forEach((t) => map.set(t.id, { task: t, children: [] }))
  const roots: TaskNode[] = []
  tasks.forEach((t) => {
    const node = map.get(t.id)!
    if (t.parent_task_id && map.has(t.parent_task_id)) {
      map.get(t.parent_task_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function collectChildDates(children: TaskNode[]): { starts: string[]; dues: string[] } {
  const starts: string[] = []
  const dues: string[] = []
  children.forEach((n) => {
    if (n.task.start_date) starts.push(n.task.start_date)
    if (n.task.due_date) dues.push(n.task.due_date)
    const nested = collectChildDates(n.children)
    starts.push(...nested.starts)
    dues.push(...nested.dues)
  })
  return { starts, dues }
}

function getEffectiveDates(task: Task, children: TaskNode[]) {
  const { starts, dues } = collectChildDates(children)
  const derivedStart = !task.start_date && starts.length > 0 ? [...starts].sort()[0] : undefined
  const derivedDue   = !task.due_date   && dues.length > 0   ? [...dues].sort().reverse()[0] : undefined
  return {
    startDate:    task.start_date ?? derivedStart,
    dueDate:      task.due_date   ?? derivedDue,
    startDerived: !task.start_date && !!derivedStart,
    dueDerived:   !task.due_date   && !!derivedDue,
  }
}

// Flatten tree into ordered rows for rendering (depth-first, respecting expand state)
interface GanttRow {
  task: Task
  depth: number
  hasChildren: boolean
  startDate: string | undefined
  dueDate: string | undefined
  isDerived: boolean
  treeLines: boolean[]   // for each ancestor depth 0..depth-1: show vertical pass-through line?
  isLastSibling: boolean // is this node the last child in its parent's children list?
}

function flattenTree(nodes: TaskNode[], expandedIds: Set<string>, depth = 0, treeLines: boolean[] = []): GanttRow[] {
  const rows: GanttRow[] = []
  nodes.forEach((node, idx) => {
    const { task, children } = node
    const hasChildren = children.length > 0
    const eff = getEffectiveDates(task, children)
    const isLastSibling = idx === nodes.length - 1
    rows.push({
      task,
      depth,
      hasChildren,
      startDate: eff.startDate,
      dueDate: eff.dueDate,
      isDerived: eff.startDerived || eff.dueDerived,
      treeLines,
      isLastSibling,
    })
    if (hasChildren && expandedIds.has(task.id)) {
      rows.push(...flattenTree(children, expandedIds, depth + 1, [...treeLines, !isLastSibling]))
    }
  })
  return rows
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  tasks: Task[]
  projectStart?: string
  projectEnd?: string
  onTaskClick: (taskId: string) => void
}

export default function GanttChart({ tasks, projectStart, projectEnd, onTaskClick }: Props) {
  const tree = useMemo(() => buildTree(tasks), [tasks])

  // Expand all parents by default
  const defaultExpanded = useMemo(() => {
    const ids = new Set<string>()
    function walk(nodes: TaskNode[]) {
      nodes.forEach((n) => {
        if (n.children.length > 0) { ids.add(n.task.id); walk(n.children) }
      })
    }
    walk(tree)
    return ids
  }, [tree])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(defaultExpanded)

  // Re-sync when tree changes (new tasks added)
  const rows = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds])

  // Compute overall date range from all tasks (including derived)
  const { rangeStart, rangeEnd, totalDays, months } = useMemo(() => {
    const dateParts = rows.flatMap((r) => [r.startDate, r.dueDate]).filter(Boolean) as string[]
    const extra = [projectStart, projectEnd].filter(Boolean) as string[]
    const all = [...dateParts, ...extra]
    if (all.length === 0) return { rangeStart: null, rangeEnd: null, totalDays: 0, months: [] }

    const timestamps = all.map((d) => parseISO(d).getTime())
    const minD = addDays(new Date(Math.min(...timestamps)), -7)
    const maxD = addDays(new Date(Math.max(...timestamps)), 7)
    return {
      rangeStart: minD,
      rangeEnd: maxD,
      totalDays: differenceInDays(maxD, minD) + 1,
      months: eachMonthOfInterval({ start: minD, end: maxD }),
    }
  }, [rows, projectStart, projectEnd])

  if (!rangeStart || rows.every((r) => !r.startDate && !r.dueDate)) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
        <p>Chưa có công việc nào có ngày bắt đầu hoặc hạn chót</p>
        <p className="text-xs">Thiết lập ngày bắt đầu và hạn chót cho công việc để hiển thị trên Gantt</p>
      </div>
    )
  }

  const timelineW = totalDays * DAY_W
  const todayOffset = differenceInDays(new Date(), rangeStart!)

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Legend */}
      <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2 flex-wrap">
        {(Object.keys(STATUS_BAR) as TaskStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={cn('h-2.5 w-2.5 rounded-sm', STATUS_BAR[s].split(' ')[0])} />
            <span className="text-xs text-slate-500">{STATUS_LABEL[s]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="h-2.5 w-10 rounded-sm bg-slate-300 opacity-50 border border-dashed border-slate-400" />
          <span className="text-xs text-slate-400 italic">* Tự động từ CV con</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ width: LABEL_W + timelineW }}>

          {/* Header */}
          <div className="flex border-b-2 border-slate-200" style={{ height: HEADER_H }}>
            <div
              className="shrink-0 sticky left-0 z-20 border-r border-slate-200 bg-slate-50 flex items-end px-4 pb-2"
              style={{ width: LABEL_W }}
            >
              <span className="text-xs font-medium text-slate-500">Công việc</span>
            </div>
            <div className="relative flex-1" style={{ width: timelineW }}>
              {months.map((month) => {
                const mStart = month < rangeStart! ? rangeStart! : startOfMonth(month)
                const mEnd = endOfMonth(month) > rangeEnd! ? rangeEnd! : endOfMonth(month)
                const offsetDays = differenceInDays(mStart, rangeStart!)
                const spanDays = differenceInDays(mEnd, mStart) + 1
                return (
                  <div
                    key={month.toISOString()}
                    className="absolute bottom-0 flex flex-col items-start justify-between border-r border-slate-200 px-2 pt-1.5"
                    style={{ left: offsetDays * DAY_W, width: spanDays * DAY_W, height: HEADER_H }}
                  >
                    <span className="text-[11px] font-semibold text-slate-600">
                      {format(month, 'MMMM yyyy', { locale: vi })}
                    </span>
                    <div className="flex w-full pb-0.5">
                      {Array.from({ length: spanDays }, (_, i) => {
                        const day = addDays(mStart, i)
                        const dom = day.getDate()
                        const isW = day.getDay() === 0 || day.getDay() === 6
                        return dom === 1 || dom % 5 === 0 ? (
                          <span
                            key={i}
                            className={cn('absolute bottom-1 text-[9px]', isW ? 'text-red-400' : 'text-slate-400')}
                            style={{ left: (offsetDays + i) * DAY_W + 2 }}
                          >
                            {dom}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                )
              })}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                  style={{ left: todayOffset * DAY_W + DAY_W / 2 }}
                />
              )}
            </div>
          </div>

          {/* Task rows */}
          {rows.map((row, idx) => {
            const { task, depth, hasChildren, startDate, dueDate, isDerived } = row
            if (!startDate && !dueDate) {
              // Row with no dates — show label only, no bar
              return (
                <div
                  key={task.id}
                  className={cn('flex border-b border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                  style={{ height: ROW_H }}
                >
                  <GanttLabel
                    task={task}
                    depth={depth}
                    hasChildren={hasChildren}
                    expanded={expandedIds.has(task.id)}
                    onToggle={() => toggleExpand(task.id)}
                    onTaskClick={onTaskClick}
                    isDerived={isDerived}
                    idx={idx}
                    treeLines={row.treeLines}
                    isLastSibling={row.isLastSibling}
                  />
                  <div className="relative flex-1" style={{ width: timelineW }}>
                    <WeekendShading months={months} rangeStart={rangeStart!} rangeEnd={rangeEnd!} />
                    <TodayLine todayOffset={todayOffset} totalDays={totalDays} />
                  </div>
                </div>
              )
            }

            const rawStart = startDate ? parseISO(startDate) : null
            const rawEnd   = dueDate   ? parseISO(dueDate)   : null
            const barStart = rawStart ?? rawEnd!
            const barEnd   = rawEnd   ?? rawStart!
            const leftPx   = differenceInDays(barStart, rangeStart!) * DAY_W
            const widthPx  = Math.max((differenceInDays(barEnd, barStart) + 1) * DAY_W, DAY_W)

            const isOverdue =
              dueDate &&
              new Date(dueDate) < new Date() &&
              task.status !== 'DONE' &&
              task.status !== 'CANCELLED'

            const barCls = STATUS_BAR[task.status] ?? 'bg-slate-400 hover:bg-slate-500'

            return (
              <div
                key={task.id}
                className={cn('flex border-b border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                style={{ height: ROW_H }}
              >
                <GanttLabel
                  task={task}
                  depth={depth}
                  hasChildren={hasChildren}
                  expanded={expandedIds.has(task.id)}
                  onToggle={() => toggleExpand(task.id)}
                  onTaskClick={onTaskClick}
                  isDerived={isDerived}
                  idx={idx}
                  treeLines={row.treeLines}
                  isLastSibling={row.isLastSibling}
                />

                <div className="relative flex-1" style={{ width: timelineW }}>
                  <WeekendShading months={months} rangeStart={rangeStart!} rangeEnd={rangeEnd!} />
                  <TodayLine todayOffset={todayOffset} totalDays={totalDays} />

                  {/* Task bar */}
                  <div
                    className={cn(
                      'absolute top-2.5 bottom-2.5 rounded cursor-pointer transition-all shadow-sm',
                      isDerived ? 'opacity-60 border border-dashed border-slate-400' : barCls,
                      !isDerived && barCls,
                      isOverdue && !isDerived && 'ring-1 ring-red-500 ring-offset-1',
                    )}
                    style={{ left: leftPx, width: widthPx }}
                    onClick={() => onTaskClick(task.id)}
                    title={[
                      task.title,
                      STATUS_LABEL[task.status],
                      startDate ? `Bắt đầu: ${format(parseISO(startDate), 'dd/MM/yyyy')}${isDerived ? ' *' : ''}` : '',
                      dueDate   ? `Hạn: ${format(parseISO(dueDate), 'dd/MM/yyyy')}${isDerived ? ' *' : ''}` : '',
                    ].filter(Boolean).join(' | ')}
                  >
                    {widthPx >= 60 && (
                      <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 truncate text-[10px] font-medium text-white">
                        {task.title}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GanttLabel({
  task, depth, hasChildren, expanded, onToggle, onTaskClick, isDerived, idx, treeLines, isLastSibling,
}: {
  task: Task
  depth: number
  hasChildren: boolean
  expanded: boolean
  onToggle: () => void
  onTaskClick: (id: string) => void
  isDerived: boolean
  idx: number
  treeLines: boolean[]
  isLastSibling: boolean
}) {
  return (
    <div
      className={cn(
        'sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-slate-200 pl-2 pr-1 transition-colors overflow-hidden',
        idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100',
      )}
      style={{ width: LABEL_W }}
    >
      {/* Tree guide: ancestor pass-through lines + connector to this node */}
      {depth > 0 && (
        <div className="flex shrink-0 self-stretch" style={{ width: depth * 16 }}>
          {treeLines.slice(0, -1).map((showLine, i) => (
            <div key={i} className="relative self-stretch shrink-0" style={{ width: 16 }}>
              {showLine && <div className="absolute left-[7px] inset-y-0 w-px bg-slate-200" />}
            </div>
          ))}
          <div className="relative self-stretch shrink-0" style={{ width: 16 }}>
            <div className="absolute left-[7px] top-0 h-1/2 w-px bg-slate-200" />
            {!isLastSibling && (
              <div className="absolute left-[7px] top-1/2 h-1/2 w-px bg-slate-200" />
            )}
            <div className="absolute left-[7px] top-1/2 w-[9px] h-px bg-slate-200" />
          </div>
        </div>
      )}

      {/* Expand toggle */}
      <button
        className={cn(
          'shrink-0 rounded p-0.5 transition-colors',
          hasChildren ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-200' : 'invisible',
        )}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
      </button>

      {/* Task code */}
      <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-mono text-slate-400">
        {task.task_code}
      </span>

      {/* Title — click to open detail */}
      <span
        className={cn(
          'truncate text-xs cursor-pointer hover:text-red-600',
          depth === 0 ? 'font-medium text-slate-800' : 'text-slate-600',
        )}
        onClick={() => onTaskClick(task.id)}
      >
        {task.title}
      </span>

      {/* Subtask count badge */}
      {hasChildren && (
        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 flex items-center gap-0.5">
          <GitBranch className="h-2.5 w-2.5" />
        </span>
      )}

      {/* Derived indicator */}
      {isDerived && (
        <span className="shrink-0 text-[10px] italic text-slate-300" title="Ngày tự động từ công việc con">*</span>
      )}
    </div>
  )
}

function WeekendShading({
  months, rangeStart, rangeEnd,
}: {
  months: Date[]
  rangeStart: Date
  rangeEnd: Date
}) {
  return (
    <>
      {months.map((month) => {
        const mStart = month < rangeStart ? rangeStart : startOfMonth(month)
        const mEnd = endOfMonth(month) > rangeEnd ? rangeEnd : endOfMonth(month)
        const spanDays = differenceInDays(mEnd, mStart) + 1
        return Array.from({ length: spanDays }, (_, i) => {
          const day = addDays(mStart, i)
          if (day.getDay() !== 0 && day.getDay() !== 6) return null
          const offset = differenceInDays(day, rangeStart)
          return (
            <div
              key={`${month.toISOString()}-${i}`}
              className="absolute inset-y-0 bg-slate-100/60"
              style={{ left: offset * DAY_W, width: DAY_W }}
            />
          )
        })
      })}
    </>
  )
}

function TodayLine({ todayOffset, totalDays }: { todayOffset: number; totalDays: number }) {
  if (todayOffset < 0 || todayOffset > totalDays) return null
  return (
    <div
      className="absolute inset-y-0 w-px bg-red-400/60 z-10"
      style={{ left: todayOffset * DAY_W + DAY_W / 2 }}
    />
  )
}
