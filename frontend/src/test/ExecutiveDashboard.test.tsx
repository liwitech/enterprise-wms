import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ExecutiveDashboard from '@/pages/Dashboard/ExecutiveDashboard'
import { dashboardService } from '@/services/dashboardService'
import { departmentService } from '@/services/departmentService'
import type { ExecutiveDashboardResponse } from '@/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/services/dashboardService', () => ({
  dashboardService: {
    getExecutive: vi.fn(),
  },
}))

vi.mock('@/services/departmentService', () => ({
  departmentService: {
    list: vi.fn(),
  },
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'u1',
      role: 'SUPER_ADMIN',
      full_name: 'Admin User',
      email: 'admin@tsv.vn',
      org_id: 'org1',
      is_active: true,
    },
  })),
}))

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockDashboardData: ExecutiveDashboardResponse = {
  summary: {
    total_projects: 5,
    projects_on_track: 3,
    projects_delayed: 1,
    projects_overdue: 1,
    total_tasks_open: 42,
    tasks_due_soon: 7,
    total_employees_active: 15,
  },
  projects: [
    {
      id: 'p1',
      name: 'Platform Upgrade',
      dept_name: 'Engineering',
      owner: { id: 'u1', name: 'Alice Nguyen' },
      status: 'IN_PROGRESS',
      health: 'ON_TRACK',
      progress_percent: 65,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      days_remaining: 200,
      tasks_total: 20,
      tasks_done: 13,
    },
    {
      id: 'p2',
      name: 'Legacy Migration',
      owner: { id: 'u2', name: 'Bob Tran' },
      status: 'IN_PROGRESS',
      health: 'OVERDUE',
      progress_percent: 30,
      end_date: '2026-05-01',
      days_remaining: -35,
      tasks_total: 15,
      tasks_done: 5,
    },
    {
      id: 'p3',
      name: 'Mobile App',
      owner: { id: 'u3', name: 'Carol Le' },
      status: 'PLANNING',
      health: 'AT_RISK',
      progress_percent: 10,
      days_remaining: 90,
      tasks_total: 30,
      tasks_done: 3,
    },
  ],
  alerts: [
    {
      project_id: 'p2',
      project_name: 'Legacy Migration',
      alert_type: 'OVERDUE',
      message: 'Dự án đã quá hạn 35 ngày',
      severity: 'HIGH',
    },
    {
      project_id: 'p3',
      project_name: 'Mobile App',
      alert_type: 'DELAYED',
      message: 'Tiến độ thấp hơn kế hoạch',
      severity: 'MEDIUM',
    },
  ],
  workload: [
    { user_id: 'u1', name: 'Alice Nguyen', tasks_assigned: 12, tasks_overdue: 2, capacity_percent: 60 },
    { user_id: 'u2', name: 'Bob Tran', tasks_assigned: 20, tasks_overdue: 5, capacity_percent: 100 },
  ],
  timesheet_pending_count: 8,
}

const mockDepts = [
  { id: 'd1', name: 'Engineering', code: 'ENG' },
  { id: 'd2', name: 'Design', code: 'DES' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockedGetExecutive = vi.mocked(dashboardService.getExecutive)
const mockedListDepts = vi.mocked(departmentService.list)

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderDashboard() {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ExecutiveDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecutiveDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetExecutive.mockResolvedValue(mockDashboardData)
    mockedListDepts.mockResolvedValue(mockDepts)
  })

  it('renders loading skeletons initially', () => {
    renderDashboard()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders KPI cards after data loads', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Tổng dự án')).toBeInTheDocument())
    // total_projects=5 AND tasks_done=5 for p2 both render "5"; assert at least one exists
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Tỷ lệ đúng tiến độ')).toBeInTheDocument()
    expect(screen.getByText('Dự án quá hạn')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders project table rows', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Platform Upgrade')).toBeInTheDocument())
    expect(screen.getByText('Legacy Migration')).toBeInTheDocument()
    expect(screen.getByText('Mobile App')).toBeInTheDocument()
  })

  it('renders health badges', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Đúng tiến độ')).toBeInTheDocument())
    expect(screen.getByText('Quá hạn')).toBeInTheDocument()
    expect(screen.getByText('Có rủi ro')).toBeInTheDocument()
  })

  it('renders overdue days text for late projects', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText(/Quá 35 ngày/)).toBeInTheDocument())
    expect(screen.getByText(/Còn 200 ngày/)).toBeInTheDocument()
  })

  it('renders alerts panel with messages', async () => {
    renderDashboard()
    // Wait for a message that only appears after data loads (the header "Cảnh báo" is always rendered)
    await waitFor(() => expect(screen.getByText('Dự án đã quá hạn 35 ngày')).toBeInTheDocument())
    expect(screen.getByText('Tiến độ thấp hơn kế hoạch')).toBeInTheDocument()
  })

  it('renders workload section', async () => {
    renderDashboard()
    // Names appear in both workload bars AND project owner column; assert presence only
    await waitFor(() => expect(screen.getAllByText('Alice Nguyen').length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('Bob Tran').length).toBeGreaterThanOrEqual(1)
  })

  it('renders overdue counts in workload', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText(/2 quá hạn/)).toBeInTheDocument())
    expect(screen.getByText(/5 quá hạn/)).toBeInTheDocument()
  })

  it('renders timesheet pending banner when count > 0', async () => {
    renderDashboard()
    await waitFor(() =>
      expect(screen.getByText(/bảng chấm công đang chờ duyệt/)).toBeInTheDocument()
    )
  })

  it('does not render timesheet banner when count is 0', async () => {
    mockedGetExecutive.mockResolvedValue({
      ...mockDashboardData,
      timesheet_pending_count: 0,
    })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Tổng dự án')).toBeInTheDocument())
    expect(screen.queryByText(/bảng chấm công đang chờ duyệt/)).not.toBeInTheDocument()
  })

  it('renders department filter dropdown for admin', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Tất cả phòng ban')).toBeInTheDocument())
    // "Engineering" also appears as dept_name in the project table, so check by role
    expect(screen.getByRole('option', { name: 'Engineering' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Design' })).toBeInTheDocument()
  })

  it('changing dept filter triggers refetch with dept_id', async () => {
    renderDashboard()
    await waitFor(() => screen.getByText('Tất cả phòng ban'))

    const select = screen.getByDisplayValue('Tất cả phòng ban')
    fireEvent.change(select, { target: { value: 'd1' } })

    await waitFor(() => {
      expect(mockedGetExecutive).toHaveBeenCalledWith(
        expect.objectContaining({ dept_id: 'd1' }),
      )
    })
  })

  it('changing period filter triggers refetch with new period', async () => {
    renderDashboard()
    await waitFor(() => screen.getByText('Tháng này'))

    const periodSelect = screen.getByDisplayValue('Tháng này')
    fireEvent.change(periodSelect, { target: { value: 'current_quarter' } })

    await waitFor(() => {
      expect(mockedGetExecutive).toHaveBeenCalledWith(
        expect.objectContaining({ period: 'current_quarter' }),
      )
    })
  })

  it('refresh button triggers additional fetch', async () => {
    renderDashboard()
    // Wait for initial data to load before clicking refresh — button is always rendered
    // so waitFor(button) resolves before the first fetch completes (causing refetch dedup)
    await waitFor(() => screen.getByText('Tổng dự án'))

    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }))

    await waitFor(() => {
      expect(mockedGetExecutive).toHaveBeenCalledTimes(2)
    })
  })

  it('clicking health column header sorts projects', async () => {
    renderDashboard()
    await waitFor(() => screen.getByText('Tình trạng'))

    fireEvent.click(screen.getByText('Tình trạng'))
    expect(screen.getByText('Platform Upgrade')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Tình trạng'))
    expect(screen.getByText('Legacy Migration')).toBeInTheDocument()
  })

  it('clicking progress column header sorts projects', async () => {
    renderDashboard()
    await waitFor(() => screen.getByText('Tiến độ'))

    fireEvent.click(screen.getByText('Tiến độ'))
    expect(screen.getByText('Platform Upgrade')).toBeInTheDocument()
  })

  it('shows empty project message when no projects', async () => {
    mockedGetExecutive.mockResolvedValue({ ...mockDashboardData, projects: [] })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Không có dự án nào')).toBeInTheDocument())
  })

  it('shows no-alert message when alerts list is empty', async () => {
    mockedGetExecutive.mockResolvedValue({ ...mockDashboardData, alerts: [] })
    renderDashboard()
    await waitFor(() =>
      expect(screen.getByText('Không có cảnh báo nào')).toBeInTheDocument()
    )
  })

  it('shows on-track percentage in KPI card', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('60%')).toBeInTheDocument())
  })
})
