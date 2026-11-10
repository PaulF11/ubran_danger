-- File note: This file handles urban_danger_db.sql.

DROP DATABASE IF EXISTS urban_danger_db;
CREATE DATABASE urban_danger_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE urban_danger_db;

-- =========================================================
-- Users
-- =========================================================
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT 'Full name of the user or administrator.',
    email VARCHAR(255) NOT NULL COMMENT 'Unique email address used for login and account identification.',
    password_hash VARCHAR(255) NOT NULL COMMENT 'Future hashed password. Plain-text passwords are never stored.',
    role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER' COMMENT 'Permission level within the system.',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation timestamp.',
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System users and administrators.';

-- =========================================================
-- Incident categories
-- =========================================================
CREATE TABLE incident_categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT 'Standardized incident category name.',
    description TEXT NULL COMMENT 'Optional additional context for the category.',
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Standardized categories used for incidents.';

-- =========================================================
-- Geographic locations
-- =========================================================
CREATE TABLE locations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    barangay VARCHAR(100) NULL COMMENT 'Source-reported Taguig barangay, when stated.',
    latitude DECIMAL(10,8) NULL COMMENT 'Reliable map coordinate; NULL when not established.',
    longitude DECIMAL(11,8) NULL COMMENT 'Reliable map coordinate; NULL when not established.',
    location_source_name VARCHAR(255) NULL COMMENT 'Geographic source used to establish this coordinate.',
    location_source_url VARCHAR(512) NULL COMMENT 'Exact geographic feature URL used to establish this coordinate.',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the location record was created.',
    PRIMARY KEY (id),
    KEY idx_locations_barangay (barangay),
    KEY idx_locations_coordinates (latitude, longitude),
    CONSTRAINT chk_locations_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_locations_longitude CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_locations_coordinate_pair
        CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Map-related geographic locations used by incidents and future route analytics.';

-- =========================================================
-- Incidents
-- =========================================================
CREATE TABLE incidents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id INT UNSIGNED NOT NULL COMMENT 'Reference to the standardized incident category.',
    location_id BIGINT UNSIGNED NULL COMMENT 'NULL when the source does not establish a barangay or mappable location.',
    city VARCHAR(100) NULL COMMENT 'City explicitly attributed by the source; NULL candidates remain non-public pending review.',
    description TEXT NOT NULL COMMENT 'Incident summary or details from a verified source.',
    severity ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL COMMENT 'Severity level of the incident.',
    incident_date DATETIME NOT NULL COMMENT 'Date and time the incident occurred.',
    source VARCHAR(255) NOT NULL COMMENT 'Source of the incident information such as agency, organization, or verified feed.',
    source_name VARCHAR(255) NULL COMMENT 'Publisher or agency name; source remains for API compatibility.',
    source_url VARCHAR(512) NULL COMMENT 'Exact article or official release URL.',
    source_published_at DATE NULL COMMENT 'Publication date of the original source.',
    location_description VARCHAR(255) NULL COMMENT 'Source-reported location detail, without inferred precision.',
    incident_time_known BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether the source explicitly reports an incident time.',
    verification_method VARCHAR(500) NULL COMMENT 'How the source and incident facts were verified.',
    last_verified_at DATETIME NULL COMMENT 'When verification was last completed.',
    verification_status ENUM('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING_REVIEW' COMMENT 'Review state. Only VERIFIED records are publicly visible.',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the incident record was created.',
    PRIMARY KEY (id),
    KEY idx_incidents_category_id (category_id),
    KEY idx_incidents_location_id (location_id),
    KEY idx_incidents_verification_status (verification_status),
    KEY idx_incidents_severity (severity),
    KEY idx_incidents_incident_date (incident_date),
    KEY idx_incidents_category_verification_date (category_id, verification_status, incident_date),
    KEY idx_incidents_city_status_date (city, verification_status, incident_date),
    KEY idx_incidents_source_url (source_url),
    CONSTRAINT fk_incidents_category
        FOREIGN KEY (category_id) REFERENCES incident_categories (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_incidents_location
        FOREIGN KEY (location_id) REFERENCES locations (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_verified_incident_provenance
        CHECK (
            verification_status <> 'VERIFIED'
            OR (
                city IS NOT NULL
                AND city = 'Taguig City'
                AND source_name IS NOT NULL
                AND TRIM(source_name) <> ''
                AND source_url IS NOT NULL
                AND TRIM(source_url) <> ''
                AND verification_method IS NOT NULL
                AND TRIM(verification_method) <> ''
                AND last_verified_at IS NOT NULL
            )
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Incidents obtained from verified or reviewed sources only.';

-- =========================================================
-- Safe seed data for categories
-- =========================================================
INSERT INTO incident_categories (name, description) VALUES
    ('Theft', 'Unauthorized taking of property or belongings.'),
    ('Robbery', 'Taking property through force or intimidation.'),
    ('Assault', 'Physical attack or threatening violence.'),
    ('Vandalism', 'Intentional damage or destruction of property.'),
    ('Other', 'Other incident type not covered by standard categories.');

-- End of schema
