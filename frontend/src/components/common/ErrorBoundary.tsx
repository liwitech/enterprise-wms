import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm">Đã xảy ra lỗi khi tải dữ liệu.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
