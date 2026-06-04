import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { AlertCircle, User, Calendar, ChevronDown, X } from 'lucide-react'
import { taskService } from '@/services/taskService'
import { projectService } from '@/services/projectService'
import { cn } from '@/utils/cn'
import type { Task, Project, ProjectMember } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PendingTasksTab() {
  const qc = useQueryClient()

  const [assignModal, setAssignModal] = useState<{
    task: Task
    projectMembers: ProjectMember[]
  } | null>(null)
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: tasksData } = useQuery({
    queryKey: ['overdue-tasks'],
    queryFn: () => taskService.list({ is_overdue: true, per_page: 200 }),
    staleTime: 30_000,
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => projectService.list({ per_page: 100 }),
    staleTime: 5 * 60_000,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const assignMutation = useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      taskService.update(taskId, { assignee_user_id: userId }),
    onSuccess: () => {
      toast.success('Đã giao task thành công!')
      qc.invalidateQueries({ queryKey: ['overdue-tasks'] })
      setAssignModal(null)
    },
    onError: () => {
      toast.error('Lỗi khi giao task. Vui lòng thử lại.')
    },
  })

  // ── Data processing ────────────────────────────────────────────────────────

  const tasks = tasksData?.data ?? []
  const projects = projectsData?.data ?? []

  // Build project lookup map
  const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]))

  // Group tasks by project
  const grouped = new Map<string, { project: Project | undefined; tasks: Task[] }>()
  for (const task of tasks) {
    if (!grouped.has(task.project_id)) {
      grouped.set(task.project_id, {
        project: projectMap.get(task.project_id),
        tasks: [],
      })
    }
    grouped.get(task.project_id)!.tasks.push(task)
  }

  // Sort groups: projects with names first
  const sortedGroups = Array.from(grouped.entries()).sort(([, a], [, b]) => {
    const nameA = a.project?.name ?? ''
    const nameB = b.project?.name ?? ''
    return nameA.localeCompare(nameB)
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAssignClick(task: Task) {
    setLoadingProjectId(task.project_id)
    try {
      const projectDetail = await projectService.get(task.project_id)
      setAssignModal({ task, projectMembers: projectDetail.members })
    } catch {
      toast.error('Không thể tải danh sách thành viên.')
    } finally {
      setLoadingProjectId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Count header */}
      <p className="text-sm text-slate-500">
        {tasks.length > 0 ? (
          <>
            <span className="font-semibold text-red-600">{tasks.length}</span> công việc quá hạn
          </>
        ) : (
          'Không có công việc quá hạn'
        )}
      </p>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-slate-400">
          <AlertCircle className="h-10 w-10 text-slate-300" />
          <p className="text-sm">Tất cả công việc đều đúng hạn.</p>
        </div>
      )}

      {/* Project groups */}
      {sortedGroups.map(([projectId, { project, tasks: groupTasks }]) => (
        <div key={projectId} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          {/* Project header */}
          <div className="flex items-center gap-2 bg-slate-100 px-4 py-2.5">
            <ChevronDown className="h-4 w-4 text-slate-400" />
            <span className="font-semibold text-slate-700">
              {project?.name ?? `Dự án (${projectId.slice(0, 8)}…)`}
            </span>
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
              {groupTasks.length}
            </span>
          </div>

          {/* Task rows */}
          <div className="divide-y divide-slate-100 bg-white">
            {groupTasks.map((task) => {
              const isLoadingThis = loadingProjectId === task.project_id

              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  {/* Left: title + due date */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      <p className="font-medium text-slate-800 truncate">{task.title}</p>
                    </div>

                    <div className="mt-1 flex items-center gap-3 pl-6">
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                        </span>
                      )}
                      {task.assignee_user_id ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Đã giao
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Chưa được giao
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: assign button */}
                  <button
                    onClick={() => handleAssignClick(task)}
                    disabled={isLoadingThis || assignMutation.isPending}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600',
                      'hover:bg-slate-50 disabled:opacity-60 transition-colors',
                    )}
                  >
                    {isLoadingThis ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                    Giao task
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Assign modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            {/* Modal header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Giao công việc</h3>
                <p
                  className="mt-1 text-sm text-slate-500 line-clamp-2"
                  title={assignModal.task.title}
                >
                  {assignModal.task.title}
                </p>
              </div>
              <button
                onClick={() => setAssignModal(null)}
                className="ml-3 shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Member list */}
            {assignModal.projectMembers.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                Không có thành viên nào trong dự án.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {assignModal.projectMembers.map((member) => {
                  const name = member.user?.full_name ?? member.user_id
                  return (
                    <button
                      key={member.id}
                      onClick={() =>
                        assignMutation.mutate({
                          taskId: assignModal.task.id,
                          userId: member.user_id,
                        })
                      }
                      disabled={assignMutation.isPending}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5',
                        'hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-60 transition-colors text-left',
                        assignModal.task.assignee_user_id === member.user_id &&
                          'border-indigo-200 bg-indigo-50',
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                        {getInitials(name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{name}</p>
                        {member.user?.email && (
                          <p className="truncate text-xs text-slate-400">{member.user.email}</p>
                        )}
                      </div>
                      {assignModal.task.assignee_user_id === member.user_id && (
                        <span className="ml-auto text-xs font-medium text-indigo-600">
                          Đang giao
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setAssignModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
