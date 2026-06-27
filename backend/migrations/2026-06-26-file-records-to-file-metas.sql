-- ============================================================
-- Migration: file_records → file_metas
-- Purpose: Repurpose the table from "upload log" to
--          "fingerprint metadata translation layer"
-- ============================================================

-- Step 1: Clean up orphan records (not referenced by any entity)
DELETE FROM file_records
WHERE id NOT IN (
    SELECT avatar_record_id FROM users WHERE avatar_record_id IS NOT NULL
    UNION
    SELECT cover_record_id FROM tasks WHERE cover_record_id IS NOT NULL
    UNION
    SELECT file_record_id FROM task_versions WHERE file_record_id IS NOT NULL
    UNION
    SELECT file_record_id FROM version_files WHERE file_record_id IS NOT NULL
)
AND id NOT IN (
    SELECT DISTINCT CAST(JSON_EXTRACT(j.value, '$') AS UNSIGNED)
    FROM forum_posts,
    JSON_TABLE(
        forum_posts.image_ids, '$[*]' COLUMNS(value JSON PATH '$')
    ) j
    WHERE forum_posts.image_ids IS NOT NULL
);

-- Step 2: Rename table
RENAME TABLE file_records TO file_metas;

-- Step 3: Drop uploaded_by column (no longer needed)
ALTER TABLE file_metas DROP COLUMN uploaded_by;

-- Step 4: Rename FK columns in referencing tables
ALTER TABLE users CHANGE avatar_record_id avatar_meta_id int NULL COMMENT '头像元数据';
ALTER TABLE tasks CHANGE cover_record_id cover_meta_id int NULL;
ALTER TABLE task_versions CHANGE file_record_id file_meta_id int NULL;
ALTER TABLE version_files CHANGE file_record_id file_meta_id int NOT NULL;
