from app.models.user import User  # noqa: F401
from app.models.rbac import Permission, Role, RolePermission  # noqa: F401
from app.models.download import DownloadVersion  # noqa: F401
from app.models.task import Task, Comment, TaskLike, DownloadRecord  # noqa: F401
from app.models.forum import ForumBoard, ForumPost  # noqa: F401
from app.models.upload import Upload  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.fingerprint import Fingerprint  # noqa: F401
from app.models.orphan_tracker import OrphanTracker  # noqa: F401
from app.models.version_file import VersionFile  # noqa: F401
from app.models.route import Route  # noqa: F401
