USE urban_danger_db;

ALTER TABLE locations
    MODIFY barangay VARCHAR(100) NULL COMMENT 'Source-reported Taguig barangay, when stated.',
    MODIFY latitude DECIMAL(10,8) NULL COMMENT 'Reliable map coordinate; NULL when not established.',
    MODIFY longitude DECIMAL(11,8) NULL COMMENT 'Reliable map coordinate; NULL when not established.',
    ADD COLUMN location_source_name VARCHAR(255) NULL COMMENT 'Geographic source used to establish this location coordinate.',
    ADD COLUMN location_source_url VARCHAR(512) NULL COMMENT 'Exact geographic feature URL used to establish this coordinate.',
    ADD CONSTRAINT chk_locations_coordinate_pair
        CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL));

ALTER TABLE incidents
    MODIFY location_id BIGINT UNSIGNED NULL COMMENT 'NULL when the source does not establish a barangay or mappable location.',
    ADD COLUMN city VARCHAR(100) NULL COMMENT 'City explicitly attributed by the source.',
    ADD COLUMN source_name VARCHAR(255) NULL COMMENT 'Publisher or agency name; source remains for API compatibility.',
    ADD COLUMN source_url VARCHAR(512) NULL COMMENT 'Exact article or official release URL.',
    ADD COLUMN source_published_at DATE NULL COMMENT 'Publication date of the original source.',
    ADD COLUMN location_description VARCHAR(255) NULL COMMENT 'Verbatim precision of the source-reported location, without inferred detail.',
    ADD COLUMN incident_time_known BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether the source explicitly reports an incident time.',
    ADD COLUMN verification_method VARCHAR(500) NULL COMMENT 'How the source and incident facts were verified.',
    ADD COLUMN last_verified_at DATETIME NULL COMMENT 'When verification was last completed.',
    ADD KEY idx_incidents_city_status_date (city, verification_status, incident_date),
    ADD KEY idx_incidents_source_url (source_url);

UPDATE incidents
JOIN locations ON incidents.location_id = locations.id
SET incidents.city = 'Taguig City'
WHERE LOWER(TRIM(locations.barangay)) IN (
    'bagumbayan', 'bambang', 'calzada', 'cembo', 'central bicutan',
    'central signal village', 'comembo', 'east rembo', 'fort bonifacio',
    'hagonoy', 'ibayo-tipas', 'katuparan', 'ligid-tipas', 'lower bicutan',
    'maharlika village', 'napindan', 'new lower bicutan', 'north daang hari',
    'north signal village', 'palingon', 'pembo', 'pinagsama', 'pitogo',
    'post proper northside', 'post proper southside', 'rizal', 'san miguel',
    'santa ana', 'south cembo', 'south daang hari', 'south signal village',
    'tanyag', 'tuktukan', 'upper bicutan', 'ususan', 'wawa',
    'western bicutan', 'west rembo'
);

UPDATE incidents
SET source_name = source
WHERE source_name IS NULL AND source IS NOT NULL;

UPDATE incidents
SET verification_status = 'PENDING_REVIEW',
    verification_method = NULL,
    last_verified_at = NULL
WHERE verification_status = 'VERIFIED'
  AND (
      city IS NULL
      OR city <> 'Taguig City'
      OR source_name IS NULL
      OR source_url IS NULL
      OR verification_method IS NULL
      OR last_verified_at IS NULL
  );

ALTER TABLE incidents
    ADD CONSTRAINT chk_verified_incident_provenance
        CHECK (
            verification_status <> 'VERIFIED'
            OR (
                city = 'Taguig City'
                AND source_name IS NOT NULL
                AND source_url IS NOT NULL
                AND verification_method IS NOT NULL
                AND last_verified_at IS NOT NULL
            )
        );