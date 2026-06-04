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
  title: string
  due_date?: string
  status: 'PENDING' | 'ACHIEVED' | 'MISSED'
}

export interface Task {
  id: string
  project_id: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  assignee_user_id?: string
  reporter_user_id?: string
  sprint_id?: string
  due_date?: string
  estimated_hours?: number
  actual_hours?: number
  tags?: string[]
  created_at: string
  updated_at: string
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
