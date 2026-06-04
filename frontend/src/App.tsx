import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ProtectedRoute from '@/components/common/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ExecutiveDashboard from '@/pages/Dashboard/ExecutiveDashboard'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import TasksPage from '@/pages/TasksPage'
import TimesheetPage from '@/pages/TimesheetPage'
import TimesheetHistoryPage from '@/pages/TimesheetHistoryPage'
import PendingApprovalsPage from '@/pages/PendingApprovalsPage'
import ApprovalsPage from '@/pages/ApprovalsPage'
import ReportsPage from '@/pages/ReportsPage'
import { useAuthStore } from '@/stores/authStore'

function DashboardIndex() {
  const { user } = useAuthStore()
  if (user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
    return <ExecutiveDashboard />
  }
  return <DashboardPage />
}

export default function App() {
  return (
    <>
    <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardIndex />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/timesheets" element={<TimesheetPage />} />
        <Route path="/timesheets/history" element={<TimesheetHistoryPage />} />
        <Route
          path="/timesheets/pending"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
              <PendingApprovalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
              <ApprovalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  )
}
