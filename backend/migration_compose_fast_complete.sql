-- 分块上传服务端合并 — 数据库迁移
-- 添加 Fingerprint.verified 字段（异步 SHA256 验证）
ALTER TABLE fingerprints ADD COLUMN verified TINYINT(1) NULL;
