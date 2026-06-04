import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Clock,
  ShieldCheck,
  BarChart3,
  LogOut,
  Briefcase,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores/authStore'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/projects', icon: FolderKanban, label: 'Dự án' },
  { to: '/tasks', icon: CheckSquare, label: 'Công việc' },
  { to: '/timesheets', icon: Clock, label: 'Chấm công' },
]

const managerItems = [
  { to: '/approvals', icon: ShieldCheck, label: 'Approvals' },
  { to: '/reports', icon: BarChart3, label: 'Báo cáo' },
]

export default function Sidebar() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const isManager = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-gray-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-gray-700 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Briefcase className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Quản lý Công việc</p>
          <p className="text-xs text-gray-400">Doanh nghiệp</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                  )
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </NavLink>
            </li>
          ))}

          {isManager && (
            <>
              <li className="my-3 border-t border-gray-700 pt-3">
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  Quản lý
                </p>
              </li>
              {managerItems.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </>
          )}
        </ul>
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-700 p-3">
        <div className="mb-2 rounded-lg bg-gray-800 px-3 py-2">
          <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
          <p className="truncate text-xs text-gray-400">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}
