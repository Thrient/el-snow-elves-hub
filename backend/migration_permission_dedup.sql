-- ============================================================
-- 权限码去重 & 清理 — 数据库迁移 SQL
-- 适用于已部署的 el-snow-elves-hub 生产数据库
-- 执行前请备份: mysqldump -u <user> -p <db> > backup_$(date +%Y%m%d).sql
-- ============================================================

-- 1. 更新路由权限码（将共享码替换为独立码）
UPDATE routes SET perm = 'task:view'     WHERE path = '/market/:taskId'       AND perm = 'page:market';
UPDATE routes SET perm = 'task:rankings' WHERE path = '/ranking'              AND perm = 'page:market';
UPDATE routes SET perm = 'forum:boards'  WHERE path = '/forum/:boardId'       AND perm = 'page:forum';
UPDATE routes SET perm = 'forum:view'    WHERE path = '/forum/post/:threadId' AND perm = 'page:forum';
UPDATE routes SET perm = 'forum:post'    WHERE path = '/forum/create'         AND perm = 'page:forum';
UPDATE routes SET perm = 'forum:search'  WHERE path = '/forum/search'         AND perm = 'page:forum';

-- 2. 添加 admin:access 权限码（如果不存在）
INSERT IGNORE INTO permissions (code, name) VALUES ('admin:access', '访问管理后台');

-- 3. 删除孤儿权限码（未被任何路由或 API 使用的码）
--    先删除角色-权限关联，再删除权限本身
DELETE rp FROM role_permissions rp
INNER JOIN permissions p ON rp.permission_id = p.id
WHERE p.code IN ('admin:tasks', 'admin:versions', 'admin:blobs:check', 'admin:blobs:upload');

DELETE FROM permissions
WHERE code IN ('admin:tasks', 'admin:versions', 'admin:blobs:check', 'admin:blobs:upload');

-- 4. role:update 权限码名称修正（如存在重复，保留"编辑角色"语义）
--    注意: seed.py 中第二个 "编辑角色权限" 已删除，生产库如存在两条记录则合并
--    如有两条 role:update 记录，将其关联的 role_permissions 指向第一条
UPDATE role_permissions rp
INNER JOIN permissions p ON rp.permission_id = p.id
INNER JOIN (
    SELECT code, MIN(id) as keep_id FROM permissions WHERE code = 'role:update' GROUP BY code HAVING COUNT(*) > 1
) dup ON p.code = dup.code AND p.id != dup.keep_id
SET rp.permission_id = dup.keep_id;

-- 删除重复的 role:update 权限记录
DELETE FROM permissions
WHERE code = 'role:update'
AND id NOT IN (SELECT MIN(id) FROM (SELECT * FROM permissions) AS tmp WHERE code = 'role:update' GROUP BY code);

-- ============================================================
-- 验证: 确认所有路由权限码唯一
SELECT perm, COUNT(*) as cnt, GROUP_CONCAT(path) as paths
FROM routes WHERE perm IS NOT NULL
GROUP BY perm HAVING COUNT(*) > 1;
-- 预期: 返回空结果集
-- ============================================================
