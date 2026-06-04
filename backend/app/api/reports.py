import csv
import io
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import UserRoleEnum
from app.models.user import User
from app.schemas.common import ApiResponse, paginated
from app.schemas.timesheet import WeeklySummaryRead
from app.services.timesheet_service import TimesheetService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/timesheet")
async def timesheet_report(
    dept_id: Optional[UUID] = None,
    week_start: Optional[date] = None,
    project_id: Optional[UUID] = None,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    entries = await TimesheetService(db).get_report_entries(
        user, dept_id=dept_id, week_start=week_start, project_id=project_id
    )

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "entry_id",
                "user_email",
                "user_name",
                "project_name",
                "work_date",
                "hours_logged",
                "status",
                "description",
            ]
        )
        for e in entries:
            writer.writerow(
                [
                    str(e.id),
                    e.user.email if e.user else "",
                    e.user.full_name if e.user else "",
                    e.project.name if e.project else "",
                    str(e.work_date),
                    str(e.hours_logged),
                    e.status.value,
                    e.description or "",
                ]
            )
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=timesheet_report.csv"},
        )

    # JSON response
    data = [
        {
            "entry_id": str(e.id),
            "user_id": str(e.user_id),
            "user_email": e.user.email if e.user else None,
            "user_name": e.user.full_name if e.user else None,
            "project_id": str(e.project_id),
            "project_name": e.project.name if e.project else None,
            "work_date": str(e.work_date),
            "hours_logged": float(e.hours_logged),
            "status": e.status.value,
            "description": e.description,
        }
        for e in entries
    ]
    return {"success": True, "data": data, "meta": {"total": len(data)}}


@router.get(
    "/timesheet/weekly-summary",
    response_model=ApiResponse[list[WeeklySummaryRead]],
)
async def weekly_summary_report(
    week_start: Optional[date] = None,
    dept_id: Optional[UUID] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    rows, total = await TimesheetService(db).get_weekly_summaries(
        user, week_start=week_start, dept_id=dept_id, page=page, per_page=per_page
    )
    return paginated(
        [WeeklySummaryRead.model_validate(r) for r in rows], page, per_page, total
    )
