import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Shield, Clock, CheckSquare2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores/authStore'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import TimesheetApprovalTab from '@/components/approvals/TimesheetApprovalTab'
import PendingTasksTab from '@/components/approvals/PendingTasksTab'

// ── Tab config ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'timesheets', label: 'Duyệt Timesheet', icon: Clock },
  { id: 'tasks', label: 'Task Quá Hạn', icon: CheckSquare2 },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Component ──────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabId>('timesheets')

  // Redirect employees away from this page
  if (user?.role === 'EMPLOYEE') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Approval Dashboard</h1>
            <p className="text-sm text-slate-500">Duyệt chấm công và quản lý công việc</p>
          </div>
        </div>

        {/* Tab nav */}
        <nav className="mt-4 flex gap-0 -mb-px overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <ErrorBoundary>
          {activeTab === 'timesheets' && <TimesheetApprovalTab />}
          {activeTab === 'tasks' && <PendingTasksTab />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
