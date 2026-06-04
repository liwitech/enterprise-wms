from datetime import date, timedelta
from decimal import Decimal

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.enums import TimesheetStatusEnum
from app.models.timesheet import TimesheetEntry
from app.models.timesheet_weekly_summary import TimesheetWeeklySummary

scheduler = AsyncIOScheduler()


async def weekly_snapshot_job() -> None:
    from app.db.session import AsyncSessionLocal

    today = date.today()
    # The job runs on Monday — snapshot the previous week (Mon to Sun)
    days_since_monday = today.weekday()
    last_monday = today - timedelta(days=days_since_monday + 7)
    last_sunday = last_monday + timedelta(days=6)

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(
                    TimesheetEntry.user_id,
                    TimesheetEntry.project_id,
                    func.sum(TimesheetEntry.hours_logged).label("total_hours"),
                    func.count(TimesheetEntry.id).label("entry_count"),
                )
                .where(
                    TimesheetEntry.work_date >= last_monday,
                    TimesheetEntry.work_date <= last_sunday,
                    TimesheetEntry.status == TimesheetStatusEnum.APPROVED,
                )
                .group_by(TimesheetEntry.user_id, TimesheetEntry.project_id)
            )
        ).all()

        if not rows:
            return

        for row in rows:
            stmt = (
                pg_insert(TimesheetWeeklySummary)
                .values(
                    user_id=row.user_id,
                    project_id=row.project_id,
                    week_start=last_monday,
                    total_hours=Decimal(str(row.total_hours)),
                    entry_count=row.entry_count,
                )
                .on_conflict_do_update(
                    constraint="uq_weekly_summary",
                    set_={
                        "total_hours": Decimal(str(row.total_hours)),
                        "entry_count": row.entry_count,
                    },
                )
            )
            await db.execute(stmt)

        await db.commit()


def setup_scheduler() -> None:
    scheduler.add_job(
        weekly_snapshot_job,
        CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="weekly_timesheet_snapshot",
        replace_existing=True,
    )
