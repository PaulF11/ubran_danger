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
publisher's article date and is kept as separate metadata.

- `GET /api/incidents?view=recent`: verified incidents from the latest 90
  days, ordered by incident date descending.
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

## Current research status

The March, June, and August 2026 Taguig reports researched during this release
remain unverified leads. No candidate was promoted or inserted into
production without administrator approval.
