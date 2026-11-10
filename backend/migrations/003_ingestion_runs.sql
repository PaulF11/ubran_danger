-- File note: This file handles 003_ingestion_runs.sql.

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    started_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL,
    status ENUM('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED') NOT NULL,
    sources_checked INT UNSIGNED NOT NULL DEFAULT 0,
    articles_collected INT UNSIGNED NOT NULL DEFAULT 0,
    articles_prefiltered INT UNSIGNED NOT NULL DEFAULT 0,
    articles_processed INT UNSIGNED NOT NULL DEFAULT 0,
    candidates_found INT UNSIGNED NOT NULL DEFAULT 0,
    verified_count INT UNSIGNED NOT NULL DEFAULT 0,
    rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
    duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
    inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
    error_count INT UNSIGNED NOT NULL DEFAULT 0,
    duration_ms BIGINT UNSIGNED NULL,
    error_message VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ingestion_runs_started_at (started_at),
    KEY idx_ingestion_runs_status_started (status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Aggregate execution history for automated incident ingestion.';