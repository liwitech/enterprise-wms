import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Clock,
  ShieldCheck,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
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
  { to: '/approvals', icon: ShieldCheck, label: 'Phê duyệt' },
  { to: '/reports', icon: BarChart3, label: 'Báo cáo' },
]

const adminItems = [
  { to: '/admin', icon: Settings, label: 'Quản trị' },
]

export default function Sidebar() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const isManager = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)
  const isAdmin = user?.role && ['SUPER_ADMIN', 'ADMIN'].includes(user.role)

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-gray-900 text-white transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo + collapse button */}
      <div
        className={cn(
          'flex items-center border-b border-gray-700 px-3 py-3',
          collapsed ? 'flex-col gap-2' : 'gap-2',
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center gap-2 min-w-0 flex-1', collapsed && 'flex-col')}>
          <img
            src="/logo-tcg.jpg"
            alt="TC Group"
            className={cn(
              'rounded-lg object-contain bg-white p-0.5 flex-shrink-0',
              collapsed ? 'h-8 w-8' : 'h-9 w-9',
            )}
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">TC Group</p>
              <p className="text-xs text-gray-400 truncate">Quản lý Công việc</p>
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className={cn(
            'flex-shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white',
            collapsed && 'mt-1',
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    collapsed ? 'justify-center' : 'gap-3',
                    isActive
                      ? 'bg-red-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                  )
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && label}
              </NavLink>
            </li>
          ))}

          {isManager && (
            <>
              <li className={cn('my-3 border-t border-gray-700 pt-3', collapsed && 'mx-1')}>
                {!collapsed && (
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    Quản lý
                  </p>
                )}
              </li>
              {managerItems.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        collapsed ? 'justify-center' : 'gap-3',
                        isActive
                          ? 'bg-red-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && label}
                  </NavLink>
                </li>
              ))}
            </>
          )}

          {isAdmin && (
            <>
              <li className={cn('my-3 border-t border-gray-700 pt-3', collapsed && 'mx-1')}>
                {!collapsed && (
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    Quản trị
                  </p>
                )}
              </li>
              {adminItems.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        collapsed ? 'justify-center' : 'gap-3',
                        isActive
                          ? 'bg-red-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && label}
                  </NavLink>
                </li>
              ))}
            </>
          )}
        </ul>
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-700 p-2">
        {!collapsed && (
          <div className="mb-2 rounded-lg bg-gray-800 px-3 py-2">
            <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
            <p className="truncate text-xs text-gray-400">{user?.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Đăng xuất' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors',
            collapsed ? 'justify-center' : 'gap-2',
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && 'Đăng xuất'}
        </button>
      </div>
    </aside>
  )
}
