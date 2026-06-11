import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import NotificationBell from '@/components/notifications/NotificationBell'

const TITLE_MAP: Record<string, string> = {
  '/dashboard': 'Tổng quan',
  '/projects': 'Dự án',
  '/tasks': 'Công việc',
  '/timesheets': 'Chấm công',
  '/timesheets/pending': 'Duyệt chấm công',
  '/reports': 'Báo cáo',
  '/approvals': 'Approval Dashboard',
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Quản trị viên tối cao',
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  EMPLOYEE: 'Nhân viên',
}

export default function Header() {
  const { pathname } = useLocation()
  const { user } = useAuthStore()

  const title = Object.entries(TITLE_MAP).find(([path]) => pathname.startsWith(path))?.[1] ?? ''

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-800">{title}</h1>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-semibold text-white">
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-700">{user?.full_name}</p>
            <p className="text-xs text-gray-500">{user?.role ? ROLE_LABEL[user.role] : ''}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
