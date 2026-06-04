import { cn } from '@/utils/cn'
import type { TaskStatus, Priority, ProjectStatus, TimesheetStatus, SprintStatus, ProjectHealth } from '@/types'

const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  TODO: { label: 'Cần làm', cls: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Đang xem xét', cls: 'bg-yellow-100 text-yellow-700' },
  DONE: { label: 'Hoàn thành', cls: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-red-100 text-red-700' },
}

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  LOW: { label: 'Thấp', cls: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Trung bình', cls: 'bg-blue-100 text-blue-600' },
  HIGH: { label: 'Cao', cls: 'bg-orange-100 text-orange-700' },
  CRITICAL: { label: 'Khẩn cấp', cls: 'bg-red-100 text-red-700' },
}

const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  PLANNING: { label: 'Lên kế hoạch', cls: 'bg-purple-100 text-purple-700' },
  IN_PROGRESS: { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700' },
  ON_HOLD: { label: 'Tạm dừng', cls: 'bg-yellow-100 text-yellow-700' },
  COMPLETED: { label: 'Đã hoàn thành', cls: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-red-100 text-red-700' },
}

const TIMESHEET_STATUS: Record<TimesheetStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'Đã nộp', cls: 'bg-blue-100 text-blue-700' },
  APPROVED: { label: 'Đã duyệt', cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Đã từ chối', cls: 'bg-red-100 text-red-700' },
}

const SPRINT_STATUS: Record<SprintStatus, { label: string; cls: string }> = {
  PLANNING: { label: 'Lên kế hoạch', cls: 'bg-purple-100 text-purple-700' },
  ACTIVE: { label: 'Đang chạy', cls: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Đã hoàn thành', cls: 'bg-gray-100 text-gray-700' },
}

interface BadgeProps {
  className?: string
  children: React.ReactNode
  variant?: string
}

function Badge({ children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  )
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { label, cls } = TASK_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
  return <Badge className={cls}>{label}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, cls } = PRIORITY[priority] ?? { label: priority, cls: 'bg-gray-100 text-gray-600' }
  return <Badge className={cls}>{label}</Badge>
}

const HEALTH_STYLE: Record<ProjectHealth, { label: string; cls: string }> = {
  ON_TRACK: { label: 'Đúng tiến độ', cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
  AT_RISK: { label: 'Có rủi ro', cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
  OVERDUE: { label: 'Quá hạn', cls: 'bg-red-100 text-red-700 ring-1 ring-red-200' },
}

export function ProjectStatusBadge({ status, health }: { status: ProjectStatus; health?: ProjectHealth }) {
  const statusInfo = PROJECT_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
  const cls = health ? (HEALTH_STYLE[health]?.cls ?? statusInfo.cls) : statusInfo.cls
  return <Badge className={cls}>{statusInfo.label}</Badge>
}

export function HealthBadge({ health }: { health: ProjectHealth }) {
  const { label, cls } = HEALTH_STYLE[health] ?? { label: health, cls: 'bg-gray-100 text-gray-600' }
  return <Badge className={cls}>{label}</Badge>
}

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  const { label, cls } = TIMESHEET_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <Badge className={cls}>{label}</Badge>
}

export function SprintStatusBadge({ status }: { status: SprintStatus }) {
  const { label, cls } = SPRINT_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
  return <Badge className={cls}>{label}</Badge>
}

export const TASK_STATUS_LABEL = Object.fromEntries(
  Object.entries(TASK_STATUS).map(([k, v]) => [k, v.label])
) as Record<TaskStatus, string>

export const PRIORITY_LABEL = Object.fromEntries(
  Object.entries(PRIORITY).map(([k, v]) => [k, v.label])
) as Record<Priority, string>

export const PROJECT_STATUS_LABEL = Object.fromEntries(
  Object.entries(PROJECT_STATUS).map(([k, v]) => [k, v.label])
) as Record<ProjectStatus, string>

export const TIMESHEET_STATUS_LABEL = Object.fromEntries(
  Object.entries(TIMESHEET_STATUS).map(([k, v]) => [k, v.label])
) as Record<TimesheetStatus, string>

export default Badge
