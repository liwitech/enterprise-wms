# Enterprise Work Management System API

**Version:** 0.1.0

Hệ thống quản lý công việc nội bộ doanh nghiệp cho phép quản lý **dự án**, **công việc**,
**chấm công**, và **báo cáo điều hành** với phân quyền theo vai trò (RBAC).

### Vai trò người dùng (RBAC)

| Role | Quyền chính |
|------|------------|
| `SUPER_ADMIN` | Toàn quyền, quản lý tổ chức |
| `ADMIN` | Quản lý người dùng, phòng ban, dự án |
| `MANAGER` | Tạo dự án, duyệt chấm công trong phòng ban |
| `EMPLOYEE` | Xem dự án được phân công, tạo task, ghi chấm công |

### Xác thực

```
Authorization: Bearer <access_token>
```

---

## Endpoints

## Health

Health check và trạng thái hệ thống

### `GET` `/api/health`

**Health Check**

Kiểm tra kết nối database và Redis.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Hệ thống hoạt động bình thường |
| 503 | Database hoặc Redis không khả dụng |

---

## Auth

Xác thực, cấp phát và thu hồi token

### `POST` `/api/auth/login`

**Đăng nhập**

Xác thực bằng email và mật khẩu. Trả về `access_token` (JWT, 8h) và `refresh_token` (UUID, 30 ngày). Rate limit: 5 lần/phút mỗi IP.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|

**Request Body:**
```json
{
  "email": "admin@tsv.vn",
  "password": "Password123!"
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Đăng nhập thành công, trả về token pair |
| 401 | Email hoặc mật khẩu không đúng |
| 422 | Định dạng email không hợp lệ |
| 429 | Quá giới hạn thử đăng nhập |

---

### `POST` `/api/auth/refresh`

**Làm mới access token**

Đổi `refresh_token` hợp lệ lấy `access_token` mới.

**Request Body:**
```json
{ "refresh_token": "uuid-refresh-token" }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Access token mới |
| 401 | Refresh token không hợp lệ hoặc đã hết hạn |

---

### `POST` `/api/auth/logout`

**Đăng xuất**

Thu hồi `refresh_token`. Access token hiện tại vẫn hợp lệ đến khi hết hạn tự nhiên.

**Responses:**

| Status | Description |
|--------|-------------|
| 204 | Đăng xuất thành công |
| 401 | Chưa xác thực |

---

### `GET` `/api/auth/me`

**Thông tin người dùng hiện tại**

Trả về thông tin người dùng đang đăng nhập kèm danh sách quyền và vai trò trong từng dự án.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Thông tin người dùng và quyền hạn |
| 401 | Chưa xác thực hoặc token không hợp lệ |

---

## Projects

Quản lý dự án, thành viên và sprint

### `GET` `/api/projects`

**Danh sách dự án**

Lấy danh sách dự án có phân trang. Admin/Super-admin thấy tất cả; Manager/Employee chỉ thấy dự án mình tham gia.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|
| `dept_id` | query | uuid | | Lọc theo phòng ban |
| `status` | query | string | | PLANNING/IN_PROGRESS/ON_HOLD/COMPLETED/CANCELLED |
| `priority` | query | string | | LOW/MEDIUM/HIGH/CRITICAL |
| `owner_user_id` | query | uuid | | Lọc theo người sở hữu |
| `search` | query | string | | Tìm kiếm theo tên hoặc mã |
| `sort` | query | string | | deadline/progress/created_at |
| `page` | query | integer | | Trang (default: 1) |
| `per_page` | query | integer | | Số mục/trang (default: 20, max: 100) |

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách dự án có phân trang |
| 401 | Chưa xác thực |
| 422 | Tham số không hợp lệ |

---

### `POST` `/api/projects`

**Tạo dự án mới**

Tạo dự án và tự động thêm người tạo vào danh sách thành viên với vai trò **PM**. Yêu cầu role: SUPER_ADMIN, ADMIN, hoặc MANAGER.

**Request Body:**
```json
{
  "org_id": "uuid",
  "code": "PROJ001",
  "name": "Platform Upgrade",
  "owner_user_id": "uuid",
  "description": "Nâng cấp nền tảng",
  "status": "PLANNING",
  "priority": "HIGH",
  "project_type": "AGILE",
  "start_date": "2026-01-01",
  "end_date": "2026-06-30"
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 201 | Dự án được tạo thành công |
| 400 | Mã dự án (code) đã tồn tại |
| 401 | Chưa xác thực |
| 403 | Không có quyền (chỉ ADMIN/MANAGER) |
| 422 | Dữ liệu không hợp lệ |

---

### `GET` `/api/projects/{project_id}`

**Chi tiết dự án**

Trả về thông tin đầy đủ: thành viên, milestone, tóm tắt task theo trạng thái.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Chi tiết dự án |
| 401 | Chưa xác thực |
| 403 | Không phải thành viên dự án |
| 404 | Dự án không tồn tại |

---

### `PUT` `/api/projects/{project_id}`

**Cập nhật dự án**

Cập nhật thông tin dự án. Chỉ PM, Admin, Super-admin mới có quyền.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Dự án đã được cập nhật |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Dự án không tồn tại |
| 422 | Dữ liệu không hợp lệ |

---

### `DELETE` `/api/projects/{project_id}`

**Xóa dự án (soft delete)**

Đánh dấu dự án là đã xóa. Chỉ SUPER_ADMIN và ADMIN.

**Responses:**

| Status | Description |
|--------|-------------|
| 204 | Dự án đã được xóa |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Dự án không tồn tại |

---

### `GET` `/api/projects/{project_id}/dashboard`

**Dashboard dự án**

Trả về metrics tổng hợp: tiến độ, task theo trạng thái, milestone sắp đến hạn, khối lượng công việc thành viên, hoạt động gần đây. Cache 5 phút.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Dashboard data |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Dự án không tồn tại |

---

### `POST` `/api/projects/{project_id}/members`

**Thêm thành viên**

Thêm người dùng vào dự án với vai trò PM, MEMBER, hoặc VIEWER.

**Request Body:**
```json
{ "user_id": "uuid", "role": "MEMBER" }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 201 | Thành viên được thêm |
| 400 | Người dùng đã là thành viên |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Dự án không tồn tại |

---

### `DELETE` `/api/projects/{project_id}/members/{user_id}`

**Xóa thành viên**

**Responses:**

| Status | Description |
|--------|-------------|
| 204 | Thành viên đã bị xóa |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Dự án không tồn tại |

---

### `GET` `/api/projects/{project_id}/sprints`

**Danh sách sprint**

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách sprint |
| 401 | Chưa xác thực |
| 403 | Không có quyền |

---

### `POST` `/api/projects/{project_id}/sprints`

**Tạo sprint**

Tạo sprint mới với trạng thái PLANNING.

**Request Body:**
```json
{ "project_id": "uuid", "name": "Sprint 1", "goal": "Release v1.0" }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 201 | Sprint được tạo |
| 401 | Chưa xác thực |
| 403 | Không có quyền |

---

### `PUT` `/api/projects/{project_id}/sprints/{sprint_id}/activate`

**Kích hoạt sprint**

Chuyển sprint sang ACTIVE. Tự động deactivate sprint ACTIVE hiện tại.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Sprint đã được kích hoạt |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Sprint hoặc dự án không tồn tại |

---

## Tasks

Quản lý công việc và bình luận

### `GET` `/api/tasks`

**Danh sách task**

Lấy danh sách task có phân trang và bộ lọc đa chiều.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|
| `project_id` | query | uuid | | Lọc theo dự án |
| `assignee_user_id` | query | uuid | | Lọc theo người được giao |
| `status` | query | string | | TODO/IN_PROGRESS/IN_REVIEW/DONE/CANCELLED |
| `priority` | query | string | | LOW/MEDIUM/HIGH/CRITICAL |
| `sprint_id` | query | uuid | | Lọc theo sprint |
| `due_date_from` | query | date | | Ngày hạn từ |
| `due_date_to` | query | date | | Ngày hạn đến |
| `is_overdue` | query | boolean | | Chỉ task quá hạn |
| `page` | query | integer | | Trang |
| `per_page` | query | integer | | Số mục/trang |

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách task |
| 401 | Chưa xác thực |
| 422 | Tham số không hợp lệ |

---

### `POST` `/api/tasks`

**Tạo task**

Tạo task mới. Người tạo tự động là reporter và phải là thành viên dự án.

**Request Body:**
```json
{
  "project_id": "uuid",
  "title": "Implement login API",
  "description": "...",
  "priority": "HIGH",
  "assignee_user_id": "uuid",
  "sprint_id": "uuid",
  "estimated_hours": 8,
  "tags": ["backend", "auth"],
  "parent_task_id": null
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 201 | Task được tạo |
| 401 | Chưa xác thực |
| 403 | Không phải thành viên dự án |
| 404 | Dự án không tồn tại |
| 422 | Dữ liệu không hợp lệ |

---

### `GET` `/api/tasks/{task_id}`

**Chi tiết task**

Trả về task kèm subtasks, bình luận, đính kèm và tóm tắt giờ chấm công.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Chi tiết task |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Task không tồn tại |

---

### `PUT` `/api/tasks/{task_id}`

**Cập nhật task**

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Task đã được cập nhật |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Task không tồn tại |

---

### `PATCH` `/api/tasks/{task_id}/status`

**Cập nhật trạng thái task (Kanban move)**

Thay đổi trạng thái. Tự động publish Redis event và vô hiệu cache dashboard.

**Request Body:**
```json
{ "status": "IN_PROGRESS" }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Trạng thái đã được cập nhật |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Task không tồn tại |
| 422 | Trạng thái không hợp lệ |

---

### `POST` `/api/tasks/{task_id}/comments`

**Thêm bình luận**

**Request Body:**
```json
{ "content": "Looks good to me!" }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 201 | Bình luận được thêm |
| 401 | Chưa xác thực |
| 403 | Không phải thành viên |
| 404 | Task không tồn tại |

---

### `GET` `/api/tasks/{task_id}/comments`

**Danh sách bình luận**

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách bình luận |
| 401 | Chưa xác thực |
| 403 | Không có quyền |

---

## Timesheets

Ghi chấm công, phê duyệt và báo cáo

### `GET` `/api/timesheets`

**Danh sách chấm công**

Lấy danh sách bản ghi chấm công của người dùng hiện tại.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|
| `week_start` | query | date | | Tuần bắt đầu (YYYY-MM-DD, phải là thứ 2) |
| `year` | query | integer | | Năm |
| `month` | query | integer | | Tháng (1-12) |
| `project_id` | query | uuid | | Lọc theo dự án |
| `status` | query | string | | DRAFT/SUBMITTED/APPROVED/REJECTED |

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách bản ghi |
| 401 | Chưa xác thực |

---

### `POST` `/api/timesheets`

**Tạo bản ghi chấm công**

Ràng buộc: `work_date` ≤ hôm nay; 0 < `hours_logged` ≤ 16; tổng giờ ngày ≤ 16h.

**Request Body:**
```json
{
  "task_id": "uuid",
  "work_date": "2026-06-04",
  "hours_logged": 7.5,
  "description": "Implemented login API"
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 201 | Bản ghi được tạo (DRAFT) |
| 400 | Ngày tương lai hoặc tổng giờ ngày vượt 16h |
| 401 | Chưa xác thực |
| 422 | Dữ liệu không hợp lệ (hours ngoài khoảng) |

---

### `PUT` `/api/timesheets/{entry_id}`

**Cập nhật bản ghi**

Chỉ sửa được khi DRAFT hoặc REJECTED. Sửa REJECTED tự động reset về DRAFT.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Bản ghi đã được cập nhật |
| 400 | Không thể sửa khi SUBMITTED/APPROVED |
| 401 | Chưa xác thực |
| 404 | Bản ghi không tồn tại |

---

### `DELETE` `/api/timesheets/{entry_id}`

**Xóa bản ghi**

Chỉ xóa được khi DRAFT.

**Responses:**

| Status | Description |
|--------|-------------|
| 204 | Đã xóa |
| 400 | Không thể xóa khi không phải DRAFT |
| 401 | Chưa xác thực |
| 404 | Bản ghi không tồn tại |

---

### `POST` `/api/timesheets/submit`

**Nộp chấm công hàng loạt**

Chuyển các bản ghi DRAFT sang SUBMITTED.

**Request Body:**
```json
{ "entry_ids": ["uuid1", "uuid2"] }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách bản ghi đã nộp |
| 400 | Bản ghi không ở DRAFT |
| 401 | Chưa xác thực |
| 422 | Danh sách rỗng |

---

### `GET` `/api/timesheets/summary`

**Tóm tắt chấm công theo tháng**

Tổng giờ theo dự án, ngày, tuần. Chỉ tính APPROVED.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|
| `year` | query | integer | ✓ | Năm |
| `month` | query | integer | ✓ | Tháng (1-12) |

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Tóm tắt chấm công |
| 401 | Chưa xác thực |
| 422 | Thiếu year/month |

---

### `GET` `/api/timesheets/pending`

**Danh sách chờ duyệt (Manager)**

Manager chỉ thấy bản ghi của nhân viên trong phòng ban mình.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách chờ duyệt |
| 401 | Chưa xác thực |
| 403 | Yêu cầu role MANAGER/ADMIN |

---

### `POST` `/api/timesheets/{entry_id}/approve`

**Duyệt bản ghi**

SUBMITTED → APPROVED. Cộng hours vào actual_hours của task.

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Bản ghi đã được duyệt |
| 400 | Không ở trạng thái SUBMITTED |
| 401 | Chưa xác thực |
| 403 | Không có quyền hoặc không đúng phòng ban |
| 404 | Bản ghi không tồn tại |

---

### `POST` `/api/timesheets/{entry_id}/reject`

**Từ chối bản ghi**

SUBMITTED → REJECTED với lý do cụ thể.

**Request Body:**
```json
{ "reject_reason": "Missing task description" }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Bản ghi đã bị từ chối |
| 400 | Không ở trạng thái SUBMITTED |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 422 | reject_reason bắt buộc |

---

### `POST` `/api/timesheets/approve-batch`

**Duyệt hàng loạt**

**Request Body:**
```json
{ "entry_ids": ["uuid1", "uuid2"] }
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách bản ghi đã duyệt |
| 400 | Một hoặc nhiều bản ghi không hợp lệ |
| 401 | Chưa xác thực |
| 403 | Không có quyền |

---

## Reports

Báo cáo chấm công (JSON / CSV)

### `GET` `/api/reports/timesheet`

**Báo cáo chấm công**

Yêu cầu role MANAGER/ADMIN. Format JSON hoặc CSV.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|
| `format` | query | string | | json (default) hoặc csv |
| `year` | query | integer | | Năm |
| `month` | query | integer | | Tháng |
| `dept_id` | query | uuid | | Lọc theo phòng ban |
| `status` | query | string | | Trạng thái |

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Báo cáo (JSON hoặc CSV) |
| 401 | Chưa xác thực |
| 403 | Yêu cầu role MANAGER/ADMIN |

---

### `GET` `/api/reports/timesheet/weekly-summary`

**Báo cáo tóm tắt tuần**

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Báo cáo tóm tắt tuần |
| 401 | Chưa xác thực |
| 403 | Yêu cầu role MANAGER/ADMIN |

---

## Dashboard

Dashboard điều hành (cached)

### `GET` `/api/dashboard/executive`

**Dashboard điều hành**

Tổng quan toàn tổ chức: KPI, danh sách dự án với health status, cảnh báo, phân bổ tải nhân sự, chấm công chờ duyệt. Cache Redis 10 phút.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|----|----------|-------------|
| `dept_id` | query | uuid | | Lọc theo phòng ban (Admin only) |
| `period` | query | string | | current_month / current_quarter / custom |
| `date_from` | query | date | | Ngày bắt đầu (khi period=custom) |
| `date_to` | query | date | | Ngày kết thúc (khi period=custom) |

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Dashboard data |
| 401 | Chưa xác thực |
| 403 | Yêu cầu role MANAGER/ADMIN/SUPER_ADMIN |
| 422 | period không hợp lệ |

---

## Departments

Danh sách phòng ban

### `GET` `/api/departments`

**Danh sách phòng ban**

**Responses:**

| Status | Description |
|--------|-------------|
| 200 | Danh sách phòng ban |
| 401 | Chưa xác thực |

---

> *Tài liệu này được tạo từ OpenAPI schema. Chạy `python backend/scripts/generate_api_docs.py` để cập nhật.*
