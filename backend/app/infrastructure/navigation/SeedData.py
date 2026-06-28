"""路由种子数据和权限码 — seed.py 和测试共享的单一数据源"""

from dataclasses import dataclass

# ══════════════════════════════════════════════════════
# 权限码定义
# ══════════════════════════════════════════════════════

PERMISSION_CODES: dict[str, str] = {
    "*": "超级管理员（全部权限）",
    "admin:access": "访问管理后台",
    "page:home": "查看首页",
    "page:download": "查看下载页",
    "page:market": "查看任务市场",
    "page:forum": "查看论坛",
    "page:user": "查看用户主页",
    "page:upload": "查看上传页",
    "page:profile": "查看个人中心",
    "page:notification": "查看通知",
    "page:login": "查看登录页",
    "page:dashboard": "查看仪表盘",
    "page:admin-users": "查看用户管理",
    "page:admin-roles": "查看角色管理",
    "page:admin-perms": "查看权限列表",
    "page:admin-versions": "查看版本管理",
    "page:admin-routes": "查看路由管理",
    "dashboard:view": "查看仪表盘数据",
    "public:ping": "健康检查",
    "presence:stream": "在线状态推送",
    "auth:login": "登录",
    "auth:register": "注册",
    "auth:verify": "验证邮箱链接",
    "auth:send-verify": "免登录重发验证",
    "auth:resend-verify": "登录后重发验证",
    "file:check": "文件指纹校验",
    "file:upload:init": "上传初始化",
    "file:upload:chunk": "上传分片",
    "file:upload:complete": "上传完成",
    "file:upload:direct": "小文件直传",
    "task:list": "查看任务列表",
    "task:rankings": "查看排行榜",
    "task:user": "查看用户任务",
    "task:view": "查看任务详情",
    "task:comments": "查看任务评论",
    "task:download": "下载任务",
    "task:create": "创建任务",
    "task:like": "点赞任务",
    "task:comment": "发表评论",
    "task:delete": "删除任务",
    "task:lookup": "查询任务版本",
    "forum:boards": "查看论坛板块",
    "forum:search": "搜索帖子",
    "forum:threads": "查看帖子列表",
    "forum:view": "查看帖子详情",
    "forum:post": "发帖",
    "forum:reply": "回帖",
    "forum:like": "点赞帖子",
    "forum:update": "编辑帖子",
    "forum:delete": "删帖",
    "forum:manage": "管理论坛",
    "comment:delete": "删除评论",
    "admin:routes": "管理路由",
    "role:update": "编辑角色",
    "role:permissions": "角色权限分配",
    "version:list": "查看版本列表",
    "version:download": "下载版本文件",
    "version:diff": "版本差异查询",
    "version:blob": "Blob 下载",
    "version:create": "创建版本",
    "version:delete": "删除版本",
    "route:list": "查看路由列表",
    "route:create": "创建路由",
    "route:update": "编辑路由",
    "route:delete": "删除路由",
    "route:toggle": "启停路由",
    "notification:list": "查看通知列表",
    "notification:count": "查看未读数",
    "notification:read": "标记已读",
    "notification:read-all": "全部已读",
    "user:list": "查看用户列表",
    "user:assign": "分配角色",
    "user:disable": "禁用用户",
    "user:delete": "删除用户",
    "user:view": "查看个人信息",
    "user:update": "更新个人资料",
    "user:email": "更换邮箱",
    "user:downloads": "查看下载记录",
    "user:likes": "查看点赞记录",
    "user:avatar": "上传头像",
    "role:list": "查看角色列表",
    "role:create": "创建角色",
    "role:delete": "删除角色",
    "perm:list": "查看权限列表",
    "perm:create": "创建权限",
    "perm:update": "编辑权限",
    "perm:delete": "删除权限",
    "review:list": "查看审核列表",
    "review:decide": "审核决定",
    "admin:audit": "查看审计日志",
    "ai:vision": "AI 视觉识别",
}

# ══════════════════════════════════════════════════════
# 路由种子数据
# ══════════════════════════════════════════════════════


@dataclass
class RouteSeed:
    path: str
    title: str
    perm: str | None = None
    icon: str | None = None
    in_menu: bool = True
    sort_order: int = 0
    component: str | None = None


# ── 公开路由（包括 in_menu 和子路由） ──
PUBLIC_ROUTES: list[RouteSeed] = [
    RouteSeed(path="/", title="首页", icon="HomeOutlined", perm="page:home", sort_order=10, component="HomePage"),
    RouteSeed(path="/download", title="下载", icon="DownloadOutlined", perm="page:download", sort_order=20, component="DownloadPage"),
    RouteSeed(path="/market", title="任务市场", icon="AppstoreOutlined", perm="page:market", sort_order=30, component="MarketPage"),
    RouteSeed(path="/forum", title="论坛", icon="MessageOutlined", perm="page:forum", sort_order=40, component="ForumPage"),
    RouteSeed(path="/review", title="审核中心", icon="AuditOutlined", perm="review:list", sort_order=50, component="ReviewPage"),
    RouteSeed(path="/upload", title="上传", perm="page:upload", in_menu=False, sort_order=70, component="UploadPage"),
    RouteSeed(path="/profile", title="个人中心", perm="page:profile", in_menu=False, sort_order=80, component="ProfilePage"),
    RouteSeed(path="/user/:userId", title="用户主页", perm="page:user", in_menu=False, sort_order=60, component="AuthorPage"),
    RouteSeed(path="/notifications", title="通知", perm="page:notification", in_menu=False, sort_order=100, component="NotificationsPage"),
    RouteSeed(path="/login", title="登录", perm="page:login", in_menu=False, sort_order=90, component="LoginPage"),
    RouteSeed(path="/admin", title="管理", icon="SettingOutlined", perm="admin:access", sort_order=110, component="AdminLayout"),
    # 非菜单子路由（各自使用独立权限码）
    RouteSeed(path="/market/:taskId", title="任务详情", perm="task:view", in_menu=False, component="TaskDetailPage"),
    RouteSeed(path="/ranking", title="排行榜", perm="task:rankings", in_menu=False, component="RankingPage"),
    RouteSeed(path="/forum/:boardId", title="板块详情", perm="forum:boards", in_menu=False, component="ForumBoardPage"),
    RouteSeed(path="/forum/post/:threadId", title="帖子详情", perm="forum:view", in_menu=False, component="ForumThreadPage"),
    RouteSeed(path="/forum/create", title="发帖", perm="forum:post", in_menu=False, component="ForumCreatePage"),
    RouteSeed(path="/forum/search", title="搜索", perm="forum:search", in_menu=False, component="ForumSearchPage"),
]

# ── 管理后台子路由（parent_id 在运行时关联到 /admin 的 ID） ──
ADMIN_ROUTES: list[RouteSeed] = [
    RouteSeed(path="/admin/dashboard", title="仪表盘", icon="DashboardOutlined", perm="page:dashboard", sort_order=10, component="DashboardPage"),
    RouteSeed(path="/admin/users", title="用户管理", icon="UserOutlined", perm="page:admin-users", sort_order=20, component="UsersPage"),
    RouteSeed(path="/admin/roles", title="角色管理", icon="TeamOutlined", perm="page:admin-roles", sort_order=30, component="RolesPage"),
    RouteSeed(path="/admin/permissions", title="权限列表", icon="SafetyCertificateOutlined", perm="page:admin-perms", sort_order=40, component="PermissionsPage"),
    RouteSeed(path="/admin/versions", title="下载版本", icon="CloudDownloadOutlined", perm="page:admin-versions", sort_order=50, component="VersionsPage"),
    RouteSeed(path="/admin/routes", title="路由管理", icon="NodeIndexOutlined", perm="page:admin-routes", sort_order=70, component="RoutesPage"),
    RouteSeed(path="/admin/logs", title="审计日志", icon="FileSearchOutlined", perm="admin:audit", sort_order=80, component="LogsPage"),
]

# ── 所有路由的 (path, perm) 对（供测试使用） ──
ALL_ROUTE_PERMS: list[tuple[str, str | None]] = [
    (r.path, r.perm) for r in PUBLIC_ROUTES + ADMIN_ROUTES
]
