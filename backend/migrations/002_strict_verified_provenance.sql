USE urban_danger_db;

ALTER TABLE incidents
    DROP CHECK chk_verified_incident_provenance,
    ADD CONSTRAINT chk_verified_incident_provenance
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
        );