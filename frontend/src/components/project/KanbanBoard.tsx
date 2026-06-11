import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, Clock, GripVertical } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'
import type { Task, TaskStatus } from '@/types'

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'TODO', label: 'Cần làm', color: 'border-t-slate-400' },
  { id: 'IN_PROGRESS', label: 'Đang làm', color: 'border-t-indigo-500' },
  { id: 'IN_REVIEW', label: 'Xem xét', color: 'border-t-amber-500' },
  { id: 'DONE', label: 'Hoàn thành', color: 'border-t-emerald-500' },
]

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-slate-400',
}

interface Props {
  tasks: Task[]
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onTaskClick: (taskId: string) => void
}

function TaskCard({
  task,
  isDragging,
  onClick,
}: {
  task: Task
  isDragging?: boolean
  onClick: () => void
}) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'DONE'
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-3 shadow-sm cursor-pointer hover:border-red-300 transition-colors select-none',
        isDragging && 'opacity-50',
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 line-clamp-2 flex-1">{task.title}</p>
        <GripVertical className="h-4 w-4 shrink-0 text-slate-300 mt-0.5" />
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {task.priority && (
          <span className={cn('text-xs font-medium', PRIORITY_COLOR[task.priority] ?? 'text-slate-500')}>
            {task.priority}
          </span>
        )}
        {isOverdue && (
          <span className="flex items-center gap-0.5 text-xs text-red-500">
            <AlertCircle className="h-3 w-3" />
            Quá hạn
          </span>
        )}
        {task.due_date && !isOverdue && (
          <span className="flex items-center gap-0.5 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {format(new Date(task.due_date), 'dd/MM')}
          </span>
        )}
      </div>
    </div>
  )
}

function DraggableCard({
  task,
  onClick,
}: {
  task: Task
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
    >
      <TaskCard task={task} isDragging={isDragging} onClick={onClick} />
    </div>
  )
}

function DroppableColumn({
  column,
  tasks,
  onTaskClick,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  onTaskClick: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  return (
    <div className="flex flex-col min-w-[220px] flex-1">
      <div
        className={cn(
          'flex items-center justify-between rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-3 py-2 border-t-4',
          column.color,
        )}
      >
        <span className="text-xs font-semibold text-slate-600">{column.label}</span>
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-[200px] rounded-b-lg border border-slate-200 bg-slate-50/50 p-2 space-y-2 transition-colors',
          isOver && 'bg-red-50 border-red-200',
        )}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} />
        ))}
      </div>
    </div>
  )
}

export default function KanbanBoard({ tasks, onStatusChange, onTaskClick }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const columnTasks = (status: TaskStatus) => tasks.filter((t) => t.status === status)

  function handleDragStart(e: DragStartEvent) {
    const task = tasks.find((t) => t.id === e.active.id)
    setActiveTask(task ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = e
    if (!over) return
    const newStatus = over.id as TaskStatus
    const task = tasks.find((t) => t.id === active.id)
    if (task && task.status !== newStatus) {
      onStatusChange(task.id, newStatus)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.id}
            column={col}
            tasks={columnTasks(col.id)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rotate-2 opacity-90">
            <TaskCard task={activeTask} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
