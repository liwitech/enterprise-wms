export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
export type SprintStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED'
export type ProjectMemberRole = 'PM' | 'MEMBER' | 'VIEWER'

export interface ApiResponse<T> {
  success: boolean
  data: T
  meta?: PaginationMeta
  message?: string
  error_code?: string
}

export interface PaginationMeta {
  page: number
  per_page: number
  total: number
  total_pages: number
}

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  dept_id?: string
  org_id: string
  is_active: boolean
  avatar_url?: string
  employee_code?: string
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  code: string
  logo_url?: string
  created_at: string
}

export type DeptType = 'KHOI' | 'BAN' | 'TRUNG_TAM' | 'PHONG'

export interface Department {
  id: string
  org_id: string
  name: string
  code: string
  dept_type?: DeptType
  parent_dept_id?: string
  manager_user_id?: string
  created_at: string
  children?: Department[]
}

export interface UserBrief {
  id: string
  full_name: string
  email: string
  avatar_url?: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface ApiError {
  detail: string
}

export interface Project {
  id: string
  code: string
  name: string
  description?: string
  project_type: 'WATERFALL' | 'AGILE' | 'MIXED'
  status: ProjectStatus
  priority: Priority
  progress_percent: number
  start_date?: string
  end_date?: string
  owner_user_id: string
  org_id: string
  dept_id?: string
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: ProjectMemberRole
  user?: UserBrief
}

export interface ProjectDetail extends Project {
  members: ProjectMember[]
  milestones: Milestone[]
  task_summary: Record<string, number>
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  status: SprintStatus
  start_date?: string
  end_date?: string
  goal?: string
  created_at: string
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  due_date?: string
  status: 'PENDING' | 'ACHIEVED' | 'MISSED'
}

export type RecurrenceType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type RecurrenceEndType = 'NEVER' | 'COUNT' | 'UNTIL'

export interface Task {
  id: string
  task_code: string
  project_id: string
  parent_task_id?: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  assignee_user_id?: string
  reporter_user_id?: string
  sprint_id?: string
  start_date?: string
  due_date?: string
  estimated_hours?: number
  actual_hours?: number
  tags?: string[]
  subtasks?: Task[]
  parent?: Task
  created_at: string
  updated_at: string
  // Recurrence
  is_recurring?: boolean
  recurrence_type?: RecurrenceType
  recurrence_interval?: number
  recurrence_days?: number[]
  recurrence_end_type?: RecurrenceEndType
  recurrence_count?: number
  recurrence_until?: string
  recurrence_parent_id?: string
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  user?: UserBrief
}

export interface TimesheetEntry {
  id: string
  task_id: string
  project_id: string
  user_id: string
  work_date: string
  hours_logged: number
  description?: string
  status: TimesheetStatus
  submitted_at?: string
  approved_by?: string
  approved_at?: string
  reject_reason?: string
  created_at: string
}

export interface TimesheetEntryExtended extends TimesheetEntry {
  user?: UserBrief
  project?: { id: string; name: string; code: string }
}

export interface TimesheetSummary {
  by_project: { project_id: string; project_name: string; total_hours: number }[]
  by_day: { work_date: string; total_hours: number }[]
  by_week: { week_start: string; total_hours: number }[]
}

export interface ProjectDashboard {
  progress_percent: number
  tasks_by_status: Record<string, number>
  overdue_count: number
  upcoming_milestones: Milestone[]
  member_workload: { user_id: string; full_name: string; task_count: number }[]
  recent_activities: { message: string; timestamp: string }[]
}

// ── Executive Dashboard ────────────────────────────────────────────────────────

export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'OVERDUE'
export type AlertType = 'OVERDUE' | 'DELAYED' | 'UNASSIGNED_TASKS'
export type AlertSeverity = 'HIGH' | 'MEDIUM'

export interface DepartmentBrief {
  id: string
  name: string
  code: string
}

export interface ProjectOwner {
  id: string
  name: string
  avatar_url?: string
}

export interface DashboardProjectBrief {
  id: string
  name: string
  dept_name?: string
  owner: ProjectOwner
  status: ProjectStatus
  health: ProjectHealth
  progress_percent: number
  start_date?: string
  end_date?: string
  days_remaining?: number | null
  tasks_total: number
  tasks_done: number
}

export interface DashboardAlert {
  project_id: string
  project_name: string
  alert_type: AlertType
  message: string
  severity: AlertSeverity
}

export interface WorkloadItem {
  user_id: string
  name: string
  avatar_url?: string
  tasks_assigned: number
  tasks_overdue: number
  capacity_percent: number
}

export interface ExecutiveDashboardSummary {
  total_projects: number
  projects_on_track: number
  projects_delayed: number
  projects_overdue: number
  total_tasks_open: number
  tasks_due_soon: number
  total_employees_active: number
}

export interface ExecutiveDashboardResponse {
  summary: ExecutiveDashboardSummary
  projects: DashboardProjectBrief[]
  alerts: DashboardAlert[]
  workload: WorkloadItem[]
  timesheet_pending_count: number
}

// ── KPI Report ─────────────────────────────────────────────────────────────────

export interface MemberKPIItem {
  user_id: string
  full_name: string
  email: string
  role: ProjectMemberRole
  tasks_assigned: number
  tasks_done_ontime: number
  tasks_done_overdue: number
  tasks_done_no_deadline: number
  tasks_overdue: number
  tasks_in_progress: number
  tasks_todo: number
  ontime_rate: number | null
  total_actual_hours: number
  total_estimated_hours: number
}

export interface ProjectKPIReport {
  project_id: string
  project_name: string
  as_of: string
  members: MemberKPIItem[]
}

export interface MemberKPISummary {
  tasks_assigned: number
  tasks_done: number
  tasks_done_ontime: number
  tasks_done_overdue: number
  tasks_done_no_deadline: number
  tasks_overdue: number
  tasks_in_progress: number
  tasks_todo: number
  ontime_rate: number | null
  completion_rate: number | null
  total_actual_hours: number
  total_estimated_hours: number
}

export interface MemberKPIProjectBreakdown {
  project_id: string
  project_name: string
  tasks_assigned: number
  tasks_done_ontime: number
  tasks_done_overdue: number
  tasks_overdue: number
  ontime_rate: number | null
  total_actual_hours: number
}

export interface MemberKPIData {
  user_id: string
  full_name: string
  email: string
  as_of: string
  kpi_score: number | null
  summary: MemberKPISummary
  projects: MemberKPIProjectBreakdown[]
}
