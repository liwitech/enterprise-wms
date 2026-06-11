import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCircle2, AlertCircle, CheckCheck } from 'lucide-react'
import { parseISO, formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/utils/cn'
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications'
import { Link } from 'react-router-dom'

function NotificationIcon({ type }: { type: NotificationItem['type'] }) {
  if (type === 'task_overdue') {
    return <AlertCircle className="h-4 w-4 text-orange-500" />
  }
  return <CheckCircle2 className="h-4 w-4 text-red-500" />
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markAllRead } = useNotifications()

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">Thông báo</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-indigo-800"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu đã đọc
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Không có thông báo mới</p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50',
                    !item.read && 'bg-red-50/40',
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    <NotificationIcon type={item.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 leading-snug">{item.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDistanceToNow(parseISO(item.timestamp), { locale: vi, addSuffix: true })}
                    </p>
                  </div>
                  {!item.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <Link
              to="/approvals"
              onClick={() => setOpen(false)}
              className="text-xs text-red-600 hover:underline"
            >
              Xem tất cả →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
