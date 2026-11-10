# Incident data

## Eligibility and review

Public records must be verified, located in Taguig City or Pateros, and retain
a trusted original source URL, source name, verification method, and
verification timestamp. Coordinates are optional in storage but are required
for map and route exposure analysis; they must be supported by the source or a
validated geographic lookup, never invented.

Ingestion creates non-public candidates. Validation checks source provenance,
date, location, category, coordinates, and duplicate/conflict rules. An
authorized administrator must approve a candidate before it can become a
publicly verified record. Rejected and pending candidates remain review data;
historical incidents are not deleted.

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

The October 6 police-related report remains one pending-review incident with
two source references. It is not included in public, map, route, or risk
calculations until approved.
