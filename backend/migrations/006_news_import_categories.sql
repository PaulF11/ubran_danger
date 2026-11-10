-- File note: This file handles 006_news_import_categories.sql.

USE urban_danger_db;

INSERT INTO incident_categories (name, description) VALUES
    ('Shooting', 'Firearm discharge or armed encounter reported by a trusted source.'),
    ('Drug-related', 'Drug-related arrest or police operation reported by a trusted source.'),
    ('Police-related', 'Police conduct or apprehension incident under investigation.'),
    ('Road Accident', 'Road collision or traffic incident reported by a trusted source.'),
    ('Fire', 'Fire or structural fire incident reported by a trusted source.'),
    ('Law Enforcement', 'Law-enforcement operation or fugitive apprehension.')
ON DUPLICATE KEY UPDATE description = VALUES(description);
