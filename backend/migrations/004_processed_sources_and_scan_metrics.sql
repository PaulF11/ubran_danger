-- File note: This file handles 004_processed_sources_and_scan_metrics.sql.
CREATE TABLE IF NOT EXISTS ingestion_processed_sources (
    source_url_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_url TEXT NOT NULL,
    status ENUM('PROCESSED', 'RETRY') NOT NULL,
    last_seen_at DATETIME(3) NOT NULL,
    processed_at DATETIME(3) NULL,
    PRIMARY KEY (source_url_hash),
    KEY idx_ingestion_processed_sources_status_seen (status, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tracks trusted article URLs already handled by the ingestion pipeline.';

SET @migration_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ingestion_runs'
      AND COLUMN_NAME = 'run_source'
  ),
  'SELECT 1',
  'ALTER TABLE ingestion_runs ADD COLUMN run_source ENUM(''SCHEDULED'', ''MANUAL'') NOT NULL DEFAULT ''SCHEDULED'' AFTER status'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ingestion_runs'
      AND COLUMN_NAME = 'articles_skipped'
  ),
  'SELECT 1',
  'ALTER TABLE ingestion_runs ADD COLUMN articles_skipped INT UNSIGNED NOT NULL DEFAULT 0 AFTER articles_processed'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ingestion_runs'
      AND COLUMN_NAME = 'gemini_requests'
  ),
  'SELECT 1',
  'ALTER TABLE ingestion_runs ADD COLUMN gemini_requests INT UNSIGNED NOT NULL DEFAULT 0 AFTER candidates_found'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ingestion_runs'
      AND COLUMN_NAME = 'rate_limit_count'
  ),
  'SELECT 1',
  'ALTER TABLE ingestion_runs ADD COLUMN rate_limit_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER error_count'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

INSERT IGNORE INTO ingestion_processed_sources
    (source_url_hash, source_url, status, last_seen_at, processed_at)
SELECT SHA2(source_url, 256), source_url, 'PROCESSED',
       UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM incidents
WHERE verification_status = 'VERIFIED'
  AND source_url IS NOT NULL
  AND TRIM(source_url) <> '';