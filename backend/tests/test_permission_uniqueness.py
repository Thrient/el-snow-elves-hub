"""TDD: 权限码去重 — 一个权限码只能用于一个路由 / 一个 API 端点"""

import sys
sys.path.insert(0, ".")

from collections import Counter
from app.infrastructure.navigation.SeedData import ALL_ROUTE_PERMS as ROUTE_SEEDS
from app.infrastructure.navigation.SeedData import PERMISSION_CODES

# ── API 端点使用的权限码（从各 Router.py 中提取）──
API_PERMS: set[str] = {
    # navigation
    "public:ping", "route:list",
    # release
    "version:list", "version:diff", "version:blob", "version:download",
    "client:stream",
    # admin
    "dashboard:view",
    "user:list", "user:assign", "user:disable", "user:delete",
    "role:list", "role:permissions", "role:create", "role:update", "role:delete",
    "perm:list", "perm:create", "perm:update", "perm:delete",
    "version:create", "version:delete",
    "task:approve", "forum:review:list", "forum:review",
    "admin:routes", "route:create", "route:update", "route:delete", "route:toggle",
    # identity
    "auth:register", "auth:login", "auth:refresh",
    "user:view", "user:update", "user:email",
    "auth:verify", "auth:send-verify", "auth:resend-verify",
    "user:downloads", "user:likes", "user:avatar",
    # notification
    "notification:list", "notification:count", "notification:read", "notification:read-all",
    # task
    "task:list", "task:rankings", "task:user", "task:view",
    "task:download", "task:delete", "task:like", "task:comments",
    "task:comment", "comment:delete", "task:create",
    # forum
    "forum:boards", "forum:search", "forum:threads", "forum:view",
    "forum:post", "forum:reply", "forum:update", "forum:delete",
    "forum:manage", "forum:like",
    # file/upload
    "file:check", "file:upload:init", "file:upload:chunk", "file:upload:complete", "file:upload:direct",
    # wildcard + admin access
    "*", "admin:access",
}


# ══════════════════════════════════════════════════════
# Tests
# ══════════════════════════════════════════════════════

class TestRoutePermUniqueness:
    """每个路由应有独立权限码，禁止一个权限码被多个路由使用"""

    def test_no_duplicate_perms_across_routes(self):
        """禁止不同路由共享同一个权限码"""
        perms_with_path = [(path, perm) for path, perm in ROUTE_SEEDS if perm is not None]
        perm_counts = Counter(perm for _, perm in perms_with_path)
        duplicates = {perm: count for perm, count in perm_counts.items() if count > 1}

        if duplicates:
            dup_details = []
            for perm in duplicates:
                paths = [path for path, p in perms_with_path if p == perm]
                dup_details.append(f"  {perm} ({len(paths)} routes): {paths}")
            assert len(duplicates) == 0, (
                f"以下权限码被多个路由共享（违反一码一意原则）:\n" + "\n".join(dup_details)
            )

    def test_all_route_perms_exist_in_permission_codes(self):
        """路由中使用的每个权限码必须在 PERMISSION_CODES 中有定义"""
        route_perms = {perm for _, perm in ROUTE_SEEDS if perm is not None}
        defined_perms = set(PERMISSION_CODES.keys())
        missing = route_perms - defined_perms

        assert not missing, (
            f"以下权限码在路由中使用但 PERMISSION_CODES 中未定义:\n"
            + "\n".join(f"  {p}" for p in sorted(missing))
        )

    def test_no_orphan_permission_codes(self):
        """PERMISSION_CODES 中的每个码要么被路由使用，要么被 API 使用（无孤儿码）"""
        route_perms = {perm for _, perm in ROUTE_SEEDS if perm is not None}
        all_used = route_perms | API_PERMS
        defined_perms = set(PERMISSION_CODES.keys())
        orphans = defined_perms - all_used

        assert not orphans, (
            f"以下权限码在 PERMISSION_CODES 中定义但从未被任何路由/API使用（孤儿码）:\n"
            + "\n".join(f"  {p}" for p in sorted(orphans))
        )

    def test_no_missing_page_perms_for_sub_routes(self):
        """子路由（如 /market/:taskId）应使用比父路由更细粒度的权限码"""
        parent_perms = {path: perm for path, perm in ROUTE_SEEDS if perm is not None}

        violations = []
        for path, perm in parent_perms.items():
            for other_path, other_perm in parent_perms.items():
                if other_path == path:
                    continue
                if other_path.startswith(path + "/") and other_perm == perm:
                    violations.append(
                        f"  子路由 {other_path} 与父路由 {path} 共享权限码 {perm}"
                    )

        assert not violations, (
            f"以下子路由使用了与父路由相同的权限码（应使用更细粒度的码）:\n"
            + "\n".join(violations)
        )
