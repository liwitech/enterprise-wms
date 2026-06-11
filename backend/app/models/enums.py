import enum


class UserRoleEnum(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"


class ScopeTypeEnum(str, enum.Enum):
    ORG = "ORG"
    DEPT = "DEPT"
    PROJECT = "PROJECT"


class ProjectTypeEnum(str, enum.Enum):
    WATERFALL = "WATERFALL"
    AGILE = "AGILE"
    MIXED = "MIXED"


class ProjectStatusEnum(str, enum.Enum):
    PLANNING = "PLANNING"
    IN_PROGRESS = "IN_PROGRESS"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PriorityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class SprintStatusEnum(str, enum.Enum):
    PLANNING = "PLANNING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class MilestoneStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    ACHIEVED = "ACHIEVED"
    MISSED = "MISSED"


class ProjectMemberRoleEnum(str, enum.Enum):
    PM = "PM"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class TaskStatusEnum(str, enum.Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    IN_REVIEW = "IN_REVIEW"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class TimesheetStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class DeptTypeEnum(str, enum.Enum):
    KHOI = "KHOI"
    BAN = "BAN"
    TRUNG_TAM = "TRUNG_TAM"
    PHONG = "PHONG"
