import { useState } from 'react'
import {
  Building2, Network, Users, Plus, Pencil, Trash2,
  ChevronDown, ChevronRight, Loader2, Search, X,
  UserCheck, UserX, Eye, EyeOff, Shield, KeyRound,
  UserCog, UserPlus, Upload, Download, CheckCircle2, AlertCircle,
  Link2, ToggleLeft, ToggleRight, Save, Info,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  useAdminOrg, useUpdateOrg,
  useAdminDepts,
  useCreateDept, useUpdateDept, useDeleteDept,
  useAdminUsers, useCreateUser, useUpdateUser,
  useToggleUserActive, useDeleteUser, useImportUsers,
  useSsoConfig, useUpdateSsoConfig,
} from '@/hooks/useAdmin'

import type { Department, User, UserRole, DeptType } from '@/types'
import type { AdminDeptCreate, AdminDeptUpdate, AdminUserCreate, AdminUserUpdate, ImportResult } from '@/services/adminService'
import { adminService } from '@/services/adminService'
import { useDebounce } from '@/hooks/useDebounce'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Siêu quản trị',
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  EMPLOYEE: 'Nhân viên',
}

const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  ADMIN: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  EMPLOYEE: 'bg-slate-100 text-slate-600',
}

const DEPT_TYPE_OPTIONS: { value: DeptType; label: string; color: string }[] = [
  { value: 'KHOI',     label: 'Khối',      color: 'bg-indigo-100 text-indigo-700' },
  { value: 'BAN',      label: 'Ban',        color: 'bg-purple-100 text-purple-700' },
  { value: 'TRUNG_TAM',label: 'Trung tâm', color: 'bg-orange-100 text-orange-700' },
  { value: 'PHONG',    label: 'Phòng',      color: 'bg-emerald-100 text-emerald-700' },
]

function deptTypeInfo(type?: DeptType) {
  return DEPT_TYPE_OPTIONS.find((o) => o.value === type) ?? DEPT_TYPE_OPTIONS[3]
}

// ── Flat tree helper ──────────────────────────────────────────────────────────

function flattenTree(
  depts: Department[],
  depth = 0,
): { dept: Department; depth: number }[] {
  return depts.flatMap((d) => [
    { dept: d, depth },
    ...flattenTree(d.children ?? [], depth + 1),
  ])
}

// ── Input component ───────────────────────────────────────────────────────────

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition'

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Department Modal ──────────────────────────────────────────────────────────

interface DeptModalState {
  name: string
  code: string
  dept_type: DeptType
  parent_dept_id: string
  manager_user_id: string
}

function DeptModal({
  editing,
  defaultParentId,
  onClose,
}: {
  editing?: Department
  defaultParentId?: string
  onClose: () => void
}) {
  const { data: treeDepts = [] } = useAdminDepts()
  const flatList = flattenTree(treeDepts)
  const createMut = useCreateDept()
  const updateMut = useUpdateDept()

  const [form, setForm] = useState<DeptModalState>({
    name: editing?.name ?? '',
    code: editing?.code ?? '',
    dept_type: (editing?.dept_type as DeptType) ?? 'PHONG',
    parent_dept_id: editing?.parent_dept_id ?? defaultParentId ?? '',
    manager_user_id: editing?.manager_user_id ?? '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      dept_type: form.dept_type,
      parent_dept_id: form.parent_dept_id || undefined,
      manager_user_id: form.manager_user_id || undefined,
    }
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, body: payload as AdminDeptUpdate })
    } else {
      await createMut.mutateAsync(payload as AdminDeptCreate)
    }
    onClose()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Modal title={editing ? 'Chỉnh sửa đơn vị' : 'Thêm đơn vị mới'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Loại đơn vị — radio buttons với màu sắc */}
        <Field label="Loại đơn vị" required>
          <div className="grid grid-cols-4 gap-2">
            {DEPT_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 px-2 py-2.5 text-center transition',
                  form.dept_type === opt.value
                    ? 'border-red-500 bg-red-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <input
                  type="radio"
                  name="dept_type"
                  value={opt.value}
                  checked={form.dept_type === opt.value}
                  onChange={() => setForm((f) => ({ ...f, dept_type: opt.value }))}
                  className="sr-only"
                />
                <span className={cn('mb-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', opt.color)}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tên đơn vị" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={`VD: ${deptTypeInfo(form.dept_type).label} Kinh doanh`}
              required
            />
          </Field>
          <Field label="Mã đơn vị" required>
            <input
              className={inputCls}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="VD: KB"
              required
            />
          </Field>
        </div>

        <Field label="Thuộc đơn vị cha">
          <select
            className={inputCls}
            value={form.parent_dept_id}
            onChange={(e) => setForm((f) => ({ ...f, parent_dept_id: e.target.value }))}
          >
            <option value="">— Không có (cấp cao nhất) —</option>
            {flatList
              .filter((item) => item.dept.id !== editing?.id)
              .map(({ dept, depth }) => {
                const info = deptTypeInfo(dept.dept_type)
                return (
                  <option key={dept.id} value={dept.id}>
                    {'　'.repeat(depth)}{info.label}: {dept.name}
                  </option>
                )
              })}
          </select>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? 'Lưu thay đổi' : 'Tạo đơn vị'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Reset Password Modal ──────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const updateMut = useUpdateUser()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return
    await updateMut.mutateAsync({ id: user.id, body: { password } })
    onClose()
  }

  const mismatch = confirm.length > 0 && password !== confirm

  return (
    <Modal title={`Đặt lại mật khẩu — ${user.full_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Mật khẩu mới" required>
          <div className="relative">
            <input
              className={cn(inputCls, 'pr-10')}
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Xác nhận mật khẩu" required>
          <input
            className={cn(inputCls, mismatch && 'border-red-300 ring-2 ring-red-100')}
            type={showPass ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {mismatch && <p className="mt-1 text-xs text-red-500">Mật khẩu không khớp</p>}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={updateMut.isPending || !password || mismatch}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            {updateMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cập nhật mật khẩu
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── User Modal ────────────────────────────────────────────────────────────────

interface UserModalState {
  full_name: string
  email: string
  password: string
  dept_id: string
  employee_code: string
  role: UserRole
}

function UserModal({ editing, initialRole, onClose }: { editing?: User; initialRole?: UserRole; onClose: () => void }) {
  const { data: treeDepts = [] } = useAdminDepts()
  const flatList = flattenTree(treeDepts)
  const createMut = useCreateUser()
  const updateMut = useUpdateUser()
  const [showPass, setShowPass] = useState(false)

  const isAdmin = !editing && (initialRole === 'ADMIN' || initialRole === 'SUPER_ADMIN')

  const [form, setForm] = useState<UserModalState>({
    full_name: editing?.full_name ?? '',
    email: editing?.email ?? '',
    password: '',
    dept_id: editing?.dept_id ?? '',
    employee_code: editing?.employee_code ?? '',
    role: editing?.role ?? initialRole ?? 'EMPLOYEE',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      const body: AdminUserUpdate = {
        full_name: form.full_name,
        dept_id: form.dept_id || null,
        employee_code: form.employee_code || undefined,
        role: form.role,
      }
      if (form.password) body.password = form.password
      await updateMut.mutateAsync({ id: editing.id, body })
    } else {
      const body: AdminUserCreate = {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        dept_id: form.dept_id || undefined,
        employee_code: form.employee_code || undefined,
        role: form.role,
      }
      await createMut.mutateAsync(body)
    }
    onClose()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Modal
      title={editing ? 'Chỉnh sửa người dùng' : isAdmin ? 'Thêm quản trị viên' : 'Thêm người dùng mới'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Họ và tên" required>
            <input
              className={inputCls}
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              required
            />
          </Field>
          <Field label="Mã nhân viên">
            <input
              className={inputCls}
              value={form.employee_code}
              onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
              placeholder="VD: NV001"
            />
          </Field>
        </div>

        <Field label="Email" required>
          <input
            className={inputCls}
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            disabled={!!editing}
            required={!editing}
          />
        </Field>

        <Field label={editing ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}>
          <div className="relative">
            <input
              className={cn(inputCls, 'pr-10')}
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required={!editing}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vai trò" required>
            <select
              className={inputCls}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Phòng ban">
            <select
              className={inputCls}
              value={form.dept_id}
              onChange={(e) => setForm((f) => ({ ...f, dept_id: e.target.value }))}
            >
              <option value="">— Chưa có —</option>
              {flatList.map(({ dept, depth }) => (
                <option key={dept.id} value={dept.id}>
                  {'　'.repeat(depth)}{dept.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? 'Lưu thay đổi' : isAdmin ? 'Tạo quản trị viên' : 'Tạo người dùng'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Import Users Modal ────────────────────────────────────────────────────────

function ImportUsersModal({ onClose }: { onClose: () => void }) {
  const importMut = useImportUsers()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadTemplate() {
    setDownloading(true)
    try {
      const res = await adminService.downloadImportTemplate()
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'import_users_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  async function handleImport() {
    if (!file) return
    const data = await importMut.mutateAsync(file)
    setResult(data)
  }

  return (
    <Modal title="Import danh sách người dùng" onClose={onClose}>
      {!result ? (
        <div className="space-y-5">
          {/* Step 1 — download template */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">1</span>
              <p className="text-sm font-medium text-slate-700">Tải file mẫu</p>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Tải file Excel mẫu, điền dữ liệu theo đúng định dạng rồi upload lên.
            </p>
            <button
              onClick={handleDownloadTemplate}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-500" />}
              Tải file mẫu (.xlsx)
            </button>
          </div>

          {/* Step 2 — upload */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">2</span>
              <p className="text-sm font-medium text-slate-700">Upload file đã điền</p>
            </div>
            <label className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 transition',
              file ? 'border-red-400 bg-red-50' : 'border-slate-300 hover:border-red-300 hover:bg-red-50/30',
            )}>
              <Upload className={cn('h-7 w-7', file ? 'text-red-500' : 'text-slate-300')} />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-slate-500">Kéo thả hoặc click để chọn file</p>
                  <p className="text-xs text-slate-400">.xlsx, .xls</p>
                </div>
              )}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {/* Columns info */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-blue-700">Cột trong file mẫu:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-blue-700">
              <span>• <b>Họ và tên</b> — bắt buộc</span>
              <span>• <b>Email</b> — bắt buộc</span>
              <span>• <b>Mật khẩu</b> — bắt buộc, ≥6 ký tự</span>
              <span>• <b>Mã nhân viên</b> — tùy chọn</span>
              <span>• <b>Vai trò</b> — EMPLOYEE / MANAGER / ADMIN</span>
              <span>• <b>Mã phòng ban</b> — tùy chọn</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition">
              Hủy
            </button>
            <button
              onClick={handleImport}
              disabled={!file || importMut.isPending}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
            >
              {importMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Nhập danh sách
            </button>
          </div>
        </div>
      ) : (
        /* Result screen */
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-lg font-bold text-slate-700">{result.total}</p>
              <p className="text-xs text-slate-400">Tổng dòng</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-lg font-bold text-emerald-700">{result.success}</p>
              </div>
              <p className="text-xs text-emerald-600">Thành công</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <p className="text-lg font-bold text-red-600">{result.failed}</p>
              </div>
              <p className="text-xs text-red-500">Lỗi</p>
            </div>
          </div>

          {/* Error table */}
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-white overflow-hidden">
              <div className="bg-red-50 px-4 py-2.5">
                <p className="text-xs font-semibold text-red-700">Các dòng lỗi cần kiểm tra lại:</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-red-100 bg-red-50/60 text-red-600">
                      <th className="px-3 py-2 text-left font-medium">Dòng</th>
                      <th className="px-3 py-2 text-left font-medium">Họ tên</th>
                      <th className="px-3 py-2 text-left font-medium">Email</th>
                      <th className="px-3 py-2 text-left font-medium">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {result.errors.map((err) => (
                      <tr key={err.row} className="hover:bg-red-50/30">
                        <td className="px-3 py-2 font-mono text-slate-500">{err.row}</td>
                        <td className="px-3 py-2 text-slate-700">{err.full_name}</td>
                        <td className="px-3 py-2 text-slate-500">{err.email}</td>
                        <td className="px-3 py-2 text-red-600">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {result.failed > 0 && (
              <button
                onClick={() => { setResult(null); setFile(null) }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
              >
                Import thêm
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Tab: Tổ chức ──────────────────────────────────────────────────────────────

function OrgTab() {
  const { data: org, isLoading } = useAdminOrg()
  const updateMut = useUpdateOrg()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)

  function startEdit() {
    setName(org?.name ?? '')
    setEditing(true)
  }

  async function save() {
    if (!name.trim()) return
    await updateMut.mutateAsync({ name: name.trim() })
    setEditing(false)
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải...</div>
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-red-100 p-3">
            <Building2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Thông tin tổ chức</h3>
            <p className="text-xs text-slate-400">Cập nhật tên và thông tin công ty</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Mã tổ chức</p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
              {org?.code}
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Tên công ty</p>
            {editing ? (
              <div className="flex gap-2">
                <input
                  className={cn(inputCls, 'flex-1')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save()
                    if (e.key === 'Escape') setEditing(false)
                  }}
                />
                <button
                  onClick={save}
                  disabled={updateMut.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
                >
                  Lưu
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 transition"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">{org?.name}</span>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                >
                  <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Department Tree Node ──────────────────────────────────────────────────────

function DeptNode({
  dept,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  dept: Department
  depth: number
  onEdit: (d: Department) => void
  onDelete: (d: Department) => void
  onAddChild: (parentId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const children = dept.children ?? []
  const hasChildren = children.length > 0
  const typeInfo = deptTypeInfo(dept.dept_type)

  return (
    <div>
      {/* Node row */}
      <div className="group flex items-center gap-2 rounded-lg py-2 pr-2 hover:bg-slate-50 transition-colors">
        {/* Expand/collapse button */}
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition',
            !hasChildren && 'invisible pointer-events-none',
          )}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Type badge — fixed width for alignment */}
        <span
          className={cn(
            'w-20 shrink-0 rounded-md px-2 py-0.5 text-center text-[11px] font-semibold',
            typeInfo.color,
          )}
        >
          {typeInfo.label}
        </span>

        {/* Name */}
        <span className="flex-1 text-sm font-medium text-slate-800">{dept.name}</span>

        {/* Code chip */}
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
          {dept.code}
        </span>

        {/* Actions — show on hover */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAddChild(dept.id)}
            title="Thêm đơn vị con"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onEdit(dept)}
            title="Chỉnh sửa"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(dept)}
            title="Xóa"
            className="rounded p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Children — indented with a vertical connector line */}
      {open && hasChildren && (
        <div className="ml-[26px] border-l-2 border-slate-200 pl-4 space-y-0.5">
          {children.map((child) => (
            <DeptNode
              key={child.id}
              dept={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Cơ cấu tổ chức ───────────────────────────────────────────────────────

function StructureTab() {
  const { data: depts = [], isLoading } = useAdminDepts()
  const deleteMut = useDeleteDept()
  const [modal, setModal] = useState<
    | { mode: 'create'; parentId?: string }
    | { mode: 'edit'; dept: Department }
    | null
  >(null)

  function handleDelete(dept: Department) {
    if (confirm(`Xóa đơn vị "${dept.name}"?\nLưu ý: không thể xóa nếu còn đơn vị con.`)) {
      deleteMut.mutate(dept.id)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {/* Type legend */}
        <div className="flex items-center gap-3">
          {DEPT_TYPE_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-1.5">
              <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', opt.color)}>
                {opt.label}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
        >
          <Plus className="h-4 w-4" />
          Thêm đơn vị
        </button>
      </div>

      {/* Tree */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header row */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500">
          <span className="w-5 shrink-0" />
          <span className="w-20 shrink-0">Loại</span>
          <span className="flex-1">Tên đơn vị</span>
          <span className="shrink-0">Mã</span>
          <span className="w-24 shrink-0" />
        </div>

        <div className="p-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
            </div>
          ) : depts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
              <Network className="h-10 w-10 text-slate-200" />
              <p className="text-sm">Chưa có đơn vị nào</p>
              <button
                onClick={() => setModal({ mode: 'create' })}
                className="text-sm text-red-600 hover:underline"
              >
                Tạo đơn vị đầu tiên
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {depts.map((dept) => (
                <DeptNode
                  key={dept.id}
                  dept={dept}
                  depth={0}
                  onEdit={(d) => setModal({ mode: 'edit', dept: d })}
                  onDelete={handleDelete}
                  onAddChild={(parentId) => setModal({ mode: 'create', parentId })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {modal?.mode === 'create' && (
        <DeptModal
          defaultParentId={modal.parentId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === 'edit' && (
        <DeptModal
          editing={modal.dept}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Tab: Người dùng ──────────────────────────────────────────────────────────

function EmployeesTab() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [modal, setModal] = useState<
    | { mode: 'create'; initialRole?: UserRole }
    | { mode: 'edit'; user: User }
    | { mode: 'resetpw'; user: User }
    | { mode: 'import' }
    | null
  >(null)
  const debouncedSearch = useDebounce(search, 300)

  // Stats queries (per_page:1 — only need meta.total)
  const { data: statsAll } = useAdminUsers({ per_page: 1 })
  const { data: statsSuperAdmin } = useAdminUsers({ per_page: 1, role: 'SUPER_ADMIN' })
  const { data: statsAdmin } = useAdminUsers({ per_page: 1, role: 'ADMIN' })
  const { data: statsInactive } = useAdminUsers({ per_page: 1, is_active: false })
  const totalUsers = statsAll?.meta?.total ?? 0
  const adminCount = (statsSuperAdmin?.meta?.total ?? 0) + (statsAdmin?.meta?.total ?? 0)
  const regularCount = totalUsers - adminCount
  const inactiveCount = statsInactive?.meta?.total ?? 0

  const { data: treeDepts = [] } = useAdminDepts()
  const flatList = flattenTree(treeDepts)

  const params = {
    page,
    per_page: 20,
    search: debouncedSearch || undefined,
    dept_id: deptFilter || undefined,
    role: (roleFilter as UserRole) || undefined,
    is_active: activeFilter === '' ? undefined : activeFilter === 'true',
  }
  const { data: result, isLoading } = useAdminUsers(params)
  const toggleMut = useToggleUserActive()
  const deleteMut = useDeleteUser()

  const users = result?.data ?? []
  const meta = result?.meta

  function handleDelete(user: User) {
    if (confirm(`Xóa nhân viên "${user.full_name}"?`)) {
      deleteMut.mutate(user.id)
    }
  }

  function deptName(deptId?: string) {
    if (!deptId) return '—'
    const found = flatList.find((item) => item.dept.id === deptId)
    return found?.dept.name ?? '—'
  }

  const initials = (name: string) =>
    name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-slate-400">Tổng người dùng</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-800">{totalUsers}</p>
        </div>
        <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 shadow-sm">
          <p className="text-xs text-purple-500">Quản trị viên</p>
          <p className="mt-0.5 text-2xl font-bold text-purple-700">{adminCount}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm">
          <p className="text-xs text-blue-500">Người dùng thường</p>
          <p className="mt-0.5 text-2xl font-bold text-blue-700">{regularCount}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
          <p className="text-xs text-slate-400">Đã vô hiệu</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-500">{inactiveCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
            placeholder="Tìm kiếm theo tên, email, mã NV..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 transition"
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}
        >
          <option value="">Tất cả phòng ban</option>
          {flatList.map(({ dept, depth }) => (
            <option key={dept.id} value={dept.id}>
              {'　'.repeat(depth)}{dept.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 transition"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
        >
          <option value="">Tất cả vai trò</option>
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 transition"
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1) }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Đã vô hiệu</option>
        </select>

        <button
          onClick={() => setModal({ mode: 'import' })}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <Upload className="h-4 w-4" />
          Import
        </button>
        <button
          onClick={() => setModal({ mode: 'create', initialRole: 'ADMIN' })}
          className="flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition"
        >
          <UserCog className="h-4 w-4" />
          Thêm Admin
        </button>
        <button
          onClick={() => setModal({ mode: 'create', initialRole: 'EMPLOYEE' })}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
        >
          <UserPlus className="h-4 w-4" />
          Thêm nhân viên
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <Users className="h-10 w-10 text-slate-200" />
            <p className="text-sm">Không tìm thấy nhân viên nào</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-3 text-left font-medium">Nhân viên</th>
                <th className="px-3 py-3 text-left font-medium">Mã NV</th>
                <th className="px-3 py-3 text-left font-medium">Phòng ban</th>
                <th className="px-3 py-3 text-left font-medium">Vai trò</th>
                <th className="px-3 py-3 text-left font-medium">Trạng thái</th>
                <th className="px-3 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isAdminUser = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      'transition',
                      isAdminUser ? 'bg-purple-50/40 hover:bg-purple-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white',
                            isAdminUser ? 'bg-purple-600' : 'bg-red-500',
                          )}
                        >
                          {initials(user.full_name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-slate-800">{user.full_name}</p>
                            {isAdminUser && (
                              <Shield className="h-3 w-3 text-purple-400" />
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">
                      {user.employee_code || '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {deptName(user.dept_id)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ROLE_COLORS[user.role])}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          user.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {user.is_active ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({ mode: 'resetpw', user })}
                          title="Đặt lại mật khẩu"
                          className="rounded p-1.5 text-slate-400 hover:bg-amber-100 hover:text-amber-600 transition"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleMut.mutate(user.id)}
                          title={user.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        >
                          {user.is_active
                            ? <UserX className="h-3.5 w-3.5" />
                            : <UserCheck className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => setModal({ mode: 'edit', user })}
                          title="Chỉnh sửa"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          title="Xóa"
                          className="rounded p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">
              {meta.total} nhân viên · Trang {meta.page}/{meta.total_pages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                disabled={page >= meta.total_pages}
                className="rounded px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                Tiếp
              </button>
            </div>
          </div>
        )}
      </div>

      {modal?.mode === 'create' && (
        <UserModal initialRole={modal.initialRole} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <UserModal editing={modal.user} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'resetpw' && (
        <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'import' && (
        <ImportUsersModal onClose={() => setModal(null)} />
      )}
    </div>
  )
}

// ── Tab: Cấu hình SSO ────────────────────────────────────────────────────────

function SsoTab() {
  const { data: cfg, isLoading } = useSsoConfig()
  const updateMut = useUpdateSsoConfig()

  const [form, setForm] = useState({
    sso_enabled: false,
    sso_provider_url: '',
    sso_client_id: '',
    sso_client_secret: '',
    sso_redirect_uri: '',
    sso_verify_ssl: false,
  })
  const [showSecret, setShowSecret] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync form khi data load xong
  useState(() => {
    if (cfg) {
      setForm({
        sso_enabled: cfg.sso_enabled,
        sso_provider_url: cfg.sso_provider_url ?? '',
        sso_client_id: cfg.sso_client_id ?? '',
        sso_client_secret: '',
        sso_redirect_uri: cfg.sso_redirect_uri ?? '',
        sso_verify_ssl: cfg.sso_verify_ssl,
      })
    }
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = {
      sso_enabled: form.sso_enabled,
      sso_provider_url: form.sso_provider_url || null,
      sso_client_id: form.sso_client_id || null,
      sso_redirect_uri: form.sso_redirect_uri || null,
      sso_verify_ssl: form.sso_verify_ssl,
    }
    if (form.sso_client_secret) body.sso_client_secret = form.sso_client_secret
    await updateMut.mutateAsync(body as any)
    setDirty(false)
    setForm((f) => ({ ...f, sso_client_secret: '' }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-3">
            <Link2 className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Cấu hình SSO / WSO2</h3>
            <p className="text-xs text-slate-400">
              Cho phép người dùng đăng nhập qua hệ thống Identity Provider WSO2 của doanh nghiệp
            </p>
          </div>

          {/* Enable toggle */}
          <button
            type="button"
            onClick={() => set('sso_enabled', !form.sso_enabled)}
            className={cn(
              'ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              form.sso_enabled
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
            )}
          >
            {form.sso_enabled
              ? <ToggleRight className="h-4 w-4" />
              : <ToggleLeft className="h-4 w-4" />}
            {form.sso_enabled ? 'Đang bật' : 'Đang tắt'}
          </button>
        </div>

        {!form.sso_enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            SSO hiện đang tắt. Bật SSO để cho phép người dùng đăng nhập bằng tài khoản doanh nghiệp.
          </div>
        )}
      </div>

      {/* Config fields */}
      <div className={cn(
        'rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 transition-opacity',
        !form.sso_enabled && 'opacity-50 pointer-events-none',
      )}>
        <h4 className="text-sm font-semibold text-slate-700">Thông tin kết nối WSO2</h4>

        <Field label="WSO2 Base URL" required>
          <input
            className={inputCls}
            type="url"
            value={form.sso_provider_url}
            onChange={(e) => set('sso_provider_url', e.target.value)}
            placeholder="https://login.company.vn"
          />
          <p className="mt-1 text-xs text-slate-400">URL gốc của máy chủ WSO2 Identity Server</p>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Client ID" required>
            <input
              className={inputCls}
              value={form.sso_client_id}
              onChange={(e) => set('sso_client_id', e.target.value)}
              placeholder="xxxxxxxxxxxxxxxx"
              autoComplete="off"
            />
          </Field>

          <Field label="Client Secret">
            <div className="relative">
              <input
                className={cn(inputCls, 'pr-10')}
                type={showSecret ? 'text' : 'password'}
                value={form.sso_client_secret}
                onChange={(e) => set('sso_client_secret', e.target.value)}
                placeholder={cfg?.sso_client_id ? '••••••• (để trống nếu không đổi)' : 'Nhập client secret'}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        <Field label="Redirect URI (Callback URL)" required>
          <input
            className={inputCls}
            type="url"
            value={form.sso_redirect_uri}
            onChange={(e) => set('sso_redirect_uri', e.target.value)}
            placeholder="https://app.company.vn/auth/callback"
          />
          <p className="mt-1 text-xs text-slate-400">
            URL này phải được đăng ký trong cấu hình Service Provider trên WSO2
          </p>
        </Field>

        {/* SSL toggle */}
        <div className="flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Xác thực SSL</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Tắt nếu máy chủ WSO2 dùng self-signed certificate (môi trường test)
            </p>
          </div>
          <button
            type="button"
            onClick={() => set('sso_verify_ssl', !form.sso_verify_ssl)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none',
              form.sso_verify_ssl ? 'bg-indigo-600' : 'bg-slate-300',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                form.sso_verify_ssl ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      </div>

      {/* OAuth2 endpoints info */}
      {form.sso_provider_url && form.sso_enabled && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-2">
          <p className="text-xs font-semibold text-indigo-700 mb-2">Endpoints sẽ được sử dụng:</p>
          {[
            { label: 'Authorization', path: '/oauth2/authorize' },
            { label: 'Token', path: '/oauth2/token' },
            { label: 'UserInfo', path: '/oauth2/userinfo' },
          ].map(({ label, path }) => (
            <div key={path} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 font-medium text-indigo-600">{label}</span>
              <code className="flex-1 rounded bg-white/70 px-2 py-0.5 text-slate-600 font-mono truncate">
                {form.sso_provider_url}{path}
              </code>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={updateMut.isPending || !dirty}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {updateMut.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          Lưu cấu hình
        </button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'org' as const, label: 'Tổ chức', icon: Building2 },
  { id: 'structure' as const, label: 'Cơ cấu tổ chức', icon: Network },
  { id: 'employees' as const, label: 'Người dùng', icon: Users },
  { id: 'sso' as const, label: 'SSO / Tích hợp', icon: Link2 },
]

type TabId = (typeof TABS)[number]['id']

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('org')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="mb-1 flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-600" />
          <h1 className="text-lg font-bold text-slate-900">Quản trị hệ thống</h1>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Quản lý tổ chức, cơ cấu phòng ban và tài khoản người dùng của doanh nghiệp
        </p>

        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                activeTab === id
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'org' && <OrgTab />}
        {activeTab === 'structure' && <StructureTab />}
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'sso' && <SsoTab />}
      </div>
    </div>
  )
}
