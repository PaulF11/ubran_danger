RENAME TABLE admin_scan_candidates TO ingestion_scan_results;

ALTER TABLE ingestion_scan_results
    DROP FOREIGN KEY fk_admin_scan_incident,
    DROP FOREIGN KEY fk_admin_scan_run,
    DROP INDEX idx_admin_scan_review_status,
    DROP COLUMN review_status,
    DROP COLUMN incident_id,
    DROP COLUMN reviewed_by,
    DROP COLUMN reviewed_at,
    ADD COLUMN persistence_status VARCHAR(32) NULL AFTER verification_status,
    ADD COLUMN retryable BOOLEAN NOT NULL DEFAULT FALSE AFTER persistence_status,
    RENAME INDEX uq_admin_scan_run_source TO uq_ingestion_scan_run_source,
    ADD CONSTRAINT fk_ingestion_scan_run
        FOREIGN KEY (ingestion_run_id) REFERENCES ingestion_runs (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    COMMENT='Read-only outcomes from automated incident scanning.';
