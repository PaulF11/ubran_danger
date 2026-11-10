-- File note: This file handles 005_admin_scan_candidates.sql.

CREATE TABLE IF NOT EXISTS admin_scan_candidates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ingestion_run_id BIGINT UNSIGNED NOT NULL,
    source_url_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_url TEXT NOT NULL,
    title VARCHAR(255) NULL,
    source_name VARCHAR(255) NULL,
    source_published_at VARCHAR(64) NULL,
    retrieved_at VARCHAR(64) NULL,
    scan_status VARCHAR(32) NOT NULL,
    verification_status VARCHAR(32) NOT NULL,
    reasons_json JSON NOT NULL,
    candidate_json JSON NULL,
    review_status ENUM(
        'PENDING',
        'APPROVING',
        'APPROVED',
        'REJECTED',
        'DUPLICATE',
        'CONFLICT'
    ) NOT NULL DEFAULT 'PENDING',
    incident_id BIGINT UNSIGNED NULL,
    reviewed_by VARCHAR(255) NULL,
    reviewed_at DATETIME(3) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_scan_run_source (ingestion_run_id, source_url_hash),
    KEY idx_admin_scan_review_status (review_status, created_at),
    KEY idx_admin_scan_incident_id (incident_id),
    CONSTRAINT fk_admin_scan_run
        FOREIGN KEY (ingestion_run_id) REFERENCES ingestion_runs (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_admin_scan_incident
        FOREIGN KEY (incident_id) REFERENCES incidents (id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Non-public article scan results awaiting explicit administrator review.';