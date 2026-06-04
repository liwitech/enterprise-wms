import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

interface Props {
  page: number
  totalPages: number
  total: number
  perPage: number
  onChange: (page: number) => void
}

export default function Pagination({ page, totalPages, total, perPage, onChange }: Props) {
  if (totalPages <= 1) return null

  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
      <p className="text-sm text-gray-600">
        Hiển thị <span className="font-medium">{from}</span>–<span className="font-medium">{to}</span>{' '}
        trong <span className="font-medium">{total}</span> bản ghi
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className={cn(
            'rounded-md p-1.5 text-gray-500 hover:bg-gray-100',
            page === 1 && 'cursor-not-allowed opacity-40',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let p: number
          if (totalPages <= 7) {
            p = i + 1
          } else if (page <= 4) {
            p = i + 1
          } else if (page >= totalPages - 3) {
            p = totalPages - 6 + i
          } else {
            p = page - 3 + i
          }
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={cn(
                'min-w-[32px] rounded-md px-2 py-1 text-sm',
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              {p}
            </button>
          )
        })}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className={cn(
            'rounded-md p-1.5 text-gray-500 hover:bg-gray-100',
            page === totalPages && 'cursor-not-allowed opacity-40',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
