USE urban_danger_db;

START TRANSACTION;

-- Synthetic Philippine-context test points; these are not actual incident locations.
INSERT INTO locations (barangay, latitude, longitude)
SELECT 'DEVELOPMENT TEST AREA 01 (FICTIONAL)', 14.60010000, 120.98010000
WHERE NOT EXISTS (
    SELECT 1
    FROM locations
    WHERE barangay = 'DEVELOPMENT TEST AREA 01 (FICTIONAL)'
      AND latitude = 14.60010000
      AND longitude = 120.98010000
);

INSERT INTO locations (barangay, latitude, longitude)
SELECT 'DEVELOPMENT TEST AREA 02 (FICTIONAL)', 14.61020000, 120.99020000
WHERE NOT EXISTS (
    SELECT 1
    FROM locations
    WHERE barangay = 'DEVELOPMENT TEST AREA 02 (FICTIONAL)'
      AND latitude = 14.61020000
      AND longitude = 120.99020000
);

INSERT INTO locations (barangay, latitude, longitude)
SELECT 'DEVELOPMENT TEST AREA 03 (FICTIONAL)', 14.62030000, 121.00030000
WHERE NOT EXISTS (
    SELECT 1
    FROM locations
    WHERE barangay = 'DEVELOPMENT TEST AREA 03 (FICTIONAL)'
      AND latitude = 14.62030000
      AND longitude = 121.00030000
);

-- Pending review: fictional theft scenario for development testing only.
INSERT INTO incidents (
    category_id,
    location_id,
  city,
    description,
    severity,
    incident_date,
    source,
    verification_status
)
SELECT
    c.id,
    (
        SELECT l.id
        FROM locations AS l
        WHERE l.barangay = 'DEVELOPMENT TEST AREA 01 (FICTIONAL)'
          AND l.latitude = 14.60010000
          AND l.longitude = 120.98010000
        ORDER BY l.id ASC
        LIMIT 1
    ),
      'Taguig City',
    'DEVELOPMENT TEST DATA ONLY: Fictional theft scenario for API testing. No real incident occurred; coordinates are synthetic and do not identify an actual incident location.',
    'LOW',
    '2026-09-15 09:00:00',
    'DEVELOPMENT TEST DATA - NOT A REAL INCIDENT',
    'PENDING_REVIEW'
FROM incident_categories AS c
WHERE c.name = 'Theft'
  AND EXISTS (
      SELECT 1
      FROM locations AS l
      WHERE l.barangay = 'DEVELOPMENT TEST AREA 01 (FICTIONAL)'
        AND l.latitude = 14.60010000
        AND l.longitude = 120.98010000
  )
  AND NOT EXISTS (
      SELECT 1
      FROM incidents AS i
      WHERE i.source = 'DEVELOPMENT TEST DATA - NOT A REAL INCIDENT'
        AND i.description = 'DEVELOPMENT TEST DATA ONLY: Fictional theft scenario for API testing. No real incident occurred; coordinates are synthetic and do not identify an actual incident location.'
  );

-- Pending review: fictional robbery scenario for development testing only.
INSERT INTO incidents (
    category_id,
    location_id,
  city,
    description,
    severity,
    incident_date,
    source,
    verification_status
)
SELECT
    c.id,
    (
        SELECT l.id
        FROM locations AS l
        WHERE l.barangay = 'DEVELOPMENT TEST AREA 02 (FICTIONAL)'
          AND l.latitude = 14.61020000
          AND l.longitude = 120.99020000
        ORDER BY l.id ASC
        LIMIT 1
    ),
      'Taguig City',
    'DEVELOPMENT TEST DATA ONLY: Fictional robbery scenario for API testing. No real incident occurred; coordinates are synthetic and do not identify an actual incident location.',
    'MEDIUM',
    '2026-09-16 14:30:00',
    'DEVELOPMENT TEST DATA - NOT A REAL INCIDENT',
    'PENDING_REVIEW'
FROM incident_categories AS c
WHERE c.name = 'Robbery'
  AND EXISTS (
      SELECT 1
      FROM locations AS l
      WHERE l.barangay = 'DEVELOPMENT TEST AREA 02 (FICTIONAL)'
        AND l.latitude = 14.61020000
        AND l.longitude = 120.99020000
  )
  AND NOT EXISTS (
      SELECT 1
      FROM incidents AS i
      WHERE i.source = 'DEVELOPMENT TEST DATA - NOT A REAL INCIDENT'
        AND i.description = 'DEVELOPMENT TEST DATA ONLY: Fictional robbery scenario for API testing. No real incident occurred; coordinates are synthetic and do not identify an actual incident location.'
  );

-- Pending-review synthetic development record; it is never public real-world data.
INSERT INTO incidents (
    category_id,
    location_id,
  city,
    description,
    severity,
    incident_date,
    source,
    verification_status
)
SELECT
    c.id,
    (
        SELECT l.id
        FROM locations AS l
        WHERE l.barangay = 'DEVELOPMENT TEST AREA 03 (FICTIONAL)'
          AND l.latitude = 14.62030000
          AND l.longitude = 121.00030000
        ORDER BY l.id ASC
        LIMIT 1
    ),
      'Taguig City',
      'DEVELOPMENT TEST DATA ONLY - NOT A REAL INCIDENT: Fictional assault scenario pending review for development workflows. No real incident occurred; coordinates are synthetic and do not identify an actual incident location.',
    'MEDIUM',
    '2026-09-17 18:15:00',
    'DEVELOPMENT TEST DATA - NOT A REAL INCIDENT',
    'PENDING_REVIEW'
FROM incident_categories AS c
WHERE c.name = 'Assault'
  AND EXISTS (
      SELECT 1
      FROM locations AS l
      WHERE l.barangay = 'DEVELOPMENT TEST AREA 03 (FICTIONAL)'
        AND l.latitude = 14.62030000
        AND l.longitude = 121.00030000
  )
  AND NOT EXISTS (
      SELECT 1
      FROM incidents AS i
      WHERE i.source = 'DEVELOPMENT TEST DATA - NOT A REAL INCIDENT'
        AND i.description = 'DEVELOPMENT TEST DATA ONLY - NOT A REAL INCIDENT: Fictional assault scenario marked verified solely to test development workflows. No real incident occurred; coordinates are synthetic and do not identify an actual incident location.'
  );

COMMIT;