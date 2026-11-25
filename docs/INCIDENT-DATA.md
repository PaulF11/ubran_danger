# Incident data

## Eligibility and verification

Public records must be verified, located in Taguig City or Pateros, and retain
a trusted original source URL, source name, verification method, and
verification timestamp. Coordinates are optional in storage but are required
for map and route exposure analysis; they must be supported by the source or a
validated geographic lookup, never invented.

Automated ingestion applies source provenance, date, location, category,
coordinates, and duplicate/conflict checks before persisting a verified
incident. Failed verification does not create a public record; retryable
failures, including rate limits, are retried by later scans. Scan outcomes are
read-only reports and do not require administrator approval.

## Dates and feeds

`incident_date` is the date the event occurred. `source_published_at` is the
publisher's article date and is kept as separate metadata. The active
production dataset is restricted to verified 2026 incidents; fictional
development rows and 2025 records are retained only in dated database backup
tables, not in active feeds.

- `GET /api/incidents?view=recent`: verified incidents whose publication date
  (falling back to occurrence date when publication is unavailable) is within
  the latest 30 days, ordered by publication date descending.
- `GET /api/incidents?view=historical`: older verified incidents.
- `GET /api/incidents?view=all`: all verified incidents for map and route
  context.

The homepage uses `recent`; the incidents screen exposes the historical
archive. Empty feeds remain empty rather than being filled with fabricated
records. The map uses `all` so route analysis does not lose older verified
context.

## Sources and duplicates

Approved publishers include government and police sources, Philippine News
Agency, GMA News, ABS-CBN News, Manila Bulletin, and other explicitly trusted
original publishers configured by the backend. A follow-up arrest or
corroborating article is not a second incident when it describes the same
event. Source URLs are retained for auditability.

## Backup and cleanup

Before the 2026-only cleanup, three 2025 records were copied to
`incident_cleanup_backup_20261105` with their related locations and source
references in the corresponding dated backup tables. Three fictional
development-only rows were separately copied to
`incident_nonproduction_backup_20261105`. These backup tables are outside the
active incident queries and preserve the original rows for recovery.

The October 6 police-related report remains a legacy unverified incident with
two source references. Its historical verification status is retained, and it
is not included in public, map, route, or risk calculations. The removed
administrator approval workflow does not change or publish this record.
