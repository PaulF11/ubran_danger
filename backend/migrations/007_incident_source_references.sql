-- File note: This file handles 007_incident_source_references.sql.

USE urban_danger_db;

CREATE TABLE IF NOT EXISTS incident_source_references (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    source_published_at DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_source_reference (incident_id, source_url),
    KEY idx_incident_source_references_incident (incident_id),
    CONSTRAINT fk_incident_source_references_incident
        FOREIGN KEY (incident_id) REFERENCES incidents (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
